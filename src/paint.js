// Colouring the board as a map. Pure: takes pixels and gives back regions and inks,
// and never draws anything itself.
//
// Cars and the bare ground between them are one flat map, so they can be coloured as
// one: find every region, find which regions share a border, and hand out inks so
// that no border has the same ink on both sides.

/** How far a pixel may sit from the paper and still count as bare ground. */
const PAPER_TOLERANCE = 20;

/** How far a region is pushed under whatever is drawn over it, in pixels. */
const BLEED = 3;

/** How far apart two pixels are probed for a shared border. */
const TOUCH_PROBE = 3;

const UNKNOWN = -2;
const OPEN = -1;

/**
 * Label every pixel with the region that owns it.
 *
 * The cars have been drawn in flat identifying colours; a softened edge is a blend of
 * two of them and decodes to neither, so a checksum in the blue channel throws those
 * out and what is left is filled in from its neighbours. Whatever is still paper is
 * open ground, flooded to its edges.
 *
 * @param {Uint8ClampedArray} px - RGBA of the identifying pass
 * @returns {{owner: Int32Array, regions: number, split: number}}
 */
export function labelRegions(px, width, height, cars, paper) {
  const owner = new Int32Array(width * height).fill(UNKNOWN);
  for (let i = 0, p = 0; p < owner.length; i += 4, p++) {
    const r = px[i];
    if (r === 255 && px[i + 1] === 255 && px[i + 2] === 255) { owner[p] = OPEN; continue; }
    if (px[i + 1] === 255 - r && px[i + 2] === (r * 37) % 256) owner[p] = r;
  }

  for (let pass = 0; pass < BLEED; pass++) {
    const before = owner.slice();
    for (let at = 0; at < owner.length; at++) {
      if (before[at] !== UNKNOWN) continue;
      const x = at % width;
      let take = UNKNOWN;
      if (x > 0 && before[at - 1] !== UNKNOWN) take = before[at - 1];
      else if (x < width - 1 && before[at + 1] !== UNKNOWN) take = before[at + 1];
      else if (at >= width && before[at - width] !== UNKNOWN) take = before[at - width];
      else if (at < owner.length - width && before[at + width] !== UNKNOWN) {
        take = before[at + width];
      }
      if (take !== UNKNOWN) owner[at] = take;
    }
  }

  const stack = new Int32Array(owner.length);
  let regions = cars;
  for (let start = 0; start < owner.length; start++) {
    if (owner[start] !== OPEN) continue;
    const id = regions++;
    let top = 0;
    stack[top++] = start;
    owner[start] = id;
    while (top) {
      const at = stack[--top];
      const x = at % width;
      if (x > 0 && owner[at - 1] === OPEN) { owner[at - 1] = id; stack[top++] = at - 1; }
      if (x < width - 1 && owner[at + 1] === OPEN) { owner[at + 1] = id; stack[top++] = at + 1; }
      if (at >= width && owner[at - width] === OPEN) {
        owner[at - width] = id; stack[top++] = at - width;
      }
      if (at < owner.length - width && owner[at + width] === OPEN) {
        owner[at + width] = id; stack[top++] = at + width;
      }
    }
  }

  return { owner, regions, split: countSplit(owner, width, cars) };
}

/**
 * How many cars the board has cut into more than one visible piece.
 *
 * Four inks colour any flat map whose every region is in one piece. These are the
 * regions that are not, and so the reason a board can want a fifth.
 */
function countSplit(owner, width, cars) {
  const claimed = new Uint8Array(owner.length);
  const walk = new Int32Array(owner.length);
  const pieces = new Int32Array(cars);

  for (let at = 0; at < owner.length; at++) {
    const id = owner[at];
    if (id < 0 || id >= cars || claimed[at]) continue;
    pieces[id]++;
    let top = 0;
    walk[top++] = at;
    claimed[at] = 1;
    while (top) {
      const q = walk[--top];
      const x = q % width;
      const near = [x > 0 ? q - 1 : -1, x < width - 1 ? q + 1 : -1,
                    q >= width ? q - width : -1,
                    q < owner.length - width ? q + width : -1];
      for (const n of near) {
        if (n >= 0 && !claimed[n] && owner[n] === id) { claimed[n] = 1; walk[top++] = n; }
      }
    }
  }
  let split = 0;
  for (let i = 0; i < cars; i++) if (pieces[i] > 1) split++;
  return split;
}

/** Which regions share a border with which. */
export function borders(owner, regions, width, height) {
  const touching = Array.from({ length: regions }, () => new Set());
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * width + x;
      const a = owner[at];
      if (a < 0) continue;
      if (x + TOUCH_PROBE < width) {
        const b = owner[at + TOUCH_PROBE];
        if (b >= 0 && b !== a) { touching[a].add(b); touching[b].add(a); }
      }
      if (y + TOUCH_PROBE < height) {
        const b = owner[at + TOUCH_PROBE * width];
        if (b >= 0 && b !== a) { touching[a].add(b); touching[b].add(a); }
      }
    }
  }
  return touching;
}

/**
 * Hand out inks so that no two regions sharing a border share one.
 *
 * DSATUR: always take the region with the most differently-inked neighbours already
 * decided, because that is the one running out of choices fastest. Ties go to the
 * region with the most neighbours.
 *
 * When the palette runs out the region takes the ink that clashes least, and the
 * clash is counted rather than hidden -- at the bottom of the difficulty path the
 * board is meant to run out.
 */
export function assignInks(touching, palette) {
  const ink = new Int32Array(touching.length).fill(-1);
  const used = new Array(palette).fill(0);
  let clashes = 0;

  for (let done = 0; done < touching.length; done++) {
    let pick = -1;
    let bestSat = -1;
    let bestDeg = -1;
    for (let i = 0; i < touching.length; i++) {
      if (ink[i] >= 0) continue;
      const seen = new Set();
      for (const j of touching[i]) if (ink[j] >= 0) seen.add(ink[j]);
      if (seen.size > bestSat || (seen.size === bestSat && touching[i].size > bestDeg)) {
        pick = i; bestSat = seen.size; bestDeg = touching[i].size;
      }
    }

    const taken = new Set();
    for (const j of touching[pick]) if (ink[j] >= 0) taken.add(ink[j]);

    // Of the inks still open here, take the one the board has used least. Taking the
    // first open one instead answers with as few colours as it can get away with, so
    // a board allowed six would come back painted in three and the palette would stop
    // being a difficulty at all.
    let choice = -1;
    let rarest = Infinity;
    for (let c = 0; c < palette; c++) {
      if (taken.has(c) || used[c] >= rarest) continue;
      choice = c; rarest = used[c];
    }
    if (choice < 0) {
      const count = new Array(palette).fill(0);
      for (const j of touching[pick]) if (ink[j] >= 0) count[ink[j]]++;
      choice = count.indexOf(Math.min(...count));
      clashes++;
    }
    ink[pick] = choice;
    used[choice]++;
  }
  return { ink, clashes };
}

export { PAPER_TOLERANCE };
