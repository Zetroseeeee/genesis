# Pictures of rendered sound (tools/sound/render.js): for each shots/sound/<name>.wav, how loud through time and a spectrogram, into
# shots/sound/<name>.png; with several names, one sheet of them all (shots/sound/sheet.png).
#   python3 tools/sound/sheet.py [names]
import sys, os, wave, numpy as np
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from scipy.signal import lfilter
D = os.environ.get('DIR', 'shots/sound')      # (DIR=shots/sound/music for the pieces of music.js)
# loudness as ITU-R BS.1770 has it (LUFS): the K-weighting (a shelf that hears the highs 4 dB louder, a high-pass under 38 Hz), the
# mean square over 400 ms blocks a quarter apart, gated; and the short-term loudness (3 s) at its loudest and its quietest tenth
def kweight(x, fs):
    def shelf(G, Q, fc):
        A = 10 ** (G / 40); w = 2 * np.pi * fc / fs; al = np.sin(w) / (2 * Q); c = np.cos(w); r = 2 * np.sqrt(A) * al
        return [A * ((A + 1) + (A - 1) * c + r), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - r)], [(A + 1) - (A - 1) * c + r, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - r]
    def hpf(Q, fc):
        w = 2 * np.pi * fc / fs; al = np.sin(w) / (2 * Q); c = np.cos(w)
        return [(1 + c) / 2, -(1 + c), (1 + c) / 2], [1 + al, -2 * c, 1 - al]
    b, a = shelf(3.99984385397, 0.7071752369554193, 1681.9744509555319); x = lfilter(b, a, x, axis=0)
    b, a = hpf(0.5003270373253953, 38.13547087613982); return lfilter(b, a, x, axis=0)
def loudness(x, fs):
    y = kweight(x, fs); ms = lambda s: np.sum(np.mean(s ** 2, axis=0))
    blk, hop = int(0.4 * fs), int(0.1 * fs)
    z = np.array([ms(y[i:i + blk]) for i in range(0, len(y) - blk, hop)]) + 1e-15
    lk = -0.691 + 10 * np.log10(z); g = z[lk > -70]
    if not len(g): return -99, -99, -99
    rel = -0.691 + 10 * np.log10(np.mean(g)) - 10; g2 = z[(lk > -70) & (lk > rel)]
    integ = -0.691 + 10 * np.log10(np.mean(g2)) if len(g2) else -99
    st = np.array([-0.691 + 10 * np.log10(ms(y[i:i + 3 * fs]) + 1e-15) for i in range(0, max(1, len(y) - 3 * fs), hop * 5)])
    return integ, st.max(), np.percentile(st, 10)
names = sys.argv[1:] or sorted(f[:-4] for f in os.listdir(D) if f.endswith('.wav'))
def load(n):
    w = wave.open(os.path.join(D, n + '.wav')); sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, 2) / 32768.0
    return sr, x
fig, axs = plt.subplots(len(names), 1, figsize=(16, 2.6 * len(names)), squeeze=False)
for ax, n in zip(axs[:, 0], names):
    sr, x = load(n); m = x.mean(axis=1)
    I, smax, slo = loudness(x, sr); pk = 20 * np.log10(np.max(np.abs(x)) + 1e-9)
    print(f'{n:18s} {I:6.1f} LUFS   short-term {smax:6.1f} .. {slo:6.1f}   peak {pk:5.1f} dBFS')
    ax.specgram(m, NFFT=1024, Fs=sr, noverlap=768, cmap='magma', vmin=-130, vmax=-30, scale='dB')
    ax.set_ylim(0, 12000); ax.set_title(f'{n}   {I:.1f} LUFS  (short-term {smax:.1f} .. {slo:.1f})', loc='left', fontsize=10)
    hop = sr // 20; e = np.array([np.sqrt(np.mean(m[i:i + hop] ** 2) + 1e-12) for i in range(0, len(m) - hop, hop)])
    ax2 = ax.twinx(); ax2.plot(np.arange(len(e)) / 20, 20 * np.log10(e), color='cyan', lw=0.8); ax2.set_ylim(-80, 0); ax2.set_ylabel('dB', color='cyan')
plt.tight_layout(); plt.savefig(os.path.join(D, 'sheet.png' if len(names) > 1 else names[0] + '.png'), dpi=70)
print('written', os.path.join(D, 'sheet.png' if len(names) > 1 else names[0] + '.png'))
