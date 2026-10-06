#!/usr/bin/env python3
"""The water's edge of the real Earth, as a field of distances: how many metres it is from every place to the nearest shore.

The picture of the Earth says where water is at five kilometres to a texel, which is no coast at all from a hilltop. This
makes a field the ground's shader and everything that stands on the ground can ask: metres to the water's edge (land
positive, water negative) and whether that water is the sea or fresh. A distance field keeps a shoreline far finer than
its own grid (the line where it passes through nought lies true between the texels), and the distance itself is what a
beach, wet sand, surf and the colour of shallows are measured by.

Two sources, both read by GitHub's runners (the cloud workspace cannot reach their hosts): the Water workflow runs this
and keeps the result in the "water" release (tools/water/pack.sh), tools/water/fetch.mjs brings it into data/w/.

1. The Water Body Mask of the Copernicus DEM GLO-90 (90 m: 0 no water, 1 ocean, 2 lake, 3 river), one small GeoTIFF for
   every square degree with land in it, from the Registry of Open Data on AWS:
       https://copernicus-dem-90m.s3.amazonaws.com/<tile>_DEM/AUXFILES/<tile>_WBM.tif
   Licence: free for any use, with this notice wherever what is made from it is given out:
       produced using Copernicus WorldDEM-90 (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018
       provided under COPERNICUS by the European Union and ESA; all rights reserved
       (The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for
       any use of the Copernicus WorldDEM-90.)
   It says what water is the sea and what is not, and its coasts are good. But it was made by radar, much of the north in
   winter, and a frozen lake under snow is land to a radar: whole stretches of Finland, Canada and Siberia have next to
   no lakes in it (the square degree north of 63 N, east of 26 E: a fortieth water, where a sixth is).
2. ESA WorldCover 2021 (v200), land cover at 10 m from the Sentinels: its class 80, permanent water bodies. Tiles of three
   degrees, also on AWS; read at 80 m from the overviews each file carries (a ninth of a per cent of its bytes):
       https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_<tile>_Map.tif
   Licence: CC BY 4.0, with this notice:
       (c) ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover
       consortium
   It fills what the first lacks, and cannot say what water is salt.

What is made of them:
  ocean (1)            water, salt
  lake (1)             water, fresh; a lake under 0.4 km2 is left out (the grid cannot hold it: it would flicker in and
                       out as the eye moved)
  river (1)            water, fresh, where the water is 1.2 km wide and more (the great estuaries, the lower Amazon, the
                       Lena); narrower, it is land: the game draws its rivers itself, wider than life (decal.js), and a
                       second river beside each of them is not wanted
  water only (2) has   beside the sea or a river of (1), a pixel or three: it is that water (the two draw their lines a
                       little apart). Elsewhere fresh water, where it is half a kilometre wide and more (a lake; narrower
                       it is most often a river the game does not draw at all) - but along the rivers the game does
                       draw (data/rivers.png, within a kilometre and a half of the line) only where it is 1.2 km wide,
                       as a river of (1) is.

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

The pack is kept under the name of what it was made from: twelve digits of the SHA-256 of this file and data/rivers.png
together (tools/water/fetch.mjs and the workflow reckon the same).

    python3 tools/water/build.py --out out [--bbox lon0,lat0,lon1,lat1] [--only 7/36/4,7/37/4] [--jobs 4]
    python3 tools/water/build.py --probe          what the sources look like (the first run on a new machine)
    --tiles <dir>     where the source tiles are kept (fetched as needed); --no-fetch: use only what is there
    --no-cover        the first source alone (as the first packs were made)
"""
import os, sys, re, json, math, time, argparse, hashlib, tarfile, urllib.request, urllib.error
import concurrent.futures as cf
import numpy as np

HOST = 'https://copernicus-dem-90m.s3.amazonaws.com'
NOTICE = ('produced using Copernicus WorldDEM-90 (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018 '
          'provided under COPERNICUS by the European Union and ESA; all rights reserved')
