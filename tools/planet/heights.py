#!/usr/bin/env python3
"""The heights of the Earth as the game has them (the Planet workflow, mode "heights"): data/h.

    python3 tools/planet/heights.py --out out --work work [only=7/47/10,7/33/7] [bbox=lon0,lat0,lon1,lat1] [keep=relief|all]

Nothing told: every land of the Earth, and the pack. Told some level-7 packs (only=, or every one a box touches: bbox=):
those only, a trial - a sheet of them beside the old packs (planet_heights.jpg) and what each costs, and no pack.

What it makes. Packs of the game's tiles (src/terrain.js: a tile of level L is 360/2^(L+1) degrees and 512 texels across;
a pack is 4 x 4 tiles, 2048 square; level 0 is 1024 by 512 and level 1 2048 by 1024), each a PNG whose red and green are
the high and low bytes of how high the ground stands in half metres (the sea, and land below it, at nought), 2.82 % taller
than the Earth as the old packs were and every lake in the game with them (TALL). Level 7 is 306 m to a texel at the
equator, every level below it half as fine; each is the mean of the four texels under it, so the levels agree. Level 7
is kept where the ground has relief enough to show it (keep=all: everywhere there is land), every lower level wherever
there is land. Sixteen packs of level 7 to a bundle, sixty-four of the others (<level>_b<x>_<y>.bin: "HWB1", how many,
a table of where each pack begins and how long it is, then the packs - src/terrain.js reads a pack out of its bundle).
index.json says which packs there are, by level: P a pack, S nothing but sea, L land that is drawn from the level below.

Where it comes from. The Terrain Tiles on AWS Open Data ("terrarium": metres = R x 256 + G + B / 256 - 32768; Mapzen's
mosaic of NASA's SRTM - void-filled - USGS's 3DEP and GMTED2010, NOAA's ETOPO1 and national surveys:
https://registry.opendata.aws/terrain-tiles/, attribution https://github.com/tilezen/joerd/blob/master/docs/attribution.md),
read at zoom 10 (153 m at the equator) and averaged over each texel's own piece of the Earth. Two places they do not
give the ground one stands on: Antarctica, where they have the rock under the ice, and the north of 85 degrees, where
Mercator's tiles end (sea, but for Greenland's tip and some islands); there the old packs are taken (data/e: the ice as the
old build had it). The old packs had the high Himalaya, the Karakoram, the Andes and the Alps above the snows smooth, as
the radar left them (a hole filled by a blur): Everest stood at 5,880 m.

The pack is kept under the name of what it was made from (twelve digits of the SHA-256 of this file): heights-<hash>.tar
and heights-<hash>.json in the "planet" release, heights.json for whoever asks for the pack made last.
tools/planet/fetch.mjs brings it into data/h/.
"""
import os, sys, io, json, math, time, struct, hashlib, tarfile, threading, urllib.request
import concurrent.futures as cf
import numpy as np
from PIL import Image, ImageDraw
Image.MAX_IMAGE_PIXELS = None

arg = lambda n, d=None: sys.argv[sys.argv.index('--' + n) + 1] if '--' + n in sys.argv else d
OUT, WORK = arg('out', 'out'), arg('work', 'work')
words = dict(a.split('=', 1) for a in sys.argv[1:] if '=' in a and not a.startswith('--'))
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
H = hashlib.sha256(open(os.path.abspath(__file__), 'rb').read()).hexdigest()[:12]
URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/%d/%d/%d.png'
TILE, PER, TOP, TALL, STEP = 512, 4, 7, 1.0282, 0.5
Z, ZHI = int(words.get('z', 10)), int(words.get('zhigh', 10))      # (the tiles' zoom for level 7, and beyond 55 degrees, where Mercator's rows are twice as fine and more)
CAP = 85.05112878
KEEP = words.get('keep', 'relief')
SOUTH = words.get('south', 'old')      # (Antarctica from the old packs, or - to look at - from the tiles)
T0 = time.time()
LOG = []
def say(*a):
    s = '[%5.0f s] ' % (time.time() - T0) + ' '.join(str(x) for x in a); print(s, flush=True); LOG.append(s)

