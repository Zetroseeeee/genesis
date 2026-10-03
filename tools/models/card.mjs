// A "card": the concept photograph of a model cut out of its studio background, for things that are drawn as a
// picture on a camera-facing card rather than as a mesh (trees: generated meshes get trunks right and crowns wrong,
// while the photographs are exactly what a tree looks like).
//
//   keyCard(pngBuffer, { height })  ->  { png, width, height, aspect, pivot }
//     aspect = width / height of the cut-out; pivot = where the trunk stands, 0..1 across the width
//
// Two kinds of backdrop are understood. A plain grey studio backdrop is keyed by distance from it (fine for leafy
// trees with brown bark). A blue screen is keyed the way film does it, by how much bluer than anything else a pixel
// is: that separates white bark, grey trunks and bare winter twigs cleanly, and a shadow on the screen is still screen.
import sharp from 'sharp';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export async function keyCard(input, opts = {}) {
  const outH = opts.height || 1024;
  const W0 = 1400;                                                    // work size: enough for a clean edge, quick to process
  const { data, info } = await sharp(input).resize(W0, W0, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  // the studio background: per row, the colour at the frame's edges (the backdrop shades a little from top to bottom)
  const bg = new Float32Array(H * 3);
  for (let y = 0; y < H; y++) {
    let r = 0, g = 0, b = 0, n = 0; const m = Math.max(4, Math.round(W * 0.02));
    for (let x = 0; x < m; x++) for (const xx of [x, W - 1 - x]) { const o = (y * W + xx) * 3; r += data[o]; g += data[o + 1]; b += data[o + 2]; n++; }
    bg[y * 3] = r / n; bg[y * 3 + 1] = g / n; bg[y * 3 + 2] = b / n;
  }
  for (let pass = 0; pass < 3; pass++) for (let y = 1; y < H - 1; y++) for (let c = 0; c < 3; c++) bg[y * 3 + c] = (bg[(y - 1) * 3 + c] + bg[y * 3 + c] * 2 + bg[(y + 1) * 3 + c]) / 4;
  // matte: how far a pixel is from the backdrop, in colour and in brightness; a grey no darker than a soft contact
  // shadow counts as backdrop
  const alpha = new Float32Array(N);
  // is it a blue screen? (the backdrop's blue stands well clear of its red and green)
  let kb = 0; for (let y = 0; y < H; y++) kb += bg[y * 3 + 2] - Math.max(bg[y * 3], bg[y * 3 + 1]); kb /= H;
  const screen = kb > 60;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 3; const r = data[o], g = data[o + 1], b = data[o + 2]; const br = bg[y * 3], bgc = bg[y * 3 + 1], bb = bg[y * 3 + 2];
    const dr = r - br, dg = g - bgc, db = b - bb; const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    let a = smooth(14, 40, dist);
    if (screen) {
      // how blue the pixel is beyond its other channels, against how blue the screen is, both relative to brightness:
      // a shadow on the screen is as blue as the screen (gone), a leaf edge half over it is half as blue (half there)
      const ex = b - Math.max(r, g); const rel = ex / Math.max(b, 1), relB = (bb - Math.max(br, bgc)) / Math.max(bb, 1);
      const key = Math.min(1, Math.max(0, rel / (relB * 0.92))) * smooth(8, 26, ex);
      a = Math.min(a, 1 - key);
    } else {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const sat = mx > 0 ? (mx - mn) / mx : 0; const lum = (r * 0.3 + g * 0.59 + b * 0.11);
      const bl = br * 0.3 + bgc * 0.59 + bb * 0.11;
      if (sat < 0.07 && lum > bl * 0.72) a *= smooth(bl * 0.9, bl * 0.72, lum);      // neutral grey, only a little darker than the backdrop: a shadow on it, not the subject
    }
    alpha[y * W + x] = a;
  }
  if (screen) {
    // drop what is not attached to the tree: islands of matte smaller than a leaf cluster (bare twigs stay, they hang together)
    const lab = new Int32Array(N).fill(-1); const sizes = []; const stack = new Int32Array(N);
    for (let i0 = 0; i0 < N; i0++) {
      if (lab[i0] >= 0 || alpha[i0] < 0.3) continue; const id = sizes.length; let sp = 0, n = 0; stack[sp++] = i0; lab[i0] = id;
      while (sp) { const i = stack[--sp]; n++; const x = i % W, y = (i / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (lab[j] < 0 && alpha[j] >= 0.3) { lab[j] = id; stack[sp++] = j; } } }
      sizes.push(n);
    }
    const big = Math.max(...sizes, 0); const minN = Math.max(60, big * 0.0015);
    for (let i = 0; i < N; i++) if (lab[i] >= 0 && sizes[lab[i]] < minN) alpha[i] = 0;
    // faint matte that touches nothing solid is screen noise
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (alpha[i] > 0 && alpha[i] < 0.3) { let near = false; for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (alpha[i + dy * W + dx] >= 0.3) { near = true; break; } if (!near) alpha[i] = 0; } }
  } else {
    // drop specks: keep the matte only where a 5x5 neighbourhood agrees there is something
    const keep = new Uint8Array(N);
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { let s = 0; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) s += alpha[(y + j) * W + x + i]; keep[y * W + x] = s > 5 ? 1 : 0; }
    for (let i = 0; i < N; i++) if (!keep[i]) alpha[i] = 0;
  }
  // bounds of the subject
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (alpha[y * W + x] > 0.5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error('card: nothing left after keying');
  const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  // the foot: the middle of what touches the bottom rows (the trunk), so the card turns about the trunk
  let fx = 0, fn = 0; for (let y = Math.max(y0, y1 - Math.round(ch * 0.04)); y <= y1; y++) for (let x = x0; x <= x1; x++) { const a = alpha[y * W + x]; fx += x * a; fn += a; }
  const pivot = fn > 0 ? (fx / fn - x0) / cw : 0.5;
  // colour: take the backdrop out of the half-covered edge pixels, then spread colour outward into the empty texels
  // so that filtering and mip-mapping never pull grey into the leaves
  const rgb = new Float32Array(cw * ch * 3), al = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const so = ((y + y0) * W + x + x0) * 3, a = alpha[(y + y0) * W + x + x0], o = (y * cw + x) * 3; al[y * cw + x] = a;
    for (let c = 0; c < 3; c++) { const v = data[so + c], b = bg[(y + y0) * 3 + c]; rgb[o + c] = a > 0.05 ? Math.min(255, Math.max(0, (v - (1 - a) * b) / Math.max(a, 0.25))) : 0; }
    if (screen && rgb[o + 2] > Math.max(rgb[o], rgb[o + 1])) rgb[o + 2] = Math.max(rgb[o], rgb[o + 1]);      // no part of a tree is bluer than it is red or green: what is, came off the screen
  }
  const filled = new Uint8Array(cw * ch); for (let i = 0; i < cw * ch; i++) filled[i] = al[i] > 0.9 ? 1 : 0;      // only solid texels seed the fill; the half-covered rim takes its colour from them
  for (let pass = 0; pass < 48; pass++) {
    const add = [];
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = y * cw + x; if (filled[i]) continue; let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= cw || yy >= ch) continue; const j = yy * cw + xx; if (!filled[j]) continue; r += rgb[j * 3]; g += rgb[j * 3 + 1]; b += rgb[j * 3 + 2]; n++; }
      if (n) add.push(i, r / n, g / n, b / n);
    }
    if (!add.length) break;
    for (let k = 0; k < add.length; k += 4) { const i = add[k]; rgb[i * 3] = add[k + 1]; rgb[i * 3 + 1] = add[k + 2]; rgb[i * 3 + 2] = add[k + 3]; filled[i] = 1; }
  }
  // whatever is still empty takes the mean colour of the subject
  let mr = 0, mg = 0, mb = 0, mn = 0; for (let i = 0; i < cw * ch; i++) if (al[i] > 0.5) { mr += rgb[i * 3]; mg += rgb[i * 3 + 1]; mb += rgb[i * 3 + 2]; mn++; }
  mr /= mn || 1; mg /= mn || 1; mb /= mn || 1;
  const out = Buffer.alloc(cw * ch * 4);
  for (let i = 0; i < cw * ch; i++) { const f = filled[i]; out[i * 4] = Math.round(f ? rgb[i * 3] : mr); out[i * 4 + 1] = Math.round(f ? rgb[i * 3 + 1] : mg); out[i * 4 + 2] = Math.round(f ? rgb[i * 3 + 2] : mb); out[i * 4 + 3] = Math.round(al[i] * 255); }
  const outW = Math.max(8, Math.round(outH * cw / ch));
  // PNG, not WebP: the colour under the transparent texels has to survive (WebP throws it away), or the edges go dark when filtered.
  // Colour and matte are resized apart so the resampler does not weight colour by coverage.
  const rgbBuf = Buffer.alloc(cw * ch * 3), aBuf = Buffer.alloc(cw * ch);
  for (let i = 0; i < cw * ch; i++) { rgbBuf[i * 3] = out[i * 4]; rgbBuf[i * 3 + 1] = out[i * 4 + 1]; rgbBuf[i * 3 + 2] = out[i * 4 + 2]; aBuf[i] = out[i * 4 + 3]; }
  const rgbR = await sharp(rgbBuf, { raw: { width: cw, height: ch, channels: 3 } }).resize(outW, outH, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer();
  const aRes = await sharp(aBuf, { raw: { width: cw, height: ch, channels: 1 } }).resize(outW, outH, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  const aR = aRes.data, aC = aRes.info.channels;
  const rgba = Buffer.alloc(outW * outH * 4); for (let i = 0; i < outW * outH; i++) { rgba[i * 4] = rgbR[i * 3]; rgba[i * 4 + 1] = rgbR[i * 3 + 1]; rgba[i * 4 + 2] = rgbR[i * 3 + 2]; rgba[i * 4 + 3] = aR[i * aC]; }
  const png = await sharp(rgba, { raw: { width: outW, height: outH, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  return { png, width: outW, height: outH, aspect: +(cw / ch).toFixed(4), pivot: +pivot.toFixed(4), mean: [+(mr / 255).toFixed(3), +(mg / 255).toFixed(3), +(mb / 255).toFixed(3)] };
}

// node tools/models/card.mjs <in.png> <out.png> [height]   (prints the measurements)
if (process.argv[1] && process.argv[1].endsWith('card.mjs') && process.argv[2]) {
  const fs = await import('node:fs');
  const r = await keyCard(fs.readFileSync(process.argv[2]), { height: +(process.argv[4] || 1024) });
  fs.writeFileSync(process.argv[3], r.png); const { png, ...rest } = r; console.log(JSON.stringify(rest), png.length, 'bytes');
}
