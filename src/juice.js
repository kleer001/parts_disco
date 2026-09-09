// How the board answers. Envelopes, the colours that carry meaning, and the numbers
// all of it is tuned to. Pure: nothing here touches a canvas, and every function is a
// value in and a value out, so what the board does is reproducible from the clock.
//
// The tuning is data. `dev/juice.html` drives these same functions with every number
// on a slider, and TUNING is what it starts from.

/**
 * The colours that mean something, as against the inks that colour the board.
 *
 * The board's own palette cannot carry meaning. `paint.js` assigns inks so that no
 * two touching regions share one, which spends every ink on the puzzle. So meaning
 * lives on the panel, and it is built to two rules.
 *
 * Lightness carries the valence and hue only confirms it. Five roles at one lightness
 * put `found` and `miss` 0.021 apart in OKLab under simulated deuteranopia, which is
 * the same colour; the split below takes that to 0.231, and to 0.384 under
 * protanopia. Every `loud` also sits at least 0.074 from the nearest board ink, which
 * is what stops a meaning reading as a vehicle.
 *
 * `tint` is a slab and `ink` is the text on it: every pair clears 7:1, and every ink
 * clears 8:1 on the white panel.
 *
 * `research/semantic_ramp.py` prints all of that and is the thing to re-run when a
 * role moves. One limit it reports: `found` and `last` sit 0.056 apart under
 * protanopia, where green and amber converge. They are never the same kind of
 * element, and `last` is carried by scale as well, but that pair reads by position.
 */
export const SEMANTIC = {
  found:  { tint: '#D4F8DA', ink: '#005C27', loud: '#03A14A' },
  last:   { tint: '#FFE9CC', ink: '#674300', loud: '#E39A00' },
  quiet:  { tint: '#E8EDF4', ink: '#424D5B', loud: '#6D7C8F' },
  target: { tint: '#F0E9FF', ink: '#583687', loud: '#763EBD' },
  miss:   { tint: '#FFE6E3', ink: '#842521', loud: '#810009' },
};

/** What every knob was set to. Chosen on the bench, not reasoned about. */
export const TUNING = {
  // -- the pulse a found vehicle answers with -------------------------------
  pulseMs: 420,
  pulseGrow: 1.6,
  pulseShrink: 0.7,
  pulseShake: 3.2,
  pulseShakeHz: 26,
  strobes: 5,
  strobeMode: 'semantic',

  // -- how much louder the last find is than the first ----------------------
  rampTo: 1.9,
  rampCap: 6,

  // -- the beat the board holds at the instant of a find ---------------------
  hitStopMs: 95,

  // -- the wash a wrong click leaves on the vehicle it hit -------------------
  refuseMs: 620,
  refuseAlpha: 0.8,
  refuseRise: 0.12,

  // -- one level being taken off the screen and the next put down ------------
  wipeMs: 750,

  // -- the panel flinching when the board answers ---------------------------
  cardShake: 17,
  cardShakeLast: 50,
  cardTiltMax: 20,
  cardShakeMs: 1040,
  cardShakeHz: 34,
  cardDecay: 3.7,
  cardShadow: 7,
  cardBlur: 14,

  // -- the ground the diagram is printed on ---------------------------------
  gridCellFirst: 80,
  gridCellLast: 5,
  gridCellCurve: 1,
  gridAlpha: 0.36,
  gridNoise: 0.075,
  gridNoiseScale: 2,
  gridGroundOnly: true,

  // -- the board and the panel blocks sitting in wells ----------------------
  recess: 9,
  recessAlpha: 0.3,
  panelRecess: 5,

  // -- type and slabs -------------------------------------------------------
  typeScale: 1,
  slabRadius: 4,
  slabPad: 7,
};

