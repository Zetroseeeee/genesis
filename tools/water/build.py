#!/usr/bin/env python3
"""The water's edge of the real Earth, as a field of distances: how many metres it is from every place to the nearest shore.

The picture of the Earth says where water is at five kilometres to a texel, which is no coast at all from a hilltop. This
makes a field the ground's shader and everything that stands on the ground can ask: metres to the water's edge (land
positive, water negative) and whether that water is the sea or fresh. A distance field keeps a shoreline far finer than
its own grid (the line where it passes through nought lies true between the texels), and the distance itself is what a
beach, wet sand, surf and the colour of shallows are measured by.

Source: the Water Body Mask of the Copernicus DEM GLO-90 (90 m: 0 no water, 1 ocean, 2 lake, 3 river), one small GeoTIFF
for every square degree with land in it, from the Registry of Open Data on AWS:
    https://copernicus-dem-90m.s3.amazonaws.com/<tile>_DEM/AUXFILES/<tile>_WBM.tif
Licence: free for any use, with this notice wherever what is made from it is given out:
    produced using Copernicus WorldDEM-90 (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018
    provided under COPERNICUS by the European Union and ESA; all rights reserved
    (The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for
    any use of the Copernicus WorldDEM-90.)
The cloud workspace cannot reach that host; GitHub's runners can: the Water workflow runs this and keeps the result in
the "water" release (tools/water/pack.sh), tools/water/fetch.mjs brings it into data/w/.

What is made of the classes:
  ocean                water, salt
  lake                 water, fresh; a lake under 0.4 km2 is left out (the grid cannot hold it: it would flicker in and
                       out as the eye moved)
  river                water, fresh, where the water is 1.2 km wide and more (the great estuaries, the lower Amazon, the
                       Lena); narrower, it is land: the game draws its rivers itself, wider than life (decal.js), and a
                       second river beside each of them is not wanted

Packs: equirectangular, as the elevation's are. Level 7 has 256 x 128 tiles of 512 texels (305 m to a texel north-south),
a pack is 4 x 4 tiles with a rim of one texel all round (2050 x 2050), so that a lookup between two packs' texels is
as good as one inside a pack. Levels 6 and 5 are the same field at half and a quarter of the fineness, for the eye
further off. A WebP without loss, three bytes a texel:
  R  the distance: 128 is the water's edge, a step is 16 m (times the level's scale: 1, 2, 4 for levels 7, 6, 5).
     128..158 is 0..480 m of land (158: that far and further), 128..98 is 0..-480 m of water, and 98..58 runs on to
     -3600 m ever more coarsely (58: that deep in and deeper). The shader's twin of this is in terrain.js.
     (Sixteen metres, and no further inland than a texel's diagonal: what a pack weighs is how much of it is not one
     flat value, and how many values there are. The water's edge itself lies between the texels, far finer.)
  G  what water the nearest water is: 0 the sea ... 255 fresh, in sixteen steps, smoothed over a kilometre or two
  B  nothing yet
A pack with no shore in or near it is not written: index.json says what it is instead (L land, S sea, F fresh water).

    python3 tools/water/build.py --out out [--bbox lon0,lat0,lon1,lat1] [--only 7/36/4,7/37/4] [--jobs 4]
    python3 tools/water/build.py --probe          what the source looks like (the first run on a new machine)
    --tiles <dir>     where the source tiles are kept (fetched as needed); --no-fetch: use only what is there
"""
import os, sys, re, json, math, time, argparse, hashlib, tarfile, urllib.request, urllib.error
import concurrent.futures as cf
import numpy as np

HOST = 'https://copernicus-dem-90m.s3.amazonaws.com'
NOTICE = ('produced using Copernicus WorldDEM-90 (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018 '
          'provided under COPERNICUS by the European Union and ESA; all rights reserved')
