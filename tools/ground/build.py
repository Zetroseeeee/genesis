#!/usr/bin/env python3
"""Packs the ground's materials (assets/ground/materials.json) into what the game loads.

For every layer: the material's colours, its normal map and its heights are fetched from the library it comes from
(Poly Haven or ambientCG, both public domain, CC0), brought to one size without losing their seamless edges, and laid
into two atlases of cols x rows cells:

    out/ground_albedo.jpg    the colours, with a share of the material's own shade (ambient occlusion) in them
    out/ground_normal.jpg    red and green: the normal map as the libraries give it (OpenGL: green is up the picture);
                             blue: the heights, stretched to the full range (for blending one material into another)
    out/ground.json          what the game needs to know: the cells, each layer's two sizes in the world, its mean colour
    out/ground_sheet.jpg     a sheet to look at: every layer's colours, relief and heights side by side

Run by the Ground workflow (the workspace cannot reach the libraries; GitHub can), which keeps the four files in the
"ground" release; tools/ground/fetch.mjs brings them into data/tex/.  LOCAL=<dir> packs from files already on disk
(<dir>/<asset>_albedo.png, _normal.png, _height.png, _ao.png: for trying the packing itself without the network).
"""
import io, json, os, sys, time, urllib.request, zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UA = {'User-Agent': 'holocene-game-assets/1.0 (+https://github.com/Zetroseeeee/genesis)'}
RES = os.environ.get('RES', '2k')          # what is fetched (the cells are smaller: detail is kept through the resize)
LOCAL = os.environ.get('LOCAL', '')
Image.MAX_IMAGE_PIXELS = None


def get(url, tries=4):
    last = None
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r: return r.read()
        except Exception as e:
            last = e; time.sleep(2 + 3 * k)
    raise RuntimeError(f'{url}: {last!r}')


def pick(d, names):
    """the first of several spellings a library uses for one map"""
    low = {k.lower(): k for k in d}
    for n in names:
        if n.lower() in low: return d[low[n.lower()]]
    return None


def best(entry):
    """a map at the wanted size, as JPEG if there is one"""
    if not entry: return None
    by = entry.get(RES) or entry.get('2k') or entry.get('1k') or next(iter(entry.values()))
    f = by.get('jpg') or by.get('png') or next(iter(by.values()))
    return f.get('url')


def from_polyhaven(asset):
    files = json.loads(get(f'https://api.polyhaven.com/files/{asset}'))
    urls = {'albedo': best(pick(files, ['Diffuse', 'diff', 'Color', 'col', 'albedo', 'BaseColor'])), 'normal': best(pick(files, ['nor_gl', 'Normal', 'nor'])),
            'height': best(pick(files, ['Displacement', 'disp', 'Height'])), 'ao': best(pick(files, ['AO', 'ambient occlusion', 'AmbientOcclusion'])), 'arm': best(pick(files, ['arm']))}
    if not urls['albedo'] or not urls['normal']: raise RuntimeError(f'{asset}: maps are {sorted(files.keys())}')
    out = {k: Image.open(io.BytesIO(get(u))) for k, u in urls.items() if u and k != 'arm'}
    if 'ao' not in out and urls['arm']: out['ao'] = Image.open(io.BytesIO(get(urls['arm']))).convert('RGB').split()[0]      # (packed: occlusion, roughness, metal)
    return out


def from_ambientcg(asset):
    z = zipfile.ZipFile(io.BytesIO(get(f'https://ambientcg.com/get?file={asset}_{RES.upper()}-JPG.zip')))
    names = z.namelist(); out = {}
    for key, ends in (('albedo', ['_Color.']), ('normal', ['_NormalGL.']), ('height', ['_Displacement.']), ('ao', ['_AmbientOcclusion.'])):
        hit = [n for n in names if any(e in n for e in ends)]
        if hit: out[key] = Image.open(io.BytesIO(z.read(hit[0])))
    if 'albedo' not in out or 'normal' not in out: raise RuntimeError(f'{asset}: the archive holds {names}')
    return out


def from_local(asset):
    out = {}
    for key in ('albedo', 'normal', 'height', 'ao'):
        p = os.path.join(LOCAL, f'{asset}_{key}.png')
        if os.path.exists(p): out[key] = Image.open(p)
    return out


def square(im):
    w, h = im.size
    if w == h: return im
    s = min(w, h); print('   (not square:', im.size, '- the middle is taken, and its edges will not meet)')
    return im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))


def fit(im, size, mode):
    """to one size, wrapping round its edges while it is made smaller, so that the cell still repeats without a seam"""
    im = square(im.convert(mode)); w = im.size[0]
    if w == size: return im
    pad = max(8, w // 32); big = Image.new(mode, (w + 2 * pad, w + 2 * pad))
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1): big.paste(im, (pad + dx * w, pad + dy * w))
    s = size / w; p = round(pad * s); out = big.resize((size + 2 * p, size + 2 * p), Image.LANCZOS)
    return out.crop((p, p, p + size, p + size))


