// GENESIS geo helpers. Unit sphere radius 1 == 6371 km. Classic script, exposes window.GEO.
(function () {
  const R_KM = 6371, R_M = 6371000;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  function toVec(lonDeg, latDeg, out) {
    const lon = lonDeg * D2R, lat = latDeg * D2R, cl = Math.cos(lat);
    out = out || new THREE.Vector3();
    return out.set(cl * Math.cos(lon), Math.sin(lat), -cl * Math.sin(lon));
  }
  function fromVec(v) { // -> [lon, lat] degrees
    const n = Math.hypot(v.x, v.y, v.z) || 1;
    return [Math.atan2(-v.z, v.x) * R2D, Math.asin(Math.max(-1, Math.min(1, v.y / n))) * R2D];
  }
  function enu(lonDeg, latDeg) { // east, north, up unit vectors
    const lon = lonDeg * D2R, lat = latDeg * D2R;
    const east = new THREE.Vector3(-Math.sin(lon), 0, -Math.cos(lon));
    const north = new THREE.Vector3(-Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon));
    const up = toVec(lonDeg, latDeg);
    return { east, north, up };
  }
  // great-circle distance in km
  function distKm(lon1, lat1, lon2, lat2) {
    const a = toVec(lon1, lat1), b = toVec(lon2, lat2);
    return Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * R_KM;
  }
  // tile math: level L has 2^(L+1) x 2^L equirect tiles
  function tileBounds(L, tx, ty) {
    const n = 1 << L; const w = 360 / (2 * n), h = 180 / n;
    const lon0 = -180 + tx * w, lat0 = 90 - ty * h; // lat0 = north edge
    return { lon0, lon1: lon0 + w, lat0, lat1: lat0 - h, w, h };
  }
  function tileAt(L, lonDeg, latDeg) {
    const n = 1 << L; let tx = Math.floor((lonDeg + 180) / 360 * 2 * n), ty = Math.floor((90 - latDeg) / 180 * n);
    tx = ((tx % (2 * n)) + 2 * n) % (2 * n); ty = Math.max(0, Math.min(n - 1, ty)); return [tx, ty];
  }
  function wrapLon(l) { return ((l + 180) % 360 + 360) % 360 - 180; }
  // Send a buffer's first n items to the GPU, not the whole of it. Instance buffers are allocated for the most a layer
  // could ever draw (tens of thousands of trees per species) and usually hold a small part of that: sending megabytes
  // of unused slots on every rebuild costs frames (and stalls a software renderer for seconds).
  function touch(attr, n) { if (!attr) return; if (n > 0) { attr.updateRange.offset = 0; attr.updateRange.count = Math.min(attr.array.length, n * attr.itemSize); attr.needsUpdate = true; } }
  window.GEO = { R_KM, R_M, D2R, R2D, toVec, fromVec, enu, distKm, tileBounds, tileAt, wrapLon, touch };
})();
