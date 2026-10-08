#!/usr/bin/env python3
"""How much of the sky the clouds' grain covers.

    python3 tools/planet/grain.py

The cloud shader (src/sky.js) makes heaps of cloud out of the block of noise in the sky's pack (data/sky/noise3.bin,
made by tools/planet/sky.py): a sum of four sizes of it, and a heap wherever the sum is over a threshold. The picture of
the Earth's clouds says how much of the sky is covered at a place; this prints which threshold leaves just so much of the
sum over it (the sum's quantiles, at the places the shader looks them up: points of the shell) and how well the curve
the shader uses for it fits. Run it after changing the block, or the sizes and weights of the sum in the shader, and
put the curve's numbers there (`thr` in SKY.CLOUD_F).
"""
import os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
N = 128
a = np.fromfile(os.path.join(HERE, '..', '..', 'data', 'sky', 'noise3.bin'), dtype=np.uint8).reshape(N, N, N, 2).astype(np.float32) / 255.0
R, G = a[..., 0], a[..., 1]


def straight(T, p):
    """Weighed straight between the eight places about p, as a card does it."""
    st = p * N - 0.5; i = np.floor(st).astype(np.int64); f = (st - i).astype(np.float32); out = 0
    for dz in (0, 1):
        for dy in (0, 1):
            for dx in (0, 1):
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                out = out + w * T[(i[:, 2] + dz) % N, (i[:, 1] + dy) % N, (i[:, 0] + dx) % N]
    return out


def curved(T, p):
    """By a cubic B-spline between sixty-four (grain3 in the shader)."""
    st = p * N - 0.5; i = np.floor(st).astype(np.int64); f = (st - i).astype(np.float32)
    W = lambda f: [(1 - f) ** 3 / 6, (4 - 6 * f * f + 3 * f ** 3) / 6, (1 + 3 * f + 3 * f * f - 3 * f ** 3) / 6, f ** 3 / 6]
    wx, wy, wz = W(f[:, 0]), W(f[:, 1]), W(f[:, 2]); out = 0
    for dz in range(4):
        for dy in range(4):
            for dx in range(4):
                out = out + wx[dx] * wy[dy] * wz[dz] * T[(i[:, 2] + dz - 1) % N, (i[:, 1] + dy - 1) % N, (i[:, 0] + dx - 1) % N]
    return out


rng = np.random.default_rng(5); n = 600000
q = rng.normal(size=(n, 3)); q /= np.linalg.norm(q, axis=1, keepdims=True)
p = q * 318.0                                                    # as the shader: the heaps' size
n1, n0 = curved(R, p), curved(R, p[:, [1, 2, 0]] * 0.23 + 3.7)   # heaps, and the lumps of heaps
n2, n3 = straight(G, p[:, [2, 0, 1]] * 5.03), straight(G, p[:, [1, 2, 0]] * 21.9)   # what eats at their edges
print('the block: mean of the shape %.3f, of what eats at it %.3f (0.5 each: spread evenly)' % (R.mean(), G.mean()))
print('spread: heaps by the curve %.4f, straight %.4f; lumps %.4f; edges %.4f and %.4f' % (n1.std(), straight(R, p).std(), n0.std(), n2.std(), n3.std()))
fs = np.array([0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.78, 0.9, 0.95, 0.98])
curve = lambda f: 0.35 + 0.72 * (0.5 - f) + 2.8 * (0.5 - f) ** 5      # thr in the shader


def show(name, m):
    qs = np.quantile(m, 1 - fs)
    print(name); print('   share of the sky  ' + ' '.join('%6.2f' % v for v in fs)); print('   threshold for it  ' + ' '.join('%6.3f' % v for v in qs))
    print('   the curve gives   ' + ' '.join('%6.3f' % curve(v) for v in fs)); print('   which leaves      ' + ' '.join('%6.3f' % (m > curve(v)).mean() for v in fs))


show('the whole sum (seen from under or over)', 0.72 * n1 + 0.28 * n0 - 0.22 * (1 - n2) - 0.08 * (1 - n3))
show('with the edges gone to their mean (seen from the side, or from far)', 0.72 * n1 + 0.28 * n0 - 0.15)