for d in (OUT, WORK, os.path.join(WORK, 'h')): os.makedirs(d, exist_ok=True)


# ------------------------------------------------------------------------------------------------- the game's packs
def grid(L):
    """(packs across, packs down, a pack's texels across, down) at level L"""
    tx, ty = 2 << L, 1 << L
    return (tx + PER - 1) // PER, (ty + PER - 1) // PER, min(PER, tx) * TILE, min(PER, ty) * TILE

def box(L, px, py):
    """the pack's edges: lon0, lon1, the latitude of its top and of its bottom, and degrees to a texel"""
    td = 360.0 / (2 << L); nx, ny, W, Hh = grid(L)
    return -180 + px * PER * td, -180 + px * PER * td + W / TILE * td, 90 - py * PER * td, 90 - py * PER * td - Hh / TILE * td, td / TILE


# ------------------------------------------------------------------------------------------------- the old packs
IDX = json.load(open(os.path.join(ROOT, 'data/index.json')))['elev']
L6, L7 = set(map(tuple, IDX['l6'])), set(map(tuple, IDX['l7']))
from collections import OrderedDict
_old = OrderedDict()
def old_pack(L, px, py):
    """an old pack's ground in metres (float32), 0 if it is nothing but sea, None if there is none (a few kept at a time)"""
    k = (L, px, py)
    if k in _old: _old.move_to_end(k); return _old[k]
    v = IDX['packs'].get('%d/%d/%d' % k); f = os.path.join(ROOT, 'data/e/%d_%d_%d.png' % k)
    if isinstance(v, list) and os.path.exists(f): r = v[0] + np.asarray(Image.open(f).convert('L'), dtype=np.float32) * v[1]
    else: r = 0 if v == 0 else None
    _old[k] = r
    while len(_old) > 10: _old.popitem(last=False)
    return r

def old_heights(L, px, py):
    """the old packs' ground (already 2.82 % tall) at the texels of this pack: from the finest old pack that holds it"""
    lon0, lon1, lat0, lat1, dl = box(L, px, py); nx, ny, W, Hh = grid(L)
    lons = lon0 + (np.arange(W) + 0.5) * dl; lats = lat0 - (np.arange(Hh) + 0.5) * dl
    for l in range(min(L, 7), -1, -1):
        sh = L - l; qx, qy = px >> sh, py >> sh       # (packs of every level are 4 x 4 tiles: a pack of level l holds 2^(L-l) of ours each way)
        if l == 7 and (qx, qy) not in L7: continue
        if l == 6 and (qx, qy) not in L6: continue
        if True:
            p = old_pack(l, qx, qy)
            if p is None: continue
            if isinstance(p, int): return np.zeros((Hh, W), np.float32)
            a0, a1, b0, b1, dd = box(l, qx, qy)
            fx = (lons - a0) / dd - 0.5; fy = (b0 - lats) / dd - 0.5
            x0 = np.clip(np.floor(fx).astype(int), 0, p.shape[1] - 2); y0 = np.clip(np.floor(fy).astype(int), 0, p.shape[0] - 2)
            ax = np.clip(fx - x0, 0, 1)[None, :]; ay = np.clip(fy - y0, 0, 1)[:, None]
            Y0, X0 = y0[:, None], x0[None, :]
            return ((p[Y0, X0] * (1 - ax) + p[Y0, X0 + 1] * ax) * (1 - ay) + (p[Y0 + 1, X0] * (1 - ax) + p[Y0 + 1, X0 + 1] * ax) * ay).astype(np.float32)
    return np.zeros((Hh, W), np.float32)


# ------------------------------------------------------------------------------------------------- the Terrain Tiles
_tls = threading.local()
STATS = {'tiles': 0, 'bytes': 0, 'failed': 0}
def tile(z, x, y):
    """one terrarium tile as metres (float32, 256 x 256), or None if it cannot be had"""
    for k in range(5):
        try:
            with urllib.request.urlopen(URL % (z, x, y), timeout=60) as r: b = r.read()
            a = np.asarray(Image.open(io.BytesIO(b)).convert('RGB'), dtype=np.float32)
            STATS['tiles'] += 1; STATS['bytes'] += len(b)
            return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
        except Exception as e:
            if k == 4: STATS['failed'] += 1; say('  tile %d/%d/%d: %s' % (z, x, y, str(e)[:80])); return None
            time.sleep(2 * (k + 1))

