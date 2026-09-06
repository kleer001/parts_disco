// Placeholder part outlines, as unit polygons centred on the origin.
//
// These stand in for traced patent figures. They exist so the loop — drift,
// occlusion, prompt, click — can be played and judged before a single figure has
// been cropped and tagged, because the fun of the search is a separate question
// from the quality of the line art.
//
// Data, not logic: each entry is a name and the numbers its outline is built from.
// The builders below only turn those numbers into points.

const TAU = Math.PI * 2;

/** A cog. Each tooth is a flat-topped trapezoid, which is what reads as a gear
 *  rather than a star: alternating two radii alone gives spikes. */
function gear({ teeth, tip, root, land }) {
  const points = [];
  const pitch = TAU / teeth;
  // Within one pitch: up the flank, across the tip, down the flank, along the root.
  const profile = [[0, root], [land, tip], [0.5 - land, tip], [0.5, root]];
  for (let i = 0; i < teeth; i++) {
    for (const [fraction, radius] of profile) {
      const angle = (i + fraction) * pitch;
      points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
  }
  return points;
}

/** A closed circle, as a polygon fine enough to click accurately. */
function disc({ radius, sides }) {
  return Array.from({ length: sides }, (_, i) => {
    const angle = (i / sides) * TAU;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
}

/** A disc cut by a keyway, so it does not read as every other circle on the board. */
function keyedDisc({ radius, sides, keyway }) {
  const points = disc({ radius, sides });
  const notch = [
    [radius - keyway, -keyway / 2], [radius - keyway * 2, 0], [radius - keyway, keyway / 2],
  ];
  return [...points.slice(0, 1), ...notch, ...points.slice(1)];
}

/** Two eyes joined by a tapering shank — a connecting rod in silhouette. */
function rod({ length, bigEnd, smallEnd, steps }) {
  const half = length / 2;
  const arc = (cx, radius, from) =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const angle = from + (i / steps) * Math.PI;
      return [cx + Math.cos(angle) * radius, Math.sin(angle) * radius];
    });
  // Down the far side of the big end, along to the small end, and back.
  return [...arc(-half, bigEnd, Math.PI / 2), ...arc(half, smallEnd, -Math.PI / 2)];
}

/** A skirted cylinder, flat-crowned. */
function piston({ width, height, crown }) {
  const w = width / 2;
  const h = height / 2;
  return [
    [-w + crown, -h], [w - crown, -h], [w, -h + crown],
    [w, h], [w * 0.8, h], [w * 0.8, h - crown],
    [-w * 0.8, h - crown], [-w * 0.8, h], [-w, h], [-w, -h + crown],
  ];
}

/** An L of flat stock with a mounting foot. */
function bracket({ span, rise, thickness }) {
  return [
    [0, 0], [span, 0], [span, thickness], [thickness, thickness],
    [thickness, rise], [0, rise],
  ];
}

/** A teardrop: a base circle drawn out into one lobe. */
function cam({ base, lift, sides }) {
  return Array.from({ length: sides }, (_, i) => {
    const angle = (i / sides) * TAU - Math.PI;
    const radius = base + lift * ((1 + Math.cos(angle)) / 2) ** 3;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
}

export const SHAPES = [
  { name: 'timing gear', points: gear({ teeth: 16, tip: 1, root: 0.8, land: 0.13 }) },
  { name: 'idler gear', points: gear({ teeth: 10, tip: 0.72, root: 0.55, land: 0.13 }) },
  { name: 'flywheel', points: keyedDisc({ radius: 1.15, sides: 44, keyway: 0.16 }) },
  { name: 'bearing race', points: disc({ radius: 0.62, sides: 28 }) },
  { name: 'connecting rod', points: rod({ length: 2.6, bigEnd: 0.44, smallEnd: 0.24, steps: 14 }) },
  { name: 'piston', points: piston({ width: 1.1, height: 1.35, crown: 0.22 }) },
  { name: 'mounting bracket', points: bracket({ span: 1.5, rise: 1.1, thickness: 0.28 }) },
  { name: 'cam lobe', points: cam({ base: 0.6, lift: 0.85, sides: 36 }) },
];
