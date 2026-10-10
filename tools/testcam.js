if (window.__G && __G.settings) __G.settings.qualityPinned = true; // software GL would otherwise drop to balanced and hide movers
// helpers evaluated inside the page for screenshot tests
window.__T = {
  cam(lon, lat, dist, tilt, heading) { const M = __G.mapcam; M.fly = null; M.lon = M.tLon = lon; M.lat = M.tLat = lat; M.dist = M.tDist = dist; M.tilt = M.tTilt = tilt; M.lift = M.tLift = 0; M.heading = M.tHeading = heading; M.autoTilt = false; },
  // a realm's knowledge set by hand needs the discoveries that go with it: everything up to its age (or the one given)
  // (and, for any realm but the player's, the laws of that age: a realm of a late age under the laws of a band is far behind its time.
  //  laws = true gives them to the player's realm too, false to nobody)
  teach(c, upto, laws) { const S = __G.sim; const e = upto === undefined ? S.eraOf(c.tech) : upto; for (const D of KNOW.LIST) if (D.era <= e) S.know.learn(c.id, c, D.id, true); S.know.lastT[c.id] = c.tech; S.know.pool[c.id] = 0; if (S.rule && (laws === true || (laws !== false && !c.player))) S.rule.settle(c.id, c); },
  era(tech, pop, walls, special) { const S = __G.sim; const c = S.playerCiv(); const cap = c.capital; c.tech = tech; c.era = S.eraOf(tech); __T.teach(c); if (pop !== undefined) S.pop[cap] = pop; if (walls !== undefined) S.walls[cap] = walls; if (special !== undefined) S.special[cap] = special; __G.run(3); return cap; },
  capital() { const S = __G.sim; const c = S.playerCiv(); return __G.world.siteOf(c.capital); },
};
// camera above a street of the capital: k-th street, 'back' metres behind its midpoint along the street, alt metres up
window.__T.street = function (k, back, alt) { const S = __G.sim; const c = S.playerCiv(); const cap = c.capital; const [sLon, sLat] = __G.world.siteOf(cap); const L = TOWN.layout(S, cap, c, {}); const st = L.streets[k % L.streets.length]; const cl = Math.cos(sLat * Math.PI / 180); const mLon = 1 / (6371000 * cl * Math.PI / 180), mLat = 1 / (6371000 * Math.PI / 180); const mx = (st[0] + st[2]) / 2, mz = (st[1] + st[3]) / 2; const dx = st[2] - st[0], dz = st[3] - st[1]; const len = Math.hypot(dx, dz) || 1; const ux = dx / len, uz = dz / len; const px = mx - ux * back, pz = mz - uz * back; const M = __G.mapcam; const lon = sLon + px * mLon, lat = sLat + pz * mLat; const heading = Math.atan2(ux, uz); __T.cam(lon, lat, alt / 6371000 / Math.cos(1.25), 1.25, heading); return { lon, lat, heading, len, n: L.streets.length }; };
// push the whole world into an era: every state gets the tech, capitals get the people for a city
window.__T.world = function (tech, capPop) { const S = __G.sim; for (const c of S.civs) { if (!c) continue; c.tech = tech; c.era = S.eraOf(tech); __T.teach(c, undefined, true); if (c.capital >= 0) S.pop[c.capital] = capPop; c.wealth += 5000; } __G.run(4); __G.world.refreshTextures(); };
// no envoys: whoever waits on the player is sent home, their screen is closed, and the realms that rule themselves keep their proposals to
// themselves from here on (a scenario that is not about envoys must find the turn button its own)
window.__T.quiet = function () { const S = __G.sim, c = S && S.playerCiv && S.playerCiv(); if (!c || !S.diplo) return 0; let n = 0; if (S.setStories) { S.setStories(false); if (c.story) c.story.q = null; if (window.TALES && TALES.isOpen()) TALES.close(); }      /* (stories are a matter for the scenario about them) */ for (const o of [...(c.dip ? c.dip.offers : [])]) { S.diplo.answer(c, o.id, false); n++; } for (const x of S.civs) if (x && !x.player && x.dip) x.dip.think = 1e12; if (window.ENVOYS && ENVOYS.isOpen()) ENVOYS.close(); return n; };
// make the cell 2 east of the capital a town of the same realm (for rails/roads tests)
window.__T.twin = function (pop) { const S = __G.sim; const c = S.playerCiv(); const cap = c.capital; const j = cap + 2; S.owner[j] = c.id; S.pop[j] = pop; S.land[j] = 1; __G.run(3); __G.world.refreshTextures(); return j; };
// camera over the first plane
window.__T.plane = function (dist) { const M = __G.movers; const s = M.planes[0]; if (!s) return null; const p = s.a.clone().lerp(s.b, s.t).normalize(); const [lon, lat] = GEO.fromVec(p); __T.cam(lon, lat, dist, 0.6, 0.4); return [lon, lat, M.planes.length]; };
// camera over the middle of the first inter-town road
window.__T.road = function (dist, t) { const r = __G.decal.roads && __G.decal.roads[0]; if (!r) return null; const [lon, lat] = r.f(t === undefined ? 0.5 : t); const [lon2, lat2] = r.f((t === undefined ? 0.5 : t) + 0.02); const heading = Math.atan2((lon2 - lon) * Math.cos(lat * Math.PI / 180), lat2 - lat); __T.cam(lon, lat, dist, 1.15, heading); return [lon, lat, r.rail, r.lenKm, __G.decal.roads.length]; };
// force the living world: an eruption of a named volcano, a wildfire at a point, a battle at the capital
window.__T.erupt = function (name, strength) { const S = __G.sim; const v = S.volcanoes.find(v => v.name === name); v.erupting = S.year; v.last = S.year; v.strength = strength || 2.5; return [v.lon, v.lat]; };
window.__T.fire = function (lon, lat, r) { const S = __G.sim; const i = (() => { const x = Math.floor((lon + 180) / 360 * 720), y = Math.floor((90 - lat) / 180 * 360); return y * 720 + x; })(); S.fires.push({ i, year: S.year, r: r || 2, dur: 2 }); return i; };
window.__T.battle = function (siege) { const S = __G.sim; const c = S.playerCiv(); const cap = c.capital; const e = S.civs.find(x => x && x !== c); if (siege) S.walls[cap] = 2; S.battles.push({ i: cap, from: cap + 1, year: S.year, a: e.id, b: c.id, siege: !!siege }); c.wars[e.id] = S.year; e.wars[c.id] = S.year; return cap; };
window.__T.quake = function (lon, lat, mag) { const S = __G.sim; const x = Math.floor((lon + 180) / 360 * 720), y = Math.floor((90 - lat) / 180 * 360); S.quakes.push({ i: y * 720 + x, year: S.year, mag: mag || 8 }); };
window.__T.flood = function () { const S = __G.sim; const c = S.playerCiv(); const cap = c.capital; const y = (cap / 720) | 0, x = cap - y * 720; const cells = []; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = (y + dy) * 720 + x + dx; if (S.land[j] && (S.flags[j] & 2)) cells.push(j); } S.floods.push({ i: cap, year: S.year, cells }); return cells.length; };
// heading (rad, from north toward east as the camera uses it) toward a world direction from the camera point
window.__T.headingTo = function (v) { const f = GEO.enu(__G.mapcam.lon, __G.mapcam.lat); return Math.atan2(f.east.dot(v), f.north.dot(v)); };