WC_HOST = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com'
WC_PREFIX = 'v200/2021/map/'
WC_NOTICE = '(c) ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium'
WC_DEG = 3                                # a tile's side, degrees
WC_PX = 4500                              # what a tile is read at: 80 m (it is 36,000 pixels of 10 m; its overviews are read, not the whole)
WC_WATER = 80                             # the class: permanent water bodies
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
RIVERS = os.path.join(ROOT, 'data', 'rivers.png')      # the rivers the game draws itself
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
ADOPT = 3                                 # working pixels: water only the second source has is the sea's, or a river's, this near to one
LAKE_WIDE = 250.0                         # metres: water only the second source has is kept where a disc of this radius fits into the water ...
LAKE_BACK = 350.0                         # ... and for this far round such a place (its coves and corners)
RIVER_NEAR = 1500.0                       # metres: this near a river the game draws, such water is that river
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


# ---------------------------------------------------------------- the second source --------------------------------
def wc_list(cache):
    """the tiles of three degrees WorldCover has: {(lat, lon) of the south-west corner: its key in the bucket}"""
    path = os.path.join(cache, 'wc', 'tiles.txt'); os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        keys = open(path).read().split()
    else:
        keys, token = [], None
        while True:
            url = WC_HOST + '/?list-type=2&max-keys=1000&prefix=' + urllib.request.quote(WC_PREFIX, safe='') + ('&continuation-token=' + urllib.request.quote(token, safe='') if token else '')
            xml = get(url).decode()
            keys += re.findall(r'<Key>([^<]+_Map\.tif)</Key>', xml)
            m = re.search(r'<NextContinuationToken>([^<]+)</NextContinuationToken>', xml)
            if not m: break
            token = m.group(1)
        if len(keys) < 2000: raise RuntimeError('WorldCover: %d tiles listed; the bucket is not laid out as this expects' % len(keys))
        open(path, 'w').write('\n'.join(keys))
    have = {}
    for k in keys:
        m = re.search(r'_([NS])(\d\d)([EW])(\d\d\d)_Map\.tif$', k)
        if m: have[((1 if m.group(1) == 'N' else -1) * int(m.group(2)), (1 if m.group(3) == 'E' else -1) * int(m.group(4)))] = k
    return have


def wc_path(cache, lat, lon):
    return os.path.join(cache, 'wc', '%s%02d%s%03d.png' % ('N' if lat >= 0 else 'S', abs(lat), 'E' if lon >= 0 else 'W', abs(lon)))


WC_ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', GDAL_HTTP_MAX_RETRY='5', GDAL_HTTP_RETRY_DELAY='2',
              GDAL_HTTP_MERGE_CONSECUTIVE_RANGES='YES', GDAL_HTTP_MULTIPLEX='YES', VSI_CACHE='TRUE', GDAL_HTTP_TIMEOUT='90', GDAL_HTTP_CONNECTTIMEOUT='30')


def wc_read(key, size=WC_PX, about=None):
    """a tile's classes at size x size (from the overview that has them; never the whole file); about: a dict to say what the file is"""
    import rasterio
    from rasterio.enums import Resampling
    with rasterio.Env(**WC_ENV):
        with rasterio.open('/vsicurl/%s/%s' % (WC_HOST, key)) as src:
            if about is not None: about.update(size=(src.height, src.width), bounds=tuple(round(v, 6) for v in src.bounds), overviews=src.overviews(1), block=src.block_shapes[0], compression=str(src.compression), nodata=src.nodata)
            return src.read(1, out_shape=(size, size), resampling=Resampling.nearest)


def fetch_wc(cache, lat, lon, key):
    """the water of one tile, kept as a picture of one bit to the pixel; returns its bytes (0: it was here)"""
    from PIL import Image
    path = wc_path(cache, lat, lon)
    if os.path.exists(path): return 0
    last = None
    for k in range(4):
        try:
            a = wc_read(key); break
        except Exception as e:      # noqa
            last = e; time.sleep(3.0 * (k + 1))
    else:
        raise RuntimeError('WorldCover %s: %s' % (key, last))
    tmp = path + '.part'; Image.fromarray(a == WC_WATER).save(tmp, 'PNG', optimize=True); os.replace(tmp, path)
    return os.path.getsize(path)


