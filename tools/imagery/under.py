#!/usr/bin/env python3
"""The colour of the land, carried on under the water (data/i), and the green of the land likewise (data/veg.jpg).

The picture of the Earth has its own map of land and water in its alpha, five kilometres to a texel, and under the
water its colour was whatever the squeezing left there (black, blue, magenta: it was never looked at). Since the
water's edge comes from a field a sixteenth as coarse (data/w, tools/water/build.py), the true shore runs up to a texel
or two inside the picture's water and outside it, and there is land the picture never had at all: an island ten
kilometres across is a texel or two of dark sea in it, land by its mask or not. So every texel that is not plainly
land with a colour of its own is given one:
  - beside the land the picture knows (within some twenty kilometres), the colour of the nearest of it;
  - further off, and on the small dark islands, the colour land of that climate has in the picture on the whole (the
    mean of the picture's own land, climate class by class: data/climate.png, which says for every place at sea what
    climate the nearest land has): an atoll is the green of the wet tropics, a skerry off Norway the grey-green of
    its coast, a rock in the Arctic the brown of tundra.
The alpha stays as it is (the picture's own map still serves from far out and while a pack is on its way). Water is not
coloured from the picture at all.

The same for data/veg.jpg, by which the trees know how green a place is (ten kilometres to a texel, and nothing at
sea): where the picture has no land the nearest land's values are carried on, or no wood would reach a true shore.

    python3 tools/imagery/under.py [--dry] [--from <dir>]
        rewrites data/i/*.webp (without loss, colour kept under clear texels) and data/veg.jpg, from themselves or from
        the packs and veg.jpg in <dir> (the picture as it was before this was ever run: git show <commit>:data/i/...);
        then: node tools/imagery/seams.mjs check
"""
import os, sys, json
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
I = os.path.join(ROOT, 'data', 'i')
SRC = sys.argv[sys.argv.index('--from') + 1] if '--from' in sys.argv else I
index = json.load(open(os.path.join(ROOT, 'data', 'index.json')))
PER, MAXL = index['img']['packTiles'], index['img']['maxLevel']
dry = '--dry' in sys.argv
NEAR, FAR = 2.0, 6.0          # texels of the finest level: the nearest land's colour as far as the first, the climate's own from the second
SMALL = 300                   # texels of the finest level: land in pieces smaller than this is an island the picture may not have seen
climate = np.array(Image.open(os.path.join(ROOT, 'data', 'climate.png')))


