#!/usr/bin/env python3
"""The sky as the game has it: the stars, the Milky Way, the Moon and the clouds (the Planet workflow, mode "sky").

    python3 tools/planet/sky.py --out out --work work [stars] [milkyway] [moon] [clouds]

Nothing told: all four, and the pack. Told some: those only, a trial (sky-part.tar, nobody's pack).

  stars     Every star to the tenth magnitude, a third of a million of them, as points: where it stands (J2000), how bright it
            is (V), what colour (B-V). The Bright Star Catalogue has the nine thousand the eye can see, with magnitudes
            measured as the eye sees; Hipparcos and Tycho-2 the rest (their own magnitudes brought to V). A star that is in
            two of them is taken from the first. stars.bin: "HST1", how many, then six bytes a star, brightest first -
            right ascension (65536 to the circle), declination (32767 to a right angle), V (twentieths of a magnitude
            above -1.5), B-V (0 .. 255 for -0.4 .. 2.0).
  milkyway  What is left of the sky when those stars are taken out of it: the light of the two thousand million fainter
            ones that Gaia counted, which is the Milky Way (NASA's Scientific Visualization Studio, "Deep Star Maps 2020").
            milkyway.webp, 4096 by 2048, the whole sky in right ascension and declination: RA 0 in the middle and growing
            to the left, as the sky is seen from inside it. Light is kept as the root of 1 - exp(-4 x): the dark of the
            sky has most of the steps.
  moon      The side of the Moon that faces the Earth, as a disc seen from it (north up, Mare Crisium to the right):
            moon.webp, 1024 by 1024. Red is how light the ground is (the Lunar Reconnaissance Orbiter's colour mosaic),
            green and blue which way it faces (x to the right, y up, from the orbiter's laser altimeter: sixteen heights to
            the degree) - what lies along the edge of the Moon's night is craters, and they are seen by their slopes.
  clouds    The Blue Marble's clouds (NASA Earth Observatory, 2001: a picture of nothing but cloud, 43,200 texels round
            the Earth), made 16,384 round: clouds_0.webp (180 W to 0) and clouds_1.webp (0 to 180 E), 8192 square each, and
            clouds_s.webp, 2048 by 1024, for the shadows on the ground and for the first moments.

The pack is kept under the name of what it was made from (twelve digits of the SHA-256 of this file): sky-<hash>.tar and
sky-<hash>.json in the "planet" release, sky.json for whoever asks for the pack made last. tools/planet/fetch.mjs brings it
into data/sky/. Look at planet_sky.jpg (the stars laid over NASA's own map of them: every ring must have its star), at
planet_moon.jpg (the disc at three ages) and at the log.

Where it comes from, all of it public: the Bright Star Catalogue, 5th revised edition (Hoffleit and Warren, 1991), the
Hipparcos Catalogue (ESA, 1997) and the Tycho-2 Catalogue (Hog and others, 2000), as NASA's HEASARC keeps them; Deep Star
Maps 2020 and the CGI Moon Kit (NASA/Goddard Space Flight Center Scientific Visualization Studio; Gaia DR2: ESA/Gaia/DPAC;
the Moon: the Lunar Reconnaissance Orbiter's camera and laser altimeter); the Blue Marble's clouds (NASA Earth Observatory).
"""
import os, sys, io, json, gzip, math, time, struct, hashlib, tarfile, urllib.request, urllib.error
import numpy as np
from PIL import Image, ImageDraw
Image.MAX_IMAGE_PIXELS = None

