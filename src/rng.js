// Seeded pseudo-random generator. Deterministic: same seed → same sequence.
// House rule: game logic uses this, never Math.random(), so runs are reproducible.

/**
 * mulberry32 — a fast, seedable 32-bit PRNG.
 * @param {number} seed - any integer; coerced to uint32.
 * @returns {() => number} a function returning floats in [0, 1).
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A seed for one run, drawn fresh every launch.
 *
 * Six digits, so it is short enough to read off a screen, type back in and put in a
 * message. This is the one number in the game that does not come from `mulberry32`:
 * it is the entropy every other draw is derived from, and there is nothing to seed it
 * with. `crypto` rather than `Math.random` says that plainly.
 */
export function freshSeed() {
  return 100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000);
}

/**
 * How far apart seeds derived from one seed are kept.
 *
 * A run has one seed and many things to draw from it -- which stage, which attempt,
 * which stretch of belt -- and the cheap way to get a seed per thing is to add a
 * counter. Added raw the counters collide: stage 2 attempt 0 and stage 1 attempt 1
 * are the same number and deal the same yard, which reads as the game repeating
 * itself. Spacing each counter by a prime keeps them clear of one another.
 *
 * `near` is for a counter that moves often, `far` for one that moves rarely, so the
 * frequent one never walks far enough to reach the rare one's next step.
 */
export const STRIDE = { near: 7919, far: 104729 };
