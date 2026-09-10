// A run: the stage it is on, the board it dealt, and how much damage is left.
//
// The game and the juice bench both need this and neither needs it differently. The
// bench is where the tuning numbers are chosen, so a bench keeping its own copy of the
// deal chooses them against a board that is not the game's -- and nothing catches the
// drift, because both halves keep working.
//
// Nothing here touches an event, the clock or the visible canvas. It is handed a
// layout and a loaded fleet, and it hands back the object a compositor renders.

import { deal, layout } from './board.js';
import { createRound } from './game.js';
import { stageAt } from './levels.js';
import { stampRegions, INKS, rgbOf } from './layers.js';
import { planBoard } from './paint.js';
import { proxyOf } from './views.js';
import { createMeter } from './meter.js';

/**
 * How far a retry's deal is moved from the one it replaces.
 *
 * A death hands back the same stage, not the same yard. Replaying the board you just
 * memorised is a recall exercise and not the search the stage is asking for, so the
 * attempt is part of what the deal is drawn from -- and the run still reproduces,
 * because the attempt is counted rather than rolled.
 */
export const RETRY_STRIDE = 7919;

/**
 * Deal the first stage and hold everything that follows from it.
 *
 * @param {object} place - a `layoutFor` result: the board's field and the panel's
 * @param {object} views - a loaded fleet, from `loadViews`
 * @param {number} seed - the run's seed; every deal is drawn from it
 */
export function createRun(place, views, seed) {
  const viewOf = (slot) => views.view(slot.model, slot.angle);

  // A view's proxy never changes, and the layout asks for it once per car per deal.
  const proxies = new Map();
  const proxyFor = (slot) => {
    const at = `${slot.model}/${slot.angle}`;
    if (!proxies.has(at)) proxies.set(at, proxyOf(viewOf(slot)));
    return proxies.get(at);
  };

  // The plan is read off a drawing nobody sees, so it is made on a canvas of its own
  // rather than by scribbling on the board and painting over it.
  const scratch = document.createElement('canvas');
  const scratchCtx = scratch.getContext('2d', { willReadFrequently: true });
  const held = document.createElement('canvas');

  // The damage a life can take. It outlives a round on purpose -- it is the run that
  // is being spent, not the board.
  const meter = createMeter();

  let field;
  let depth = 0;
  let attempt = 0;
  let level;
  let round;
  let span;
  let prompt;
  let standing;
  let plan;
  let shades;

  /**
   * Work out how this board is coloured. A function of the placement alone, so it is
   * asked when the placement changes and not once a frame: when a board is dealt, and
   * again when the last car is found and the losers leave, which makes the remaining
   * cars a different map.
   */
  const replan = (cars) => {
    standing = cars;
    stampRegions(scratchCtx, standing, span, viewOf, field.width, field.height);
    const px = scratchCtx.getImageData(0, 0, field.width, field.height).data;
    plan = planBoard(px, field.width, field.height, standing.length, level.inks);
  };

  const redeal = () => {
    level = stageAt(depth);
    // Off the short edge, so a vehicle is the same size in a tall field as a wide one.
    span = Math.min(field.width, field.height) * level.size;
    const draw = seed + depth + attempt * RETRY_STRIDE;
    const { placed, target, askedAt } = deal(draw, level, views);
    round = createRound(layout(placed, draw, span, field, proxyFor), target, viewOf);
    prompt = new Image();
    prompt.src = views.promptFor(target, askedAt ?? views.anglesOf(target)[0]);
    shades = INKS.slice(0, level.inks).map(rgbOf);
    replan(round.anchors);
  };

  const reshape = (next) => {
    place = next;
    field = place.board;
    scratch.width = held.width = field.width;
    scratch.height = held.height = field.height;
    redeal();
  };
  reshape(place);

  return {
    /** The board layer's cache. Held here because a reshape resizes it. */
    held,
    meter,

    get level() { return level; },
    get round() { return round; },
    get span() { return span; },
    get depth() { return depth; },

    /**
     * Stand the run at a stage, from a fresh attempt.
     *
     * The game only ever calls this forwards, one at a time. It takes a depth because
     * the juice bench steps about the path to find the board a slider is worth judging
     * against, and a bench dealing its own boards to do that is a bench tuning the
     * game against a board the game never sees.
     */
    goTo(next) {
      depth = next;
      attempt = 0;
      redeal();
    },

    /** The next stage, from a fresh attempt. */
    next() {
      this.goTo(depth + 1);
    },

    /**
     * The same stage again, as a different yard, with the damage wiped.
     *
     * A dead run is owed a board. The stage is the one it died on -- the deal is what
     * changes, because the lesson is the search and not the layout.
     */
    retry() {
      attempt++;
      meter.clear();
      redeal();
    },

    /** A different shape is a different board, so it is dealt again rather than stretched. */
    reshape,

    /**
     * The moment the last one is found the losers clear off, and what is left is a
     * different map that has to be coloured again. Once, not every frame after.
     */
    settle() {
      if (round.wonAt !== null && standing.length === round.anchors.length) {
        replan(round.anchors.filter((_, i) => round.found.has(i)));
      }
    },

    /**
     * What a compositor is handed.
     * @param {number} at - the game clock's reading
     * @param {boolean} dead - whether the meter has run out on this run
     */
    frameOf(at, dead) {
      return {
        width: field.width,
        height: field.height,
        panel: place.panel,
        standing, plan, shades, span, round, level, prompt, meter, dead, at,
      };
    },

    /**
     * A click's canvas point, or null if it landed outside the board.
     *
     * The panel is under the board and takes no clicks, so a point past the field is
     * one the round should never be asked about.
     */
    pointIn(canvas, event) {
      const box = canvas.getBoundingClientRect();
      const point = [
        ((event.clientX - box.left) / box.width) * canvas.width,
        ((event.clientY - box.top) / box.height) * canvas.height,
      ];
      return point[0] > field.width || point[1] > field.height ? null : point;
    },
  };
}
