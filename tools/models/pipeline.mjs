#!/usr/bin/env node
// GENESIS model pipeline: generated source GLBs -> normalised, game-ready LOD files.
//
//   node tools/models/pipeline.mjs ci                 GitHub Actions: mirror sources, process what changed, publish
//   node tools/models/pipeline.mjs local <id> [...]   dev box: tools/models/cache/<id>.src.glb -> data/models/
//   node tools/models/fetch.mjs                       download the published LOD files into data/models/
//
// Every model goes through the same steps so the library stays consistent: one mesh, entrance turned to +Z, base
// centred on the origin at y = 0, true metres (height from the manifest), then the same LOD ladder and texture
// sizes for all of them.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { cloneDocument, dedup, flatten, getBounds, join, meshopt, prune, simplify, textureCompress, transformMesh, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { bakeLowLod } from './lowlod.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const MANIFEST = path.join(ROOT, 'assets/models/models.json');
const OUT = path.join(ROOT, 'data/models');
const CACHE = path.join(HERE, 'cache');
const PIPELINE_REV = 2;          // bump to rebuild every model
// the LOD ladder: triangle budget, texture edge, which maps survive, simplifier error budget (fraction of mesh radius)
// The two near LODs keep the generated mesh and its maps; the far ones are rebuilt and baked (lowlod.mjs).
const LODS = [
  { tris: 160000, tex: 2048, maps: 'all', error: 0.0006 },
  { tris: 32000, tex: 1024, maps: 'all', error: 0.003 },
  { tris: 6000, tex: 512, bake: true },
  { tris: 1200, tex: 256, bake: true },
  { tris: 220, tex: 64, bake: true },
];

const log = (...a) => console.log(...a);
const sh = (cmd, args, opts) => execFileSync(cmd, args, Object.assign({ encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28 }, opts || {}));
const readManifest = () => JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const revOf = (m) => crypto.createHash('sha1').update(JSON.stringify([PIPELINE_REV, LODS, m.src, m.h, m.yaw || 0, m.scaleBy === 'w' ? m.w : 'h'])).digest('hex').slice(0, 12);
const srcName = (m) => `${m.id}.${(m.mesh || 'x').slice(0, 8)}.src.glb`;

let _io = null;
async function getIO() {
  if (_io) return _io;
  await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
  _io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  return _io;
}
function triCount(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) { const idx = p.getIndices(); n += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
  return Math.round(n);
}
function mul(a, b) { // column-major 4x4: a * b
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
  return o;
}
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// one mesh, baked transform, entrance to +Z, base centred at the origin, true metres
async function normalise(doc, m) {
  await doc.transform(dedup(), flatten(), join({ keepNamed: false }), weld());
  const root = doc.getRoot(); const scene = root.getDefaultScene() || root.listScenes()[0];
  const b = getBounds(scene);
  const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  // scaleBy: which declared dimension fixes the scale. Height by default; "w" = the longer side of the footprint
  const s = m.scaleBy === 'w' ? m.w / Math.max(size[0], size[2]) : m.h / size[1];
  const yaw = (m.yaw || 0) * Math.PI / 180; const c = Math.cos(yaw), sn = Math.sin(yaw);
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, y0 = b.min[1];
  const M = [s * c, 0, -s * sn, 0, 0, s, 0, 0, s * sn, 0, s * c, 0, -s * (c * cx + sn * cz), -s * y0, -s * (-sn * cx + c * cz), 1];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    transformMesh(mesh, mul(M, node.getWorldMatrix()));
    node.setMatrix(IDENT);
  }
  const nb = getBounds(scene);
  return { w: +(nb.max[0] - nb.min[0]).toFixed(3), h: +(nb.max[1] - nb.min[1]).toFixed(3), d: +(nb.max[2] - nb.min[2]).toFixed(3) };
}

async function buildLod(base, lod, outPath) {
  const io = await getIO();
  const doc = cloneDocument(base);
  const n0 = triCount(doc);
  if (n0 > lod.tris * 1.05) {
    let err = lod.error;
    for (let pass = 0; pass < 4; pass++) {
      const n = triCount(doc); if (n <= lod.tris * 1.5) break;
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: lod.tris / n, error: err }));
      err *= 3;                                 // seams and thin parts can stall the simplifier: loosen and go again
    }
  }
  if (lod.maps === 'color') for (const mat of doc.getRoot().listMaterials()) {
    mat.setNormalTexture(null); mat.setMetallicRoughnessTexture(null); mat.setOcclusionTexture(null); mat.setEmissiveTexture(null);
    mat.setMetallicFactor(0); mat.setRoughnessFactor(0.9);
  }
  await doc.transform(prune({ keepSolidTextures: true }), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [lod.tex, lod.tex], quality: 88, effort: 60 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(outPath, doc);
  return { tris: triCount(doc), bytes: fs.statSync(outPath).size, tex: lod.tex, maps: lod.maps };
}

