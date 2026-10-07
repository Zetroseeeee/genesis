#!/usr/bin/env python3
"""Looks at where the planet's pictures come from, and says what is there (the Planet workflow, mode "probe").

    python3 tools/planet/probe.py --out out --work work [urls] [months] [sheet]

  urls    asks every source for its head (is it there, how large) and lists the folders
  months  holds the game's picture of the Earth (data/i) against every month of NASA's Blue Marble Next Generation, to
          find which it was made from (the picture's origin was never written down)
  sheet   a sheet of pictures to look at: the game's picture beside the months that might take its place
Nothing told: all three.
"""
import os, sys, re, io, json, time, urllib.request, urllib.error
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
arg = lambda n, d=None: sys.argv[sys.argv.index('--' + n) + 1] if '--' + n in sys.argv else d
OUT, WORK = arg('out', 'out'), arg('work', 'work')
what = [a for a in sys.argv[1:] if a in ('urls', 'months', 'sheet')] or ['urls', 'months', 'sheet']
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) holocene-planet-probe'}
EO = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/'
# Blue Marble Next Generation at the Earth Observatory: a record for every month and kind (the plain land surface; with the
# hills' shade; with the sea bed's too). The records' numbers as remembered: the probe says which are right.
IDS = {'': [74243, 74268, 74293, 74318, 74343, 74368, 74393, 74418, 74443, 74468, 74493, 74518],
       '.topo': [73938, 73967, 73992, 74017, 74042, 74067, 74092, 74117, 74142, 74167, 74192, 74218],
       '.topo.bathy': [73580, 73605, 73630, 73655, 73701, 73726, 73751, 73776, 73801, 73826, 73884, 73909]}
def bmng(m, kind='', size='3x5400x2700', ext='jpg', tile=''):
    i = IDS[kind][m - 1]; return '%s%d/%d/world%s.2004%02d.%s%s.%s' % (EO, i // 1000 * 1000, i, kind, m, size, tile and '.' + tile, ext)
SVS = 'https://svs.gsfc.nasa.gov/vis/a000000/'


def ask(url, method='HEAD', rng=None, timeout=60):
    """(status, headers) or (error text, {})"""
    h = dict(UA)
    if rng: h['Range'] = rng
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method=method, headers=h), timeout=timeout) as r:
            return r.status, dict(r.headers)
    except urllib.error.HTTPError as e: return e.code, dict(e.headers or {})
    except Exception as e: return str(e)[:80], {}


def get(url, timeout=600, tries=3):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r: return r.read()
        except Exception as e:
            if k == tries - 1: raise
            time.sleep(4 * (k + 1))


def fetch(url, name):
    f = os.path.join(WORK, name)
    if not os.path.exists(f):
        t0 = time.time(); b = get(url); open(f, 'wb').write(b); print('  fetched %s: %.1f MB in %.0f s' % (name, len(b) / 1e6, time.time() - t0), flush=True)
    return f


def links(url):
    try: html = get(url, timeout=60, tries=2).decode('utf-8', 'replace')
    except Exception as e: return None, str(e)[:80]
    return sorted(set(re.findall(r'href="([^"?#]+)"', html))), len(html)


if 'urls' in what:
    print('== the sources ==')
    for name, url in [(('bmng%s %02d' % (k, m)), bmng(m, k)) for k in IDS for m in (1, 2, 7, 8, 12)] + [
        ('bmng 500 m tile (aug, A1)', bmng(8, '', '3x21600x21600', 'png', 'A1')), ('bmng 500 m tile (feb, D2)', bmng(2, '', '3x21600x21600', 'png', 'D2')),
        ('bmng 2 km png (aug)', bmng(8, '', '3x21600x10800', 'png')), ('bmng 2 km jpg (aug)', bmng(8, '', '3x21600x10800', 'jpg')),
        ('clouds 8192', EO + '57000/57747/cloud_combined_8192.tif'),
        ('clouds 2048', EO + '57000/57747/cloud_combined_2048.jpg'),
        ('clouds east 21600', EO + '57000/57747/cloud.E.2001210.21600x21600.png'),
        ('clouds west 21600', EO + '57000/57747/cloud.W.2001210.21600x21600.png'),
        ('stars 4k exr', SVS + 'a004800/a004851/starmap_2020_4k.exr'),
        ('stars 8k exr', SVS + 'a004800/a004851/starmap_2020_8k.exr'),
        ('milky way 4k exr', SVS + 'a004800/a004851/milkyway_2020_4k.exr'),
        ('stars 4k print jpg', SVS + 'a004800/a004851/starmap_2020_4k_print.jpg'),
        ('milky way 4k print jpg', SVS + 'a004800/a004851/milkyway_2020_4k_print.jpg'),
        ('constellation figures 4k', SVS + 'a004800/a004851/constellation_figures_4k.tif'),
        ('moon colour 4k', SVS + 'a004700/a004720/lroc_color_poles_4k.tif'),
        ('moon colour 2k', SVS + 'a004700/a004720/lroc_color_poles_2k.tif'),
        ('moon heights 16 ppd', SVS + 'a004700/a004720/ldem_16_uint.tif'),
        ('bright stars (harvard)', 'http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz'),
        ('bright stars (cds)', 'https://cdsarc.cds.unistra.fr/ftp/cats/V/50/catalog.gz'),
        ('gebco 2023 page', 'https://www.gebco.net/data_and_products/gridded_bathymetry_data/'),
    ]:
        st, h = ask(url)
        if st in (403, 405) or isinstance(st, str): st, h = ask(url, 'GET', 'bytes=0-15')
        print('%-28s %-5s %12s  %-24s %s' % (name, st, h.get('Content-Length') or h.get('Content-Range', ''), (h.get('Content-Type') or '')[:24], url), flush=True)
    for name, url in [('eo bmng', 'https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/'), ('eo bmng base', 'https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/'),
                      ('visible earth aug', 'https://visibleearth.nasa.gov/images/74418/'), ('eo clouds', 'https://visibleearth.nasa.gov/images/57747/blue-marble-clouds'), ('svs stars', 'https://svs.gsfc.nasa.gov/4851/'), ('svs moon', 'https://svs.gsfc.nasa.gov/4720/')]:
        ls, n = links(url)
        if ls is None: print('-- %s: %s' % (name, n)); continue
        keep = [l for l in ls if re.search(r'\.(png|jpg|tif|exr|gz|txt)$', l) or re.search(r'blue-marble|imagerecords|images/7[34]\d\d\d', l)]
        print('-- %s (%d bytes of page, %d links): %s' % (name, n, len(ls), ' '.join(keep)[:3000]), flush=True)