R_M = 6371000.0
TILE, PACK_TILES, APRON = 512, 4, 1
TEX = TILE * PACK_TILES                   # texels to a pack's side
TOP = 7                                   # the finest level
LEVELS = (7, 6, 5)
K = 3                                     # working pixels to a level-7 texel (102 m: about what the source has)
N = TEX * K                               # working pixels to a block's side
NX7, NY7 = (2 << TOP) // PACK_TILES, (1 << TOP) // PACK_TILES          # 64 x 32 blocks
DEG = 360.0 / NX7                         # a block's side in degrees (5.625)
PX = DEG / N                              # a working pixel in degrees
MY = 168                                  # the margin round a block, working pixels north and south (17 km): the reach of the coarsest level's distances
RIVER_WIDE = 600.0                        # metres: a river is kept as water where a disc of this radius fits into the water
LAKE_MIN = 0.4e6                          # square metres: smaller lakes are left out
# the distance's code (see the header): STEP metres to the step out to NEAR on both sides, then ever coarser to DEEP
STEP, NEAR, DEEP, FAR_N = 16.0, 480.0, 3600.0, 40.0
C_LAND, C_KNEE = 128.0 + NEAR / STEP, 128.0 - NEAR / STEP          # 158: land, that far and further; 98: where the water's code turns coarse
C_DEEP = C_KNEE - FAR_N                                            # 58: water, that deep in and deeper
B_QUAD = (DEEP - NEAR - STEP * FAR_N) / (FAR_N * FAR_N)


def enc(d, scale):
    """metres (land positive) -> the byte"""
    x = d / scale
    out = 128.0 + np.clip(x, -NEAR, NEAR) / STEP
    deep = x < -NEAR
    if deep.any():
        w = np.minimum(-x[deep], DEEP) - NEAR
        out[deep] = C_KNEE - (-STEP + np.sqrt(STEP * STEP + 4.0 * B_QUAD * w)) / (2.0 * B_QUAD)
    return np.clip(np.rint(out), C_DEEP, C_LAND).astype(np.uint8)


def dec(c, scale):
    """the byte -> metres (the twin of the shader's)"""
    c = c.astype(np.float32); u = np.maximum(C_KNEE - c, 0.0)
    return np.where(c >= C_KNEE, (np.minimum(c, C_LAND) - 128.0) * STEP, -(NEAR + STEP * u + B_QUAD * u * u)) * scale


# ---------------------------------------------------------------- the source ----------------------------------------
def tile_name(lat, lon):
    return 'Copernicus_DSM_COG_30_%s%02d_00_%s%03d_00' % ('N' if lat >= 0 else 'S', abs(lat), 'E' if lon >= 0 else 'W', abs(lon))


def get(url, tries=5, timeout=60):
    last = None
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'holocene-water/1'}), timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (403, 404): raise
            last = e
        except Exception as e:      # noqa
            last = e
        time.sleep(1.5 * (k + 1))
    raise last


def tile_list(cache):
    """the square degrees the source has: a set of (lat, lon) of their south-west corners"""
    path = os.path.join(cache, 'tiles.txt')
    if os.path.exists(path):
        names = open(path).read().split()
    else:
        names = []
        try:
            names = [l.strip() for l in get(HOST + '/tileList.txt').decode().split() if l.strip()]
        except Exception as e:      # noqa
            print('tileList.txt:', e, '- listing the bucket instead', flush=True)
        if len(names) < 1000:        # (the list is not there, or not what it was: ask the bucket)
            names, token = [], None
            while True:
                url = HOST + '/?list-type=2&delimiter=/&max-keys=1000' + ('&continuation-token=' + urllib.request.quote(token, safe='') if token else '')
                xml = get(url).decode()
                names += re.findall(r'<Prefix>(Copernicus_DSM_COG_30_[^<]+?)/</Prefix>', xml)
                m = re.search(r'<NextContinuationToken>([^<]+)</NextContinuationToken>', xml)
                if not m: break
                token = m.group(1)
        os.makedirs(cache, exist_ok=True); open(path, 'w').write('\n'.join(names))
    have = set()
    for nm in names:
        m = re.search(r'_([NS])(\d\d)_00_([EW])(\d\d\d)_00', nm)
        if m: have.add(((1 if m.group(1) == 'N' else -1) * int(m.group(2)), (1 if m.group(3) == 'E' else -1) * int(m.group(4))))
    return have


