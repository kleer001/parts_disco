// Build a board of words from a seed. Pure: same seed and same measurements, same
// board. Nothing here measures text or touches a canvas — a word arrives already
// measured, because only the renderer knows how wide a glyph is.

import { mulberry32 } from './rng.js';
import { driftAt } from './drift.js';
import { contains } from './geometry.js';

/** Tuning for how a board is populated. Data, not logic. */
export const BOARD_DEFAULTS = {
  count: 100,

  // Anchors sit on a square grid over the whole field, so the words are evenly
  // spaced rather than clumped. A word is centred on its cell, which means a word
  // in an edge cell hangs off the edge — at this font size, by about half.
  columns: 10,

  // Font height as a fraction of the field. At a quarter, a six-letter word spans
  // eight columns but only two and a half rows, so the field bands horizontally
  // until jitter breaks the rows up.
  fontScale: 0.25,

  // How far a word may sit from its anchor. Zero puts every row on one baseline.
  jitter: 0,

  // Pixels per second, per axis. Zero holds the board still: motion is a tuning
  // value rather than a code path, so turning it on is a change to this number.
  drift: 0,

  // How far past the edge a word's centre may drift once it is moving.
  margin: 40,
};

/** The font size a board of this shape wants, for the caller to measure at. */
export function fontSizeFor(field, cfg = BOARD_DEFAULTS) {
  return field.height * cfg.fontScale;
}

/**
 * Populate a board.
 *
 * @param {number} seed
 * @param {{width: number, height: number}} field
 * @param {Array<{word: string, width: number, height: number}>} measured
 * @param {object} [cfg]
 * @returns {{field: object, parts: Array}}
 */
export function createBoard(seed, field, measured, cfg = BOARD_DEFAULTS) {
  if (!measured.length) throw new Error('a board needs at least one word'); // boundary
  const rand = mulberry32(seed);
  const pitch = field.width / cfg.columns;
  const wander = () => (rand() - 0.5) * 2 * cfg.jitter;
  const speed = () => (cfg.drift ? (rand() < 0.5 ? -1 : 1) * cfg.drift : 0);

  const parts = measured.slice(0, cfg.count).map((entry, index) => ({
    id: index,
    name: entry.word,
    width: entry.width,
    height: entry.height,
    x: (index % cfg.columns) * pitch + pitch / 2 + wander(),
    y: Math.floor(index / cfg.columns) * pitch + pitch / 2 + wander(),
    vx: speed(),
    vy: speed(),
  }));

  const area = {
    minX: -cfg.margin,
    minY: -cfg.margin,
    maxX: field.width + cfg.margin,
    maxY: field.height + cfg.margin,
  };
  const board = { field: area, parts };
  // Settle solvability here, once, while the board is being made. A word the pile
  // has buried can never be clicked, and a prompt that asks for one is a round the
  // player cannot win however well they read. Deciding it at runtime instead --
  // lifting a word to the top when it gets asked for -- would read as the world
  // rearranging itself to help.
  const clickable = new Set(reachableIds(boardAt(board, 0), field));
  for (const part of parts) part.reachable = clickable.has(part.id);
  return board;
}

// How finely the field is probed when asking whether a word has any exposed pixel.
// Smaller finds slivers a player could never hit anyway; larger starts calling
// reachable words buried.
const PROBE_STEP = 4;

/**
 * The ids of words with at least one point where nothing later covers them.
 * Pure, and a function of the placement alone.
 *
 * @param {Array} placed - output of boardAt
 * @param {{width: number, height: number}} field - only points on the field count
 * @returns {number[]}
 */
export function reachableIds(placed, field) {
  const boxes = placed.map((part) => ({
    left: part.outline[0][0], top: part.outline[0][1],
    right: part.outline[2][0], bottom: part.outline[2][1],
  }));
  const found = [];
  for (let i = 0; i < placed.length; i++) {
    const box = boxes[i];
    // Only words drawn later can bury this one, and only those that overlap it.
    const over = [];
    for (let j = i + 1; j < placed.length; j++) {
      const other = boxes[j];
      if (other.left < box.right && other.right > box.left
          && other.top < box.bottom && other.bottom > box.top) over.push(other);
    }
    if (isExposed(box, over, field)) found.push(placed[i].id);
  }
  return found;
}

function isExposed(box, over, field) {
  for (let y = Math.max(box.top, 0); y < Math.min(box.bottom, field.height); y += PROBE_STEP) {
    for (let x = Math.max(box.left, 0); x < Math.min(box.right, field.width); x += PROBE_STEP) {
      if (!over.some((o) => x >= o.left && x <= o.right && y >= o.top && y <= o.bottom)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * The board as it stands at time t, each word with the box it occupies now.
 * @param {{field: object, parts: Array}} board
 * @param {number} t - seconds since the board started
 */
export function boardAt(board, t) {
  return board.parts.map((part) => {
    const at = driftAt(part, t, board.field);
    const halfW = part.width / 2;
    const halfH = part.height / 2;
    return {
      ...part,
      ...at,
      // A word's hit area is the box its glyphs occupy. Testing the letterforms
      // themselves would mean a click had to land on a stroke, and at this weight
      // the strokes are a pixel wide.
      outline: [
        [at.x - halfW, at.y - halfH], [at.x + halfW, at.y - halfH],
        [at.x + halfW, at.y + halfH], [at.x - halfW, at.y + halfH],
      ],
    };
  });
}

/**
 * The word under a point, or null. The last one drawn is on top, so the search
 * runs from the top of the pile down.
 * @param {Array} placed - output of boardAt
 * @param {[number, number]} point
 */
export function partAt(placed, point) {
  for (let i = placed.length - 1; i >= 0; i--) {
    if (contains(point, placed[i].outline)) return placed[i];
  }
  return null;
}
