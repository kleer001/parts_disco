// Which item group each board deals from. Data, not logic: a seed and a list of group
// ids in, one id per stage out, and the same seed always answers the same way.
//
// A board is one group -- all fish, or all cars -- because the whole difficulty of the
// game is telling apart things that are nearly the same, and a fish among cars is found
// without looking. The variety is between boards, not on them.

import { mulberry32 } from './rng.js';
import { STAGES } from './levels.js';

/** Fisher-Yates, off a seeded stream, leaving the caller's list untouched. */
function shuffled(ids, rand) {
  const a = ids.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The group each board deals from, level by level.
 *
 * A level is `STAGES` boards, and every level is its own shuffle of the groups, so the
 * order changes from one level to the next. The board that opens a level is never the
 * group that closed the level before it -- the bookends of two levels never touch --
 * which, with a shuffle holding no group twice, means no two boards in a row are ever
 * the same group across the whole run.
 *
 * Seeded by the run: the same seed deals the same groups in the same order. Levels are
 * built on demand, so an endless run keeps drawing fresh ones for as long as it climbs.
 *
 * @param {number} seed - the run's seed
 * @param {string[]} ids - the group ids to draw from
 * @returns {(depth: number) => string} the group id for a stage at that depth
 */
export function createGroupOrder(seed, ids) {
  const levels = []; // one shuffle per level, grown as deeper stages ask for it

  const build = (upto) => {
    while (levels.length <= upto) {
      const rand = mulberry32(seed + (levels.length + 1) * 0x9e3779b1);
      const order = shuffled(ids, rand);
      // Bookends never touch: this level must not open on the group the last one closed
      // on. The clash swaps one place down the order -- the shuffle is already distinct,
      // so the swapped-in group differs from the seam and the rest of the level stands.
      const prev = levels[levels.length - 1];
      if (prev && ids.length > 1 && order[0] === prev[(STAGES - 1) % prev.length]) {
        [order[0], order[1]] = [order[1], order[0]];
      }
      levels.push(order);
    }
  };

  return (depth) => {
    const lvl = Math.floor(depth / STAGES);
    build(lvl);
    const order = levels[lvl];
    return order[(depth % STAGES) % order.length];
  };
}
