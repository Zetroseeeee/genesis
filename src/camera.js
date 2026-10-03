// GENESIS map camera: orbit from space down to a hillside. Classic script; exposes window.MAPCAM.
(function () {
  const KM = 1 / 6371;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  class MapCamera {
    constructor(camera, dom, terrain) {
      this.camera = camera; this.dom = dom; this.terrain = terrain;
      this.lon = 30; this.lat = 20; this.dist = 2.7; this.tilt = 0; this.heading = 0;
      this.tLon = 30; this.tLat = 20; this.tDist = 2.7; this.tTilt = 0; this.tHeading = 0;
      this.autoTilt = true; this.minDist = 0.3 * KM; this.maxDist = 6;
      this.fly = null; this.vel = { lon: 0, lat: 0 };
      this.exag = terrain.exag;
      this.locked = false; // disables user input (intro)
      this.idleSpin = true;
      this._bind();
    }
    _bind() {
      const el = this.dom; let drag = null; let pinch = null;
      el.addEventListener('contextmenu', e => e.preventDefault());
      el.addEventListener('pointerdown', (e) => {
        if (this.locked) return; el.setPointerCapture(e.pointerId);
        drag = { x: e.clientX, y: e.clientY, id: e.pointerId, btn: e.button, mod: e.shiftKey || e.ctrlKey || e.metaKey, moved: 0, t: performance.now() };
        this.fly = null; this.vel.lon = 0; this.vel.lat = 0; this.idleSpin = false;
      });
      el.addEventListener('pointermove', (e) => {
        if (!drag || drag.id !== e.pointerId) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.btn === 2 || drag.mod) { this.tHeading -= dx * 0.005; this.tTilt = clamp(this.tTilt - dy * 0.005, 0, 1.45); this.autoTilt = false; }
        else this.pan(dx, dy);
      });
      const up = (e) => { if (drag && drag.id === e.pointerId) { const d = drag; drag = null; if (d.moved < 6 && d.btn === 0 && this.onClick) this.onClick(e.clientX, e.clientY); } };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', () => { drag = null; });
      el.addEventListener('wheel', (e) => { e.preventDefault(); if (this.locked) return; this.idleSpin = false; const f = Math.exp(Math.sign(e.deltaY) * 0.18 * Math.min(1, Math.abs(e.deltaY) / 60 + 0.4)); this.zoomAt(e.clientX, e.clientY, f); }, { passive: false });
      el.addEventListener('touchstart', (e) => { if (e.touches.length === 2) pinch = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 }; }, { passive: true });
      el.addEventListener('touchmove', (e) => { if (e.touches.length === 2 && pinch) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); this.zoomAt(pinch.x, pinch.y, pinch.d / d); pinch.d = d; } }, { passive: true });
      el.addEventListener('touchend', () => { pinch = null; }, { passive: true });
      window.addEventListener('keydown', (e) => {
        if (this.locked || e.target.tagName === 'INPUT') return; const s = 18;
        if (e.key === 'ArrowLeft' || e.key === 'a') this.pan(s, 0); if (e.key === 'ArrowRight' || e.key === 'd') this.pan(-s, 0);
        if (e.key === 'ArrowUp' || e.key === 'w') this.pan(0, s); if (e.key === 'ArrowDown' || e.key === 's') this.pan(0, -s);
        if (e.key === 'q') this.tHeading += 0.06; if (e.key === 'e') this.tHeading -= 0.06;
        if (e.key === 'r') { this.tTilt = clamp(this.tTilt + 0.06, 0, 1.45); this.autoTilt = false; } if (e.key === 'f') { this.tTilt = clamp(this.tTilt - 0.06, 0, 1.45); this.autoTilt = false; }
        if (e.key === '=' || e.key === '+') this.tDist = clamp(this.tDist * 0.8, this.minDist, this.maxDist); if (e.key === '-') this.tDist = clamp(this.tDist * 1.25, this.minDist, this.maxDist);
      });
    }
    groundMetersPerPixel() { const H = this.dom.clientHeight || 800; return this.dist * 2 * Math.tan(this.camera.fov * 0.5 * GEO.D2R) / H; }
    pan(dx, dy) {
      const mpp = this.groundMetersPerPixel() * (1 + Math.sin(this.tilt) * 0.8); // units per pixel
      const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
      // screen right = east*ch - north*sh ; screen up (forward) = north*ch + east*sh
      const ex = -dx * mpp, fy = dy * mpp;
      const east = ex * ch + fy * sh, north = -ex * sh + fy * ch;
      const cl = Math.max(0.05, Math.cos(this.tLat * GEO.D2R));
      this.tLon = GEO.wrapLon(this.tLon + east / cl * GEO.R2D);
      this.tLat = clamp(this.tLat + north * GEO.R2D, -88, 88);
    }
    zoomAt(cx, cy, factor) {
      const nd = clamp(this.tDist * factor, this.minDist, this.maxDist); factor = nd / this.tDist;
      // zoom toward the ground point under the cursor
      const hit = this.pickAt(cx, cy);
      if (hit && factor < 1) {
        let dl = GEO.wrapLon(hit.lon - this.tLon);
        this.tLon = GEO.wrapLon(this.tLon + dl * (1 - factor) * 0.9);
        this.tLat = clamp(this.tLat + (hit.lat - this.tLat) * (1 - factor) * 0.9, -88, 88);
      }
      this.tDist = nd;
      if (this.autoTilt) this.tTilt = this.autoTiltFor(nd);
    }
    autoTiltFor(d) { // 0 far -> ~52 deg at ground
      const t = clamp((Math.log(0.25) - Math.log(d)) / (Math.log(0.25) - Math.log(0.0015)), 0, 1);
      return t * t * (3 - 2 * t) * 0.95;
    }
    pickAt(cx, cy) {
      const r = this.dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, this.camera);
      return this.terrain.pick(rc.ray);
    }
    flyTo(lon, lat, dist, opts = {}) {
      const dur = opts.duration || 2.4;
      const d0 = this.dist, d1 = clamp(dist, this.minDist, this.maxDist);
      const ang = GEO.distKm(this.lon, this.lat, lon, lat) / 6371; // radians of travel
      const peak = Math.max(d0, d1, Math.min(4, ang * 1.6));
      this.fly = { t: 0, dur, lon0: this.lon, lat0: this.lat, lon1: GEO.wrapLon(lon), lat1: lat, d0, d1, peak, tilt0: this.tilt, tilt1: opts.tilt !== undefined ? opts.tilt : (this.autoTilt ? this.autoTiltFor(d1) : this.tilt), h0: this.heading, h1: opts.heading !== undefined ? opts.heading : this.heading, onDone: opts.onDone };
      this.idleSpin = false;
    }
    update(dt) {
      if (this.fly) {
        const f = this.fly; f.t = Math.min(f.dur, f.t + dt); const s = f.t / f.dur; const e = s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2;
        let dl = GEO.wrapLon(f.lon1 - f.lon0);
        this.tLon = this.lon = GEO.wrapLon(f.lon0 + dl * e); this.tLat = this.lat = f.lat0 + (f.lat1 - f.lat0) * e;
        // distance: up then down in log space
        const lp = Math.log(f.peak), l0 = Math.log(f.d0), l1 = Math.log(f.d1);
        const ld = s < 0.5 ? l0 + (lp - l0) * (e * 2) : lp + (l1 - lp) * ((e - 0.5) * 2);
        this.tDist = this.dist = Math.exp(Math.min(ld, Math.max(lp, Math.max(l0, l1))));
        this.tTilt = this.tilt = f.tilt0 + (f.tilt1 - f.tilt0) * e; this.tHeading = this.heading = f.h0 + (f.h1 - f.h0) * e;
        if (f.t >= f.dur) { this.fly = null; if (f.onDone) f.onDone(); }
      } else {
        if (this.idleSpin) this.tLon = GEO.wrapLon(this.tLon + dt * 1.2);
        this.tDist = clamp(this.tDist, this.minDist, this.maxDist); this.tLat = clamp(this.tLat, -89.5, 89.5); // whatever set the target, keep it inside the world
        const k = 1 - Math.exp(-dt * 9);
        let dl = GEO.wrapLon(this.tLon - this.lon); this.lon = GEO.wrapLon(this.lon + dl * k);
        this.lat += (this.tLat - this.lat) * k;
        this.dist = Math.exp(Math.log(this.dist) + (Math.log(this.tDist) - Math.log(this.dist)) * k);
        this.tilt += (this.tTilt - this.tilt) * k; this.heading += (this.tHeading - this.heading) * k;
      }
      this.apply();
    }
    apply() {
      const cam = this.camera; const T = this.terrain;
      const hT = T.heightAt(this.lon, this.lat);
      const target = GEO.toVec(this.lon, this.lat).multiplyScalar(1 + hT * this.exag / GEO.R_M);
      const f = GEO.enu(this.lon, this.lat);
      const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
      const forward = f.north.clone().multiplyScalar(ch).addScaledVector(f.east, sh);
      // clamp tilt so the camera doesn't dip under the horizon plane at low distances
      const pos = target.clone().addScaledVector(f.up, Math.cos(this.tilt) * this.dist).addScaledVector(forward, -Math.sin(this.tilt) * this.dist);
      // keep camera above the terrain
      const [cLon, cLat] = GEO.fromVec(pos);
      const hC = T.heightAt(cLon, cLat);
      const minR = 1 + (hC * this.exag + 60) / GEO.R_M;
      if (pos.length() < minR) pos.setLength(minR);
      cam.position.copy(pos);
      cam.up.copy(forward).multiplyScalar(Math.cos(this.tilt)).addScaledVector(f.up, Math.sin(this.tilt)).normalize();
      cam.lookAt(target);
      const alt = pos.length() - 1; // approx altitude (units)
      cam.near = Math.max(alt * 0.05, 2e-6); cam.far = pos.length() + 3; cam.updateProjectionMatrix();
      this.alt = alt; this.target = target; this.forward = forward;
    }
  }
  window.MAPCAM = { MapCamera };
})();
