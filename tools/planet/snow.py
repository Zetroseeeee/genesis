#!/usr/bin/env python3
"""How long snow lies in winter, and ice on the sea, as the Earth has it (data/snow.png).

The game laid its winter snow by the climate's class: "a cold desert" lay white from the Tarim to the Namib, "a tundra"
from Siberia to the Puna of the Andes, and Tibet, which is dry and all but bare in January, was an ice cap. And its sea
froze by the latitude: in winter there was ice off Scotland, where the sea never freezes, as in Hudson Bay, where it
does for seven months. The Blue Marble Next Generation (NASA Earth Observatory, 2004; public domain) has every month of
the year.

Snow (red): each of the seven months of a hemisphere's cold season (October to April north of the equator, April to
October south of it) is held against its midsummer, and what is white or grey in that month and was not in summer is
snow - on open ground, and through the trees of a taiga. What is kept is the share of the seven months in which a place
had it: all of them in Siberia, five at Moscow, four at Winnipeg, one in the Ukraine, none at Berlin or in Tibet. (One
month alone says yes or no: by January's the snow of Europe was a white sheet with a ruled edge through Poland.) What
is white the year round (ice, salt, bright sand) is no winter's snow and is left out: the game has its own rule for
ice. Water takes the snow of the land nearest to it: a lake freezes with its shores.

Ice on the sea (green): the share of the year's twelve months in which the sea there is ice - all of them in the
Arctic Ocean, eight in Hudson Bay, five in the Gulf of Bothnia, four in the Sea of Okhotsk, none off Norway. From the
Sea Ice Index of the US National Snow and Ice Data Center (the mean of its first ten years, 1979 to 1988): the Blue
Marble's own sea is one dark blue the year round.

    python3 tools/planet/snow.py --out out --work work      (the Planet workflow: mode "snow")
        out/snow.png           2048 x 1024; red: for how much of its cold season snow would lie there at the level of the
                               sea, (share + 3) / 4 - the share less half of it for every thousand metres the country
                               lies high (see "how high the country lies"); the game adds each place's own height back;
                               green: 0 the sea never freezes ... 255 it is ice all the year;
                               blue: the share itself, as it was read (nothing in the game reads it: to look at)
        out/planet_snow.jpg    the same over the summer's picture, to look at, and midwinter as the Blue Marble has it
The game reads it into the second layer of its planet's maps (planetMaps in src/main.js: the snow into its alpha, the
ice into its green); the ground's shader lets snow lie and the sea freeze only where the map has some, and for as much
of the year as it says (terrain.js, at "winter where winters are white" and "ice on the sea"; Trees.lyingAt is the
snow's twin for boughs and roofs).
"""
import os, sys, time, urllib.request, urllib.error
import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import gaussian_filter, distance_transform_edt, binary_erosion, maximum_filter

Image.MAX_IMAGE_PIXELS = None
arg = lambda n, d=None: sys.argv[sys.argv.index('--' + n) + 1] if '--' + n in sys.argv else d
OUT, WORK = arg('out', 'out'), arg('work', 'work')
BMNG = 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/'
MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) holocene-planet'}
W, H = 2048, 1024


def month(m):
    f = os.path.join(WORK, 'world.2004%02d.8km.jpg' % m)
    if not os.path.exists(f):
        os.makedirs(WORK, exist_ok=True)
        with urllib.request.urlopen(urllib.request.Request('%s%s/world.2004%02d.3x5400x2700.jpg' % (BMNG, MONTHS[m - 1], m), headers=UA), timeout=300) as r: open(f, 'wb').write(r.read())
    return np.array(Image.open(f).convert('RGB').resize((W * 2, H * 2), Image.BOX))