arg = lambda n, d=None: sys.argv[sys.argv.index('--' + n) + 1] if '--' + n in sys.argv else d
OUT, WORK = arg('out', 'out'), arg('work', 'work')
PARTS = ('stars', 'milkyway', 'moon', 'clouds')
what = [a for a in sys.argv[1:] if a in PARTS]; whole = not what; what = what or list(PARTS)
H = hashlib.sha256(open(os.path.abspath(__file__), 'rb').read()).hexdigest()[:12]
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) holocene-planet-sky'}
HEASARC = 'https://heasarc.gsfc.nasa.gov/FTP/heasarc/dbase/tdat_files/'
SVS = 'https://svs.gsfc.nasa.gov/vis/a000000/'
EO = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/'
T0 = time.time()
def say(*a): print('[%4.0f s]' % (time.time() - T0), *a, flush=True)


def fetch(url, name, tries=4):
    f = os.path.join(WORK, name)
    if os.path.exists(f) and os.path.getsize(f) > 0: return f
    for k in range(tries):
        try:
            t0 = time.time()
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=900) as r, open(f + '.part', 'wb') as o:
                while True:
                    b = r.read(1 << 22)
                    if not b: break
                    o.write(b)
            os.replace(f + '.part', f); say('fetched %s: %.1f MB in %.0f s' % (name, os.path.getsize(f) / 1e6, time.time() - t0)); return f
        except Exception as e:
            say('  %s: %s%s' % (name, str(e)[:100], '' if k == tries - 1 else '; again'))
            if k == tries - 1: raise
            time.sleep(5 * (k + 1))


# ---------------------------------------------------------------------------------------------------------- the stars
def tdat(f, want):
    """A table as HEASARC keeps them: a header that names the fields of a line, then the lines, fields parted by '|'.
    want: {our name: (their names, in order of liking)}; gives {our name: list of strings}, a line for a line."""
    cols, names, out = None, None, {k: [] for k in want}
    with gzip.open(f, 'rt', encoding='latin1') as g:
        data = False
        for line in g:
            if not data:
                if line.startswith('line[1]'): names = line.split('=', 1)[1].split()
                elif line.startswith('<DATA>'):
                    data = True
                    if not names: raise RuntimeError('no line[1] in ' + f)
                    cols = {}
                    for k, cands in want.items():
                        c = [n for n in cands if n in names]
                        if not c: raise RuntimeError('%s: none of %s among %s' % (os.path.basename(f), cands, ' '.join(names)))
                        cols[k] = names.index(c[0])
                    say('  %s: %d fields; %s' % (os.path.basename(f), len(names), ', '.join('%s = %s' % (k, names[i]) for k, i in cols.items())))
                continue
            if line.startswith('<END>'): break
            p = line.rstrip('\n').split('|')
            for k, i in cols.items(): out[k].append(p[i] if i < len(p) else '')
    return out


def num(a):
    """a list of strings as numbers, NaN where there is none"""
    o = np.full(len(a), np.nan, np.float64)
    for i, s in enumerate(a):
        s = s.strip()
        if s:
            try: o[i] = float(s)
            except ValueError: pass
    return o


def unit(ra, dec):
    r, d = np.radians(ra), np.radians(dec); c = np.cos(d)
    return np.stack([c * np.cos(r), c * np.sin(r), np.sin(d)], -1)


