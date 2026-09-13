// Deal a board and lay it out. Pure: same seed and same level, same board. Nothing
// here draws, measures or touches a canvas -- a view arrives as data and leaves as a
// position.

import { mulberry32 } from './rng.js';

/** How many places a car tries before it gives up on a separation it cannot fit. */
const DART_TRIES = 30;

/** How finely the separation is searched, and how far up the search may look. */
const FIT_STEPS = 14;
const SPREAD_CEILING = 4.0;

/**
 * Throw the cars onto the field.
 *
 * Bridson's method with a radius per car rather than one for all of them: each car is
 * thrown into the ring around a car already down and kept only if it clears every one
 * of them. Nothing is pushed, so nothing has to converge -- one pass lays the board
 * where a relaxation needs sixty and still leaves the spacing looser.
 *
 * A car that finds nowhere against the others tries open ground instead. Without that
 * a throw only ever lands in the ring around a car already placed, so the board grows
 * outward as a circle from its first car and a square field keeps its corners bare.
 *
 * @returns placements, or null when this separation will not fit them all.
 */
function dartThrow(bodies, seed, separation, field) {
  const rand = mulberry32(seed);
  const down = [];

  for (const body of bodies) {
    let put = null;

    if (down.length) {
      for (let attempt = 0; attempt < DART_TRIES && !put; attempt++) {
        const anchor = down[Math.floor(rand() * down.length)];
        // The ring runs from just clear of the anchor to twice that, which is what
        // keeps the board even: closer is rejected, further leaves a hole.
        const reach = (anchor.r + body.r) * separation;
        const angle = rand() * Math.PI * 2;
        const away = reach * (1 + rand());
        const x = anchor.x + Math.cos(angle) * away;
        const y = anchor.y + Math.sin(angle) * away;
        if (x < 0 || y < 0 || x > field.width || y > field.height) continue;
        if (down.every((q) => Math.hypot(x - q.x, y - q.y) >= (q.r + body.r) * separation)) {
          put = { body, x, y, r: body.r };
        }
      }
    }

    for (let attempt = 0; attempt < DART_TRIES && !put; attempt++) {
      const x = rand() * field.width;
      const y = rand() * field.height;
      if (down.every((q) => Math.hypot(x - q.x, y - q.y) >= (q.r + body.r) * separation)) {
        put = { body, x, y, r: body.r };
      }
    }

    if (!put) return null;
    down.push(put);
  }
  return down;
}

/**
 * Choose what is on the board, and what the panel asks for.
 *
 * The target is a vehicle the board holds, asked for at an angle it does not. A
 * prompt showing an angle that is on the board is a shape to match; this one has to
 * be recognised.
 */
export function deal(seed, level, views) {
  const rand = mulberry32(seed);
  const pick = (list) => list[Math.floor(rand() * list.length)];

  const placed = [];
  for (let i = 0; i < level.cars; i++) {
    const model = pick(level.fleet);
    placed.push({ model, angle: pick(views.anglesOf(model)), group: level.group });
  }

  const target = pick(placed).model;
  const here = new Set(placed.filter((p) => p.model === target).map((p) => p.angle));
  const spare = views.anglesOf(target).filter((a) => !here.has(a));
  return { placed, target, askedAt: spare.length ? pick(spare) : null };
}

/**
 * Lay the dealt cars out, at the widest separation the field will take.
 *
 * The separation is searched for rather than set. Throwing holds its separation
 * exactly and covers only the ground that separation reaches, so a fixed one grows an
 * island and leaves the rest of the board bare. The widest spacing that still fits
 * every car is the one that fills the field, which makes the count the only thing
 * that sets density: to bury the cars deeper, deal more of them.
 *
 * @returns anchors, each `{ slot, cx, cy }`, plus its own `span` when `sizeOf` is given --
 *   where a view's frame goes, and how big it is drawn.
 */
export function layout(placed, seed, span, field, proxyFor, sizeOf = null) {
  // A board may draw each object at its own size -- the footprint rule sizes a thin fork
  // up and a heavy apple down -- or all of them at the board's, which is what the belt and
  // the benches want. When it is given, the size scales the body that is packed, where the
  // frame is centred, and the span the anchor carries, so a piece is spaced, placed, drawn
  // and clicked at one size throughout.
  const sizeAt = sizeOf || (() => 1);
  const bodies = placed.map((slot) => ({ slot, r: proxyFor(slot).r * span * sizeAt(slot) }));

  let out = null;
  let low = 0;
  let high = SPREAD_CEILING;
  for (let step = 0; step < FIT_STEPS; step++) {
    const mid = (low + high) / 2;
    const attempt = dartThrow(bodies, seed + 1, mid, field);
    if (attempt) { out = attempt; low = mid; } else high = mid;
  }
  if (!out) throw new Error('no separation fits this many cars'); // boundary

  return out.map((p) => {
    const slot = p.body.slot;
    const size = span * sizeAt(slot);
    const proxy = proxyFor(slot);
    const anchor = {
      slot,
      cx: p.x - (proxy.cx - 0.5) * size,
      cy: p.y - (proxy.cy - 0.5) * size,
    };
    if (sizeOf) anchor.span = size; // only when sizing; other callers keep the board's span
    return anchor;
  });
}
