// Holocene: what a frame goes through between the scene and the screen (classic script; exposes window.POST).
//
// The scene is drawn as it always was, but into a target that keeps light brighter than white (half floats, four samples a
// pixel) and its depth. Then, in order:
//   shade    what stands close together darkens what is between: ambient occlusion, worked out from the depth alone
//            (alleys, courtyards, the foot of a wall, the inside of a wood)
//   glow     what is brighter than white bleeds into what is beside it: the sun and its image on water, fires and lamps
//   develop  a little contrast and colour, a shoulder that rolls bright things off into white instead of cutting them
//            flat, darker corners, and grain enough to keep a sky's gradients from banding
// The scene's own shaders still work in the colours of the screen (they were tuned by eye there). This file takes what
// they write as such: 0 to 1 is the picture as it was, and only what they write above 1 is "more than white".
//
// Twelve small passes a frame at most: the shade at half size and its smoothing (two), the glow from a quarter size down and up
// again (nine), and the last, which brings the shade up to the full picture, adds the glow and develops.
//
// Nothing here knows about the game: main.js hands over the renderer, the scene and the camera, and how high the camera is.
window.POST = (function () {
  'use strict';
  const P = { ready: false, hdr: false, w: 0, h: 0, drawn: 0, broken: false, asked: false,
    // what can be turned: each 0 = off, 1 = as designed
    shade: 1, glow: 1, develop: 1, reach: null, far: 60,      // (reach: [share of the distance, near, wide] to try other shades by hand; far: the shade is down to a third at 1 / far Earth radii: 106 km)
    wide: 1.0,         // how much more each wider ring of the glow counts than the one inside it: 0 = a tight glow, more = a broad glare round the sun
    samples: 4 };      // samples a pixel in the scene's own picture (to try others: set it, then POST.w = 0 for new targets)
  let rtScene = null, rtA = null, rtB = null; const down = [], up = []; let LEVELS = 5;
  const qScene = new THREE.Scene(), qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const quad = new THREE.Mesh(tri, null); quad.frustumCulled = false; qScene.add(quad);
  const VERT = 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const mat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });

  // how far away a pixel is, from the depth the scene left (an ordinary perspective depth: uProj = P00, P11, near, far), and where it is
  // in the camera's own space
  const DEPTH = `
    uniform sampler2D tDepth; uniform vec4 uProj;
    float viewZ(vec2 uv) { float d = texture2D(tDepth, uv).x; return uProj.z * uProj.w / (uProj.w - d * (uProj.w - uProj.z)); }
    vec3 posAt(vec2 uv, float z) { return vec3((uv * 2.0 - 1.0) / uProj.xy * z, -z); }
    float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }`;

  // ---------- shade ----------
  // For every pixel: the surface there and which way it faces (from its neighbours' depths), then a dozen looks around it on a spiral.
  // Whatever stands above the surface nearby hides some of the sky from it. The reach is a fixed share of the distance to the pixel, so
  // the shade is as wide on the screen at every height: a doorway from the street, a quarter of a town from above it.
  const SHADE = `
    ${DEPTH}
    uniform vec2 uPx; uniform vec3 uReach; uniform float uFar; varying vec2 vUv;      // uReach: the reach as a share of the distance, how much the near shade counts, how much the wide; uFar: how fast the shade thins with distance
    float hid(vec2 uv0, vec3 p, vec3 n, float z, float reach, float a0, float bias) {
      vec2 rUv = uProj.xy * reach * 0.5; float R = reach * z, sum = 0.0;
      for (int i = 0; i < 8; i++) {
        float t = (float(i) + 0.5) / 8.0, a = a0 + t * 14.4;      // (two and a bit turns)
        vec2 uv2 = uv0 + vec2(cos(a), sin(a)) * rUv * (0.15 + 0.85 * t);
        vec3 v = (posAt(uv2, viewZ(uv2)) - p) / R;                   // in reaches: small numbers stay well-conditioned
        float vv = dot(v, v), vn = dot(v, n);
        sum += max(vn - bias, 0.0) / (vv + 0.02) * (1.0 - smoothstep(0.5, 1.0, vv));
      }
      return sum / 8.0;
    }
    void main() {
      vec2 uv0 = (floor(vUv / uPx) + 0.5) * uPx;      // (the middle of a texel of the depth: this picture is half its size, and its own middles fall between four of them)
      float d0 = texture2D(tDepth, uv0).x; if (d0 >= 0.99999994) { gl_FragColor = vec4(1.0); return; }      // the sky is not shaded
      float z = viewZ(uv0); vec3 p = posAt(uv0, z);
      vec2 dx = vec2(uPx.x, 0.0), dy = vec2(0.0, uPx.y);
      float zl = viewZ(uv0 - dx), zr = viewZ(uv0 + dx), zd = viewZ(uv0 - dy), zu = viewZ(uv0 + dy);
      // (the nearer neighbour each way: across an edge the farther one belongs to something else)
      vec3 ex = abs(zr - z) < abs(z - zl) ? posAt(uv0 + dx, zr) - p : p - posAt(uv0 - dx, zl);
      vec3 ey = abs(zu - z) < abs(z - zd) ? posAt(uv0 + dy, zu) - p : p - posAt(uv0 - dy, zd);
      vec3 n = normalize(cross(ex, ey));
      // (a surface seen nearly edge-on is known less exactly: it is given more room before anything counts as standing above it)
      float bias = 0.04 + 0.22 * (1.0 - clamp(dot(n, normalize(-p)), 0.0, 1.0));
      // two reaches: a near one for the line where things meet (a wall and the ground), a wide one for what stands around (an alley, a court)
      float a0 = ign(gl_FragCoord.xy) * 6.2831853;
      float near = hid(uv0, p, n, z, uReach.x * 0.28, a0, bias), wide = hid(uv0, p, n, z, uReach.x, a0 + 2.4, bias);
      // (far off the air is between: what it adds is not in shade, so the shade thins out with the distance as the ground's own light does)
      gl_FragColor = vec4(1.0 - clamp(near * uReach.y + wide * uReach.z, 0.0, 1.0) * exp(-z * uFar));
    }`;

  // Each pixel of the shade looked round by its own turn of the spiral, which leaves a grain five pixels wide. It is evened out
  // over five by five (nine looks, each between two pixels or on one, weighed so that all twenty-five count alike), taking only
  // those that lie as deep as the pixel does, so that a roof's shade does not spill onto the street behind it.
  const SMOOTH = `
    ${DEPTH}
    uniform sampler2D tShade; uniform vec2 uHalf; varying vec2 vUv;
    void main() {
      float z = viewZ(vUv), sum = 0.0, w = 0.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 uv = vUv + uHalf * vec2(float(i), float(j)) * 1.5;
        float k = (i == 0 ? 1.0 : 2.0) * (j == 0 ? 1.0 : 2.0) * max(0.0, 1.0 - abs(viewZ(uv) - z) / (0.02 * z)); sum += texture2D(tShade, uv).r * k; w += k;
      }
      gl_FragColor = vec4(w > 0.02 ? sum / w : texture2D(tShade, vUv).r);
    }`;

  // ---------- glow ----------
  // what is above white, at a quarter of the size: sixteen pixels to one, in four groups each weighed down by its own brightness
  // (so that one burning pixel does not flicker as it moves)
  const BRIGHT = `
    uniform sampler2D tScene; uniform vec2 uPx; uniform float uKnee; varying vec2 vUv;
    vec3 over(vec2 uv) { vec3 c = max(texture2D(tScene, uv).rgb, 0.0); float l = max(c.r, max(c.g, c.b)); return c * (max(l - uKnee, 0.0) / max(l, 1e-4)); }
    void main() {
      vec3 a = over(vUv + uPx * vec2(-1.0, -1.0)), b = over(vUv + uPx * vec2(1.0, -1.0)), c = over(vUv + uPx * vec2(-1.0, 1.0)), d = over(vUv + uPx * vec2(1.0, 1.0));
      float wa = 1.0 / (1.0 + dot(a, vec3(0.3333))), wb = 1.0 / (1.0 + dot(b, vec3(0.3333))), wc = 1.0 / (1.0 + dot(c, vec3(0.3333))), wd = 1.0 / (1.0 + dot(d, vec3(0.3333)));
      gl_FragColor = vec4((a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd), 1.0);
    }`;
  // halved and halved again, then brought back up, each size adding its own width of glow (the two filters of Bjorge's "dual" blur)
  const DOWN = `
    uniform sampler2D tSrc; uniform vec2 uPx; varying vec2 vUv;
    void main() { vec3 s = texture2D(tSrc, vUv).rgb * 4.0; s += texture2D(tSrc, vUv + uPx * vec2(-1.0, -1.0)).rgb; s += texture2D(tSrc, vUv + uPx * vec2(1.0, -1.0)).rgb; s += texture2D(tSrc, vUv + uPx * vec2(-1.0, 1.0)).rgb; s += texture2D(tSrc, vUv + uPx * vec2(1.0, 1.0)).rgb; gl_FragColor = vec4(s / 8.0, 1.0); }`;
  const UP = `
    uniform sampler2D tSrc, tAdd; uniform vec2 uPx; uniform float uAdd, uSrc; varying vec2 vUv;
    void main() {
      vec3 s = texture2D(tSrc, vUv + uPx * vec2(-2.0, 0.0)).rgb + texture2D(tSrc, vUv + uPx * vec2(2.0, 0.0)).rgb + texture2D(tSrc, vUv + uPx * vec2(0.0, -2.0)).rgb + texture2D(tSrc, vUv + uPx * vec2(0.0, 2.0)).rgb;
      s += (texture2D(tSrc, vUv + uPx * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uPx * vec2(1.0, -1.0)).rgb + texture2D(tSrc, vUv + uPx * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uPx * vec2(1.0, 1.0)).rgb) * 2.0;
      gl_FragColor = vec4(s / 12.0 * uSrc + texture2D(tAdd, vUv).rgb * uAdd, 1.0);
    }`;

  // ---------- the last pass: the shade brought up, the glow added, the picture developed ----------
  const FINAL = `
    ${DEPTH}
    uniform sampler2D tScene, tShade, tGlow; uniform float uShade, uGlow, uDevelop, uTime, uShow; uniform vec2 uRes, uHalf; varying vec2 vUv;
    // the shade, brought up from half size to the full picture: from the four half-size pixels round each pixel, by how near each is
    // and whether it lies as deep as the pixel does (so the edge of a roof stays as sharp as the roof)
    float shadeAt() {
      vec2 p = vUv / uHalf - 0.5, b = floor(p), f = p - b; float z = viewZ(vUv), sum = 0.0, w = 0.0;
      for (int j = 0; j <= 1; j++) for (int i = 0; i <= 1; i++) {
        vec2 uv = (b + vec2(float(i), float(j)) + 0.5) * uHalf;
        float k = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y) * max(0.02, 1.0 - abs(viewZ(uv) - z) / (0.02 * z)); sum += texture2D(tShade, uv).r * k; w += k;
      }
      return sum / max(w, 1e-5);
    }
    void main() {
      if (uShow > 0.5) { gl_FragColor = vec4(uShow < 1.5 ? vec3(uShade > 0.0 ? shadeAt() : 1.0) : texture2D(tGlow, vUv).rgb, 1.0); return; }      // (to look at a part by itself: POST.show = 1 the shade, 2 the glow)
      vec4 sc = texture2D(tScene, vUv); vec3 c = max(sc.rgb, 0.0);
      // shade: what is in shade loses some of its light, and a little more of its red than of its blue (it is lit by the sky alone)
      // (it is the sky's light that is hidden, not the sun's: what stands in full sun keeps most of its brightness)
      if (uShade > 0.0) {
        float sh = shadeAt(); sh = mix(sh, 1.0, 0.5 * smoothstep(0.45, 0.95, dot(c, vec3(0.3, 0.6, 0.1)))); sh = mix(1.0, sh, uShade * smoothstep(0.1, 0.6, sc.a));      // (not on open water: the ground's shader says where that is in the picture's fourth channel)
        c *= mix(vec3(sh), vec3(sh * sh, sh * sqrt(sh), sqrt(sh)), 0.22);
      }
      c += texture2D(tGlow, vUv).rgb * uGlow;
      // develop: contrast about a middle grey, a little more colour, the shoulder, the corners, the grain
      vec3 g = (c - 0.30) * (1.0 + 0.09 * uDevelop) + 0.30 + 0.012 * uDevelop; g = max(g, 0.0);      // (about a dark grey: the shadows stay where they were, what is lit gains)
      float l = dot(g, vec3(0.2126, 0.7152, 0.0722)); g = max(mix(vec3(l), g, 1.0 + 0.10 * uDevelop), 0.0);
      const float A = 0.80, L = 1.035; vec3 hi = A + (L - A) * (1.0 - exp(-(g - A) / (L - A))); g = mix(g, hi, step(A, g));
      vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y * 0.8; g *= 1.0 - 0.11 * uDevelop * smoothstep(0.35, 1.1, length(q));
      g += (ign(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 160.0;
      gl_FragColor = vec4(clamp(g, 0.0, 1.0), 1.0);
    }`;

  const U = {
    shade: { tDepth: { value: null }, uProj: { value: new THREE.Vector4() }, uPx: { value: new THREE.Vector2() }, uReach: { value: new THREE.Vector3(0.045, 1.5, 1.2) }, uFar: { value: 60 } },
    smooth: { tDepth: { value: null }, uProj: { value: null }, tShade: { value: null }, uHalf: { value: new THREE.Vector2() } },
    bright: { tScene: { value: null }, uPx: { value: new THREE.Vector2() }, uKnee: { value: 1.04 } },
    down: { tSrc: { value: null }, uPx: { value: new THREE.Vector2() } },
    up: { tSrc: { value: null }, tAdd: { value: null }, uPx: { value: new THREE.Vector2() }, uAdd: { value: 1 }, uSrc: { value: 1 } },
    fin: { tDepth: { value: null }, uProj: { value: null }, tScene: { value: null }, tShade: { value: null }, tGlow: { value: null }, uShade: { value: 1 }, uGlow: { value: 1 }, uDevelop: { value: 1 }, uTime: { value: 0 }, uShow: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uHalf: { value: new THREE.Vector2(1, 1) } },
  };
  U.fin.uProj = U.smooth.uProj = U.shade.uProj;
  let M = null, black = null;

  // can this renderer do it? (WebGL 2, and targets that hold half floats: every Mac the game is for)
  P.init = function (renderer) {
    if (P.ready) return true;
    if (!renderer.capabilities.isWebGL2 || !THREE.WebGLMultisampleRenderTarget || !THREE.DepthTexture) return false;
    P.hdr = !!renderer.extensions.get('EXT_color_buffer_float') || !!renderer.extensions.get('EXT_color_buffer_half_float');
    M = { shade: mat(SHADE, U.shade), smooth: mat(SMOOTH, U.smooth), bright: mat(BRIGHT, U.bright), down: mat(DOWN, U.down), up: mat(UP, U.up), fin: mat(FINAL, U.fin) };
    black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat); black.needsUpdate = true;
    P.ready = true; return true;
  };
  const target = (w, h, type, filter) => { const t = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { format: THREE.RGBAFormat, type, minFilter: filter, magFilter: filter, depthBuffer: false, stencilBuffer: false }); t.texture.generateMipmaps = false; return t; };
  function resize(w, h) {
    for (const t of [rtScene, rtA, rtB, ...down, ...up]) if (t) { if (t.depthTexture) t.depthTexture.dispose(); t.dispose(); }
    down.length = 0; up.length = 0; P.w = w; P.h = h;
    const half = P.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    rtScene = new THREE.WebGLMultisampleRenderTarget(w, h, { format: THREE.RGBAFormat, type: half, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false });
    rtScene.samples = P.samples; rtScene.texture.generateMipmaps = false;
    rtScene.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType); rtScene.depthTexture.minFilter = rtScene.depthTexture.magFilter = THREE.NearestFilter;
    rtA = target(Math.ceil(w / 2), Math.ceil(h / 2), THREE.UnsignedByteType, THREE.LinearFilter); rtB = target(Math.ceil(w / 2), Math.ceil(h / 2), THREE.UnsignedByteType, THREE.LinearFilter);
    // the glow: from a quarter of the picture down to one about a dozen pixels high, so it is as wide on a large screen as on a small one
    let dw = Math.ceil(w / 4), dh = Math.ceil(h / 4); LEVELS = 0;
    while (LEVELS < 7 && (LEVELS < 3 || dh >= 12)) { down.push(target(dw, dh, half, THREE.LinearFilter)); up.push(target(dw, dh, half, THREE.LinearFilter)); LEVELS++; dw = Math.ceil(dw / 2); dh = Math.ceil(dh / 2); }
    up.pop();      // (the smallest is brought up from itself)
  }
  const _sz = new THREE.Vector2();
  // Can the card really draw into these targets? Asked once for each set of them, after the first frame has gone through (the renderer
  // builds them on first use, and does not ask). If not, P.broken is set and the game draws straight to the screen as it did before.
  function sound(renderer) {
    const gl = renderer.getContext(); let ok = true;
    for (const t of [rtScene, rtA, rtB, down[0], up[0]]) { const pr = t && renderer.properties.get(t); if (!pr) continue; for (const fb of [pr.__webglMultisampledFramebuffer, pr.__webglFramebuffer]) if (fb) { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) ok = false; } }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);      // (where the renderer left it: the last pass went to the screen)
    return ok;
  }
  const run = (renderer, m, to) => { quad.material = m; renderer.setRenderTarget(to); renderer.render(qScene, qCam); };

  // one frame. alt: how high the camera is, in Earth radii (the shade is for what is near: from orbit there is nothing to shade)
  P.render = function (renderer, scene, camera, alt, time) {
    if (P.broken) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
    renderer.getDrawingBufferSize(_sz); const w = _sz.x | 0, h = _sz.y | 0; if (w !== P.w || h !== P.h || !rtScene) { resize(w, h); P.asked = false; }
    renderer.setRenderTarget(rtScene); renderer.render(scene, camera);
    const shade = P.shade * Math.min(1, Math.max(0, 1 - (alt - 0.003) / 0.02));
    const e = camera.projectionMatrix.elements; U.shade.uProj.value.set(e[0], e[5], camera.near, camera.far); U.shade.tDepth.value = U.smooth.tDepth.value = U.fin.tDepth.value = rtScene.depthTexture;
    if (shade > 0.01) {
      U.shade.uPx.value.set(1 / w, 1 / h); if (P.reach) U.shade.uReach.value.fromArray(P.reach); U.shade.uFar.value = P.far;
      run(renderer, M.shade, rtA);
      U.smooth.tShade.value = rtA.texture; U.smooth.uHalf.value.set(1 / rtA.width, 1 / rtA.height); run(renderer, M.smooth, rtB);
    }
    if (P.glow > 0.01) {
      U.bright.tScene.value = rtScene.texture; U.bright.uPx.value.set(1 / w, 1 / h); run(renderer, M.bright, down[0]);
      for (let i = 1; i < LEVELS; i++) { U.down.tSrc.value = down[i - 1].texture; U.down.uPx.value.set(1 / down[i - 1].width, 1 / down[i - 1].height); run(renderer, M.down, down[i]); }
      // (each size is weighed as it is added: the wider, the more, so that a small very bright thing has a broad soft glare and not only a rim)
      const wOf = (i) => 1 + P.wide * i; let sum = wOf(LEVELS - 1);
      let src = down[LEVELS - 1]; for (let i = LEVELS - 2; i >= 0; i--) { U.up.tSrc.value = src.texture; U.up.tAdd.value = down[i].texture; U.up.uPx.value.set(0.5 / src.width, 0.5 / src.height); U.up.uAdd.value = wOf(i); U.up.uSrc.value = i === LEVELS - 2 ? wOf(LEVELS - 1) : 1; sum += wOf(i); run(renderer, M.up, up[i]); src = up[i]; }
      P._sum = sum;
    }
    U.fin.tScene.value = rtScene.texture; U.fin.tShade.value = rtB.texture; U.fin.uShade.value = shade > 0.01 ? shade : 0; U.fin.uHalf.value.set(1 / rtA.width, 1 / rtA.height);
    U.fin.tGlow.value = P.glow > 0.01 ? up[0].texture : black; U.fin.uGlow.value = 0.6 * P.glow / (P._sum || LEVELS);
    U.fin.uDevelop.value = P.develop; U.fin.uShow.value = P.show || 0; U.fin.uTime.value = time || 0; U.fin.uRes.value.set(w, h);
    run(renderer, M.fin, null); P.drawn++; P.levels = LEVELS;
    if (!P.asked) { P.asked = true; if (!sound(renderer)) { P.broken = true; console.warn('post: the card cannot draw into the picture\'s targets; drawing straight to the screen'); } }
  };
  return P;
})();
