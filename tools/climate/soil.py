#!/usr/bin/env python3
"""What the land of every cell of the simulation's grid is, for farming: data/soil.png (720 x 360).

From what the game already has: the climate's class at an eighth of a degree (data/climate.png, Koppen-Geiger: the
commonest of the cell's sixteen), where woods would stand by nature (data/veg.jpg: red the green of the land, blue how
warm-coloured, that is open, it is), the heights and the rivers and ice of the grid itself (data/world.png).

Red: the class (below). Green: how much of the cell the class has (255 all). Blue: how wooded the cell is by nature
(0 open grass .. 255 closed wood). Opaque, so a 2D canvas reads it back whole.

Classes (the simulation's SOIL table in src/sim.js says what each feeds in each age):
   0 sea              1 ice                2 tundra             3 boreal wood       4 desert
   5 steppe           6 grassland          7 temperate wood     8 Mediterranean     9 the farmland of monsoon Asia
  10 savanna         11 rainforest        12 tropical highland 13 high plateau

  python3 tools/climate/soil.py           (prints the land of every class and a sheet: shots/peek/soil.png)
"""
import os
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
W, H = 720, 360
NAMES = ['sea', 'ice', 'tundra', 'boreal wood', 'desert', 'steppe', 'grassland', 'temperate wood', 'Mediterranean',
         'monsoon Asia', 'savanna', 'rainforest', 'tropical highland', 'high plateau']

wp = np.array(Image.open(os.path.join(root, 'data', 'world.png')).convert('RGBA')).astype(np.int32)
land = (wp[:, :, 2] & 1) == 1
ice = (wp[:, :, 2] & 8) == 8
river = (wp[:, :, 2] & 2) == 2
metres = (wp[:, :, 0] - 23) * 30          # (red = 23 + metres / 30: tools/terrain/voids.mjs)

kg = np.array(Image.open(os.path.join(root, 'data', 'climate.png')))     # 1440 x 2880, 1..31
cnt = np.zeros((32, H, W), np.int32)
for c in range(1, 32):
    m = (kg == c).reshape(H, 4, W, 4).sum(axis=(1, 3))
    cnt[c] = m
kc = cnt.argmax(0); share = cnt.max(0) / 16.0

veg = np.array(Image.open(os.path.join(root, 'data', 'veg.jpg')).convert('RGB')).astype(np.float32) / 255
# veg is 2048 x 4096: the cell's block is 5.69 texels a side; a mean over the texels whose centres fall in it
vy = (np.arange(veg.shape[0]) * H // veg.shape[0]); vx = (np.arange(veg.shape[1]) * W // veg.shape[1])
def block_mean(ch):
    rows = np.add.reduceat(ch, np.searchsorted(vy, np.arange(H)), axis=0)
    full = np.add.reduceat(rows, np.searchsorted(vx, np.arange(W)), axis=1)
    ny = np.bincount(vy, minlength=H)[:, None]; nx = np.bincount(vx, minlength=W)[None, :]
    return full / (ny * nx)
green = block_mean(veg[:, :, 0]); warm = block_mean(veg[:, :, 2])
# how wooded by nature: green and not warm-coloured (the shader's "wild": 1 - smoothstep(0.22, 0.48, warm))
def smooth(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
wood = green * (1 - smooth(0.22, 0.48, warm))

lat = 90 - (np.arange(H) + 0.5) / H * 180; lon = (np.arange(W) + 0.5) / W * 360 - 180
LON, LAT = np.meshgrid(lon, lat)
K = kc
A = lambda *names: np.isin(K, [KG[n] for n in names])
KG = {n: i + 1 for i, n in enumerate('Af Am As Aw BSh BSk BWh BWk Cfa Cfb Cfc Csa Csb Csc Cwa Cwb Cwc Dfa Dfb Dfc Dfd Dsa Dsb Dsc Dsd Dwa Dwb Dwc Dwd EF ET'.split())}
asia = (LON > 60) & (LON < 150) & (LAT > -11) & (LAT < 50)
cls = np.zeros((H, W), np.uint8)
cls[A('BWh', 'BWk')] = 4
cls[A('BSh', 'BSk')] = 5
cls[A('Dfc', 'Dfd', 'Dwc', 'Dwd', 'Dsc', 'Dsd', 'Cfc', 'Csc', 'Cwc')] = 3
cls[A('Csa', 'Csb', 'Dsa', 'Dsb')] = 8
temperate = A('Cfa', 'Cfb', 'Dfa', 'Dfb', 'Dwa', 'Dwb', 'Cwa', 'Cwb')
cls[temperate] = 7
cls[temperate & (wood < 0.25) & (green > 0.12)] = 6            # open grass in a climate that could farm it: prairie, pampas, the black earth
cls[A('Aw', 'As', 'Am')] = 10
cls[A('Af')] = 11
cls[A('Am') & (wood > 0.55)] = 11
monsoon = asia & (A('Cfa', 'Cwa', 'Cwb', 'Dwa', 'Aw', 'As', 'Am', 'Af') | (A('Dfa', 'Dfb') & (LON > 100)))
cls[monsoon] = 9
cls[A('ET')] = 2
tropic = np.abs(LAT) < 30
cls[tropic & (metres > 1300) & np.isin(cls, [3, 6, 7, 8, 9, 10, 11])] = 12
cls[(metres > 3000) & np.isin(cls, [2, 3, 5, 6, 7, 12])] = 13
cls[A('EF') | ice] = 1
cls[~land] = 0

out = np.zeros((H, W, 3), np.uint8)
out[:, :, 0] = cls; out[:, :, 1] = np.clip(share * 255, 0, 255).astype(np.uint8); out[:, :, 2] = np.clip(wood * 255, 0, 255).astype(np.uint8)
out[~land] = 0
Image.fromarray(out, 'RGB').save(os.path.join(root, 'data', 'soil.png'), optimize=True)
n = np.bincount(cls[land], minlength=14)
for k in range(1, 14): print(f'{k:3d} {NAMES[k]:20s} {n[k]:6d} cells   rivers {int((river & (cls == k)).sum()):5d}')

pal = np.array([[12, 18, 28], [235, 240, 245], [150, 160, 150], [40, 90, 60], [230, 205, 140], [200, 180, 100], [170, 200, 80], [60, 140, 60],
                [190, 150, 90], [90, 200, 140], [210, 170, 60], [20, 110, 40], [180, 110, 160], [140, 120, 150]], np.uint8)
sheet = pal[cls]
os.makedirs(os.path.join(root, 'shots', 'peek'), exist_ok=True)
Image.fromarray(sheet).resize((1440, 720), Image.NEAREST).save(os.path.join(root, 'shots', 'peek', 'soil.png'))
