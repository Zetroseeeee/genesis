# Piano rolls of pieces rendered by tools/sound/music.js: every part's notes through time (the lead red, the figure blue, what is held
# green, the bass orange, the beat white at the bottom, the colour magenta), into shots/sound/music/rolls.png
#   python3 tools/sound/roll.py names...
import sys, os, json
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
D = 'shots/sound/music'; names = sys.argv[1:]
fig, axs = plt.subplots(len(names), 1, figsize=(18, 3.2 * len(names)), squeeze=False)
col = {'lead': 'red', 'fig': 'deepskyblue', 'hold': 'limegreen', 'bass': 'orange', 'beat': 'white', 'colour': 'magenta'}
for ax, n in zip(axs[:, 0], names):
    d = json.load(open(os.path.join(D, n + '.json'))); I = d['info']; E = I['ens']
    for t, inst, m, du, a, role in d['ev']:
        y = 30 + m * 2 if role == 'beat' else m
        ax.plot([t, t + (0.1 if role == 'beat' else du)], [y, y], color=col.get(role, 'gray'), lw=1 + 3 * a, solid_capstyle='butt')
    ax.set_facecolor('black'); ax.set_xlim(0, I['length']); ax.set_ylim(25, 100)
    ax.set_title(f"{n}: {I['bpm']:.0f} a minute in {I['meter']}, key {I['key']}: {E['lead']} / {E.get('fig')} / {E.get('hold')} / {E.get('bass')} / {E.get('beat')} / {E.get('colour')}", loc='left', fontsize=9)
plt.tight_layout(); plt.savefig(os.path.join(D, 'rolls.png'), dpi=60); print('written', os.path.join(D, 'rolls.png'))