/* ---- envelopes ----------------------------------------------------------- */

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/** Up fast, past the mark, and back. The shape of something arriving. */
export const easeOutBack = (t) => {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

/**
 * How much louder the nth find of a round is than the first.
 *
 * The cap matters as much as the ramp: past a point more intensity stops reading as
 * more, and every find after that reads as the same find.
 */
export function loudnessOf(rank, s = TUNING) {
  const along = Math.min(1, (rank - 1) / Math.max(1, s.rampCap - 1));
  return 1 + (s.rampTo - 1) * easeOutCubic(along);
}

/**
 * What a vehicle found `since` seconds ago is doing.
 *
 * One envelope drives all three: the scale overshoots and settles, the shake decays
 * out of it, and the strobe counts through it. They are one event, so they are one
 * clock -- three clocks would let the colour finish while the shape was still moving.
 *
 * @returns {{alive: boolean, scale: number, dx: number, dy: number, lit: boolean}}
 */
export function findPulse(since, s = TUNING, rank = 1) {
  const t = since / (s.pulseMs / 1000);
  if (t < 0 || t >= 1) return { alive: false, scale: 1, dx: 0, dy: 0, lit: false };

  const loud = loudnessOf(rank, s);
  // Overshoot to the grow, undershoot to the shrink, then home. easeOutBack already
  // carries the overshoot, so the peak is asked for and not added on afterwards.
  const swing = t < 0.45
    ? (s.pulseGrow - 1) * easeOutBack(t / 0.45)
    : (s.pulseGrow - 1) * (1 - easeInOutCubic((t - 0.45) / 0.55))
      + (s.pulseShrink - 1) * Math.sin(Math.PI * (t - 0.45) / 0.55) * 0.7;

  const decay = (1 - t) ** 2;
  const phase = since * s.pulseShakeHz * Math.PI * 2;
  const amp = s.pulseShake * loud * decay;

  return {
    alive: true,
    scale: 1 + swing * loud,
    dx: Math.sin(phase) * amp,
    dy: Math.cos(phase * 0.77) * amp * 0.6,
    lit: Math.floor(t * s.strobes) % 2 === 0,
  };
}

/**
 * What a vehicle clicked in error `since` seconds ago is doing.
 *
 * One wash of light grey over it, on in a snap and off slowly. No shake and no
 * strobe: a find is the board answering and a wrong click is it going quiet, so the
 * two are told apart by what they do and not only by the colour they do it in.
 *
 * @returns {{alive: boolean, alpha: number}}
 */
export function refuseWash(since, s = TUNING) {
  const t = since / (s.refuseMs / 1000);
  if (t < 0 || t >= 1) return { alive: false, alpha: 0 };
  const up = s.refuseRise;
  const shape = t < up ? t / up : (1 - (t - up) / (1 - up)) ** 2;
  return { alive: true, alpha: shape * s.refuseAlpha };
}

/**
 * The panel flinching.
 *
 * The card hangs straight when nothing is happening. Its tilt is part of the shake
 * and decays with it, because a card left leaning is a layout, and a card that leans
 * only while it is being hit is a reaction.
 *
 * @returns {{dx: number, dy: number, tilt: number}} tilt in degrees.
 */
export function cardShake(since, s = TUNING, big = false) {
  const t = since / (s.cardShakeMs / 1000);
  if (t < 0 || t >= 1) return { dx: 0, dy: 0, tilt: 0 };
  const decay = (1 - t) ** s.cardDecay;
  const phase = since * s.cardShakeHz * Math.PI * 2;
  const amp = big ? s.cardShakeLast : s.cardShake;
  // The named maximum is the tilt of the find that ends the round. Every other find
  // gets the share its own amplitude already asks for, so one number stays the
  // largest angle the card ever reaches.
  const share = s.cardShakeLast > 0 ? amp / s.cardShakeLast : 1;
  return {
    dx: Math.sin(phase) * amp * decay,
    dy: Math.cos(phase * 1.3) * amp * decay * 0.7,
    tilt: Math.sin(phase * 0.85) * s.cardTiltMax * share * decay,
  };
}

/**
 * The grid cell at this point on the path, in pixels. `along` runs 0..1 and comes
 * from `stageAt`, so nothing here has to know how long the path is.
 *
 * Geometric rather than linear: a size is read as a ratio, so an even ratio per stage
 * is what reads as an even tightening. Stepping the whole way in equal pixels would
 * spend most of the path barely changing and then collapse over the last few stages.
 */
export function gridCellAt(along, s = TUNING) {
  const shaped = along ** s.gridCellCurve;
  return s.gridCellFirst * (s.gridCellLast / s.gridCellFirst) ** shaped;
}

/**
 * Game time that can be told to stand still.
 *
 * A hit stop has to stop the whole board, not the effect that asked for it, so it
 * belongs to the clock and not to a layer. Everything downstream keeps reading one
 * number and never learns that it froze.
 */
export function createClock() {
  let lost = 0;
  let frozenUntil = 0;
  let last = null;
  return {
    /** Game seconds, given the real clock in milliseconds. */
    tick(nowMs) {
      if (last === null) last = nowMs;
      if (nowMs < frozenUntil) lost += nowMs - last;
      last = nowMs;
      return (nowMs - lost) / 1000;
    },
    /** Hold everything still for this long. */
    freeze(nowMs, ms) {
      frozenUntil = Math.max(frozenUntil, nowMs + ms);
    },
  };
}
