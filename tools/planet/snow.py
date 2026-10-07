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

Ice on the sea (green): the share of the seven months about the end of winter (December to June in the north, June to
December in the south) in which the water was white, times 0.8 - all of them in Baffin Bay, six in Hudson Bay, four in
the Gulf of Bothnia and the Sea of Okhotsk, none off Norway - and 1 where it is white in summer too (the pack of the
Arctic Ocean, the Weddell Sea). Water is the game's own (tools/planet/mask.png), and only water a
texel clear of any shore speaks: the Blue Marble's shore is not the game's to the texel, and a snowy coast would be ice.

    python3 tools/planet/snow.py --out out --work work      (the Planet workflow: mode "snow")
        out/snow.png           2048 x 1024; red: 0 no snow in any month ... 255 it lies all the cold season;
                               green: 0 the sea never freezes ... 204 it is ice for seven months ... 255 all the year
        out/planet_snow.jpg    the same over the summer's picture, to look at, and midwinter as the Blue Marble has it
The game reads it into the second layer of its planet's maps (planetMaps in src/main.js: the snow into its alpha, the
ice into its green); the ground's shader lets snow lie and the sea freeze only where the map has some, and for as much
of the year as it says (terrain.js, at "winter where winters are white" and "ice on the sea"; Trees.lyingAt is the
snow's twin for boughs and roofs).
"""
import os, sys, time, urllib.request
import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import gaussian_filter, distance_transform_edt, binary_erosion

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
# (water takes the snow of the land nearest to it: a card weighs between a shore's texels, and a lake freezes with its shores)
ix = distance_transform_edt(sea, return_distances=False, return_indices=True); snow = snow[ix[0], ix[1]]; del ix

# ---------- ice on the sea ----------
mask = np.array(Image.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mask.png')).resize((W * 2, H * 2), Image.BOX))
wet = mask < 160                                      # the game's water: the sea (0), a lake (128) and what a shore mixes of them
ICE = {True: (12, 1, 2, 3, 4, 5, 6), False: (6, 7, 8, 9, 10, 11, 12)}      # the seven months about the end of winter
def white(a, la): return ss(0.40, 0.58, la) * grey(a)
ice, lit = np.zeros((H * 2, W * 2), np.float32), np.zeros((H * 2, W * 2), np.float32)
for k in range(7):
    a = half(ICE[True][k], ICE[False][k]); la = lum(a); ok = (la > 0.012).astype(np.float32)      # (a month without light says nothing)
    ice += white(a, la) * ok; lit += ok
    del a, la, ok
# (0.8 is ice for all seven months; above it, what is white in summer too, which is white all the year: the game lets the one
#  melt and the other stay)
ice = np.maximum(0.8 * ice / np.maximum(lit, 1.0), white(summer, ls))
print('months with light, of the seven: at the pole %.1f, at 80 N %.1f, at 70 N %.1f, at 70 S %.1f, at 80 S %.1f' % tuple(float(lit[int((90 - la) / 180 * H * 2)].mean()) for la in (89.5, 80, 70, -70, -80)))
open_water = binary_erosion(wet, iterations=1, border_value=1)          # water a texel clear of any shore
ix = distance_transform_edt(~open_water, return_distances=False, return_indices=True); ice = np.where(open_water, ice, ice[ix[0], ix[1]]); del ix
ice = np.array(Image.fromarray(np.rint(ice * 255).astype(np.uint8)).resize((W, H), Image.BOX).filter(ImageFilter.GaussianBlur(1.0))).astype(np.float32) / 255.0
ice = np.clip((ice - 0.03) / 0.94, 0.0, 1.0)
# (to the map's own cells, then smoothed over some sixty kilometres: what is left of a month's yes or no is how likely it is)
snow = np.array(Image.fromarray(np.rint(snow * 255).astype(np.uint8)).resize((W, H), Image.BOX).filter(ImageFilter.GaussianBlur(1.6))).astype(np.float32) / 255.0
snow = np.clip((snow - 0.03) / 0.94, 0.0, 1.0)
lat = 90.0 - (np.arange(H) + 0.5) * 180.0 / H
print('snow in winter by latitude (the share of the land that has it; 10 degrees at a time, from the north):')
landm = ~np.array(Image.fromarray(sea).resize((W, H), Image.NEAREST))
for a in range(90, -90, -10):
    m = (lat <= a) & (lat > a - 10); l = landm[m]; print('  %4d..%4d: %5.1f%%' % (a, a - 10, 100.0 * snow[m][l].mean() if l.any() else 0.0))
for name, lon, la in [('Tibet', 88, 33), ('Tarim', 83, 39), ('Mongolia', 104, 47), ('Kazakh steppe', 68, 49), ('Moscow', 37, 56), ('Paris', 2.3, 48.8), ('Berlin', 13.4, 52.5), ('Kyiv', 30.5, 50.4), ('Beijing', 116.4, 39.9), ('Harbin', 126.6, 45.8), ('Chicago', -87.6, 41.9), ('Denver', -105, 39.7), ('Winnipeg', -97, 50), ('Great Basin', -116, 40), ('Anatolia', 33, 39), ('Iran plateau', 54, 33), ('Namib', 15, -23), ('Karoo', 24, -32), ('Patagonia 45S', -69, -45), ('Patagonia 50S', -70, -50), ('Puna', -67, -22), ('Santiago Andes', -70.1, -33.5), ('NZ Alps', 170, -43.8), ('Alps', 9.5, 46.6), ('Sahara Hoggar', 5.5, 23.3), ('Hokkaido', 143, 43.5)]:
    x, y = int((lon + 180) / 360 * W), int((90 - la) / 180 * H); print('  %-16s %.2f   (winter %s, summer %s)' % (name, snow[y, x], np.rint(winter[y * 2, x * 2] * 255).astype(int), np.rint(summer[y * 2, x * 2] * 255).astype(int)))
print('ice on the sea (the share of seven months; above 1, ice in summer too):')
for name, lon, la in [('North Pole', 0, 88), ('Baffin Bay', -65, 73), ('Hudson Bay', -85, 60), ('Labrador coast', -57, 56), ('Gulf of St Lawrence', -62, 48), ('Lake Superior', -87.5, 47.7), ('Greenland Sea', -5, 76), ('Norwegian Sea', 5, 68), ('North Sea', 3, 56), ('Barents Sea', 35, 73), ('White Sea', 38, 65.5), ('Gulf of Bothnia', 21, 64), ('Gulf of Finland', 26, 59.9), ('Baltic proper', 19, 56), ('Kara Sea', 70, 75), ('Laptev Sea', 125, 75), ('Sea of Okhotsk', 148, 55), ('Bering Sea north', -170, 62), ('Bering Sea south', -170, 55), ('Sea of Japan north', 139, 46), ('Caspian north', 50.5, 46), ('Lake Baikal', 108, 53.5), ('Black Sea', 34, 43.5), ('Weddell Sea', -40, -72), ('Ross Sea', -175, -75), ('Southern Ocean 60 S', 0, -60), ('Southern Ocean 66 S', 0, -66), ('Drake Passage', -65, -58)]:
    x, y = int((lon + 180) / 360 * W), int((90 - la) / 180 * H); print('  %-20s %.2f   (midwinter %s, summer %s)' % (name, ice[y, x] / 0.8, np.rint(winter[y * 2, x * 2] * 255).astype(int), np.rint(summer[y * 2, x * 2] * 255).astype(int)))
os.makedirs(OUT, exist_ok=True)
Image.fromarray(np.dstack([np.rint(snow * 255), np.rint(ice * 255), np.zeros((H, W))]).astype(np.uint8), 'RGB').save(os.path.join(OUT, 'snow.png'), optimize=True)
s2 = np.array(Image.fromarray(np.rint(summer * 255).astype(np.uint8)).resize((W, H), Image.BOX)).astype(np.float32)
wet2 = np.array(Image.fromarray(wet).resize((W, H), Image.NEAREST)); k = np.where(wet2, ice, snow)[..., None]
v = s2 * (1 - k) + np.array([245, 248, 252], np.float32) * k
Image.fromarray(np.concatenate([np.rint(v).astype(np.uint8), np.array(Image.fromarray(np.rint(winter * 255).astype(np.uint8)).resize((W, H), Image.BOX))], 0)).save(os.path.join(OUT, 'planet_snow.jpg'), quality=86)
print('snow.png %d bytes; planet_snow.jpg: above, the summer with the winter\'s snow laid on it; below, the winter as the Blue Marble has it' % os.path.getsize(os.path.join(OUT, 'snow.png')))
