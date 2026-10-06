#!/usr/bin/env python3
"""The colour of the land, carried on under the water (data/i), and the green of the land likewise (data/veg.jpg).

The picture of the Earth has its own map of land and water in its alpha, five kilometres to a texel, and under the
water its colour was whatever the squeezing left there (black, blue, magenta: it was never looked at). Since the
water's edge comes from a field a sixteenth as coarse (data/w, tools/water/build.py), the true shore runs up to a texel
or two inside the picture's water and outside it: ground that is land by the one and water by the other took its
colour from under the picture's sea. So every texel that is not plainly land (alpha under 255: sea, lake, river band,
a coast's mixtures) is given the colour of the nearest land, smoothed; the alpha stays as it is (the picture's own map
still serves from far out and while a pack is on its way). Water is not coloured from the picture at all.

The same for data/veg.jpg, by which the trees know how green a place is (ten kilometres to a texel, and nothing at
sea): where the picture has no land the nearest land's values are carried on, or no wood would reach a true shore.

    python3 tools/imagery/under.py [--dry]        rewrites data/i/*.webp (without loss, colour kept under clear
                                                  texels) and data/veg.jpg; then: node tools/imagery/seams.mjs check
"""
import os, sys, json
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
I = os.path.join(ROOT, 'data', 'i')
index = json.load(open(os.path.join(ROOT, 'data', 'index.json')))
PER, MAXL = index['img']['packTiles'], index['img']['maxLevel']
dry = '--dry' in sys.argv


def carry(rgb, land, pad):
    """rgb (H, W, 3) with the colour of the nearest land wherever land is False (round the world east-west), smoothed there"""
    H, W = land.shape
    lp = np.concatenate([land[:, -pad:], land, land[:, :pad]], 1); cp = np.concatenate([rgb[:, -pad:], rgb, rgb[:, :pad]], 1)
    iy, ix = ndimage.distance_transform_edt(~lp, return_distances=False, return_indices=True)
    near = cp[iy, ix].astype(np.float32)
    soft = np.stack([ndimage.gaussian_filter(near[..., k], 1.5, mode='nearest') for k in range(3)], -1)
    out = np.where(lp[..., None], cp.astype(np.float32), soft)[:, pad:pad + W]
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


total = 0
for L in range(MAXL + 1):
    nx, ny = max(1, (2 << L) // PER), max(1, (1 << L) // PER)
    packs = {}
    for py in range(ny):
        for px in range(nx):
            f = os.path.join(I, '%d_%d_%d.webp' % (L, px, py))
            if os.path.exists(f): packs[(px, py)] = np.array(Image.open(f).convert('RGBA'))
    ph, pw = next(iter(packs.values())).shape[:2]
    if len(packs) != nx * ny: sys.exit('level %d: %d of %d packs' % (L, len(packs), nx * ny))
    mos = np.zeros((ny * ph, nx * pw, 4), np.uint8)
    for (px, py), a in packs.items(): mos[py * ph:(py + 1) * ph, px * pw:(px + 1) * pw] = a
    land = mos[..., 3] == 255
    rgb = carry(mos[..., :3], land, min(512, mos.shape[1] // 2))
    # the texels that face each other across a pack's edge are kept equal (a pack is a texture of its own: seams.mjs): where
    # both were filled they take their mean, where one is land the other takes its colour
    Hm, Wm = land.shape
    for x in range(pw, Wm + 1, pw):
        a, b = x - 1, x % Wm; fa, fb = ~land[:, a], ~land[:, b]; m = ((rgb[:, a].astype(np.int32) + rgb[:, b] + 1) >> 1).astype(np.uint8)
        both = fa & fb; rgb[both, a] = m[both]; rgb[both, b] = m[both]
        oa = fa & ~fb; rgb[oa, a] = rgb[oa, b]; ob = fb & ~fa; rgb[ob, b] = rgb[ob, a]
    for y in range(ph, Hm, ph):
        a, b = y - 1, y; fa, fb = ~land[a], ~land[b]; m = ((rgb[a].astype(np.int32) + rgb[b] + 1) >> 1).astype(np.uint8)
        both = fa & fb; rgb[a][both] = m[both]; rgb[b][both] = m[both]
        oa = fa & ~fb; rgb[a][oa] = rgb[b][oa]; ob = fb & ~fa; rgb[b][ob] = rgb[a][ob]
    changed = int((rgb != mos[..., :3]).any(-1).sum()); keep = int((rgb[land] != mos[..., :3][land]).any(-1).sum())
    print('level %d: %d packs of %dx%d; %d texels under water given the land\'s colour; %d land texels changed (must be 0)' % (L, len(packs), pw, ph, changed, keep))
    if keep: sys.exit('land was touched')
    mos[..., :3] = rgb
    for (px, py) in packs:
        f = os.path.join(I, '%d_%d_%d.webp' % (L, px, py)); a = mos[py * ph:(py + 1) * ph, px * pw:(px + 1) * pw]
        if not dry:
            Image.fromarray(a, 'RGBA').save(f, 'WEBP', lossless=True, quality=100, method=6, exact=True)
            back = np.array(Image.open(f).convert('RGBA'))
            if not np.array_equal(back, a): sys.exit('%s did not come back as it was written' % f)
        total += os.path.getsize(f)
print('data/i: %.1f MB' % (total / 1e6))

# ---- the green of the land ----
vf = os.path.join(ROOT, 'data', 'veg.jpg')
veg = np.array(Image.open(vf).convert('RGB')); Hv, Wv = veg.shape[:2]
top = np.concatenate([np.concatenate([np.array(Image.open(os.path.join(I, '%d_%d_%d.webp' % (MAXL, px, py))).convert('RGBA'))[..., 3] for px in range(max(1, (2 << MAXL) // PER))], 1) for py in range(max(1, (1 << MAXL) // PER))], 0)
k = top.shape[0] // Hv
if top.shape[0] != Hv * k or top.shape[1] != Wv * k: sys.exit('veg.jpg and the picture do not fit: %s, %s' % (veg.shape, top.shape))
share = (top == 255).reshape(Hv, k, Wv, k).mean(axis=(1, 3))
landv = share > 0.99
out = carry(veg, landv, 512)
print('veg.jpg: %d of %d texels are not all land and take the nearest land\'s values (green at sea was %.3f, is %.3f)' % (int((~landv).sum()), landv.size, veg[~landv][:, 0].mean() / 255, out[~landv][:, 0].mean() / 255))
if not dry: Image.fromarray(out).save(vf, quality=93, subsampling=0)
