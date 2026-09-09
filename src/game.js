// What is being asked for, what has been found, and where the round is up to. Pure:
// it takes a point and a time, never a canvas or an event.

import { contains } from './geometry.js';

/** How long the board holds still after the last car is found, in seconds. */
export const WIN_SECONDS = 2;

// How long a winning vehicle holds each colour, at the start of the win and at the
// end of it. It accelerates between the two, so the flashing reads as something
// winding up rather than as a light left blinking.
export const FLASH_FIRST = 0.150;
export const FLASH_LAST = 0.050;

/**
 * How many times a winner has changed colour by this point in the win.
 *
 * The interval shortens steadily, so the count is not the elapsed time over an
 * interval -- it is the integral of one over an interval that is itself moving.
 * Solved rather than counted, so the colour a car is showing depends on nothing but
 * how far through the win the board is, and a dropped frame cannot lose a flash.
 */
export function flashesBy(progress) {
  const slope = (FLASH_FIRST - FLASH_LAST) / WIN_SECONDS;
  const at = Math.min(progress, 1) * WIN_SECONDS;
  return Math.floor(Math.log(FLASH_FIRST / (FLASH_FIRST - slope * at)) / slope);
}

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
  const wanted = anchors.filter((anchor) => anchor.slot.model === target).length;

  const round = {
    anchors,
    target,
    /** Index of every car found, against the moment it was found. */
    found: new Map(),
    /**
     * Index of every car clicked in error, against the moment it last was. Only the
     * last one counts: clicking the same wrong car twice is two refusals, and the
     * second has to answer rather than land inside the first one's silence.
     */
    refused: new Map(),
    misses: 0,
    /** When the last car was found, in seconds. Null until it is. */
    wonAt: null,

    /** How many of the asked-for vehicle are still out there. */
    left() {
      return wanted - round.found.size;
    },

    total: wanted,

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
        round.refused.set(hit.index, now);
        return { outcome: 'wrong', slot: hit.slot };
      }

      round.found.set(hit.index, now);
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
