#!/usr/bin/env python3
"""Bake `dev/juice.html` into one self-contained page.

The sandbox reaches for `../src/*.js` as ES modules, for 96 view files, and for a
font. A published page has none of that: it is one file, and every relative path in
it resolves to nothing. So this script inlines all of it and rewrites the two places
that fetch.

The output is a build. Edit `dev/juice.html` or anything in `src/`, then run this
again -- never edit the baked file, because the next run overwrites it.

    python3 dev/build_artifact.py            # writes tmp/juice-artifact.html
    python3 dev/build_artifact.py <path>
"""

import base64
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Dependency order. A module may only name things defined above it, which is what
# lets the imports be deleted rather than resolved.
MODULES = [
    'src/rng.js',
    'src/geometry.js',
    'src/compositor.js',
    'src/views.js',
    'src/board.js',
    'src/paint.js',
    'src/game.js',
    'src/levels.js',
    'src/juice.js',
    'src/layers.js',
]

IMPORT = re.compile(r'^import\s+\{[^}]*\}\s+from\s+[\'"][^\'"]+[\'"];\s*$',
                    re.MULTILINE | re.DOTALL)


def flatten(path):
    """One module with its imports and its `export` keywords removed.

    Only the two forms `src/` actually uses are handled. Anything else -- a default
    import, a namespace import, `export default`, a re-export -- would pass straight
    through and produce a published page that throws on load, so the leftovers are
    an error here rather than a surprise for whoever opens the artifact.
    """
    text = (ROOT / path).read_text()
    text = IMPORT.sub('', text)
    text = re.sub(r'^export\s+(?=(?:async\s+)?(?:const|function|let|class)\b)', '',
                  text, flags=re.MULTILINE)
    left = [line for line in text.splitlines()
            if re.match(r'\s*(import|export)\b', line)]
    if left:
        raise SystemExit(f'{path}: module syntax this script cannot flatten:\n  '
                         + '\n  '.join(left))
    return f'/* ---- {path} ---- */\n{text.strip()}\n'


def views_blob():
    """Every view file, keyed by the path `loadViews` would have fetched."""
    out = {}
    base = ROOT / 'assets/views'
    for file in sorted(base.rglob('*.json')):
        out[str(file.relative_to(base))] = json.loads(file.read_text())
    return out


def prompts_blob():
    """Every solid render, as a data URI, keyed the way `promptFor` names it."""
    out = {}
    base = ROOT / 'assets/views'
    for file in sorted(base.rglob('*.png')):
        raw = base64.b64encode(file.read_bytes()).decode()
        out[str(file.relative_to(base))] = f'data:image/png;base64,{raw}'
    return out


def main():
    target = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 \
        else ROOT / 'tmp/juice-artifact.html'
    page = (ROOT / 'dev/juice.html').read_text()

    # The script block, with the module imports replaced by the flattened modules.
    body = page.split('<script type="module">')[1].rsplit('</script>', 1)[0]
    body = IMPORT.sub('', body)

    # `loadViews` fetches, and the panel points an <img> at a file. Neither can
    # happen here, so both are answered from the blobs baked in above.
    body = body.replace(
        "const views = await loadViews('../assets/views');",
        'const views = loadBakedViews();')

    bundle = '\n'.join(flatten(m) for m in MODULES)
    font = base64.b64encode(
        (ROOT / 'assets/fonts/vt323-latin.woff2').read_bytes()).decode()

    head = page.split('<script type="module">')[0]
    head = head.replace(
        'src: url("../assets/fonts/vt323-latin.woff2") format("woff2");',
        f'src: url("data:font/woff2;base64,{font}") format("woff2");')
    # The published page is named for the game, not for the file it was built from.
    head = head.replace(
        '<title>parts disco — juice sandbox</title>',
        '<title>Parts Disco Juice Bench</title>')
    head = head.replace(
        '<p class="lede">',
        '<p class="lede"><strong>A baked copy of the local sandbox.</strong> '
        'Everything runs in this page. ')
    # The markup is escaped to ASCII so the dashes and arrows read the same however
    # the file is served. The charset declaration stays for the same reason: the
    # bundled modules carry UTF-8 in their comments and in the readout separator.
    head = head.encode('ascii', 'xmlcharrefreplace').decode()

    shim = f'''
/* ---- baked assets -------------------------------------------------------- */
const BAKED_VIEWS = {json.dumps(views_blob(), separators=(",", ":"))};
const BAKED_PROMPTS = {json.dumps(prompts_blob(), separators=(",", ":"))};

// The same shape `loadViews` returns, answered from the blobs rather than the
// network. It throws on a missing view for the same reason the original does.
function loadBakedViews() {{
  const manifest = BAKED_VIEWS['manifest.json'];
  const key = (model, angle) => `${{model}}/${{String(angle).padStart(3, '0')}}`;
  return {{
    models: manifest.models,
    view(model, angle) {{
      const found = BAKED_VIEWS[`${{key(model, angle)}}.json`];
      if (!found) throw new Error(`no view ${{model}} at ${{angle}}`);
      return found;
    }},
    promptFor(model, angle) {{
      const found = BAKED_PROMPTS[`${{key(model, angle)}}.png`];
      if (!found) throw new Error(`no render ${{model}} at ${{angle}}`);
      return found;
    }},
    anglesOf(model) {{
      const found = manifest.models.find((m) => m.name === model);
      if (!found) throw new Error(`no model ${{model}}`);
      return found.angles;
    }},
  }};
}}
'''

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        head
        + '<script type="module">\n'
        + bundle + shim + body
        + '</script>\n')
    size = target.stat().st_size / 1048576
    print(f'{target}  {size:.2f} MB')


if __name__ == '__main__':
    main()