POOL = cf.ThreadPoolExecutor(48)
mx = lambda lon, S: (lon + 180) / 360 * S
def my(lat, S):
    s = math.sin(math.radians(max(-CAP, min(CAP, lat)))); return (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * S

def box_mean(M, a, b, axis):
    """the mean of M between the fractional places a[i] and b[i] along an axis (a texel k lies over [k, k+1)), for each i"""
    M = np.moveaxis(M, axis, 0); n = M.shape[0]
    C = np.concatenate([np.zeros((1,) + M.shape[1:]), np.cumsum(M, axis=0, dtype=np.float64)], axis=0)
    def I(t):
        t = np.clip(t, 0, n); k = np.minimum(np.floor(t).astype(int), n - 1); f = (t - k).reshape((-1,) + (1,) * (M.ndim - 1))
        return C[k] + f * M[k]
    w = np.maximum(b - a, 1e-9).reshape((-1,) + (1,) * (M.ndim - 1))
    return np.moveaxis((I(b) - I(a)) / w, 0, axis)

def from_tiles(L, px, py, z=Z):
    """the pack's ground from the Terrain Tiles at zoom z: true metres, at least nought; NaN where there are none"""
    lon0, lon1, lat0, lat1, dl = box(L, px, py); nx, ny, W, Hh = grid(L); S = 256 << z; n = 1 << z
    out = np.full((Hh, W), np.nan, np.float32)
    top, bot = min(lat0, CAP), max(lat1, -CAP)
    if top <= bot: return out
    X0, X1 = mx(lon0, S), mx(lon1, S); Y0, Y1 = my(top, S), my(bot, S)
    tx0, tx1 = int(X0 // 256), int(math.ceil(X1 / 256)) - 1; ty0, ty1 = int(Y0 // 256), min(n - 1, int(math.ceil(Y1 / 256)) - 1)
    jobs = {(x, y): POOL.submit(tile, z, x % n, y) for y in range(ty0, ty1 + 1) for x in range(tx0, tx1 + 1)}
    M = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), np.float32); V = np.ones_like(M)
    for (x, y), f in jobs.items():
        t = f.result(); sl = (slice((y - ty0) * 256, (y - ty0 + 1) * 256), slice((x - tx0) * 256, (x - tx0 + 1) * 256))
        if t is None: V[sl] = 0
        else: M[sl] = np.maximum(t, 0)      # (the sea's floor and land below the sea at nought before anything is averaged: or every coast is pulled down by the sea beside it)
    # the texels' rows: their edges in the tiles' rows (Mercator), and only the rows the tiles reach
    rows = np.arange(Hh); la, lb = lat0 - rows * dl, lat0 - (rows + 1) * dl; ok = (la > -CAP) & (lb < CAP)
    ya = np.array([my(v, S) for v in la]) - ty0 * 256; yb = np.array([my(v, S) for v in lb]) - ty0 * 256
    xs = np.arange(W + 1) * dl + lon0; xe = mx(xs, S) - tx0 * 256
    R = np.empty((Hh, M.shape[1]), np.float32); RV = np.empty_like(R)
    for c in range(0, M.shape[1], 1024):      # (a strip of columns at a time: the sums are of doubles)
        R[:, c:c + 1024] = box_mean(M[:, c:c + 1024] * V[:, c:c + 1024], ya, yb, 0); RV[:, c:c + 1024] = box_mean(V[:, c:c + 1024], ya, yb, 0)
    G = box_mean(R, xe[:-1], xe[1:], 1); GV = box_mean(RV, xe[:-1], xe[1:], 1)
    good = (GV > 0.5) & ok[:, None]
    out[good] = (G[good] / GV[good]).astype(np.float32)
    return out


