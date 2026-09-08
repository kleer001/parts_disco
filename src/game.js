// What is being asked for, what has been found, and where the round is up to. Pure:
// it takes a point and a time, never a canvas or an event.

import { contains } from './geometry.js';

/** How long the board holds still after the last car is found, in seconds. */
export const WIN_SECONDS = 2;

/**
 * The car under a point, or null.
 *
 * Walks the pile from the top down and stops at the first car whose outline holds the
 * point, which is the car a player sees there -- later cars are drawn over earlier
 * ones, so the first hit going backwards is the visible one. Tested against the real
 * outline and not a box: at this burial a car's box is mostly other cars, and a box
 * would answer with a vehicle nowhere near the cursor.
 */
export function pick(anchors, span, point, viewOf) {
  for (let i = anchors.length - 1; i >= 0; i--) {
    const { slot, cx, cy } = anchors[i];
    const local = [(point[0] - cx) / span + 0.5, (point[1] - cy) / span + 0.5];
    if (local[0] < 0 || local[0] > 1 || local[1] < 0 || local[1] > 1) continue;
    for (const ring of viewOf(slot).silhouette) {
      if (contains(local, ring)) return { index: i, slot };
    }
  }
  return null;
}

/**
 * Start a round on a laid-out board.
 *
 * @param {Array} anchors - output of layout()
 * @param {string} target - the model the panel is asking for
 * @param {Function} viewOf - a slot's traced view
 */
export function createRound(anchors, target, viewOf) {
  const wanted = anchors
    .map((anchor, index) => (anchor.slot.model === target ? index : -1))
    .filter((index) => index >= 0);

  const round = {
    anchors,
    target,
    found: new Set(),
    misses: 0,
    /** When the last car was found, in seconds. Null until it is. */
    wonAt: null,

    /** How many of the asked-for vehicle are still out there. */
    left() {
      return wanted.length - round.found.size;
    },

    total: wanted.length,

    /**
     * Resolve a click.
     * @returns {{outcome: 'found'|'again'|'wrong'|'ground', slot: object|null}}
     */
    choose(point, span, now) {
      if (round.wonAt !== null) return { outcome: 'again', slot: null };

      const hit = pick(anchors, span, point, viewOf);
      if (!hit) {
        round.misses++;
        return { outcome: 'ground', slot: null };
      }
      if (round.found.has(hit.index)) return { outcome: 'again', slot: hit.slot };
      if (hit.slot.model !== target) {
        round.misses++;
        return { outcome: 'wrong', slot: hit.slot };
      }

      round.found.add(hit.index);
      if (!round.left()) round.wonAt = now;
      return { outcome: 'found', slot: hit.slot };
    },

    /**
     * How far through the win the board is: 0 while playing, rising to 1 as the
     * losers clear, the winners brighten and the ground goes to white.
     */
    winning(now) {
      if (round.wonAt === null) return 0;
      return Math.min(1, (now - round.wonAt) / WIN_SECONDS);
    },

    /** The round is over and the next one can be dealt. */
    done(now) {
      return round.winning(now) >= 1;
    },
  };
  return round;
}
