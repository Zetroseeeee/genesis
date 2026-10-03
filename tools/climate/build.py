#!/usr/bin/env python3
"""The climate of the real Earth, for the ground and the trees.

Source: the Koppen-Geiger climate classification at 100 arc-seconds (Rubel, Brugger, Haslinger & Auer 2017,
"The climate of the European Alps: Shift of very high resolution Koppen-Geiger climate zones 1800-2100",
Meteorol. Z., doi:10.1127/metz/2016/0816; map for 1986-2010), as packaged in the Python module kgcpy
(BSD-3-Clause, CWRU SDLE lab):

    pip download kgcpy --no-deps -d /tmp/kg && cd /tmp/kg && unzip -o kgcpy-*.whl
    python3 tools/climate/build.py /tmp/kg/kgcpy/kmz_int_reshape.png

Writes
  data/climate.png   2880x1440 grey: the climate class of every eighth of a degree (1..31 as below; the sea carries
                     the class of the nearest land, so a lookup on a coast never comes back empty)
  data/info.png      alpha channel: how dry the country is, 255 = humid ... 0 = true desert (smoothed; the ground
                     shader blends sand, scrub, steppe and savanna by it);
                     blue channel: how hard the winters are, 0 = no snow ever ... 255 = snow lies for half the year
                     (the ground and the roofs go white by it, in season). Red and green are left as they are.

Classes: 1 Af 2 Am 3 As 4 Aw 5 BSh 6 BSk 7 BWh 8 BWk 9 Cfa 10 Cfb 11 Cfc 12 Csa 13 Csb 14 Csc 15 Cwa 16 Cwb 17 Cwc
18 Dfa 19 Dfb 20 Dfc 21 Dfd 22 Dsa 23 Dsb 24 Dsc 25 Dsd 26 Dwa 27 Dwb 28 Dwc 29 Dwd 30 EF 31 ET
"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
src = sys.argv[1]
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
kg = np.array(Image.open(src))            # 6480 x 12960, 1..31 land, 32 sea
H0, W0 = kg.shape
print('source', kg.shape, 'classes', np.unique(kg).tolist())

# ---- classes at an eighth of a degree: the commonest class of each block of the fine map -------------------------
W, H = 2880, 1440
ys = (np.arange(H0) * H // H0); xs = (np.arange(W0) * W // W0)
counts = np.zeros((33, H, W), np.uint16)
for c in range(1, 32):
    m = (kg == c).astype(np.uint16)
    if not m.any(): continue
    rows = np.add.reduceat(m, np.searchsorted(ys, np.arange(H)), axis=0)
    counts[c] = np.add.reduceat(rows, np.searchsorted(xs, np.arange(W)), axis=1)
land = counts[1:32].sum(0) > 0
cls = counts[1:32].argmax(0).astype(np.uint8) + 1
cls[~land] = 0
# the sea takes the class of the nearest land
idx = ndimage.distance_transform_edt(cls == 0, return_distances=False, return_indices=True)
filled = cls[idx[0], idx[1]]
Image.fromarray(filled, 'L').save(os.path.join(root, 'data', 'climate.png'), optimize=True)
print('climate.png', filled.shape, os.path.getsize(os.path.join(root, 'data', 'climate.png')), 'bytes')

# ---- dryness for the ground shader ---------------------------------------------------------------------------------
ARID = np.zeros(33, np.float32)
ARID[[7, 8]] = 1.0                    # desert
ARID[[5, 6]] = 0.6                    # steppe
ARID[[3, 4]] = 0.32                   # savanna: a long dry season
ARID[[12, 13, 14, 22, 23, 24, 25]] = 0.26     # dry summers
ARID[[15, 16, 17, 26, 27, 28, 29]] = 0.12     # dry winters
COLD = np.zeros(33, np.float32)
COLD[[20, 21, 24, 25, 28, 29, 30, 31]] = 1.0     # taiga, tundra, ice: snow from autumn to spring
COLD[[18, 19, 22, 23, 26, 27]] = 0.72            # continental: a white winter
COLD[11] = 0.5; COLD[[6, 8]] = 0.45              # subpolar coasts; cold steppe and desert (thin snow, but it lies)
COLD[10] = 0.25; COLD[9] = 0.12; COLD[[16, 17]] = 0.1; COLD[13] = 0.06      # mild winters: some snow, some years
info = Image.open(os.path.join(root, 'data', 'info.png')).convert('RGBA')
IW, IH = info.size
landf = (kg != 32).astype(np.float32)
ys2 = (np.arange(H0) * IH // H0); xs2 = (np.arange(W0) * IW // W0)
def block(a):
    r = np.add.reduceat(a, np.searchsorted(ys2, np.arange(IH)), axis=0)
    return np.add.reduceat(r, np.searchsorted(xs2, np.arange(IW)), axis=1)
den = block(landf)
def field(table):
    # from the fine map: the mean of the land in each texel, the sea taking its coast's value; then a soft blur
    num = block(table[np.where(kg == 32, 0, kg)] * landf)
    a = np.where(den > 0, num / np.maximum(den, 1e-6), -1)
    idx = ndimage.distance_transform_edt(a < 0, return_distances=False, return_indices=True)
    return ndimage.gaussian_filter(a[idx[0], idx[1]], sigma=[1.1, 1.1], mode=['nearest', 'wrap'])
arr = np.array(info)
arr[..., 3] = np.clip(255 - np.round(field(ARID) * 255), 0, 255).astype(np.uint8)
arr[..., 2] = np.clip(np.round(field(COLD) * 255), 0, 255).astype(np.uint8)
Image.fromarray(arr, 'RGBA').save(os.path.join(root, 'data', 'info.png'), optimize=True)
print('info.png: dryness in alpha, winter cold in blue', arr.shape, os.path.getsize(os.path.join(root, 'data', 'info.png')), 'bytes')