// What a part of the picture costs, measured in the page itself: one start of the app is too noisy to hold against another, and the
// build Mac's frame rates are the only ones that count. Each setting in turn (a name and what turns it on; they add up, so a later
// one must undo an earlier one if it should not count) runs for four seconds, and the frame rates are written into the picture with
// how many quads of ground were drawn. A tour line needs about five seconds a setting and fifteen over.
window.__T.cost = function (list, secs, settle) {
  const T = __G.terrain, out = [], el = document.createElement('div'); el.style.cssText = 'position:fixed;left:24%;top:8%;z-index:99999;background:#000;color:#fff;font:21px monospace;padding:14px;white-space:pre'; document.body.appendChild(el);
  let i = 0; const next = () => {
    if (i >= list.length) { out.push('tiles ' + T.stats.tiles + ', quads ' + T.stats.quads + ', ratio ' + window.devicePixelRatio + ', canvas ' + __G.renderer.domElement.width + 'x' + __G.renderer.domElement.height); el.textContent = out.join('\n'); return; }
    list[i][1](); setTimeout(() => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 < (secs || 4) * 1000) requestAnimationFrame(tick); else { out.push(list[i][0].padEnd(28) + (n / ((performance.now() - t0) / 1000)).toFixed(1) + ' fps  ' + T.stats.quads); el.textContent = out.join('\n'); i++; next(); } }; requestAnimationFrame(tick); }, settle || 800); };
  next();
};
// the usual questions, each undone before the next: the picture's last steps, the air, the ground's meshes, the pixels, the ground itself, the houses
window.__T.costs = function () {
  const T = __G.terrain, q = T.quadPx, R = __G.renderer, r0 = R.getPixelRatio();
  __T.cost([['all', () => {}], ['post off', () => { POST.off = true; }], ['and the air off', () => { AIR.on = false; }], ['air on, the old meshes', () => { AIR.on = true; T.quadPx = 0; }],
    ['a quarter of the pixels', () => { T.quadPx = q; R.setPixelRatio(r0 / 2); }], ['all pixels, no ground', () => { R.setPixelRatio(r0); T.group.visible = false; }],
    ['ground, no houses', () => { T.group.visible = true; __G.world.buildingGroup.visible = false; MODELS.group.visible = false; }], ['all again', () => { __G.world.buildingGroup.visible = true; MODELS.group.visible = true; POST.off = false; }]]);
};
// what the ground's own materials cost, part by part, each left out on top of the one before (uGndDbg in terrain.js): the relief,
// the second material, every colour looked up, the noise that bends the ladder, all of it; then the ground drawn the old way
// (two and a half seconds before each: a new shader may have to be made)
window.__T.costsGround = function () {
  const T = __G.terrain, g = window.TEX && TEX.ground, U = __G.globals; if (!g) return 'no materials';
  __T.cost([['all', () => {}], ['no relief', () => { U.uGndDbg.value = 1; }], ['and no second material', () => { U.uGndDbg.value = 2; }], ['and no colours looked up', () => { U.uGndDbg.value = 3; }],
    ['and no bending noise', () => { U.uGndDbg.value = 4; }], ['none of it', () => { U.uGndDbg.value = 5; }], ['the old ground', () => { U.uGndDbg.value = 0; TEX.ground = null; T.setTextures(TEX, true); }],
    ['all again', () => { TEX.ground = g; T.setTextures(TEX, true); }]], 3, 2500);
};
// what the trees cost: all; without what grows under them; with their outlines drawn pixel by pixel; none of them
// what the water costs, each left out on top of the one before: its waves (four lookups a pixel of water), what it mirrors (the sky and
// the sun's path), the field of the water's edge itself (then the coasts are drawn from the picture of the Earth, as they were)
window.__T.costsWater = function () {
  const T = __G.terrain, K = __G.globals.uSeaK.value;
  __T.cost([['all', () => {}], ['no waves', () => { K.w = 1; }], ['and nothing mirrored', () => { K.w = 2; }], ['and no field of the shore', () => { T.waterOff = true; }],
    ['all again', () => { K.w = 0; T.waterOff = false; }]], 4, 2500);
};
window.__T.costsTrees = function () {
  const Tr = __G.trees; if (!Tr) return 'no trees'; const show = (ti, on) => { for (const I of Tr.imps[ti].values()) I.visible = on; };
  __T.cost([['all (' + Tr.modelCount.join(' ') + ')', () => {}], ['no undergrowth', () => { show(3, false); }], ['and edges by the pixel', () => { Tr.coverOff = true; }], ['and no far trees', () => { show(1, false); show(2, false); }],
    ['no trees at all', () => { show(0, false); }], ['all again', () => { for (let t = 0; t < 4; t++) show(t, true); Tr.coverOff = false; }], ['no undergrowth again', () => { show(3, false); }], ['all a third time', () => { show(3, true); }]], 3, 1500);
};
// how many ways the ground's materials need be looked at where the ground runs away from the eye (the card's own filtering:
// 16 as the game has them, then 8 and 4), twice over
window.__T.costsAniso = function () {
  const g = window.TEX && TEX.ground; if (!g) return 'no materials'; const full = window.GENESIS_ANISO || 16, set = (n) => () => { __T.aniso(n, g.albedo, g.relief); };
  __T.cost([[full + ' ways', () => {}], ['8 ways', set(8)], ['4 ways', set(4)], [full + ' again', set(full)], ['8 again', set(8)], ['4 again', set(4)], [full + ' a third time', set(full)]], 3, 1200);
};
// how fine the ground's meshes need be, now that a pixel of ground costs what it does: quads of 8 pixels (as the game has them), 4, 6, 12
window.__T.costsMesh = function () {
  const T = __G.terrain, q = T.quadPx;
  __T.cost([['quads of ' + q + ' px', () => {}], ['of 4', () => { T.quadPx = 4; }], ['of 6', () => { T.quadPx = 6; }], ['of 12', () => { T.quadPx = 12; }], ['of ' + q + ' again', () => { T.quadPx = q; }], ['of 4 again', () => { T.quadPx = 4; }], ['of ' + q + ' a third time', () => { T.quadPx = q; }]], 3, 2500);
};
// what the picture of the Earth costs now that it is eight times as fine: looked at in fewer ways where the ground runs away from
// the eye (the card's own filtering: 16 as the game has it, then 4 and 2), and no finer than it used to be (level 3, five kilometres
// to a texel: what the game had until 0.21) - each undone before the next
window.__T.costsPlanet = function () {
  const T = __G.terrain, full = T.opts.anisotropy || 16, top = T.imgMax, packs = () => [...T.packs.values()].filter((p) => p.kind === 'i' && p.texture).map((p) => p.texture), set = (n) => () => { __T.aniso(n, ...packs()); };
  __T.cost([['all (' + packs().length + ' packs, ' + full + ' ways)', () => {}], ['the picture 4 ways', set(4)], ['2 ways', set(2)], [full + ' ways again', set(full)], ['no finer than level 3', () => { T.imgMax = 3; }],
    ['and 2 ways', set(2)], ['all again (' + top + ', ' + full + ')', () => { T.imgMax = top; setTimeout(set(full), 1500); }], ['all a third time', set(full)]], 3, 3000);
};
// what the Earth's own winter costs (the second layer of the planet's maps: where snow lies and for how long, where the sea
// freezes, the country before the plough): the ground's shader as it is, and as it is compiled without that layer (one lookup
// fewer a pixel, and the rules the game had until 0.21: snow by the climate's class, ice by the latitude) - turn and turn about,
// because one measurement of four seconds is within an eighth of the next of the very same thing on the build Mac
window.__T.costsWinter = function () {
  const T = __G.terrain, G = T.globals, arr = G.uInfo.value; if (!(arr && arr.isDataTexture2DArray)) return 'the planet\'s maps are one layer here';
  const im = arr.image, flat = new THREE.DataTexture(im.data.subarray(0, im.width * im.height * 4), im.width, im.height, THREE.RGBAFormat);
  flat.wrapS = THREE.RepeatWrapping; flat.wrapT = THREE.ClampToEdgeWrapping; flat.minFilter = flat.magFilter = THREE.LinearFilter; flat.generateMipmaps = false; flat.needsUpdate = true;
  // (and the shader as it is with a second layer that says what the old rules took for granted - no woods by nature, snow all
  //  winter, no ice of the sea's own: the same sums over other numbers, which tells what the sums cost from what they draw)
  const d2 = new Uint8Array(im.width * im.height * 8); d2.set(im.data.subarray(0, im.width * im.height * 4), 0); for (let o = im.width * im.height * 4; o < d2.length; o += 4) { d2[o] = 0; d2[o + 1] = 128; d2[o + 2] = 255; d2[o + 3] = 255; }
  const blank = new THREE.DataTexture2DArray(d2, im.width, im.height, 2); blank.format = arr.format; blank.type = arr.type; blank.wrapS = arr.wrapS; blank.wrapT = arr.wrapT; blank.minFilter = blank.magFilter = THREE.LinearFilter; blank.generateMipmaps = false; blank.needsUpdate = true;
  const use = (tex) => () => { G.uInfo.value = tex; for (const t of T.tiles.values()) { const m = t.mesh.material; m.defines = T.defines(); m.needsUpdate = true; } };
  const list = window.__costOld ? [['as it is', () => {}], ['the old rules', use(flat)]] : [['as it is', () => {}], ['the old rules', use(flat)], ['its sums, the old numbers', use(blank)], ['as it is again', use(arr)], ['the old rules again', use(flat)], ['its sums, the old numbers', use(blank)], ['as it is, a third time', use(arr)], ['the old rules, a third', use(flat)], ['its sums, the old numbers', use(blank)], ['as it is, a fourth', use(arr)]];
  __T.cost(list, 4, 5000);      // (window.__costOld: stop at the old rules, to see what they draw)
};
// what the weather costs (climate.js: the ice sheets, the green lands, the droughts, worked out at the corners of the ground's mesh and
// drawn in its fragment shader where there is any): as it is, and with the ground's shader told there is no weather - turn and turn about
window.__T.costsClimate = function () {
  const on = () => { window.__noWeather = false; __G.climateRefresh && __G.climateRefresh(); }, off = () => { window.__noWeather = true; __G.climateRefresh && __G.climateRefresh(); };
  __T.cost([['the weather', on], ['none', off], ['the weather again', on], ['none again', off], ['the weather a third time', on], ['none a third time', off], ['the weather', on]], 4, 1500);
};
// The old heights (data/e: one byte a texel, the high mountains smooth) in place of the new (data/h), or back: every elevation
// pack is let go and the ground asks again - to hold the two against each other in one page
window.__T.oldHeights = function (on) {
  const T = __G.terrain; if (T._heights === undefined) T._heights = T.heights; T.heights = on ? null : T._heights; T.elevMax = T.heights ? T.heights.maxLevel : 7;
  for (const [k, p] of [...T.packs]) if (p.kind === 'e') { if (p.texture) p.texture.dispose(); T.packs.delete(k); }
  for (const t of T.tiles.values()) t.ePack = null;
  return T.heights ? 'the heights' : 'the old packs';
};
// What the heights cost against the old packs, turn and turn about (a new pack for every tile each time: settle long)
// What the near ground costs (terrain.js: the heights' Catmull-Rom surface, elevCR; the gullies, gullyIn), turn and turn about
window.__T.costsNear = function () {
  const T = __G.terrain, K = T.uGulK.value, k0 = K.clone();
  const set = (cr, gul) => { T.uElevCR.value = cr; if (gul) K.copy(k0); else K.set(k0.x, k0.y, 0, 0); };
  __T.cost([['as it is', () => set(1, 1)], ['no gullies', () => set(1, 0)], ['weighed between four', () => set(0, 0)], ['as it is again', () => set(1, 1)], ['no gullies again', () => set(1, 0)], ['weighed between four again', () => set(0, 0)], ['as it is a third time', () => set(1, 1)]], 4, 3000);
};
window.__T.costsHeights = function () {
  __T.cost([['the heights', () => { __T.oldHeights(false); }], ['the old packs', () => { __T.oldHeights(true); }], ['the heights again', () => { __T.oldHeights(false); }], ['the old packs again', () => { __T.oldHeights(true); }], ['the heights a third time', () => { __T.oldHeights(false); }]], 4, 12000);
};
// What the sky costs (sky.js), turn and turn about: as it is; without the clouds; the clouds without their heaps and grain (the
// picture of the Earth's clouds alone, as from far out: two lookups a pixel and not twenty); without the stars
window.__T.costsSky = function () {
  const W = __G.world, C = W.cloudLayer, St = W.starField; if (!C) return 'no clouds';
  const all = () => { W.cloudsOn = true; C.grainOff = false; if (St) St.points.material.visible = true; };
  __T.cost([['as it is', all], ['no clouds', () => { W.cloudsOn = false; }], ['clouds, no heaps', () => { W.cloudsOn = true; C.grainOff = true; }], ['no stars', () => { C.grainOff = false; if (St) St.points.material.visible = false; }],
    ['as it is again', all], ['no clouds again', () => { W.cloudsOn = false; }], ['clouds, no heaps again', () => { W.cloudsOn = true; C.grainOff = true; }], ['as it is a third time', all]], 4, 2000);
};
// What the ground has to show and what it is still waiting for, written into the picture once a second: __T.watch(). The frame
// rate of the last second, the packs by kind and state, and what every tile in the picture is drawn with: the picture, the heights
// and the water's edge by level ('-' none, 'f' no shore near). A view is whole when nothing is loading and the levels stand still.
window.__T.watch = function () {
  const T = __G.terrain, el = document.createElement('div'); el.style.cssText = 'position:fixed;left:14%;top:40%;z-index:99999;background:#000;color:#fff;font:17px monospace;padding:10px;white-space:pre'; document.body.appendChild(el);
  const t0 = performance.now(); let frames = 0, last = t0; const tick = () => { frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  const j = (o) => Object.keys(o).sort().map((k) => k + ':' + o[k]).join(' '); let busy = 0, was = '', grown = 0, wasT = '';
  setInterval(() => {
    const now = performance.now(), fps = frames / ((now - last) / 1000); frames = 0; last = now;
    const st = {}; for (const p of T.packs.values()) { const k = p.kind + ' ' + p.state; st[k] = (st[k] || 0) + 1; }
    const w = [0, 0, 0], iL = {}, eL = {}, wL = {}; let n = 0;
    for (const t of T.tiles.values()) { if (!t.inScene) continue; n++; w[Math.round(t.uniforms.uWaterP.value.x)]++; const a = t.iPack && !t.iPack.absent ? t.iPack.level : '-', b = t.ePack && !t.ePack.absent ? t.ePack.level : '-', c = t.wPack ? (t.wPack.pack ? t.wPack.level : 'f') : '-'; iL[a] = (iL[a] || 0) + 1; eL[b] = (eL[b] || 0) + 1; wL[c] = (wL[c] || 0) + 1; }
    const sec = (now - t0) / 1000, sig = j(iL) + j(eL) + j(wL), Tr = __G.trees, trees = Tr ? Tr.modelCount.join(' ') : '-';
    if (T.loading > 0 || sig !== was) busy = sec; was = sig; if (trees !== wasT) grown = sec; wasT = trees;      // (the last second in which something was on its way or changed)
    el.textContent = sec.toFixed(0) + ' s  ' + fps.toFixed(1) + ' fps  tiles ' + n + '  loading ' + T.loading + '  bundles ' + (T.bundles ? T.bundles.size : '-') + '   the ground whole since ' + busy.toFixed(0) + ' s' + '\npacks  ' + j(st) + '\nthe picture by level  ' + j(iL) + '\nthe heights by level  ' + j(eL) + '\nthe water: the mask ' + w[0] + ', a pack ' + w[1] + ', no shore near ' + w[2] + '; by level  ' + j(wL) + '\ntrees ' + trees + ', unchanged since ' + grown.toFixed(0) + ' s';
  }, 1000);
};
// how many ways a texture is looked at where it runs away from the eye, set on the card as it is (no new upload): __T.aniso(n, textures...)
window.__T.aniso = function (n, ...texs) {
  const R = __G.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_texture_filter_anisotropic'); if (!ext) return 0; let k = 0;
  for (const x of texs) { if (!(x && x.isTexture)) continue; const q = R.properties.get(x); if (!q.__webglTexture) continue; const tg = x.isDataTexture2DArray ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D; gl.bindTexture(tg, q.__webglTexture); gl.texParameterf(tg, ext.TEXTURE_MAX_ANISOTROPY_EXT, n); k++; }
  R.state.reset(); return k;
};

// The eye turned to a place in the sky (the game's camera looks at the ground; mapcam.lift raises it): a direction in the globe's
// frame, the Moon, or a star by its right ascension (hours) and declination (degrees) as the catalogues have it for 2000.
// window.__moonAge holds the Moon at an age (0 new, pi full) as __sunLock holds the sun; window.__skyYear gives the sky of a year
// (2000: the stars as the catalogues have them) whatever the world's own.
window.__T.face = function (d) { const M = __G.mapcam, f = GEO.enu(M.lon, M.lat), el = Math.asin(Math.max(-1, Math.min(1, d.dot(f.up)))), az = Math.atan2(d.dot(f.east), d.dot(f.north)); M.autoTilt = false; M.tilt = M.tTilt = 1.45; M.heading = M.tHeading = az; M.lift = M.tLift = Math.max(0, Math.min(1.55, el + (Math.PI / 2 - 1.45))); return { height: +(el * 180 / Math.PI).toFixed(1), bearing: +(az * 180 / Math.PI).toFixed(1) }; };
window.__T.faceMoon = function () { return __T.face(__G.world._moon); };
window.__T.faceStar = function (raH, dec) { const a = raH * 15 * Math.PI / 180, de = dec * Math.PI / 180; return __T.face(new THREE.Vector3(Math.cos(de) * Math.cos(a), Math.sin(de), -Math.cos(de) * Math.sin(a)).applyMatrix4(__G.world.skyTurn)); };
// The sky's shaders and sums, taken anew from src/sky.js into a page that is running (tools/live.js: /load?file=sky.js, then
// __T.resky()): the clouds and the stars are given the new ones. (The Moon and the Milky Way are drawn by the sky's own shader
// in world.js, which needs a new page.)
window.__T.resky = function (more) { const W = __G.world, C = W.cloudLayer, out = [];      // (more: uniforms the new shader has and the page's clouds do not yet know, { name: value })
  if (C) { Object.setPrototypeOf(C, SKY.Clouds.prototype); const m = C.mesh.material; if (more) for (const k in more) if (!C.uniforms[k]) C.uniforms[k] = { value: more[k] }; m.vertexShader = SKY.CLOUD_V(AIR.VERT); m.fragmentShader = SKY.CLOUD_F(AIR.FRAG); m.needsUpdate = true; out.push('clouds'); }
  if (W.starField) { Object.setPrototypeOf(W.starField, SKY.Stars.prototype); const m = W.stars.material; m.vertexShader = SKY.STAR_V; m.fragmentShader = SKY.STAR_F; m.needsUpdate = true; out.push('stars'); }
  return out.join(' '); };
// The ground's shaders, taken anew from src/terrain.js into a page that is running (tools/live.js: /load?file=terrain.js, then
// __T.reshade()): every tile is given the new ones, and tiles made from now on get them too. Seconds, where a new page takes minutes.
window.__T.reshade = function (more) { const T = __G.terrain; Object.setPrototypeOf(T, TERRAIN.Terrain.prototype); if (more) for (const k in more) if (!T.globals[k]) T.globals[k] = { value: more[k] };      // (more: uniforms the new shader has and the page's game does not yet know, { name: value })
  let n = 0; for (const t of T.tiles.values()) { const m = t.mesh.material; for (const k in T.globals) if (!m.uniforms[k]) m.uniforms[k] = T.globals[k]; m.vertexShader = TERRAIN.VERT; m.fragmentShader = TERRAIN.FRAG; m.needsUpdate = true; n++; } return n; };
// The ground's materials read again from data/tex (a new pack: tools/ground/pack.sh) and put to use; resolves to when the pack was made.
window.__T.reground = function () { return TEX.reloadGround().then((g) => { __G.terrain.setTextures(TEX, true); return g ? g.made : null; }); };