def tile_path(cache, lat, lon):
    return os.path.join(cache, '%s%02d%s%03d.tif' % ('N' if lat >= 0 else 'S', abs(lat), 'E' if lon >= 0 else 'W', abs(lon)))


def fetch_tile(cache, lat, lon):
    path = tile_path(cache, lat, lon)
    if os.path.exists(path): return 0
    nm = tile_name(lat, lon)
    try:
        data = get('%s/%s_DEM/AUXFILES/%s_WBM.tif' % (HOST, nm, nm))
    except urllib.error.HTTPError as e:
        open(path + '.missing', 'w').write(str(e.code)); return -1
    tmp = path + '.part'; open(tmp, 'wb').write(data); os.replace(tmp, path)
    return len(data)


def fetch_tiles(cache, want, jobs=48):
    want = [t for t in want if not os.path.exists(tile_path(cache, *t)) and not os.path.exists(tile_path(cache, *t) + '.missing')]
    if not want: return 0
    t0 = time.time(); got = 0; missing = 0; size = 0
    with cf.ThreadPoolExecutor(jobs) as ex:
        for k, r in enumerate(ex.map(lambda t: fetch_tile(cache, *t), want)):
            if r < 0: missing += 1
            else: got += 1; size += r
            if (k + 1) % 2000 == 0: print('  fetched %d of %d tiles (%.0f MB, %.0f s)' % (k + 1, len(want), size / 1e6, time.time() - t0), flush=True)
    print('fetched %d tiles, %.0f MB, in %.0f s; %d without a water mask' % (got, size / 1e6, time.time() - t0, missing), flush=True)
    return missing


def read_tile(cache, lat, lon):
    """(classes as uint8 rows x cols, left, bottom, right, top) or None"""
    import rasterio
    path = tile_path(cache, lat, lon)
    if not os.path.exists(path): return None
    with rasterio.open(path) as src:
        a = src.read(1); b = src.bounds
    return a, b.left, b.bottom, b.right, b.top


# ---------------------------------------------------------------- one block ------------------------------------------
def block_tiles(bx, by, mx):
    """the square degrees a block (with its margins) looks into"""
    lon0 = -180.0 + bx * DEG - mx * PX; lon1 = -180.0 + (bx + 1) * DEG + mx * PX
    lat1 = 90.0 - by * DEG + MY * PX; lat0 = 90.0 - (by + 1) * DEG - MY * PX
    out = []
    for la in range(max(-90, math.floor(lat0)), min(89, math.floor(lat1 - 1e-9)) + 1):
        for lo in range(math.floor(lon0), math.floor(lon1 - 1e-9) + 1):
            out.append((la, ((lo + 180) % 360) - 180))
    return out


def margin_x(by):
    """the margin east and west, working pixels: as far in metres as the one north and south (a degree of longitude is shorter in the north)"""
    c = max(math.cos(math.radians(90.0 - (by + 0.5) * DEG)), 0.08)
    return min(int(math.ceil(MY / c / 12.0)) * 12, 1248)


