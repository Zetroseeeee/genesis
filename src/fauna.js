// GENESIS fauna: the beasts of the land, wild and kept. Herds of the wild beasts of each kind of land and age - mammoths, reindeer
// and musk oxen at the edge of the ice in the first millennia, bison and wild horses on the steppe and the prairie, aurochs and deer
// in the woods, zebra, wildebeest and elephants on the savanna, guanacos in the Andes - thinning where people live; and the herds of
// those who keep them (cattle, sheep and goats from the first herders, horses once they are tamed, camels in the dry lands, water
// buffalo where rice grows, yaks on the high plateaus, llamas in the Andes, reindeer in the far north) in the country about their
// towns. Drawn near the eye, at the place's own scale as its townsfolk and its hosts are; grazing heads down, now and then walking a
// little way to better grass, the herd drifting over the days. Pure drawing: the simulation knows nothing of them.
// Classic script; exposes window.FAUNA.
(function () {
  const R_M = 6371000, D2R = Math.PI / 180, W = 720, H = 360;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function hash(i, k) { let h = (i * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  const K_OPEN = 9;          // open country is drawn this many times life size (as the hosts are: troops.js); near a town, the town's own
  const SLOT = 0.022;        // a herd's place: a lattice of the world's, about two and a half kilometres (degrees of latitude)
  const REACH = 13;          // kilometres from what the eye looks at within which herds are kept
  const CAP = 700;           // beasts of one kind drawn at most

  // ---------- the beasts: true size (body length L, shoulder S, metres), colours, shape ----------
  // tusk, trunk, hump, horns (h: forward, b: back and out), antlers, ears, wool (a rounder body), stripes, long neck (neckUp), tail
  const SP = {
    mammoth:   { L: 4.6, S: 3.1, w: 0.42, col: [0x4b3423, 0x3e2b1d, 0x5a4029], tusk: 1.3, trunk: 1, hump: 0.5, hair: 1, neck: 0.07, head: 1.15, n: [3, 8] },
    elephant:  { L: 5.0, S: 3.0, w: 0.4, col: [0x77716b, 0x6b6660, 0x807a72], tusk: 0.8, trunk: 1, ears: 1, neck: 0.06, head: 1.1, n: [4, 10] },
    bison:     { L: 3.0, S: 1.8, w: 0.36, col: [0x3d2a1b, 0x45301f, 0x33241a], hump: 0.6, horns: 'h', hair: 1, neck: 0.2, head: 0.9, low: 1, n: [8, 26] },
    muskox:    { L: 2.2, S: 1.35, w: 0.42, col: [0x2b2119, 0x33281e], hump: 0.3, horns: 'b', hair: 1, neck: 0.18, head: 0.85, low: 1, n: [6, 14] },
    yak:       { L: 2.8, S: 1.65, w: 0.38, col: [0x231c17, 0x2e241c, 0x5a4a3c], hump: 0.4, horns: 'h', hair: 1, neck: 0.2, head: 0.9, low: 1, n: [4, 10] },
    aurochs:   { L: 3.0, S: 1.75, w: 0.33, col: [0x2a1f17, 0x3a2a1c, 0x5c3f27], horns: 'h', neck: 0.3, head: 0.9, n: [4, 10] },
    cattle:    { L: 2.4, S: 1.4, w: 0.34, col: [0x6e4a2e, 0x2a221d, 0xd8d0c2, 0x8c5a32, 0xb9a88f], horns: 'h', neck: 0.3, head: 0.85, piebald: 1, n: [6, 16] },
    buffalo:   { L: 2.7, S: 1.5, w: 0.36, col: [0x3a3a3c, 0x2f3031, 0x46464a], horns: 'b', neck: 0.3, head: 0.9, low: 1, n: [4, 9] },
    horse:     { L: 2.2, S: 1.5, w: 0.27, col: [0x7a5235, 0x5a3a24, 0x3a2a20, 0x9b7a55, 0xc9b8a0], neck: 0.45, neckUp: 0.95, head: 0.75, mane: 1, tail: 0.75, n: [4, 12] },
    zebra:     { L: 2.2, S: 1.35, w: 0.27, col: [0xe8e4dc], neck: 0.42, neckUp: 0.9, head: 0.7, stripes: 1, mane: 1, tail: 0.6, n: [8, 20] },
    wildebeest:{ L: 2.2, S: 1.4, w: 0.28, col: [0x52504c, 0x47443f, 0x5c5850], hump: 0.25, horns: 'b', neck: 0.35, head: 0.8, mane: 1, n: [14, 36] },
    reindeer:  { L: 1.9, S: 1.15, w: 0.27, col: [0x837a6c, 0x6f6658, 0x9a9182, 0xcfc8bb], antlers: 1, neck: 0.42, neckUp: 0.75, head: 0.65, n: [10, 28] },
    deer:      { L: 1.9, S: 1.2, w: 0.24, col: [0x8c5a34, 0x7a4e2e, 0x9b6a40], antlers: 1, neck: 0.45, neckUp: 0.85, head: 0.6, n: [3, 8] },
    camel:     { L: 2.8, S: 2.0, w: 0.28, col: [0xb38a5a, 0xa47b4c, 0xc49a68], hump: 0.9, neck: 0.5, neckUp: 0.55, head: 0.65, tail: 0.5, n: [3, 8] },
    llama:     { L: 1.6, S: 1.15, w: 0.27, col: [0xd8cbb4, 0x8a6a4a, 0xece6da, 0x5a4636], neck: 0.5, neckUp: 1.25, head: 0.45, wool: 1, n: [5, 14] },
    sheep:     { L: 1.3, S: 0.8, w: 0.36, col: [0xdcd5c6, 0xe6e0d2, 0xcfc6b4, 0x3a3430], wool: 1, darkHead: 1, neck: 0.2, head: 0.4, n: [14, 38] },
    goat:      { L: 1.25, S: 0.8, w: 0.26, col: [0x6e5a46, 0xd8d0c2, 0x3a302a, 0x9b8064], horns: 'b', neck: 0.3, neckUp: 0.6, head: 0.42, n: [5, 14] },
  };
  const KINDS = Object.keys(SP);

  // a quadruped of boxes, forward +x, up +y, its side z; aPart: x what it is (0 body, 1 head and neck, 2..5 legs: the front left,
  // front right, hind left, hind right), y and z the joint it turns about (height, place along the body), w its shade (1 the coat,
  // 0.55 legs and hooves, 1.15 a lighter belly or wool, 2 ivory, 3 horn, 4 the striped coat, 5 a dark face)
  function beastGeometry(o) {
    const pos = [], nor = [], part = [];
    const box = (cx, cy, cz, sx, sy, sz, id, py, px, shade, taper) => {
      const hx = sx / 2, hy = sy / 2, hz = sz / 2, t = taper === undefined ? 1 : taper;
      const c = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [-hx * t, hy, -hz * t], [hx * t, hy, -hz * t], [hx * t, hy, hz * t], [-hx * t, hy, hz * t]];
      const faces = [[0, 1, 2, 3, 0, -1, 0], [7, 6, 5, 4, 0, 1, 0], [4, 5, 1, 0, 0, 0, -1], [6, 7, 3, 2, 0, 0, 1], [5, 6, 2, 1, 1, 0, 0], [7, 4, 0, 3, -1, 0, 0]];
      for (const f of faces) for (const k of [0, 1, 2, 0, 2, 3]) { const v = c[f[k]]; pos.push(cx + v[0], cy + v[1], cz + v[2]); nor.push(f[4], f[5], f[6]); part.push(id, py, px, shade); }
    };
    const L = o.L, S = o.S, Wd = L * o.w, legH = S * (o.hair ? 0.5 : 0.58), bodyH = (S - legH) * (o.wool ? 1.25 : 1.1), bx = 0;
    const bodyY = legH + bodyH / 2 - (o.wool ? bodyH * 0.1 : 0);
    const coat = o.stripes ? 4 : 1;
    // the body, a little deeper at the shoulder; the belly lighter; a hump over the shoulders
    box(bx, bodyY, 0, L * 0.82, bodyH, Wd, 0, 0, 0, coat, 0.92);
    box(bx, legH + bodyH * 0.08, 0, L * 0.7, bodyH * 0.2, Wd * 0.9, 0, 0, 0, o.stripes ? 4 : 1.12);
    if (o.hump) box(bx + L * (o.L > 2.6 && !o.trunk ? 0.05 : 0.18), legH + bodyH + bodyH * 0.18 * o.hump, 0, L * 0.34, bodyH * 0.45 * o.hump, Wd * 0.8, 0, 0, 0, coat, 0.55);
    if (o.hair) box(bx + L * 0.1, legH + bodyH * 0.05, 0, L * 0.6, bodyH * 0.35, Wd * 1.04, 0, 0, 0, 1, 1.0);      // the long coat hanging below the belly
    // legs, each turning at its hip
    const lt = Math.max(0.11, L * (o.trunk ? 0.11 : 0.07)), fx = L * 0.3, hx = -L * 0.3, lz = Wd * 0.32;
    const legs = [[fx, -lz, 2], [fx, lz, 3], [hx, -lz, 4], [hx, lz, 5]];
    for (const [x, z, id] of legs) { box(x, legH / 2 + 0.02, z, lt, legH + 0.04, lt, id, legH, x, 0.62); box(x, 0.05, z, lt * 1.1, 0.1, lt * 1.1, id, legH, x, 0.4); }
    // neck and head, turning down at the shoulders to graze
    const nx = L * 0.37, ny = legH + bodyH * 0.6, nl = o.neck * L, up = o.neckUp === undefined ? (o.low ? -0.25 : 0.35) : o.neckUp;
    const ex = nx + Math.cos(up) * nl, ey = ny + Math.sin(up) * nl;      // where the neck ends and the head begins
    const segs = 3; for (let s = 0; s < segs; s++) { const f0 = s / segs, f1 = (s + 1) / segs, x = nx + Math.cos(up) * nl * (f0 + f1) / 2, y = ny + Math.sin(up) * nl * (f0 + f1) / 2; box(x, y, 0, Math.max(nl / segs * 1.25, bodyH * 0.45), bodyH * (o.trunk ? 0.75 : 0.42), Wd * (o.trunk ? 0.7 : 0.42), 1, ny, nx, coat); }
    if (o.mane) box(nx + Math.cos(up) * nl * 0.5 - 0.05, ny + Math.sin(up) * nl * 0.5 + bodyH * 0.24, 0, nl * 0.9, bodyH * 0.14, Wd * 0.12, 1, ny, nx, 0.45);
    const hl = o.head * (o.trunk ? 0.55 : 0.32) * L * 0.5 + 0.1, hh = bodyH * (o.trunk ? 0.75 : 0.5), hw = Wd * (o.trunk ? 0.62 : 0.45);
    const hx0 = ex + hl * 0.35, hy0 = ey - (o.low ? hh * 0.1 : hh * 0.15);
    box(hx0, hy0, 0, hl, hh, hw, 1, ny, nx, o.darkHead ? 5 : coat, 0.85);
    box(hx0 + hl * 0.55, hy0 - hh * 0.2, 0, hl * 0.35, hh * 0.55, hw * 0.75, 1, ny, nx, o.darkHead ? 5 : (o.stripes ? 5 : coat));      // the muzzle
    if (o.trunk) { box(hx0 + hl * 0.65, hy0 - hh * 0.75, 0, hl * 0.3, hh * 1.3, hw * 0.3, 1, ny, nx, 1, 0.7); box(hx0 + hl * 0.72, hy0 - hh * 1.45, 0, hl * 0.22, hh * 0.35, hw * 0.25, 1, ny, nx, 1); }
    if (o.tusk) for (const z of [-hw * 0.3, hw * 0.3]) { box(hx0 + hl * 0.7, hy0 - hh * 0.45, z, hl * 0.9 * o.tusk, hh * 0.12, hh * 0.12, 1, ny, nx, 2); box(hx0 + hl * (0.7 + 0.5 * o.tusk), hy0 - hh * 0.2, z, hl * 0.12, hh * 0.45 * o.tusk, hh * 0.11, 1, ny, nx, 2); }
    if (o.ears) for (const z of [-hw * 0.62, hw * 0.62]) box(hx0 - hl * 0.15, hy0 + hh * 0.05, z, hl * 0.5, hh * 0.9, hw * 0.12, 1, ny, nx, 1.05);
    if (o.horns === 'h') for (const z of [-1, 1]) { box(hx0 - hl * 0.2, hy0 + hh * 0.55, z * hw * 0.62, hl * 0.18, hh * 0.18, hw * 0.55, 1, ny, nx, 3); box(hx0 - hl * 0.05, hy0 + hh * 0.75, z * hw * 0.88, hl * 0.14, hh * 0.35, hl * 0.12, 1, ny, nx, 3); }
    if (o.horns === 'b') for (const z of [-1, 1]) box(hx0 - hl * 0.35, hy0 + hh * 0.5, z * hw * 0.45, hl * 0.55, hh * 0.16, hw * 0.3, 1, ny, nx, 3);
    if (o.antlers) for (const z of [-1, 1]) { box(hx0 - hl * 0.15, hy0 + hh * 0.9, z * hw * 0.5, hl * 0.12, hh * 1.3, hl * 0.12, 1, ny, nx, 3); box(hx0 - hl * 0.05, hy0 + hh * 1.45, z * hw * 0.85, hl * 0.6, hh * 0.12, hw * 0.5, 1, ny, nx, 3); box(hx0 + hl * 0.1, hy0 + hh * 1.2, z * hw * 0.7, hl * 0.1, hh * 0.5, hl * 0.1, 1, ny, nx, 3); }
    // tail
    const tl = (o.tail || 0.3) * S * 0.6; box(-L * 0.44, legH + bodyH * 0.55 - tl * 0.45, 0, L * 0.05 + 0.04, tl, Wd * 0.12, 0, 0, 0, o.mane ? 0.45 : coat);
    // how far the head goes down to graze: until the muzzle is at the grass (an elephant's trunk does the reaching)
    let graze = -0.25;
    if (!o.trunk) { const mx = hx0 + hl * 0.72 - nx, my = hy0 - hh * 0.48 - ny, r = Math.hypot(mx, my), f0 = Math.atan2(my, mx), sn = (0.12 - ny) / r;
      graze = Math.max(-2.3, (Math.abs(sn) < 0.97 ? Math.asin(sn) : -1.33) - f0); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 4));
    g.setAttribute('aGrz', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(graze), 1)); g.userData.graze = graze;
    return g;
  }

  const AIR_V = window.AIR ? AIR.VERT : '\n    varying vec3 vAirT, vAirL; void air(vec3 p, float n, out vec3 T, out vec3 L) { T = vec3(1.0); L = vec3(0.0); }', AIR_F = window.AIR ? AIR.FRAG : '\n    varying vec3 vAirT, vAirL; vec3 airOver(vec3 c, vec3 T, vec3 L) { return c; }', AIR_N = window.AIR ? AIR.THING : '3.0';
  const VERT = `
    attribute vec4 aPart; attribute vec2 aWalk; attribute float aGrz;      // aWalk: where it is in its stride, how much it walks (0 grazing, 1 walking)
    uniform float uTime; varying vec3 vN, vCol, vView, vLocal; varying float vShade;
    ${AIR_V}
    vec2 turn(vec2 q, float a) { float c = cos(a), s = sin(a); return vec2(q.x * c - q.y * s, q.x * s + q.y * c); }
    void main() {
      vec3 p = position, n = normal; float id = aPart.x, walk = aWalk.y;
      float ph = uTime * 6.0 + aWalk.x * 6.2832;
      if (id > 1.5) {
        // a walk: each leg swings at its hip, the diagonal pairs together
        float sgn = (id < 2.5 || id > 4.5) ? 1.0 : -1.0; float a = sin(ph) * 0.42 * walk * sgn;
        vec2 piv = vec2(aPart.z, aPart.y); p.xy = piv + turn(p.xy - piv, a); n.xy = turn(n.xy, a);
      } else if (id > 0.5) {
        // grazing, the head goes down to the grass and comes up now and then
        float g = (1.0 - walk) * (0.62 + 0.38 * smoothstep(-0.3, 0.6, sin(uTime * 0.55 + aWalk.x * 23.0))); float a = aGrz * g + 0.06 * sin(ph) * walk;
        vec2 piv = vec2(aPart.z, aPart.y); p.xy = piv + turn(p.xy - piv, a); n.xy = turn(n.xy, a);
      }
      p.y += abs(sin(ph)) * 0.035 * walk * aPart.y;
      vShade = aPart.w; vCol = instanceColor; vLocal = position;
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0); vView = mv.xyz;
      vN = normalize(normalMatrix * (mat3(instanceMatrix) * n));
      air(mv.xyz, ${AIR_N}, vAirT, vAirL);
      gl_Position = projectionMatrix * mv;
    }`;
  const FRAG = `
    precision highp float; uniform vec3 uSunV, uUpV, uSunCol; uniform float uDay, uDusk, uSnow;
    varying vec3 vN, vCol, vView, vLocal; varying float vShade;
    ${AIR_F}
    ${window.SHADOWS ? SHADOWS.GLSL : 'float sunHidden(vec3 p) { return 0.0; }'}
    void main() {
      vec3 n = normalize(vN); vec3 col = vCol;
      if (vShade > 4.5) col = vec3(0.13, 0.11, 0.1);                                                   // a dark face
      else if (vShade > 3.5) col = mix(vec3(0.9, 0.88, 0.84), vec3(0.08), step(0.5, fract(vLocal.x * 3.2 + vLocal.y * 1.1)));      // the zebra's stripes
      else if (vShade > 2.5) col = vec3(0.62, 0.58, 0.5);                                             // horn and antler
      else if (vShade > 1.5) col = vec3(0.86, 0.82, 0.7);                                             // ivory
      else col *= vShade;
      float diff = max(dot(n, uSunV), 0.0) * (1.0 - sunHidden(vView + n * 0.2)), sky = 0.5 + 0.5 * dot(n, uUpV);
      vec3 amb = mix(vec3(0.25, 0.31, 0.49) * (0.7 + 0.5 * sky), vec3(0.32, 0.34, 0.38) * (0.45 + 0.75 * sky) + vec3(0.27, 0.22, 0.155) * (1.0 - sky), uDay) + vec3(0.27, 0.19, 0.20) * uDusk * (0.5 + 0.6 * sky);
      vec3 lit = col * (amb + diff * 0.82 * uSunCol);
      gl_FragColor = vec4(airOver(lit, vAirT, vAirL), 1.0);
    }`;

  // a beast's shadow: the instance's x is half its length, z half its width, y the height of its body (all as drawn); the quad covers
  // the footprint swept away from the sun to where the body's shadow falls, and the fragment keeps what lies within the swept outline
  const SH_VERT = `
    uniform vec3 uSunV; varying vec2 vQ, vS; varying vec3 vView;
    void main() {
      mat4 mvi = modelViewMatrix * instanceMatrix;
      vec3 c = (mvi * vec4(0.0, 0.0, 0.0, 1.0)).xyz, fw = (mvi * vec4(1.0, 0.0, 0.0, 0.0)).xyz, sd = (mvi * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
      vec3 up = (mvi * vec4(0.0, 1.0, 0.0, 0.0)).xyz; float h = length(up); vec3 upN = up / h;
      float se = max(dot(uSunV, upN), 0.12); vec3 dH = -(uSunV - upN * dot(uSunV, upN)); float cl = length(dH);
      vec3 w = cl > 1e-4 ? dH / cl * min(h * cl / se, 5.0 * h) : vec3(0.0);
      vec2 s = vec2(dot(w, fw) / dot(fw, fw), dot(w, sd) / dot(sd, sd));
      vec2 lo = min(vec2(0.0), s) - 1.1, hi = max(vec2(0.0), s) + 1.1, q = mix(lo, hi, position.xy + 0.5);
      vec3 p = c + fw * q.x + sd * q.y + upN * 0.04 * h;
      vQ = q; vS = s; vView = p;
      gl_Position = projectionMatrix * vec4(p, 1.0);
    }`;
  const SH_FRAG = `
    precision highp float; uniform float uDay; varying vec2 vQ, vS; varying vec3 vView;
    ${window.SHADOWS ? SHADOWS.GLSL : 'float sunHidden(vec3 p) { return 0.0; }'}
    void main() {
      float t = clamp(dot(vQ, vS) / max(dot(vS, vS), 1e-6), 0.0, 1.0); float d = length(vQ - vS * t) / mix(0.75, 1.0, smoothstep(0.0, 0.6, t));
      float a = (1.0 - smoothstep(0.6, 1.0, d)) * 0.45 * uDay * (1.0 - sunHidden(vView));
      if (a < 0.01) discard;
      gl_FragColor = vec4(0.03, 0.035, 0.05, a);
    }`;

  // ---------- which beasts, where and when ----------
  // the continent of a place, roughly: 0 Eurasia, 1 Africa, 2 the Americas (north of the isthmus), 3 South America, 4 Australia
  function continent(lon, lat) {
    if (lon < -30) return lat > 9 ? 2 : 3;
    if (lon > 110 && lat < -10 && lon < 156) return 4;
    if (lat < 36 && lon > -20 && lon < 52 && !(lon > 34 && lat > 12)) return 1;      // (Arabia stays with Eurasia)
    return 0;
  }
  const L_TUNDRA = 2, L_BOREAL = 3, L_DESERT = 4, L_STEPPE = 5, L_GRASS = 6, L_OCWOOD = 7, L_MEDIT = 8, L_MONSOON = 9, L_SAVANNA = 10, L_RAIN = 11, L_HIGH = 12, L_PLATEAU = 13, L_COWOOD = 14, L_TASIA = 15;
  // the wild: [kind, weight] for a kind of land, a continent and a year (the mammoths go between 9000 and 7500 BC; the aurochs in AD 1627)
  function wildOf(cls, ct, year) {
    const mam = year < -7500 ? clamp((-7500 - year) / 1500, 0, 1) : 0, aur = year < 1600 ? 1 : 0;
    const bis = year < 1850 ? 1 : year < 1890 ? (1890 - year) / 40 + 0.03 : 0.03;      // the bison of the plains were shot out in forty years
    if (ct === 4) return null;
    if (ct === 2) {
      if (cls === L_GRASS || cls === L_STEPPE) return [['bison', bis], ['mammoth', 0.25 * mam], ['deer', 0.15]];
      if (cls === L_TUNDRA) return [['reindeer', 1], ['muskox', 0.35], ['mammoth', 0.25 * mam]];
      if (cls === L_BOREAL) return [['reindeer', 0.5], ['deer', 0.7]];
      if (cls === L_OCWOOD || cls === L_COWOOD || cls === L_MEDIT) return [['deer', 1], ['bison', 0.2 * bis]];
      if (cls === L_DESERT || cls === L_HIGH || cls === L_PLATEAU) return [['deer', 0.4]];
      return [['deer', 0.4]];
    }
    if (ct === 3) {
      if (cls === L_HIGH || cls === L_PLATEAU || cls === L_STEPPE || cls === L_DESERT) return [['llama', 1]];
      return [['deer', 0.5]];
    }
    if (ct === 1) {
      if (cls === L_SAVANNA || cls === L_GRASS || cls === L_STEPPE) return [['wildebeest', 1], ['zebra', 0.9], ['elephant', 0.35]];
      if (cls === L_RAIN || cls === L_TASIA || cls === L_MONSOON) return [['elephant', 0.4]];
      if (cls === L_DESERT) return [['deer', 0.15]];
      return [['deer', 0.5], ['zebra', 0.2]];
    }
    // Eurasia
    if (cls === L_TUNDRA) return [['reindeer', 1], ['muskox', 0.3 * (year < -6000 ? 1 : 0.2)], ['mammoth', 0.3 * mam]];
    if (cls === L_BOREAL) return [['reindeer', 0.6], ['deer', 0.7]];
    if (cls === L_STEPPE) return [['horse', 0.9], ['bison', 0.35 * (year < -3000 ? 1 : 0.2)], ['deer', 0.3], ['mammoth', 0.15 * mam]];
    if (cls === L_GRASS) return [['horse', 0.7], ['aurochs', 0.45 * aur], ['bison', 0.3]];
    if (cls === L_OCWOOD || cls === L_COWOOD) return [['deer', 1], ['aurochs', 0.4 * aur], ['bison', 0.15]];
    if (cls === L_MEDIT) return [['deer', 0.6], ['goat', 0.4], ['aurochs', 0.25 * aur]];
    if (cls === L_DESERT) return [['camel', 0.35], ['deer', 0.2]];
    if (cls === L_PLATEAU) return [['yak', 0.8], ['goat', 0.4]];
    if (cls === L_MONSOON || cls === L_TASIA || cls === L_RAIN) return [['elephant', 0.35], ['buffalo', 0.45], ['deer', 0.5]];
    if (cls === L_SAVANNA) return [['elephant', 0.3], ['deer', 0.5], ['buffalo', 0.3]];
    if (cls === L_HIGH) return [['goat', 0.5], ['deer', 0.3]];
    return [['deer', 0.4]];
  }
  // what a people keeps: by its land, its continent, what it knows (herding; horses once tamed) and whether the old world's beasts
  // have come to it (the Americas from the Industrial age, as the ships brought them)
  function keptOf(cls, ct, horse, era) {
    const H = horse ? 0.45 : 0;
    if (ct === 4) return era >= 6 ? [['sheep', 1], ['cattle', 0.6]] : null;
    if (ct === 2 || ct === 3) {
      if (cls === L_HIGH || cls === L_PLATEAU) return era >= 6 ? [['llama', 1], ['sheep', 0.5], ['cattle', 0.4]] : [['llama', 1]];
      return era >= 6 ? [['cattle', 1], ['horse', 0.4], ['sheep', 0.4]] : null;
    }
    if (cls === L_TUNDRA || cls === L_BOREAL) return [['reindeer', 1], ['cattle', cls === L_BOREAL ? 0.3 : 0]];
    if (cls === L_DESERT) return era >= 2 ? [['camel', 1], ['goat', 0.6], ['sheep', 0.4]] : [['goat', 1], ['sheep', 0.6]];
    if (cls === L_STEPPE) return [['sheep', 1], ['horse', H * 2], ['cattle', 0.4], ['camel', era >= 2 && ct === 0 ? 0.25 : 0]];
    if (cls === L_PLATEAU) return [['yak', 1], ['sheep', 0.6], ['goat', 0.4]];
    if (cls === L_MONSOON || cls === L_TASIA) return [['buffalo', 0.8], ['cattle', 0.8], ['goat', 0.3]];
    if (cls === L_SAVANNA) return [['cattle', 1], ['goat', 0.6], ['sheep', 0.4]];
    if (cls === L_RAIN) return [['goat', 0.6], ['cattle', 0.3]];
    if (cls === L_MEDIT || cls === L_HIGH) return [['sheep', 1], ['goat', 0.8], ['cattle', 0.5], ['horse', H]];
    return [['cattle', 1], ['sheep', 0.8], ['goat', 0.3], ['horse', H]];
  }
  const pick = (list, u) => { if (!list) return null; let s = 0; for (const e of list) s += e[1]; if (s <= 0) return null; let x = u * s; for (const e of list) { x -= e[1]; if (x <= 0 && e[1] > 0) return e[0]; } return null; };

  class Fauna {
    constructor({ scene, terrain, world }) {
      this.scene = scene; this.terrain = terrain; this.world = world; this.exag = terrain.exag; this.enabled = true;
      const bu = world.bUniforms; this.uni = { uSunV: bu.uSunV, uUpV: bu.uUpV, uDay: bu.uDay, uSunCol: bu.uSunCol, uDusk: bu.uDusk, uSnow: bu.uSnow, uTime: { value: 0 } };
      if (window.AIR) Object.assign(this.uni, AIR.uniforms); if (window.SHADOWS) Object.assign(this.uni, SHADOWS.uniforms);
      const mat = new THREE.ShaderMaterial({ uniforms: this.uni, vertexShader: VERT, fragmentShader: FRAG });
      this.inst = {};
      for (const k of KINDS) {
        const g = beastGeometry(SP[k]); const walk = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 2), 2); walk.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aWalk', walk);
        const m = new THREE.InstancedMesh(g, mat, CAP); m.count = 0; m.visible = false; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
        scene.add(m); this.inst[k] = { mesh: m, walk };
      }
      // their shadows: the body's own outline cast on the ground away from the sun (a capsule from the feet to where the body's falls)
      { const su = { uSunV: bu.uSunV, uDay: bu.uDay }; if (window.SHADOWS) Object.assign(su, SHADOWS.uniforms);
        this.smat = new THREE.ShaderMaterial({ uniforms: su, vertexShader: SH_VERT, fragmentShader: SH_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
        this.shadow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.smat, CAP * 4); this.shadow.count = 0; this.shadow.visible = false; this.shadow.frustumCulled = false; this.shadow.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(this.shadow); }
      this.herds = []; this.last = { lon: 999, lat: 999, t: -1e9, yr: -1e9 }; this._m = new THREE.Matrix4(); this._vc = null; this._vcV = -1; this.stats = { herds: 0, beasts: 0 };
    }
    // the herds about the eye: a lattice of the world's places, each hashed to a herd or none by what lives there
    respawn(cam, sim) {
      const T = this.terrain, yr = sim.year, cl0 = Math.max(0.2, Math.cos(cam.lat * D2R));
      const dLat = REACH / 111, dLon = dLat / cl0; const old = new Map(); for (const h of this.herds) old.set(h.key, h);
      const herds = []; const vc = this._vc || (this._vc = new Map()); const KH = sim.know && sim.know.ID ? sim.know.ID.herding : -1, KHo = sim.know && sim.know.ID ? sim.know.ID.horse : -1;
      const j0 = Math.floor((cam.lat - dLat) / SLOT), j1 = Math.ceil((cam.lat + dLat) / SLOT);
      for (let j = j0; j <= j1; j++) {
        const lat0 = j * SLOT, sl = SLOT / Math.max(0.2, Math.cos(lat0 * D2R)); const i0 = Math.floor((cam.lon - dLon) / sl), i1 = Math.ceil((cam.lon + dLon) / sl);
        for (let i = i0; i <= i1; i++) {
          const key = j * 100003 + i; const u = hash(key, 17); if (u > 0.55) continue;      // (most places have no herd at any one time)
          const lat = lat0 + (hash(key, 23) - 0.5) * SLOT * 0.8, lon = i * sl + (hash(key, 29) - 0.5) * sl * 0.8; if (lat > 84 || lat < -60) continue;
          if (GEO.distKm(cam.lon, cam.lat, lon, lat) > REACH) continue;
          const cell = Math.floor((90 - lat) / 180 * H) * W + (((Math.floor((lon + 180) / 360 * W)) % W) + W) % W; if (!sim.land[cell]) continue;
          if (sim.iced && sim.iced(cell)) continue;
          if (T.isWater && T.isWater(lon, lat)) continue;
          const cls = sim.landClass ? sim.landClass(cell) : -1; if (cls <= 1) continue;
          const o = sim.owner[cell], cv = o >= 0 ? sim.civs[o] : null, p = sim.pop[cell] || 0, ct = continent(lon, lat);
          // keepers: a realm that herds, where its people live; the wild: where few do
          const knows = cv && KH >= 0 && sim.know.has[o * sim.know.ND + KH];
          let kind = null, kept = false;
          if (knows && p > 0.3 && hash(key, 31) < clamp(p / 4, 0.25, 0.85)) { kind = pick(keptOf(cls, ct, KHo >= 0 && sim.know.has[o * sim.know.ND + KHo], cv.era | 0), hash(key, 37)); kept = !!kind; }
          if (!kind) { const wildP = (1 - clamp(p / 3, 0, 1)) * (cv ? (cv.era >= 6 ? 0.15 : cv.era >= 3 ? 0.5 : 0.8) : 1); if (hash(key, 41) < wildP) kind = pick(wildOf(cls, ct, yr), hash(key, 43)); }
          if (!kind) continue;
          // not in a town: the built-up ground of the region's town and its neighbours'
          let inTown = false, k = K_OPEN;
          for (let dy = -1; dy <= 1 && !inTown; dy++) for (let dx = -1; dx <= 1 && !inTown; dx++) {
            const cy = Math.floor(cell / W) + dy; if (cy < 0 || cy >= H) continue; const c2 = cy * W + ((cell % W) + dx + W) % W; if (!sim.level[c2]) continue; const tc = sim.civs[sim.owner[c2]]; if (!tc) continue;
            const [sLon, sLat] = TOWN.siteOf(sim, c2, tc, T, this.decal), R = TOWN.radiusM(sim, c2, tc), d = GEO.distKm(lon, lat, sLon, sLat) * 1000;
            if (d < R * 1.15) inTown = true; else { const kT = TOWN.scaleOf(TOWN.radiusTrue(sim, c2, tc)), f = 1 - clamp((d - R * 1.4) / (R * 1.4), 0, 1); if (f > 0 && kT > k) k = K_OPEN + (kT - K_OPEN) * f * f * (3 - 2 * f); }
          }
          if (inTown) continue;
          const prev = old.get(key);
          if (prev && prev.kind === kind) { prev.k = k; herds.push(prev); continue; }
          herds.push(this.herd(key, kind, kept, lon, lat, k));
        }
      }
      // herds asked for by hand (the scenes, the tests): { kind, lon, lat, n, k }
      for (const e of this.extra || []) { const key = -1 - Math.round((e.lon + 180) * 1e4) * 7 - Math.round((e.lat + 90) * 1e4) * 13; const prev = old.get(key);
        herds.push(prev && prev.kind === e.kind ? prev : this.herd(key, e.kind, !!e.kept, e.lon, e.lat, e.k || K_OPEN, e.n)); }
      this.herds = herds;
    }
    herd(key, kind, kept, lon, lat, k, n) {
      const sp = SP[kind]; if (!n) n = sp.n[0] + Math.floor(hash(key, 47) * (sp.n[1] - sp.n[0] + 1));
      const spread = Math.sqrt(n) * sp.L * 2.2 * k;      // (metres, as drawn: a herd stands a few body lengths apart)
      const h = { key, kind, kept, lon, lat, cl: Math.max(0.2, Math.cos(lat * D2R)), k, n, spread, drift: hash(key, 53) * 6.2832, beasts: [] };
      for (let b = 0; b < n; b++) { const a = hash(key, 100 + b) * 6.2832, r = Math.sqrt(hash(key, 200 + b)) * spread; const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
        const col = sp.col[Math.floor(hash(key, 300 + b) * sp.col.length)];
        h.beasts.push({ x: bx, z: bz, tx: bx, tz: bz, yaw: hash(key, 400 + b) * 6.2832, walk: 0, rest: 2 + hash(key, 500 + b) * 14, ph: hash(key, 600 + b), col, shade: 0.85 + 0.3 * hash(key, 700 + b), hg: 0, hx: 1e9, hz: 1e9, hv: -1, wet: false }); }
      return h;
    }
    update(cam, sim, now, dt) {
      if (!sim || !this.enabled || !sim.landClass) { this.clear(); return; }
      const near = (cam.agl !== undefined ? cam.agl : cam.alt) * R_M < 26000 && cam.dist * R_M < 30000; if (!near) { this.clear(); return; }      // (the camera's heights are in Earth radii)
      this.uni.uTime.value = now / 1000;
      const moved = GEO.distKm(cam.lon, cam.lat, this.last.lon, this.last.lat) > 2.5;
      if (moved || now - this.last.t > 9000 || sim.year !== this.last.yr) { this.last = { lon: cam.lon, lat: cam.lat, t: now, yr: sim.year }; this.respawn(cam, sim); }
      if (this._vcV !== this.terrain.meshVersion || !this._vc || this._vc.size > 30000) { this._vc = new Map(); this._vcV = this.terrain.meshVersion; }
      this.animate(Math.min(0.1, dt || 0.016), now / 1000);
    }
    clear() { if (this.stats.beasts) { for (const k in this.inst) { this.inst[k].mesh.count = 0; this.inst[k].mesh.visible = false; } if (this.shadow) { this.shadow.count = 0; this.shadow.visible = false; } this.stats = { herds: 0, beasts: 0 }; } this.herds = []; this.last.t = -1e9; }
    animate(dt, t) {
      const counts = {}; for (const k of KINDS) counts[k] = 0; const T = this.terrain, exag = this.exag, m = this._m, el = m.elements; let ns = 0, nb = 0;
      const sh = this.shadow, she = sh ? sh.instanceMatrix.array : null;
      for (const h of this.herds) {
        const sp = SP[h.kind], I = this.inst[h.kind]; if (!I) continue; const k = h.k;
        // the herd drifts over the days, slowly, wandering about its place (a tenth of a metre a second, as drawn k times the true pace)
        const A = h.spread * 1.1, w = 0.1 * k / A, hcx = A * Math.sin(t * w + h.drift), hcz = A * Math.sin(t * w * 0.77 + h.drift * 2.3);
        for (const b of h.beasts) {
          // graze, then now and then walk a little way to better grass, keeping with the herd
          if (b.walk < 0.5) { b.rest -= dt; if (b.rest <= 0) { const a = Math.random() * 6.2832, r = Math.sqrt(Math.random()) * h.spread; b.tx = Math.cos(a) * r; b.tz = Math.sin(a) * r; b.walk = 1; } }
          if (b.walk >= 0.5) {
            const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz), v = (sp.L > 3 ? 1.1 : 1.3) * k * dt;
            if (d <= v) { b.x = b.tx; b.z = b.tz; b.walk = 0.49; b.rest = 4 + Math.random() * 18; }
            else { b.x += dx / d * v; b.z += dz / d * v; const want = Math.atan2(dz, dx); let dy = want - b.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); b.yaw += clamp(dy, -2 * dt, 2 * dt); }
          } else b.walk = Math.max(0, b.walk - dt * 2);
          const gait = b.walk >= 0.5 ? 1 : b.walk * 2;
          const x = b.x + hcx, z = b.z + hcz; const lon = h.lon + x / (R_M * h.cl * D2R), lat = h.lat + z / (R_M * D2R);
          if (Math.abs(x - b.hx) + Math.abs(z - b.hz) > 2 * k || b.hv !== T.meshVersion) { b.hg = Math.max(0, T.meshHeightAt(lon, lat, this._vc)); b.wet = !!(T.isWater && T.isWater(lon, lat)); b.hx = x; b.hz = z; b.hv = T.meshVersion; }
          if (b.wet) continue;      // (a herd that has wandered to a shore: those in the water are not drawn)
          const idx = counts[h.kind]; if (idx >= CAP) continue; counts[h.kind] = idx + 1;
          const lo = lon * D2R, la = lat * D2R; const slo = Math.sin(lo), clo = Math.cos(lo), sla = Math.sin(la), cla = Math.cos(la);
          const Ex = -slo, Ez = -clo; const Nx = -sla * clo, Ny = cla, Nz = sla * slo; const Ux = cla * clo, Uy = sla, Uz = -cla * slo;
          const fx = Math.cos(b.yaw), fz = Math.sin(b.yaw), s = k / R_M, rr = 1 + b.hg * exag / R_M;
          el[0] = (fx * Ex + fz * Nx) * s; el[1] = (fz * Ny) * s; el[2] = (fx * Ez + fz * Nz) * s; el[3] = 0;
          el[4] = Ux * s; el[5] = Uy * s; el[6] = Uz * s; el[7] = 0;
          el[8] = (fz * Ex - fx * Nx) * s; el[9] = (-fx * Ny) * s; el[10] = (fz * Ez - fx * Nz) * s; el[11] = 0;
          el[12] = Ux * rr; el[13] = Uy * rr; el[14] = Uz * rr; el[15] = 1;
          I.mesh.setMatrixAt(idx, m); const c = b.col, ca = I.mesh.instanceColor.array, q = b.shade;
          ca[idx * 3] = ((c >> 16) & 255) / 255 * q; ca[idx * 3 + 1] = ((c >> 8) & 255) / 255 * q; ca[idx * 3 + 2] = (c & 255) / 255 * q;
          I.walk.setXY(idx, b.ph, gait); nb++;
          // its shadow: half its length forward, the body's height up, half its width (and a little for the legs) to the side
          if (sh && ns < CAP * 4) { const hl = sp.L * 0.48 * k / R_M, hb = sp.S * 0.72 * k / R_M, hw = sp.L * sp.w * 0.6 * k / R_M, o = ns * 16;
            she[o] = (fx * Ex + fz * Nx) * hl; she[o + 1] = (fz * Ny) * hl; she[o + 2] = (fx * Ez + fz * Nz) * hl; she[o + 3] = 0;
            she[o + 4] = Ux * hb; she[o + 5] = Uy * hb; she[o + 6] = Uz * hb; she[o + 7] = 0;
            she[o + 8] = (fz * Ex - fx * Nx) * hw; she[o + 9] = (-fx * Ny) * hw; she[o + 10] = (fz * Ez - fx * Nz) * hw; she[o + 11] = 0;
            she[o + 12] = Ux * rr; she[o + 13] = Uy * rr; she[o + 14] = Uz * rr; she[o + 15] = 1; ns++; }
        }
      }
      for (const k of KINDS) { const I = this.inst[k], c = counts[k]; I.mesh.count = c; I.mesh.visible = c > 0; GEO.touch(I.mesh.instanceMatrix, c); GEO.touch(I.mesh.instanceColor, c); GEO.touch(I.walk, c); }
      if (sh) { sh.count = ns; sh.visible = ns > 0; GEO.touch(sh.instanceMatrix, ns); }
      this.stats = { herds: this.herds.length, beasts: nb };
    }
  }
  window.FAUNA = { Fauna, SP, KINDS, wildOf, keptOf, continent };
})();