def stars():
    from scipy.spatial import cKDTree
    LIMIT = 10.0
    b = tdat(fetch(HEASARC + 'heasarc_bsc5p.tdat.gz', 'bsc5p.tdat.gz'), dict(name=('name',), alt=('alt_name', 'name'), ra=('ra',), dec=('dec',), v=('vmag', 'v_mag'), bv=('bv_color', 'b_v_color', 'bv')))
    ra, dec, v, bv = num(b['ra']), num(b['dec']), num(b['v']), num(b['bv']); ok = np.isfinite(ra) & np.isfinite(dec) & np.isfinite(v)
    say('the Bright Star Catalogue: %d lines, %d stars with a place and a magnitude; V from %.2f to %.2f; %d without a colour' % (len(ra), ok.sum(), np.nanmin(v[ok]), np.nanmax(v[ok]), (ok & ~np.isfinite(bv)).sum()))
    names = [(b['name'][i].strip(), b['alt'][i].strip()) for i in np.where(ok)[0]]
    S = dict(ra=ra[ok], dec=dec[ok], v=v[ok], bv=np.where(np.isfinite(bv[ok]), bv[ok], 0.6), src=np.zeros(ok.sum(), np.int8))
    order = np.argsort(S['v'])[:14]
    say('  its brightest: ' + '; '.join('%s %s %.2f (%.3f, %.3f)' % (names[i][0], names[i][1], S['v'][i], S['ra'][i], S['dec'][i]) for i in order))

    def add(S, ra, dec, v, bv, src, label):
        ok = np.isfinite(ra) & np.isfinite(dec) & np.isfinite(v) & (v <= LIMIT)
        ra, dec, v, bv = ra[ok], dec[ok], v[ok], bv[ok]
        # (in the list already: a star within twenty seconds of arc and a magnitude of this one. Two that stand closer than
        #  that are one point of light to any eye and most screens)
        tree = cKDTree(unit(S['ra'], S['dec'])); d, j = tree.query(unit(ra, dec), k=3, distance_upper_bound=2 * math.sin(math.radians(20 / 3600) / 2))
        same = np.zeros(len(ra), bool)
        for c in range(3):
            hit = np.isfinite(d[:, c]); jj = np.where(hit, j[:, c], 0); same |= hit & (np.abs(S['v'][jj] - v) < 1.0)
        new = ~same
        say('%s: %d stars to V %.1f, %d of them in the list already, %d new' % (label, len(ra), LIMIT, same.sum(), new.sum()))
        return dict(ra=np.concatenate([S['ra'], ra[new]]), dec=np.concatenate([S['dec'], dec[new]]), v=np.concatenate([S['v'], v[new]]),
                    bv=np.concatenate([S['bv'], np.where(np.isfinite(bv[new]), bv[new], 0.6)]), src=np.concatenate([S['src'], np.full(new.sum(), src, np.int8)]))

    try:
        h = tdat(fetch(HEASARC + 'heasarc_hipparcos.tdat.gz', 'hipparcos.tdat.gz'), dict(ra=('ra',), dec=('dec',), v=('vmag', 'v_mag'), bv=('bv_color', 'b_v_color', 'bv')))
        S = add(S, num(h['ra']), num(h['dec']), num(h['v']), num(h['bv']), 1, 'Hipparcos')
    except Exception as e: say('Hipparcos: %s (going on without)' % str(e)[:300])
    t = tdat(fetch(HEASARC + 'heasarc_tycho2.tdat.gz', 'tycho2.tdat.gz'), dict(ra=('ra',), dec=('dec',), bt=('bt_mag', 'btmag', 'bmag', 'b_mag'), vt=('vt_mag', 'vtmag', 'vmag', 'v_mag')))
    ra, dec, bt, vt = num(t['ra']), num(t['dec']), num(t['bt']), num(t['vt'])
    # (Tycho's own two colours to the eye's V and to B-V; a star seen in one of them only is taken at that)
    both = np.isfinite(bt) & np.isfinite(vt); v = np.where(both, vt - 0.090 * (bt - vt), np.where(np.isfinite(vt), vt, bt - 0.5)); bv = np.where(both, 0.850 * (bt - vt), np.nan)
    say('Tycho-2: %d lines; %d with both colours, %d with one' % (len(ra), both.sum(), (np.isfinite(v) & ~both).sum()))
    S = add(S, ra, dec, v, bv, 2, 'Tycho-2')
    o = np.argsort(S['v'], kind='stable'); S = {k: a[o] for k, a in S.items()}; n = len(S['v'])
    say('the stars: %d; by magnitude: %s' % (n, ' '.join('<%g: %d' % (m, (S['v'] < m).sum()) for m in (0, 1, 2, 3, 4, 5, 6, 6.5, 7, 8, 9, 10))))
    say('  from the Bright Star Catalogue %d, Hipparcos %d, Tycho-2 %d; colours: B-V under 0 %d, 0 to 0.5 %d, 0.5 to 1 %d, 1 to 1.5 %d, over %d' % (
        (S['src'] == 0).sum(), (S['src'] == 1).sum(), (S['src'] == 2).sum(), (S['bv'] < 0).sum(), ((S['bv'] >= 0) & (S['bv'] < 0.5)).sum(), ((S['bv'] >= 0.5) & (S['bv'] < 1)).sum(), ((S['bv'] >= 1) & (S['bv'] < 1.5)).sum(), (S['bv'] >= 1.5).sum()))
    # how evenly they lie: stars to the square degree by the Galaxy's latitude would say; here by declination, which must be near even but for the Milky Way
    for lab, m in (('to 6.5', 6.5), ('to 10', 10.0)):
        sel = S['v'] <= m; band = np.histogram(S['dec'][sel], bins=[-90, -60, -30, 0, 30, 60, 90])[0]; area = [2 * math.pi * (math.sin(math.radians(b1)) - math.sin(math.radians(b0))) * (180 / math.pi) ** 2 for b0, b1 in zip([-90, -60, -30, 0, 30, 60], [-60, -30, 0, 30, 60, 90])]
        say('  %s, to the square degree from the south pole northward in bands of thirty degrees: %s' % (lab, ' '.join('%.3f' % (c / a) for c, a in zip(band, area))))
    rec = np.zeros(n, dtype=[('ra', '<u2'), ('dec', '<i2'), ('v', 'u1'), ('bv', 'u1')])
    rec['ra'] = np.round((S['ra'] % 360) / 360 * 65536).astype(np.int64) % 65536; rec['dec'] = np.round(np.clip(S['dec'], -90, 90) / 90 * 32767).astype(np.int16)
    rec['v'] = np.clip(np.round((S['v'] + 1.5) * 20), 0, 255).astype(np.uint8); rec['bv'] = np.clip(np.round((S['bv'] + 0.4) / 2.4 * 255), 0, 255).astype(np.uint8)
    with open(os.path.join(WORK, 'sky', 'stars.bin'), 'wb') as f: f.write(b'HST1' + struct.pack('<I', n) + rec.tobytes())
    return dict(n=int(n), eye=int((S['v'] <= 6.5).sum()), limit=LIMIT, v0=-1.5, vStep=0.05, bv0=-0.4, bv1=2.0, bytes=6), S


