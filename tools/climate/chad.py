#!/usr/bin/env python3
# The cells of the simulation's grid (half a degree, 720 by 360) that Mega-Chad can cover, for CHAD in src/climate.js: each cell
# of the basin of Lake Chad whose centre lies where the ground's shader draws the lake (east of 12.25 and north of 10.5 degrees:
# its box, src/terrain.js), with the height under which half of it lies (the median of the heights at level 5, data/h: 0.011
# degrees to a texel, steps of 4 m, 2.8 % taller than the Earth, as the shader takes them), kept where that is under the lake's
# highest level (336 m: chadLevel). Prints the table as climate.js has it: x - 380, y - 140 and the height, by the cell.
#   python3 tools/climate/chad.py            (from the repository's root, with the heights fetched: npm run fetch)
import io, json, struct, sys
import numpy as np
from PIL import Image

TOP = 336
idx = json.load(open('data/h/index.json'))
L = 5; lv = idx['levels'][str(L)]; n = lv['bundle']; step = lv['step']
px, py = 8, 3                      # the pack of 22.5 degrees from 0 east and 22.5 north that holds the basin
f = open('data/h/%d_b%d_%d.bin' % (L, px // n, py // n), 'rb').read()
assert struct.unpack_from('<I', f, 0)[0] == 0x31425748      # 'HWB1'
off, ln = struct.unpack_from('<II', f, 8 + ((py % n) * n + px % n) * 8)
im = np.asarray(Image.open(io.BytesIO(f[off:off + ln])).convert('RGB')).astype(np.int32)
H = (im[:, :, 0] * 256 + im[:, :, 1]) * step              # high byte in red, low in green
ap = idx.get('apron', 2); T = H.shape[0] - 2 * ap
lon0, lat0 = px * 22.5 - 180, 90 - py * 22.5; d = 22.5 / T
out = []
for y in range(360):
    la1 = 90 - y * 0.5; la2 = la1 - 0.5; lat = la1 - 0.25
    if lat < 10.5 or lat > 20: continue
    for x in range(720):
        lo1 = x * 0.5 - 180; lo2 = lo1 + 0.5; lon = lo1 + 0.25
        if lon < 12.25 or lon > 21: continue
        blk = H[int(round((lat0 - la1) / d)) + ap:int(round((lat0 - la2) / d)) + ap, int(round((lo1 - lon0) / d)) + ap:int(round((lo2 - lon0) / d)) + ap]
        m = int(round(float(np.median(blk))))
        if m < TOP: out.append('%d.%d.%d' % (x - 380, y - 140, m))
print(len(out), 'cells', file=sys.stderr)
print(' '.join(out))
