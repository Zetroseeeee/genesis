// The worlds on disk (desktop/saves.js) under plain Node, in a folder of its own: worlds written, listed, read back, kept aside when
// another takes their place, the window's last write, worlds packed before, broken files and cut-off writes, the Trash, pictures.
// Seconds. Run it after touching desktop/saves.js (and then tools/saves/app.js, which tries the same in the real app).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { Saves, savePicture, safeName, AUTO, EXT } = require('../desktop/saves.js');

let fails = 0, n = 0;
const check = (ok, what) => { n++; if (!ok) { fails++; console.log('FAIL ' + what); } else if (process.env.VERBOSE) console.log('ok   ' + what); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'saves-'));
const world = (seed, year, extra) => JSON.stringify({ v: 2, seed, year, filler: 'x'.repeat(extra || 1000) });
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]);

(async () => {
  const dir = path.join(TMP, 'Saves'), trashed = [];
  const S = new Saves({ dir, log: () => {}, trash: async (f) => { const to = path.join(TMP, 'Trash', path.basename(f)); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.renameSync(f, to); trashed.push(to); } });
  const has = (id) => fs.existsSync(path.join(dir, id + EXT));
  // 1. the world in play
  check((await S.list()).length === 0, 'an empty folder lists nothing');
  let r = await S.write({ auto: true, json: world(1, -10000), head: { name: 'Ur, 10000 BC', realm: 'Ur', year: -10000, when: '10000 BC', age: 0, seed: 1 }, pic: jpeg });
  check(r.id === AUTO && !r.kept && has(AUTO), 'the world in play is written as Autosave');
  let l = await S.list();
  check(l.length === 1 && l[0].auto && l[0].realm === 'Ur' && l[0].pic && l[0].pic.length === jpeg.length, 'it is listed with its head and its picture');
  let back = await S.read(AUTO); check(back.json === world(1, -10000) && back.head.year === -10000, 'it reads back as it was written');
  r = await S.write({ auto: true, json: world(1, -9000), head: { name: 'Ur, 9000 BC', realm: 'Ur', year: -9000, seed: 1 } });
  l = await S.list(); check(l.length === 1 && l[0].year === -9000 && l[0].pic && l[0].pic.length === jpeg.length, 'a later day is written over it, and its picture stays');
  // 2. copies kept, and their names
  r = await S.write({ name: 'My world', json: world(1, -9000), head: { name: 'Ur, 9000 BC', realm: 'Ur', year: -9000, seed: 1 }, pic: jpeg });
  check(r.id === 'My world' && has('My world'), 'a copy is kept under its name');
  r = await S.write({ name: 'My world', json: world(1, -9000), head: {} }); check(r.id === 'My world (2)', 'a second of that name is numbered: ' + r.id);
  r = await S.write({ name: 'autosave', json: world(1, -9000), head: {} }); check(r.id === 'autosave (kept)', 'nothing kept is called Autosave: ' + r.id);
  r = await S.write({ name: '../../etc/x:y*?"<>|', json: world(1, -9000), head: {} }); check(!/[/\\:]/.test(r.id) && has(r.id), 'a name with separators stays in the folder: ' + r.id);
  check(safeName('  a/b\\c:d  ') === 'a b c d' && safeName('...') === 'A world' && safeName('x'.repeat(200)).length <= 80, 'names are made safe');
  // 3. another world takes the place of the one in play: it is kept aside under its own name
  let kept = await S.retire({ seed: 2, year: -10000 });
  check(kept === 'Ur, 9000 BC' && !has(AUTO) && has(kept), 'founding another world keeps the one in play aside as "' + kept + '"');
  check((await S.retire({ seed: 2, year: -10000 })) === null, 'with no world in play there is nothing to keep aside');
  r = await S.write({ auto: true, json: world(2, -10000), head: { name: 'Kish, 10000 BC', seed: 2, year: -10000 } }); check(!r.kept && has(AUTO), 'the new world is the world in play');
  check((await S.retire({ seed: 2, year: -10000 })) === null && has(AUTO), 'the very world on the very day is not kept twice');
  // 4. the net under it: another world, or an earlier day, written over the world in play keeps it aside
  r = await S.write({ auto: true, json: world(3, -10000), head: { name: 'Lagash, 10000 BC', seed: 3, year: -10000 } }); check(r.kept === 'Kish, 10000 BC', 'another world written over the world in play keeps it aside: ' + r.kept);
  await S.write({ auto: true, json: world(3, -8000), head: { name: 'Lagash, 8000 BC', seed: 3, year: -8000 } });
  r = await S.write({ auto: true, json: world(3, -8500), head: { name: 'Lagash, 8500 BC', seed: 3, year: -8500 } }); check(r.kept === 'Lagash, 8000 BC', 'an earlier day written over a later keeps the later aside: ' + r.kept);
  // 5. the window's last moment: written at once, and what was on its way is let go
  const p1 = S.write({ auto: true, json: world(3, -8400), head: { seed: 3, year: -8400 } });
  const now = S.writeNow({ json: world(3, -8300), head: { name: 'Lagash, 8300 BC', seed: 3, year: -8300 } });
  const r1 = await p1; back = await S.read(AUTO);
  check(now.id === AUTO && r1.stale && back.head.year === -8300 && back.json === world(3, -8300), 'the last write stands, and the one on its way is let go');
  // 6. a long world, packed
  const big = world(3, -8000, 6e6); r = await S.write({ auto: true, json: big, head: { name: 'Lagash, 8000 BC', seed: 3, year: -8000 } }); back = await S.read(AUTO);
  check(back.json === big && r.size < big.length / 20, `a long world is packed (${r.size} bytes for ${big.length} characters)`);
  // 7. worlds packed before (a page's storage kept them), and a head said again
  const old = world(9, 500);
  await S.write({ name: 'Old', gz: zlib.gzipSync(Buffer.from(old)), head: { name: 'Old', year: 500, at: 1700000000000 } }); l = await S.list(); const o = l.find((w) => w.id === 'Old');
  check(o && o.at === 1700000000000 && o.bytes === old.length, 'a world packed before is taken as it is, the day it was kept with it');
  await S.relabel('Old', { realm: 'Rome', when: 'AD 500' }); back = await S.read('Old'); check(back.head.realm === 'Rome' && back.head.name === 'Old' && back.json === old, 'a head said again, the world as it was');
  let threw = false; try { await S.write({ name: 'Bad', gz: Buffer.from('not gzip'), head: {} }); } catch (e) { threw = true; } check(threw && !has('Bad'), 'a packed world that does not unpack is not kept');
  // 8. broken files, and what a write cut off leaves
  fs.writeFileSync(path.join(dir, 'Broken' + EXT), 'not a save'); fs.writeFileSync(path.join(dir, 'Cut' + EXT), fs.readFileSync(path.join(dir, 'Old' + EXT)).subarray(0, 40));
  const part = path.join(dir, '.Autosave.1.1.part'); fs.writeFileSync(part, 'x'); const t = new Date(Date.now() - 3600e3); fs.utimesSync(part, t, t);
  l = await S.list(); check(l.some((w) => w.id === 'Broken' && w.broken) && l.some((w) => w.id === 'Cut' && w.broken) && !fs.existsSync(part), 'a file that cannot be read is listed as such; what a write cut off long ago left is cleared');
  threw = false; try { await S.read('Broken'); } catch (e) { threw = /not a world/.test(e.message); } check(threw, 'reading a broken file fails, and says why');
  threw = false; try { S.fileOf('../x'); } catch (e) { threw = true; } check(threw, 'nothing outside the folder is a world');
  check(l[0].auto && l.slice(1).every((w, k, a) => k === 0 || a[k - 1].at >= w.at), 'the list: the world in play first, then the newest');
  // 9. deleted: to the Trash, or where there is none, deleted
  check((await S.remove('Broken')) === 'trash' && trashed.length === 1 && !has('Broken'), 'a world deleted goes to the Trash');
  check((await new Saves({ dir, log: () => {} }).remove('Cut')) === 'deleted' && !has('Cut'), 'with no Trash it is deleted');
  // 10. one at a time, in the order asked
  const ps = []; for (let k = 0; k < 6; k++) ps.push(S.write({ auto: true, json: world(4, 100 + k), head: { seed: 4, year: 100 + k } }));
  await Promise.all(ps); back = await S.read(AUTO); check(back.head.year === 105, 'saves land in the order they were asked for');
  // 11. pictures
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);
  const f1 = await savePicture(path.join(TMP, 'Pictures'), 'Holocene - Ur, 9000 BC', png), f2 = await savePicture(path.join(TMP, 'Pictures'), 'Holocene - Ur, 9000 BC', png);
  check(f1.endsWith('Holocene - Ur, 9000 BC.png') && f2.endsWith('Holocene - Ur, 9000 BC (2).png'), 'pictures are files, numbered when the name is taken');
  threw = false; try { await savePicture(path.join(TMP, 'Pictures'), 'x', Buffer.from('nope')); } catch (e) { threw = true; } check(threw, 'only a PNG is kept as a picture');
  console.log(fails ? `saves: ${fails} of ${n} checks failed (folder kept: ${TMP})` : `saves: all ${n} checks passed`);
  if (!fails) fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('saves test FAILED: ' + (e.stack || e.message)); process.exit(1); });
