// Game state: what is being asked for, and what a click did about it. Pure — it
// takes a point and a time, never a canvas or an event.

import { mulberry32 } from './rng.js';
import { boardAt, partAt } from './board.js';

/**
 * Start a round.
 * @param {{field: object, parts: Array}} board
 * @param {number} seed
 */
export function createGame(board, seed) {
  const rand = mulberry32(seed);
  const game = {
    board,
    found: [],
    misses: 0,
    target: null,
    /**
     * Ask for a part that has not been found yet. Null once the board is cleared.
     * The prompt names a part, and several parts on the board may carry that name,
     * so any one of them answers it.
     */
    next() {
      const remaining = board.parts.filter((part) => !game.found.includes(part.id));
      if (!remaining.length) {
        game.target = null;
        return null;
      }
      game.target = remaining[Math.floor(rand() * remaining.length)].name;
      return game.target;
    },
    /**
     * Resolve a click.
     * @param {[number, number]} point
     * @param {number} t - seconds since the board started
     * @returns {{outcome: 'hit'|'wrong'|'empty', part: object|null}}
     */
    pick(point, t) {
      const part = partAt(boardAt(board, t), point);
      if (!part) {
        game.misses++;
        return { outcome: 'empty', part: null };
      }
      if (part.name !== game.target || game.found.includes(part.id)) {
        game.misses++;
        return { outcome: 'wrong', part };
      }
      game.found.push(part.id);
      return { outcome: 'hit', part };
    },
    /** Every part on the board has been found. */
    cleared() {
      return game.found.length === board.parts.length;
    },
  };
  return game;
}