async function processModel(m, srcPath, outDir) {
  const io = await getIO();
  const t0 = Date.now();
  const base = await io.read(srcPath);
  const srcTris = triCount(base);
  const prims = base.getRoot().listMeshes().reduce((n, mesh) => n + mesh.listPrimitives().length, 0);
  const dims = await normalise(base, m);
  const mats = base.getRoot().listMaterials().length;
  const lods = []; let mean = null;
  for (let k = 0; k < LODS.length; k++) {
    const file = `${m.id}.l${k}.glb`, out = path.join(outDir, file), lod = LODS[k]; let r;
    if (lod.bake) {
      const b = await bakeLowLod(base, lod.tris, lod.tex); if (!mean) mean = b.mean;
      await b.doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 90, effort: 60 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
      await io.write(out, b.doc);
      r = { tris: b.tris, bytes: fs.statSync(out).size, tex: lod.tex, maps: 'baked' };
    } else r = await buildLod(base, lod, out);
    lods.push(Object.assign({ file }, r));
    log(`   l${k}: ${r.tris} tris, ${(r.bytes / 1e6).toFixed(2)} MB`);
  }
  log(`   ${m.id}: ${dims.w} x ${dims.h} x ${dims.d} m, source ${srcTris} tris, ${prims} primitive(s), ${mats} material(s), ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return { rev: revOf(m), set: m.set, w: dims.w, h: dims.h, d: dims.d, srcTris, mean, lods };
}

// ---------- modes ----------
const repo = () => process.env.GITHUB_REPOSITORY || readManifest().repo;
const ghAssets = (tag) => { try { return JSON.parse(sh('gh', ['release', 'view', tag, '--json', 'assets'])).assets.map((a) => a.name); } catch (e) { return null; } };
function ensureRelease(tag, title, notes) {
  let assets = ghAssets(tag);
  if (assets === null) { sh('gh', ['release', 'create', tag, '--title', title, '--notes', notes, '--latest=false']); assets = []; }
  return new Set(assets);
}

async function ci() {
  const man = readManifest(); const work = fs.mkdtempSync('/tmp/models-'); let failed = 0;
  const bySet = {}; for (const m of man.models) if (m.src) (bySet[m.set] = bySet[m.set] || []).push(m);
  for (const set of Object.keys(bySet)) {
    const srcTag = `src-${set}`, outTag = `models-${set}`;
    const haveSrc = ensureRelease(srcTag, `Source models: ${set}`, 'Generated source meshes and concept images, as they came from the generator. Archive only; the game uses the processed files.');
    const have = ensureRelease(outTag, `Models: ${set}`, 'Game-ready model files (LOD ladder) built by tools/models/pipeline.mjs.');
    let index = { set, models: {} };
    if (have.has('index.json')) { sh('gh', ['release', 'download', outTag, '-p', 'index.json', '-D', work, '--clobber']); index = JSON.parse(fs.readFileSync(path.join(work, 'index.json'), 'utf8')); }
    const publishIndex = () => { fs.writeFileSync(path.join(work, 'index.json'), JSON.stringify(index)); sh('gh', ['release', 'upload', outTag, path.join(work, 'index.json'), '--clobber']); };
    for (const m of bySet[set]) {
      const cur = index.models[m.id];
      if (cur && cur.rev === revOf(m) && cur.lods.every((l) => have.has(l.file))) { log(`= ${m.id} up to date`); continue; }
      log(`+ ${m.id}`);
      try {
        const sn = srcName(m), src = path.join(work, sn);
        if (haveSrc.has(sn)) sh('gh', ['release', 'download', srcTag, '-p', sn, '-D', work, '--clobber']);
        else { sh('curl', ['-fsSL', '--retry', '3', '-o', src, m.src]); sh('gh', ['release', 'upload', srcTag, src, '--clobber']); }
        if (m.conceptUrl && !haveSrc.has(`${m.id}.concept.png`)) { const cp = path.join(work, `${m.id}.concept.png`); try { sh('curl', ['-fsSL', '--retry', '3', '-o', cp, m.conceptUrl]); sh('gh', ['release', 'upload', srcTag, cp, '--clobber']); fs.rmSync(cp, { force: true }); } catch (e) { log('   concept image not mirrored: ' + e.message); } }
        const entry = await processModel(m, src, work);
        sh('gh', ['release', 'upload', outTag, ...entry.lods.map((l) => path.join(work, l.file)), '--clobber']);
        index.models[m.id] = entry; publishIndex();
        for (const l of entry.lods) fs.rmSync(path.join(work, l.file), { force: true });
        fs.rmSync(src, { force: true });
      } catch (e) { failed++; log(`!! ${m.id} failed: ${e && e.stack || e}`); }
    }
    const ids = new Set(bySet[set].map((m) => m.id)); let dropped = false;
    for (const id of Object.keys(index.models)) if (!ids.has(id)) { delete index.models[id]; dropped = true; }
    if (dropped) publishIndex();
  }
  if (failed) { log(`${failed} model(s) failed`); process.exit(1); }
}

async function local(ids) {
  const man = readManifest(); fs.mkdirSync(OUT, { recursive: true });
  const indexPath = path.join(OUT, 'index.json'); const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : { models: {} };
  for (const id of ids) {
    const m = man.models.find((x) => x.id === id); if (!m) { log('unknown model ' + id); continue; }
    const src = [path.join(CACHE, srcName(m)), path.join(CACHE, `${id}.src.glb`)].find((p) => fs.existsSync(p));
    if (!src) { log(`no source for ${id} in ${CACHE}`); continue; }
    log(`+ ${id}`); index.models[id] = Object.assign(await processModel(m, src, OUT), { kinds: m.kinds || [], cultures: m.cultures || null, eras: m.eras || [0, 8], fit: m.fit || '', site: m.site || '', sides: m.sides || '', open: !!m.open, title: m.title });
  }
  fs.writeFileSync(indexPath, JSON.stringify(index));
}

const mode = process.argv[2];
if (mode === 'ci') await ci();
else if (mode === 'local') await local(process.argv.slice(3));
else { console.log('usage: pipeline.mjs ci | local <id...>   (fetch published files with tools/models/fetch.mjs)'); process.exit(2); }