def fetch_wcs(cache, want, have, jobs=24):
    want = [t for t in want if not os.path.exists(wc_path(cache, *t))]
    if not want: return
    t0 = time.time(); size = 0
    with cf.ThreadPoolExecutor(jobs) as ex:
        for k, r in enumerate(ex.map(lambda t: fetch_wc(cache, t[0], t[1], have[t]), want)):
            size += r
            if (k + 1) % 200 == 0: print('  WorldCover: %d of %d tiles (%.0f MB kept, %.0f s)' % (k + 1, len(want), size / 1e6, time.time() - t0), flush=True)
    print('WorldCover: fetched the water of %d tiles, %.0f MB kept, in %.0f s' % (len(want), size / 1e6, time.time() - t0), flush=True)


def read_wc(cache, lat, lon):
    from PIL import Image
    path = wc_path(cache, lat, lon)
    if not os.path.exists(path): return None
    return np.array(Image.open(path).convert('1'), dtype=bool)


_RIV = None


def game_rivers():
    """the rivers the game draws (data/rivers.png: decal.js reads the same): a list of (points lon lat, bbox)"""
    global _RIV
    if _RIV is None:
        import struct
        from PIL import Image
        _RIV = []
        if os.path.exists(RIVERS):
            a = np.array(Image.open(RIVERS).convert('RGB'))[..., 0].ravel(); n = int.from_bytes(a[:4].tobytes(), 'little')
            buf = a[8:8 + n].tobytes()
            if a[4:8].tobytes() != b'2VIR' or buf[:4] != b'RIV2': raise RuntimeError('data/rivers.png is not what decal.js reads')
            cnt = struct.unpack_from('<I', buf, 4)[0]; o = 8
            for _ in range(cnt):
                c = struct.unpack_from('<H', buf, o)[0]; o += 8
                pts = np.frombuffer(buf, '<i4', c * 2, o).reshape(c, 2) / 1e5; o += c * 8
                if c > 1: _RIV.append((pts, (pts[:, 0].min(), pts[:, 1].min(), pts[:, 0].max(), pts[:, 1].max())))
    return _RIV


def river_lines(H, W, lat_top, lon_left):
    """the game's rivers drawn into a block's working grid, a pixel wide (None: none here)"""
    from PIL import Image, ImageDraw
    lon1 = lon_left + W * PX; lat0 = lat_top - H * PX; im = None; dr = None
    for pts, (x0, y0, x1, y1) in game_rivers():
        if y1 < lat0 or y0 > lat_top: continue
        for off in (0.0, -360.0, 360.0):      # (a block at the date line looks across it)
            if x1 + off < lon_left or x0 + off > lon1: continue
            if im is None: im = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(im)
            xy = np.empty(pts.shape, np.float64); xy[:, 0] = (pts[:, 0] + off - lon_left) / PX; xy[:, 1] = (lat_top - pts[:, 1]) / PX
            dr.line([tuple(v) for v in xy], fill=255, width=1)
    if im is None: return None
    a = np.array(im, dtype=np.uint8) > 0
    return a if a.any() else None


