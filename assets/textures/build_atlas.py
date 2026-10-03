# GENESIS atlas builder: runs in the Higgsfield sandbox (Pillow + numpy). Reads stems.txt (lines: group idx stem),
# downloads each generated 2k tile, measures seams, makes it tileable (offset cross-fade with a band sized by the
# measured seam), packs 16 per group into a 2048x2048 WebP atlas (4x4 cells of 512), and resizes the UI art.
import os, sys, json, subprocess, numpy as np
from PIL import Image
CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3EdDR1X9D9foMDc9Ifvh8eZytCQ/hf_'
CELL = 512; N = 4
rows = [l.split() for l in open('stems.txt') if l.strip()]
os.makedirs('src', exist_ok=True); os.makedirs('out', exist_ok=True)
# ---- download (8 in parallel) ----
todo = [(g, i, s) for g, i, s in rows if not os.path.exists(f'src/{g}_{i}.png')]
procs = []
for g, i, s in todo:
    procs.append(subprocess.Popen(['curl', '-sS', '-o', f'src/{g}_{i}.png', CDN + s + '.png']))
    if len(procs) >= 8:
        for p in procs: p.wait()
        procs = []
for p in procs: p.wait()
bad = [(g, i) for g, i, s in rows if os.path.getsize(f'src/{g}_{i}.png') < 100000]
print('downloaded', len(rows), 'missing/short:', bad, flush=True)

def seam_stats(a):
    h, w, _ = a.shape
    lr = np.abs(a[:, 0] - a[:, -1]).mean(); tb = np.abs(a[0] - a[-1]).mean()
    adj = 0.5 * (np.abs(a[:, 1:] - a[:, :-1]).mean() + np.abs(a[1:] - a[:-1]).mean())
    return lr, tb, adj

def ramp(n, t):
    d = np.minimum(np.arange(n), n - 1 - np.arange(n)) / n
    r = np.clip(1 - d / t, 0, 1)
    return r * r * (3 - 2 * r)

def seamless(a, bx, by):
    h, w, _ = a.shape
    b = np.roll(a, (h // 2, w // 2), axis=(0, 1))
    wgt = np.maximum(ramp(h, by)[:, None], ramp(w, bx)[None, :])[..., None]
    return a * (1 - wgt) + b * wgt

def period(a):
    # dominant repeat count along x and y (3..120 cycles per tile) from the mean luminance profile
    g = a.mean(2); out = []
    for prof in (g.mean(0), g.mean(1)):
        p = prof - prof.mean(); f = np.abs(np.fft.rfft(p)); f[:3] = 0; f[121:] = 0
        k = int(f.argmax()); out.append((k, float(f[k] / (f.sum() + 1e-6))))
    return out

report = {}
atlases = {}
for g, i, s in rows:
    i = int(i)
    im = Image.open(f'src/{g}_{i}.png').convert('RGB').resize((1024, 1024), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    lr, tb, adj = seam_stats(a)
    rx = lr / max(adj, 0.5); ry = tb / max(adj, 0.5)
    bx = float(np.clip(0.02 + 0.03 * (rx - 1), 0.025, 0.12)); by = float(np.clip(0.02 + 0.03 * (ry - 1), 0.025, 0.12))
    if g == 'misc' and i == 2: bx = by = 0.12              # clouds: soft blend is invisible
    b = seamless(a, bx, by)
    lr2, tb2, adj2 = seam_stats(b)
    (kx, px), (ky, py) = period(a)
    tile = Image.fromarray(np.clip(b + 0.5, 0, 255).astype(np.uint8)).resize((CELL, CELL), Image.LANCZOS)
    if g not in atlases: atlases[g] = Image.new('RGB', (CELL * N, CELL * N), (0, 0, 0))
    atlases[g].paste(tile, ((i % N) * CELL, (i // N) * CELL))
    report[f'{g}_{i}'] = dict(seam=[round(lr, 1), round(tb, 1)], adj=round(adj, 1), band=[round(bx, 3), round(by, 3)], after=[round(lr2, 1), round(tb2, 1)], cyc=[kx, ky], cycw=[round(px, 2), round(py, 2)], mean=[int(x) for x in a.mean((0, 1))])
    print(f'{g}_{i}: seam {lr:.1f}/{tb:.1f} adj {adj:.1f} band {bx:.3f}/{by:.3f} -> {lr2:.1f}/{tb2:.1f} cyc {kx}x{ky} ({px:.2f},{py:.2f})', flush=True)
for g, A in atlases.items():
    A.save(f'out/genesis_atlas_{g}.webp', 'WEBP', quality=90, method=6)
    print(g, os.path.getsize(f'out/genesis_atlas_{g}.webp'), flush=True)
json.dump(report, open('out/report.json', 'w'))
# ---- UI art ----
ui = [l.split() for l in open('ui.txt') if l.strip()]
procs = []
for name, s in ui:
    if not os.path.exists(f'src/ui_{name}.png'):
        procs.append(subprocess.Popen(['curl', '-sS', '-o', f'src/ui_{name}.png', CDN + s + '.png']))
    if len(procs) >= 8:
        for p in procs: p.wait()
        procs = []
for p in procs: p.wait()
for name, s in ui:
    im = Image.open(f'src/ui_{name}.png').convert('RGB')
    W = 512 if name.startswith('card') else 1600 if name.startswith('era') else 1920 if name == 'hero' else 1280
    im = im.resize((W, max(1, round(im.height * W / im.width))), Image.LANCZOS)
    im.save(f'out/ui_{name}.webp', 'WEBP', quality=82, method=6)
    print(name, im.size, os.path.getsize(f'out/ui_{name}.webp'), flush=True)
print('DONE', flush=True)