# ----------------------------------------------------------------------------------------------------- the Milky Way
def read_exr(f):
    """(H, W, 3) float32 from an OpenEXR file, by whichever reader is here"""
    err = []
    try:
        import OpenEXR
        if hasattr(OpenEXR, 'File'):
            with OpenEXR.File(f) as x:
                ch = x.channels()
                if 'RGB' in ch: return np.asarray(ch['RGB'].pixels, np.float32)
                if 'RGBA' in ch: return np.asarray(ch['RGBA'].pixels, np.float32)[..., :3]
                return np.stack([np.asarray(ch[c].pixels, np.float32) for c in ('R', 'G', 'B')], -1)
        import Imath
        x = OpenEXR.InputFile(f); dw = x.header()['dataWindow']; W, Hh = dw.max.x - dw.min.x + 1, dw.max.y - dw.min.y + 1
        return np.stack([np.frombuffer(x.channel(c, Imath.PixelType(Imath.PixelType.FLOAT)), np.float32).reshape(Hh, W) for c in 'RGB'], -1)
    except Exception as e: err.append('OpenEXR: ' + str(e)[:120])
    try:
        os.environ['OPENCV_IO_ENABLE_OPENEXR'] = '1'
        import cv2
        a = cv2.imread(f, cv2.IMREAD_UNCHANGED)
        if a is None: raise ValueError('not read')
        return np.ascontiguousarray(a[..., 2::-1].astype(np.float32))
    except Exception as e: err.append('cv2: ' + str(e)[:120])
    raise RuntimeError('; '.join(err))


