#!/usr/bin/env python3
"""The picture of the Earth (data/i), from NASA's Blue Marble Next Generation at its finest.

What the game had was the Blue Marble of July 2004 at five kilometres to a texel. This makes it at 611 m (level 6: 65,536
texels round the Earth, every level below it a half of the one above), each hemisphere in its summer: July north of the
equator, January south of it, the one going over into the other between twelve degrees north and twelve south - so that
no country lies under its winter's snow or in its dry season's brown, which the game brings on itself, in season.

Sources (the Planet workflow runs this on GitHub: neither host can be reached from the cloud workspace):
1. Blue Marble Next Generation, NASA Earth Observatory (R. Stockli, E. Vermote, N. Saleous, R. Simmon, D. Herring, 2005:
   "The Blue Marble Next Generation - a true color earth dataset including seasonal dynamics from MODIS"), the land's
   surface month by month through 2004 at 500 m, in eight pieces of 21,600 pixels a side for each month (A1 .. D2: A-D
   from the west, 1 north, 2 south), without loss:
       https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/<month>/world.2004MM.3x21600x21600.<piece>_geo.tif
   Public domain (NASA); the credit is in the game's menu.
2. ESA WorldCover 2021 (v200): what covers the land at 10 m, read at 160 m from the overviews its files carry. It says
   what in a texel is water and what is built over.
       https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_<tile>_Map.tif
   CC BY 4.0: (c) ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA
   WorldCover consortium (in the game's menu already, for the water's edge).
3. tools/planet/mask.png: the map of land and water the game's picture always had in its alpha (8192 x 4096: 255 land,
   191 the band of a great river, 128 a lake, 0 the sea). The game still draws its coasts with it from far out and while
   a pack of the water's edge is on its way; it goes into the new packs as it is, weighed between its texels at the
   finer levels (which is what a card did with it before).

What is done to the picture. Its sea is one dark blue and its lakes are black, and the game draws all water itself: a
texel that is not plainly dry land (by WorldCover: nine tenths land and more; south of sixty, where WorldCover has
nothing, by the old mask) takes the colour of the land beside it, carried on under the water smoothly (pulled together
to ever coarser pictures and pushed back down: no stripes), and far out at sea the colour land of that climate has on
the whole. The same for what is built over: the towns of 2004 are grey stains on a world that begins in 10,000 BC, and
are painted over with the country round them. Land keeps its own colour to the texel.

Packs: as the game's always were (two tiles of 512 texels a side to a pack), now with a rim of two texels all round
(1028 x 1028), so that a lookup at a pack's edge is as good as one inside it and no seam has to be matched by hand; WebP,
the colour squeezed (quality Q), the mask without loss, the colour under clear texels kept. They are written in
bundles of 8 x 8 packs (<level>_b<x>_<y>.bin: 'HWB1', the number of places, where each pack begins and how long it is,
then the packs: as the water's edge has them, and for the same reason - an update carries files, not thousands of them).
index.json says which packs there are: P a pack, S nothing but sea (the game draws that without a picture).

The pack is kept under the name of what it was made from (twelve digits of the SHA-256 of this file and mask.png
together): planet-<hash>.tar and planet-<hash>.json in the "planet" release, planet.json for whoever asks for the pack
made last. tools/planet/fetch.mjs brings it into data/i/.

    python3 tools/planet/imagery.py --out out --work work [bbox=lon0,lat0,lon1,lat1] [blocks=4/0,4/1] [jobs=4] [q=90] [places=...]
        bbox / blocks   a trial: only the blocks (45 degrees a side, 8 x 4 of them) that touch the box; kept as
                        planet-part.tar, which is nobody's pack. Look at planet_imagery.jpg and the log.
        nowc=1          without WorldCover (the old mask alone says what is land)
        wc=<pixels>     what a tile of WorldCover is read at (2250: 160 m)
"""
import os, sys, io, re, json, math, time, struct, hashlib, tarfile, shutil, urllib.request, urllib.error
import concurrent.futures as cf
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
MASK = os.path.join(HERE, 'mask.png'); CLIMATE = os.path.join(ROOT, 'data', 'climate.png')
TILE, PER, APRON, TOP, BUNDLE = 512, 2, 2, 6, 8
PACK = TILE * PER                                   # texels to a pack's side, without its rim
W6, H6 = (2 << TOP) * TILE, (1 << TOP) * TILE       # the finest level: 65536 x 32768
BLOCK = PACK * BUNDLE                               # a block is a bundle of the finest level: 8192 texels, 45 degrees
NBX, NBY = W6 // BLOCK, H6 // BLOCK                 # 8 x 4 blocks
MARGIN, TOPK = 128, 6                               # texels round a block that are worked out with it; the coarsest picture a block pulls itself together to (cells of 64 texels)
WIN = BLOCK + 2 * MARGIN
SW, SH, ST = 86400, 43200, 21600                    # the source: pixels round the Earth, from pole to pole, to a piece's side
K6 = SW / W6                                        # source pixels to a texel of the finest level
BLEND = 12.0                                        # degrees either side of the equator over which July gives way to January
BMNG = 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/'
MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
NORTH, SOUTH = 7, 1                                 # the month each hemisphere is shown in
WC_HOST = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com'; WC_PREFIX = 'v200/2021/map/'; WC_DEG = 3
WC_ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', GDAL_HTTP_MAX_RETRY='5', GDAL_HTTP_RETRY_DELAY='2',
              GDAL_HTTP_MERGE_CONSECUTIVE_RANGES='YES', GDAL_HTTP_MULTIPLEX='YES', VSI_CACHE='TRUE', GDAL_HTTP_TIMEOUT='90', GDAL_HTTP_CONNECTTIMEOUT='30')
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) holocene-planet'}
SEA = (12, 30, 60)                                  # (only in the pictures to look at)
PLACES = [('Alps', 9.6, 46.4), ('Paris', 2.35, 48.85), ('London', -0.1, 51.5), ('Po', 10.2, 44.0), ('Nile delta', 31.0, 30.6), ('Tokyo', 139.7, 35.7), ('Finland', 27.0, 62.5), ('Aegean', 25.0, 37.5),
          ('Ganges', 88.0, 23.5), ('Amazon mouth', -50.5, -0.5), ('New York', -74.0, 40.7), ('Mississippi', -90.5, 30.2), ('Rondonia', -62.5, -10.5), ('Cape', 19.0, -33.8), ('Sydney', 151.0, -33.9),
          ('Aral', 60.0, 45.0), ('Maldives', 73.3, 4.0), ('Antarctic peninsula', -62.0, -65.0), ('Titicaca', -69.4, -15.9), ('Hawaii', -156.3, 20.3),
          ('Beijing', 116.4, 39.9), ('China plain', 115.5, 35.5), ('Delhi', 77.2, 28.6), ('Ireland', -8.0, 53.2), ('Madrid', -3.7, 40.4), ('Moscow', 37.6, 55.75), ('Ukraine', 32.0, 49.0), ('Black Forest', 8.6, 48.6),
          ('Shanghai', 121.0, 31.2), ('Java', 110.4, -7.4), ('Corn belt', -93.0, 41.5), ('Sahel', 5.0, 13.0)]


