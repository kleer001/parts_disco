#!/usr/bin/env python3
"""Solve the semantic colour ramp, and print the numbers that justify it.

The panel needs colours that mean something -- found, last one, miss -- on a board
whose own palette is a puzzle constraint. `src/paint.js` assigns board inks by DSATUR
so that no two touching regions share one, which means no board ink is free to also
carry a meaning. The meanings therefore live on the panel, and they have to clear two
bars at once:

  1. Tell each other apart, including for a viewer with colour vision deficiency.
  2. Not read as a vehicle -- stay away from every ink in `src/layers.js`.

The finding that shapes the ramp: an equal-lightness ramp fails outright. Five roles
placed at one lightness put `found` and `miss` 0.021 apart in OKLab under simulated
deuteranopia, which is the same colour. Lightness has to carry the valence and hue
only confirm it.

Run it to reproduce every figure quoted in `src/juice.js`:

    python3 research/semantic_ramp.py
"""

import math

# ---- sRGB <-> OKLab, Ottosson -------------------------------------------------
M1 = [[0.4122214708, 0.5363325363, 0.0514459929],
      [0.2119034982, 0.6806995451, 0.1073969566],
      [0.0883024619, 0.2817188376, 0.6299787005]]
M2 = [[0.2104542553, 0.7936177850, -0.0040720468],
      [1.9779984951, -2.4285922050, 0.4505937099],
      [0.0259040371, 0.7827717662, -0.8086757660]]
M2_INV = [[1.0, 0.3963377774, 0.2158037573],
          [1.0, -0.1055613458, -0.0638541728],
          [1.0, -0.0894841775, -1.2914855480]]
M1_INV = [[4.0767416621, -3.3077115913, 0.2309699292],
          [-1.2684380046, 2.6097574011, -0.3413193965],
          [-0.0041960863, -0.7034186147, 1.7076147010]]

# ---- CVD simulation, Vienot et al. 1999, via Hunt-Pointer-Estevez LMS ----------
RGB2LMS = [[17.8824, 43.5161, 4.11935],
           [3.45565, 27.1554, 3.86714],
           [0.0299566, 0.184309, 1.46709]]
LMS2RGB = [[0.0809444479, -0.130504409, 0.116721066],
           [-0.0102485335, 0.0540193266, -0.113614708],
           [-0.000365296938, -0.00412161469, 0.693511405]]
PROTAN = [[0, 2.02344, -2.52581], [0, 1, 0], [0, 0, 1]]
DEUTAN = [[1, 0, 0], [0.494207, 0, 1.24827], [0, 0, 1]]
TRITAN = [[1, 0, 0], [0, 1, 0], [-0.395913, 0.801109, 0]]

PANEL = '#FFFFFF'
# Every ink a vehicle or the ground can wear, from src/layers.js.
BOARD = ['#C4553D', '#2F6B6A', '#C08A2E', '#4A6B96',
         '#6D7F52', '#8C5A72', '#9C9384', '#3F4A58']

# Hue, lightness and chroma per role. The lightness order is the whole design:
# miss sits lowest and last sits highest, so the pair a player must never confuse
# is separated by something no colour vision deficiency can take away.
SPEC = {
    'found':  (150, 0.62, 0.170),
    'last':   (75, 0.74, 0.160),
    'quiet':  (255, 0.58, 0.035),
    'target': (300, 0.50, 0.190),
    'miss':   (27, 0.38, 0.170),
}


def mul(m, v):
    return [sum(m[i][j] * v[j] for j in range(3)) for i in range(3)]


