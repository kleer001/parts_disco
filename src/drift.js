// Where a drifting part sits at time t. Pure, and a function of t rather than a
// step-by-step integration.
//
// Solving for t directly is what lets the whole bounce cycle be searched offline:
// a board can be checked for "is every part reachable at some point in the loop"
// by sampling t, with no simulation to run and no drift between two runs of it.
// Nudging a layer at runtime to make a part reachable would read as the world
// cheating, so the check belongs before the board ships, not during play.

/**
 * Fold a value back and forth between two bounds, the way a screensaver logo
 * bounces off the edges of a screen.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number} a position within [min, max]
 */
export function fold(value, min, max) {
  const span = max - min;
  if (span <= 0) return min;
  const cycle = span * 2;
  const offset = (((value - min) % cycle) + cycle) % cycle;
  return min + (offset <= span ? offset : cycle - offset);
}

/**
 * The offset of a drifting body at time t.
 * @param {{x: number, y: number, vx: number, vy: number}} body - position at t=0
 * @param {number} t - seconds
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} field
 * @returns {{x: number, y: number}}
 */
export function driftAt(body, t, field) {
  return {
    x: fold(body.x + body.vx * t, field.minX, field.maxX),
    y: fold(body.y + body.vy * t, field.minY, field.maxY),
  };
}
