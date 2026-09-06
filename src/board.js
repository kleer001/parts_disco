// Build a board of drifting parts from a seed. Pure: same seed, same board.

import { mulberry32 } from './rng.js';
import { driftAt } from './drift.js';
import { place, contains } from './geometry.js';

/** Tuning for how a board is populated. Data, not logic. */
export const BOARD_DEFAULTS = {
  count: 20,
  // Parts run large against the field on purpose: the pitch is a pile of
  // overlapping impressions, and outlines small enough to sit side by side make a
  // spotting game with nothing to see past.
  scale: { min: 62, max: 135 },
  speed: { min: 8, max: 34 }, // px per second, per axis
  margin: 40, // how far past the edge a part's centre may drift
};

/**
 * Populate a board.
 *
 * Every part gets its own speed on each axis, so no two parts share a heading.
 * Differently-moving outlines segment by common fate, which is what lets a player
 * read one part out of a pile of them at all; parts that moved together would read
 * as a single object.
 *
 * @param {number} seed
 * @param {{width: number, height: number}} field
 * @param {Array<{name: string, points: Array}>} shapes
 * @param {object} [cfg]
 * @returns {{field: object, parts: Array}}
 */
export function createBoard(seed, field, shapes, cfg = BOARD_DEFAULTS) {
  if (!shapes.length) throw new Error('a board needs at least one shape'); // boundary
  const rand = mulberry32(seed);
  const span = (range) => range.min + rand() * (range.max - range.min);
  const drift = () => (rand() < 0.5 ? -1 : 1) * span(cfg.speed);

  const area = {
    minX: -cfg.margin,
    minY: -cfg.margin,
    maxX: field.width + cfg.margin,
    maxY: field.height + cfg.margin,
  };

  const parts = Array.from({ length: cfg.count }, (_, index) => {
    const shape = shapes[Math.floor(rand() * shapes.length)];
    return {
      id: index,
      name: shape.name,
      points: shape.points,
      scale: span(cfg.scale),
      x: area.minX + rand() * (area.maxX - area.minX),
      y: area.minY + rand() * (area.maxY - area.minY),
      vx: drift(),
      vy: drift(),
    };
  });

  return { field: area, parts };
}

/**
 * The board as it stands at time t: each part with the outline it is wearing now.
 * @param {{field: object, parts: Array}} board
 * @param {number} t - seconds since the board started
 */
export function boardAt(board, t) {
  return board.parts.map((part) => {
    const at = driftAt(part, t, board.field);
    return { ...part, ...at, outline: place(part.points, { ...at, scale: part.scale }) };
  });
}

/**
 * The part under a point, or null. The last one drawn is the one on top, so the
 * search runs from the top of the pile down.
 * @param {Array} placed - output of boardAt
 * @param {[number, number]} point
 */
export function partAt(placed, point) {
  for (let i = placed.length - 1; i >= 0; i--) {
    if (contains(point, placed[i].outline)) return placed[i];
  }
  return null;
}
