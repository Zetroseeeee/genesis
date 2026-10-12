# A grid of spectrograms, one panel for each call of a gallery (tools/sound/render.js birds | beasts): shots/sound/<name>_grid.png
#   python3 tools/sound/gallery.py birds tit,chiff,cuckoo,...  (the names in the order render.js plays them, 6 s apart from 0.5 s)
import sys, wave, numpy as np
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
name, kinds = sys.argv[1], sys.argv[2].split(',')
w = wave.open(f'shots/sound/{name}.wav'); sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, 2).mean(axis=1) / 32768.0
x = x + np.random.default_rng(1).normal(0, 1e-6, len(x))
cols = 4; rows = (len(kinds) + cols - 1) // cols
fig, axs = plt.subplots(rows, cols, figsize=(4.2 * cols, 2.2 * rows), squeeze=False)
for k, kind in enumerate(kinds):
    ax = axs[k // cols][k % cols]; t0 = 0.5 + 6 * k; seg = x[int(t0 * sr):int((t0 + 6) * sr)]
    ax.specgram(seg, NFFT=512, Fs=sr, noverlap=448, cmap='magma', vmin=-120, vmax=-40, scale='dB'); ax.set_ylim(0, 9000); ax.set_title(kind, fontsize=10, loc='left'); ax.tick_params(labelsize=7)
for k in range(len(kinds), rows * cols): axs[k // cols][k % cols].axis('off')
plt.tight_layout(); plt.savefig(f'shots/sound/{name}_grid.png', dpi=60); print('written', f'shots/sound/{name}_grid.png')