def mosaic(L):
    nx, ny = max(1, (2 << L) // PER), max(1, (1 << L) // PER); packs = {}
    for py in range(ny):
        for px in range(nx):
            f = os.path.join(SRC, '%d_%d_%d.webp' % (L, px, py))
            if os.path.exists(f): packs[(px, py)] = np.array(Image.open(f).convert('RGBA'))
    if len(packs) != nx * ny: sys.exit('level %d: %d of %d packs' % (L, len(packs), nx * ny))
    ph, pw = next(iter(packs.values())).shape[:2]
    mos = np.zeros((ny * ph, nx * pw, 4), np.uint8)
    for (px, py), a in packs.items(): mos[py * ph:(py + 1) * ph, px * pw:(px + 1) * pw] = a
    return mos, nx, ny, pw, ph


def classes(H, W):
    """the climate class of every texel of a picture H x W of the whole Earth"""
    ch, cw = climate.shape
    return climate[np.minimum((np.arange(H) + 0.5) / H * ch, ch - 1).astype(int)[:, None], np.minimum((np.arange(W) + 0.5) / W * cw, cw - 1).astype(int)[None, :]]


def known(mos, scale):
    """the texels whose colour is the land's own: plainly land by the mask, and not one of the small dark islands (a piece of
    land under SMALL texels of the finest level, as dark as the sea and no greener than it is blue). scale: this level's
    texels to one of the finest."""
    land = mos[..., 3] == 255
    pad = min(256, mos.shape[1] // 2); lp = np.concatenate([land[:, -pad:], land, land[:, :pad]], 1)      # (round the world east-west)
    lab, n = ndimage.label(lp, structure=np.ones((3, 3), bool)); size = np.bincount(lab.ravel())
    small = (size < SMALL * scale * scale)[lab][:, pad:pad + land.shape[1]]
    r, g, b = [mos[..., i].astype(np.float32) for i in range(3)]
    dark = ((r + g + b) / 3.0 < 45.0) & (g < 1.25 * b)
    return land & ~(small & dark)


def carry(rgb, good, fill, pad, scale=1.0):
    """rgb (H, W, 3) with, wherever good is False, the colour of the nearest good texel near by and the fill's further off, smoothed.
    fill: None (the nearest's, however far) or (a table of colours, the number of each texel's colour in it).
    (One colour at a time, and no more held than must be: the finest level is thirty-odd million texels.)"""
    H, W = good.shape
    gp = np.concatenate([good[:, -pad:], good, good[:, :pad]], 1)
    dist = np.empty(gp.shape, np.float64); idx = np.empty((2,) + gp.shape, np.int32)
    ndimage.distance_transform_edt(~gp, return_distances=True, return_indices=True, distances=dist, indices=idx)
    w = None
    if fill is not None:
        w = np.clip((dist - NEAR * scale) / ((FAR - NEAR) * scale), 0.0, 1.0).astype(np.float32); w = w * w * (3.0 - 2.0 * w)
        table, which = fill; which = np.concatenate([which[:, -pad:], which, which[:, :pad]], 1)
    del dist
    out = np.empty((H, W, 3), np.uint8)
    for k in range(3):
        ck = np.concatenate([rgb[:, -pad:, k], rgb[..., k], rgb[:, :pad, k]], 1)
        ch = ck[idx[0], idx[1]].astype(np.float32)
        if w is not None: ch *= 1.0 - w; ch += table[:, k][which] * w
        ch = ndimage.gaussian_filter(ch, 1.5, mode='nearest')
        out[..., k] = np.clip(np.rint(np.where(gp, ck, ch)[:, pad:pad + W]), 0, 255)
        del ck, ch
    return out


# the colour land of each climate has in the picture, from the finest level
mos, nx0, ny0, pw0, ph0 = mosaic(MAXL); H0 = mos.shape[0]
good = known(mos, 1.0); cls = classes(*good.shape); MEAN = np.zeros((32, 3), np.float32)
allmean = mos[..., :3][good].astype(np.float64).mean(0)
for c in range(1, 32):
    m = good & (cls == c)
    MEAN[c] = mos[..., :3][m].astype(np.float64).mean(0) if m.sum() > 200 else allmean
print('the land\'s colour by climate (class: r g b):', '  '.join('%d: %d %d %d' % (c, *np.rint(MEAN[c])) for c in range(1, 32)))
print('small dark islands at the finest level: %d texels of %d that are land by the mask' % (int(((mos[..., 3] == 255) & ~good).sum()), int((mos[..., 3] == 255).sum())))

total = 0
for L in range(MAXL + 1):
    mos, nx, ny, pw, ph = mosaic(L)
    scale = mos.shape[0] / H0                   # this level's texels to one of the finest
    good = known(mos, scale)
    rgb = carry(mos[..., :3], good, (MEAN, classes(*good.shape)), min(512, mos.shape[1] // 2), scale)
    # the texels that face each other across a pack's edge are kept equal (a pack is a texture of its own: seams.mjs): where
    # both were filled they take their mean, where one is land the other takes its colour
    Hm, Wm = good.shape
    for x in range(pw, Wm + 1, pw):
        a, b = x - 1, x % Wm; fa, fb = ~good[:, a], ~good[:, b]; m = ((rgb[:, a].astype(np.int32) + rgb[:, b] + 1) >> 1).astype(np.uint8)
        both = fa & fb; rgb[both, a] = m[both]; rgb[both, b] = m[both]
        oa = fa & ~fb; rgb[oa, a] = rgb[oa, b]; ob = fb & ~fa; rgb[ob, b] = rgb[ob, a]
    for y in range(ph, Hm, ph):
        a, b = y - 1, y; fa, fb = ~good[a], ~good[b]; m = ((rgb[a].astype(np.int32) + rgb[b] + 1) >> 1).astype(np.uint8)
        both = fa & fb; rgb[a][both] = m[both]; rgb[b][both] = m[both]
        oa = fa & ~fb; rgb[a][oa] = rgb[b][oa]; ob = fb & ~fa; rgb[b][ob] = rgb[a][ob]
    changed = int((rgb != mos[..., :3]).any(-1).sum()); keep = int((rgb[good] != mos[..., :3][good]).any(-1).sum())
    print('level %d: %d packs of %dx%d; %d texels given a colour; %d of the land\'s own changed (must be 0)' % (L, nx * ny, pw, ph, changed, keep))
    if keep: sys.exit('land was touched')
    mos[..., :3] = rgb
    for py in range(ny):
        for px in range(nx):
            f = os.path.join(I, '%d_%d_%d.webp' % (L, px, py)); a = mos[py * ph:(py + 1) * ph, px * pw:(px + 1) * pw]
            if not dry:
                Image.fromarray(a, 'RGBA').save(f, 'WEBP', lossless=True, quality=100, method=6, exact=True)
                back = np.array(Image.open(f).convert('RGBA'))
                if not np.array_equal(back, a): sys.exit('%s did not come back as it was written' % f)
            total += os.path.getsize(f) if os.path.exists(f) else 0
print('data/i: %.1f MB' % (total / 1e6))
# ---- the green of the land ----
vf = os.path.join(ROOT, 'data', 'veg.jpg')
veg = np.array(Image.open(os.path.join(SRC, 'veg.jpg') if SRC != I else vf).convert('RGB')); Hv, Wv = veg.shape[:2]
top = mosaic(MAXL)[0][..., 3]
k = top.shape[0] // Hv
if top.shape[0] != Hv * k or top.shape[1] != Wv * k: sys.exit('veg.jpg and the picture do not fit: %s, %s' % (veg.shape, top.shape))
share = (top == 255).reshape(Hv, k, Wv, k).mean(axis=(1, 3))
landv = share > 0.99
out = carry(veg, landv, None, 512)
print('veg.jpg: %d of %d texels are not all land and take the nearest land\'s values (green at sea was %.3f, is %.3f)' % (int((~landv).sum()), landv.size, veg[~landv][:, 0].mean() / 255, out[~landv][:, 0].mean() / 255))
if not dry: Image.fromarray(out).save(vf, quality=93, subsampling=0)
