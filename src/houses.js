// HOLOCENE houses: a house type of vern.js (a genome) as a mesh, at three levels of detail, and the shader that dresses it.
// Classic script; exposes window.HOUSES. Every triangle carries what it is (a part: wall, roof, trim, glass, door, shutter,
// timber ...) and where it lies on its own face in metres, so the materials sit at their true size and every part takes its
// own colour (the house's paint, its trim, its shutters, its door, the tint of its roof) from the instance.
//
// Local frame: metres, x along the front, y up, z toward the street (the front wall at z = +d/2), the origin on the ground at
// the middle of the main wing. A wall with windows is a wall with holes in it: each opening has its reveals, its pane set
// back, its frame, sill and shutters (near); the frame and pane laid on the wall (middle distance); the pane alone (far).
(function () {
  'use strict';
  const PART = { wall: 0, wall2: 1, roof: 2, trim: 3, glass: 4, door: 5, shut: 6, timber: 7, stone: 8, dark: 9, chim: 10, redge: 11, cloth: 12, soffit: 13, plinth: 14, green: 15 };
  const D2R = Math.PI / 180;
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ---------- the builder ----------
  class G {
    constructor(lod) { this.lod = lod; this.P = []; this.N = []; this.A = []; this.U = []; this.O = []; this.base = 0; this.top = 3; this.eave = 0; }
    // how dark a wall is near the ground and under deep eaves (baked: the shader multiplies)
    aoAt(y) { return 1 - 0.2 * (1 - sm(0, 0.9, y - this.base)) - 0.18 * this.eave * sm(this.top - 0.9, this.top, y); }
    tri(a, b, c, part, ua, ub, uc, n, ao) {
      let nx, ny, nz;
      if (n) { [nx, ny, nz] = n; } else { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
      for (const [p, u, k] of [[a, ua, 0], [b, ub, 1], [c, uc, 2]]) { this.P.push(p[0], p[1], p[2]); this.N.push(nx, ny, nz); this.A.push(part); this.U.push(u[0], u[1]); this.O.push(ao === undefined ? this.aoAt(p[1]) : (Array.isArray(ao) ? ao[k] : ao)); }
    }
    // a quad a-b-c-d counter-clockwise from the side it faces; uvs: four [u, v] (metres)
    quad(a, b, c, d, part, uvs, ao) { const q = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]]; const ao4 = Array.isArray(ao) ? ao : ao === undefined ? undefined : [ao, ao, ao, ao];
      this.tri(a, b, c, part, q[0], q[1], q[2], null, ao4 ? [ao4[0], ao4[1], ao4[2]] : undefined); this.tri(a, c, d, part, q[0], q[2], q[3], null, ao4 ? [ao4[0], ao4[2], ao4[3]] : undefined); }
    // a quad on a slope: its uvs along the first edge (u) and up it (v)
    slope(a, b, c, d, part, ao) { const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], el = Math.hypot(ex, ey, ez) || 1; const e = [ex / el, ey / el, ez / el];
      const n = [0, 0, 0]; { const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]; n[0] = ey * vz - ez * vy; n[1] = ez * vx - ex * vz; n[2] = ex * vy - ey * vx; }
      const s = [n[1] * e[2] - n[2] * e[1], n[2] * e[0] - n[0] * e[2], n[0] * e[1] - n[1] * e[0]]; const sl = Math.hypot(s[0], s[1], s[2]) || 1; s[0] /= sl; s[1] /= sl; s[2] /= sl;
      const uv = (p) => { const x = p[0] - a[0], y = p[1] - a[1], z = p[2] - a[2]; return [x * e[0] + y * e[1] + z * e[2], -(x * s[0] + y * s[1] + z * s[2])]; };
      this.quad(a, b, c, d, part, [uv(a), uv(b), uv(c), uv(d)], ao === undefined ? 1 : ao); }
    sTri(a, b, c, part, ao) { const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], el = Math.hypot(ex, ey, ez) || 1; const e = [ex / el, ey / el, ez / el];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; const n = [ey * vz - ez * vy, ez * vx - ex * vz, ex * vy - ey * vx]; const s = [n[1] * e[2] - n[2] * e[1], n[2] * e[0] - n[0] * e[2], n[0] * e[1] - n[1] * e[0]]; const sl = Math.hypot(s[0], s[1], s[2]) || 1;
      const uv = (p) => { const x = p[0] - a[0], y = p[1] - a[1], z = p[2] - a[2]; return [x * e[0] + y * e[1] + z * e[2], -(x * s[0] + y * s[1] + z * s[2]) / sl]; };
      this.tri(a, b, c, part, uv(a), uv(b), uv(c), null, ao === undefined ? 1 : ao); }
    // an axis-aligned box (all six faces unless skipped: 'b' bottom, 't' top, 'x0' 'x1' 'z0' 'z1')
    box(x0, x1, y0, y1, z0, z1, part, skip, ao) {
      const sk = skip || ''; const A = ao === undefined ? undefined : ao;
      if (!sk.includes('z1')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], part, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], A);
      if (!sk.includes('z0')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], part, [[-x1, y0], [-x0, y0], [-x0, y1], [-x1, y1]], A);
      if (!sk.includes('x1')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], part, [[-z1, y0], [-z0, y0], [-z0, y1], [-z1, y1]], A);
      if (!sk.includes('x0')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], part, [[z0, y0], [z1, y0], [z1, y1], [z0, y1]], A);
      if (!sk.includes('t')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], part, [[x0, z1], [x1, z1], [x1, z0], [x0, z0]], A === undefined ? 1 : A);
      if (!sk.includes('b')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], part, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], A === undefined ? 0.6 : A);
    }
    // a box turned about y (yaw, radians) round its own middle
    boxR(cx, cz, w, d, y0, y1, yaw, part, ao) {
      const c = Math.cos(yaw), s = Math.sin(yaw); const p = (x, y, z) => [cx + x * c + z * s, y, cz - x * s + z * c]; const hw = w / 2, hd = d / 2;
      const P0 = [p(-hw, y0, hd), p(hw, y0, hd), p(hw, y0, -hd), p(-hw, y0, -hd)], P1 = [p(-hw, y1, hd), p(hw, y1, hd), p(hw, y1, -hd), p(-hw, y1, -hd)];
      const uv = (a, b, la) => [[0, a], [la, a], [la, b], [0, b]];
      this.quad(P0[0], P0[1], P1[1], P1[0], part, uv(y0, y1, w), ao); this.quad(P0[1], P0[2], P1[2], P1[1], part, uv(y0, y1, d), ao);
      this.quad(P0[2], P0[3], P1[3], P1[2], part, uv(y0, y1, w), ao); this.quad(P0[3], P0[0], P1[0], P1[3], part, uv(y0, y1, d), ao);
      this.quad(P1[0], P1[1], P1[2], P1[3], part, [[0, 0], [w, 0], [w, d], [0, d]], 1);
    }
    // a face of a wing: origin o (its left end seen from outside, on the ground), u along it, n out of it, L long
    fp(F, s, y, t) { return [F.o[0] + F.u[0] * s + F.n[0] * t, y, F.o[2] + F.u[2] * s + F.n[2] * t]; }
    fRect(F, s0, s1, y0, y1, t, part, ao, uvs) { this.quad(this.fp(F, s0, y0, t), this.fp(F, s1, y0, t), this.fp(F, s1, y1, t), this.fp(F, s0, y1, t), part, uvs || [[s0 + F.s0, y0], [s1 + F.s0, y0], [s1 + F.s0, y1], [s0 + F.s0, y1]], ao); }
    fBox(F, s0, s1, y0, y1, t0, t1, part, ao) {
      const p = (s, y, t) => this.fp(F, s, y, t); const U = (s, y) => [s + F.s0, y];
      this.quad(p(s0, y0, t1), p(s1, y0, t1), p(s1, y1, t1), p(s0, y1, t1), part, [U(s0, y0), U(s1, y0), U(s1, y1), U(s0, y1)], ao);
      this.quad(p(s0, y1, t1), p(s1, y1, t1), p(s1, y1, t0), p(s0, y1, t0), part, [U(s0, t1), U(s1, t1), U(s1, t0), U(s0, t0)], ao === undefined ? 1 : ao);
      this.quad(p(s0, y0, t0), p(s1, y0, t0), p(s1, y0, t1), p(s0, y0, t1), part, [U(s0, t0), U(s1, t0), U(s1, t1), U(s0, t1)], 0.6);
      this.quad(p(s0, y0, t0), p(s0, y0, t1), p(s0, y1, t1), p(s0, y1, t0), part, [[t0, y0], [t1, y0], [t1, y1], [t0, y1]], ao);
      this.quad(p(s1, y0, t1), p(s1, y0, t0), p(s1, y1, t0), p(s1, y1, t1), part, [[t1, y0], [t0, y0], [t0, y1], [t1, y1]], ao);
    }
    geometry() {
      const g = new THREE.BufferGeometry(); const n = this.P.length / 3;
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.P), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.N), 3));
      g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(this.A), 1));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.U), 2));
      g.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(this.O), 1));
      g.computeBoundingBox(); g.computeBoundingSphere(); g.userData.tris = n / 3; return g;
    }
  }

  // ---------- materials as the shader reads them ----------
  // a part with its texture layer and flags packed in one number: part + 16 * layer + 256 * aux; for walls aux is the paint's
  // share (bits 0-3), turned (4), from the roof's array (5), logs (6); for roofs green (bit 0); for panes the window's dice
  // (bits 0-5) and what crosses it (bits 6-7: 1 mullions, 2 a grille, 3 a lattice)
  const packWall = (part, name) => { const M = (window.VERN && VERN.WALLM[name]) || { L: 1, p: 1 }; const lay = M.R !== undefined ? M.R : M.L; const aux = Math.round((M.p === undefined ? 1 : M.p) * 15) | (M.rot ? 16 : 0) | (M.R !== undefined ? 32 : 0) | (M.logs ? 64 : 0); return part + 16 * lay + 256 * aux; };
  const packRoof = (part, name) => { const M = (window.VERN && VERN.ROOFM[name]) || { L: 1 }; return part + 16 * M.L + 256 * (M.green ? 1 : 0); };

  // ---------- one house ----------
  function build(g, lod) {
    const B = new G(lod); const hid = VERN.strHash(g.id) ^ 0x5bd1e995; const rk = (k) => VERN.h32(hid, k);      // (the house's own dice, by question: every level of detail asks the same ones)
    const near = lod === 0, mid = lod <= 1;
    const W = g.w, D = g.d; const stilt = g.stilt || 0; const base = (stilt > 0 ? stilt + 0.25 : g.pb); const fl = Math.max(1, g.fl | 0), fh = g.fh;
    const wallTop = base + fl * fh; const pitch = Math.max(5, Math.min(70, g.pitch)) * D2R, tp = Math.tan(pitch);
    const pW = packWall(PART.wall, g.wall), pW2 = packWall(PART.wall2, g.wall2 || g.wall), pR = packRoof(PART.roof, g.roofm), pRE = packRoof(PART.redge, g.roofm);
    const pCh = packWall(PART.chim, g.chimm === 'stone' ? 'rubble' : g.chimm === 'plaster' ? 'plaster' : g.wall === 'rubble' || g.wall === 'ashlar' || g.wall === 'granite' ? g.wall : 'brick');
    const flat = g.roof === 'flat' || g.roof === 'dome' || g.roof === 'vault';
    const urbanAttached = g.ctx === 'urban' && g.plan !== 'round' && g.plan !== 'court';
    B.base = base; B.top = wallTop; B.eave = flat ? 0 : Math.min(1, g.over / 0.6);
    const frameW = g.wfr || 0.09;
    // stilts and the floor they carry; a plinth under a wall that stands on the ground
    if (stilt > 0) {
      const nx = Math.max(2, Math.round(W / 2.4) + 1), nz = Math.max(2, Math.round(D / 2.4) + 1);
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) { const x = -W / 2 + 0.15 + (W - 0.3) * a / (nx - 1), z = -D / 2 + 0.15 + (D - 0.3) * b / (nz - 1); if (mid || (a === 0 || a === nx - 1) && (b === 0 || b === nz - 1)) B.box(x - 0.11, x + 0.11, -2.0, stilt, z - 0.11, z + 0.11, PART.timber, 'bt'); }
      B.box(-W / 2 - 0.15, W / 2 + 0.15, stilt, stilt + 0.25, -D / 2 - 0.15, D / 2 + 0.15, PART.timber, '');
    } else if (g.plan !== 'round') B.box(-W / 2 - 0.06, W / 2 + 0.06, -2.5, Math.max(base, 0.05), -D / 2 - 0.06, D / 2 + 0.06, PART.plinth, 't');      // (the footing reaches down into the ground: on a slope a house stands on its plinth)
    // ----- the wings -----
    // each wing: x0..x1, z0..z1, its roof's ridge along x or z, and which of its faces show (a face against another wing is left out)
    const wings = [];
    const t = Math.max(3.4, Math.min(6.5, Math.min(W, D) * 0.3));
    if (g.plan === 'round') wings.push({ round: true, r: W / 2 });
    else if (g.plan === 'court') {
      wings.push({ x0: -W / 2, x1: W / 2, z0: D / 2 - t, z1: D / 2, ridge: 'x', main: 1, inner: 'z0' });
      wings.push({ x0: -W / 2, x1: W / 2, z0: -D / 2, z1: -D / 2 + t, ridge: 'x', inner: 'z1' });
      wings.push({ x0: -W / 2, x1: -W / 2 + t, z0: -D / 2 + t, z1: D / 2 - t, ridge: 'z', hide: 'z0z1', inner: 'x1' });
      wings.push({ x0: W / 2 - t, x1: W / 2, z0: -D / 2 + t, z1: D / 2 - t, ridge: 'z', hide: 'z0z1', inner: 'x0' });
    } else {
      wings.push({ x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2, ridge: g.ridge, main: 1 });
      const w2 = Math.max(3.2, Math.min(W * 0.48, 7)), d2 = Math.max(3, Math.min(D * 0.9, 9)); const side = g.wingSide || 1;
      if (g.plan === 'L') wings.push(side < 0 ? { x0: -W / 2, x1: -W / 2 + w2, z0: -D / 2 - d2, z1: -D / 2, ridge: 'z', hide: 'z1', low: 0.9 } : { x0: W / 2 - w2, x1: W / 2, z0: -D / 2 - d2, z1: -D / 2, ridge: 'z', hide: 'z1', low: 0.9 });
      if (g.plan === 'T') wings.push({ x0: -w2 / 2, x1: w2 / 2, z0: -D / 2 - d2, z1: -D / 2, ridge: 'z', hide: 'z1', low: 0.9 });
      if (g.plan === 'U') { wings.push({ x0: -W / 2, x1: -W / 2 + w2 * 0.8, z0: -D / 2 - d2, z1: -D / 2, ridge: 'z', hide: 'z1', low: 0.85 }); wings.push({ x0: W / 2 - w2 * 0.8, x1: W / 2, z0: -D / 2 - d2, z1: -D / 2, ridge: 'z', hide: 'z1', low: 0.85 }); }
    }
    // ----- openings: what a face of a wing has in it, storey by storey -----
    const winW = Math.max(0.3, g.ww), winH = Math.max(0.3, g.wh), bayW = Math.max(winW + 0.5, g.bay);
    const glassAux = (k, pat) => PART.glass + 256 * ((k % 64) | ((pat || 0) << 6));
    const pat = g.lattice ? 3 : g.grille ? 2 : g.mull ? 1 : 0;
    let winK = 0;
    // a face's openings: [{ s0, s1, y0, y1, kind: 'w' | 'd' | 'shop', arch }]
    const openings = (F, front, wallH0, wallH1, nfl, isFront) => {
      const out = []; const L = F.L; if (L < 1.6 || winW < 0.05) return out;
      const n = Math.max(1, Math.floor((L - 0.6) / bayW)); const bw = L / n;
      let doorBay = -1; if (isFront) doorBay = g.dpos === 'l' ? 0 : g.dpos === 'r' ? n - 1 : Math.floor((n - 1) / 2) + (n % 2 === 0 && g.doorOff ? 1 : 0);
      for (let k = 0; k < nfl; k++) {
        const y0 = wallH0 + k * fh; if (y0 + 0.6 > wallH1) break;
        for (let b = 0; b < n; b++) {
          const cx = (b + 0.5) * bw;
          if (k === 0 && isFront && g.shop && n >= 2 && b !== doorBay) { const sw = Math.min(bw - 0.4, Math.max(1.6, bw * 0.8)); out.push({ s0: cx - sw / 2, s1: cx + sw / 2, y0: y0 + 0.45, y1: Math.min(y0 + fh - 0.4, y0 + 2.6), kind: 'shop' }); continue; }
          if (k === 0 && b === doorBay) { const dw = Math.min(bw - 0.3, g.dw * (g.plan === 'court' ? 1.6 : 1)), dh = Math.min(fh - 0.2, g.dh * (g.plan === 'court' ? 1.2 : 1)); out.push({ s0: cx - dw / 2, s1: cx + dw / 2, y0, y1: y0 + dh, kind: 'd', arch: g.darch }); continue; }
          if (!front && (b % 2 === 1) && L < 6) continue;
          const wh = Math.min(winH, fh - g.sill * 0.6 - 0.35), ww = Math.min(winW, bw - 0.35); if (wh < 0.25) continue;
          const sill = Math.min(g.sill, fh - wh - 0.25); out.push({ s0: cx - ww / 2, s1: cx + ww / 2, y0: y0 + sill, y1: y0 + sill + wh, kind: 'w', arch: g.arch && wh > 0.7 });
        }
      }
      return out;
    };
    // a wall with its openings cut out, their reveals, panes, doors, frames, sills and shutters
    const solidWall = (F, s0, s1, y0, y1, holes, part) => {
      const ys = [y0, y1]; for (const h of holes) { if (h.y0 > y0 && h.y0 < y1) ys.push(h.y0); if (h.y1 > y0 && h.y1 < y1) ys.push(h.y1); }
      ys.sort((a, b) => a - b);
      for (let q = 0; q + 1 < ys.length; q++) { const ya = ys[q], yb = ys[q + 1]; if (yb - ya < 1e-4) continue;
        const cut = holes.filter((h) => h.y0 <= ya + 1e-4 && h.y1 >= yb - 1e-4).sort((a, b) => a.s0 - b.s0); let s = s0;
        for (const h of cut) { if (h.s0 > s + 1e-4) B.fRect(F, s, h.s0, ya, yb, 0, part); s = Math.max(s, h.s1); }
        if (s1 > s + 1e-4) B.fRect(F, s, s1, ya, yb, 0, part); }
    };
    const dressOpening = (F, h, part) => {
      const rv = h.kind === 'd' ? 0.18 : 0.12;
      if (near) {
        // reveals, then what fills the opening, set back
        B.quad(B.fp(F, h.s0, h.y0, 0), B.fp(F, h.s0, h.y0, -rv), B.fp(F, h.s0, h.y1, -rv), B.fp(F, h.s0, h.y1, 0), part, [[0, h.y0], [rv, h.y0], [rv, h.y1], [0, h.y1]], 0.72);
        B.quad(B.fp(F, h.s1, h.y0, -rv), B.fp(F, h.s1, h.y0, 0), B.fp(F, h.s1, h.y1, 0), B.fp(F, h.s1, h.y1, -rv), part, [[rv, h.y0], [0, h.y0], [0, h.y1], [rv, h.y1]], 0.72);
        B.quad(B.fp(F, h.s0, h.y1, -rv), B.fp(F, h.s1, h.y1, -rv), B.fp(F, h.s1, h.y1, 0), B.fp(F, h.s0, h.y1, 0), part, [[h.s0, 0], [h.s1, 0], [h.s1, rv], [h.s0, rv]], 0.6);
        B.quad(B.fp(F, h.s0, h.y0, 0), B.fp(F, h.s1, h.y0, 0), B.fp(F, h.s1, h.y0, -rv), B.fp(F, h.s0, h.y0, -rv), h.kind === 'd' ? PART.stone : part, [[h.s0, 0], [h.s1, 0], [h.s1, rv], [h.s0, rv]], 0.85);
      }
      const t = near ? -rv : 0.02, w = h.s1 - h.s0, hh = h.y1 - h.y0;
      if (h.kind === 'd') { B.fRect(F, h.s0, h.s1, h.y0, h.y1, t, PART.door, 0.9, [[0, 0], [w, 0], [w, hh], [0, hh]]); }
      else { const k = winK++; B.fRect(F, h.s0, h.s1, h.y0, h.y1, t, h.kind === 'shop' ? glassAux(k, 1) : glassAux(k, pat), 1, [[0, 0], [1, 0], [1, 1], [0, 1]]); }
      if (!mid) return;
      const fw = frameW, ft = near ? 0.05 : 0.025;
      if (near) {
        B.fBox(F, h.s0 - fw, h.s0, h.y0 - (h.kind === 'd' ? 0 : fw), h.y1 + fw, 0, ft, PART.trim); B.fBox(F, h.s1, h.s1 + fw, h.y0 - (h.kind === 'd' ? 0 : fw), h.y1 + fw, 0, ft, PART.trim);
        B.fBox(F, h.s0, h.s1, h.y1, h.y1 + fw, 0, ft, PART.trim);
        if (h.kind === 'w') B.fBox(F, h.s0 - fw - 0.04, h.s1 + fw + 0.04, h.y0 - fw - 0.06, h.y0 - fw * 0.3, 0, 0.11, PART.stone);
        if (h.kind === 'd') B.fBox(F, h.s0 - 0.25, h.s1 + 0.25, h.y0 - 0.18, h.y0, 0, 0.45, PART.stone);
      } else {
        B.fRect(F, h.s0 - fw, h.s0, h.y0 - fw, h.y1 + fw, ft, PART.trim); B.fRect(F, h.s1, h.s1 + fw, h.y0 - fw, h.y1 + fw, ft, PART.trim); B.fRect(F, h.s0, h.s1, h.y1, h.y1 + fw, ft, PART.trim);
        if (h.kind === 'w') B.fRect(F, h.s0 - fw, h.s1 + fw, h.y0 - fw, h.y0, ft, PART.stone);
      }
      if (h.arch && h.kind !== 'shop') {      // a fanlight or an arch over it
        const rr = w / 2 + fw, cx = (h.s0 + h.s1) / 2, cy = h.y1 + fw, n = near ? 7 : 4;
        for (let q = 0; q < n; q++) { const a0 = Math.PI * q / n, a1 = Math.PI * (q + 1) / n;
          const p = (a, rad) => B.fp(F, cx - Math.cos(a) * rad, cy + Math.sin(a) * rad, 0.02);
          B.quad(p(a0, rr - fw), p(a0, rr), p(a1, rr), p(a1, rr - fw), PART.trim, null, 1);
          B.tri(p(a0, 0), p(a0, rr - fw), p(a1, rr - fw), h.kind === 'd' ? PART.glass + 256 * (63) : glassAux(winK, 1), [0.5, 0], [0, 0], [1, 1], null, 1); }
      }
      if (g.shut && h.kind === 'w' && w < 1.6) {      // shutters folded back against the wall
        const sw = w / 2 + 0.02; const tt = near ? 0.035 : 0.03;
        if (near) { B.fBox(F, h.s0 - fw - sw, h.s0 - fw, h.y0, h.y1, 0.01, tt, PART.shut); B.fBox(F, h.s1 + fw, h.s1 + fw + sw, h.y0, h.y1, 0.01, tt, PART.shut); }
        else { B.fRect(F, h.s0 - fw - sw, h.s0 - fw, h.y0, h.y1, tt, PART.shut); B.fRect(F, h.s1 + fw, h.s1 + fw + sw, h.y0, h.y1, tt, PART.shut); }
      }
      if (h.kind === 'shop' && near) { const aw = Math.min(1.4, fh * 0.45); const s0 = h.s0 - 0.2, s1 = h.s1 + 0.2, y = h.y1 + 0.35;      // an awning over the shop
        B.quad(B.fp(F, s0, y - aw * 0.45, aw), B.fp(F, s1, y - aw * 0.45, aw), B.fp(F, s1, y, 0.02), B.fp(F, s0, y, 0.02), PART.cloth, [[s0, 0], [s1, 0], [s1, aw], [s0, aw]], 1);
        B.quad(B.fp(F, s1, y - aw * 0.45, aw), B.fp(F, s0, y - aw * 0.45, aw), B.fp(F, s0, y, 0.02), B.fp(F, s1, y, 0.02), PART.cloth, [[s1, 0], [s0, 0], [s0, aw], [s1, aw]], 0.7); }
    };
    // the beams of a timber frame laid over the daub (posts at the corners and beside the openings, rails at the floors, braces)
    const frameBeams = (F, y0, y1, holes, nfl) => {
      if (!g.frame || lod > 1) return; const bw = 0.17, tt = 0.025; const L = F.L; const posts = new Set([0, L]);
      for (const h of holes) { posts.add(Math.max(0, h.s0 - frameW)); posts.add(Math.min(L, h.s1 + frameW)); }
      if (g.frame === 2) for (let s = 0.5; s < L - 0.3; s += 0.55) posts.add(s); else for (let s = 1.2; s < L - 0.6; s += 1.25) if (![...posts].some((p) => Math.abs(p - s) < 0.6)) posts.add(s);
      const ps = [...posts].sort((a, b) => a - b); const levels = []; for (let k = 0; k <= nfl; k++) levels.push(y0 + k * fh); levels[levels.length - 1] = Math.min(levels[levels.length - 1], y1);
      for (let k = 0; k < levels.length; k++) B.fRect(F, 0, L, levels[k] - (k === 0 ? 0 : bw * 0.5), levels[k] + bw * 0.5, tt, PART.timber, undefined, [[0, 0], [L, 0], [L, bw], [0, bw]]);
      for (let k = 0; k + 1 < levels.length; k++) { const ya = levels[k] + bw * 0.5, yb = levels[k + 1] - bw * 0.5; if (yb <= ya) continue;
        for (const s of ps) { const blocked = holes.some((h) => s > h.s0 - 0.01 && s < h.s1 + 0.01 && h.y1 > ya && h.y0 < yb); if (blocked) continue; B.fRect(F, Math.max(0, s - bw / 2), Math.min(L, s + bw / 2), ya, yb, tt, PART.timber, undefined, [[0, ya], [bw, ya], [bw, yb], [0, yb]]); }
        // a rail at the sills, and braces where a bay has no opening
        if (g.frame >= 1 && yb - ya > 1.6) { const ym = ya + Math.min(0.95, (yb - ya) * 0.4); for (let q = 0; q + 1 < ps.length; q++) { const a = ps[q] + bw / 2, b = ps[q + 1] - bw / 2; if (b - a < 0.3) continue; const hole = holes.some((h) => h.s1 > a && h.s0 < b && h.y1 > ya && h.y0 < yb); if (!hole) B.fRect(F, a, b, ym - bw * 0.4, ym + bw * 0.4, tt, PART.timber); } }
        if (g.frame === 3 && near) for (let q = 0; q + 1 < ps.length; q++) { const a = ps[q] + bw / 2, b = ps[q + 1] - bw / 2; if (b - a < 0.6 || b - a > 2.2) continue; if (holes.some((h) => h.s1 > a && h.s0 < b && h.y1 > ya && h.y0 < yb)) continue;
          // a brace across the bay, from one foot to the other head (in the face's own s, y), a beam's width wide
          const up = (q % 2 === 0); const s0 = up ? a : b, s1 = up ? b : a; const ds = s1 - s0, dy = yb - ya, l = Math.hypot(ds, dy); const ps2 = -dy / l * bw * 0.5, py2 = ds / l * bw * 0.5;
          let pts = [[s0 - ps2, ya - py2], [s0 + ps2, ya + py2], [s1 + ps2, yb + py2], [s1 - ps2, yb - py2]];
          const area = (pts[1][0] - pts[0][0]) * (pts[3][1] - pts[0][1]) - (pts[1][1] - pts[0][1]) * (pts[3][0] - pts[0][0]); if (area < 0) pts = [pts[1], pts[0], pts[3], pts[2]];
          pts = pts.map(([s, y]) => [Math.max(0, Math.min(L, s)), Math.max(ya, Math.min(yb, y))]);
          B.quad(B.fp(F, pts[0][0], pts[0][1], tt), B.fp(F, pts[1][0], pts[1][1], tt), B.fp(F, pts[2][0], pts[2][1], tt), B.fp(F, pts[3][0], pts[3][1], tt), PART.timber, [[0, 0], [bw, 0], [bw, l], [0, l]]); }
      }
    };
    // quoins, string courses, a cornice: the classical dress of a facade
    const dressFace = (F, y0, y1, nfl) => {
      if (!mid) return;
      if (g.strc) for (let k = 1; k < nfl; k++) { const y = y0 + k * fh - 0.06; if (near) B.fBox(F, -0.04, F.L + 0.04, y - 0.06, y + 0.08, 0, 0.07, PART.trim); else B.fRect(F, 0, F.L, y - 0.06, y + 0.08, 0.03, PART.trim); }
      if (g.quoin && near) for (let y = y0 + 0.05, q = 0; y < y1 - 0.3; y += 0.62, q++) { const wq = q % 2 ? 0.32 : 0.52; B.fBox(F, 0, wq, y, y + 0.55, 0, 0.03, PART.stone); B.fBox(F, F.L - wq, F.L, y, y + 0.55, 0, 0.03, PART.stone); }
      if (g.toron && near) for (let y = y0 + (y1 - y0) * 0.38; y < y1 - 0.5; y += (y1 - y0) * 0.3) for (let s = 0.5; s < F.L - 0.3; s += 0.95) B.fBox(F, s - 0.06, s + 0.06, y - 0.06, y + 0.06, 0, 0.45, PART.timber);
    };
    // a wing's walls: four faces (some hidden), the storeys and their openings
    const buildWing = (wg, k) => {
      const low = wg.low || 1; const nfl = Math.max(1, Math.round(fl * low)); const top = base + nfl * fh; wg.top = top;
      const jet = wg.main && g.jet && nfl >= 2 ? g.jet : 0;
      const faces = [
        { key: 'z1', o: [wg.x0, 0, wg.z1], u: [1, 0, 0], n: [0, 0, 1], L: wg.x1 - wg.x0, s0: wg.x0, front: true },
        { key: 'z0', o: [wg.x1, 0, wg.z0], u: [-1, 0, 0], n: [0, 0, -1], L: wg.x1 - wg.x0, s0: -wg.x1 },
        { key: 'x1', o: [wg.x1, 0, wg.z1], u: [0, 0, -1], n: [1, 0, 0], L: wg.z1 - wg.z0, s0: -wg.z1 },
        { key: 'x0', o: [wg.x0, 0, wg.z0], u: [0, 0, 1], n: [-1, 0, 0], L: wg.z1 - wg.z0, s0: wg.z0 },
      ];
      for (const F of faces) {
        if (wg.hide && wg.hide.includes(F.key)) continue;
        const isFront = !!(wg.main && F.key === 'z1'), inner = wg.inner === F.key;
        const side = F.key === 'x0' || F.key === 'x1'; const blind = side && wg.main && urbanAttached;
        const groundTop = Math.min(top, base + fh);
        const arcade = isFront && g.arc && nfl >= 2;
        // the ground storey (its own material where the style has one, or set back behind an arcade), then the rest
        const holes = blind ? [] : openings(F, !side, base, top, nfl, isFront || (inner && wg.main === undefined && F.key === wg.inner && k === 0));
        const lower = holes.filter((h) => h.y1 <= groundTop + 1e-3), upper = holes.filter((h) => h.y0 >= groundTop - 1e-3);
        const g2 = g.wall2 && g.w2on === 'ground' ? pW2 : pW;
        if (arcade) {
          const ad = Math.min(3.2, (wg.z1 - wg.z0) * 0.3); const Fa = Object.assign({}, F, { o: [F.o[0], 0, F.o[2] - ad] });
          solidWall(Fa, 0, F.L, base, groundTop, lower, g2); for (const h of lower) dressOpening(Fa, h, g2);
          const np = Math.max(2, Math.round(F.L / 3.2) + 1); for (let q = 0; q < np; q++) { const s = q / (np - 1) * (F.L - 0.6) + 0.3; B.fBox(F, s - 0.3, s + 0.3, base, groundTop, -ad, 0, PART.stone, undefined); }
          B.quad(B.fp(F, 0, groundTop, -ad), B.fp(F, F.L, groundTop, -ad), B.fp(F, F.L, groundTop, 0), B.fp(F, 0, groundTop, 0), PART.soffit, null, 0.55);
          B.fRect(F, 0, F.L, groundTop - 0.35, groundTop, 0, PART.trim);
          if (near) for (let q = 0; q + 1 < np; q++) { const sa = q / (np - 1) * (F.L - 0.6) + 0.6, sb = (q + 1) / (np - 1) * (F.L - 0.6), cxa = (sa + sb) / 2, ra = (sb - sa) / 2, ya = groundTop - 0.35;      // the arches between the piers
            for (let m = 0; m < 6; m++) { const a0 = Math.PI * m / 6, a1 = Math.PI * (m + 1) / 6; const P = (a) => [cxa - Math.cos(a) * ra, ya - ra * 0.55 + Math.sin(a) * ra * 0.55]; const p0 = P(a0), p1 = P(a1);
              B.quad(B.fp(F, p0[0], p0[1], 0.01), B.fp(F, p1[0], p1[1], 0.01), B.fp(F, p1[0], ya, 0.01), B.fp(F, p0[0], ya, 0.01), PART.stone, null, 1); } }
        } else { solidWall(F, 0, F.L, base, groundTop, lower, g2); for (const h of lower) dressOpening(F, h, g2); }
        if (top > groundTop + 0.01) {
          const Fu = jet && F.key === 'z1' ? Object.assign({}, F, { o: [F.o[0], 0, F.o[2] + jet] }) : jet && side ? Object.assign({}, F, F.key === 'x1' ? { o: [F.o[0], 0, F.o[2] + jet], L: F.L + jet } : { L: F.L + jet }) : F;
          if (jet && side && F.key === 'x1') for (const h of upper) { h.s0 += jet; h.s1 += jet; }
          solidWall(Fu, 0, Fu.L, groundTop, top, upper, pW); for (const h of upper) dressOpening(Fu, h, pW);
          if (jet && F.key === 'z1') { B.quad(B.fp(F, 0, groundTop, 0), B.fp(F, F.L, groundTop, 0), B.fp(F, F.L, groundTop, jet), B.fp(F, 0, groundTop, jet), PART.soffit, null, 0.55);
            if (near) for (let s = 0.3; s < F.L; s += 0.7) B.fBox(F, s - 0.07, s + 0.07, groundTop - 0.18, groundTop, 0, jet, PART.timber); }
          if (!blind && g.wall !== 'logs') frameBeams(Fu, groundTop, top, upper, nfl - 1);
        }
        if (!blind && g.frame && g.wall !== 'logs' && g.wall2 === null) frameBeams(F, base, groundTop, lower, 1);
        if (!blind) dressFace(F, base, top, nfl);
        if (g.batter && near) { /* (a battered wall's slope is in the shader's light: the geometry stands straight) */ }
      }
      // a cornice under the eaves of a classical house
      if (g.corn && mid && !wg.round) { const pr = near ? 0.28 : 0.2, hh = 0.32; B.box(wg.x0 - pr, wg.x1 + pr, top - hh, top, wg.z0 - pr, wg.z1 + pr + (wg.main ? jet : 0), PART.trim, (wg.hide || '')); }
      // windows in the gable ends of a house lived in under its roof
      if (g.loft && mid && wg.main && g.roof !== 'flat' && g.roof !== 'hip' && g.roof !== 'pyr' && g.roof !== 'mansard' && g.roof !== 'dome' && g.roof !== 'vault') {
        const alongX = wg.ridge === 'x'; const span = alongX ? wg.z1 - wg.z0 : wg.x1 - wg.x0; const rise = span / 2 * tp; if (rise > 1.6) {
          const ends = alongX ? [{ o: [wg.x1 + 0.02, 0, wg.z1], u: [0, 0, -1], n: [1, 0, 0], L: span, s0: 0, key: 'x1' }, { o: [wg.x0 - 0.02, 0, wg.z0], u: [0, 0, 1], n: [-1, 0, 0], L: span, s0: 0, key: 'x0' }] : [{ o: [wg.x0, 0, wg.z1 + jet + 0.02], u: [1, 0, 0], n: [0, 0, 1], L: span, s0: 0, key: 'z1' }, { o: [wg.x1, 0, wg.z0 - 0.02], u: [-1, 0, 0], n: [0, 0, -1], L: span, s0: 0, key: 'z0' }];
          for (const F of ends) { if (urbanAttached && (F.key === 'x0' || F.key === 'x1')) continue; const ww = Math.min(winW, 0.9), wh = Math.min(winH * 0.8, rise * 0.45), y0 = top + 0.35; const n2 = span > 7 && rise > 2.6 ? 2 : 1;
            for (let q = 0; q < n2; q++) { const cx = span * (n2 === 1 ? 0.5 : 0.32 + 0.36 * q); B.fRect(F, cx - ww / 2, cx + ww / 2, y0, y0 + wh, 0.0, glassAux(winK++, pat), 1, [[0, 0], [1, 0], [1, 1], [0, 1]]);
              B.fRect(F, cx - ww / 2 - frameW, cx - ww / 2, y0 - frameW, y0 + wh + frameW, 0.012, PART.trim); B.fRect(F, cx + ww / 2, cx + ww / 2 + frameW, y0 - frameW, y0 + wh + frameW, 0.012, PART.trim);
              B.fRect(F, cx - ww / 2, cx + ww / 2, y0 + wh, y0 + wh + frameW, 0.012, PART.trim); B.fRect(F, cx - ww / 2, cx + ww / 2, y0 - frameW, y0, 0.012, PART.trim); } } } }
    };
    // ----- a round house -----
    const buildRound = (R) => {
      const n = near ? 16 : lod === 1 ? 12 : 9; const top = base + fl * fh; const pts = []; for (let q = 0; q <= n; q++) { const a = q / n * Math.PI * 2 + Math.PI / 2; pts.push([Math.cos(a) * R, Math.sin(a) * R]); }
      for (let q = 0; q < n; q++) { const [x0, z0] = pts[q], [x1, z1] = pts[q + 1]; const s0 = q / n * Math.PI * 2 * R, s1 = (q + 1) / n * Math.PI * 2 * R; const nm = [(x0 + x1) / 2 / R, 0, (z0 + z1) / 2 / R];
        const yb = Math.min(base, -1.5);      // (into the ground, for a slope)
        B.tri([x1, yb, z1], [x0, yb, z0], [x0, top, z0], pW, [s1, yb], [s0, yb], [s0, top], [nm[0], 0, nm[2]]); B.tri([x1, yb, z1], [x0, top, z0], [x1, top, z1], pW, [s1, yb], [s0, top], [s1, top], [nm[0], 0, nm[2]]); }
      // the door to the front, a window or two
      const F = { o: [-g.dw / 2 - 0.2, 0, R + 0.02], u: [1, 0, 0], n: [0, 0, 1], L: g.dw + 0.4, s0: 0 };
      B.fRect(F, 0.2, 0.2 + g.dw, base, base + Math.min(g.dh, fh - 0.15), 0.01, PART.door, 0.85);
      if (winW > 0.2 && mid) for (const a of [0.9, -0.9, 2.5]) { const cx = Math.sin(a) * (R + 0.02), cz = Math.cos(a) * (R + 0.02); const Fw = { o: [cx - Math.cos(a) * winW / 2, 0, cz + Math.sin(a) * winW / 2], u: [Math.cos(a), 0, -Math.sin(a)], n: [Math.sin(a), 0, Math.cos(a)], L: winW, s0: 0 };
        B.fRect(Fw, 0, winW, base + g.sill, base + g.sill + Math.min(winH, fh - g.sill - 0.2), 0.01, glassAux(winK++, pat), 1, [[0, 0], [1, 0], [1, 1], [0, 1]]); }
      return top;
    };
    // ----- roofs -----
    // in a canonical frame: ridge along u (U wide), span along v (V deep), at wall top yw; map(u, y, v) puts it in place
    const roofOn = (kind, x0, x1, z0, z1, yw, ridge, over, gover, wingKey) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; const alongX = ridge === 'x'; const U = alongX ? x1 - x0 : z1 - z0, V = alongX ? z1 - z0 : x1 - x0;
      const M = alongX ? (u, y, v) => [cx + u, y, cz + v] : (u, y, v) => [cx + v, y, cz - u];
      const hu = U / 2, hv = V / 2; const oe = over, og = gover; const yE = yw - oe * tp, yR = yw + hv * tp; const th = near ? 0.14 : 0.1;
      const gableWall = (sgn, y0, y1, v1) => { const u = sgn * hu; const a = M(u, y0, sgn * v1), b = M(u, y0, -sgn * v1), c = M(u, y1, 0); B.tri(a, b, c, pW, [sgn * v1, y0], [-sgn * v1, y0], [0, y1], null); };
      const fascia = (a, b, part) => { if (lod > 1) return; const a2 = [a[0], a[1] - th, a[2]], b2 = [b[0], b[1] - th, b[2]]; B.quad(a2, b2, b, a, part || pRE, null, 0.9); };
      const soffit = (a, b, c, d) => { if (lod > 1) return; B.quad(a, b, c, d, PART.soffit, null, 0.6); };
      const slopeFace = (a, b, c, d) => { B.slope(a, b, c, d, pR); };
      const k = kind;
      if (k === 'gable' || k === 'curve' || k === 'half' || k === 'gambrel' || k === 'horn' || k === 'boat' || (k === 'iri' && U < V * 1.05)) {
        let yh = yR, vh = 0;      // half-hip: the gable stops below the ridge
        if (k === 'half') { yh = yw + (yR - yw) * 0.62; vh = (yR - yh) / tp; }
        if (k === 'curve' || k === 'horn' || k === 'boat') {
          const nu = k === 'curve' ? 3 : 8, nv = 4; const lift = k === 'curve' ? 0.45 + 0.15 * (oe) : 0; const hornH = k === 'horn' ? (yR - yw) * 0.9 : k === 'boat' ? (yR - yw) * 1.2 : 0; const ext = k === 'horn' ? og + 1.2 : k === 'boat' ? og + 2.4 : og;
          const eaveY = (uu) => yE + lift * Math.pow(Math.min(1, Math.abs(uu) / (hu + ext)), 3) + hornH * 0.5 * Math.pow(Math.abs(uu) / (hu + ext), 4);
          const ridgeY = (uu) => yR + hornH * Math.pow(Math.abs(uu) / (hu + ext), 3.5);
          const prof = (s) => 1 - Math.pow(1 - s, k === 'curve' ? 1.9 : 1.5);      // from the ridge (0) to the eave (1): steep, then flatter
          for (const sgn of [1, -1]) for (let a = 0; a < nu; a++) for (let b = 0; b < nv; b++) {
            const u0 = -hu - ext + (U + 2 * ext) * a / nu, u1 = -hu - ext + (U + 2 * ext) * (a + 1) / nu; const s0 = b / nv, s1 = (b + 1) / nv;
            const P = (uu, s) => { const vv = sgn * (s * (hv + oe)); const ye = eaveY(uu), yr = ridgeY(uu); return M(uu, yr - (yr - ye) * prof(s), vv); };
            if (sgn > 0) slopeFace(P(u0, s1), P(u1, s1), P(u1, s0), P(u0, s0)); else slopeFace(P(u1, s1), P(u0, s1), P(u0, s0), P(u1, s0)); }
          for (const sgn of [1, -1]) { gableWall(sgn, yw, yR, hv); }
          if (lod <= 1) { for (const sgn of [1, -1]) { const e0 = M(-hu - ext, eaveY(-hu - ext), sgn * (hv + oe)), e1 = M(hu + ext, eaveY(hu + ext), sgn * (hv + oe)); if (sgn > 0) fascia(e0, e1); else fascia(e1, e0); }
            const r0 = M(-hu - ext, ridgeY(-hu - ext) + 0.12, 0), r1 = M(hu + ext, ridgeY(hu + ext) + 0.12, 0); B.quad(M(-hu - ext, ridgeY(-hu - ext) - 0.05, 0.18), M(hu + ext, ridgeY(hu + ext) - 0.05, 0.18), r1, r0, pRE, null, 1); B.quad(M(hu + ext, ridgeY(hu + ext) - 0.05, -0.18), M(-hu - ext, ridgeY(-hu - ext) - 0.05, -0.18), r0, r1, pRE, null, 1);
            if (k === 'curve' && near) for (const sgn of [1, -1]) { const p = M(sgn * (hu + ext * 0.6), ridgeY(hu) - 0.05, 0); B.box(p[0] - 0.25, p[0] + 0.25, p[1], p[1] + 0.7, p[2] - 0.2, p[2] + 0.2, pRE); } }
          return;
        }
        // straight slopes (gable, half-hip, gambrel)
        if (k === 'gambrel') {
          const vb = hv * 0.55, yb = yw + (hv - vb) * Math.tan(62 * D2R); const yT = yb + vb * Math.tan(28 * D2R); const yEe = yw - oe * Math.tan(62 * D2R);
          for (const sgn of [1, -1]) {
            const A = M(-hu - og, yEe, sgn * (hv + oe)), Bq = M(hu + og, yEe, sgn * (hv + oe)), C = M(hu + og, yb, sgn * vb), Dq = M(-hu - og, yb, sgn * vb), E = M(hu + og, yT, 0), Fq = M(-hu - og, yT, 0);
            if (sgn > 0) { slopeFace(A, Bq, C, Dq); slopeFace(Dq, C, E, Fq); fascia(A, Bq); } else { slopeFace(Bq, A, Dq, C); slopeFace(C, Dq, Fq, E); fascia(Bq, A); } }
          for (const sgn of [1, -1]) { const u = sgn * hu; const pts = [M(u, yw, sgn * hv), M(u, yw, -sgn * hv), M(u, yb, -sgn * vb), M(u, yT, 0), M(u, yb, sgn * vb)]; B.sTri(pts[0], pts[1], pts[2], pW); B.sTri(pts[0], pts[2], pts[3], pW); B.sTri(pts[0], pts[3], pts[4], pW); }
          return;
        }
        for (const sgn of [1, -1]) {
          const ue = hu + og; const A = M(-ue, yE, sgn * (hv + oe)), Bq = M(ue, yE, sgn * (hv + oe));
          if (k === 'half') { const ur = hu - (yR - yh) / tp * 0.9; const C = M(ue, yh, sgn * vh), Dq = M(-ue, yh, sgn * vh), Er = M(ur, yR, 0), Fr = M(-ur, yR, 0);
            if (sgn > 0) { slopeFace(A, Bq, C, Dq); slopeFace(Dq, C, Er, Fr); fascia(A, Bq); } else { slopeFace(Bq, A, Dq, C); slopeFace(C, Dq, Fr, Er); fascia(Bq, A); } }
          else { const C = M(ue, yR, 0), Dq = M(-ue, yR, 0); if (sgn > 0) { slopeFace(A, Bq, C, Dq); fascia(A, Bq); } else { slopeFace(Bq, A, Dq, C); fascia(Bq, A); } }
          // the underside of the eaves
          const w0 = M(-ue, yw, sgn * hv), w1 = M(ue, yw, sgn * hv); if (sgn > 0) soffit(M(-ue, yE - th, sgn * (hv + oe)), w0, w1, M(ue, yE - th, sgn * (hv + oe))); else soffit(M(ue, yE - th, sgn * (hv + oe)), w1, w0, M(-ue, yE - th, sgn * (hv + oe)));
        }
        if (k === 'half') { for (const sgn of [1, -1]) { const ue = sgn * (hu + og * 0.5); const ur = sgn * (hu - (yR - yh) / tp * 0.9); const P1 = M(ue, yh, vh), P2 = M(ue, yh, -vh), P3 = M(ur, yR, 0); if (sgn > 0) B.sTri(P1, P2, P3, pR); else B.sTri(P2, P1, P3, pR);
            const u = sgn * hu; const a = M(u, yw, sgn * hv), b = M(u, yw, -sgn * hv), c = M(u, yh, -sgn * vh), d = M(u, yh, sgn * vh); B.quad(a, b, c, d, pW, [[sgn * hv, yw], [-sgn * hv, yw], [-sgn * vh, yh], [sgn * vh, yh]]); } }
        else if (!g.stepg) for (const sgn of [1, -1]) gableWall(sgn, yw, yR, hv);
        // verges: the bargeboards along the gable's edges, and their undersides
        if (k !== 'half' && lod <= 1 && !g.stepg) for (const sgn of [1, -1]) { const u = sgn * (hu + og); for (const s2 of [1, -1]) { const a = M(u, yE, s2 * (hv + oe)), b = M(u, yR, 0); const a2 = [a[0], a[1] - th * 1.4, a[2]], b2 = [b[0], b[1] - th * 1.4, b[2]];
          if (sgn * s2 > 0) B.quad(a2, b2, b, a, g.carv ? PART.trim : pRE, null, 0.9); else B.quad(b2, a2, a, b, g.carv ? PART.trim : pRE, null, 0.9);
          if (og > 0.15) { const c = M(sgn * hu, yE - th * 1.4, s2 * (hv + oe)), dd = M(sgn * hu, yR - th * 1.4, 0); if (sgn * s2 > 0) B.quad(a2, c, dd, b2, PART.soffit, null, 0.6); else B.quad(c, a2, b2, dd, PART.soffit, null, 0.6); } } }
        // the ridge
        if (lod <= 1) { const ue = k === 'half' ? hu - (yR - yh) / tp * 0.9 : hu + og; const r0 = M(-ue, yR + 0.1, 0), r1 = M(ue, yR + 0.1, 0); B.quad(M(-ue, yR - 0.06, 0.2), M(ue, yR - 0.06, 0.2), r1, r0, pRE, null, 1); B.quad(M(ue, yR - 0.06, -0.2), M(-ue, yR - 0.06, -0.2), r0, r1, pRE, null, 1); }
        // stepped gables: the gable wall climbs above the roof in steps
        if (g.stepg) for (const sgn of [1, -1]) { const n = Math.max(3, Math.round((yR - yw) / 0.75)); for (let q = 0; q < n; q++) { const ya = yw + (yR - yw) * q / n, yb = yw + (yR - yw) * (q + 1) / n + 0.35; const vv = Math.max(0.35, (yR - (yw + (yR - yw) * (q + 1) / n)) / tp + 0.25);
            const u0 = sgn > 0 ? hu - 0.35 : -hu - 0.08, u1 = sgn > 0 ? hu + 0.08 : -hu + 0.35; const p0 = M(u0, ya, -vv), p1 = M(u1, yb, vv); B.box(Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0]), ya, yb, Math.min(p0[2], p1[2]), Math.max(p0[2], p1[2]), pW); } }
        return;
      }
      if (k === 'hip' || k === 'pyr' || k === 'iri' || k === 'mansard') {
        const Ud = U + 2 * oe, Vd = V + 2 * oe; let hud = Ud / 2, hvd = Vd / 2;
        if (k === 'mansard') {
          const th1 = 72 * D2R, hm = Math.min(fh * 0.95, 2.8), ins = hm / Math.tan(th1); const yb = yw + hm, th2 = 22 * D2R; const iu = hu - ins, iv = hv - ins;
          const yEe = yw - 0.15; const L0 = [M(-hu - 0.25, yEe, hv + 0.25), M(hu + 0.25, yEe, hv + 0.25), M(hu + 0.25, yEe, -hv - 0.25), M(-hu - 0.25, yEe, -hv - 0.25)], L1 = [M(-iu, yb, iv), M(iu, yb, iv), M(iu, yb, -iv), M(-iu, yb, -iv)];
          for (let q = 0; q < 4; q++) { const a = L0[q], b = L0[(q + 1) % 4], c = L1[(q + 1) % 4], d = L1[q]; slopeFace(a, b, c, d); fascia(a, b); }
          const rr = Math.max(0, iu - iv); const yT = yb + iv * Math.tan(th2);
          const A = L1[0], Bq = L1[1], C = M(rr, yT, 0), Dq = M(-rr, yT, 0); slopeFace(A, Bq, C, Dq); slopeFace(L1[2], L1[3], Dq, C); B.sTri(L1[1], L1[2], C, pR); B.sTri(L1[3], L1[0], Dq, pR);
          wings.mans = { yb, ins, hm, iu, iv, yw, M, hu, hv };
          return;
        }
        if (U < V && k !== 'iri') return roofOn(k, x0, x1, z0, z1, yw, ridge === 'x' ? 'z' : 'x', over, gover);
        const rr = k === 'pyr' ? 0 : k === 'iri' ? Math.max(0.3, hu - hv * 0.55) : Math.max(0, hu - hv);
        const yRR = yE + hvd * tp; const fr = [M(-hud, yE, hvd), M(hud, yE, hvd), M(hud, yE, -hvd), M(-hud, yE, -hvd)];
        if (k === 'iri') {      // hipped below, a small gable above
          const yg = yE + (hud - rr) * tp, vg = Math.max(0.1, (yRR - yg) / tp);
          for (const sgn of [1, -1]) { const a = M(-hud * sgn, yE, sgn * hvd), b = M(hud * sgn, yE, sgn * hvd), c = M(rr * sgn, yg, sgn * vg), d = M(rr * sgn, yRR, 0), e = M(-rr * sgn, yRR, 0), f = M(-rr * sgn, yg, sgn * vg);
            slopeFace(a, b, c, f); slopeFace(f, c, d, e); fascia(a, b);
            const h0 = M(hud * sgn, yE, sgn * hvd), h1 = M(hud * sgn, yE, -sgn * hvd), h2 = M(rr * sgn, yg, -sgn * vg), h3 = M(rr * sgn, yg, sgn * vg); slopeFace(h0, h1, h2, h3); fascia(h0, h1);
            B.sTri(M(rr * sgn, yg, sgn * vg), M(rr * sgn, yg, -sgn * vg), M(rr * sgn, yRR, 0), PART.timber); }
        } else {
          slopeFace(fr[0], fr[1], M(rr, yRR, 0), M(-rr, yRR, 0)); slopeFace(fr[2], fr[3], M(-rr, yRR, 0), M(rr, yRR, 0));
          B.sTri(fr[1], fr[2], M(rr, yRR, 0), pR); B.sTri(fr[3], fr[0], M(-rr, yRR, 0), pR);
          for (let q = 0; q < 4; q++) fascia(fr[q], fr[(q + 1) % 4]);
        }
        // soffits all round
        if (lod <= 1) { const w = [M(-hu, yw, hv), M(hu, yw, hv), M(hu, yw, -hv), M(-hu, yw, -hv)]; const e = fr.map((p) => [p[0], p[1] - th, p[2]]); for (let q = 0; q < 4; q++) soffit(e[q], w[q], w[(q + 1) % 4], e[(q + 1) % 4]); }
        if (lod <= 1 && rr > 0.2) { const r0 = M(-rr, yRR + 0.1, 0), r1 = M(rr, yRR + 0.1, 0); B.quad(M(-rr, yRR - 0.06, 0.2), M(rr, yRR - 0.06, 0.2), r1, r0, pRE, null, 1); B.quad(M(rr, yRR - 0.06, -0.2), M(-rr, yRR - 0.06, -0.2), r0, r1, pRE, null, 1); }
        return;
      }
      if (k === 'shed') {
        const yLo = yw - oe * tp, yHi = yw + V * tp; const a = M(-hu - og, yLo, hv + oe), b = M(hu + og, yLo, hv + oe), c = M(hu + og, yHi, -hv - 0.2), d = M(-hu - og, yHi, -hv - 0.2);
        slopeFace(a, b, c, d); fascia(a, b); fascia(c, d);
        for (const sgn of [1, -1]) { const u = sgn * hu; const p0 = M(u, yw, hv), p1 = M(u, yw, -hv), p2 = M(u, yHi, -hv); if (sgn > 0) B.sTri(p0, p1, p2, pW); else B.sTri(p1, p0, p2, pW); }
        B.quad(M(hu, yw, -hv), M(-hu, yw, -hv), M(-hu, yHi, -hv), M(hu, yHi, -hv), pW, null);
        return;
      }
      if (k === 'vault') {
        const n = near ? 8 : 5; const rv = hv; const yb = yw;
        for (let q = 0; q < n; q++) { const a0 = Math.PI * q / n, a1 = Math.PI * (q + 1) / n; const p = (u, a) => M(u, yb + Math.sin(a) * rv * 0.8, Math.cos(a) * (rv + 0.1));
          B.slope(p(-hu - 0.1, a0), p(hu + 0.1, a0), p(hu + 0.1, a1), p(-hu - 0.1, a1), pR);
          for (const sgn of [1, -1]) { const c = M(sgn * hu, yb, 0); const e0 = M(sgn * hu, yb + Math.sin(a0) * rv * 0.8, Math.cos(a0) * rv), e1 = M(sgn * hu, yb + Math.sin(a1) * rv * 0.8, Math.cos(a1) * rv); if (sgn > 0) B.sTri(c, e1, e0, pW); else B.sTri(c, e0, e1, pW); } }
        return;
      }
      // flat (and a flat roof under domes): the roof, its parapet, its coping, battlements
      const yT = yw + 0.04;
      B.quad(M(-hu, yT, hv), M(hu, yT, hv), M(hu, yT, -hv), M(-hu, yT, -hv), pR, [[-hu, hv], [hu, hv], [hu, -hv], [-hu, -hv]], 1);
      if (g.par > 0.1) {
        const ph = g.par, pw = 0.26, yP = yw + ph;
        const C = [[-hu, hv], [hu, hv], [hu, -hv], [-hu, -hv]], I = [[-hu + pw, hv - pw], [hu - pw, hv - pw], [hu - pw, -hv + pw], [-hu + pw, -hv + pw]];
        for (let q = 0; q < 4; q++) {
          const a = C[q], b = C[(q + 1) % 4], ia = I[q], ib = I[(q + 1) % 4]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          B.quad(M(a[0], yw, a[1]), M(b[0], yw, b[1]), M(b[0], yP, b[1]), M(a[0], yP, a[1]), pW, [[0, yw], [len, yw], [len, yP], [0, yP]]);      // the outer face, on from the wall
          if (lod <= 1) { B.quad(M(ib[0], yT, ib[1]), M(ia[0], yT, ia[1]), M(ia[0], yP, ia[1]), M(ib[0], yP, ib[1]), pW, [[len, yT], [0, yT], [0, yP], [len, yP]], 0.8);
            B.quad(M(a[0], yP, a[1]), M(b[0], yP, b[1]), M(ib[0], yP, ib[1]), M(ia[0], yP, ia[1]), PART.trim, null, 1); }
          if (g.cren && lod <= 1) { const nm = Math.max(3, Math.round(len / 1.1) | 1); for (let m = 0; m < nm; m += 2) { const t0 = m / nm, t1 = (m + 1) / nm;
            const p = (tt, inset) => { const x = a[0] + (b[0] - a[0]) * tt, y = a[1] + (b[1] - a[1]) * tt; const ix = ia[0] + (ib[0] - ia[0]) * tt, iy = ia[1] + (ib[1] - ia[1]) * tt; return inset ? [ix, iy] : [x, y]; };
            const o0 = p(t0, 0), o1 = p(t1, 0), i1 = p(t1, 1), i0 = p(t0, 1); const yM = yP + 0.55;
            B.quad(M(o0[0], yP, o0[1]), M(o1[0], yP, o1[1]), M(o1[0], yM, o1[1]), M(o0[0], yM, o0[1]), pW); B.quad(M(o0[0], yM, o0[1]), M(o1[0], yM, o1[1]), M(i1[0], yM, i1[1]), M(i0[0], yM, i0[1]), pW, null, 1);
            B.quad(M(i1[0], yP, i1[1]), M(i0[0], yP, i0[1]), M(i0[0], yM, i0[1]), M(i1[0], yM, i1[1]), pW, null, 0.85);
            B.quad(M(i0[0], yP, i0[1]), M(o0[0], yP, o0[1]), M(o0[0], yM, o0[1]), M(i0[0], yM, i0[1]), pW); B.quad(M(o1[0], yP, o1[1]), M(i1[0], yP, i1[1]), M(i1[0], yM, i1[1]), M(o1[0], yM, o1[1]), pW); } }
        }
      } else if (lod <= 1) { const e = 0.15; B.box(cx - (alongX ? hu : hv) - e, cx + (alongX ? hu : hv) + e, yw - 0.18, yw + 0.06, cz - (alongX ? hv : hu) - e, cz + (alongX ? hv : hu) + e, PART.trim, 'b'); }
    };
    // ----- now build it -----
    let topMain = wallTop;
    if (wings[0].round) topMain = buildRound(wings[0].r);
    else for (let k = 0; k < wings.length; k++) buildWing(wings[k], k);
    // roofs over the wings
    if (wings[0].round) {
      const R = wings[0].r; const n = near ? 16 : lod === 1 ? 12 : 9; const oe = g.over;
      if (g.roof === 'dome') { const rings = near ? 5 : 3; const hd = R * (g.fh < 1 ? 1.25 : 0.9);
        for (let a = 0; a < n; a++) for (let b = 0; b < rings; b++) { const t0 = a / n * Math.PI * 2, t1 = (a + 1) / n * Math.PI * 2, p0 = b / rings * Math.PI / 2, p1 = (b + 1) / rings * Math.PI / 2;
          const P = (t, p) => [Math.cos(t) * Math.cos(p) * (R + 0.05), topMain + Math.sin(p) * hd, Math.sin(t) * Math.cos(p) * (R + 0.05)]; const Nn = (t, p) => { const v = [Math.cos(t) * Math.cos(p) / R, Math.sin(p) / hd, Math.sin(t) * Math.cos(p) / R]; const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
          const A0 = P(t0, p0), A1 = P(t1, p0), A2 = P(t1, p1), A3 = P(t0, p1); const u = (t) => t * R, v = (p) => p * hd;
          B.tri(A0, A2, A1, pR, [u(t0), v(p0)], [u(t1), v(p1)], [u(t1), v(p0)], Nn((t0 + t1) / 2, (p0 + p1) / 2), 1); if (b < rings - 1) B.tri(A0, A3, A2, pR, [u(t0), v(p0)], [u(t0), v(p1)], [u(t1), v(p1)], Nn((t0 + t1) / 2, (p0 + p1) / 2), 1); }
      } else {
        const yE = topMain - oe * tp, apex = topMain + R * tp; const Re = R + oe;
        for (let a = 0; a < n; a++) { const t0 = a / n * Math.PI * 2, t1 = (a + 1) / n * Math.PI * 2; const p0 = [Math.cos(t0) * Re, yE, Math.sin(t0) * Re], p1 = [Math.cos(t1) * Re, yE, Math.sin(t1) * Re], ap = [0, apex, 0];
          const tm = (t0 + t1) / 2, nn = [Math.cos(tm) * Math.sin(pitch), Math.cos(pitch), Math.sin(tm) * Math.sin(pitch)];
          B.tri(p0, ap, p1, pR, [t0 * Re, 0], [(t0 + t1) / 2 * Re, Re / Math.cos(pitch)], [t1 * Re, 0], nn, 1);
          if (lod <= 1) { const q0 = [p0[0], yE - 0.16, p0[2]], q1 = [p1[0], yE - 0.16, p1[2]]; B.quad(q0, q1, p1, p0, pRE, null, 0.9); const w0 = [Math.cos(t0) * R, topMain, Math.sin(t0) * R], w1 = [Math.cos(t1) * R, topMain, Math.sin(t1) * R]; B.quad(q1, q0, w0, w1, PART.soffit, null, 0.6); } }
      }
    } else for (const wg of wings) {
      const yw = wg.top; const ridge = wg.ridge === 'x' || wg.ridge === 'z' ? wg.ridge : 'x';
      const kind = g.roof === 'dome' ? 'flat' : wg.main ? g.roof : (g.roof === 'mansard' || g.roof === 'iri' || g.roof === 'pyr' || g.roof === 'horn' || g.roof === 'boat' ? 'gable' : g.roof === 'curve' ? 'curve' : g.roof);
      const jet = wg.main && g.jet && fl >= 2 ? g.jet : 0;
      roofOn(kind, wg.x0, wg.x1, wg.z0, wg.z1 + jet, yw, ridge, g.over, wg.main ? (urbanAttached && ridge === 'x' ? Math.min(0.04, g.gover) : g.gover) : Math.min(0.15, g.gover), wg.hide);      // (a house wall to wall with its neighbours: its gables end at the party walls)
    }
    const main = wings[0];
    // ----- dormers on the front slope, or in a mansard -----
    if (!main.round && g.dorm > 0 && mid && g.roof !== 'flat') {
      const nd = g.dorm; const mz = wings.mans;
      for (let q = 0; q < nd; q++) {
        const x = -W / 2 + W * (q + 0.5) / nd; const dw = Math.min(1.5, W / nd - 0.6); if (dw < 0.7) break;
        const yb = mz ? mz.yw + 0.3 : main.top + 0.35, h = mz ? Math.min(1.9, mz.hm - 0.5) : 1.4; const zf = mz ? D / 2 - mz.ins * 0.35 : (g.ridge === 'x' ? D / 2 - 0.4 - (yb - main.top) / tp : D / 2 - 0.6);
        if (g.ridge !== 'x' && !mz) continue;
        const zb = zf - 1.6;
        B.box(x - dw / 2, x + dw / 2, yb, yb + h, zb, zf, pW, 'b');
        const F = { o: [x - dw / 2, 0, zf + 0.01], u: [1, 0, 0], n: [0, 0, 1], L: dw, s0: x - dw / 2 }; B.fRect(F, 0.15, dw - 0.15, yb + 0.2, yb + h - 0.2, 0.01, glassAux(winK++, pat), 1, [[0, 0], [1, 0], [1, 1], [0, 1]]);
        // its own little roof, ridge running back into the main roof
        const rh = dw * 0.55; const a = [x - dw / 2 - 0.12, yb + h, zf + 0.15], b = [x, yb + h + rh, zf + 0.15], c = [x, yb + h + rh, zb - 0.3], d = [x - dw / 2 - 0.12, yb + h, zb - 0.3];
        B.slope(d, a, b, c, pR); const a2 = [x + dw / 2 + 0.12, yb + h, zf + 0.15], d2 = [x + dw / 2 + 0.12, yb + h, zb - 0.3]; B.slope(a2, d2, c, b, pR);
        B.tri([x - dw / 2, yb + h, zf], [x + dw / 2, yb + h, zf], [x, yb + h + rh, zf], pW, [0, 0], [dw, 0], [dw / 2, rh], null);
      }
    }
    // ----- chimneys -----
    const chims = g.chim ? g.chim.n | 0 : 0;
    if (chims > 0 && !main.round) {
      const yRidge = g.roof === 'flat' ? main.top + 0.2 : main.top + (g.ridge === 'x' ? D / 2 : W / 2) * tp * (g.roof === 'mansard' ? 0.55 : 1);
      for (let q = 0; q < chims; q++) {
        let x, z, y0; const cw = 0.75, cd = 0.55, hh = g.roof === 'flat' ? 1.3 : 1.0;
        if (g.chim.at === 'side') { x = (q % 2 ? 1 : -1) * (W / 2 + cd / 2 + 0.02); z = -D * 0.15; y0 = 0; }
        else if (g.chim.at === 'gable' && g.roof !== 'flat') { if (g.ridge === 'x') { x = (q % 2 ? 1 : -1) * (W / 2 - 0.45); z = 0; } else { x = 0; z = (q % 2 ? 1 : -1) * (D / 2 - 0.45); } y0 = main.top - 0.5; }
        else { if (g.ridge === 'x') { x = chims === 1 ? (rk(30) - 0.5) * W * 0.3 : (q - (chims - 1) / 2) * W / chims; z = g.roof === 'flat' ? -D * 0.25 : 0.0; } else { x = 0; z = chims === 1 ? (rk(31) - 0.5) * D * 0.3 : (q - (chims - 1) / 2) * D / chims; } y0 = main.top - 0.5; }
        const yTop = yRidge + hh;
        B.box(x - cw / 2, x + cw / 2, y0, yTop, z - cd / 2, z + cd / 2, pCh, 'b', 1);
        if (mid) B.box(x - cw / 2 - 0.08, x + cw / 2 + 0.08, yTop - 0.12, yTop + 0.05, z - cd / 2 - 0.08, z + cd / 2 + 0.08, PART.trim, 'b');
        if (near) { B.box(x - 0.18, x - 0.02, yTop + 0.05, yTop + 0.38, z - 0.08, z + 0.08, PART.dark, 'b'); if (cw > 0.6) B.box(x + 0.06, x + 0.22, yTop + 0.05, yTop + 0.34, z - 0.08, z + 0.08, PART.dark, 'b'); }
      }
    }
    // ----- a gallery or veranda: a floor, posts and a lean-to roof (along the front, the side, or all round) -----
    if (g.gal && !main.round && mid) {
      const gd = g.gal.d; const sides = g.gal.side === 'wrap' ? ['z1', 'x0', 'x1'] : g.gal.side === 'side' ? ['x1'] : ['z1'];
      const yF = base, yTop = Math.min(main.top, base + fh) - 0.05; const levels = g.gal.up && fl >= 2 ? [[yF, yTop], [base + fh, Math.min(main.top, base + 2 * fh) - 0.05]] : [[yF, yTop]];
      for (const sd of sides) {
        const L = sd === 'z1' ? W : D; const F = sd === 'z1' ? { o: [-W / 2, 0, D / 2], u: [1, 0, 0], n: [0, 0, 1], L: W, s0: -W / 2 } : sd === 'x1' ? { o: [W / 2, 0, D / 2], u: [0, 0, -1], n: [1, 0, 0], L: D, s0: -D / 2 } : { o: [-W / 2, 0, -D / 2], u: [0, 0, 1], n: [-1, 0, 0], L: D, s0: -D / 2 };
        const e0 = sides.length > 1 && sd === 'z1' ? -gd : 0, e1 = sides.length > 1 && sd === 'z1' ? L + gd : L;
        for (const [ya, yb] of levels) {
          if (ya > 0.2) B.fBox(F, e0, e1, ya - 0.18, ya, 0, gd, PART.timber);
          const np = Math.max(2, Math.round((e1 - e0) / 2.4) + 1); for (let q = 0; q < np; q++) { const s = e0 + 0.12 + (e1 - e0 - 0.24) * q / (np - 1); B.fBox(F, s - 0.09, s + 0.09, ya, yb, gd - 0.2, gd - 0.02, PART.timber); }
          if (ya > 0.5 && near) { B.fBox(F, e0, e1, ya + 0.85, ya + 0.95, gd - 0.16, gd - 0.06, PART.timber); for (let s = e0 + 0.2; s < e1; s += 0.22) B.fBox(F, s - 0.025, s + 0.025, ya, ya + 0.86, gd - 0.13, gd - 0.09, PART.timber); }
          // the roof: a lean-to under the eaves
          const yr0 = yb + 0.25, yr1 = yb + 0.25 - (gd + 0.2) * Math.tan(16 * D2R);
          const a = B.fp(F, e1 + 0.15, yr1, gd + 0.25), b = B.fp(F, e1 + 0.15, yr0, 0), c = B.fp(F, e0 - 0.15, yr0, 0), d = B.fp(F, e0 - 0.15, yr1, gd + 0.25);
          B.slope(d, a, b, c, pR); B.quad(B.fp(F, e0 - 0.15, yr1 - 0.12, gd + 0.25), B.fp(F, e1 + 0.15, yr1 - 0.12, gd + 0.25), a, d, pRE, null, 0.9);
          B.quad(B.fp(F, e1 + 0.15, yr1 - 0.12, gd + 0.25), B.fp(F, e0 - 0.15, yr1 - 0.12, gd + 0.25), B.fp(F, e0 - 0.15, yr0 - 0.12, 0), B.fp(F, e1 + 0.15, yr0 - 0.12, 0), PART.soffit, null, 0.55);
        }
        if (g.stair || yF > 0.6) { const n = Math.max(2, Math.round(yF / 0.2)); const s = F.L / 2; for (let q = 0; q < n; q++) B.fBox(F, s - 0.6, s + 0.6, yF * q / n - 0.05, yF * (q + 1) / n, gd + (n - q - 1) * 0.28, gd + (n - q) * 0.28, PART.timber); }
      }
    }
    // ----- balconies on the upper floors -----
    if (g.balc && !main.round && fl >= 2 && mid) {
      const k = g.balc.k; const bd = k === 'iron' ? 0.7 : 1.0;
      for (let f = 1; f < fl; f++) {
        if (k !== 'iron' && f > 1 && rk(40 + f) < 0.5) continue;
        const y = base + f * fh; const spans = g.balc.full ? [[-W / 2 + 0.3, W / 2 - 0.3]] : (() => { const n = Math.max(1, Math.floor((W - 0.6) / bayW)), bw = W / n, out = []; for (let b = 0; b < n; b++) if (b % 2 === (f % 2)) out.push([-W / 2 + b * bw + 0.15, -W / 2 + (b + 1) * bw - 0.15]); return out.length ? out : [[-W / 4, W / 4]]; })();
        const zf = D / 2 + (g.jet && f >= 1 ? g.jet : 0);
        for (const [x0, x1] of spans) {
          B.box(x0, x1, y - 0.14, y + 0.02, zf, zf + bd, k === 'stone' ? PART.stone : k === 'wood' ? PART.timber : PART.trim, '');
          if (k === 'stone') B.box(x0, x1, y + 0.02, y + 0.95, zf + bd - 0.14, zf + bd, PART.stone, 'b');
          else if (k === 'wood') { B.box(x0, x1, y + 0.85, y + 0.95, zf + bd - 0.1, zf + bd, PART.timber, 'b'); if (near) for (let x = x0 + 0.1; x < x1; x += 0.16) B.box(x - 0.04, x + 0.04, y + 0.02, y + 0.85, zf + bd - 0.08, zf + bd - 0.02, PART.timber, 'bt'); else B.box(x0, x1, y + 0.02, y + 0.85, zf + bd - 0.07, zf + bd - 0.03, PART.timber, 'bt'); }
          else { B.box(x0, x1, y + 0.9, y + 0.95, zf + bd - 0.05, zf + bd, PART.dark, 'b'); if (near) for (let x = x0 + 0.05; x < x1; x += 0.13) B.box(x - 0.012, x + 0.012, y + 0.02, y + 0.9, zf + bd - 0.04, zf + bd - 0.016, PART.dark, 'bt'); }
          if (near) for (const x of [x0 + 0.15, x1 - 0.15]) B.box(x - 0.06, x + 0.06, y - 0.45, y - 0.14, zf, zf + bd * 0.8, k === 'iron' ? PART.dark : k === 'stone' ? PART.stone : PART.timber, '');
        }
      }
    }
    // ----- an oriel or a lattice bay on the upper floor (the mashrabiya, the jharokha, the cumba, the bay window) -----
    if (g.oriel && !main.round && mid) {
      const ow = Math.min(2.4, W * 0.45), od = 0.75; const f = fl >= 2 ? 1 : 0; const y0 = base + f * fh + (f ? 0 : 0.5), y1 = y0 + fh * (g.style === 'vic' || g.style === 'us_victorian' || g.style === 'uk_semi' ? (fl >= 2 && f === 0 ? 2 : 1) : 1) - 0.15;
      const xs = W > 7 && g.ctx === 'rich' ? [-W / 4, W / 4] : [(g.towerSide || 1) < 0 ? -W * 0.18 : W * 0.18]; const zf = D / 2 + (g.jet || 0) * (f ? 1 : 0);
      const lat = g.lattice || g.fam === 'mena';
      for (const x of xs) {
        B.box(x - ow / 2, x + ow / 2, y0, y1, zf, zf + od, lat ? PART.timber : pW, '');
        const F = { o: [x - ow / 2, 0, zf + od + 0.005], u: [1, 0, 0], n: [0, 0, 1], L: ow, s0: 0 };
        B.fRect(F, 0.12, ow - 0.12, y0 + 0.35, y1 - 0.2, 0.004, glassAux(winK++, lat ? 3 : 1), 1, [[0, 0], [1, 0], [1, 1], [0, 1]]);
        for (const sgn of [-1, 1]) { const Fs = sgn < 0 ? { o: [x - ow / 2 - 0.005, 0, zf], u: [0, 0, 1], n: [-1, 0, 0], L: od, s0: 0 } : { o: [x + ow / 2 + 0.005, 0, zf + od], u: [0, 0, -1], n: [1, 0, 0], L: od, s0: 0 }; B.fRect(Fs, 0.1, od - 0.1, y0 + 0.35, y1 - 0.2, 0.004, glassAux(winK++, lat ? 3 : 1), 1, [[0, 0], [1, 0], [1, 1], [0, 1]]); }
        B.box(x - ow / 2 - 0.08, x + ow / 2 + 0.08, y1, y1 + 0.18, zf, zf + od + 0.1, PART.trim, '');
        if (f) B.box(x - ow / 2 + 0.1, x + ow / 2 - 0.1, y0 - 0.35, y0, zf, zf + od * 0.7, lat ? PART.timber : PART.trim, '');
      }
    }
    // ----- an outside stair up to the first floor -----
    if (g.stair && !main.round && fl >= 2 && !g.gal && mid) { const n = Math.max(5, Math.round(fh / 0.2)); const x0 = W / 2 - 1.1; for (let q = 0; q < n; q++) B.box(x0, x0 + 1.0, base + fh * q / n - 0.05, base + fh * (q + 1) / n, D / 2 + 0.02, D / 2 + 0.02 + (n - q) * 0.27, pW, ''); }
    // ----- a lean-to against one end (a byre, a woodshed, a kitchen) -----
    if (g.annex && !main.round && g.plan !== 'court' && mid) { const aw = Math.min(3.6, Math.max(2.2, W * 0.32)), ad = Math.min(D * 0.85, 7), ah = Math.min(fh * 0.95, 2.6); const sgn = g.annexSide || 1; const x0 = sgn > 0 ? W / 2 : -W / 2 - aw, x1 = x0 + aw; const z0 = -D / 2 + 0.2, z1 = z0 + ad;
      const wk = rk(61) < 0.4 ? packWall(PART.wall, 'boards') : pW;
      B.box(x0, x1, -0.2, ah, z0, z1, wk, sgn > 0 ? 'bx0' : 'bx1');
      const yHi = ah + aw * Math.tan(20 * D2R); const a = [sgn > 0 ? x1 + 0.3 : x0 - 0.3, ah - 0.1, z1 + 0.3], b = [sgn > 0 ? x0 : x1, yHi, z1 + 0.3], c = [sgn > 0 ? x0 : x1, yHi, z0 - 0.3], d = [sgn > 0 ? x1 + 0.3 : x0 - 0.3, ah - 0.1, z0 - 0.3];
      if (sgn > 0) B.slope(d, c, b, a, pR); else B.slope(b, c, d, a, pR);
      for (const zz of [z0, z1]) { const p0 = [x0, ah, zz], p1 = [x1, ah, zz], p2 = [sgn > 0 ? x0 : x1, yHi, zz]; if (zz === z1) B.sTri(p0, p1, p2, wk); else B.sTri(p1, p0, p2, wk); }
      if (mid) { const F = { o: [x0, 0, z1 + 0.01], u: [1, 0, 0], n: [0, 0, 1], L: aw, s0: x0 }; B.fRect(F, aw * 0.25, aw * 0.25 + 0.9, 0, Math.min(2.0, ah - 0.15), 0.01, PART.door, 0.85); }
    }
    // ----- a tower: the corner towers of a kasbah, the tower of a tower-house, the turret of a villa -----
    if (g.tower && !main.round && mid) {
      const kas = g.style === 'kasbah' || g.style === 'najdi'; const tw = kas ? Math.min(4.6, W * 0.32) : Math.min(4.2, W * 0.42); const th2 = main.top + (kas ? 3.2 : g.style === 'vic' || g.style === 'us_victorian' ? 2.6 : 2 * fh + 1);
      const spots = kas ? [[-1, 1], [1, 1], [-1, -1], [1, -1]] : [[g.towerSide || 1, 1]];
      for (const [sx, sz] of spots) { const cx = sx * (W / 2 - tw / 2 + (kas ? 0.4 : 0)), cz = sz * (D / 2 - tw / 2 + (kas ? 0.4 : 0));
        const bt = kas ? 0.35 : 0; B.box(cx - tw / 2, cx + tw / 2, 0, th2, cz - tw / 2, cz + tw / 2, pW, 'b');
        if (bt) { /* (the taper is drawn by the light) */ }
        const F = { o: [cx - tw / 2, 0, cz + tw / 2 + 0.01], u: [1, 0, 0], n: [0, 0, 1], L: tw, s0: 0 }; for (let y = main.top + 0.8; y < th2 - 1.2; y += fh) B.fRect(F, tw / 2 - 0.3, tw / 2 + 0.3, y, y + 0.9, 0.01, glassAux(winK++, pat), 1, [[0, 0], [1, 0], [1, 1], [0, 1]]);
        if (kas || g.cren) { const m = tw / 5; for (const k2 of [0, 2, 4]) { const s0 = -tw / 2 + k2 * m, s1 = s0 + m;      // battlements: three merlons a side, the corners shared
            B.box(cx + s0, cx + s1, th2, th2 + 0.6, cz + tw / 2 - 0.3, cz + tw / 2, pW, 'b'); B.box(cx + s0, cx + s1, th2, th2 + 0.6, cz - tw / 2, cz - tw / 2 + 0.3, pW, 'b');
            B.box(cx + tw / 2 - 0.3, cx + tw / 2, th2, th2 + 0.6, cz + s0, cz + s1, pW, 'b'); B.box(cx - tw / 2, cx - tw / 2 + 0.3, th2, th2 + 0.6, cz + s0, cz + s1, pW, 'b'); } }
        else { const rh = tw * 0.9; const ap = [cx, th2 + rh, cz]; const c4 = [[cx - tw / 2 - 0.2, th2, cz + tw / 2 + 0.2], [cx + tw / 2 + 0.2, th2, cz + tw / 2 + 0.2], [cx + tw / 2 + 0.2, th2, cz - tw / 2 - 0.2], [cx - tw / 2 - 0.2, th2, cz - tw / 2 - 0.2]]; for (let q = 0; q < 4; q++) B.sTri(c4[q], c4[(q + 1) % 4], ap, pR); }
      }
    }
    // ----- a wind-catcher on the roof -----
    if (g.wind && !main.round && mid) { const ww = 2.2, hh = 3.6, e = ww / 2 + 0.005; const cx = W * 0.22, cz = -D * 0.15; B.box(cx - ww / 2, cx + ww / 2, main.top, main.top + hh, cz - ww / 2, cz + ww / 2, pW, 'b');
      const sides = [{ o: [cx - ww / 2, 0, cz + e], u: [1, 0, 0], n: [0, 0, 1] }, { o: [cx + ww / 2, 0, cz - e], u: [-1, 0, 0], n: [0, 0, -1] }, { o: [cx + e, 0, cz + ww / 2], u: [0, 0, -1], n: [1, 0, 0] }, { o: [cx - e, 0, cz - ww / 2], u: [0, 0, 1], n: [-1, 0, 0] }];
      for (const F of sides) { F.L = ww; F.s0 = 0; for (let q = 0; q < 3; q++) B.fRect(F, 0.2 + q * 0.65, 0.55 + q * 0.65, main.top + hh - 1.6, main.top + hh - 0.25, 0, PART.dark, 0.7); }      // the slots that catch the wind
      B.box(cx - ww / 2 - 0.1, cx + ww / 2 + 0.1, main.top + hh, main.top + hh + 0.15, cz - ww / 2 - 0.1, cz + ww / 2 + 0.1, PART.trim); }
    // ----- small domes on a flat roof -----
    const nDomes = g.roof === 'dome' ? Math.max(1, g.domes || 1) : (g.roof === 'flat' ? g.domes | 0 : 0);
    if (nDomes > 0 && !main.round) { for (let q = 0; q < nDomes; q++) { const R = Math.min(W, D) * (nDomes === 1 ? 0.3 : 0.18); const cx = nDomes === 1 ? 0 : (q - (nDomes - 1) / 2) * W / nDomes, cz = nDomes === 1 ? 0 : (q % 2 ? 1 : -1) * D * 0.15; const y0 = main.top + 0.04 + (nDomes === 1 ? 0.5 : 0.25);
        if (nDomes === 1 || near) B.box(cx - R * 0.95, cx + R * 0.95, main.top, y0, cz - R * 0.95, cz + R * 0.95, pW, 'b');
        const n = near ? 12 : 8, rings = near ? 4 : 2; for (let a = 0; a < n; a++) for (let b = 0; b < rings; b++) { const t0 = a / n * Math.PI * 2, t1 = (a + 1) / n * Math.PI * 2, p0 = b / rings * Math.PI / 2, p1 = (b + 1) / rings * Math.PI / 2;
          const P = (t, p) => [cx + Math.cos(t) * Math.cos(p) * R, y0 + Math.sin(p) * R * 0.85, cz + Math.sin(t) * Math.cos(p) * R]; const Nn = [Math.cos((t0 + t1) / 2) * Math.cos((p0 + p1) / 2), Math.sin((p0 + p1) / 2), Math.sin((t0 + t1) / 2) * Math.cos((p0 + p1) / 2)];
          B.tri(P(t0, p0), P(t1, p1), P(t1, p0), pW, [t0 * R, p0 * R], [t1 * R, p1 * R], [t1 * R, p0 * R], Nn, 1); if (b < rings - 1) B.tri(P(t0, p0), P(t0, p1), P(t1, p1), pW, [t0 * R, p0 * R], [t0 * R, p1 * R], [t1 * R, p1 * R], Nn, 1); } } }
    // ----- the beam ends and pinnacles of the Sudanic style, on the parapet -----
    if (g.toron && near && g.roof === 'flat' && !main.round) { for (let x = -W / 2 + 0.6; x < W / 2; x += 1.3) for (const zz of [D / 2, -D / 2]) { B.box(x - 0.18, x + 0.18, main.top + g.par, main.top + g.par + 0.7, zz - 0.18, zz + 0.18, pW, 'b'); } }
    return B.geometry();
  }

  // ---------- the shader ----------
  const AIR_V = window.AIR ? AIR.VERT : '\n    varying vec3 vAirT, vAirL; void air(vec3 p, float n, out vec3 T, out vec3 L) { T = vec3(1.0); L = vec3(0.0); }', AIR_F = window.AIR ? AIR.FRAG : '\n    varying vec3 vAirT, vAirL; vec3 airOver(vec3 c, vec3 T, vec3 L) { return c; }', AIR_N = window.AIR ? AIR.THING : '3.0';
  const VERT = `
    attribute vec4 aInfo;        // era, seed, style (the kit's: flags for a site, a ruin ...), how many times life size it is drawn
    attribute vec4 aPal;         // trim, shutters, door, roof tint: 24-bit colours
    attribute vec4 aRise;        // when it began to go up and when it is gone (seconds of the page's clock: a house that is built while you look
                                 // rises over some seconds, one that is pulled down goes), how far the work had come in the world's years, its height (m)
    attribute float aPart, aAO;
    uniform float uMetres, uTime, uRiseT;
    varying vec3 vN, vLN, vCol, vTrim, vShut, vDoor, vRoofT, vView, vInfo; varying vec2 vUv; varying float vPart, vAO, vY, vClip;
    ${AIR_V}
    vec3 unpack(float v) { float r = floor(v / 65536.0); float g = floor((v - r * 65536.0) / 256.0); float b = v - r * 65536.0 - g * 256.0; return vec3(r, g, b) / 255.0; }
    void main() {
      mat4 im = instanceMatrix;
      vec4 mv = modelViewMatrix * im * vec4(position, 1.0); vView = mv.xyz;
      vN = normalize(normalMatrix * (mat3(im) * normal)); vLN = normal;
      vCol = instanceColor; vTrim = unpack(aPal.x); vShut = unpack(aPal.y); vDoor = unpack(aPal.z); vRoofT = unpack(aPal.w);
      vUv = uv; vPart = aPart; vAO = aAO; vY = position.y; vInfo = aInfo.xyz;
      // going up: nothing above the line the work has reached (fragment), its height a share of the house's; gone: off the picture
      float p = min(aRise.z, clamp((uTime - aRise.x) / uRiseT, 0.0, 1.0)); vClip = p > 0.999 ? 1e5 : p * aRise.w * 1.04 - 0.02;
      air(mv.xyz, ${AIR_N}, vAirT, vAirL);
      gl_Position = uTime > aRise.y ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
    }`;
  const FRAG = `
    precision highp float;
    ${AIR_F}
    uniform vec3 uSunV, uUpV, uSunCol, uGround; uniform float uDay, uCamAlt, uTime, uSnow, uDusk, uGlow, uTexMix;
    ${window.SHADOWS ? SHADOWS.GLSL : 'const vec4 uShadowP = vec4(0.0); float sunHidden(vec3 p) { return 0.0; }'}
    varying vec3 vN, vLN, vCol, vTrim, vShut, vDoor, vRoofT, vView, vInfo; varying vec2 vUv; varying float vPart, vAO, vY, vClip;
    const vec3 LUM = vec3(0.299, 0.587, 0.114);
    #ifdef USE_TEXARR
    precision highp sampler2DArray;
    uniform sampler2DArray uWallTex, uRoofTex; uniform float uWallM[16], uRoofM[16]; uniform vec3 uWallMean[16], uRoofMean[16];
    #endif
    float h21(vec2 p) { p = mod(p, 512.0); vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
    float lines(float x, float period, float width, float px) { float f = fract(x / period); return step(f, width) * (1.0 - smoothstep(period * 0.35, period * 1.2, px)); }
    void main() {
      float P = floor(vPart + 0.5); float part = mod(P, 16.0), layer = mod(floor(P / 16.0), 16.0), aux = floor(P / 256.0);
      // going up: the timbers of a frame stand before the walls between them are filled, the roof comes last
      if (vClip < 1e4 && vY > vClip * (abs(part - 7.0) < 0.5 ? 1.7 : 1.0)) discard;
      float seed = vInfo.y, era = floor(vInfo.x + 0.5), style = floor(vInfo.z + 0.5), flags = floor(style / 1024.0);
      float isRuin = mod(floor(flags / 16.0), 2.0), isSite = mod(floor(flags / 32.0), 2.0);
      vec3 n = normalize(vN); vec2 uv = vUv; float px = max(fwidth(uv.x), fwidth(uv.y)) + 1e-4;
      vec3 col = vCol; float isRoof = 0.0, isGlass = 0.0, spec = 0.0;
      if (part < 0.5 || abs(part - 1.0) < 0.5 || abs(part - 10.0) < 0.5 || abs(part - 14.0) < 0.5) {
        // walls (the house's own, its ground storey, its chimney, its plinth): the generated material, painted as much as it takes paint
        float paint = mod(aux, 16.0) / 15.0, rot = mod(floor(aux / 16.0), 2.0), fromRoof = mod(floor(aux / 32.0), 2.0), logs = mod(floor(aux / 64.0), 2.0);
        vec2 wuv = rot > 0.5 ? uv.yx : uv;
        vec3 base = abs(part - 14.0) < 0.5 ? vec3(0.55, 0.52, 0.47) : vCol;
        col = base * (0.95 + 0.1 * vnoise(wuv * 0.8 + seed * 7.0));
        #ifdef USE_TEXARR
        { int li = int(layer + 0.5); vec3 tw; float rel;
          if (fromRoof > 0.5) { tw = texture(uRoofTex, vec3(wuv / uRoofM[li], layer)).rgb; rel = dot(tw, LUM) / max(dot(uRoofMean[li], LUM), 0.05); }
          else { tw = texture(uWallTex, vec3(wuv / uWallM[li], layer)).rgb; rel = dot(tw, LUM) / max(dot(uWallMean[li], LUM), 0.05); }
          vec3 own = tw * mix(vec3(1.0), base / max(vec3(0.2), fromRoof > 0.5 ? uRoofMean[li] : uWallMean[li]), 0.25);
          vec3 painted = base * clamp(rel, 0.6, 1.35);
          vec3 tc = mix(own, painted, paint);
          if (abs(part - 14.0) < 0.5) tc = tw * 0.82;
          col = mix(col, tc, uTexMix); }
        #endif
        if (logs > 0.5) { float lg = fract(wuv.y / 0.27); col *= 0.72 + 0.34 * sin(lg * 3.14159) - 0.18 * smoothstep(0.88, 1.0, lg) * (1.0 - smoothstep(0.1, 0.4, px)); }
        if (abs(part - 10.0) < 0.5) col *= 0.92;
      } else if (abs(part - 2.0) < 0.5 || abs(part - 11.0) < 0.5) {
        // the roof: its material tinted, its edges darker; turf greened
        isRoof = 1.0; vec3 rc = vec3(0.6, 0.42, 0.3);
        #ifdef USE_TEXARR
        { int li = int(layer + 0.5); rc = texture(uRoofTex, vec3(uv / uRoofM[li], layer)).rgb; }
        #endif
        rc *= vRoofT;
        if (mod(aux, 2.0) > 0.5) {      // (turf: a dark, mossy olive, browner where it has dried, never the green of a lawn)
          float gr = vnoise(uv * 0.9 + seed * 3.0), dry = smoothstep(0.45, 0.8, vnoise(uv * 0.35 + seed * 5.0));
          rc = mix(rc, mix(mix(vec3(0.2, 0.24, 0.12), vec3(0.3, 0.33, 0.17), gr), vec3(0.36, 0.31, 0.2), dry * 0.6), 0.8); }
        rc *= 0.9 + 0.2 * vnoise(uv * 0.15 + seed * 11.0);      // weather in patches
        col = abs(part - 11.0) < 0.5 ? rc * 0.72 : rc;
      } else if (abs(part - 3.0) < 0.5) { col = vTrim * (0.94 + 0.08 * vnoise(uv * 2.0)); }
      else if (abs(part - 4.0) < 0.5) {
        // a pane: dark, the sky in it, what crosses it (mullions, a grille, a lattice), lit at night
        isGlass = 1.0; float wseed = mod(aux, 64.0), patn = floor(aux / 64.0);
        float up = dot(n, uUpV) * 0.5 + 0.5; vec3 sky = mix(vec3(0.12, 0.14, 0.17), vec3(0.42, 0.5, 0.58), smoothstep(0.35, 0.75, up)) * uDay + vec3(0.02, 0.02, 0.03);
        col = mix(vec3(0.05, 0.055, 0.06), sky, 0.55); spec = 1.0;
        float cross = 0.0;
        if (patn > 0.5 && patn < 1.5) cross = max(step(abs(uv.x - 0.5), 0.035), step(abs(uv.y - 0.62), 0.03));
        if (patn > 1.5 && patn < 2.5) cross = step(fract(uv.x * 5.0), 0.16);
        if (patn > 2.5) { vec2 q = uv * vec2(9.0, 13.0); cross = max(step(fract(q.x + q.y), 0.22), step(fract(q.x - q.y), 0.22)) * 0.85; }
        cross *= 1.0 - smoothstep(0.02, 0.08, px);
        col = mix(col, patn > 1.5 && patn < 2.5 ? vec3(0.08) : vTrim * 0.8, cross);
        // at night a lamp behind some of them (from the Bronze Age a lamp, from the Industrial age the electric light)
        float lit = step(era >= 6.0 ? 0.42 : 0.62, h21(vec2(wseed, seed * 37.0))) * (1.0 - isRuin);
        vec3 lamp = era >= 6.0 ? vec3(1.0, 0.82, 0.55) : vec3(1.0, 0.6, 0.28);
        col += lamp * lit * (1.0 - uDay) * (era >= 6.0 ? 0.85 : 0.5) * (1.0 - cross * 0.8) * (1.0 + 1.5 * uGlow);
      }
      else if (abs(part - 5.0) < 0.5) { col = vDoor * (0.85 + 0.2 * lines(uv.x, 0.18, 0.12, px) * 0.0 + 0.15 * vnoise(vec2(uv.x * 9.0, uv.y))); col *= 1.0 - 0.25 * lines(uv.x, 0.2, 0.08, px); }
      else if (abs(part - 6.0) < 0.5) { col = vShut * (0.9 + 0.1 * vnoise(uv * 5.0)); col *= 1.0 - 0.3 * lines(uv.y, 0.09, 0.3, px); }
      else if (abs(part - 7.0) < 0.5) { float k = fract(seed * 13.7); col = mix(vec3(0.22, 0.16, 0.11), vec3(0.36, 0.27, 0.18), k) * (0.85 + 0.25 * vnoise(vec2(uv.x * 0.6, uv.y * 6.0))); }
      else if (abs(part - 8.0) < 0.5) { col = mix(vec3(0.74, 0.71, 0.65), vCol, 0.25) * (0.9 + 0.12 * vnoise(uv * 3.0)); }
      else if (abs(part - 9.0) < 0.5) { col = vec3(0.1, 0.1, 0.11); spec = 0.4; }
      else if (abs(part - 12.0) < 0.5) { col = mix(vShut, vec3(0.92, 0.9, 0.85), step(0.5, fract(uv.x / 0.5))) * 0.95; }
      else if (abs(part - 13.0) < 0.5) { col = mix(vTrim, vec3(0.35, 0.3, 0.26), 0.4) * 0.8; }
      else { col = vec3(0.3, 0.42, 0.2) * (0.8 + 0.4 * vnoise(uv * 2.0)); }
      // a building going up: bare stuff, dust (the fresh courses at the line the work has reached rawest); a ruin: weathered and mossy
      if (isSite > 0.5) { col = mix(col, vec3(0.62, 0.56, 0.47), 0.45 + 0.4 * isRoof); }
      if (vClip < 1e4) { float raw = smoothstep(2.4, 0.0, vClip - vY); col = mix(col, vec3(dot(col, LUM)) * vec3(1.04, 1.0, 0.94) + 0.07, 0.25 + 0.3 * raw); }
      if (isRuin > 0.5) { col = mix(col, vec3(0.42, 0.4, 0.34), 0.5); col = mix(col, vec3(0.3, 0.38, 0.2), smoothstep(1.0, 0.0, vY) * 0.5); }
      // snow lies on the roofs and on what is flat
      if (uSnow > 0.01) { float flatUp = smoothstep(0.35, 0.7, dot(vLN, vec3(0.0, 1.0, 0.0))); col = mix(col, vec3(0.9, 0.92, 0.96), uSnow * flatUp * 0.92 * smoothstep(0.25, 0.55, vnoise(uv * 0.35 + seed * 9.0) + uSnow * 0.5)); }
      // light: the sky and the ground's bounce, the sun (and what stands between), the eaves' and the corners' shade
      float diff = max(dot(n, uSunV), 0.0);
      diff *= 1.0 - sunHidden(vView + n * uShadowP.w * 2.5);
      float sky = 0.5 + 0.5 * dot(n, uUpV);
      vec3 amb = mix(vec3(0.25, 0.31, 0.49) * (0.7 + 0.5 * sky), vec3(0.33, 0.34, 0.37) * (0.45 + 0.75 * sky) + uGround * (1.0 - sky) * (0.3 + 0.7 * max(dot(uUpV, uSunV), 0.0)) * 0.62, uDay) + vec3(0.27, 0.19, 0.20) * uDusk * (0.5 + 0.6 * sky);
      vec3 lit = col * (amb + diff * 0.95 * uSunCol) * vAO;
      if (spec > 0.0) { vec3 v = normalize(-vView); vec3 h = normalize(uSunV + v); lit += uSunCol * pow(max(dot(n, h), 0.0), 60.0) * 0.35 * spec * uDay; }
      { vec3 x = max(lit - 0.78, 0.0) / 0.22; vec3 e = exp(-2.0 * x); lit = mix(lit, 0.78 + 0.22 * (1.0 - e) / (1.0 + e), step(0.78, lit)); }
      gl_FragColor = vec4(airOver(lit, vAirT, vAirL), 1.0);
    }`;

  // ---------- the library of meshes: one geometry per type and level of detail, made when first asked for ----------
  const geoms = new Map(); let made = 0;
  function geometry(g, lod) { const key = g.id + '/' + lod; let x = geoms.get(key); if (!x) { x = build(g, lod); x.userData.key = key; geoms.set(key, x); made++; } return x; }
  // the footprint and height of a type (metres, round its origin): what the planner fits to a plot
  function bounds(g) { const x = geometry(g, 2); const b = x.boundingBox; return { x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z, h: b.max.y }; }
  window.HOUSES = { PART, build, geometry, bounds, VERT, FRAG, has: (g, lod) => geoms.has(g.id + '/' + lod), stats: () => ({ geoms: geoms.size, made }), drop: (key) => { const x = geoms.get(key); if (x) { x.dispose(); geoms.delete(key); } } };
})();