def ss(a, b, x): t = np.clip((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t)


def lum(a): return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114
def grey(a): mx, mn = a.max(-1), a.min(-1); return 1.0 - ss(0.10, 0.28, (mx - mn) / np.maximum(mx, 0.04))


M = {m: month(m) for m in range(1, 13)}
north = (np.arange(H * 2) < H)[:, None]
def half(mn, ms): return np.where(north[..., None], M[mn], M[ms]).astype(np.float32) / 255.0      # a month for each hemisphere
summer, winter = half(7, 1), half(1, 7); ls = lum(summer)
sea = (summer[..., 2] > summer[..., 0] + 0.03) & (ls < 0.2)          # (the Blue Marble's own sea: dark and blue)
COLD = {True: (10, 11, 12, 1, 2, 3, 4), False: (4, 5, 6, 7, 8, 9, 10)}      # the cold season's months, north and south
snow = np.zeros((H * 2, W * 2), np.float32)
for k in range(7):
    a = half(COLD[True][k], COLD[False][k]); lw = lum(a)
    # snow: lighter than the summer by a good deal, and without colour. By how much is a matter of what stood there in summer:
    # a wood under snow is grey, not white, and far darker than a field (asked to lighten as a field does, the woods of
    # Minnesota had no winter), and bright dry ground must lighten a good deal more than a wood to count. Bare boughs without
    # snow are lighter than the summer's leaves too, but brown.
    need = 0.03 + 0.25 * ls
    snow += ss(need, need + 0.11, lw - ls) * grey(a) * ss(0.16, 0.30, lw) * (1.0 - sea) / 7.0
    del a, lw
# A wood keeps its own counsel: the larch of Yakutia under a low sun is as dark in January as in July, and the woods of
# Minnesota little lighter - by their own look they had no winter, and lay as dark holes in the snow of a continent. Snow
# lies in a wood when it lies on the open ground about it: a wood (dark and green in summer) takes what the open ground
# within some eighty kilometres has, or within three hundred where there is none so near.
wood = ss(0.24, 0.14, ls) * ss(0.0, 0.03, summer[..., 1] - np.maximum(summer[..., 0], summer[..., 2]) * 0.92) * (1.0 - sea)
w0 = (1.0 - sea) * (1.0 - wood)
def about(sig): b = gaussian_filter(w0, sig, mode=('nearest', 'wrap')); return gaussian_filter(snow * w0, sig, mode=('nearest', 'wrap')) / np.maximum(b, 1e-4), b
(m1, b1), (m2, b2) = about(8.0), about(30.0)
filled = np.maximum(snow, np.where(b1 > 0.08, m1, m2) * wood * 0.95)
print('woods given the snow of the open ground about them: %.1f%% of the land, its mean share of the season %.2f -> %.2f' % (100.0 * (wood > 0.5).sum() / max(1, (sea < 0.5).sum()), snow[wood > 0.5].mean(), filled[wood > 0.5].mean()))
snow = filled; del m1, m2, b1, b2, w0, filled
# (Water takes the snow of the land nearest to it: a card weighs between a shore's texels, and a lake freezes with its shores.
#  Water is the game's own, tools/planet/mask.png, and the Blue Marble's with it: Great Bear Lake in July is half ice and
#  no dark blue sea, and as "land that is white in summer too" it had no winter - the lakes of the north lay open in January.)
mask = np.array(Image.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mask.png')).resize((W * 2, H * 2), Image.BOX))
wet = mask < 160                                      # the game's water: the sea (0), a lake (128) and what a shore mixes of them
ix = distance_transform_edt(sea | wet, return_distances=False, return_indices=True); snow = snow[ix[0], ix[1]]

# ---------- how high the country lies ----------
# The map is of cells twenty kilometres across, and what it has for the Alps is the Alps on the whole: the valleys with the
# peaks. Snow lies the longer the higher the ground - half the cold season more for every thousand metres, by the Alps, the
# Rockies and Scandinavia alike - so what is kept is how long it would lie at the level of the sea (the cell's share less what
# the cell's own height on the whole accounts for: below nought wherever the high ground alone has snow, as in Tibet), and
# the game adds each place's own height back: a valley of the Alps is green for most of its winter under white mountains,
# and the high ranges of a dry plateau have their winter snow while the plateau has none.
import json
PER_KM = 0.5
REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
E = json.load(open(os.path.join(REPO, 'data', 'index.json')))['elev']
def heights():
    rows = []
    for py in range(2):
        row = []
        for px in range(4):
            im = Image.open(os.path.join(REPO, 'data', 'e', '3_%d_%d.png' % (px, py))); mn, sc = E['packs']['3/%d/%d' % (px, py)]
            a = np.array(im.getpalette(), np.float32).reshape(-1, 3)[:, 0][np.asarray(im)] if im.mode == 'P' else np.asarray(im.convert('L'), np.float32)      # (a paletted pack is read as its greys, not as the palette's numbers)
            row.append(np.maximum(mn + a * sc, 0.0))
        rows.append(np.concatenate(row, 1))
    h = np.concatenate(rows, 0); k = h.shape[1] // (W * 2)
    return h.reshape(H * 2, k, W * 2, k).mean((1, 3))
high = heights()[ix[0], ix[1]]; del ix      # (and water takes the height of the land nearest to it, as it takes its snow)
print('the game\'s own heights: %s, to %.0f m; land on the whole %.0f m' % ('x'.join(map(str, high.shape)), high.max(), high[~(sea | wet)].mean()))

# ---------- ice on the sea ----------
# The Blue Marble has no ice on its sea (its ocean is one dark blue the year round). The Sea Ice Index of the US National Snow
# and Ice Data Center has: how much of the sea is ice, month by month since 1979, from microwave radiometers that see by
# night and through cloud, on a grid of 25 km about each pole (Fetterer, Knowles, Meier, Savoie and Windnagel: Sea Ice Index,
# Version 4, NSIDC, doi:10.7265/a98x-0f50). Its first ten years are taken, which are the nearest it has to a sea nobody had
# warmed: for each month the mean of them, and a month has ice where four tenths of the sea and more is ice.
import rasterio
from rasterio.warp import transform as reproject
from concurrent.futures import ThreadPoolExecutor
SII, MON, YEARS = 'https://noaadata.apps.nsidc.org/NOAA/G02135/', ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], range(1979, 1989)
def sii(job):
    hemi, y, m = job; name = '%s_%d%02d_concentration_v4.0.tif' % (hemi, y, m); f = os.path.join(WORK, name)
    if not os.path.exists(f):
        try:
            with urllib.request.urlopen(urllib.request.Request('%s%s/monthly/geotiff/%02d_%s/%s' % (SII, 'north' if hemi == 'N' else 'south', m, MON[m - 1], name), headers=UA), timeout=120) as r: open(f, 'wb').write(r.read())
        except Exception as e: return job, None      # (some months of 1987 and 1988 were never measured)
    return job, f
os.makedirs(WORK, exist_ok=True)
with ThreadPoolExecutor(8) as ex: got = dict(ex.map(sii, [(h, y, m) for h in 'NS' for y in YEARS for m in range(1, 13)]))
print('the Sea Ice Index, %d to %d: %d months in hand of %d' % (YEARS[0], YEARS[-1], sum(1 for f in got.values() if f), len(got)))
lat2 = 90.0 - (np.arange(H * 2) + 0.5) * 90.0 / H; lon2 = -180.0 + (np.arange(W * 2) + 0.5) * 180.0 / W
ice = np.zeros((H * 2, W * 2), np.float32)
for hemi in 'NS':
    share, tf, crs = None, None, None
    for m in range(1, 13):
        acc, n = None, None
        for y in YEARS:
            f = got[(hemi, y, m)]
            if not f: continue
            with rasterio.open(f) as r: a = r.read(1).astype(np.float32); tf, crs = r.transform, r.crs
            a = np.where(a == 2510, 1000.0, a)                       # (the hole at the pole no satellite sees is ice)
            ok = a <= 1000; acc = np.where(ok, a, 0.0) if acc is None else acc + np.where(ok, a, 0.0); n = ok.astype(np.float32) if n is None else n + ok
        if acc is None: continue
        conc = np.where(n > 0, acc / np.maximum(n, 1.0) / 1000.0, np.nan)      # the mean of the years; nan: land
        has = ss(0.25, 0.55, conc); share = has if share is None else share + has      # (not less: a radiometer's cell of 25 km on a shore sees the land with the sea, and takes it for a little ice - the Danish straits froze every March)
    share = share / 12.0; sea_ = ~np.isnan(share)
    ix, dist = distance_transform_edt(~sea_, return_distances=True, return_indices=True)[::-1]      # (land takes the nearest sea's, within some four hundred kilometres)
    share = np.where(sea_, share, np.where(dist < 16, share[ix[0], ix[1]], 0.0)); share = np.nan_to_num(share)
    rows = np.where(lat2 > 30)[0] if hemi == 'N' else np.where(lat2 < -40)[0]
    LO, LA = np.meshgrid(lon2, lat2[rows]); xs, ys = reproject('EPSG:4326', crs, LO.ravel().tolist(), LA.ravel().tolist())
    c = (np.array(xs) - tf.c) / tf.a - 0.5; r_ = (np.array(ys) - tf.f) / tf.e - 0.5
    c0, r0 = np.floor(c).astype(int), np.floor(r_).astype(int); fc, fr = c - c0, r_ - r0; hh, ww = share.shape
    def at(rr, cc): inb = (rr >= 0) & (rr < hh) & (cc >= 0) & (cc < ww); return np.where(inb, share[np.clip(rr, 0, hh - 1), np.clip(cc, 0, ww - 1)], 0.0)
    v = (at(r0, c0) * (1 - fc) + at(r0, c0 + 1) * fc) * (1 - fr) + (at(r0 + 1, c0) * (1 - fc) + at(r0 + 1, c0 + 1) * fc) * fr
    ice[rows] = v.reshape(len(rows), W * 2).astype(np.float32)
    print('  %s: %s cells of 25 km, %s; ice all the year on %.1f million km2, in some month on %.1f' % (hemi, 'x'.join(map(str, share.shape)), crs, (share[sea_] > 0.96).sum() * 625e-6, (share[sea_] > 0.04).sum() * 625e-6))
# only the game's own water speaks, a texel clear of any shore; the land takes its nearest water's (a card weighs between a
# shore's texels: it must find the sea's ice there, not nothing)
open_water = binary_erosion(wet, iterations=1, border_value=1)
ix = distance_transform_edt(~open_water, return_distances=False, return_indices=True); ice = np.where(open_water, ice, ice[ix[0], ix[1]]); del ix
ice = np.array(Image.fromarray(np.rint(ice * 255).astype(np.uint8)).resize((W, H), Image.BOX).filter(ImageFilter.GaussianBlur(1.0))).astype(np.float32) / 255.0
# (to the map's own cells, then smoothed over some sixty kilometres: what is left of a month's yes or no is how likely it is)
snow = np.array(Image.fromarray(np.rint(snow * 255).astype(np.uint8)).resize((W, H), Image.BOX).filter(ImageFilter.GaussianBlur(1.6))).astype(np.float32) / 255.0
snow = np.clip((snow - 0.03) / 0.94, 0.0, 1.0)
high = gaussian_filter(high.reshape(H, 2, W, 2).mean((1, 3)), 1.6, mode=('nearest', 'wrap'))      # (the heights as the snow is: to the map's cells, and as smooth)
# (Where a cell has no snow at all, all that is known is that its own height on the whole is too low for any: ground a good
#  deal higher may have none either. So a cell without snow is counted as if it began six hundred metres above itself - and
#  two thousand where there is none for a hundred kilometres round: the Hoggar stands 1,700 m above the Sahara about it
#  and has no winter, nor have the ridges of the Puna.)
near = maximum_filter(snow, size=11, mode=('nearest', 'wrap'))
margin = (0.3 + 0.7 * (1.0 - ss(0.0, 0.08, near))) * (1.0 - ss(0.0, 0.1, snow))
sealevel = snow - PER_KM * high / 1000.0 - margin      # how long it would lie at the level of the sea: 1 all the cold season, below nought never there
lat = 90.0 - (np.arange(H) + 0.5) * 180.0 / H
print('snow in winter by latitude (the share of the land that has it; 10 degrees at a time, from the north):')
landm = ~np.array(Image.fromarray(sea).resize((W, H), Image.NEAREST))
for a in range(90, -90, -10):
    m = (lat <= a) & (lat > a - 10); l = landm[m]; print('  %4d..%4d: %5.1f%%' % (a, a - 10, 100.0 * snow[m][l].mean() if l.any() else 0.0))
for name, lon, la in [('Tibet', 88, 33), ('Tarim', 83, 39), ('Mongolia', 104, 47), ('Kazakh steppe', 68, 49), ('Moscow', 37, 56), ('St Petersburg', 30.3, 59.9), ('Karelia', 33, 63), ('Helsinki', 25, 60.3), ('Stockholm', 18, 59.4), ('Oslo', 10.8, 60), ('Warsaw', 21, 52.2), ('Paris', 2.3, 48.8), ('Berlin', 13.4, 52.5), ('Kyiv', 30.5, 50.4), ('Novosibirsk', 83, 55), ('Irkutsk', 104.3, 52.3), ('Yakutsk', 129.7, 62), ('Sapporo', 141.4, 43.1), ('Ottawa', -75.7, 45.4), ('Quebec', -71.2, 46.9), ('Duluth', -92.1, 46.8), ('Edmonton', -113.5, 53.5), ('Anchorage', -150, 61.2), ('Beijing', 116.4, 39.9), ('Harbin', 126.6, 45.8), ('Chicago', -87.6, 41.9), ('Denver', -105, 39.7), ('Winnipeg', -97, 50), ('Great Basin', -116, 40), ('Anatolia', 33, 39), ('Iran plateau', 54, 33), ('Namib', 15, -23), ('Karoo', 24, -32), ('Patagonia 45S', -69, -45), ('Patagonia 50S', -70, -50), ('Puna', -67, -22), ('Santiago Andes', -70.1, -33.5), ('NZ Alps', 170, -43.8), ('Alps', 9.5, 46.6), ('Sahara Hoggar', 5.5, 23.3), ('Hokkaido', 143, 43.5), ('Hoggar peaks', 5.6, 23.3), ('Altiplano', -68, -19), ('Rhone valley', 7.6, 46.3), ('Engadin', 9.9, 46.5), ('Po plain', 10, 45.2), ('Norway fjell', 8, 61), ('Norway coast', 5.3, 60.4), ('Kilimanjaro', 37.35, -3.07), ('Atlas', -7.9, 31.1), ('Zagros', 50, 32.5), ('Kunlun', 85, 36), ('Karakoram', 76.5, 35.9)]:
    x, y = int((lon + 180) / 360 * W), int((90 - la) / 180 * H); print('  %-16s %.2f   at %4.0f m; at the sea %5.2f   (winter %s, summer %s)' % (name, snow[y, x], high[y, x], sealevel[y, x], np.rint(winter[y * 2, x * 2] * 255).astype(int), np.rint(summer[y * 2, x * 2] * 255).astype(int)))
print('ice on the sea (months of the year):')
for name, lon, la in [('North Pole', 0, 88), ('Baffin Bay', -65, 73), ('Hudson Bay', -85, 60), ('Labrador coast', -57, 56), ('Gulf of St Lawrence', -62, 48), ('Lake Superior', -87.5, 47.7), ('Greenland Sea', -5, 76), ('Norwegian Sea', 5, 68), ('North Sea', 3, 56), ('Barents Sea', 35, 73), ('White Sea', 38, 65.5), ('Gulf of Bothnia', 21, 64), ('Gulf of Finland', 26, 59.9), ('Baltic proper', 19, 56), ('Kara Sea', 70, 75), ('Laptev Sea', 125, 75), ('Sea of Okhotsk', 148, 55), ('Bering Sea north', -170, 62), ('Bering Sea south', -170, 55), ('Sea of Japan north', 139, 46), ('Caspian north', 50.5, 46), ('Lake Baikal', 108, 53.5), ('Black Sea', 34, 43.5), ('Weddell Sea', -40, -72), ('Ross Sea', -175, -75), ('Southern Ocean 60 S', 0, -60), ('Southern Ocean 66 S', 0, -66), ('Drake Passage', -65, -58)]:
    x, y = int((lon + 180) / 360 * W), int((90 - la) / 180 * H); print('  %-20s %4.1f months' % (name, ice[y, x] * 12))
os.makedirs(OUT, exist_ok=True)
Image.fromarray(np.dstack([np.rint(np.clip((sealevel + 3.0) / 4.0, 0.0, 1.0) * 255), np.rint(ice * 255), np.rint(snow * 255)]).astype(np.uint8), 'RGB').save(os.path.join(OUT, 'snow.png'), optimize=True)
s2 = np.array(Image.fromarray(np.rint(summer * 255).astype(np.uint8)).resize((W, H), Image.BOX)).astype(np.float32)
wet2 = np.array(Image.fromarray(wet).resize((W, H), Image.NEAREST)); k = np.where(wet2, ice, snow)[..., None]
v = s2 * (1 - k) + np.array([245, 248, 252], np.float32) * k
Image.fromarray(np.concatenate([np.rint(v).astype(np.uint8), np.array(Image.fromarray(np.rint(winter * 255).astype(np.uint8)).resize((W, H), Image.BOX))], 0)).save(os.path.join(OUT, 'planet_snow.jpg'), quality=86)
print('snow.png %d bytes; planet_snow.jpg: above, the summer with the winter\'s snow laid on it; below, the winter as the Blue Marble has it' % os.path.getsize(os.path.join(OUT, 'snow.png')))
