#!/usr/bin/env python3
"""How long snow lies in winter, as the Earth has it (data/snow.png).

The game laid its winter snow by the climate's class: "a cold desert" lay white from the Tarim to the Namib, "a tundra"
from Siberia to the Puna of the Andes, and Tibet, which is dry and all but bare in January, was an ice cap. The Blue
Marble Next Generation (NASA Earth Observatory, 2004; public domain) has every month of the year: this holds each of
the seven months of a hemisphere's cold season (October to April north of the equator, April to October south of it)
against its midsummer, and keeps what is white or grey in that month and was not in summer - snow, on open ground and
through the trees of a taiga. What is kept is the share of the seven months in which a place had it: all of them in
Siberia, three or four at Moscow, one about Berlin, none at Paris. (One month alone says yes or no: by January's the
snow of Europe was a white sheet with a ruled edge through Poland.) What is white the year round (ice, salt, bright
sand) is no winter's snow and is left out: the game has its own rule for ice.

    python3 tools/planet/snow.py --out out --work work      (the Planet workflow: mode "snow")
        out/snow.png           2048 x 1024, grey: 0 no snow in any month ... 255 it lies all the cold season
        out/planet_snow.jpg    the same over the summer's picture, to look at, and midwinter as the Blue Marble has it
The game reads it into the alpha of the second layer of its planet's maps (planetMaps in src/main.js); the ground's
shader lets snow lie only where it has some, and for as much of the year as it says (terrain.js, at "winter where
winters are white"; Trees.lyingAt is its twin for boughs and roofs).
"""
import os, sys, time, urllib.request
import numpy as np
from PIL import Image, ImageFilter

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
    return np.array(Image.open(f).convert('RGB').resize((W * 2, H * 2), Image.BOX)).astype(np.float32) / 255.0


def ss(a, b, x): t = np.clip((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t)


def lum(a): return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114
def grey(a): mx, mn = a.max(-1), a.min(-1); return 1.0 - ss(0.10, 0.28, (mx - mn) / np.maximum(mx, 0.04))


jan, jul = month(1), month(7)
north = (np.arange(H * 2) < H)[:, None]
summer = np.where(north[..., None], jul, jan); ls = lum(summer)
sea = (summer[..., 2] > summer[..., 0] + 0.03) & (ls < 0.2)          # (the Blue Marble's own sea: dark and blue)
COLD = {True: (10, 11, 12, 1, 2, 3, 4), False: (4, 5, 6, 7, 8, 9, 10)}      # the cold season's months, north and south
snow = np.zeros((H * 2, W * 2), np.float32); winter = np.where(north[..., None], jan, jul)
for k in range(7):
    mn, ms = COLD[True][k], COLD[False][k]
    a = np.where(north[..., None], jan if mn == 1 else month(mn), jul if ms == 7 else month(ms)); lw = lum(a)
    # snow: lighter than the summer by a good deal, and without colour; a wood under snow is grey, not white, and far darker than a field
    # (bare boughs without snow are lighter than the summer's leaves too, but brown)
    snow += ss(0.08, 0.22, lw - ls) * grey(a) * ss(0.16, 0.30, lw) * (1.0 - sea) / 7.0
    del a, lw
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
os.makedirs(OUT, exist_ok=True)
Image.fromarray(np.rint(snow * 255).astype(np.uint8)).save(os.path.join(OUT, 'snow.png'), optimize=True)
s2 = np.array(Image.fromarray(np.rint(summer * 255).astype(np.uint8)).resize((W, H), Image.BOX)).astype(np.float32)
v = s2 * (1 - snow[..., None]) + np.array([245, 248, 252], np.float32) * snow[..., None]
Image.fromarray(np.concatenate([np.rint(v).astype(np.uint8), np.array(Image.fromarray(np.rint(winter * 255).astype(np.uint8)).resize((W, H), Image.BOX))], 0)).save(os.path.join(OUT, 'planet_snow.jpg'), quality=86)
print('snow.png %d bytes; planet_snow.jpg: above, the summer with the winter\'s snow laid on it; below, the winter as the Blue Marble has it' % os.path.getsize(os.path.join(OUT, 'snow.png')))