# ------------------------------------------------------------------------------------------------- where there is land
def land_packs():
    """the level-7 packs with any land in them: by the picture's map of land and water (8192 x 4096) and by the old packs,
    which have the islands too small for the map"""
    m = np.asarray(Image.open(os.path.join(ROOT, 'tools/planet/mask.png')).convert('L')) > 0
    nx, ny, W, Hh = grid(TOP); out = set()
    for py in range(ny):
        for px in range(nx):
            a0, a1, b0, b1, dl = box(TOP, px, py)
            ys = slice(max(0, int((90 - b0) / 180 * m.shape[0]) - 2), min(m.shape[0], int(math.ceil((90 - b1) / 180 * m.shape[0])) + 2))
            xs = [(x % m.shape[1]) for x in range(int((a0 + 180) / 360 * m.shape[1]) - 2, int(math.ceil((a1 + 180) / 360 * m.shape[1])) + 2)]
            if m[ys][:, xs].any(): out.add((px, py)); continue
            o = old_pack(5, px >> 2, py >> 2)
            if isinstance(o, np.ndarray):
                q = o[(py & 3) * 512:((py & 3) + 1) * 512, (px & 3) * 512:((px & 3) + 1) * 512]
                if (q > 0.5).any(): out.add((px, py))
    return out


# ------------------------------------------------------------------------------------------------- one level-7 pack
def build7(px, py):
    """the ground of one level-7 pack, in half metres (uint16), and how much relief it has"""
    lon0, lon1, lat0, lat1, dl = box(TOP, px, py)
    t0 = time.time(); n0 = STATS['tiles']
    if lat0 <= -60 and SOUTH == 'old':      # Antarctica: the old packs' ice (twelve hundred metres to a texel: it is only for the levels below, and never kept at this one)
        h = old_heights(TOP, px, py); src = 'old'
    else:
        h = from_tiles(TOP, px, py, ZHI if min(abs(lat0), abs(lat1)) > 55 else Z) * TALL; src = 'tiles'
        bad = np.isnan(h)
        if bad.any():                     # north of the tiles' end, or a tile that would not come: the old packs there
            o = old_heights(TOP, px, py); h[bad] = o[bad]; src += ' + old %.0f %%' % (100 * bad.mean())
        if lat1 < -60 and SOUTH == 'old': h[np.arange(h.shape[0]) * dl > lat0 + 60] = old_heights(TOP, px, py)[np.arange(h.shape[0]) * dl > lat0 + 60]
    v = np.clip(np.round(h / STEP), 0, 65535).astype(np.uint16)
    land = v > 0
    if land.any():
        q = np.percentile(h[land], [1, 99]); gy, gx = np.gradient(h); slope = float(np.mean(np.hypot(gx, gy)[land])) / (dl * 111320)
    else: q, slope = (0, 0), 0.0
    return v, dict(src=src, tiles=STATS['tiles'] - n0, s=round(time.time() - t0, 1), lo=round(float(q[0])), hi=round(float(q[1])), top=round(float(h.max())), slope=round(slope, 4), land=round(float(land.mean()), 3))


# ------------------------------------------------------------------------------------------------- the encoding
def png_of(v):
    rgb = np.zeros(v.shape + (3,), np.uint8); rgb[..., 0] = v >> 8; rgb[..., 1] = v & 255
    b = io.BytesIO(); Image.fromarray(rgb).save(b, 'PNG', compress_level=9); return b.getvalue()

def webp_of(v):
    rgb = np.zeros(v.shape + (3,), np.uint8); rgb[..., 0] = v >> 8; rgb[..., 1] = v & 255
    b = io.BytesIO(); Image.fromarray(rgb).save(b, 'WEBP', lossless=True, quality=100, method=6); return b.getvalue()

