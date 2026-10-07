#!/usr/bin/env python3
"""Looks at where the planet's pictures come from, and says what is there (the Planet workflow, mode "probe").

    python3 tools/planet/probe.py --out out --work work [urls] [months] [sheet]

  urls    asks every source for its head (is it there, how large) and lists the folders
  months  holds the game's picture of the Earth (data/i) against every month of NASA's Blue Marble Next Generation, to
          find which it was made from (the picture's origin was never written down)
  sheet   a sheet of pictures to look at: the game's picture beside the months that might take its place
  tiff    one piece of the Blue Marble at its finest (500 m): how the file is laid out, how long it takes to fetch and to read,
          what colour its sea is, how far its JPEG is from it, and how many bytes a pack of it takes squeezed this way and that
  ice     where the sea's ice is to be had month by month (the Sea Ice Index of the US National Snow and Ice Data Center):
          what lies in its folders, and what one month's file is
Nothing told: urls. (months and sheet were asked of the picture the game had until 0.21, which the repository no longer holds:
it was the Blue Marble Next Generation's July.)
"""
import os, sys, re, io, json, time, urllib.request, urllib.error
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
arg = lambda n, d=None: sys.argv[sys.argv.index('--' + n) + 1] if '--' + n in sys.argv else d
OUT, WORK = arg('out', 'out'), arg('work', 'work')
what = [a for a in sys.argv[1:] if a in ('urls', 'months', 'sheet', 'tiff', 'ice')] or ['urls']
if not os.path.exists(os.path.join(ROOT, 'data', 'i', '3_0_0.webp')) and ('months' in what or 'sheet' in what):
    print('months, sheet: the picture they were asked about (the one the game had until 0.21) is no longer in the repository'); what = [a for a in what if a not in ('months', 'sheet')]
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) holocene-planet-probe'}
EO = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/'
# Blue Marble Next Generation (NASA Earth Observatory; R. Stockli): the land's surface month by month through 2004, 500 m to a
# pixel, in eight pieces of 21600 pixels a side (A1 .. D2: A-D from the west, 1 north, 2 south), and whole at 2 km and 8 km.
BMNG = 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/'
MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
def bmng(m, size='3x5400x2700', ext='jpg', tile=''):
    return '%s%s/world.2004%02d.%s%s%s' % (BMNG, MONTHS[m - 1], m, size, tile and '.' + tile, ext if ext.startswith('_') else '.' + ext)
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
    for name, url in [('bmng 8 km %02d' % m, bmng(m)) for m in (1, 2, 7, 8)] + [
        ('bmng 500 m A1 jpg (aug)', bmng(8, '3x21600x21600', 'jpg', 'A1')), ('bmng 500 m A1 tif (aug)', bmng(8, '3x21600x21600', '_geo.tif', 'A1')),
        ('bmng 500 m C1 jpg (aug)', bmng(8, '3x21600x21600', 'jpg', 'C1')), ('bmng 500 m D2 jpg (feb)', bmng(2, '3x21600x21600', 'jpg', 'D2')), ('bmng 500 m D2 tif (feb)', bmng(2, '3x21600x21600', '_geo.tif', 'D2')),
        ('bmng 2 km jpg (aug)', bmng(8, '3x21600x10800', 'jpg')), ('bmng 2 km tif (aug)', bmng(8, '3x21600x10800', '_geo.tif')),
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

if 'tiff' in what:
    import shutil
    print('== the machine ==')
    print('cores', os.cpu_count(), '; memory', [l.strip() for l in open('/proc/meminfo') if l.startswith(('MemTotal', 'MemAvailable'))])
    for d in ('.', WORK, '/mnt', '/tmp'):
        try: u = shutil.disk_usage(d); print('disk %-6s free %.1f GB of %.1f' % (d, u.free / 1e9, u.total / 1e9), '(writable)' if os.access(d, os.W_OK) else '(not writable)')
        except Exception as e: print('disk', d, e)
    import PIL; from PIL import features
    try: avif = features.check('avif')
    except Exception as e: avif = 'unknown to this pillow'
    print('pillow', PIL.__version__, 'webp', features.check('webp'), 'avif', avif)
    os.makedirs(WORK, exist_ok=True)
    print('== a piece of the Blue Marble at 500 m: C1 (0-90 E, 0-90 N) ==')
    t0 = time.time(); ftif = fetch(bmng(7, '3x21600x21600', '_geo.tif', 'C1'), 'jul.C1.tif'); print('  the GeoTIFF: %.0f s to fetch' % (time.time() - t0))
    t0 = time.time(); fjpg = fetch(bmng(7, '3x21600x21600', 'jpg', 'C1'), 'jul.C1.jpg'); print('  the JPEG: %.0f s to fetch' % (time.time() - t0))
    try:
        import rasterio
        with rasterio.open(ftif) as src:
            print('rasterio', rasterio.__version__, {k: str(v) for k, v in src.profile.items()}, 'blocks', src.block_shapes[:1], 'bounds', tuple(src.bounds), 'overviews', src.overviews(1))
            for name, win in (('200 rows across', ((9000, 9200), (0, 21600))), ('a column 200 wide', ((0, 21600), (21400, 21600))), ('a block 10992 a side', ((0, 10992), (0, 10992)))):
                t0 = time.time(); a = src.read(window=win); print('  read %-22s %s in %.1f s' % (name, a.shape, time.time() - t0), flush=True)
            del a
    except Exception as e: print('rasterio:', repr(e)[:300])
    t0 = time.time(); T = np.array(Image.open(ftif).convert('RGB')); print('pillow reads the GeoTIFF whole in %.1f s: %s' % (time.time() - t0, T.shape), flush=True)
    t0 = time.time(); J = np.array(Image.open(fjpg).convert('RGB')); print('pillow reads the JPEG whole in %.1f s: %s' % (time.time() - t0, J.shape), flush=True)
    def psnr(a, b): d = a.astype(np.float32) - b.astype(np.float32); return 10 * np.log10(255.0 ** 2 / max(float((d * d).mean()), 1e-9))
    px = lambda lon, lat: (int(lon * 240), int((90 - lat) * 240))      # (C1: its left edge is the meridian of Greenwich, its top the pole)
    def crop(A, lon, lat, n=1028): x, y = px(lon, lat); return A[y:y + n, x:x + n]
    print('the JPEG against the GeoTIFF: %.1f dB over the Alps, %.1f dB over the Sahara, %.1f dB over India' % (psnr(crop(T, 6, 49), crop(J, 6, 49)), psnr(crop(T, 10, 28), crop(J, 10, 28)), psnr(crop(T, 76, 26), crop(J, 76, 26))))
    del J
    print('-- the colour of the sea --')
    for name, lon, lat in (('Arabian Sea', 62, 14), ('Bay of Bengal', 88, 14), ('Mediterranean', 18.5, 35), ('Black Sea', 34, 44), ('Caspian', 51, 41), ('Barents Sea', 40, 75), ('the pole', 45, 89.9), ('Kara Sea', 75, 78), ('Lake Victoria (its north)', 32.6, 0.9), ('Lake Balkhash', 75, 46.8)):
        c = crop(T, lon, lat, 240).reshape(-1, 3); u, n = np.unique(c, axis=0, return_counts=True); o = np.argsort(-n)[:4]
        print('  %-30s mean %s  std %s  most often: %s' % (name, c.mean(0).round(1), c.std(0).round(1), '  '.join('%s x%d' % (tuple(int(v) for v in u[i]), n[i]) for i in o)))
    print('-- across a coast (the Nile\'s delta at 31 E, from 32.0 N to 31.2 N, every 2nd pixel: r g b) --')
    x, y = px(31, 32.0); print('  ' + ' '.join('%d,%d,%d' % tuple(T[y + k, x]) for k in range(0, 192, 4)))
    print('-- across a coast (Liguria at 9 E, from 43.9 N to 44.5 N going north) --')
    x, y = px(9, 44.5); print('  ' + ' '.join('%d,%d,%d' % tuple(T[y + k, x]) for k in range(143, -1, -3)))
    print('-- a pack squeezed (1028 x 1028 at the source\'s own fineness): bytes, dB against the source, seconds --')
    for name, lon, lat in (('Alps', 6, 49), ('Sahara', 10, 28), ('India', 76, 26), ('Siberia', 60, 62), ('Nile delta coast', 29.5, 32.5)):
        a = crop(T, lon, lat); im = Image.fromarray(a); row = []
        def one(label, **kw):
            b = io.BytesIO(); t0 = time.time()
            try: im.save(b, **kw)
            except Exception as e: row.append('%s: %s' % (label, str(e)[:40])); return
            dt = time.time() - t0; back = np.array(Image.open(io.BytesIO(b.getvalue())).convert('RGB')); row.append('%s %d KB %.1f dB %.1fs' % (label, len(b.getvalue()) // 1000, psnr(a, back), dt))
        for q in (80, 85, 90, 95): one('webp%d' % q, format='WEBP', quality=q, method=4)
        one('webp90m6', format='WEBP', quality=90, method=6); one('webp-lossless', format='WEBP', lossless=True, quality=60, method=4)
        for q in (60, 70, 80): one('avif%d' % q, format='AVIF', quality=q, speed=6)
        one('avif80-444', format='AVIF', quality=80, speed=6, subsampling='4:4:4'); one('jpeg92-444', format='JPEG', quality=92, subsampling=0)
        print('  %-18s %s' % (name, ' | '.join(row)), flush=True)
    # what it looks like: a few places at the source's own fineness
    tiles = [Image.fromarray(crop(T, lon, lat, 700)) for lon, lat in ((6.5, 46.6), (2.0, 49.2), (30.2, 31.6), (8.2, 45.2), (76.5, 29.0), (36.0, 56.2))]
    sh = Image.new('RGB', (700 * 3 + 8, 700 * 2 + 4), (12, 16, 26))
    for k, t in enumerate(tiles): sh.paste(t, ((k % 3) * 704, (k // 3) * 704))
    sh.save(os.path.join(OUT, 'planet_tiff.jpg'), quality=90); print('planet_tiff.jpg: the Alps, Paris, the Nile\'s delta / the Po, Delhi, Moscow at 500 m')
print('done')


if 'ice' in what:
    print('== ice on the sea: the Sea Ice Index (NSIDC G02135) ==')
    hosts = ['https://noaadata.apps.nsidc.org/NOAA/G02135/', 'https://masie_web.apps.nsidc.org/pub/DATASETS/NOAA/G02135/']
    import subprocess
    for h in ('noaadata.apps.nsidc.org', 'masie_web.apps.nsidc.org', 'nsidc.org', 'n5eil01u.ecs.nsidc.org'):
        r = subprocess.run(['curl', '-sS', '-o', '/dev/null', '-m', '20', '-w', '%{http_code} %{remote_ip}', 'https://%s/' % h], capture_output=True, text=True); print('  curl %s: %s %s' % (h, r.stdout.strip(), r.stderr.strip()[:90]))
    got = None
    for base in hosts:
        for sub in ['', 'north/', 'north/monthly/', 'north/monthly/geotiff/', 'north/monthly/geotiff/03_Mar/', 'south/monthly/geotiff/09_Sep/', 'north/monthly/shapefiles/', 'north/monthly/shapefiles/shp_median/']:
            l, n = links(base + sub)
            if l is None: print('  %s%s: %s' % (base, sub, n)); continue
            l = [x for x in l if not x.startswith(('/', 'http', '..'))]
            print('  %s%s: %d entries: %s%s' % (base, sub, len(l), ' '.join(l[:10]), (' ... ' + ' '.join(l[-6:])) if len(l) > 16 else ''), flush=True)
            if sub.endswith('03_Mar/') and l and not got: got = (base + sub, [x for x in l if x.endswith('.tif')])
    if got:
        folder, tifs = got; conc = [x for x in tifs if 'concentration' in x]; print('  concentration files in March: %d, first %s, last %s' % (len(conc), conc[:2], conc[-2:]))
        if conc:
            import rasterio
            f = fetch(folder + conc[0], conc[0])
            with rasterio.open(f) as r:
                a = r.read(1); v, c = np.unique(a, return_counts=True)
                print('  %s: %s, %s, crs %s, transform %s, nodata %s' % (conc[0], a.shape, a.dtype, r.crs, tuple(round(x, 1) for x in r.transform)[:6], r.nodata))
                print('  values: %s' % ', '.join('%d x%d' % (int(x), int(n)) for x, n in list(zip(v, c))[:8]), '...', ', '.join('%d x%d' % (int(x), int(n)) for x, n in list(zip(v, c))[-8:]))