MW_K = 4.0
def milkyway():
    a = read_exr(fetch(SVS + 'a004800/a004851/milkyway_2020_4k.exr', 'milkyway_2020_4k.exr'))
    lum = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    say('the Milky Way: %s; its light: the middle value %.4f, a thousandth of the sky above %.3f, the most %.3f' % (a.shape, np.median(lum), np.quantile(lum, 0.999), lum.max()))
    v = np.sqrt(np.clip(1.0 - np.exp(-np.maximum(a, 0) * MW_K), 0, 1)); img = Image.fromarray((v * 255 + 0.5).astype(np.uint8))
    f = os.path.join(WORK, 'sky', 'milkyway.webp'); img.save(f, format='WEBP', quality=92, method=6)
    back = np.asarray(Image.open(f).convert('RGB'), np.float32) / 255; err = np.abs(back - v)
    say('  milkyway.webp: %d by %d, %.0f KB; kept within %.4f on the whole, %.3f at worst (of 1)' % (img.size[0], img.size[1], os.path.getsize(f) / 1e3, err.mean(), err.max()))
    return dict(w=img.size[0], h=img.size[1], k=MW_K), v


# ---------------------------------------------------------------------------------------------------------- the Moon
MOON_R, MOON_N, MOON_STEEP = 1737.4, 1024, 1.6      # (its radius, km; the disc's size; how much steeper than life its slopes are shaded: the disc is small in the sky)
def moon():
    from scipy.ndimage import gaussian_filter, map_coordinates
    M = SVS + 'a004700/a004720/'
    col = np.asarray(Image.open(fetch(M + 'lroc_color_poles_4k.tif', 'lroc_color_poles_4k.tif')).convert('RGB'), np.float32) / 255
    hi = np.asarray(Image.open(fetch(M + 'ldem_16.tif', 'ldem_16.tif')), np.float32)      # kilometres above the Moon's mean sphere, sixteen to the degree, 180 W at the left as the colour is
    say('the Moon: colour %s, heights %s (%.2f to %.2f km)' % (col.shape, hi.shape, hi.min(), hi.max()))
    Hh, Wh = hi.shape; hs = gaussian_filter(hi, 1.2, mode=('nearest', 'wrap'))
    lat = (90 - (np.arange(Hh) + 0.5) / Hh * 180)[:, None]; step = math.pi / Hh
    dE = (np.roll(hs, -1, 1) - np.roll(hs, 1, 1)) / (2 * step * MOON_R * np.maximum(np.cos(np.radians(lat)), 0.02))      # km to the km eastward
    dN = np.zeros_like(hs); dN[1:-1] = (hs[:-2] - hs[2:]) / (2 * step * MOON_R)                                          # and northward (the rows run south)
    say('  slopes: half of the ground under %.1f degrees, a hundredth over %.1f' % (math.degrees(math.atan(np.median(np.hypot(dE, dN)))), math.degrees(math.atan(np.quantile(np.hypot(dE, dN)[::4, ::4], 0.99)))))
    n = MOON_N; y, x = np.mgrid[0:n, 0:n]; X = (x + 0.5) / n * 2 - 1; Y = 1 - (y + 0.5) / n * 2; r2 = X * X + Y * Y
    R = 0.985; X, Y = X / R, Y / R; r2 = X * X + Y * Y; inside = r2 < 1.0; Z = np.sqrt(np.clip(1 - r2, 0, 1))      # (the disc a little inside the picture: its rim is weighed with what lies outside)
    lon = np.arctan2(X, np.maximum(Z, 1e-6)); la = np.arcsin(np.clip(Y, -1, 1))
    def look(a, lon, la):
        h, w = a.shape[:2]; u = (lon / (2 * math.pi) + 0.5) * w - 0.5; v = (0.5 - la / math.pi) * h - 0.5
        if a.ndim == 2: return map_coordinates(a, [v, u], order=1, mode='wrap')
        return np.stack([map_coordinates(a[..., c], [v, u], order=1, mode='wrap') for c in range(a.shape[2])], -1)
    c = look(col, lon, la); alb = c @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    sE, sN = look(dE, lon, la) * MOON_STEEP, look(dN, lon, la) * MOON_STEEP
    # which way the ground faces, as the eye on the Earth has it: x to the right, y up, z toward the eye
    P = np.stack([X, Y, Z], -1); cl, sl, cp, sp = np.cos(lon), np.sin(lon), np.cos(la), np.sin(la)
    E = np.stack([cl, np.zeros_like(cl), -sl], -1); N = np.stack([-sp * sl, cp, -sp * cl], -1)
    nr = P - sE[..., None] * E - sN[..., None] * N; nr /= np.maximum(np.linalg.norm(nr, axis=-1, keepdims=True), 1e-9)
    edge = np.clip((1 - np.sqrt(r2)) * n * 0.5 * R + 0.5, 0, 1)      # (the disc's own edge, soft over a texel)
    out = np.zeros((n, n, 3), np.float32); out[..., 0] = np.where(inside, alb, 0) * edge
    out[..., 1] = np.where(inside, nr[..., 0], 0) * 0.5 + 0.5; out[..., 2] = np.where(inside, nr[..., 1], 0) * 0.5 + 0.5
    img = Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)); f = os.path.join(WORK, 'sky', 'moon.webp'); img.save(f, format='WEBP', quality=96, method=6)
    say('  moon.webp: %d square, %.0f KB; the ground\'s lightness %.3f on the whole, the seas about %.3f, the bright rays %.3f; mean colour of the disc %s' % (n, os.path.getsize(f) / 1e3, alb[inside].mean(), np.quantile(alb[inside], 0.1), np.quantile(alb[inside], 0.995), np.round(c[inside].mean(0), 3)))
    # how it will look: full, at a week (the sun from the right, as in the north's evening sky) and two days after new
    back = np.asarray(Image.open(f).convert('RGB'), np.float32) / 255; A = back[..., 0]; nx, ny = back[..., 1] * 2 - 1, back[..., 2] * 2 - 1; nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1))
    tiles = []
    for ang in (4, 90, 150):      # the angle from the eye to the sun, seen from the Moon
        s = np.array([math.sin(math.radians(ang)), 0.0, math.cos(math.radians(ang))]); mu0 = np.clip(nx * s[0] + ny * s[1] + nz * s[2], 0, 1); mu = np.clip(Z, 0.02, 1)
        lit = A * 2.0 * mu0 / (mu0 + mu) * (r2 < 1); tiles.append((np.clip(lit, 0, 1) ** 0.5 * 255).astype(np.uint8))
    sh = Image.new('L', (n * 3 + 8, n), 0)
    for i, t in enumerate(tiles): sh.paste(Image.fromarray(t), (i * (n + 4), 0))
    sh.save(os.path.join(OUT, 'planet_moon.jpg'), quality=90)
    return dict(size=n, r=R, steep=MOON_STEEP, tint=[round(float(q), 4) for q in (c[inside].mean(0) / max(alb[inside].mean(), 1e-6))])