def block_mean(a, k):
    h, w = a.shape
    return a.reshape(h // k, k, w // k, k).mean(axis=(1, 3), dtype=np.float32)


def state_of(dist, kind):
    """what a pack is when it has no shore in it: L, S or F; P when it has"""
    lo, hi = int(dist.min()), int(dist.max())
    if lo == int(C_LAND): return 'L'
    if hi == int(C_DEEP): return 'F' if float(kind.mean()) > 127 else 'S'
    return 'P'


def save(img, path):
    from PIL import Image
    Image.fromarray(img).save(path, 'WEBP', lossless=True, quality=90, method=4)


def process(args):
    """One block of level 7 (and its share of the levels above it). Returns (bx, by, {level: state}, counts)."""
    bx, by, cache, out, have = args
    import edt, cc3d
    from scipy import ndimage
    t0 = time.time()
    mx = margin_x(by); H, W = N + 2 * MY, N + 2 * mx
    lat_top = 90.0 - by * DEG + MY * PX; lon_left = -180.0 + bx * DEG - mx * PX
    lats = lat_top - (np.arange(H) + 0.5) * PX; lons = lon_left + (np.arange(W) + 0.5) * PX
    lats = np.clip(lats, -89.99999, 89.99999)                       # (beyond a pole: the last row again)
    lonw = ((lons + 180.0) % 360.0) - 180.0
    tl = np.floor(lats).astype(np.int32); tn = np.floor(lonw).astype(np.int32)
    tiles = [(int(la), int(lo)) for la in np.unique(tl) for lo in np.unique(tn) if (int(la), int(lo)) in have]
    if not tiles:                                                    # no land for seventeen kilometres round: the open sea
        return bx, by, {7: 'S', 6: 'S', 5: 'S'}, (0, 0, 0, time.time() - t0)
    cls = np.ones((H, W), np.uint8)                                  # where the source has no tile, it is the sea
    for (la, lo) in tiles:
        t = read_tile(cache, la, lo)
        rows = np.nonzero(tl == la)[0]; cols = np.nonzero(tn == lo)[0]
        if not len(rows) or not len(cols): continue
        if t is None: cls[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1] = 0; continue      # (a tile without a mask: land)
        a, l, b, r, tp = t; nr, nc = a.shape
        ri = np.clip(np.floor((tp - lats[rows]) / (tp - b) * nr).astype(np.int64), 0, nr - 1)
        ci = np.clip(np.floor((lonw[cols] - l) / (r - l) * nc).astype(np.int64), 0, nc - 1)
        cls[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1] = a[ri[:, None], ci[None, :]]      # (a tile's rows and columns lie together)
    dy = R_M * math.radians(PX); dx = dy * max(math.cos(math.radians(90.0 - (by + 0.5) * DEG)), 0.02); ani = (dy, dx)
    sea = cls == 1; fresh = cls == 2; river = cls == 3
    n_riv = int(river.sum())
    if n_riv:
        # a river is water where the water is wide: where a disc of RIVER_WIDE fits into all the water there is (sea and lakes
        # with it: a river's mouth is not dammed by the line the source draws between river and sea)
        wall = cls > 0
        inner = edt.edt(wall, anisotropy=ani, black_border=False, parallel=1)
        core = inner > RIVER_WIDE
        if core.any():
            back = edt.edt(~core, anisotropy=ani, black_border=False, parallel=1)
            fresh |= river & (back <= RIVER_WIDE)
            del back
        del inner, core, wall
    # lakes too small for the grid are left out (not those the block's edge cuts: the block beside this one sees them whole)
    n_small = 0
    if fresh.any():
        lab = cc3d.connected_components(fresh, connectivity=8)
        cnt = np.bincount(lab.ravel())
        edge = np.zeros(len(cnt), bool)
        for e in (lab[0], lab[-1], lab[:, 0], lab[:, -1]): edge[np.unique(e)] = True
        small = (cnt * (dx * dy) < LAKE_MIN) & ~edge; small[0] = False
        n_small = int(small.sum())
        if n_small: fresh &= ~small[lab]
        del lab
    water = sea | fresh
    nw = int(water.sum())
    if nw == 0: return bx, by, {7: 'L', 6: 'L', 5: 'L'}, (len(tiles), n_riv, n_small, time.time() - t0)
    if nw == water.size:
        s = 'F' if fresh.mean() > 0.5 else 'S'
        return bx, by, {7: s, 6: s, 5: s}, (len(tiles), n_riv, n_small, time.time() - t0)
    # the distance, metres: a land pixel to the nearest water, a water pixel to the nearest land, less half a pixel each
    # (the edge lies between the two)
    half = 0.5 * math.sqrt(dx * dy)
    d = edt.edt(~water, anisotropy=ani, black_border=False, parallel=1) - half
    np.negative(edt.edt(water, anisotropy=ani, black_border=False, parallel=1) - half, out=d, where=water)
    # what kind of water: fresh's share of the water round about, at the fineness of the texels
    if fresh.any() and sea.any():
        f7 = block_mean(fresh.astype(np.float32), K); w7 = block_mean(water.astype(np.float32), K)
        fb = ndimage.gaussian_filter(f7, 2.5, mode='nearest'); wb = ndimage.gaussian_filter(w7, 2.5, mode='nearest')
        kind7 = np.where(wb > 1e-3, fb / np.maximum(wb, 1e-3), 0.0).astype(np.float32)
        kind = np.repeat(np.repeat(kind7, K, 0), K, 1)
    else:
        kind = np.full((H, W), 1.0 if fresh.any() else 0.0, np.float32)
    del sea, fresh, river, water, cls
    states = {}
    for lv in LEVELS:
        k = K << (TOP - lv); scale = 1 << (TOP - lv); n = N // k + 2 * APRON
        y0, x0 = MY - k * APRON, mx - k * APRON
        dm = block_mean(d[y0:y0 + n * k, x0:x0 + n * k], k); km = block_mean(kind[y0:y0 + n * k, x0:x0 + n * k], k)
        img = np.zeros((n, n, 3), np.uint8); img[..., 0] = enc(dm, float(scale)); img[..., 1] = np.clip(np.rint(km * 15.0) * 17.0, 0, 255)
        img[..., 1][img[..., 0] == int(C_LAND)] = 0                       # (far from any water the kind says nothing: one value packs smaller)
        st = state_of(img[..., 0], img[..., 1]); states[lv] = st
        if lv == TOP:
            if st == 'P': save(img, os.path.join(out, '%d_%d_%d.webp' % (lv, bx, by)))
        elif st == 'P':
            np.save(os.path.join(out, 'parts', '%d_%d_%d.npy' % (lv, bx, by)), img[..., :2])
    return bx, by, states, (len(tiles), n_riv, n_small, time.time() - t0)


CONST = {'L': (int(C_LAND), 0), 'S': (int(C_DEEP), 0), 'F': (int(C_DEEP), 255)}


def assemble(out, lv, parts_state, made):
    """the packs of a coarser level, each from the shares the blocks of level 7 under it wrote ('?' where not all of them were made)"""
    from PIL import Image
    f = 1 << (TOP - lv); S = TEX // f; nx, ny = NX7 // f, NY7 // f; states = {}
    for qy in range(ny):
        for qx in range(nx):
            kids = [(qx * f + a, qy * f + b) for b in range(f) for a in range(f)]
            if any(k not in made for k in kids): states[(qx, qy)] = '?'; continue
            sts = [parts_state[(lv, k[0], k[1])] for k in kids]
            if all(s != 'P' for s in sts) and len(set(sts)) == 1: states[(qx, qy)] = sts[0]; continue
            img = np.zeros((TEX + 2, TEX + 2, 3), np.uint8)
            for whole in (True, False):                               # rims first, then every block's own ground over them
                for (kx, ky), st in zip(kids, sts):
                    a, b = kx - qx * f, ky - qy * f
                    if st == 'P': part = np.load(os.path.join(out, 'parts', '%d_%d_%d.npy' % (lv, kx, ky)))
                    else: part = np.empty((S + 2, S + 2, 2), np.uint8); part[..., 0], part[..., 1] = CONST[st]
                    if whole: img[b * S:b * S + S + 2, a * S:a * S + S + 2, :2] = part
                    else: img[1 + b * S:1 + b * S + S, 1 + a * S:1 + a * S + S, :2] = part[1:-1, 1:-1]
            st = state_of(img[..., 0], img[..., 1]); states[(qx, qy)] = st
            if st == 'P': save(img, os.path.join(out, '%d_%d_%d.webp' % (lv, qx, qy)))
    return states


def sheet(out, states, picks, path, size=512):
    """a picture to look at: some packs of level 7, land grey by its distance from the water, sea blue, fresh water green"""
    from PIL import Image
    tiles = []
    for (bx, by) in picks:
        p = os.path.join(out, '7_%d_%d.webp' % (bx, by))
        if not os.path.exists(p): continue
        a = np.array(Image.open(p)); d = dec(a[..., 0], 1.0); k = a[..., 1].astype(np.float32) / 255.0
        rgb = np.zeros(a.shape, np.float32)
        land = d > 0; t = np.clip(d / NEAR, 0, 1)
        rgb[land] = (np.stack([0.80 - 0.25 * t, 0.76 - 0.2 * t, 0.62 - 0.2 * t], -1))[land]
        w = ~land; dep = np.clip(-d / DEEP, 0, 1) ** 0.5
        sea = np.stack([0.25 - 0.2 * dep, 0.62 - 0.4 * dep, 0.75 - 0.3 * dep], -1); fr = np.stack([0.2 - 0.12 * dep, 0.55 - 0.3 * dep, 0.45 - 0.2 * dep], -1)
        rgb[w] = (sea * (1 - k[..., None]) + fr * k[..., None])[w]
        im = Image.fromarray((rgb * 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)
        tiles.append(im)
    if not tiles: return
    cols = min(4, len(tiles)); rows = (len(tiles) + cols - 1) // cols
    sh = Image.new('RGB', (cols * size, rows * size), (20, 20, 20))
    for i, im in enumerate(tiles): sh.paste(im, ((i % cols) * size, (i // cols) * size))
    sh.save(path, quality=88)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='out'); ap.add_argument('--tiles', default=None); ap.add_argument('--bbox', default=None)
    ap.add_argument('--only', default=None); ap.add_argument('--jobs', type=int, default=os.cpu_count() or 2)
    ap.add_argument('--no-fetch', action='store_true'); ap.add_argument('--probe', action='store_true')
    ap.add_argument('--sheet', default=None, help='blocks for the picture to look at, as "36,4 37,4"')
    a = ap.parse_args()
    cache = a.tiles or os.path.join(a.out, 'tiles'); os.makedirs(cache, exist_ok=True); os.makedirs(os.path.join(a.out, 'parts'), exist_ok=True)

    if a.probe:
        have = tile_list(cache); print('tiles in the source:', len(have)); print('a few:', sorted(have)[:4], sorted(have)[-4:])
        import rasterio
        for (la, lo) in [(63, 26), (39, -1), (41, 29), (-3, -60), (72, 100), (30, 31)]:
            r = fetch_tile(cache, la, lo); p = tile_path(cache, la, lo)
            if r < 0: print((la, lo), 'no water mask', open(p + '.missing').read()); continue
            with rasterio.open(p) as src:
                arr = src.read(1); print((la, lo), 'bytes', os.path.getsize(p), 'shape', arr.shape, arr.dtype, 'bounds', tuple(round(v, 6) for v in src.bounds), 'crs', src.crs, 'classes', dict(zip(*[x.tolist() for x in np.unique(arr, return_counts=True)])))
        return

    blocks = [(bx, by) for by in range(NY7) for bx in range(NX7)]
    if a.only:
        blocks = [tuple(int(v) for v in s.split('/')[-2:]) for s in a.only.split(',')]
    elif a.bbox:
        lo0, la0, lo1, la1 = [float(v) for v in a.bbox.split(',')]
        blocks = [(bx, by) for (bx, by) in blocks if -180 + (bx + 1) * DEG > lo0 and -180 + bx * DEG < lo1 and 90 - by * DEG > la0 and 90 - (by + 1) * DEG < la1]
    partial = bool(a.only or a.bbox)
    print('blocks: %d of %d; working pixel %.1f m; margins %d px north-south' % (len(blocks), NX7 * NY7, R_M * math.radians(PX), MY), flush=True)

    if a.no_fetch:
        have = set()
        for f in os.listdir(cache):
            m = re.match(r'([NS])(\d\d)([EW])(\d\d\d)\.tif$', f)
            if m: have.add(((1 if m.group(1) == 'N' else -1) * int(m.group(2)), (1 if m.group(3) == 'E' else -1) * int(m.group(4))))
    else:
        have = tile_list(cache)
        want = sorted({t for (bx, by) in blocks for t in block_tiles(bx, by, margin_x(by)) if t in have})
        print('source tiles: %d in all, %d wanted' % (len(have), len(want)), flush=True)
        missing = fetch_tiles(cache, want)
        if missing > max(20, len(want) // 50): sys.exit('too many tiles without a water mask (%d of %d): the source is not laid out as this expects' % (missing, len(want)))
    print('tiles here:', len(have), flush=True)

    t0 = time.time(); states = {}; parts_state = {}; done = 0; tot = [0, 0, 0]
    work = [(bx, by, cache, a.out, have) for (bx, by) in blocks]
    with cf.ProcessPoolExecutor(a.jobs) as ex:
        for bx, by, st, info in ex.map(process, work, chunksize=1):
            states[(bx, by)] = st[7]
            for lv in (6, 5): parts_state[(lv, bx, by)] = st[lv]
            done += 1; tot[0] += info[1]; tot[1] += info[2]
            if st[7] == 'P' or info[3] > 5: print('  %d/%d  block %d,%d  %s%s%s  %d tiles  %.1f s' % (done, len(blocks), bx, by, st[7], st[6], st[5], info[0], info[3]), flush=True)
    print('level 7: %d packs with a shore; %d small lakes left out; %.0f s' % (sum(1 for s in states.values() if s == 'P'), tot[1], time.time() - t0), flush=True)

    index = {'made': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'hash': hashlib.sha256(open(os.path.abspath(__file__), 'rb').read()).hexdigest()[:12], 'source': NOTICE,
             'tile': TILE, 'packTiles': PACK_TILES, 'apron': APRON, 'partial': partial,
             'ext': 'webp', 'code': {'step': STEP, 'near': NEAR, 'deep': DEEP, 'quad': B_QUAD, 'land': C_LAND, 'knee': C_KNEE, 'water': C_DEEP}, 'levels': {}}
    index['levels']['7'] = {'scale': 1, 'nx': NX7, 'ny': NY7, 'packs': ''.join(states.get((x, y), '?') for y in range(NY7) for x in range(NX7))}
    for lv in (6, 5):
        f = 1 << (TOP - lv); nx, ny = NX7 // f, NY7 // f
        sts = assemble(a.out, lv, parts_state, set(states))
        index['levels'][str(lv)] = {'scale': 1 << (TOP - lv), 'nx': nx, 'ny': ny, 'packs': ''.join(sts[(x, y)] for y in range(ny) for x in range(nx))}
        print('level %d: %d packs with a shore' % (lv, sum(1 for v in sts.values() if v == 'P')), flush=True)
    json.dump(index, open(os.path.join(a.out, 'index.json'), 'w'))
    files = sorted(f for f in os.listdir(a.out) if re.match(r'\d_\d+_\d+\.webp$', f))
    size = sum(os.path.getsize(os.path.join(a.out, f)) for f in files)
    print('%d packs, %.1f MB' % (len(files), size / 1e6), flush=True)
    picks = [tuple(int(v) for v in s.split(',')) for s in a.sheet.split()] if a.sheet else [b for b in blocks if states.get(b) == 'P'][:16]
    sheet(a.out, states, picks, os.path.join(a.out, 'water_sheet.jpg'))
    with tarfile.open(os.path.join(a.out, 'water.tar'), 'w') as tar:
        tar.add(os.path.join(a.out, 'index.json'), 'index.json')
        for f in files: tar.add(os.path.join(a.out, f), f)
    print('water.tar %.1f MB; %.0f s in all' % (os.path.getsize(os.path.join(a.out, 'water.tar')) / 1e6, time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
