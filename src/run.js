// A run: the stage it is on, the board it dealt, and how much damage is left.
//
// The game and the juice bench both need this and neither needs it differently. The
// bench is where the tuning numbers are chosen, so a bench keeping its own copy of the
// deal chooses them against a board that is not the game's -- and nothing catches the
// drift, because both halves keep working.
//
// Nothing here touches an event, the clock or the visible canvas. It is handed a
// layout and a loaded fleet, and it hands back the object a compositor renders.

import { STRIDE } from './rng.js';
import { deal, layout } from './board.js';
import { createRound } from './game.js';
import { stageAt } from './levels.js';
import { stampRegions, INKS, rgbOf } from './layers.js';
import { planBoard } from './paint.js';
import { fleetLookups } from './views.js';
import { createGroupOrder } from './groups.js';
import { createMeter } from './meter.js';

/**
 * Deal the first stage and hold everything that follows from it.
 *
 * @param {object} place - a `layoutFor` result: the board's field and the panel's
 * @param {object} atlas - every group's fleet and tiers, from `loadAtlas`
 * @param {number} seed - the run's seed; every deal is drawn from it
 */
export function createRun(place, atlas, seed) {
  // A board may deal from any group, so the view reaches into the right one off the
  // slot, and the proxy it caches is keyed by the slot's group as well as its shape.
  const { viewOf, proxyFor } = fleetLookups(atlas.view);

  // Which group each stage deals from -- shuffled level by level, bookends never
  // touching. It hangs off the seed, so a reseed rebuilds it.
  let order = createGroupOrder(seed, atlas.ids);

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
    // The stage sets how hard the board is; the group sets what it is made of. The stage
    // names its tiers and the group fills them with its own loud / plain / twins.
    const gid = order(depth);
    const base = stageAt(depth);
    const tiers = atlas.tiers(gid);
    level = { ...base, group: gid, fleet: base.tiers.flatMap((t) => tiers[t]) };
    // Off the short edge, so a body is the same size in a tall field as a wide one.
    span = Math.min(field.width, field.height) * level.size;
    // A death hands back the same stage, not the same yard: replaying the board you
    // just memorised is a recall exercise rather than the search the stage asks for.
    // The attempt is counted rather than rolled, so the run still reproduces.
    const draw = seed + depth + attempt * STRIDE.near;
    const { placed, target, askedAt } = deal(draw, level, atlas.fleet(gid));
    // Some sets read badly at the board's size -- glasses too thin, cube pets too heavy.
    // Each set carries its own size, drawn and click-tested a little bigger or smaller
    // than the board's. A board is one set, so the scale rides on every anchor's span,
    // which the drawing and the hit test both already honour. Packing stays at the board
    // size, so the spacing is the stage's and only the pieces on it grow or shrink.
    const anchors = layout(placed, draw, span, field, proxyFor);
    const gscale = atlas.scaleOf(gid);
    if (gscale !== 1) for (const a of anchors) a.span = span * gscale;
    round = createRound(anchors, target, viewOf);
    prompt = new Image();
    prompt.src = atlas.promptFor(gid, target, askedAt ?? atlas.anglesOf(gid, target)[0]);
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
     * Start again on a different draw, from the top of the path.
     *
     * A seed is the whole run, not a setting inside it: the same number deals the
     * same sixteen yards in the same order. So changing it is starting over, and
     * anything carried from the old run would be carried from a different game.
     */
    reseed(next) {
      seed = next;
      order = createGroupOrder(next, atlas.ids);
      depth = 0;
      attempt = 0;
      meter.clear();
      redeal();
    },

    /** What is dealing this run, so it can be shown and written down. */
    get seed() { return seed; },

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
     * Whether a canvas point landed on the board at all.
     *
     * The panel sits beside the board and takes no clicks, so a point past the field
     * is one the round should never be asked about. The point arrives already in
     * canvas coordinates: turning an event into one is the entry point's job, and
     * nothing in here is allowed to know what an event is.
     */
    onBoard(point) {
      return point[0] <= field.width && point[1] <= field.height;
    },
  };
}
