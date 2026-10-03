// GENESIS sun shadows: one depth map of everything that stands on the ground near the camera (models, kit buildings,
// near trees), rendered from the sun, read by the terrain and by the models themselves. True silhouettes: a thatched
// cone throws a cone's shadow, a palisade the teeth of its stakes. Classic script; exposes window.SHADOWS.
//
// The map covers a square of ground around the point the camera looks at, wide enough for the view and no wider, so
// its texels stay small. It is redrawn only when something changed: the camera moved on, the sun moved, buildings or
// trees were rebuilt. Receivers find their place in it from view-space positions (small numbers, so float32 holds).
(function () {
  const DEPTH_VERT = `
    void main() { gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;
  const DEPTH_FRAG = `void main() { gl_FragColor = vec4(1.0); }`;
  // the lookup every receiver shares (terrain, models): how much of the sun is hidden at a view-space point, 0..1
  const GLSL = `
    uniform sampler2D uShadowMap; uniform mat4 uShadowMat; uniform vec4 uShadowP;   // x on, y 1/size, z depth bias, w texel in view units
    float sunHidden(vec3 vp) {
      if (uShadowP.x < 0.5) return 0.0;
      vec4 sc = uShadowMat * vec4(vp, 1.0); vec3 s = sc.xyz * 0.5 + 0.5;
      vec2 e = min(s.xy, 1.0 - s.xy); float edge = min(e.x, e.y);
      if (edge <= 0.0 || s.z <= 0.0 || s.z >= 1.0) return 0.0;
      float z = s.z - uShadowP.z, t = uShadowP.y, sum = 0.0;
      // 12 taps on two rings, turned per pixel so the banding of a regular kernel becomes fine grain
      float a = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853; float ca = cos(a), sa = sin(a);
      mat2 rot = mat2(ca, sa, -sa, ca);
      sum += step(texture2D(uShadowMap, s.xy + rot * vec2( 0.92,  0.00) * t).r, z);
      sum += step(texture2D(uShadowMap, s.xy + rot * vec2(-0.46,  0.80) * t).r, z);
      sum += step(texture2D(uShadowMap, s.xy + rot * vec2(-0.46, -0.80) * t).r, z);
      sum += step(texture2D(uShadowMap, s.xy + rot * vec2( 0.00,  2.10) * t).r, z);
      sum += step(texture2D(uShadowMap, s.xy + rot * vec2( 1.82,  1.05) * t).r, z);
      sum += step(texture2D(uShadowMap, s.xy + rot * vec2( 1.82, -1.05) * t).r, z);
      sum += step(texture2D(uShadowMap, s.xy + rot * vec2( 0.00, -2.10) * t).r, z);
      sum += step(texture2D(uShadowMap, s.xy + rot * vec2(-1.82, -1.05) * t).r, z);
      sum += step(texture2D(uShadowMap, s.xy + rot * vec2(-1.82,  1.05) * t).r, z);
      sum += step(texture2D(uShadowMap, s.xy).r, z);
      return sum / 10.0 * smoothstep(0.0, 0.05, edge);
    }`;

  const S = {
    ready: false, enabled: true, size: 4096, rt: null, cam: null, GLSL,
    uniforms: { uShadowMap: { value: null }, uShadowMat: { value: new THREE.Matrix4() }, uShadowP: { value: new THREE.Vector4(0, 1 / 4096, 0.0004, 0) } },
    half: 0, centre: new THREE.Vector3(), sun: new THREE.Vector3(), stamp: '', drawn: 0, stats: { draws: 0, half: 0 },
    _v: new THREE.Vector3(), _r: new THREE.Vector3(), _u: new THREE.Vector3(), _m: new THREE.Matrix4(), kitDepth: null,
  };

  // size: the map's width in texels (4096 on a strong GPU, 2048 otherwise)
  S.init = function (renderer, size) {
    if (!renderer.capabilities.isWebGL2 || !THREE.DepthTexture) return false;
    S.size = size || 4096;
    const rt = new THREE.WebGLRenderTarget(S.size, S.size, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false });
    rt.texture.generateMipmaps = false;
    rt.depthTexture = new THREE.DepthTexture(S.size, S.size, THREE.UnsignedIntType); rt.depthTexture.minFilter = rt.depthTexture.magFilter = THREE.NearestFilter;
    S.rt = rt; S.uniforms.uShadowMap.value = rt.depthTexture; S.uniforms.uShadowP.value.y = 1 / S.size;
    S.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); S.cam.layers.set(1);            // sees only what is marked as a caster
    S.kitDepth = new THREE.ShaderMaterial({ vertexShader: DEPTH_VERT, fragmentShader: DEPTH_FRAG, side: THREE.DoubleSide }); S.kitDepth.colorWrite = false;
    S.ready = true; return true;
  };
  // mark an instanced mesh as something that throws a shadow; depth: the material it is drawn with into the map
  S.caster = function (mesh, depth) { mesh.layers.enable(1); mesh.userData.depthMat = depth || S.kitDepth; };

  // centre: where the camera looks (world); half: half the width of ground to cover (scene units); sun: unit vector to the sun (world);
  // stamp: changes whenever what stands on the ground changed. Returns true when the map was redrawn.
  S.update = function (renderer, scene, camera, centre, half, sun, up, stamp, day) {
    const P = S.uniforms.uShadowP.value;
    if (!S.ready || !S.enabled || day < 0.04 || sun.dot(up) < 0.03) { P.x = 0; return false; }
    const moved = S.centre.distanceTo(centre) > S.half * 0.12, zoomed = Math.abs(Math.log(half / (S.half || 1e-9))) > 0.12, turned = S.sun.distanceTo(sun) > 0.0025;
    let redrawn = false;
    if (moved || zoomed || turned || stamp !== S.stamp) {
      S.stamp = stamp; S.half = half; S.sun.copy(sun);
      // the light's frame; the centre snapped to whole texels in it, so the map does not swim as the camera pans
      const cam = S.cam; const range = half * 3;
      cam.up.copy(Math.abs(sun.y) > 0.95 ? S._v.set(1, 0, 0) : S._v.set(0, 1, 0));
      cam.position.copy(centre).addScaledVector(sun, range); cam.lookAt(centre); cam.updateMatrixWorld();
      const e = cam.matrixWorld.elements; const right = S._r.set(e[0], e[1], e[2]), upL = S._u.set(e[4], e[5], e[6]); const texel = 2 * half / S.size;
      const cx = centre.dot(right), cy = centre.dot(upL);
      S.centre.copy(centre).addScaledVector(right, Math.round(cx / texel) * texel - cx).addScaledVector(upL, Math.round(cy / texel) * texel - cy);
      cam.position.copy(S.centre).addScaledVector(sun, range); cam.lookAt(S.centre);
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.near = range * 0.05; cam.far = range * 2; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      // draw the casters with their depth materials
      const swapped = [];
      scene.traverse((o) => { if (o.isMesh && o.userData.depthMat && o.layers.test(cam.layers) && o.visible && (!o.isInstancedMesh || o.count > 0)) { swapped.push(o, o.material); o.material = o.userData.depthMat; } });
      const oldRT = renderer.getRenderTarget(); const bg = scene.background; scene.background = null;
      renderer.setRenderTarget(S.rt); renderer.clear(true, true, false); renderer.render(scene, cam);
      renderer.setRenderTarget(oldRT); scene.background = bg;
      for (let i = 0; i < swapped.length; i += 2) swapped[i].material = swapped[i + 1];
      S.drawn++; S.stats.draws = swapped.length / 2; S.stats.half = half; redrawn = true;
      P.w = texel; P.z = 1.1 / S.size;                                   // about three texels' worth of depth (the map's depth spans 5.85 x half)
    }
    // view space -> the map's clip space, composed in double precision. The camera has just been moved for this frame
    // and the renderer has not seen it yet: bring its matrix up to date first, or the shadows trail a frame behind it.
    camera.updateMatrixWorld();
    S.uniforms.uShadowMat.value.multiplyMatrices(S.cam.projectionMatrix, S._m.multiplyMatrices(S.cam.matrixWorldInverse, camera.matrixWorld));
    P.x = 1;
    return redrawn;
  };
  // is a ground point inside the mapped square (with a margin)? Used to drop the old block shadows where the real ones fall.
  S.covers = function (p, margin) {
    if (!S.ready || S.uniforms.uShadowP.value.x < 0.5) return false;
    const e = S.cam.matrixWorld.elements; const dx = p.x - S.centre.x, dy = p.y - S.centre.y, dz = p.z - S.centre.z;
    const a = dx * e[0] + dy * e[1] + dz * e[2], b = dx * e[4] + dy * e[5] + dz * e[6]; const lim = S.half * (1 - (margin || 0.08));
    return Math.abs(a) < lim && Math.abs(b) < lim;
  };
  window.SHADOWS = S;
})();