# -------------------------------------------------------------------------------------------------------- the clouds
CLOUD_W = 16384
def clouds():
    from scipy.ndimage import grey_closing
    halves = []
    for side in ('W', 'E'):
        f = fetch(EO + '57000/57747/cloud.%s.2001210.21600x21600.png' % side, 'cloud_%s.png' % side); t0 = time.time()
        a = np.asarray(Image.open(f).convert('L')); say('clouds, %s: %s, read in %.0f s; mean %.1f, clear sky (0) %.3f of it' % (side, a.shape, time.time() - t0, a[::9, ::9].mean(), (a[::9, ::9] == 0).mean()))
        # (single black texels in the middle of a white cloud: the picture has some thousands, where its maker had no reading)
        t0 = time.time(); c = grey_closing(a, size=(3, 3)); hole = (c.astype(np.int16) - a) > 96; c = np.where(hole, c, a); say('  %d texels were holes, and are closed (%.0f s)' % (int(hole.sum()), time.time() - t0)); del hole
        hw = CLOUD_W // 2; img = Image.fromarray(c).resize((hw, hw), Image.LANCZOS); halves.append(img); del a, c
    whole_ = Image.new('L', (CLOUD_W, CLOUD_W // 2)); whole_.paste(halves[0], (0, 0)); whole_.paste(halves[1], (CLOUD_W // 2, 0))
    out = {}
    for i, img in enumerate(halves):
        f = os.path.join(WORK, 'sky', 'clouds_%d.webp' % i); t0 = time.time(); img.save(f, format='WEBP', quality=82, method=4)
        back = np.asarray(Image.open(f).convert('L'), np.float32); err = np.abs(back - np.asarray(img, np.float32))
        say('  clouds_%d.webp: %d square, %.1f MB (%.0f s); kept within %.2f on the whole, %.0f at worst (of 255)' % (i, img.size[0], os.path.getsize(f) / 1e6, time.time() - t0, err.mean(), err.max()))
    small = whole_.resize((2048, 1024), Image.BOX); f = os.path.join(WORK, 'sky', 'clouds_s.webp'); small.save(f, format='WEBP', quality=88, method=6)
    s = np.asarray(small, np.float32) / 255; lat = (90 - (np.arange(1024) + 0.5) / 1024 * 180); w = np.cos(np.radians(lat))[:, None]
    say('  clouds_s.webp: %.0f KB; of the Earth\'s sky %.2f is under some cloud (over an eighth), %.2f under thick (over a half); by latitude from the north in bands of thirty degrees: %s' % (
        os.path.getsize(f) / 1e3, ((s > 0.125) * w).sum() / (w.sum() * 2048), ((s > 0.5) * w).sum() / (w.sum() * 2048), ' '.join('%.2f' % s[k * 170:(k + 1) * 170].mean() for k in range(6))))
    whole_.resize((4096, 2048), Image.BOX).save(os.path.join(OUT, 'planet_clouds.jpg'), quality=88)
    # and pieces at the game's own fineness, to look at: India's monsoon, the sea west of Peru (its decks of cloud in cells), the Alps, a storm of the southern ocean
    tiles = []
    for lon, lat_ in ((78, 22), (-88, -18), (9, 47), (60, -52)):
        x, y = int((lon + 180) / 360 * CLOUD_W), int((90 - lat_) / 180 * CLOUD_W / 2); tiles.append(whole_.crop((x - 512, y - 512, x + 512, y + 512)))
    sh = Image.new('L', (1028 * 4, 1024), 60)
    for i, t in enumerate(tiles): sh.paste(t, (i * 1028, 0))
    sh.save(os.path.join(OUT, 'planet_clouds_native.jpg'), quality=88)
    return dict(w=CLOUD_W, h=CLOUD_W // 2, halves=['clouds_0.webp', 'clouds_1.webp'], small='clouds_s.webp', day='2001-07-29')


# ------------------------------------------------------------------------------------------- what was made, to look at
def sheet(S):
    """The stars as points over NASA's own map of them (Hipparcos and Tycho, drawn by NASA): three pieces of the sky. A ring
    for every star the eye can see; if this file has the sky the right way round, every ring has its star."""
    try: ref = read_exr(fetch(SVS + 'a004800/a004851/hiptyc_2020_4k.exr', 'hiptyc_2020_4k.exr'))
    except Exception as e: say('no map to hold the stars against: %s' % str(e)[:200]); return
    Hh, W = ref.shape[:2]; dev = lambda a: (np.clip(1 - np.exp(-np.maximum(a, 0) * 12.0), 0, 1) ** 0.6 * 255).astype(np.uint8)
    tiles = []
    for lab, ra_h, dec in (('Orion', 5.5, 0), ('the Scorpion and the Archer', 17.6, -30), ('the Great Bear', 12.0, 55)):
        cx, cy = ((180 - ra_h * 15) % 360) / 360 * W, (90 - dec) / 180 * Hh; n = 400; x0, y0 = int(cx - n / 2), int(cy - n / 2)
        crop = dev(np.take(ref[max(0, y0):y0 + n], np.arange(x0, x0 + n) % W, axis=1)); k = 3; im = Image.fromarray(crop).resize((crop.shape[1] * k, crop.shape[0] * k), Image.BICUBIC); d = ImageDraw.Draw(im)
        sel = S['v'] <= 5.0; u = (((180 - S['ra'][sel]) % 360) / 360 * W - x0) % W; v = (90 - S['dec'][sel]) / 180 * Hh - max(0, y0)
        for uu, vv, m in zip(u, v, S['v'][sel]):
            if 0 <= uu < n and 0 <= vv < crop.shape[0]: r = 3 + (5.0 - m) * 2.2; d.ellipse((uu * k - r, vv * k - r, uu * k + r, vv * k + r), outline=(255, 70, 50))
        tiles.append(im)
    sh = Image.new('RGB', (sum(t.size[0] for t in tiles) + 8, max(t.size[1] for t in tiles)), (30, 0, 0)); x = 0
    for t in tiles: sh.paste(t, (x, 0)); x += t.size[0] + 4
    sh.save(os.path.join(OUT, 'planet_sky.jpg'), quality=90); say('planet_sky.jpg: Orion, the Scorpion and the Archer, the Great Bear - NASA\'s map of the Hipparcos and Tycho stars, and a ring from this list for every star to the fifth magnitude')
    # and by numbers: the light of NASA's map within three texels of each of the hundred brightest stars against the same a degree off
    hit = 0; lum = ref @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    for i in range(100):
        uu, vv = int(((180 - S['ra'][i]) % 360) / 360 * W), int((90 - S['dec'][i]) / 180 * Hh)
        if 4 <= vv < Hh - 16: hit += lum[vv - 3:vv + 4, np.arange(uu - 3, uu + 4) % W].max() > 4 * lum[vv + 8:vv + 15, np.arange(uu - 3, uu + 4) % W].max()
    say('  of the hundred brightest stars, %d stand on a light of NASA\'s map' % hit)


os.makedirs(os.path.join(WORK, 'sky'), exist_ok=True); os.makedirs(OUT, exist_ok=True)
say('the sky, pack %s%s: %s' % (H, '' if whole else ' (a trial)', ', '.join(what)))
index = dict(made=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), hash=H); S = glow = None
if 'stars' in what: index['stars'], S = stars()
if 'milkyway' in what: index['milkyway'], glow = milkyway()
if 'moon' in what: index['moon'] = moon()
if 'clouds' in what: index['clouds'] = clouds()
if S is not None: sheet(S)
if not whole: index['partial'] = what
json.dump(index, open(os.path.join(WORK, 'sky', 'index.json'), 'w'))
files = sorted(os.listdir(os.path.join(WORK, 'sky'))); name = 'sky-%s' % H if whole else 'sky-part'
with tarfile.open(os.path.join(OUT, name + '.tar'), 'w') as tar:
    for f in files: tar.add(os.path.join(WORK, 'sky', f), arcname=f)
if whole:
    for f in ('sky-%s.json' % H, 'sky.json'): json.dump(index, open(os.path.join(OUT, f), 'w'))
say('%s.tar: %d files, %.1f MB: %s' % (name, len(files), os.path.getsize(os.path.join(OUT, name + '.tar')) / 1e6, ', '.join('%s %.0f KB' % (f, os.path.getsize(os.path.join(WORK, 'sky', f)) / 1e3) for f in files)))