def gain(v, mask=None):
    """what a pack adds to the level below it: the mean slope of the difference between it and its own mean over 2 x 2 drawn
    up again (bilinear, as the card would draw the coarser level) - nought on a plain, tenths in mountains"""
    a = v.astype(np.float32) * STEP; h2, w2 = a.shape[0] // 2, a.shape[1] // 2
    c = a.reshape(h2, 2, w2, 2).mean(axis=(1, 3)); from scipy import ndimage
    up = ndimage.zoom(c, 2, order=1, mode='nearest', grid_mode=True)[:a.shape[0], :a.shape[1]]
    gy, gx = np.gradient(a - up); m = v > 0 if mask is None else mask
    return float(np.mean(np.hypot(gx, gy)[m]) / 306.0) if m.any() else 0.0

def shade(v, k=1.0):
    """a hillshade of half metres at 306 m to a texel scaled by k, lit from the north-west, for the sheet"""
    h = v.astype(np.float32) * STEP; gy, gx = np.gradient(h, 306.0 * k); n = np.sqrt(gx * gx + gy * gy + 1)
    s = (-gx * -0.5 + gy * -0.5 + 0.7) / n
    return np.clip(s * 200, 0, 255).astype(np.uint8)


# ------------------------------------------------------------------------------------------------- a trial
def trial(packs):
    say('a trial of %d packs of level 7: %s' % (len(packs), ' '.join('%d/%d' % p for p in packs)))
    tiles = []
    for px, py in packs:
        lon0, lon1, lat0, lat1, dl = box(TOP, px, py)
        v, st = build7(px, py)
        o = old_heights(TOP, px, py); ov = np.clip(np.round(o / STEP), 0, 65535).astype(np.uint16)
        sizes = {}
        for step in (0.5, 1.0, 2.0):
            w = (v.astype(np.int64) * STEP / step).round().astype(np.uint16)
            rgb = np.zeros(w.shape + (3,), np.uint8); rgb[..., 0] = w >> 8; rgb[..., 1] = w & 255; b = io.BytesIO(); t1 = time.time(); Image.fromarray(rgb).save(b, 'PNG', compress_level=6)
            sizes['png6 %.1f m' % step] = '%.2f MB %.1f s' % (len(b.getvalue()) / 1e6, time.time() - t1)
            t1 = time.time(); sizes['webp %.1f m' % step] = '%.2f MB %.1f s' % (len(webp_of(w)) / 1e6, time.time() - t1)
            if step == 1.0:
                b = io.BytesIO(); t1 = time.time(); Image.fromarray(rgb).save(b, 'WEBP', lossless=True, quality=100, method=4); sizes['webp4 1.0 m'] = '%.2f MB %.1f s' % (len(b.getvalue()) / 1e6, time.time() - t1)
        # what this level adds to the one below: the slope of the difference between the two (the one below drawn up as the card would)
        sizes['adds'] = '%.4f' % gain(v)
        if lat0 > 55 or lat1 < -55:      # (and the tiles one zoom coarser, which beyond 55 degrees still have rows finer than ours)
            v9 = np.clip(np.round(from_tiles(TOP, px, py, 9) * TALL / STEP), 0, 65535).astype(np.uint16); dz = np.abs(v9.astype(np.float32) - v.astype(np.float32)) * STEP
            sizes['zoom 9 against 10'] = 'mean %.1f m, 99%% %.0f m' % (dz.mean(), np.percentile(dz, 99))
        lon0, lon1, lat0, lat1, dl = box(TOP, px, py)
        say('pack 7/%d/%d (%s): %d tiles in %.0f s; land %.0f %%; ground %d .. %d m, the highest %d m (the old packs: %d m); slope %.3f; '
            % (px, py, st['src'], st['tiles'], st['s'], st['land'] * 100, st['lo'], st['hi'], st['top'], o.max(), st['slope'])
            + ', '.join('%s: %s' % kv for kv in sizes.items()))
        # where the old and the new differ most: a crop of 640 around it, both shaded alike
        d = np.abs(v.astype(np.float32) - ov.astype(np.float32)); from scipy import ndimage
        dd = ndimage.uniform_filter(d, 200); y, x = np.unravel_index(np.argmax(dd), dd.shape)
        y0, x0 = int(min(max(y - 320, 0), v.shape[0] - 640)), int(min(max(x - 320, 0), v.shape[1] - 640))
        lon0, lon1, lat0, lat1, dl = box(TOP, px, py)
        say('  most changed about %.2f E %.2f N: the old %d m, the new %d m there' % (lon0 + (x0 + 320) * dl, lat0 - (y0 + 320) * dl, ov[y0:y0 + 640, x0:x0 + 640].max() * STEP, v[y0:y0 + 640, x0:x0 + 640].max() * STEP))
        tiles.append((shade(ov[y0:y0 + 640, x0:x0 + 640]), shade(v[y0:y0 + 640, x0:x0 + 640]), '7/%d/%d' % (px, py)))
    sh = Image.new('L', (2 * 644, 644 * len(tiles)), 40); dr = ImageDraw.Draw(sh)
    for i, (a, b, name) in enumerate(tiles):
        sh.paste(Image.fromarray(a), (0, i * 644)); sh.paste(Image.fromarray(b), (644, i * 644)); dr.text((8, i * 644 + 8), name + ' old', fill=255); dr.text((652, i * 644 + 8), 'new', fill=255)
    sh.save(os.path.join(OUT, 'planet_heights.jpg'), quality=88)
    say('tiles fetched: %d (%.0f MB), failed: %d' % (STATS['tiles'], STATS['bytes'] / 1e6, STATS['failed']))
    # the ice: what the tiles have where the old packs have the ice one stands on
    for name, lon, lat, true in (('Summit, Greenland', -38.46, 72.58, 3216), ('Dome C', 123.35, -75.1, 3233), ('Vostok', 106.84, -78.46, 3488), ('the Ross Ice Shelf', -175.0, -81.0, 50), ('Everest', 86.925, 27.988, 8849), ('Aconcagua', -70.011, -32.653, 6961), ('Mont Blanc', 6.865, 45.833, 4808), ('the Dead Sea', 35.5, 31.5, -430)):
        z = 10; S = 256 << z; x, y = mx(lon, S), my(lat, S); t = tile(z, int(x // 256), int(y // 256))
        val = t[int(y % 256), int(x % 256)] if t is not None else float('nan')
        say('  %s: the tiles %.0f m, the Earth %d m' % (name, val, true))


# ------------------------------------------------------------------------------------------------- the whole Earth
def pyramid(have7):
    """levels 6 .. 0, each the mean of the four texels under it; returns {level: {(px, py): uint16 array}} on disk"""
    have = {TOP: have7}
    for L in range(TOP - 1, -1, -1):
        nx, ny, W, Hh = grid(L); cnx, cny, cW, cH = grid(L + 1); cur = {}
        for py in range(ny):
            for px in range(nx):
                kids = [(cx, cy) for cy in (2 * py, 2 * py + 1) for cx in (2 * px, 2 * px + 1) if cx < cnx and cy < cny]
                kids = [k for k in kids if k in have[L + 1]]
                if not kids: continue
                big = np.zeros((Hh * 2, W * 2), np.float32)
                for cx, cy in kids:
                    a = load_png(have[L + 1][(cx, cy)]).astype(np.float32); ox, oy = (cx - 2 * px) * cW, (cy - 2 * py) * cH
                    big[oy:oy + a.shape[0], ox:ox + a.shape[1]] = a
                v = np.round(big.reshape(Hh, 2, W, 2).mean(axis=(1, 3))).astype(np.uint16)
                if L == 5 and py == grid(5)[1] - 1:      # (the packs of level 5 wholly south of 67.5 degrees: the old packs' own, as they were, not a blur of them)
                    o = old_heights(5, px, py); v = np.clip(np.round(o / STEP), 0, 65535).astype(np.uint16)
                if not v.any(): continue
                f = os.path.join(WORK, 'h', '%d_%d_%d.png' % (L, px, py)); save_png(f, v); cur[(px, py)] = f
        have[L] = cur; say('level %d: %d packs with land' % (L, len(cur)))
    return have

def whole(keep):
    land = sorted(land_packs()); say('%d packs of level 7 have land in them' % len(land))
    have7, stats = {}, {}; done = [0]
    def one(k):
        px, py = k; f = os.path.join(WORK, 'h', '7_%d_%d.png' % (px, py))
        if os.path.exists(f) and os.path.exists(f + '.json'): return k, f, json.load(open(f + '.json'))
        v, st = build7(px, py)
        if not v.any(): return k, None, st
        save_png(f, v); json.dump(st, open(f + '.json', 'w')); st['bytes'] = os.path.getsize(f); json.dump(st, open(f + '.json', 'w'))
        return k, f, st
    with cf.ThreadPoolExecutor(int(words.get('packs', 4))) as ex:      # (some packs at a time: while one waits for its tiles another is averaged or written)
        for k, f, st in ex.map(one, land):
            done[0] += 1
            if f: have7[k] = f; stats[k] = st
            if done[0] % 25 == 0 or st.get('top', 0) > 7000: say('7/%d/%d: %s (%d of %d; %d tiles so far, %.1f GB)' % (k[0], k[1], st, done[0], len(land), STATS['tiles'], STATS['bytes'] / 1e9))
    say('level 7: %d packs; tiles fetched %d (%.1f GB), failed %d' % (len(have7), STATS['tiles'], STATS['bytes'] / 1e9, STATS['failed']))
    have = pyramid(have7)
    # which packs of level 7 are kept: where the ground has relief enough for 306 m to show what 612 do not; and none where
    # the old packs were all there was (Antarctica), at 7 or at 6
    tiles7 = {k for k, s in stats.items() if s['src'] != 'old'}
    for t in (500, 700, 900, 1200, 1600):
        for sl in (0.02, 0.035, 0.05):
            ks = [k for k in tiles7 if stats[k]['hi'] - stats[k]['lo'] > t or stats[k]['slope'] > sl]
            say('  level 7 where relief > %d m or slope > %.3f: %d packs, %.0f MB' % (t, sl, len(ks), sum(stats[k].get('bytes', 0) for k in ks) / 1e6))
    R0, S0 = float(words.get('relief', 900)), float(words.get('slope', 0.035))
    kept = tiles7 if keep == 'all' else {k for k in tiles7 if stats[k]['hi'] - stats[k]['lo'] > R0 or stats[k]['slope'] > S0}
    old6 = {(px, py) for (px, py) in have[6] if all(stats.get((cx, cy), {'src': 'old'})['src'] == 'old' for cy in (2 * py, 2 * py + 1) for cx in (2 * px, 2 * px + 1))}
    say('level 7 kept for %d packs of %d (%s: relief > %d m or slope > %.3f); level 6 for %d of %d' % (len(kept), len(have7), keep, R0, S0, len(have[6]) - len(old6), len(have[6])))
    # encode and bundle
    index = dict(made=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), hash=H, source='the Terrain Tiles (Mapzen/Tilezen on AWS Open Data: SRTM, 3DEP, GMTED2010, ETOPO1); Antarctica from the old packs',
                 packTiles=PER, tile=TILE, maxLevel=TOP, step=STEP, tall=TALL, ext='png', levels={})
    tar = tarfile.open(os.path.join(OUT, 'heights-%s.tar' % H), 'w'); total = 0
    for L in range(0, TOP + 1):
        nx, ny, W, Hh = grid(L); n = 4 if L == TOP else 8; marks = []
        for py in range(ny):
            for px in range(nx):
                if (px, py) not in have[L]: marks.append('S')
                elif (L == TOP and (px, py) not in kept) or (L == 6 and (px, py) in old6): marks.append('L')
                else: marks.append('P')
        index['levels'][str(L)] = dict(nx=nx, ny=ny, bundle=n, packs=''.join(marks))
        groups = {}
        for py in range(ny):
            for px in range(nx):
                if marks[py * nx + px] == 'P': groups.setdefault((px // n, py // n), []).append((px, py))
        for (bx, by), ps in sorted(groups.items()):
            head = bytearray(b'HWB1' + struct.pack('<I', n * n) + bytes(n * n * 8)); body = bytearray(); off = len(head)
            for (px, py) in ps:
                b = open(have[L][(px, py)], 'rb').read(); at = 8 + ((py % n) * n + px % n) * 8
                struct.pack_into('<II', head, at, off + len(body), len(b)); body += b
            data = bytes(head) + bytes(body); name = '%d_b%d_%d.bin' % (L, bx, by)
            ti = tarfile.TarInfo(name); ti.size = len(data); tar.addfile(ti, io.BytesIO(data)); total += len(data)
        say('level %d: %d packs in %d bundles; %.0f MB so far' % (L, marks.count('P'), len(groups), total / 1e6))
    js = json.dumps(index).encode(); ti = tarfile.TarInfo('index.json'); ti.size = len(js); tar.addfile(ti, io.BytesIO(js)); tar.close()
    open(os.path.join(OUT, 'heights-%s.json' % H), 'wb').write(js); open(os.path.join(OUT, 'heights.json'), 'wb').write(js)
    say('the pack: %.0f MB (heights-%s.tar)' % (os.path.getsize(os.path.join(OUT, 'heights-%s.tar' % H)) / 1e6, H))
    # a sheet: the world at level 3, shaded, and some places at level 7
    sheet(have, kept)

def save_png(f, v, level=9):
    rgb = np.zeros(v.shape + (3,), np.uint8); rgb[..., 0] = v >> 8; rgb[..., 1] = v & 255
    Image.fromarray(rgb).save(f + '.part', 'PNG', compress_level=level); os.replace(f + '.part', f)
def load_png(f):
    a = np.asarray(Image.open(f).convert('RGB')); return (a[..., 0].astype(np.uint16) << 8) | a[..., 1]

def sheet(have, kept):
    nx, ny, W, Hh = grid(3); world = np.zeros((ny * Hh, nx * W), np.uint16)
    for (px, py), f in have[3].items(): world[py * Hh:(py + 1) * Hh, px * W:(px + 1) * W] = load_png(f)
    Image.fromarray(shade(world, 16)).resize((4096, 2048)).save(os.path.join(OUT, 'planet_heights_world.jpg'), quality=85)
    rows = []
    for name, lon, lat in (('Everest', 86.925, 27.988), ('K2', 76.513, 35.881), ('Mont Blanc', 6.865, 45.833), ('Aconcagua', -70.011, -32.653), ('Denali', -151.007, 63.069), ('Kilimanjaro', 37.355, -3.066)):
        px, py = int((lon + 180) / (360 / (2 << TOP)) // PER), int((90 - lat) / (360 / (2 << TOP)) // PER)
        f = have[TOP].get((px, py))
        if not f: continue
        v = load_png(f); a0, a1, b0, b1, dl = box(TOP, px, py); x, y = int((lon - a0) / dl), int((b0 - lat) / dl)
        y0, x0 = min(max(y - 256, 0), v.shape[0] - 512), min(max(x - 256, 0), v.shape[1] - 512)
        rows.append(Image.fromarray(shade(v[y0:y0 + 512, x0:x0 + 512])))
        say('%s: the highest within 2 km %d m (the Earth times %.4f)' % (name, v[max(0, y - 6):y + 7, max(0, x - 6):x + 7].max() * STEP, TALL))
    if rows:
        sh = Image.new('L', (516 * len(rows), 512), 40)
        for i, r in enumerate(rows): sh.paste(r, (i * 516, 0))
        sh.save(os.path.join(OUT, 'planet_heights.jpg'), quality=88)


if __name__ == '__main__':
    say('heights: builder %s, zoom %d for level %d, %.1f m steps, %.4f tall' % (H, Z, TOP, STEP, TALL))
    only = words.get('only'); bb = words.get('bbox')
    if only or bb:
        if only: packs = [tuple(int(v) for v in s.split('/')[1:]) for s in only.split(',')]
        else:
            a = [float(v) for v in bb.split(',')]; td = 360.0 / (2 << TOP) * PER
            packs = [(px, py) for py in range(int((90 - a[3]) // td), int((90 - a[1]) // td) + 1) for px in range(int((a[0] + 180) // td), int((a[2] + 180) // td) + 1)]
        trial(packs)
    else:
        whole(KEEP)
    say('done')      # (the workflow keeps what is printed: planet_heights.log)