def to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def to_srgb(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def hex_to_rgb(h):
    return [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]


def oklch_to_rgb(lightness, chroma, hue):
    a = chroma * math.cos(math.radians(hue))
    b = chroma * math.sin(math.radians(hue))
    lms = mul(M2_INV, [lightness, a, b])
    return [to_srgb(x) for x in mul(M1_INV, [c ** 3 for c in lms])]


def rgb_to_oklab(rgb):
    lms = mul(M1, [to_linear(c) for c in rgb])
    return mul(M2, [x ** (1 / 3) if x >= 0 else -(-x) ** (1 / 3) for x in lms])


def clamp_hex(rgb):
    inside = all(-0.001 <= c <= 1.001 for c in rgb)
    return '#%02X%02X%02X' % tuple(round(max(0, min(1, c)) * 255) for c in rgb), inside


def fit(lightness, chroma, hue):
    """The most chroma sRGB will hold at this lightness and hue, at or below `chroma`."""
    low, high = 0.0, chroma
    for _ in range(24):
        mid = (low + high) / 2
        _, inside = clamp_hex(oklch_to_rgb(lightness, mid, hue))
        low, high = (mid, high) if inside else (low, mid)
    return clamp_hex(oklch_to_rgb(lightness, low, hue))[0]


def relative_luminance(h):
    r, g, b = (to_linear(c) for c in hex_to_rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    x, y = relative_luminance(a), relative_luminance(b)
    return (max(x, y) + 0.05) / (min(x, y) + 0.05)


def simulate(h, matrix):
    if matrix is None:
        return h
    lms = mul(RGB2LMS, [to_linear(c) for c in hex_to_rgb(h)])
    rgb = mul(LMS2RGB, mul(matrix, lms))
    return clamp_hex([to_srgb(max(0, min(1, c))) for c in rgb])[0]


def separation(a, b):
    """Perceptual distance in OKLab. Under 0.05 is the same colour at a glance."""
    la, lb = rgb_to_oklab(hex_to_rgb(a)), rgb_to_oklab(hex_to_rgb(b))
    return math.sqrt(sum((la[i] - lb[i]) ** 2 for i in range(3)))


def build():
    ramp = {}
    for name, (hue, lightness, chroma) in SPEC.items():
        ramp[name] = {
            'tint': fit(0.945, min(0.055, chroma * 0.32), hue),
            'ink': fit(0.415, min(0.13, chroma * 0.80), hue),
            'loud': fit(lightness, chroma, hue),
        }
    return ramp


def main():
    ramp = build()

    print('role     tint     ink      loud      ink/tint  ink/white  loud/white  board')
    for name, role in ramp.items():
        gap = min(separation(role['loud'], ink) for ink in BOARD)
        print(f"{name:8} {role['tint']} {role['ink']} {role['loud']}"
              f"  {contrast(role['ink'], role['tint']):8.2f}"
              f"  {contrast(role['ink'], PANEL):9.2f}"
              f"  {contrast(role['loud'], PANEL):10.2f}  {gap:5.3f}")

    print('\nfound against miss -- the pair that must never collapse:')
    for label, matrix in [('normal', None), ('protanopia', PROTAN),
                          ('deuteranopia', DEUTAN), ('tritanopia', TRITAN)]:
        found = simulate(ramp['found']['loud'], matrix)
        miss = simulate(ramp['miss']['loud'], matrix)
        print(f'  {label:14} {found} vs {miss}   separation {separation(found, miss):.3f}')

    print('\nthe whole loud tier, closest pair per vision type:')
    names = list(ramp)
    for label, matrix in [('normal', None), ('protanopia', PROTAN),
                          ('deuteranopia', DEUTAN), ('tritanopia', TRITAN)]:
        pairs = [(separation(simulate(ramp[a]['loud'], matrix),
                             simulate(ramp[b]['loud'], matrix)), a, b)
                 for i, a in enumerate(names) for b in names[i + 1:]]
        worst, a, b = min(pairs)
        print(f'  {label:14} {a} / {b}   separation {worst:.3f}')

    print('\nWhat a flat ramp would have done -- every role at one lightness:')
    flat = {name: fit(0.585, chroma, hue) for name, (hue, _, chroma) in SPEC.items()}
    found = simulate(flat['found'], DEUTAN)
    miss = simulate(flat['miss'], DEUTAN)
    print(f'  deuteranopia   {found} vs {miss}   separation {separation(found, miss):.3f}')


if __name__ == '__main__':
    main()
