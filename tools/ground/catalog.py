#!/usr/bin/env python3
"""What the free material libraries have for the ground to be made of.

Lists the materials a library offers for a search, with their sizes in the world and the maps they come with, and lays
their previews out on one sheet with the names under them: out/<name>.json and out/<name>.jpg. Run by the Materials
workflow (the workspace cannot reach these hosts; GitHub can), which keeps both in the "peek" release:

    tools/materials.sh <name> polyhaven "terrain"            Poly Haven: categories, comma separated (all must fit)
    tools/materials.sh <name> ambientcg "grass"              ambientCG: search words

Both libraries give their work to the public domain (CC0): polyhaven.com/license, docs.ambientcg.com/license.
"""
import io, json, os, sys, urllib.parse, urllib.request

NAME = os.environ.get('NAME', 'materials'); SOURCE = os.environ.get('SOURCE', 'polyhaven'); QUERY = os.environ.get('QUERY', '').strip()
LIMIT = int(os.environ.get('LIMIT', '60') or 60); TILE = int(os.environ.get('SIZE', '256') or 256); COLS = int(os.environ.get('COLS', '8') or 8)
UA = {'User-Agent': 'holocene-game-assets/1.0 (+https://github.com/Zetroseeeee/genesis)'}


def get(url, raw=False):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        data = r.read()
    return data if raw else json.loads(data)


def polyhaven():
    cats = [c.strip() for c in QUERY.split(',') if c.strip()]
    url = 'https://api.polyhaven.com/assets?t=textures' + ('&c=' + urllib.parse.quote(','.join(cats)) if cats else '')
    found = get(url); out = []
    for key, a in found.items():
        out.append({'id': key, 'name': a.get('name'), 'cats': a.get('categories'), 'tags': a.get('tags'), 'size_m': [round(v / 1000, 2) for v in (a.get('dimensions') or [])][:2],
                    'taken': a.get('download_count', 0), 'thumb': (a.get('thumbnail_url') or '').split('?')[0] + f'?width={TILE}&height={TILE}', 'maps': None})
    out.sort(key=lambda m: -m['taken'])
    return out[:LIMIT], {'url': url, 'found': len(found), 'sample': next(iter(found.values()), None)}


def ambientcg():
    url = 'https://ambientcg.com/api/v2/full_json?type=Material&sort=Popular&limit=' + str(LIMIT) + '&include=tagData,dimensionsData,imageData,downloadData,mapData&q=' + urllib.parse.quote(QUERY)
    j = get(url); out = []; found = j.get('foundAssets') or []
    for a in found:
        imgs = a.get('previewImage') or {}; thumb = imgs.get('256-PNG') or imgs.get('512-PNG') or imgs.get('256-JPG-FFFFFF') or next(iter(imgs.values()), '')
        kinds = []
        try:
            for folder in (a.get('downloadFolders') or {}).values():
                for cat in (folder.get('downloadFiletypeCategories') or {}).values():
                    for d in cat.get('downloads') or []: kinds.append(d.get('attribute'))
        except Exception as e: kinds = ['?' + str(e)]
        out.append({'id': a.get('assetId'), 'name': a.get('displayName'), 'cats': [a.get('displayCategory')], 'tags': a.get('tags'), 'size_m': [round((a.get('dimensionX') or 0) / 100, 2), round((a.get('dimensionY') or 0) / 100, 2)],
                    'taken': a.get('downloadCount', 0), 'thumb': thumb, 'maps': a.get('maps'), 'kinds': sorted(set(k for k in kinds if k))[:12]})
    sample = dict(found[0]) if found else None
    if sample:
        for k in ('downloadFolders',): sample[k] = str(sample.get(k))[:600]
    return out, {'url': url, 'found': j.get('numberOfResults'), 'sample': sample}


def sheet(items):
    from PIL import Image, ImageDraw, ImageFont
    try: font = ImageFont.load_default(size=15)
    except TypeError: font = ImageFont.load_default()
    gap, label = 10, 40; rows = (len(items) + COLS - 1) // COLS
    im = Image.new('RGB', (COLS * (TILE + gap) + gap, max(1, rows) * (TILE + label + gap) + gap), (28, 28, 28)); dr = ImageDraw.Draw(im)
    for k, m in enumerate(items):
        x = gap + (k % COLS) * (TILE + gap); y = gap + (k // COLS) * (TILE + label + gap)
        try:
            t = Image.open(io.BytesIO(get(m['thumb'], raw=True))).convert('RGBA'); bg = Image.new('RGBA', t.size, (60, 60, 60, 255)); bg.alpha_composite(t); t = bg.convert('RGB'); t.thumbnail((TILE, TILE), Image.LANCZOS)
            im.paste(t, (x + (TILE - t.width) // 2, y + (TILE - t.height) // 2))
        except Exception as e:
            dr.rectangle([x, y, x + TILE, y + TILE], outline=(120, 60, 60)); dr.text((x + 6, y + 6), str(e)[:40], fill=(200, 120, 120), font=font)
        dr.text((x, y + TILE + 2), str(m['id'])[:34], fill=(240, 240, 240), font=font)
        dr.text((x, y + TILE + 20), ('%s m' % 'x'.join(str(v) for v in m['size_m']) if m.get('size_m') else '') + '  ' + ' '.join((m.get('cats') or [])[:3])[:24], fill=(160, 160, 160), font=font)
    return im


def main():
    os.makedirs('out', exist_ok=True)
    items, note = (polyhaven if SOURCE == 'polyhaven' else ambientcg)()
    json.dump({'source': SOURCE, 'query': QUERY, 'note': note, 'materials': items}, open(f'out/{NAME}.json', 'w'), indent=1, default=str)
    print(f'{len(items)} materials from {SOURCE} for "{QUERY}" (of {note.get("found")})')
    for m in items[:200]: print(' ', m['id'], m.get('size_m'), (m.get('cats') or [])[:4])
    sheet(items).save(f'out/{NAME}.jpg', quality=86)


if __name__ == '__main__':
    try: main()
    except Exception as e:
        os.makedirs('out', exist_ok=True); open(f'out/{NAME}.json', 'w').write(json.dumps({'error': repr(e), 'source': SOURCE, 'query': QUERY})); print('FAILED', repr(e)); sys.exit(0 if os.environ.get('KEEP_GOING') else 1)