def say(*a): print(*a, flush=True)
def ss(a, b, x): t = np.clip((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t)
def piece(tx, ty): return 'ABCD'[tx] + '12'[ty]
def src_url(m, name): return '%s%s/world.2004%02d.3x21600x21600.%s_geo.tif' % (BMNG, MONTHS[m - 1], m, name)
def src_path(work, m, name): return os.path.join(work, 'src', 'world.2004%02d.%s.tif' % (m, name))


def pack_hash():
    """what a pack is kept under: this builder and the old mask, together"""
    h = hashlib.sha256(open(os.path.abspath(__file__), 'rb').read()); h.update(open(MASK, 'rb').read())
    return h.hexdigest()[:12]


def get(url, tries=4, timeout=120):
    last = None
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r: return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (403, 404): raise
            last = e
        except Exception as e: last = e      # noqa
        time.sleep(2.0 * (k + 1))
    raise last


def fetch_file(url, path, tries=4):
    """a large file, to disk as it comes"""
    if os.path.exists(path): return 0
    os.makedirs(os.path.dirname(path), exist_ok=True); last = None
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r, open(path + '.part', 'wb') as f: shutil.copyfileobj(r, f, 1 << 22)
            os.replace(path + '.part', path); return os.path.getsize(path)
        except Exception as e: last = e; time.sleep(3.0 * (k + 1))      # noqa
    raise RuntimeError('%s: %s' % (url, last))


# ---------------------------------------------------------------- the source ----------------------------------------
class Source:
    """the Blue Marble's pieces on disk, read a window at a time (a piece is kept in strips of one row: a window costs its rows)"""
    def __init__(self, work): self.work = work; self.ds = {}

    def piece(self, m, tx, ty):
        k = (m, tx, ty)
        if k not in self.ds:
            import rasterio
            self.ds[k] = rasterio.open(src_path(self.work, m, piece(tx, ty)))
        return self.ds[k]

    def read(self, m, x0, y0, w, h):
        """(h, w, 3) of month m from source pixel (x0, y0): round the world east and west, the last row carried on past a pole"""
        from rasterio.windows import Window
        out = np.empty((h, w, 3), np.uint8); ya, yb = max(y0, 0), min(y0 + h, SH); x = x0
        while x < x0 + w:
            xm = x % SW; tx = xm // ST; n = min(x0 + w - x, ST - xm % ST); y = ya
            while y < yb:
                ty = y // ST; nr = min(yb - y, ST - y % ST)
                out[y - y0:y - y0 + nr, x - x0:x - x0 + n] = np.moveaxis(self.piece(m, tx, ty).read(window=Window(xm % ST, y % ST, n, nr)), 0, 2)
                y += nr
            x += n
        if ya > y0: out[:ya - y0] = out[ya - y0]
        if yb < y0 + h: out[yb - y0:] = out[yb - y0 - 1]
        return out


def north_share(y):
    """how much of the northern month a source row has (1 north of the band about the equator, 0 south of it)"""
    lat = 90.0 - (np.clip(y, 0, SH - 1) + 0.5) * 180.0 / SH
    return ss(-BLEND, BLEND, lat)


def months_of(y0, h):
    """which months the rows y0 .. y0 + h need: (north?, south?)"""
    wn = north_share(np.arange(y0, y0 + h)); return bool(wn.max() > 0), bool(wn.min() < 1)


def composite(src, x0, y0, w, h):
    """each hemisphere in its summer"""
    wn = north_share(np.arange(y0, y0 + h))
    a = int(np.searchsorted(-wn, -1.0, side='right'))          # rows before a: the northern month alone (wn falls with the row)
    b = int(np.searchsorted(-wn, 0.0, side='left'))            # rows from b: the southern month alone
    if a >= h: return src.read(NORTH, x0, y0, w, h)
    if b <= 0: return src.read(SOUTH, x0, y0, w, h)
    out = np.empty((h, w, 3), np.uint8)
    N = src.read(NORTH, x0, y0, w, b); S = src.read(SOUTH, x0, y0 + a, w, h - a)
    out[:a] = N[:a]; out[b:] = S[b - a:]
    for i in range(a, b, 256):
        j = min(b, i + 256); k = wn[i:j, None, None].astype(np.float32)
        out[i:j] = np.rint(N[i:j] * k + S[i - a:j - a] * (1.0 - k)).astype(np.uint8)
    return out


def level6(src, X0, Y0, n):
    """n x n texels of the finest level from texel (X0, Y0), out of the source by Lanczos' weighing (true to a fraction of a pixel)"""
    sx0, sy0, span = X0 * K6, Y0 * K6, n * K6
    rx0, ry0 = int(math.floor(sx0)) - 8, int(math.floor(sy0)) - 8
    rw, rh = int(math.ceil(sx0 + span)) + 8 - rx0, int(math.ceil(sy0 + span)) + 8 - ry0
    a = composite(src, rx0, ry0, rw, rh); im = Image.fromarray(a); del a
    return np.array(im.resize((n, n), Image.LANCZOS, box=(sx0 - rx0, sy0 - ry0, sx0 - rx0 + span, sy0 - ry0 + span)))


# ---------------------------------------------------------------- what covers the land ------------------------------
def wc_list(work):
    """the tiles of three degrees WorldCover has: {(lat, lon) of the south-west corner: its key in the bucket}"""
    path = os.path.join(work, 'wc_tiles.txt')
    if os.path.exists(path): keys = open(path).read().split()
    else:
        keys, token = [], None
        while True:
            url = WC_HOST + '/?list-type=2&max-keys=1000&prefix=' + urllib.request.quote(WC_PREFIX, safe='') + ('&continuation-token=' + urllib.request.quote(token, safe='') if token else '')
            xml = get(url).decode(); keys += re.findall(r'<Key>([^<]+_Map\.tif)</Key>', xml)
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


def wc_read(key, size):
    """a tile's classes at size x size (from the overview that has them; never the whole file)"""
    import rasterio
    from rasterio.enums import Resampling
    with rasterio.Env(**WC_ENV):
        with rasterio.open('/vsicurl/%s/%s' % (WC_HOST, key)) as src:
            return src.read(1, out_shape=(size, size), resampling=Resampling.nearest)


WC_PLANES = ('cov', 'land', 'built', 'crop', 'tree')      # of a texel's ground: how much WorldCover has seen; how much is land; built over; ploughed; under trees


def wc_tiles_of(X0, Y0, n, tiles):
    """the tiles that touch the window, each with where its west and north edges lie in the window's texels"""
    s = 360.0 / W6; span = WC_DEG / s; out = []
    for (lat0, lon0), key in tiles.items():
        d = (lon0 + 180.0) / s - X0; d = ((d + W6 / 2) % W6) - W6 / 2
        e = (90.0 - (lat0 + WC_DEG)) / s - Y0
        if d < n and d + span > 0 and e < n and e + span > 0: out.append((key, d, e))
    return out


def wc_planes(X0, Y0, n, tiles, size, threads):
    """the window's texels by what WorldCover says of them: uint8 planes (255: all of the texel), and how many tiles were read and how many could not be"""
    s = 360.0 / W6; span = WC_DEG / s; q = size / span; pad = 8
    acc = {k: np.zeros((n, n), np.uint8) for k in WC_PLANES}
    want = wc_tiles_of(X0, Y0, n, tiles)

    def one(t):
        key, d, e = t; cls = None
        for k in range(4):
            try: cls = wc_read(key, size); break
            except Exception as ex: last = ex; time.sleep(2.0 * (k + 1))      # noqa
        if cls is None: return (key, None, str(last)[:120])
        a, b = max(0, int(math.floor(d))), min(n, int(math.ceil(d + span))); c, f = max(0, int(math.floor(e))), min(n, int(math.ceil(e + span)))
        box = ((a - d) * q + pad, (c - e) * q + pad, (b - d) * q + pad, (f - e) * q + pad); res = {}
        planes = {'cov': np.ones(cls.shape, bool), 'land': (cls != 0) & (cls != 80), 'built': cls == 50, 'crop': cls == 40, 'tree': (cls == 10) | (cls == 95)}
        for name in WC_PLANES:
            P = np.zeros((size + 2 * pad, size + 2 * pad), np.uint8); P[pad:-pad, pad:-pad] = planes[name] * np.uint8(255)
            res[name] = np.asarray(Image.fromarray(P).resize((b - a, f - c), Image.BOX, box=box))
        return (key, (a, b, c, f), res)

    got = bad = 0
    with cf.ThreadPoolExecutor(threads) as ex:
        for key, where, res in ex.map(one, want):
            if where is None: bad += 1; say('  WorldCover: %s could not be read: %s' % (key, res)); continue
            a, b, c, f = where; got += 1
            for name in WC_PLANES:
                v = acc[name][c:f, a:b]; v[...] = np.minimum(v.astype(np.uint16) + res[name], 255).astype(np.uint8)
    return acc, got, bad


# ---------------------------------------------------------------- the old mask ---------------------------------------
_MASK = None


def mask3():
    global _MASK
    if _MASK is None: _MASK = np.array(Image.open(MASK).convert('L'))
    return _MASK


def take(a, x0, y0, w, h):
    """a window of a picture of the whole Earth: round the world east and west, the last row carried on past a pole"""
    H, W = a.shape[:2]
    ys = np.clip(np.arange(y0, y0 + h), 0, H - 1); xs = np.arange(x0, x0 + w) % W
    if xs[0] + w <= W and ys[0] == y0 and ys[-1] == y0 + h - 1: return np.array(a[y0:y0 + h, xs[0]:xs[0] + w])      # (one piece: no need to pick it texel by texel)
    return np.array(a[ys[0]:ys[-1] + 1])[ys - ys[0]][:, xs]


def alpha_window(level, X0, Y0, w, h, lows):
    """the old mask for a window of a level: as it is at its own level (3), boxed down below it, weighed between its texels above"""
    if level <= 3: return take(lows[level], X0, Y0, w, h)
    f = 1 << (level - 3); m = mask3(); x0, y0 = X0 // f - 2, Y0 // f - 2; cw, ch = (X0 + w - 1) // f + 3 - x0, (Y0 + h - 1) // f + 3 - y0
    big = np.asarray(Image.fromarray(take(m, x0, y0, cw, ch)).resize((cw * f, ch * f), Image.BILINEAR))
    return np.array(big[Y0 - y0 * f:Y0 - y0 * f + h, X0 - x0 * f:X0 - x0 * f + w])


# ---------------------------------------------------------------- carrying the land's colour on --------------------
def up2(a):
    """twice the size, weighed between four (edges carried on)"""
    h = a.shape[0]; p = np.concatenate([a[:1], a, a[-1:]], 0); r = np.empty((2 * h,) + a.shape[1:], np.float32)
    r[0::2] = 0.75 * p[1:-1] + 0.25 * p[:-2]; r[1::2] = 0.75 * p[1:-1] + 0.25 * p[2:]
    w = r.shape[1]; p = np.concatenate([r[:, :1], r, r[:, -1:]], 1); o = np.empty((2 * h, 2 * w) + a.shape[2:], np.float32)
    o[:, 0::2] = 0.75 * p[:, 1:-1] + 0.25 * p[:, :-2]; o[:, 1::2] = 0.75 * p[:, 1:-1] + 0.25 * p[:, 2:]
    return o


def carry(rgb, src8, keep8, fallback):
    """rgb (n, n, 3) with every texel's colour its own by keep8 / 255 and for the rest the colour of the texels round it, each
    counting by src8 / 255: pulled together to ever coarser pictures (a cell counts while anything in it does) down to cells
    of 2^TOPK texels, which take the fallback's colour where nothing in them counts, and pushed back up. In place."""
    n = rgb.shape[0]; h = n // 2; STRIP = 1024
    c = [None, np.empty((h, h, 3), np.float32)]; w = [None, np.empty((h, h), np.float32)]
    for r in range(0, n, STRIP):
        ww = src8[r:r + STRIP].astype(np.float32) * (1.0 / 255.0); cc = rgb[r:r + STRIP].astype(np.float32) * ww[..., None]
        sw = ww.reshape(-1, 2, h, 2).sum(axis=(1, 3)); sc = cc.reshape(-1, 2, h, 2, 3).sum(axis=(1, 3))
        c[1][r // 2:r // 2 + sw.shape[0]] = sc / np.maximum(sw, 1e-6)[..., None]; w[1][r // 2:r // 2 + sw.shape[0]] = np.minimum(sw, 1.0)
    for k in range(2, TOPK + 1):
        m = c[k - 1].shape[0] // 2; ww = w[k - 1]; cc = c[k - 1] * ww[..., None]
        sw = ww.reshape(m, 2, m, 2).sum(axis=(1, 3)); sc = cc.reshape(m, 2, m, 2, 3).sum(axis=(1, 3))
        c.append(sc / np.maximum(sw, 1e-6)[..., None]); w.append(np.minimum(sw, 1.0))
    f = c[TOPK] * w[TOPK][..., None] + fallback * (1.0 - w[TOPK][..., None])
    for k in range(TOPK - 1, 0, -1): f = c[k] * w[k][..., None] + up2(f) * (1.0 - w[k][..., None])
    del c, w
    for r in range(0, n, STRIP):
        a0, a1 = r // 2, min(h, (r + STRIP) // 2); lo, hi = max(a0 - 1, 0), min(a1 + 1, h)
        u = up2(f[lo:hi])[(a0 - lo) * 2:(a0 - lo) * 2 + (a1 - a0) * 2]
        k = keep8[r:r + STRIP].astype(np.float32)[..., None] * (1.0 / 255.0)
        rgb[r:r + STRIP] = np.clip(np.rint(rgb[r:r + STRIP] * k + u * (1.0 - k)), 0, 255).astype(np.uint8)
    return rgb


def climate_means(work):
    """the colour land of each climate has in the picture on the whole (a table of 32), from the Blue Marble at 8 km"""
    cl = np.array(Image.open(CLIMATE).convert('L')); H, W = cl.shape; pics = {}
    for m in (NORTH, SOUTH):
        f = os.path.join(work, 'src', 'world.2004%02d.8km.jpg' % m)
        fetch_file('%s%s/world.2004%02d.3x5400x2700.jpg' % (BMNG, MONTHS[m - 1], m), f)
        pics[m] = np.array(Image.open(f).convert('RGB').resize((W, H), Image.BOX)).astype(np.float32)
    lat = 90.0 - (np.arange(H) + 0.5) * 180.0 / H; k = ss(-BLEND, BLEND, lat)[:, None, None]
    pic = pics[NORTH] * k + pics[SOUTH] * (1.0 - k)
    land = (np.array(Image.fromarray(mask3()).resize((W, H), Image.BOX)) >= 250) & ~sea_like(pic[..., 0], pic[..., 1], pic[..., 2])
    allmean = pic[land].mean(0); mean = np.tile(allmean, (33, 1)).astype(np.float32)
    for c in range(1, 32):
        m = land & (cl == c)
        if m.sum() > 100: mean[c] = pic[m].mean(0)
    return mean, cl


def sea_like(r, g, b):
    """the Blue Marble's own water: its sea is (2, 5, 20), its shallows dark and blue before anything, its lakes next to black
    (a dark wood is (13, 27, 2): no bluer than it is red, and not that dark)"""
    return ((b > r + 10) & (b > g - 2) & (0.299 * r + 0.587 * g + 0.114 * b < 80)) | (r + g + b < 22) | ((r < 10) & (r + g + b < 60))


def fallback_cells(X0, Y0, n, mean, cl):
    """the climate's colour for the cells of 2^TOPK texels of a window (cells are the same for every window: all begin on a multiple of the cell)"""
    cell = 1 << TOPK; m = n // cell; H, W = cl.shape
    lon = -180.0 + ((X0 // cell + np.arange(m)) % (W6 // cell) + 0.5) * cell * 360.0 / W6; lat = 90.0 - (np.clip(Y0 // cell + np.arange(m), 0, H6 // cell - 1) + 0.5) * cell * 180.0 / H6
    xi = np.clip(((lon + 180.0) / 360.0 * W).astype(int), 0, W - 1); yi = np.clip(((90.0 - lat) / 180.0 * H).astype(int), 0, H - 1)
    return mean[cl[yi][:, xi]]


# ---------------------------------------------------------------- packs and bundles ---------------------------------
def encode(rgb, alpha, q):
    b = io.BytesIO(); Image.fromarray(np.dstack([rgb, alpha])).save(b, 'WEBP', quality=q, method=4, alpha_quality=100, exact=True)
    return b.getvalue()


def write_bundle(path, packs):
    """packs: {(x, y) within the bundle: bytes}"""
    head = bytearray(8 + BUNDLE * BUNDLE * 8); head[0:4] = b'HWB1'; struct.pack_into('<I', head, 4, BUNDLE * BUNDLE); off = len(head); parts = []
    for (x, y) in sorted(packs, key=lambda p: (p[1], p[0])):
        buf = packs[(x, y)]; struct.pack_into('<II', head, 8 + (y * BUNDLE + x) * 8, off, len(buf)); parts.append(buf); off += len(buf)
    with open(path, 'wb') as f: f.write(bytes(head)); [f.write(p) for p in parts]
    return off


def box2(a):
    """half the size: each texel the mean of four (a strip at a time: the level below the finest is a gigabyte and a half)"""
    h = a.shape[0] // 2; out = np.empty((h, a.shape[1] // 2) + a.shape[2:], np.uint8)
    for r in range(0, h, 1024):
        s = np.asarray(a[2 * r:2 * (r + 1024)]).astype(np.uint16)
        out[r:r + 1024] = ((s[0::2, 0::2] + s[1::2, 0::2] + s[0::2, 1::2] + s[1::2, 1::2] + 2) >> 2).astype(np.uint8)
    return out


def psnr(a, b):
    d = a.astype(np.float32) - b.astype(np.float32); return 10.0 * math.log10(255.0 ** 2 / max(float((d * d).mean()), 1e-9))


# ---------------------------------------------------------------- a block ----------------------------------------------
def whose(rgb, alpha, acc, wild=None):
    """what each texel of a window is, as planes of bytes:
      keep  how far its colour is the land's own (255: wholly)
      src   how much it counts for the texels that take their colour from others (only what is plainly open country counts whole)
      tex   how far it is land that is painted over (a town; with wild, a field): it is given its own light and dark back
    A shore is taken strictly: a texel beside one with water in it has the water's dark in its own colour (the source is
    weighed among its neighbours), so it takes the colour from further in - but an islet too small to have a "further in"
    keeps what it has. wild: how far a ploughed texel is to be painted over there (0..1), or None."""
    from scipy import ndimage
    n = rgb.shape[0]; lf8 = np.empty((n, n), np.uint8); bw8 = np.zeros((n, n), np.uint8); pure8 = np.full((n, n), 255, np.uint8); seen = 0; STRIP = 1024
    for r in range(0, n, STRIP):
        sl = slice(r, r + STRIP); lf = ss(0.85, 0.98, alpha[sl].astype(np.float32) * (1.0 / 255.0))
        if acc is not None:
            cov = acc['cov'][sl].astype(np.float32); inv = 1.0 / np.maximum(cov, 1.0); ok = cov >= 128; seen += int(ok.sum()); bf = acc['built'][sl] * inv
            lf = np.where(ok, acc['land'][sl] * inv, lf); bw = np.where(ok, ss(0.08, 0.30, bf), 0.0); pure = np.where(ok, 1.0 - ss(0.01, 0.05, bf), 1.0)
            if wild is not None:
                cf_ = acc['crop'][sl] * inv; tf = acc['tree'][sl] * inv; h = wild[sl]
                bw = np.where(ok, np.maximum(bw, ss(0.25, 0.6, cf_) * h), bw)
                pure = np.where(ok, pure * (1.0 - ss(0.05, 0.2, cf_) * h) * (1.0 - h * 0.9 * (1.0 - ss(0.5, 0.85, tf))), pure)      # (where woods would stand, what is wood today counts most)
            bw8[sl] = np.rint(bw * 255.0).astype(np.uint8); pure8[sl] = np.rint(pure * 255.0).astype(np.uint8)
        lf8[sl] = np.rint(np.clip(lf, 0.0, 1.0) * 255.0).astype(np.uint8)
    lmin = ndimage.minimum_filter(lf8, size=3, mode='nearest'); strict8 = np.empty((n, n), np.uint8)
    for r in range(0, n, STRIP): strict8[r:r + STRIP] = np.rint(ss(0.70, 0.95, lmin[r:r + STRIP].astype(np.float32) * (1.0 / 255.0)) * 255.0).astype(np.uint8)
    del lmin; near = ndimage.maximum_filter(strict8, size=7, mode='nearest') > 0
    keep8 = np.empty((n, n), np.uint8); src8 = np.empty((n, n), np.uint8); tex8 = np.empty((n, n), np.uint8)
    for r in range(0, n, STRIP):
        sl = slice(r, r + STRIP); kl = np.where(near[sl], strict8[sl].astype(np.float32), ss(0.70, 0.95, lf8[sl].astype(np.float32) * (1.0 / 255.0)) * 255.0) * (1.0 / 255.0)
        c = rgb[sl].astype(np.float32); kl[sea_like(c[..., 0], c[..., 1], c[..., 2])] = 0.0; bw = bw8[sl].astype(np.float32) * (1.0 / 255.0)
        keep = kl * (1.0 - bw); keep8[sl] = np.rint(keep * 255.0).astype(np.uint8); src8[sl] = np.rint(keep * pure8[sl]).astype(np.uint8); tex8[sl] = np.rint(kl * bw * 255.0).astype(np.uint8)
    return keep8, src8, tex8, seen


def detail_of(rgb):
    """how much lighter or darker each texel is than the country round it (some three kilometres): a byte, 128 for neither"""
    n = rgb.shape[0]; lum = np.asarray(Image.fromarray(rgb).convert('L')); low = np.asarray(Image.fromarray(lum).resize((n // 8, n // 8), Image.BOX).resize((n, n), Image.BICUBIC))
    return np.clip(lum.astype(np.int16) - low + 128, 0, 255).astype(np.uint8)


def retexture(rgb, tex8, det8, gain):
    """land that was painted over gets its own light and dark back, in the colour it was given (a town's streets and parks become
    the mottle of open country; painted plain, it was a smear among the fields)"""
    n = rgb.shape[0]
    for r in range(0, n, 1024):
        sl = slice(r, r + 1024); t = tex8[sl]
        if not t.any(): continue
        c = rgb[sl].astype(np.float32); lum = 0.299 * c[..., 0] + 0.587 * c[..., 1] + 0.114 * c[..., 2]
        f = 1.0 + gain * (t.astype(np.float32) * (1.0 / 255.0)) * (det8[sl].astype(np.float32) - 128.0) / np.maximum(lum, 24.0)
        rgb[sl] = np.clip(np.rint(c * np.clip(f, 0.6, 1.6)[..., None]), 0, 255).astype(np.uint8)


def block(job):
    """one block of the finest level: its packs into a bundle, its picture at half the size into the level below. Returns what it did."""
    bx, by, cfg = job; t0 = time.time(); T = {}; work = cfg['work']
    X0, Y0, n = bx * BLOCK - MARGIN, by * BLOCK - MARGIN, WIN
    src = Source(work); rgb = level6(src, X0, Y0, n); T['picture'] = time.time() - t0; t1 = time.time()
    alpha = alpha_window(TOP, X0, Y0, n, n, None)
    if cfg['tiles']: acc, got, bad = wc_planes(X0, Y0, n, cfg['tiles'], cfg['wc'], cfg['threads'])
    else: acc, got, bad = None, 0, 0
    T['cover'] = time.time() - t1; t1 = time.time()
    keep8, src8, tex8, seen = whose(rgb, alpha, acc); det8 = detail_of(rgb)
    mean, cl = cfg['mean'], cfg['climate']; fb = fallback_cells(X0, Y0, n, mean, cl)
    inner = (slice(MARGIN, MARGIN + BLOCK), slice(MARGIN, MARGIN + BLOCK))
    stats = dict(bx=bx, by=by, tiles=got, bad=bad, seen=seen / float(n * n), own=float((keep8[inner] == 255).mean()), none=float((keep8[inner] == 0).mean()), town=float((tex8[inner] > 127).mean()))
    shots = []; S = cfg['shot'] // 2; sdir = os.path.join(work, 'sheet')
    for name, lon, lat in cfg['places']:      # (the picture before anything is done to it, for the sheet)
        px, py = int((lon + 180.0) / 360.0 * W6) - X0, int((90.0 - lat) / 180.0 * H6) - Y0
        if MARGIN <= px < MARGIN + BLOCK and MARGIN <= py < MARGIN + BLOCK:
            a, b, c, d = max(0, py - S), min(n, py + S), max(0, px - S), min(n, px + S); shots.append((name.replace(' ', '_'), a, b, c, d))
            Image.fromarray(rgb[a:b, c:d]).save(os.path.join(sdir, '%s_0raw.png' % name.replace(' ', '_')))
    if cfg.get('wild') and acc is not None and shots:      # (a trial: the country as it might lie unploughed, for the sheet only)
        info = np.asarray(Image.open(os.path.join(ROOT, 'data', 'info.png')).convert('RGBA'))[..., 3]; fi = W6 // info.shape[1]
        x0, y0 = X0 // fi - 2, Y0 // fi - 2; cw = (X0 + n - 1) // fi + 3 - x0
        hum = np.asarray(Image.fromarray(take(info, x0, y0, cw, cw)).resize((cw * fi, cw * fi), Image.BILINEAR))[Y0 - y0 * fi:Y0 - y0 * fi + n, X0 - x0 * fi:X0 - x0 * fi + n]
        wild = ss(0.35, 0.6, hum.astype(np.float32) * (1.0 / 255.0)); del hum
        k2, s2, t2, _ = whose(rgb, alpha, acc, wild); del wild; alt = rgb.copy(); carry(alt, s2, k2, fb); retexture(alt, t2, det8, cfg['gain'])
        for nm, a, b, c, d in shots: Image.fromarray(alt[a:b, c:d]).save(os.path.join(sdir, '%s_5wild.png' % nm))
        del alt, k2, s2, t2
    carry(rgb, src8, keep8, fb)
    for nm, a, b, c, d in shots: Image.fromarray(rgb[a:b, c:d]).save(os.path.join(sdir, '%s_6plain.png' % nm))
    retexture(rgb, tex8, det8, cfg['gain']); del det8; T['carry'] = time.time() - t1; t1 = time.time()
    for nm, a, b, c, d in shots:
        Image.fromarray(rgb[a:b, c:d]).save(os.path.join(sdir, '%s_1out.png' % nm))
        wet = alpha[a:b, c:d] < 92
        if acc is not None: cv = acc['cov'][a:b, c:d]; wet = np.where(cv >= 128, acc['land'][a:b, c:d].astype(np.float32) < 0.5 * cv, wet)
        v = rgb[a:b, c:d].copy(); v[wet] = SEA; Image.fromarray(v).save(os.path.join(sdir, '%s_2sea.png' % nm))
        Image.fromarray(np.dstack([keep8[a:b, c:d], src8[a:b, c:d], tex8[a:b, c:d]])).save(os.path.join(sdir, '%s_3own.png' % nm))
        if acc is not None: Image.fromarray(np.dstack([acc['built'][a:b, c:d], acc['tree'][a:b, c:d], acc['crop'][a:b, c:d]])).save(os.path.join(sdir, '%s_4cover.png' % nm))
    del acc, src8, tex8
    # the packs
    packs = {}; present = []; size = 0; q = cfg['q']; check = None
    for j in range(BUNDLE):
        for i in range(BUNDLE):
            o = (slice(MARGIN + j * PACK - APRON, MARGIN + (j + 1) * PACK + APRON), slice(MARGIN + i * PACK - APRON, MARGIN + (i + 1) * PACK + APRON))
            a = alpha[o]; own = keep8[o]
            if not (a.max() > 0 or own.max() > 0): continue
            buf = encode(rgb[o], a, q); packs[(i, j)] = buf; present.append((bx * BUNDLE + i, by * BUNDLE + j)); size += len(buf)
            if check is None and own.min() < 255 and own.max() == 255 and a.min() == 0:      # (the first pack with a coast in it: does it come back as it was written?)
                back = np.array(Image.open(io.BytesIO(buf)).convert('RGBA')); clear = a == 0
                check = dict(pack='%d/%d' % (bx * BUNDLE + i, by * BUNDLE + j), bytes=len(buf), alpha=bool(np.array_equal(back[..., 3], a)), db=round(psnr(back[..., :3], rgb[o]), 1),
                             db_clear=round(psnr(back[..., :3][clear], rgb[o][clear]), 1), sizes={qq: len(encode(rgb[o], a, qq)) for qq in (85, 90, 92, 95)})
    if packs: write_bundle(os.path.join(work, 'packs', '%d_b%d_%d.bin' % (TOP, bx, by)), packs)
    T['packs'] = time.time() - t1
    # the level below: this block at half the size
    l5 = np.lib.format.open_memmap(os.path.join(work, 'l5.npy'), mode='r+'); l5[by * (BLOCK // 2):(by + 1) * (BLOCK // 2), bx * (BLOCK // 2):(bx + 1) * (BLOCK // 2)] = box2(rgb[inner]); l5.flush(); del l5
    stats.update(present=present, bytes=size, check=check, seconds={k: round(v, 1) for k, v in T.items()}, total=round(time.time() - t0, 1))
    return stats


# ---------------------------------------------------------------- the whole ---------------------------------------------
def blocks_of(cfg):
    if cfg.get('blocks'): return [tuple(int(v) for v in b.split('/')) for b in cfg['blocks'].split(',')]
    if cfg.get('bbox'):
        lon0, lat0, lon1, lat1 = [float(v) for v in cfg['bbox'].split(',')]; lat0, lat1 = max(lat0, lat1), min(lat0, lat1)
        xs = range(int(math.floor((lon0 + 180.0) / 45.0)), int(math.floor((lon1 + 180.0 - 1e-9) / 45.0)) + 1); ys = range(int(math.floor((90.0 - lat0) / 45.0)), int(math.floor((90.0 - lat1 - 1e-9) / 45.0)) + 1)
        return [(x % NBX, y) for y in ys for x in xs if 0 <= y < NBY]
    return [(x, y) for y in range(NBY) for x in range(NBX)]


def pieces_of(bx, by):
    """the source's pieces a block reads: {(month, name)}"""
    X0, Y0 = bx * BLOCK - MARGIN, by * BLOCK - MARGIN; x0, y0 = int(math.floor(X0 * K6)) - 8, int(math.floor(Y0 * K6)) - 8; w = int(math.ceil(WIN * K6)) + 18
    ya, yb = max(y0, 0), min(y0 + w, SH) - 1; need = set(); wn = north_share(np.arange(ya, yb + 1))
    for ty in {ya // ST, yb // ST}:
        rows = (np.arange(ya, yb + 1) // ST) == ty
        for tx in {(x0 % SW) // ST, ((x0 + w - 1) % SW) // ST}:
            if wn[rows].max() > 0: need.add((NORTH, piece(tx, ty)))
            if wn[rows].min() < 1: need.add((SOUTH, piece(tx, ty)))
    return need


def main():
    arg = lambda n, d=None: sys.argv[sys.argv.index('--' + n) + 1] if '--' + n in sys.argv else d
    out, work = arg('out', 'out'), arg('work', 'work'); opt = dict(a.split('=', 1) for a in sys.argv[1:] if '=' in a and not a.startswith('--'))
    for d in (out, work, os.path.join(work, 'src'), os.path.join(work, 'packs'), os.path.join(work, 'sheet')): os.makedirs(d, exist_ok=True)
    t0 = time.time(); H = pack_hash(); jobs = int(opt.get('jobs', min(4, os.cpu_count() or 2))); q = int(opt.get('q', 90)); q3 = int(opt.get('q3', 96))
    todo = blocks_of(opt); part = len(todo) < NBX * NBY
    say('the picture of the Earth: pack %s; %d of %d blocks%s; %d at a time; quality %d (%d at the levels the old picture had)' % (H, len(todo), NBX * NBY, ' (a trial)' if part else '', jobs, q, q3))
    # ---- the source
    need = set()
    for b in todo: need |= pieces_of(*b)
    t1 = time.time()
    with cf.ThreadPoolExecutor(4) as ex: got = list(ex.map(lambda mp: fetch_file(src_url(*mp), src_path(work, *mp)), sorted(need)))
    say('the Blue Marble: %d pieces (%s), %.1f GB fetched in %.0f s' % (len(need), ' '.join('%02d%s' % mp for mp in sorted(need)), sum(got) / 1e9, time.time() - t1))
    tiles = {}
    if opt.get('nowc') != '1':
        tiles = wc_list(work); say('WorldCover: %d tiles, from %s to %s' % (len(tiles), min(tiles), max(tiles)))
    mean, cl = climate_means(work)
    say('the land\'s colour by climate: ' + '  '.join('%d: %d %d %d' % (c, *np.rint(mean[c])) for c in range(1, 32)))
    # ---- the level below the finest, whole: the climate's colour everywhere first (what a block of nothing but sea comes to), then each block's own
    l5 = np.lib.format.open_memmap(os.path.join(work, 'l5.npy'), mode='w+', dtype=np.uint8, shape=(H6 // 2, W6 // 2, 3))
    cells = fallback_cells(0, 0, W6, mean, cl)[:H6 >> TOPK]      # (1024 across, 512 down)
    big = Image.fromarray(np.clip(np.rint(cells), 0, 255).astype(np.uint8)).resize((W6 // 2, H6 // 2), Image.BILINEAR)
    for r in range(0, H6 // 2, 2048): l5[r:r + 2048] = np.asarray(big.crop((0, r, W6 // 2, min(H6 // 2, r + 2048))))
    l5.flush(); del l5, big
    # ---- the blocks. One of nothing but sea (no land in the old mask, no tile of WorldCover) is not gone through.
    m3 = mask3(); go = []; present = np.zeros((H6 // PACK, W6 // PACK), bool)
    for bx, by in todo:
        land = take(m3, (bx * BLOCK - MARGIN) // 8 - 1, (by * BLOCK - MARGIN) // 8 - 1, WIN // 8 + 2, WIN // 8 + 2).max() > 0
        if land or (tiles and wc_tiles_of(bx * BLOCK - MARGIN, by * BLOCK - MARGIN, WIN, tiles)): go.append((bx, by))
    say('%d blocks have land in them: %s' % (len(go), ' '.join('%d/%d' % b for b in go)))
    places = [p for p in PLACES if not opt.get('places') or p[0].replace(' ', '_') in opt['places'].split(',')]
    cfg = dict(work=work, tiles=tiles, wc=int(opt.get('wc', 2250)), threads=int(opt.get('threads', 16)), mean=mean, climate=cl, q=q, places=places, shot=int(opt.get('shot', 640)), gain=float(opt.get('gain', 0.6)), wild=opt.get('wild') == '1')
    done = []; fails = 0
    import multiprocessing as mp
    with cf.ProcessPoolExecutor(jobs, mp_context=mp.get_context('spawn')) as ex:
        for st in ex.map(block, [(bx, by, cfg) for bx, by in go]):
            done.append(st); fails += st['bad']
            for px, py in st['present']: present[py, px] = True
            say('block %d/%d: %d packs, %.1f MB; WorldCover %d tiles (%d not read), saw %.0f%% of it; %.0f%% the land\'s own colour, %.0f%% carried on, %.2f%% towns; %s; %.0f s' % (
                st['bx'], st['by'], len(st['present']), st['bytes'] / 1e6, st['tiles'], st['bad'], 100 * st['seen'], 100 * st['own'], 100 * st['none'], 100 * st['town'], st['seconds'], st['total']))
            if st['check']: say('   pack %(pack)s: %(bytes)d bytes; the mask came back whole: %(alpha)s; colour %(db).1f dB, under the clear texels %(db_clear).1f dB; at other qualities %(sizes)s' % st['check'])
    if fails and opt.get('lenient') != '1': sys.exit('WorldCover: %d tiles could not be read (lenient=1 goes on without them)' % fails)
    say('the finest level: %d packs, %.1f MB, in %.0f s' % (int(present.sum()), sum(s['bytes'] for s in done) / 1e6, time.time() - t0))
    # ---- the levels below
    t1 = time.time(); lows = {3: m3}
    for lv in (2, 1, 0): lows[lv] = box2(lows[lv + 1])
    levels = {TOP: dict(nx=W6 // PACK, ny=H6 // PACK, packs=''.join('P' if v else 'S' for v in present.ravel()))}
    pic = np.load(os.path.join(work, 'l5.npy'), mmap_mode='r'); child = present; total = sum(s['bytes'] for s in done); count = int(present.sum())
    for lv in range(TOP - 1, -1, -1):
        tx, ty = 2 << lv, 1 << lv; nx, ny = max(1, tx // PER), max(1, ty // PER); cw, ch = (tx // nx) * TILE, (ty // ny) * TILE      # (a pack's own texels: 1024 x 1024, at level 0 1024 x 512)
        if lv < TOP - 1: pic = box2(pic)
        has = child.reshape(ny, 2, nx, 2).any(axis=(1, 3)) if lv > 3 else np.ones((ny, nx), bool)      # (a pack is there where one above it is; the levels the game always had are whole, as they were)
        bundles = {}; code = []
        for py in range(ny):
            for px in range(nx):
                a = alpha_window(lv, px * cw - APRON, py * ch - APRON, cw + 2 * APRON, ch + 2 * APRON, lows)
                if not (has[py, px] or a.max() > 0): code.append('S'); continue
                buf = encode(take(pic, px * cw - APRON, py * ch - APRON, cw + 2 * APRON, ch + 2 * APRON), a, q if lv > 3 else q3)
                bundles.setdefault((px // BUNDLE, py // BUNDLE), {})[(px % BUNDLE, py % BUNDLE)] = buf; code.append('P'); total += len(buf); count += 1
        for (gx, gy), packs in bundles.items(): write_bundle(os.path.join(work, 'packs', '%d_b%d_%d.bin' % (lv, gx, gy)), packs)
        levels[lv] = dict(nx=nx, ny=ny, packs=''.join(code)); child = np.array([c == 'P' for c in code]).reshape(ny, nx)
        say('level %d: %d packs of %d x %d in %d bundles' % (lv, code.count('P'), cw + 2 * APRON, ch + 2 * APRON, len(bundles)))
    del pic
    made = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    index = dict(made=made, hash=H, source='NASA Blue Marble Next Generation, 2004: July north of the equator, January south of it', packTiles=PER, tile=TILE, apron=APRON, maxLevel=TOP, ext='webp', bundle=BUNDLE,
                 levels={str(k): levels[k] for k in sorted(levels)})
    if part: index['partial'] = True
    json.dump(index, open(os.path.join(work, 'packs', 'index.json'), 'w'))
    files = sorted(os.listdir(os.path.join(work, 'packs'))); name = 'planet-part' if part else 'planet-' + H
    with tarfile.open(os.path.join(out, name + '.tar'), 'w') as tar:
        for f in files: tar.add(os.path.join(work, 'packs', f), arcname=f)
    if not part:
        for f in ('planet-%s.json' % H, 'planet.json'): json.dump(index, open(os.path.join(out, f), 'w'))
    say('%d packs in %d files, %.1f MB; %s.tar %.1f MB; the levels below the finest took %.0f s' % (count, len(files), total / 1e6, name, os.path.getsize(os.path.join(out, name + '.tar')) / 1e6, time.time() - t1))
    sheet(work, out, places, cfg['shot'])
    say('%.0f s in all' % (time.time() - t0))


def sheet(work, out, places, S):
    """the places to look at, side by side: the Blue Marble as it is; with the land's colour carried on; that with the water where WorldCover has it; how far each texel's colour is its own; what covers it (red built over, green trees, blue ploughed)"""
    rows = []
    for name, lon, lat in places:
        nm = name.replace(' ', '_'); fs = [os.path.join(work, 'sheet', '%s_%s.png' % (nm, k)) for k in ('0raw', '1out', '6plain', '5wild', '2sea', '3own', '4cover')]
        if os.path.exists(fs[0]): rows.append((name, [Image.open(f).convert('RGB') for f in fs if os.path.exists(f)]))
    if not rows: return
    cols = max(len(r[1]) for r in rows); sh = Image.new('RGB', (cols * (S + 4), len(rows) * (S + 4)), (12, 16, 26))
    for j, (name, ims) in enumerate(rows):
        for i, im in enumerate(ims): sh.paste(im, (i * (S + 4), j * (S + 4)))
    sh.save(os.path.join(out, 'planet_imagery.jpg'), quality=90); say('planet_imagery.jpg: %s (one row each: as it is; as the game gets it; that without the towns\' own light and dark; [wild=1: unploughed;] with the water; own (red), counted (green), painted over (blue); cover: built red, trees green, ploughed blue)' % ', '.join(r[0] for r in rows))


if __name__ == '__main__':
    main()
