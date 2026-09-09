// Colouring the board as a map. Pure: takes pixels and gives back regions and inks,
// and never draws anything itself.
//
// Cars and the bare ground between them are one flat map, so they can be coloured as
// one: find every region, find which regions share a border, and hand out inks so
// that no border has the same ink on both sides.

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
export function labelRegions(px, width, height, cars) {
  const owner = new Int32Array(width * height).fill(UNKNOWN);
  for (let i = 0, p = 0; p < owner.length; i += 4, p++) {
    const r = px[i];
    if (r === 255 && px[i + 1] === 255 && px[i + 2] === 255) { owner[p] = OPEN; continue; }
    if (px[i + 1] === 255 - r && px[i + 2] === (r * 37) % 256) owner[p] = r;
  }

  let front = owner;
  let back = new Int32Array(owner.length);
  for (let pass = 0; pass < BLEED; pass++) {
    back.set(front);
    for (let at = 0; at < front.length; at++) {
      if (front[at] !== UNKNOWN) continue;
      const x = at % width;
      let take = UNKNOWN;
      if (x > 0 && front[at - 1] !== UNKNOWN) take = front[at - 1];
      else if (x < width - 1 && front[at + 1] !== UNKNOWN) take = front[at + 1];
      else if (at >= width && front[at - width] !== UNKNOWN) take = front[at - width];
      else if (at < front.length - width && front[at + width] !== UNKNOWN) {
        take = front[at + width];
      }
      if (take !== UNKNOWN) back[at] = take;
    }
    [front, back] = [back, front];
  }
  owner.set(front);

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

  return { owner, regions };
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

/**
 * Everything about how a board is coloured, worked out once.
 *
 * A function of the placement alone, so it is settled when the board is laid and not
 * asked again every frame -- the regions do not move, and neither does which of them
 * touch.
 *
 * @param {Uint8ClampedArray} px - RGBA of a pass that drew each car in its own flat colour
 * @returns {{owner: Int32Array, neighbours: Array<Set>, ink: Int32Array}}
 */
export function planBoard(px, width, height, cars, palette) {
  const { owner, regions } = labelRegions(px, width, height, cars);
  const neighbours = borders(owner, regions, width, height);
  const { ink } = assignInks(neighbours, palette);
  return { owner, neighbours, ink };
}