def grow(m):
    """m and the eight pixels round every pixel of it"""
    g = m.copy(); g[1:] |= m[:-1]; g[:-1] |= m[1:]
    h = g.copy(); h[:, 1:] |= g[:, :-1]; h[:, :-1] |= g[:, 1:]
    return h


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
    bx, by, cache, out, have, have_wc = args
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
        return bx, by, {7: 'S', 6: 'S', 5: 'S'}, (0, 0, 0, time.time() - t0, 0)
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
    # the second source's water, on the same grid
    wc = None
    if have_wc:
        t3 = (np.floor(lats / WC_DEG) * WC_DEG).astype(np.int32); n3 = (np.floor(lonw / WC_DEG) * WC_DEG).astype(np.int32)
        for la in np.unique(t3):
            for lo in np.unique(n3):
                if (int(la), int(lo)) not in have_wc: continue
                m = read_wc(cache, int(la), int(lo))
                if m is None or not m.any(): continue
                rows = np.nonzero(t3 == la)[0]; cols = np.nonzero(n3 == lo)[0]; nr, nc = m.shape
                ri = np.clip(np.floor((la + WC_DEG - lats[rows]) / WC_DEG * nr).astype(np.int64), 0, nr - 1)
                ci = np.clip(np.floor((lonw[cols] - lo) / WC_DEG * nc).astype(np.int64), 0, nc - 1)
                if wc is None: wc = np.zeros((H, W), bool)
                wc[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1] = m[ri[:, None], ci[None, :]]
    sea = cls == 1; fresh = cls == 2; river = cls == 3
    n_wc = 0; unk = None
    if wc is not None:
        # What only the second source has as water. Along a shore the two draw the line a pixel or two apart: beside the sea it
        # is the sea, beside a river that river (and goes the way the river goes, below). What is left is water of its own.
        unk = wc & (cls == 0)
        if unk.any():
            for _ in range(ADOPT):
                for m in (sea, river):
                    if m.any(): g = grow(m) & unk; m |= g; unk &= ~g
        if not unk.any(): unk = None
    n_riv = int(river.sum())
    if n_riv or unk is not None:
        # a river is water where the water is wide: where a disc of RIVER_WIDE fits into all the water there is (sea and lakes
        # with it: a river's mouth is not dammed by the line the source draws between river and sea)
        wall = (cls > 0) | wc if wc is not None else cls > 0
        inner = edt.edt(wall, anisotropy=ani, black_border=False, parallel=1)
        core = inner > RIVER_WIDE; wide = None
        if core.any():
            wide = edt.edt(~core, anisotropy=ani, black_border=False, parallel=1) <= RIVER_WIDE
            fresh |= river & wide
        if unk is not None:
            # water of its own: a lake where it is half a kilometre wide and more (with its coves) - but along a river the
            # game draws for itself only where a river would be kept
            core = inner > LAKE_WIDE
            if core.any():
                keep = unk & (edt.edt(~core, anisotropy=ani, black_border=False, parallel=1) <= LAKE_WIDE + LAKE_BACK)
                lines = river_lines(H, W, lat_top, lon_left) if keep.any() else None
                if lines is not None:
                    by_river = edt.edt(~lines, anisotropy=ani, black_border=False, parallel=1) <= RIVER_NEAR
                    if wide is not None: by_river &= ~wide
                    keep &= ~by_river; del by_river
                n_wc = float(keep.sum()) * dx * dy / 1e6; fresh |= keep; del keep      # (square kilometres)
        del inner, core, wall, wide
    del wc, unk
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
    if nw == 0: return bx, by, {7: 'L', 6: 'L', 5: 'L'}, (len(tiles), n_riv, n_small, time.time() - t0, n_wc)
    if nw == water.size:
        s = 'F' if fresh.mean() > 0.5 else 'S'
        return bx, by, {7: s, 6: s, 5: s}, (len(tiles), n_riv, n_small, time.time() - t0, n_wc)
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
    return bx, by, states, (len(tiles), n_riv, n_small, time.time() - t0, n_wc)


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