def game_picture(size):
    """the game's own picture of the Earth (data/i, its finest level), as (H, W, 4)"""
    I = os.path.join(ROOT, 'data', 'i'); ix = json.load(open(os.path.join(ROOT, 'data', 'index.json')))['img']; L, per = ix['maxLevel'], ix['packTiles']
    nx, ny = (2 << L) // per, (1 << L) // per; rows = []
    for py in range(ny): rows.append(np.concatenate([np.array(Image.open(os.path.join(I, '%d_%d_%d.webp' % (L, px, py))).convert('RGBA')) for px in range(nx)], 1))
    mos = np.concatenate(rows, 0)
    return np.array(Image.fromarray(mos).resize(size, Image.BOX))


months = {}
if 'months' in what or 'sheet' in what:
    os.makedirs(WORK, exist_ok=True)
    for m in range(1, 13):
        try: months[m] = np.array(Image.open(fetch(bmng(m), 'world.2004%02d.jpg' % m)).convert('RGB'))
        except Exception as e: print('  month %d: %s' % (m, str(e)[:80]))
    print('months in hand:', sorted(months))

if 'months' in what and months:
    print('== which month is the game\'s picture? ==')
    W, H = 2700, 1350
    g = game_picture((W, H)).astype(np.float32); land = g[..., 3] > 254; gl = g[..., :3]
    lat = (90 - (np.arange(H) + 0.5) / H * 180)[:, None] * np.ones((1, W)); north, south = land & (lat > 15), land & (lat < -15); trop = land & (np.abs(lat) <= 15)
    print('land texels: %d (north of 15N %d, tropics %d, south of 15S %d); the game\'s mean colour on land %s' % (land.sum(), north.sum(), trop.sum(), south.sum(), gl[land].mean(0).round(1)))
    print('month   r(all)  r(north) r(tropics) r(south)   mean abs diff (all, north, south)   mean colour')
    for m in sorted(months):
        b = np.array(Image.fromarray(months[m]).resize((W, H), Image.BOX)).astype(np.float32)
        def r(mask): x, y = gl[mask].ravel(), b[mask].ravel(); return float(np.corrcoef(x, y)[0, 1])
        def d(mask): return float(np.abs(gl[mask] - b[mask]).mean())
        print('  %02d   %.4f   %.4f    %.4f    %.4f      %5.1f %5.1f %5.1f      %s' % (m, r(land), r(north), r(trop), r(south), d(land), d(north), d(south), b[land].mean(0).round(1)), flush=True)

if 'sheet' in what and months:
    # the game's picture and four months of the Blue Marble, region by region, at the 8 km pictures' own size (x3)
    W, H = 5400, 2700; g = game_picture((W, H)); gr = (g[..., :3].astype(np.float32) * (g[..., 3:4] / 255.0) + np.array([10, 20, 45], np.float32) * (1 - g[..., 3:4] / 255.0)).astype(np.uint8)
    cols = [('game', gr)] + [('bmng %02d' % m, months[m]) for m in (8, 7, 2, 1) if m in months]
    regions = [('Alps', 4, 49, 20, 40), ('Andes', -78, -8, -62, -24), ('Southern Africa', 12, -14, 36, -30), ('Australia SE', 135, -28, 154, -40), ('Sahel', -10, 20, 14, 6), ('Patagonia', -76, -40, -64, -54)]
    tiles = []
    for name, lon0, lat0, lon1, lat1 in regions:
        x0, x1, y0, y1 = int((lon0 + 180) / 360 * W), int((lon1 + 180) / 360 * W), int((90 - lat0) / 180 * H), int((90 - lat1) / 180 * H)
        row = [Image.fromarray(a[y0:y1, x0:x1]).resize(((x1 - x0) * 2, (y1 - y0) * 2), Image.LANCZOS) for _, a in cols]; tiles.append((name, row))
    wmax = max(sum(t.size[0] + 4 for t in row) for _, row in tiles); hsum = sum(row[0].size[1] + 4 for _, row in tiles)
    sheet = Image.new('RGB', (wmax, hsum), (12, 16, 26)); y = 0
    for name, row in tiles:
        x = 0
        for t in row: sheet.paste(t, (x, y)); x += t.size[0] + 4
        y += row[0].size[1] + 4
    sheet.save(os.path.join(OUT, 'planet_probe.jpg'), quality=88); print('planet_probe.jpg', sheet.size, 'columns:', ', '.join(n for n, _ in cols), '; rows:', ', '.join(n for n, _ in tiles))
print('done')