def layer(spec, cell):
    asset = spec['asset']
    maps = from_local(asset) if LOCAL else (from_polyhaven if spec.get('from', 'polyhaven') == 'polyhaven' else from_ambientcg)(asset)
    alb = np.asarray(fit(maps['albedo'], cell, 'RGB'), dtype=np.float32) / 255.0
    nor = np.asarray(fit(maps['normal'], cell, 'RGB'), dtype=np.float32) / 255.0
    if 'height' in maps:
        hm = maps['height']
        if hm.mode in ('I;16', 'I', 'F'): a = np.asarray(hm, dtype=np.float32); a = (a - a.min()) / max(1e-6, float(a.max() - a.min())); hm = Image.fromarray((a * 255).astype(np.uint8))
        hgt = np.asarray(fit(hm, cell, 'L'), dtype=np.float32) / 255.0
    else: hgt = alb.mean(axis=2)                                                         # (no heights: the brighter stands higher, near enough)
    lo, hi = np.percentile(hgt, 1), np.percentile(hgt, 99); hgt = np.clip((hgt - lo) / max(1e-4, hi - lo), 0, 1)
    if 'ao' in maps:
        ao = np.asarray(fit(maps['ao'], cell, 'L'), dtype=np.float32) / 255.0
        alb = alb * (1 - float(spec.get('ao', 0.5)) * (1 - ao))[..., None]
    # colours: brightness, how strong they are, warmer or cooler
    g = float(spec.get('gain', 1)); s = float(spec.get('sat', 1)); warm = float(spec.get('warm', 0))
    lum = (alb * np.array([0.299, 0.587, 0.114], dtype=np.float32)).sum(axis=2, keepdims=True)
    alb = np.clip((lum + (alb - lum) * s) * g * np.array([1 + warm, 1, 1 - warm], dtype=np.float32), 0, 1)
    k = float(spec.get('relief', 1)); nxy = np.clip(0.5 + (nor[..., :2] - 0.5) * k, 0, 1)
    packed = np.dstack([nxy, hgt[..., None]])
    info = {'mean': [round(float(v), 4) for v in alb.reshape(-1, 3).mean(axis=0)], 'rough': round(float(np.abs(nxy - 0.5).mean() * 2), 4), 'maps': sorted(maps.keys())}
    return (alb * 255 + 0.5).astype(np.uint8), (packed * 255 + 0.5).astype(np.uint8), info


def main():
    man = json.load(open(os.path.join(ROOT, 'assets/ground/materials.json'))); cell, cols, rows = man['cell'], man['cols'], man['rows']
    os.makedirs('out', exist_ok=True)
    A = np.zeros((rows * cell, cols * cell, 3), np.uint8); N = np.zeros_like(A); N[..., 0:2] = 128; layers = []; failed = []
    for k, spec in enumerate(man['layers'][:cols * rows]):
        y, x = (k // cols) * cell, (k % cols) * cell
        try:
            a, n, info = layer(spec, cell); A[y:y + cell, x:x + cell] = a; N[y:y + cell, x:x + cell] = n
            print(f"{k:2d} {spec['id']:<12} {spec.get('from', 'polyhaven')}/{spec['asset']:<28} mean {info['mean']} relief {info['rough']} maps {','.join(info['maps'])}")
        except Exception as e:
            info = {'mean': [0.5, 0.5, 0.5], 'failed': repr(e)[:300]}; failed.append(spec['id']); A[y:y + cell, x:x + cell] = 128; print(f"{k:2d} {spec['id']:<12} FAILED {e!r}"[:400])
        layers.append({'id': spec['id'], 'near': spec.get('near', 12), 'far': spec.get('far', 96), 'from': spec.get('from', 'polyhaven'), 'asset': spec['asset'], **info})
    Image.fromarray(A).save('out/ground_albedo.jpg', quality=90, subsampling=0, optimize=True)
    Image.fromarray(N).save('out/ground_normal.jpg', quality=93, subsampling=0, optimize=True)
    made = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    json.dump({'_doc': 'The ground\'s materials, packed by tools/ground/build.py from assets/ground/materials.json. Public domain (CC0): polyhaven.com, ambientcg.com.', 'made': made, 'cell': cell, 'cols': cols, 'rows': rows,
               'albedo': 'ground_albedo.jpg', 'normal': 'ground_normal.jpg', 'layers': layers}, open('out/ground.json', 'w'), indent=1)
    # the sheet: colours, relief, heights of each layer, small
    t = 240; gap = 8; lab = 22
    try: font = ImageFont.load_default(size=15)
    except TypeError: font = ImageFont.load_default()
    sheet = Image.new('RGB', (4 * (3 * t + gap) + gap, 4 * (t + lab + gap) + gap), (26, 26, 26)); dr = ImageDraw.Draw(sheet)
    for k, L in enumerate(layers):
        y, x = (k // cols) * cell, (k % cols) * cell; sx = gap + (k % 4) * (3 * t + gap); sy = gap + (k // 4) * (t + lab + gap)
        a = Image.fromarray(A[y:y + cell, x:x + cell]).resize((t, t), Image.LANCZOS); n = Image.fromarray(np.dstack([N[y:y + cell, x:x + cell, 0:2], np.full((cell, cell, 1), 255, np.uint8)])).resize((t, t), Image.LANCZOS); h = Image.fromarray(N[y:y + cell, x:x + cell, 2]).resize((t, t), Image.LANCZOS).convert('RGB')
        sheet.paste(a, (sx, sy)); sheet.paste(n, (sx + t, sy)); sheet.paste(h, (sx + 2 * t, sy))
        dr.text((sx + 2, sy + t + 2), f"{k} {L['id']}: {L['asset']}  {L['near']}/{L['far']} m" + ('  FAILED' if 'failed' in L else ''), fill=(235, 235, 235), font=font)
    sheet.save('out/ground_sheet.jpg', quality=86)
    for f in sorted(os.listdir('out')): print(' ', f, os.path.getsize(os.path.join('out', f)))
    if failed: print('FAILED:', ', '.join(failed)); sys.exit(0 if os.environ.get('KEEP_GOING') else 1)


if __name__ == '__main__':
    main()