def pack_hash():
    """what a pack is kept under: this builder and the rivers the game draws, together"""
    h = hashlib.sha256(open(os.path.abspath(__file__), 'rb').read())
    if os.path.exists(RIVERS): h.update(open(RIVERS, 'rb').read())
    return h.hexdigest()[:12]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='out'); ap.add_argument('--tiles', default=None); ap.add_argument('--bbox', default=None)
    ap.add_argument('--only', default=None); ap.add_argument('--jobs', type=int, default=os.cpu_count() or 2)
    ap.add_argument('--no-fetch', action='store_true'); ap.add_argument('--probe', action='store_true')
    ap.add_argument('--no-cover', action='store_true', help='the first source alone')
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
        # the second source: how its bucket is laid out, what a tile is, how long a read at 80 m takes, what it has where the first has little
        try:
            hw = wc_list(cache); ks = sorted(hw); print('WorldCover tiles:', len(hw), 'from', ks[0], 'to', ks[-1]); print('  keys:', hw[ks[0]], '...', hw[ks[-1]])
            print('  latitudes:', sorted({k[0] for k in ks})[:3], '...', sorted({k[0] for k in ks})[-3:])
            for t in [(63, 24), (60, 24), (39, -3), (60, 120), (-3, -60)]:
                if t not in hw: print(' ', t, 'is not a tile'); continue
                t0 = time.time(); about = {}; arr = wc_read(hw[t], about=about); dt = time.time() - t0
                print(' ', t, hw[t].split('/')[-1], about)
                print('     read at', arr.shape, 'in %.1f s;' % dt, 'classes', dict(zip(*[x.tolist() for x in np.unique(arr, return_counts=True)])))
                t0 = time.time(); n = fetch_wc(cache, t[0], t[1], hw[t]); m = read_wc(cache, *t); print('     kept as %d bytes (%.1f s); water %.4f of it' % (n, time.time() - t0, m.mean()))
            # the square degree the first source has next to no lakes in
            m = read_wc(cache, 63, 24)      # (rows run from the north: 63..64 N is the last third of them, 26..27 E the last third of the columns)
            if m is not None: print('  WorldCover water in 63..64 N, 26..27 E: %.4f (the first source: 0.0254)' % m[3000:4500, 3000:4500].mean())
        except Exception as e:      # noqa
            import traceback; traceback.print_exc(); print('WorldCover: the probe failed:', e)
        print('the game draws %d rivers' % len(game_rivers()))
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
    have_wc = {}
    if not a.no_cover:
        if a.no_fetch:
            for f in os.listdir(os.path.join(cache, 'wc')) if os.path.isdir(os.path.join(cache, 'wc')) else []:
                m = re.match(r'([NS])(\d\d)([EW])(\d\d\d)\.png$', f)
                if m: have_wc[((1 if m.group(1) == 'N' else -1) * int(m.group(2)), (1 if m.group(3) == 'E' else -1) * int(m.group(4)))] = f
        else:
            have_wc = wc_list(cache)
            want_wc = set()
            for (bx, by) in blocks:
                mx = margin_x(by); lon0 = -180.0 + bx * DEG - mx * PX; lon1 = -180.0 + (bx + 1) * DEG + mx * PX; lat1 = min(90.0 - by * DEG + MY * PX, 89.999); lat0 = max(90.0 - (by + 1) * DEG - MY * PX, -89.999)
                for la in range(int(math.floor(lat0 / WC_DEG)) * WC_DEG, int(math.floor(lat1 / WC_DEG)) * WC_DEG + 1, WC_DEG):
                    for lo in range(int(math.floor(lon0 / WC_DEG)) * WC_DEG, int(math.floor(lon1 / WC_DEG)) * WC_DEG + 1, WC_DEG):
                        t = (la, ((lo + 180) % 360) - 180)
                        if t in have_wc: want_wc.add(t)
            print('WorldCover: %d tiles in all, %d wanted' % (len(have_wc), len(want_wc)), flush=True)
            fetch_wcs(cache, sorted(want_wc), have_wc)
        have_wc = set(have_wc)
    print('the second source: %s; the game draws %d rivers' % ('%d tiles' % len(have_wc) if have_wc else 'not used', len(game_rivers())), flush=True)

    t0 = time.time(); states = {}; parts_state = {}; done = 0; tot = [0, 0, 0]
    work = [(bx, by, cache, a.out, have, have_wc) for (bx, by) in blocks]
    with cf.ProcessPoolExecutor(a.jobs) as ex:
        for bx, by, st, info in ex.map(process, work, chunksize=1):
            states[(bx, by)] = st[7]
            for lv in (6, 5): parts_state[(lv, bx, by)] = st[lv]
            done += 1; tot[0] += info[1]; tot[1] += info[2]; tot[2] += info[4]
            if st[7] == 'P' or info[3] > 5: print('  %d/%d  block %d,%d  %s%s%s  %d tiles  %.1f s' % (done, len(blocks), bx, by, st[7], st[6], st[5], info[0], info[3]), flush=True)
    print('level 7: %d packs with a shore; %d small lakes left out; %.0f km2 of water from the second source alone (margins counted with it); %.0f s' % (sum(1 for s in states.values() if s == 'P'), tot[1], tot[2], time.time() - t0), flush=True)

    index = {'made': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'hash': pack_hash(), 'source': NOTICE + (' / ' + WC_NOTICE if have_wc else ''),
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
