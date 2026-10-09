# The regions history counts its people by, on the simulation's grid (720 x 360, half a degree): which of Maddison's ten
# regions (The World Economy: A Millennial Perspective, OECD 2001, Table B-10) and which of Natural Earth's subregions every
# land cell lies in. tools/people/regions.js holds the simulation's people against history's by them.
#   python3 tools/people/regions_map.py            -> tools/people/regions.png (R: region, G: subregion, 255: none)
# The borders are Natural Earth's (1:110 million, public domain), fetched from its repository on GitHub when not at hand.
# A land cell no border reaches (a coast at this scale, a small island) takes the region of the nearest cell that has one.
import json, os, sys, urllib.request
import numpy as np
from PIL import Image
from matplotlib.path import Path

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
W, H = 720, 360
SRC = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'
CACHE = os.environ.get('NE_CACHE', '/tmp/ne_110m_admin_0_countries.geojson')

REGIONS = ['Western Europe', 'Eastern Europe', 'Former USSR', 'Western Offshoots', 'Latin America', 'Japan', 'China', 'India',
           'Other Asia', 'Africa']
WEU = 'AUT BEL DNK FIN FRA DEU ITA NLD NOR SWE CHE GBR IRL GRC PRT ESP LUX ISL'.split()
EEU = 'ALB BGR CZE SVK HUN POL ROU SVN HRV BIH SRB MNE MKD KOS'.split()
USSR = 'RUS UKR BLR MDA EST LVA LTU GEO ARM AZE KAZ UZB TKM KGZ TJK'.split()
OFF = 'USA CAN AUS NZL GRL'.split()
CHN = ['CHN']
IND = 'IND PAK BGD'.split()      # (Maddison's India before 1947: the whole of British India)


def region_of(p):
    a = p['ADM0_A3']
    if a in WEU: return 0
    if a in EEU: return 1
    if a in USSR: return 2
    if a in OFF: return 3
    if a == 'JPN': return 5
    if a in CHN: return 6
    if a in IND: return 7
    c = p['CONTINENT']
    if c == 'Africa': return 9
    if c in ('South America',) or p['SUBREGION'] in ('Central America', 'Caribbean'): return 4
    if c in ('Asia', 'Oceania') or a in ('CYP', 'CYN', 'TUR'): return 8
    if c == 'Europe': return 0
    return 255


def main():
    if not os.path.exists(CACHE):
        urllib.request.urlretrieve(SRC, CACHE)
    g = json.load(open(CACHE))
    subs = sorted(set(f['properties']['SUBREGION'] for f in g['features']))
    xs = (np.arange(W) + 0.5) / W * 360 - 180
    ys = 90 - (np.arange(H) + 0.5) / H * 180
    LX, LY = np.meshgrid(xs, ys)
    pts = np.stack([LX.ravel(), LY.ravel()], 1)
    reg = np.full(W * H, 255, np.uint8)
    sub = np.full(W * H, 255, np.uint8)
    for f in g['features']:
        p = f['properties']; r = region_of(p); s = subs.index(p['SUBREGION'])
        geom = f['geometry']; polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
        for poly in polys:
            ring = np.array(poly[0])
            rr = 4 if r == 0 and ring[:, 0].mean() < -30 else r      # (France's Guiana is South America's)
            x0, y0 = ring.min(0); x1, y1 = ring.max(0)
            box = (pts[:, 0] >= x0) & (pts[:, 0] <= x1) & (pts[:, 1] >= y0) & (pts[:, 1] <= y1)
            idx = np.nonzero(box)[0]
            if not len(idx): continue
            inside = Path(ring).contains_points(pts[idx])
            for hole in poly[1:]:
                inside &= ~Path(np.array(hole)).contains_points(pts[idx])
            reg[idx[inside]] = rr; sub[idx[inside]] = s
    # the simulation's land (world.png: blue's lowest bit), and every land cell given the region of the nearest that has one
    wp = np.array(Image.open(os.path.join(ROOT, 'data', 'world.png')).convert('RGBA'))
    land = (wp[:, :, 2].ravel() & 1) == 1
    filled = np.zeros(W * H, np.uint8)
    have = np.nonzero(reg != 255)[0]
    hy, hx = have // W, have % W
    for i in np.nonzero(land & (reg == 255))[0]:
        y, x = i // W, i % W
        dx = np.abs(hx - x); dx = np.minimum(dx, W - dx); d = dx * dx + (hy - y) ** 2
        j = have[np.argmin(d)]
        if d.min() <= 36: reg[i] = reg[j]; sub[i] = sub[j]; filled[i] = 1
    reg[~land] = 255; sub[~land] = 255
    out = np.zeros((H, W, 4), np.uint8)
    out[:, :, 0] = reg.reshape(H, W); out[:, :, 1] = sub.reshape(H, W); out[:, :, 2] = filled.reshape(H, W) * 255; out[:, :, 3] = 255
    Image.fromarray(out, 'RGBA').save(os.path.join(ROOT, 'tools', 'people', 'regions.png'), optimize=True)
    json.dump({'regions': REGIONS, 'subregions': subs}, open(os.path.join(ROOT, 'tools', 'people', 'regions.json'), 'w'), indent=1)
    n = np.bincount(reg[land], minlength=256)
    for k, name in enumerate(REGIONS): print(f'{name:18s} {n[k]:6d} land cells')
    print('land with no region:', n[255], ' filled from the nearest:', int(filled.sum()))


if __name__ == '__main__':
    main()
