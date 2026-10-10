#!/usr/bin/env python3
"""What covers the land of every cell of the simulation's grid (720 x 360, half a degree), by ESA WorldCover 2021 (v200):
the share of each cell that is cropland, grassland, shrubland, trees, bare, built over, wetland, open water and snow.
tools/climate/soil.py makes the land's classes and what they feed from it (and from the climate's classes).

  MODE=cover tools/planet/pack.sh            (the Planet workflow: the WorldCover bucket is on AWS, out of reach from here)
  PICS="cover_a.png cover_b.png planet_cover.jpg" brings the planes here; they are copied to tools/climate/ by hand.

Source: ESA WorldCover 10 m 2021 v200, read at about 900 m from the overviews its files carry (never a whole file).
  https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_<tile>_Map.tif
  CC BY 4.0: (c) ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA
  WorldCover consortium (in the game's menu already).

Writes (out/)
  cover_a.png   RGBA: cropland (40), grassland (30), shrubland (20), trees (10, and mangroves 95)
  cover_b.png   RGBA: bare (60), built over (50), herbaceous wetland (90), open water (80)
                (snow and ice 70 and moss and lichen 100 are what is left; 0 everywhere: nothing seen - south of 60 S, the sea)
  planet_cover.jpg   the cropland and the trees side by side, to look at
"""
import argparse, concurrent.futures as cf, os, re, sys, time, urllib.request
import numpy as np
from PIL import Image

W, H = 720, 360
WC_HOST = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com'; WC_PREFIX = 'v200/2021/map/'; WC_DEG = 3
WC_ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', GDAL_HTTP_MAX_RETRY='5', GDAL_HTTP_RETRY_DELAY='2',
              GDAL_HTTP_MERGE_CONSECUTIVE_RANGES='YES', GDAL_HTTP_MULTIPLEX='YES', VSI_CACHE='TRUE', GDAL_HTTP_TIMEOUT='90', GDAL_HTTP_CONNECTTIMEOUT='30')
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) holocene-planet'}
CELL = 6                     # half-degree cells to a tile's side
READ = 360                   # pixels a tile is read at (60 to a cell)
PLANES = [('crop', (40,)), ('grass', (30,)), ('shrub', (20,)), ('tree', (10, 95)), ('bare', (60,)), ('built', (50,)), ('wet', (90,)), ('water', (80,))]


def say(*a): print(*a, flush=True)


def get(url, tries=4, timeout=120):
    last = None
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r: return r.read()
        except Exception as e: last = e; time.sleep(2.0 * (k + 1))      # noqa
    raise last


def tiles():
    keys, token = [], None
    while True:
        url = WC_HOST + '/?list-type=2&max-keys=1000&prefix=' + urllib.request.quote(WC_PREFIX, safe='') + ('&continuation-token=' + urllib.request.quote(token, safe='') if token else '')
        xml = get(url).decode(); keys += re.findall(r'<Key>([^<]+_Map\.tif)</Key>', xml)
        m = re.search(r'<NextContinuationToken>([^<]+)</NextContinuationToken>', xml)
        if not m: break
        token = m.group(1)
    if len(keys) < 2000: raise RuntimeError('WorldCover: %d tiles listed; the bucket is not laid out as this expects' % len(keys))
    have = {}
    for k in keys:
        m = re.search(r'_([NS])(\d\d)([EW])(\d\d\d)_Map\.tif$', k)
        if m: have[((1 if m.group(1) == 'N' else -1) * int(m.group(2)), (1 if m.group(3) == 'E' else -1) * int(m.group(4)))] = k
    return have


def read(key):
    import rasterio
    from rasterio.enums import Resampling
    last = None
    for k in range(4):
        try:
            with rasterio.Env(**WC_ENV):
                with rasterio.open('/vsicurl/%s/%s' % (WC_HOST, key)) as src:
                    return src.read(1, out_shape=(READ, READ), resampling=Resampling.nearest)
        except Exception as e: last = e; time.sleep(2.0 * (k + 1))      # noqa
    raise last


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', default='out'); ap.add_argument('--work', default='work'); ap.add_argument('--threads', type=int, default=24)
    ap.add_argument('rest', nargs='*'); a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    t0 = time.time(); have = tiles(); say('WorldCover: %d tiles' % len(have))
    acc = np.zeros((len(PLANES), H, W), np.float32); seen = np.zeros((H, W), np.float32)
    step = READ // CELL
    def one(item):
        (lat0, lon0), key = item
        try: cls = read(key)
        except Exception as e: return (lat0, lon0, None, str(e)[:120])
        return (lat0, lon0, cls, None)
    done = bad = 0
    with cf.ThreadPoolExecutor(a.threads) as ex:
        for lat0, lon0, cls, err in ex.map(one, sorted(have.items())):
            if cls is None: bad += 1; say('  %s could not be read: %s' % (have[(lat0, lon0)], err)); continue
            # the tile's cells: its north-west corner is at (lat0 + 3, lon0); rows run south
            y0 = int(round((90 - (lat0 + WC_DEG)) * 2)); x0 = int(round((lon0 + 180) * 2))
            for cy in range(CELL):
                for cx in range(CELL):
                    y, x = y0 + cy, (x0 + cx) % W
                    if y < 0 or y >= H: continue
                    b = cls[cy * step:(cy + 1) * step, cx * step:(cx + 1) * step]
                    n = float(b.size); seen[y, x] += 1
                    for k, (name, vals) in enumerate(PLANES):
                        acc[k, y, x] += np.isin(b, vals).sum() / n
            done += 1
            if done % 250 == 0: say('  %d tiles, %.0f s' % (done, time.time() - t0))
    say('read %d tiles (%d could not be), %.0f s' % (done, bad, time.time() - t0))
    acc /= np.maximum(seen, 1)[None]
    q = np.clip(np.round(acc * 255), 0, 255).astype(np.uint8)
    Image.fromarray(np.stack(q[0:4], -1), 'RGBA').save(os.path.join(a.out, 'cover_a.png'), optimize=True)
    Image.fromarray(np.stack(q[4:8], -1), 'RGBA').save(os.path.join(a.out, 'cover_b.png'), optimize=True)
    for k, (name, _) in enumerate(PLANES): say('%-6s %.1f %% of what WorldCover saw' % (name, 100 * acc[k][seen > 0].mean()))
    # to look at: the cropland (gold) and the trees (green) over the bare (pale) and the rest (grey)
    crop, tree, bare = acc[0], acc[3], acc[4]
    rgb = np.zeros((H, W, 3), np.float32) + np.array([20, 28, 40], np.float32)
    landish = seen > 0
    rgb[landish] = 90
    rgb += (np.array([240, 200, 60]) - 90)[None, None, :] * crop[..., None] * landish[..., None]
    rgb += (np.array([40, 140, 60]) - 90)[None, None, :] * tree[..., None] * landish[..., None]
    rgb += (np.array([230, 220, 190]) - 90)[None, None, :] * bare[..., None] * landish[..., None]
    Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).resize((1440, 720), Image.NEAREST).save(os.path.join(a.out, 'planet_cover.jpg'), quality=90)


if __name__ == '__main__':
    main()
