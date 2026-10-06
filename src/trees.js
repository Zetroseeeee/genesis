// GENESIS trees: instanced forests placed from the same biome rules the terrain shader uses, in three
// distance tiers around the camera target. Classic script; exposes window.TREES.
(function () {
  const R_M = 6371000, D2R = Math.PI / 180;
  const W = 720, H = 360;
  function hash2(x, y, k) { let h = (x * 374761393 + y * 668265263 + k * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const fr = (x) => x - Math.floor(x);

  // tiers: radius (m), spacing (m), scale multiplier, max instances
  // (Near: close enough set that the crowns of a wood meet, 40 m for trees drawn 44 m tall. Far off: many smaller ones, not
  // a few giants: a wood on a far slope is a nap of crowns on the ground's own canopy, which the sparse great trees of before
  // stood on like mushrooms.)
  // The last is what grows under and between the trees, near the eye: young trees and bushes in a wood (its floor is not bare),
  // scrub on open ground where the climate grows any. It has no pictures of its own: a bush is the crown of one of the place's
  // trees without its trunk, small, on the ground (CROWN: how far up its picture a tree's crown begins).
  const TIERS = [
    { R: 3200, s: 40, k: 2.2, max: 40000 },
    { R: 12000, s: 110, k: 3.0, max: 40000 },
    { R: 36000, s: 380, k: 6.0, max: 30000 },
    { R: 1150, s: 15, k: 2.2, max: 24000, under: true },
  ];
  const CROWN = { tree_oak_a: 0.3, tree_beech_a: 0.28, tree_birch_a: 0.3, tree_spruce_a: 0.1, tree_pine_a: 0.52, tree_stonepine_a: 0.55, tree_cypress_a: 0.06, tree_olive_a: 0.34, tree_acacia_a: 0.42, tree_palm_a: 0.56, tree_rain_a: 0.45, tree_kapok_a: 0.6, tree_bamboo_a: 0.25, tree_baobab_a: 0.62 };
  // how much scrub open ground carries, by flora zone (a share of the plots that are grass and not wood)
  const SCRUB = { med: 0.2, dry: 0.07, savanna: 0.12, temperate: 0.045, easia: 0.06, boreal: 0.05, rain: 0.2 };

  // Where each tree grows is said by the model library: flora = { zones: { temperate: 5, med: 2 }, region: [lon0, lon1,
  // lat0, lat1], deciduous, bare: <id of its leafless winter card> }. A tree without that note gets these by its kind.
  const FLORA = {
    tree_broad: { zones: { temperate: 5, med: 2, easia: 3 }, deciduous: true },
    tree_conifer: { zones: { boreal: 6, temperate: 0.6 } },
    tree_savanna: { zones: { savanna: 6, dry: 5 } },
    tree_palm: { zones: { dry: 4, rain: 1, savanna: 0.4 } },
  };
  // the lands with a Mediterranean climate: the western basin with the Maghreb coast, the eastern basin north of the
  // Levant's deserts, California, central Chile, the Cape, the south-west and south of Australia
  const MED = [[-10, 12, 30, 44.5], [12, 42, 33.5, 44.5], [-125, -114, 31, 41], [-75, -69, -38, -30], [16, 28, -35, -31], [113, 140, -38, -30]];
  const inBox = (b, lon, lat) => lon >= b[0] && lon <= b[1] && lat >= b[2] && lat <= b[3];
  // The flora zone of a point: boreal, temperate, med, easia, dry, savanna or rain. r5, r6: the tree's own dice, so
  // zones shade into each other instead of meeting at a line.
  // By the climate of the place (Koppen-Geiger class, data/climate.png) where that is known: 1 Af 2 Am 3 As 4 Aw 5 BSh
  // 6 BSk 7 BWh 8 BWk 9 Cfa 10 Cfb 11 Cfc 12-14 Cs 15-17 Cw 18-21 Df 22-25 Ds 26-29 Dw 30 EF 31 ET.
  function zoneOf(lon, lat, h, fw, r5, r6) {
    const aLat = Math.abs(lat); const kc = fw.kc | 0;
    if (kc) {
      const dense = fw.f > 0.55 && r5 < 0.6, eastAsia = lon > 95 && lon < 150 && lat > 18 && lat < 50;
      if (kc <= 2) return 'rain';
      if (kc <= 4) return dense ? 'rain' : 'savanna';                              // monsoon forest where the cover is thick, else savanna
      if (kc === 5) return aLat < 25 ? 'savanna' : 'dry';                           // hot steppe: thorn savanna in the tropics
      if (kc === 7) return 'dry';                                                   // hot desert: what grows, grows by water (palms, thorn trees)
      if (kc === 6 || kc === 8) { for (const b of MED) if (inBox(b, lon, lat)) return 'med'; return aLat < 33 ? 'dry' : 'temperate'; }   // cold steppe and desert
      if (kc >= 12 && kc <= 14) return 'med';
      if (kc === 9) return eastAsia ? 'easia' : 'temperate';
      if (kc === 15) return eastAsia ? 'easia' : aLat < 30 ? (dense ? 'rain' : 'savanna') : 'temperate';
      if (kc === 16 || kc === 17) return 'temperate';                               // tropical highlands: oak and pine
      if (kc === 10) return 'temperate';
      if (kc === 11) return r6 < 0.5 ? 'boreal' : 'temperate';
      if (kc === 18 || kc === 22 || kc === 26) return eastAsia && r6 < 0.6 ? 'easia' : 'temperate';
      if (kc === 19 || kc === 23 || kc === 27) return r6 < 0.38 ? 'boreal' : 'temperate';       // the mixed forest between the oak woods and the taiga
      return 'boreal';                                                              // taiga, and what little stands on the tundra
    }
    const conifer = smooth(46, 62, aLat) + smooth(1200, 2400, h) * 0.8 * smooth(12, 28, aLat);
    if (conifer >= 0.5 + (r5 - 0.5) * 0.5) return 'boreal';
    const open = fw.warm > 0.42 && fw.f < 0.6 && r5 < 0.25 + fw.warm * 0.7;
    for (const b of MED) if (inBox(b, lon, lat)) return open && aLat < 38 && r6 < 0.5 ? 'dry' : 'med';
    if (lon > -18 && lon < 75 && lat > 15 && lat < 38) return 'dry';                      // North Africa to Iran and the Indus: thorn trees and date palms
    const tropic = lon > 60 && lon < 100 ? 31 : 23.5;                                       // the monsoon forests of India reach further north
    if (aLat < tropic + (r6 - 0.5) * 5) return h > 1600 + r6 * 400 ? 'temperate' : open ? 'savanna' : 'rain';   // tropical highlands: oak and pine
    if (aLat < 38 && open) return 'dry';
    if (lon > 95 && lon < 150 && lat > 20 && lat < 46) return 'easia';
    return 'temperate';
  }
  // A tree is the photograph of one, cut out, on a card that turns about its own trunk to face the camera. Seen from
  // above, the card leans back until it lies under the eye as the crown does. Into the sun's depth map the same card
  // is drawn facing the sun, so the shadow on the ground is the tree's own outline.
  // The card's depth along its instance z axis says whether the picture is mirrored (two trees from one photograph).
  // the air between the eye and a tree (air.js), worked out once for each
  const AIR_V = window.AIR ? AIR.VERT : '\n    varying vec3 vAirT, vAirL; void air(vec3 p, float n, out vec3 T, out vec3 L) { T = vec3(1.0); L = vec3(0.0); }', AIR_F = window.AIR ? AIR.FRAG : '\n    varying vec3 vAirT, vAirL; vec3 airOver(vec3 c, vec3 T, vec3 L) { return c; }', AIR_N = window.AIR ? AIR.THING : '3.0';
  const IMP_VERT = `
    uniform float uPivot, uOrtho; uniform vec3 uSunV;
    attribute vec3 aTree;      // how deep in a wood the tree stands (0 alone on a lawn .. 1 in closed forest), its own dice, and how much of its picture is left off from below (a bush: the crown alone)
    varying vec2 vUv; varying vec3 vCol, vView, vNrm, vTree; varying float vHid;
    #ifdef CARD_SHADOW
    // is the tree in something's shadow? Asked once per tree (at its crown, toward the sun), not once per pixel of it
    uniform sampler2D uShadowMap; uniform mat4 uShadowMat; uniform vec4 uShadowP;
    float hidden(vec3 vp) {
      if (uShadowP.x < 0.5) return 0.0;
      vec4 sc = uShadowMat * vec4(vp, 1.0); vec3 s = sc.xyz * 0.5 + 0.5;
      if (s.x <= 0.01 || s.x >= 0.99 || s.y <= 0.01 || s.y >= 0.99 || s.z <= 0.0 || s.z >= 1.0) return 0.0;
      float z = s.z - uShadowP.z, t = uShadowP.y * 3.0;
      return (step(texture2D(uShadowMap, s.xy).r, z) + step(texture2D(uShadowMap, s.xy + vec2(t, 0.0)).r, z) + step(texture2D(uShadowMap, s.xy - vec2(t, 0.0)).r, z)
        + step(texture2D(uShadowMap, s.xy + vec2(0.0, t)).r, z) + step(texture2D(uShadowMap, s.xy - vec2(0.0, t)).r, z)) * 0.2;
    }
    #endif
    ${AIR_V}
    void main() {
      mat4 mvi = modelViewMatrix * instanceMatrix;
      vec4 c = mvi * vec4(0.0, 0.0, 0.0, 1.0);
      vec3 upV = (mvi * vec4(0.0, 1.0, 0.0, 0.0)).xyz; float hgt = length(upV); upV /= hgt;
      float wid = length((mvi * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
      float flip = length((mvi * vec4(0.0, 0.0, 1.0, 0.0)).xyz) > 2.35e-7 ? -1.0 : 1.0;
      vec3 toCam = uOrtho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(-c.xyz);
      vec3 upB = upV - toCam * dot(upV, toCam); float l = length(upB); upB = l > 0.02 ? upB / l : vec3(0.0, 1.0, 0.0);
      vec3 rightV = normalize(cross(upB, toCam));
      float hEff = max(hgt * l, wid * 0.85);                                  // from overhead a tree is as tall on screen as its crown is wide
      float x = (position.x + 0.5 - uPivot) * flip;                           // the card turns about the trunk, not about its middle
      vec3 p = c.xyz + rightV * x * wid + upB * (position.y - 0.5 * (1.0 - l)) * hEff + toCam * wid * 0.2;
      vUv = vec2(uv.x, aTree.z + uv.y * (1.0 - aTree.z)); vView = p; vTree = aTree;      // a mirrored card keeps its picture and turns its geometry over: the trunk stays on the pivot
      air(c.xyz + upV * hgt * 0.5, ${AIR_N}, vAirT, vAirL);                   // (one air for the whole tree)
      #ifdef USE_INSTANCING_COLOR
      vCol = instanceColor;
      #else
      vCol = vec3(1.0);
      #endif
      // a crown is round: the card is shaded as the near half of a ball
      vNrm = normalize(rightV * x * 1.7 + upB * (position.y - 0.42) * 1.3 + toCam * 0.75);
      #ifdef CARD_SHADOW
      vHid = hidden(c.xyz + upV * hgt * 0.55 + uSunV * wid * 0.6);            // from its crown, a little way toward the sun (its own card is not in the way)
      #else
      vHid = 0.0;
      #endif
      gl_Position = projectionMatrix * vec4(p, 1.0);
    }`;
  const IMP_FRAG = `
    precision highp float;
    uniform sampler2D uImp; uniform vec2 uImpSize; uniform vec3 uSunV, uUpV, uSunCol; uniform float uDay, uCamAlt, uUnits, uDusk, uCover;
    varying vec2 vUv; varying vec3 vCol, vView, vNrm, vTree; varying float vHid;
    ${AIR_F}
    void main() {
      vec4 t = texture2D(uImp, vUv);
      // a small picture of a tree averages its twigs and leaf edges thin: lower the bar as the picture shrinks, so a
      // distant crown keeps its body and a winter tree its branches
      vec2 px = vUv * uImpSize; float lod = max(0.0, 0.5 * log2(max(dot(dFdx(px), dFdx(px)), dot(dFdy(px), dFdy(px))) + 1e-8));
      // The edge of the cut-out: where the picture is drawn with several samples a pixel (uCover), a pixel on the edge is
      // covered by as many of them as the tree covers of it (the card says so through its alpha), and a crown's outline is
      // smooth; else a pixel is the tree's or it is not, as it was.
      float al = t.a * (1.0 + lod * 0.3), cover = clamp((al - 0.42) / max(fwidth(al), 1e-4) + 0.5, 0.0, 1.0);
      if (cover < 0.5 - 0.47 * uCover) discard;
      vec3 col = t.rgb * vCol; vec3 n = normalize(vNrm);
      // No two trees are one green (each has its own, a little toward yellow or toward blue). And a tree in a wood is not a tree
      // on a lawn: its neighbours take its light. What is low in it, the trunk and the under side of the crown, stands in the
      // dark of the wood; only the tops are in the sun, and the side turned from it is in deep shade. (The photographs are all
      // softly lit from the front: a wood of them unshaded is a table of model trees.)
      // (wood: for the light from below; a tree that stands alone has a third of it: its own crown shades its trunk and its under side)
      float deep = vTree.x, wood = max(deep, 0.34), low = smoothstep(0.02, 0.62, vUv.y), under = step(0.01, vTree.z) * deep;      // (under: a bush under the trees of a wood is in their shade altogether)
      col *= mix(vec3(1.08, 1.0, 0.82), vec3(0.9, 1.0, 1.1), vTree.y) * mix(1.0, 0.84, deep) * mix(1.0, 0.7, under);
      float lum = dot(col, vec3(0.299, 0.587, 0.114)); col = mix(vec3(lum), col, mix(0.94, 0.86, deep));
      float shade = mix(1.0, 0.2 + 0.8 * low, wood) * mix(1.0, 0.4, under);
      float sky = (0.5 + 0.5 * dot(n, uUpV)) * mix(1.0, 0.35 + 0.65 * low, wood);
      float sunSide = max(dot(n, uSunV), 0.0);
      float diff = mix(0.45, 0.16, wood) + mix(0.55, 0.92, wood) * sunSide + 0.25 * max(dot(uUpV, uSunV), 0.0) * mix(1.0, low, wood);     // the photograph is already softly lit: the sun adds a bright side
      diff *= (1.0 - 0.6 * vHid) * shade;
      vec3 amb = mix(vec3(0.25, 0.31, 0.49) * (0.7 + 0.5 * sky), vec3(0.32, 0.34, 0.38) * (0.45 + 0.75 * sky) + vec3(0.27, 0.22, 0.155) * (1.0 - sky) * mix(1.0, 0.4, wood), uDay) + vec3(0.27, 0.19, 0.20) * uDusk * (0.5 + 0.6 * sky);
      vec3 lit = col * (amb * mix(1.0, 0.3 + 0.7 * low, wood) + diff * 0.72 * uSunCol);
      gl_FragColor = vec4(airOver(lit, vAirT, vAirL), mix(1.0, cover, uCover));                     // the air between (air.js)
    }`;
  const IMP_DEPTH = `
    precision highp float; uniform sampler2D uImp; varying vec2 vUv;
    void main() { if (texture2D(uImp, vUv).a < 0.42) discard; gl_FragColor = vec4(1.0); }`;

  function treeGeometry(detail) {
    const parts = [];
    if (detail === 3) {            // broadleaf: trunk + lumpy canopy
      const trunk = new THREE.CylinderGeometry(0.05, 0.08, 0.4, 6); trunk.translate(0, 0.2, 0); parts.push(trunk);
      const c1 = new THREE.DodecahedronGeometry(0.34, 0); c1.scale(1.15, 0.85, 1.05); c1.translate(0, 0.62, 0); parts.push(c1);
      const c2 = new THREE.DodecahedronGeometry(0.22, 0); c2.translate(0.16, 0.78, -0.08); parts.push(c2);
      const c3 = new THREE.DodecahedronGeometry(0.2, 0); c3.translate(-0.18, 0.74, 0.1); parts.push(c3);
    } else if (detail === 2) {
      const trunk = new THREE.CylinderGeometry(0.06, 0.09, 0.32, 6); trunk.translate(0, 0.16, 0); parts.push(trunk);
      const c1 = new THREE.ConeGeometry(0.42, 0.55, 8); c1.translate(0, 0.5, 0); parts.push(c1);
      const c2 = new THREE.ConeGeometry(0.3, 0.5, 8); c2.translate(0, 0.78, 0); parts.push(c2);
    } else if (detail === 1) {
      const trunk = new THREE.CylinderGeometry(0.07, 0.1, 0.3, 5); trunk.translate(0, 0.15, 0); parts.push(trunk);
      const c1 = new THREE.ConeGeometry(0.42, 0.75, 7); c1.translate(0, 0.62, 0); parts.push(c1);
    } else {
      const c1 = new THREE.ConeGeometry(0.45, 0.9, 6); c1.translate(0, 0.5, 0); parts.push(c1);
    }
    const geos = parts.map(x => x.index ? x.toNonIndexed() : x);
    let n = 0; for (const x of geos) n += x.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
    for (const x of geos) { pos.set(x.attributes.position.array, o * 3); nor.set(x.attributes.normal.array, o * 3); o += x.attributes.position.count; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return g;
  }

  // What a town keeps clear of trees: the line of its wall, and whatever stands or runs at its edge and beyond (the
  // outermost houses, a harbour, a mine, building sites, the lanes out of the gates). No tree grows through a palisade
  // or out of a roof. x, z: drawn metres east and north of the town's centre; m: how far a trunk keeps off, metres.
  function townKeepsClear(L, x, z, m) {
    const r = Math.sqrt(x * x + z * z);
    if (L.wallR && Math.abs(r - L.wallR) < 9 * L.k + m) return true;
    let O = L._edge; const key = (L.shoreKey || '') + ':' + L.items.length;
    if (!O || O.key !== key) {
      O = L._edge = { key, items: [], yard: [], streets: [] }; const edge = L.R * 0.85, out = (L.wallR || L.R) * 1.08;
      // (what stands out in the fields - a farmstead, a mine - has open ground around it, wide enough that no crown hangs over its roof)
      for (const it of L.items) { if (it.kind === 'palisade' || it.kind === 'wall' || it.kind === 'gatehouse') continue; const rr = Math.hypot(it.x, it.z); if (rr + 0.5 * Math.hypot(it.w, it.d) > edge) { O.items.push(it); O.yard.push(rr > out ? 24 * L.k : 0); } }
      for (const st of L.streets || []) if (Math.hypot(st[0], st[1]) > edge || Math.hypot(st[2], st[3]) > edge) O.streets.push(st);
    }
    for (let q = 0; q < O.items.length; q++) {
      const it = O.items[q]; if (it.off) continue; const hw = (it.fw || it.w) * 0.5 + m + O.yard[q], hd = (it.fd || it.d) * 0.5 + m + O.yard[q]; const dx = x - it.x, dz = z - it.z; if (dx * dx + dz * dz > hw * hw + hd * hd) continue;
      const yaw = it.fyaw === undefined ? it.yaw : it.fyaw; const c = Math.cos(yaw), sn = Math.sin(yaw); if (Math.abs(dx * c + dz * sn) < hw && Math.abs(dx * sn - dz * c) < hd) return true;
    }
    for (const st of O.streets) {
      const ax = st[2] - st[0], az = st[3] - st[1]; let t = ((x - st[0]) * ax + (z - st[1]) * az) / (ax * ax + az * az || 1); t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = st[0] + ax * t - x, pz = st[1] + az * t - z; const hw = st[4] + m; if (px * px + pz * pz < hw * hw) return true;
    }
    return false;
  }
  class Trees {
    constructor({ scene, terrain, renderer }) {
      this.scene = scene; this.terrain = terrain; this.exag = terrain.exag; this.sim = null; this.renderer = renderer || null;
      this.veg = null; this.noise = null; this.ready = false; this.enabled = true;
      this.uCover = { value: 0 };      // 1 while the picture is drawn with several samples a pixel (main.js says so each frame)
      this.imps = TIERS.map(() => new Map()); this.modelCount = TIERS.map(() => 0);   // real trees: picture cards per tier and species
      const mk = (detail, max) => {
        const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x10190a, emissiveIntensity: 0.6 });
        const m = new THREE.InstancedMesh(treeGeometry(detail), mat, max); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
        scene.add(m); return m;
      };
      this.meshes = TIERS.map((t, i) => mk(2 - i, t.max));
      this.broad = mk(3, TIERS[0].max);      // near-tier broadleaf variant
      this.last = TIERS.map(() => ({ lon: 999, lat: 999, t: -1e9 }));
      this.count = 0; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._c = new THREE.Color();
      this._basis = new THREE.Matrix4(); this._yaw = new THREE.Quaternion(); this._up = new THREE.Vector3(0, 1, 0); this._fwd = new THREE.Vector3(0, 0, 1);
    }
    // how thickly trees stand in a climate, against the same green in a forest country, and how dry it is (0..1)
    static get THIN() { return Trees._thin || (Trees._thin = (() => { const a = new Float32Array(33).fill(1); a[5] = 0.6; a[6] = 0.4; a[7] = 0.14; a[8] = 0.1; a[30] = 0; a[31] = 0.07; return a; })()); }
    static get ARID() { return Trees._arid || (Trees._arid = (() => { const a = new Float32Array(33); a[7] = a[8] = 1; a[5] = a[6] = 0.6; a[3] = a[4] = 0.32; for (const k of [12, 13, 14, 22, 23, 24, 25]) a[k] = 0.26; for (const k of [15, 16, 17, 26, 27, 28, 29]) a[k] = 0.12; return a; })()); }
    // how hard its winters are (0 no snow ever .. 1 snow from autumn to spring), as tools/climate/build.py writes it for the ground shader
    static get COLD() { return Trees._cold || (Trees._cold = (() => { const a = new Float32Array(256); for (const k of [20, 21, 24, 25, 28, 29, 30, 31]) a[k] = 1; for (const k of [18, 19, 22, 23, 26, 27]) a[k] = 0.72; a[11] = 0.5; a[6] = a[8] = 0.45; a[10] = 0.25; a[9] = 0.12; a[16] = a[17] = 0.1; a[13] = 0.06; return a; })()); }
    // the climate class of a point (0 while the map has not arrived)
    climateAt(lon, lat) { const c = this.climate; if (!c) return 0; const x = ((Math.floor((lon + 180) / 360 * c.width) % c.width) + c.width) % c.width, y = Math.min(c.height - 1, Math.max(0, Math.floor((90 - lat) / 180 * c.height))); return c.data[(y * c.width + x) * 4]; }
    async load(vegUrl, noiseUrl, climateUrl) {
      const img = (url) => new Promise((res, rej) => { const im = new Image(); im.onload = () => { const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(im, 0, 0); res(ctx.getImageData(0, 0, im.width, im.height)); }; im.onerror = () => rej(new Error('failed ' + url)); im.src = url; });
      const [v, n] = await Promise.all([img(vegUrl), img(noiseUrl)]);
      this.veg = v; this.noise = n; this.ready = true;
      if (climateUrl) img(climateUrl).then((c) => { this.climate = c; for (const L of this.last) L.t = -1e9; }).catch((e) => console.warn('climate', e));
    }
    // bilinear sample of an ImageData channel at fractional pixel coords (wrapping x)
    samp(id, fx, fy, ch) {
      const w = id.width, h = id.height, d = id.data;
      fx -= 0.5; fy -= 0.5; let x0 = Math.floor(fx), y0 = Math.floor(fy); const ax = fx - x0, ay = fy - y0;
      const x1 = (x0 + 1) % w; x0 = ((x0 % w) + w) % w; const yy0 = Math.min(h - 1, Math.max(0, y0)), yy1 = Math.min(h - 1, Math.max(0, y0 + 1));
      return ((d[(yy0 * w + x0) * 4 + ch] * (1 - ax) + d[(yy0 * w + x1) * 4 + ch] * ax) * (1 - ay) + (d[(yy1 * w + x0) * 4 + ch] * (1 - ax) + d[(yy1 * w + x1) * 4 + ch] * ax) * ay) / 255;
    }
    noiseAt(gx, gy, k, ch) { const n = this.noise; return this.samp(n, fr(gx * k) * n.width, (1 - fr(gy * k)) * n.height, ch); }   // flipY, as the GPU sees it
    // forest weight at a point: mirrors the terrain shader's biome rules (weights are dithered with the same noise)
    forestAt(lon, lat, h) {
      const v = this.veg; const fx = (lon + 180) / 360 * v.width, fy = (90 - lat) / 180 * v.height;
      const green = this.samp(v, fx, fy, 0), lum = this.samp(v, fx, fy, 1), warm = this.samp(v, fx, fy, 2);
      const latN = Math.abs(lat) / 90; const treeLine = 4100 - 3900 * Math.pow(latN, 1.4), snowLine = 5100 - 4800 * Math.pow(latN, 1.3);
      if (h > snowLine - 300) return { f: 0, g: 0 };
      const aboveTree = smooth(treeLine - 300, treeLine + 200, h);
      const gx = lon * D2R * Math.cos(lat * D2R), gy = lat * D2R;
      const nMid = [this.noiseAt(gx, gy, 1200, 0), this.noiseAt(gx, gy, 1200, 1), this.noiseAt(gx, gy, 1200, 3)];
      const nMic = [this.noiseAt(gx, gy, 9000, 0), this.noiseAt(gx, gy, 9000, 1), this.noiseAt(gx, gy, 9000, 3)];
      // the wildwood (as in the terrain shader): green land that is not dry is forest wherever nobody farms it
      let cult = 0; if (this.sim) { const ci = Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / 180 * H))) * W + ((Math.floor((lon + 180) / 360 * W) % W + W) % W); cult = this.sim.owner[ci] >= 0 ? this.sim.cultivation(ci) * (this.sim.level[ci] ? 1 : 0.6) : 0; }
      // each tree looks its climate up a little to one side of itself, so two climates shade into each other
      const kc = this.climateAt(lon + (nMic[0] - 0.5) * 0.3, lat + (nMic[1] - 0.5) * 0.3); const arid = Trees.ARID[kc];
      const wild = (1 - smooth(0.22, 0.48, warm)) * (1 - Math.min(1, cult * 1.4)) * (1 - smooth(0.35, 0.6, arid));
      let wF = green * (1 - smooth(0.32 + 0.2 * wild, 0.6 + 0.3 * wild, lum)) * (1 - aboveTree);
      let wG = green * smooth(0.28 + 0.2 * wild, 0.55 + 0.3 * wild, lum) + green * aboveTree * 0.6;
      let wD = warm * (1 - green) * (1 - smooth(1800, 3000, h));
      let wR = smooth(2600, 4300, h) * (1 - green * 0.5) + (1 - green) * (1 - warm) * 0.5;
      wF = Math.pow(Math.max(wF + (nMid[0] - 0.5) * 0.5 + (nMic[1] - 0.5) * 0.25, 0), 3);
      wG = Math.pow(Math.max(wG + (nMid[1] - 0.5) * 0.5 + (nMic[0] - 0.5) * 0.25, 0), 3);
      wD = Math.pow(Math.max(wD + (nMic[2] - 0.5) * 0.2, 0), 3);
      wR = Math.pow(Math.max(wR + (nMid[2] - 0.5) * 0.4 + (nMic[2] - 0.5) * 0.25, 0), 3);
      const ws = wF + wG + wD + wR + 1e-4;
      return { f: wF / ws, g: wG / ws, d: wD / ws, warm, lum, latN, alt: h, kc, arid };
    }
    update(cam, sim, now) {
      this.sim = sim;
      if (!this.ready || !this.enabled || cam.alt > 0.007) { if (this.count) { this.clear(); for (const L of this.last) L.t = -1e9; } return; }
      // one tier per call keeps frames smooth
      for (let ti = 0; ti < TIERS.length; ti++) {
        const t = TIERS[ti], L = this.last[ti];
        // (what grows under the trees is only there to be seen from close to: from higher up it is not placed at all)
        if (t.under && cam.alt > 0.00042) { if (this.modelCount[ti]) { for (const I of this.imps[ti].values()) I.count = 0; this.modelCount[ti] = 0; L.t = -1e9; } continue; }
        const moved = GEO.distKm(cam.lon, cam.lat, L.lon, L.lat) * 1000 > t.R * 0.18;
        const zoomed = ti === 0 && Math.abs(Math.log((cam.dist || 1) / (L.dist || 1))) > 0.25;     // closer or farther: the near trees change their level of detail
        if (!moved && !zoomed && now - L.t < 6000) continue;
        this.buildTier(ti, cam, now); break;
      }
      let c = this.broad.count; for (const m of this.meshes) c += m.count; for (const n of this.modelCount) c += n; this.count = c;
    }
    clear() {
      for (const m of this.meshes) m.count = 0; this.broad.count = 0; this.count = 0; this.casters = []; this.castersVersion = (this.castersVersion || 0) + 1;
      for (let ti = 0; ti < TIERS.length; ti++) { for (const I of this.imps[ti].values()) I.count = 0; this.modelCount[ti] = 0; }
    }
    // ----- real trees: the photograph of each species on a card -----
    // The trees of each flora zone that have a card: { zone: [{ def, w, region }] }, or null while the library has none
    // (the kit tree stands in).
    flora() {
      if (!window.MODELS || !MODELS.ready) return null; if (this._flora !== undefined) return this._flora;
      const zones = {}; let n = 0;
      for (const id in MODELS.defs) { const d = MODELS.defs[id]; if (!d.tree || !d.card) continue; const f = d.flora || FLORA[d.kinds[0]]; if (!f || !f.zones) continue; d.flora = f; n++;
        for (const z in f.zones) (zones[z] = zones[z] || []).push({ def: d, w: f.zones[z], region: f.region || null }); }
      return (this._flora = n ? zones : null);
    }
    impMesh(ti, def) {
      let I = this.imps[ti].get(def.id); if (I) return I;
      const card = MODELS.card(def); if (!card) return null;
      const sh = MODELS.shared; const g = new THREE.PlaneGeometry(1, 1); g.translate(0, 0.5, 0);
      const uniforms = { uImp: { value: card.tex }, uImpSize: { value: new THREE.Vector2(card.tex.image ? card.tex.image.width : 1024, card.tex.image ? card.tex.image.height : 1024) }, uPivot: { value: card.pivot === undefined ? 0.5 : card.pivot }, uOrtho: { value: 0 }, uSunV: sh.uSunV, uUpV: sh.uUpV, uDay: sh.uDay, uCamAlt: sh.uCamAlt, uUnits: { value: MODELS.units }, uSunCol: sh.uSunCol, uDusk: sh.uDusk, uCover: this.uCover };
      if (window.SHADOWS) Object.assign(uniforms, SHADOWS.uniforms);
      if (window.AIR) Object.assign(uniforms, AIR.uniforms);
      const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: IMP_VERT, fragmentShader: IMP_FRAG, side: THREE.DoubleSide, extensions: { derivatives: true }, defines: window.SHADOWS ? { CARD_SHADOW: 1 } : {} });   // a mirrored card is wound the other way
      mat.alphaToCoverage = true;      // (see uCover in the shader)
      I = new THREE.InstancedMesh(g, mat, TIERS[ti].max); I.count = 0; I.frustumCulled = false; I.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      I.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TIERS[ti].max * 3).fill(1), 3); I.instanceColor.setUsage(THREE.DynamicDrawUsage);
      I.userData.tree = new THREE.InstancedBufferAttribute(new Float32Array(TIERS[ti].max * 3), 3); I.userData.tree.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aTree', I.userData.tree);
      I.userData.aspect = card.aspect; I.renderOrder = TIERS[ti].under ? 0.5 : ti; this.scene.add(I); this.imps[ti].set(def.id, I);      // near tier first: what it covers, the bushes under it and the far tiers need not draw
      if (window.SHADOWS && ti === 0) {             // the near trees throw true shadows: the same card, turned to the sun
        const depth = new THREE.ShaderMaterial({ uniforms: { uImp: uniforms.uImp, uPivot: uniforms.uPivot, uOrtho: { value: 1 }, uSunV: { value: new THREE.Vector3(0, 0, 1) } }, vertexShader: IMP_VERT, fragmentShader: IMP_DEPTH, side: THREE.DoubleSide });
        SHADOWS.caster(I, depth);
      }
      return I;
    }
    buildTier(ti, cam, now) {
      const t = TIERS[ti]; const mesh = this.meshes[ti]; const T = this.terrain; const sim = this.sim;
      this.last[ti] = { lon: cam.lon, lat: cam.lat, t: now, dist: cam.dist };
      const lat0 = cam.lat, lon0 = cam.lon; const cl = Math.max(0.15, Math.cos(lat0 * D2R));
      const dLat = t.s / R_M / D2R, dLon = dLat / cl; const n = Math.ceil(t.R / t.s);
      const gy0 = Math.round(lat0 / dLat), gx0 = Math.round(lon0 / dLon);
      const m = this._m, q = this._q, s = this._s, p = this._p, col = this._c, basis = this._basis;
      let count = 0, countB = 0, countM = 0; const maxN = t.max; const exag = this.exag; const broad = this.broad;
      const casters = ti === 0 ? (this.casters = []) : null; if (ti === 0) this.castersVersion = (this.castersVersion || 0) + 1; const vc = new Map();
      const under = !!t.under, near = ti === 0 || under;      // (near: stands on the ground as its mesh has it)
      const inner = ti > 0 && !under ? TIERS[ti - 1].R : 0;   // leave the inner disc to the finer tier
      const imps = this.imps[ti]; for (const I of imps.values()) I.count = 0; const flora = this.flora();
      const camPos = cam.camera ? cam.camera.position : null; const pxPerRad = (window.innerHeight || 800) / (2 * Math.tan(((cam.camera && cam.camera.fov) || 45) * Math.PI / 360));
      const screenPx = (window.innerWidth || 1280) * (window.innerHeight || 800); let covered = 0; const coverCap = this.coverCap === undefined ? 9 : this.coverCap, coverMin = this.coverMin === undefined ? 0.012 : this.coverMin;      // how many times over the big near trees may cover the picture (big: more than coverMin of it each)
      const kTier = t.k * exag * 0.5;                // how many times life size this tier draws a tree, away from any town
      const river = this.decal && this.decal.segIndex ? this.decal : null;
      const budget = this.budget === undefined ? 1 : this.budget; const towns = new Map();       // the towns near the trees of this pass: where each stands, how large, its plan
      // the plots nearest the eye first: within each kind of tree the cards are then drawn front to back, and a card
      // behind nearer ones costs next to nothing (a forest seen from low down is many trees deep at every pixel)
      const span = 2 * n + 1; const order = (this._orders || (this._orders = []))[ti] || (this._orders[ti] = new Float64Array(span * span));
      const eye = camPos ? GEO.fromVec(camPos) : [lon0, lat0]; const ex = (((eye[0] - lon0 + 540) % 360) - 180) / dLon, ey = (eye[1] - lat0) / dLat;
      { let o = 0; for (let jy = -n; jy <= n; jy++) for (let jx = -n; jx <= n; jx++) { const ddx = jx - ex, ddy = jy - ey; order[o] = Math.round((ddx * ddx + ddy * ddy) * 16) * 65536 + o; o++; } order.sort(); }
      for (let oi = 0; oi < order.length && count + countB + countM < maxN; oi++) {
        { const cellIdx = order[oi] % 65536; const gx = gx0 - n + (cellIdx % span), gy = gy0 - n + Math.floor(cellIdx / span);
          const h1 = hash2(gx, gy, 3 + ti);
          const lat = gy * dLat + (hash2(gx, gy, 11) - 0.5) * dLat * 0.9, lon = gx * dLon + (hash2(gx, gy, 12) - 0.5) * dLon * 0.9;
          const dxm = (lon - lon0) * D2R * cl * R_M, dym = (lat - lat0) * D2R * R_M; const d2 = dxm * dxm + dym * dym;
          if (d2 > t.R * t.R || d2 < inner * inner) continue;
          const i = Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / 180 * H))) * W + ((Math.floor((lon + 180) / 360 * W) % W + W) % W);
          if (sim && !sim.land[i]) continue;
          const h = near ? T.meshHeightAt(lon, lat, vc) : T.heightAt(lon, lat); if (h <= 0.5) continue;
          // no tree stands in water, on a beach or in a river (the picture's own water mask where it has arrived, as the ground is drawn)
          let rv = null;
          // (The mask is a coarse picture, and between water and land it climbs over a kilometre or so: only its lower half is shore.
          //  Keeping trees off all of the climb but the step where rivers lie left a bare belt behind every lake, with a
          //  row of trees along the water in front of it.)
          { const wa = T.waterAlpha(lon, lat); if (wa >= 0 && wa < 0.62) continue;
            if (river && (ti < 2 || under)) { rv = river.nearestRiver(lon, lat); if (rv && rv.d < rv.hw + 6) continue; } }
          const fw = this.forestAt(lon, lat, h);
          // in dry country trees line the rivers: palms and thorn trees along the Nile and the Euphrates, poplars along a steppe river
          const gallery = rv && fw.arid > 0.4 && h < 2200 ? (1 - smooth(rv.hw * 1.5 + 60, rv.hw * 4 + 500, rv.d)) * (0.3 + 0.25 * fw.arid) : 0;
          if (!fw.f && !fw.g && !gallery && !(under && fw.d)) continue;
          // far tiers only stand in real forest, so distant trees thicken the canopy instead of peppering open land
          const fmin = under ? 0 : [0.0, 0.3, 0.5][ti]; if (fw.f < fmin && !gallery) continue;
          // which flora grows here (the tree's own dice, so zones shade into each other)
          const r5 = hash2(gx, gy, 51); const zone = zoneOf(lon, lat, h, fw, r5, hash2(gx, gy, 52));
          let density = Math.max((Math.pow(fw.f, 1.15) * 1.25 + (ti === 0 ? fw.g * 0.02 : 0)) * Trees.THIN[fw.kc | 0], gallery) * budget;
          // (under the trees: young growth on some two plots in three; on open ground scrub as the climate has it, in drifts)
          if (under) density = (fw.f * 0.62 + (fw.g + 0.6 * (fw.d || 0)) * (SCRUB[zone] || 0.05) * (0.3 + 2.4 * smooth(0.45, 0.75, this.noiseAt(lon * D2R * Math.cos(lat * D2R), lat * D2R, 2600, 1) * 1.6 - 0.3))) * Math.min(1, Trees.THIN[fw.kc | 0] * 1.5) * Math.min(1, budget * 2) + gallery * 0.5;
          // settlements clear the land around them and fields replace forest; what trees remain by a town are drawn at
          // the town's own scale (a village is drawn many times life size, and an oak must still stand over its huts)
          let kEff = kTier;
          if (sim) {
            const yy = (i / W) | 0, xx = i - yy * W;
            for (let ny = -1; ny <= 1; ny++) for (let nx = -1; nx <= 1; nx++) { const y2 = yy + ny; if (y2 < 0 || y2 >= H) continue; const j = y2 * W + ((xx + nx + W) % W); if (!sim.level[j] || sim.owner[j] < 0) continue;
              let tw = towns.get(j);
              if (tw === undefined) { const c = sim.civs[sim.owner[j]]; if (c) { const [sLon, sLat] = TOWN.siteOf(sim, j, c, T, null); tw = { sLon, sLat, R: TOWN.radiusM(sim, j, c), F: TOWN.fieldsM(sim, j, c), k: TOWN.scaleOf(TOWN.radiusTrue(sim, j, c)), L: TOWN.layout(sim, j, c, { coarse: false }), cl: Math.max(0.15, Math.cos((90 - (y2 + 0.5) / H * 180) * D2R)) }; } else tw = null; towns.set(j, tw); }
              if (!tw) continue; const R = tw.R, F = tw.F;
              const ddm = GEO.distKm(lon, lat, tw.sLon, tw.sLat) * 1000; if (ddm > Math.max(F * 1.3, R * 2.8)) continue;
              // (within the town's fields only the odd tree is left standing - a tree by a town is drawn at the town's scale, and a quarter of a forest of those would still be a wood)
              if (ddm < F * 1.3) density *= smooth(R * 0.9, R * 1.25, ddm) * (0.06 + 0.94 * smooth(F * 0.9, F * 1.25, ddm));
              if (density > 0 && ddm < R * 2.8 && townKeepsClear(tw.L, (lon - tw.sLon) * D2R * tw.cl * R_M, (lat - tw.sLat) * D2R * R_M, 3 * tw.k)) density = 0;
              const kTown = tw.k; if (kTown > kEff) kEff = Math.max(kEff, kTier + (kTown - kTier) * (1 - smooth(R * 1.4, R * 2.8, ddm))); }
            if (sim.owner[i] >= 0 && !sim.level[i]) density *= 1 - 0.35 * sim.cultivation(i);
          }
          density *= Math.min(1, Math.pow(kTier / kEff, 1.7));       // bigger trees, fewer of them: the canopy covers as much ground as before
          if (h1 > density) continue;
          // which tree: the flora zone of the place, then one of the zone's trees by its weight there. A wood is made of stands:
          // over a few hundred metres some of the zone's trees have the ground to themselves and the rest are the odd one among
          // them (beech here, oak there, a dark patch of spruce), and a stand has its own height and its own green. Sown one
          // by one at random, every wood was the same even mix from end to end.
          const conifer = zone === 'boreal' ? 1 : 0; const dry = fw.warm * (1 - fw.f) * 0.8;
          const sx = lon * D2R * Math.cos(lat * D2R), sy = lat * D2R, stA = Math.min(1, Math.max(0, (this.noiseAt(sx, sy, 4200, 0) - 0.5) * 3.2 + 0.5)), stB = Math.min(1, Math.max(0, (this.noiseAt(sx + 0.37, sy + 0.11, 3100, 1) - 0.5) * 2.6 + 0.5));
          let def = null; const Z = flora ? flora[zone] || flora.temperate : null;
          if (Z) { const fav = (k) => { const ph = fr(stA * 1.7 + k * 0.618 + (hash2(gx, gy, 62) - 0.5) * 0.12); return ph < 0.42 ? 1.9 : 0.22; };
            let tot = 0; for (let k = 0; k < Z.length; k++) { const e = Z[k]; if (!e.region || inBox(e.region, lon, lat)) tot += e.w * fav(k); }
            let r = hash2(gx, gy, 61) * tot; for (let k = 0; k < Z.length; k++) { const e = Z[k]; if (e.region && !inBox(e.region, lon, lat)) continue; def = e.def; r -= e.w * fav(k); if (r <= 0) break; } }
          if (under && (!def || !MODELS.card(def))) continue;      // (no pictures yet: no bushes)
          const v = 0.85 + hash2(gx, gy, 41) * 0.3;
          // seasons, for the trees that shed: autumn colour, then bare crowns in winter (each tree in its own week)
          let fall = 0, bare = 0;
          if (this.season && (def ? def.flora.deciduous : zone === 'temperate' || zone === 'easia')) { const north = lat > 0; const off = this.bareness ? (north ? this.bareness.x : this.bareness.y) : 0, autumn = north ? this.season.y : this.season.w; const decid = smooth(0.26, 0.4, fw.latN); fall = autumn * decid * (1 - off); bare = off * decid; }
          const lifeH = def ? def.h : 0;
          let leafless = false;
          if (def && bare > 0.12 + 0.7 * hash2(gx, gy, 71) && def.flora.bare) { const B = MODELS.defs[def.flora.bare]; if (B && B.card) { def = B; fall = 0; bare = 0; leafless = true; } }      // its leafless picture
          const f = GEO.enu(lon, lat);
          if (def) {
            // a real tree: life height by species, times the scale of the place it stands in
            // (a bush or a young tree is the crown of the tree alone, two to six metres of it; a tree in a wood is as tall as its stand)
            const crop = under ? (CROWN[def.id] === undefined ? 0.35 : CROWN[def.id]) : 0;
            const life = under ? Math.min(6.5, Math.max(1.6, lifeH * (0.1 + 0.16 * hash2(gx, gy, 21)))) * (fw.f > 0.4 ? 1 : 0.7) : lifeH * (0.72 + hash2(gx, gy, 21) * 0.5) * (0.84 + 0.34 * stB); const hgt = life * kEff;
            const I = this.impMesh(ti, def);
            if (I && I.count < I.instanceMatrix.count) {
              p.copy(f.up).multiplyScalar(1 + (h * exag - 0.15 * kEff) / R_M);
              // a tree right in front of the eye fills the picture, and a wood of them fills it many times over. The
              // nearest are placed first: once they have covered the picture a few times, no more big ones are added
              // (what they would show is behind the others already)
              if (camPos && (near || coverMin === 0)) { const dd = Math.sqrt((p.x - camPos.x) * (p.x - camPos.x) + (p.y - camPos.y) * (p.y - camPos.y) + (p.z - camPos.z) * (p.z - camPos.z)); const apx = hgt / R_M / Math.max(dd, 1e-9) * pxPerRad;
                const share = apx * apx * I.userData.aspect * 0.55 / screenPx; if (share > coverMin) { if (covered > coverCap) continue; covered += share; } }
              // (no two are of one build: each is a little broader or narrower than its picture, and leans a little its own way)
              basis.makeBasis(f.east, f.up, f.north.clone().negate()); q.setFromRotationMatrix(basis);
              this._yaw.setFromAxisAngle(this._fwd, (hash2(gx, gy, 45) - 0.5) * (under ? 0.3 : 0.13)); q.multiply(this._yaw);
              const wide = (0.86 + 0.3 * hash2(gx, gy, 44)) / (1 - crop);
              s.set(hgt * I.userData.aspect * wide / R_M, hgt / R_M, (hash2(gx, gy, 31) < 0.5 ? 1 : 3) / R_M); m.compose(p, q, s); I.setMatrixAt(I.count, m);
              const fr2 = 1 - fall, br = 1 - bare;                                    // the season: leaves turn, then go
              col.setRGB(v * (fr2 * br + fall * 1.75 + bare * 0.95), v * (fr2 * br + fall * 0.95 + bare * 0.78), v * (fr2 * br + fall * 0.35 + bare * 0.62));
              if (leafless) col.setRGB(v * 0.86, v * 0.77, v * 0.63);              // bare twigs are bark-brown and dark (the photographs, cut from a blue screen, come out pale and a little pink)
              if (under) col.setRGB(col.r * 0.74, col.g * 0.86, col.b * 0.62);        // scrub is dark and green whatever tree lent it its crown (an olive's is silver: as bushes they were boulders)
              // where snow lies it lies on the trees too: boughs and twigs go pale with it
              if (this.bareness && fw.kc) { const cold = Trees.COLD[fw.kc]; if (cold > 0.08) { const thr = 1.02 - 0.55 * cold; const frost = smooth(thr, thr + 0.1, lat > 0 ? this.bareness.z : this.bareness.w) * smooth(0.08, 0.5, cold) * (0.6 + 0.4 * hash2(gx, gy, 91));
                if (frost > 0.02) col.setRGB(col.r * (1 + 0.32 * frost), col.g * (1 + 0.34 * frost), col.b * (1 + 0.46 * frost)); } }
              // how deep in a wood it stands: by how much of the country round it is wood (a tree by a town, drawn at the town's
              // scale, is a tree on a green: it keeps its light)
              const wood = (kEff > kTier * 1.05 ? 0 : smooth(0.3, 0.72, fw.f)) * (leafless ? 0.4 : 1), dice = 0.55 * stB + 0.45 * hash2(gx, gy, 43);      // (a bare wood lets the light through)
              I.userData.tree.setXYZ(I.count, wood, dice, crop);
              I.setColorAt(I.count, col); I.count++; countM++;
              if (casters && !(window.SHADOWS && SHADOWS.ready && SHADOWS.enabled)) casters.push(lon, lat, hgt * I.userData.aspect * 0.8, hgt);   // with the depth map on, the card throws its own true shadow
              // slender trees stand closer than broad ones: a spruce or a birch brings a neighbour, so a wood of them closes its canopy too
              if (!under && I.userData.aspect < 0.78 && kEff <= kTier * 1.05 && hash2(gx, gy, 81) < density && I.count < I.instanceMatrix.count) {
                const a2 = hash2(gx, gy, 82) * 6.2832, r2 = (0.34 + 0.16 * hash2(gx, gy, 83)) * t.s; const lon2 = lon + Math.cos(a2) * r2 / (R_M * D2R * cl), lat2 = lat + Math.sin(a2) * r2 / (R_M * D2R);
                const h2 = ti === 0 ? T.meshHeightAt(lon2, lat2, vc) : h; const wa2 = ti < 2 ? T.waterAlpha(lon2, lat2) : 1; const rv2 = river && ti < 2 ? river.nearestRiver(lon2, lat2) : null;
                if (h2 > 0.5 && !(wa2 >= 0 && wa2 < 0.62) && !(rv2 && rv2.d < rv2.hw + 6)) {
                  const f2 = GEO.enu(lon2, lat2); const g2 = hgt * (0.78 + 0.3 * hash2(gx, gy, 84)); p.copy(f2.up).multiplyScalar(1 + (h2 * exag - 0.15 * kEff) / R_M);
                  basis.makeBasis(f2.east, f2.up, f2.north.clone().negate()); q.setFromRotationMatrix(basis);
                  s.set(g2 * I.userData.aspect / R_M, g2 / R_M, (hash2(gx, gy, 85) < 0.5 ? 1 : 3) / R_M); m.compose(p, q, s); I.setMatrixAt(I.count, m);
                  I.userData.tree.setXYZ(I.count, wood, 0.55 * stB + 0.45 * hash2(gx, gy, 87), 0);
                  col.multiplyScalar(0.94 + 0.12 * hash2(gx, gy, 86)); I.setColorAt(I.count, col); I.count++; countM++;
                }
              }
            }                                              // nothing of this species has arrived yet: the ground stays bare for the moment it takes
            continue;
          }
          if (under) continue;
          const hgt = (14 + hash2(gx, gy, 21) * 12) * kEff * (1 + conifer * 0.25);
          const wid = hgt * (0.55 - conifer * 0.15) * (ti === 2 ? 1.6 : 1);
          p.copy(f.up).multiplyScalar(1 + (h * exag - 1) / R_M);
          basis.makeBasis(f.east, f.up, f.north.clone().negate()); q.setFromRotationMatrix(basis);
          this._yaw.setFromAxisAngle(this._up, hash2(gx, gy, 31) * Math.PI * 2); q.multiply(this._yaw);
          s.set(wid / R_M, hgt / R_M, wid / R_M);
          col.setRGB((0.24 + dry * 0.28 - conifer * 0.06) * v * 0.66, (0.46 - dry * 0.1 - conifer * 0.12) * v * 0.66, (0.16 + conifer * 0.06) * v * 0.7);
          if (fall > 0.01) { const k = 0.4 + 0.6 * hash2(gx, gy, 31); col.setRGB(col.r * (1 - fall) + (0.62 * k + 0.3) * fall, col.g * (1 - fall) + (0.3 * k + 0.1) * fall, col.b * (1 - fall) + 0.05 * fall); }
          if (bare > 0.01) { col.setRGB(col.r * (1 - bare) + 0.3 * bare, col.g * (1 - bare) + 0.26 * bare, col.b * (1 - bare) + 0.22 * bare); }
          const isBroad = ti === 0 && zone !== 'boreal';
          if (isBroad) { s.set(wid * 1.4 / R_M, hgt * 0.85 / R_M, wid * 1.4 / R_M); m.compose(p, q, s); broad.setMatrixAt(countB, m); broad.setColorAt(countB, col); countB++; }
          else { m.compose(p, q, s); mesh.setMatrixAt(count, m); mesh.setColorAt(count, col); count++; }
          if (casters) casters.push(lon, lat, wid, hgt);
        }
      }
      mesh.count = count; GEO.touch(mesh.instanceMatrix, count); GEO.touch(mesh.instanceColor, count);
      if (ti === 0) { broad.count = countB; GEO.touch(broad.instanceMatrix, countB); GEO.touch(broad.instanceColor, countB); }
      for (const I of imps.values()) { GEO.touch(I.instanceMatrix, I.count); GEO.touch(I.instanceColor, I.count); GEO.touch(I.userData.tree, I.count); }      // only the trees placed: a species has room for a forest of itself
      this.modelCount[ti] = countM;
    }
  }
  window.TREES = { Trees };
})();
