// The screen the game opens on, and the thing that covers the wait.
//
// The fleet is a couple of megabytes across a hundred-odd requests, and until it lands
// there is no board to draw. So this paints on the first frame, before any of it is
// asked for, and the loading happens behind it. There is no separate loading screen:
// the title is the cover, which is what the games this one is measured against do.
//
// What says the wait is over is the game's own content rather than a bar. The yard
// above the wordmark is empty while the fleet is in flight and fills when it arrives,
// and the button turns from grey to the green a find already wears. A player learns
// the colour here and meets it again the first time they are right.
//
// Like `layers.js` this only ever draws. It is handed a context and told what it may
// know; it reaches for nothing.

import { mulberry32 } from './rng.js';
import { PALETTE, INKS, ring, inkStroke, roundRect } from './layers.js';
import { SEMANTIC } from './juice.js';

/** What the screen says. Here rather than inline, because it is copy, not logic. */
export const WORDMARK = 'parts disco';
export const TAGLINE = 'A yard full of vehicles.';
export const TASK = 'Find every copy of the one you were shown.';
export const WAITING = 'backing the yard out';
export const READY = 'PLAY';
export const ENDLESS = 'ENDLESS';

/**
 * The yard behind the title: how many vehicles, and how hard they crowd.
 *
 * Fewer and larger than a real board. This one is a portrait rather than a puzzle --
 * it has to read as a crowd at a glance and still leave the wordmark legible.
 *
 * `span`, `spread` and `jitter` are all shares of the screen's short edge rather than
 * of its width, which is what keeps the crowding the same in both orientations. Set
 * against the width, a landscape screen pulls the row apart into a lineup, and a
 * lineup is the opposite of what the game is about.
 */
const YARD = { cars: 7, span: 0.19, spread: 0.95, jitter: 0.16 };

/** Type, as a share of the screen's short edge, so it holds at any size. */
const TYPE = { wordmark: 0.115, tagline: 0.033, task: 0.027, button: 0.05 };

const face = (px) => `${Math.round(px)}px VT323, monospace`;

/**
 * Build the opening screen for one layout.
 *
 * @param {object} place - a `layoutFor` result; the title takes the whole of it
 * @param {number} seed - the run's, so the opening shot belongs to the run behind it
 * @returns {{draw: Function, hit: Function}}
 */
export function createTitle(place, seed) {
  const { width, height } = place;
  const short = Math.min(width, height);

  // Where the vehicles stand, worked out once. Drawn from the run's own seed, so the
  // yard on the title belongs to the game waiting behind it rather than to this file.
  const rand = mulberry32(seed);
  const parked = [];
  for (let i = 0; i < YARD.cars; i++) {
    const along = YARD.cars === 1 ? 0.5 : i / (YARD.cars - 1);
    parked.push({
      cx: width / 2 + (along - 0.5) * short * YARD.spread,
      cy: height * 0.30 + (rand() - 0.5) * short * YARD.jitter,
      ink: INKS[i % INKS.length],
    });
  }

  // Where the buttons land, so a click can be tested against them. Written by `draw`
  // because the type is measured rather than assumed, and read by `hit`.
  let buttons = null;

  return {
    /**
     * Paint the screen.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {object|null} views - the loaded fleet, or null while it is still coming
     */
    draw(ctx, views) {
      ctx.fillStyle = PALETTE.paper;
      ctx.fillRect(0, 0, width, height);

      // The yard, once there is one. Each vehicle is a different ink so the row reads
      // as the map the board is rather than as a fleet catalogue.
      if (views) {
        const span = short * YARD.span;
        parked.forEach((spot, i) => {
          const model = views.models[i % views.models.length];
          const angles = views.anglesOf(model.name);
          const view = views.view(model.name, angles[i % angles.length]);
          ctx.fillStyle = spot.ink;
          for (const points of view.silhouette) {
            ring(ctx, spot, points, span);
            ctx.fill();
          }
          inkStroke(ctx);
          for (const points of view.strokes) {
            ring(ctx, spot, points, span);
            ctx.stroke();
          }
        });
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';

      ctx.fillStyle = PALETTE.ink;
      ctx.font = face(short * TYPE.wordmark);
      ctx.fillText(WORDMARK, width / 2, height * 0.53);

      ctx.fillStyle = SEMANTIC.quiet.ink;
      ctx.font = face(short * TYPE.tagline);
      ctx.fillText(TAGLINE, width / 2, height * 0.60);
      ctx.font = face(short * TYPE.task);
      ctx.fillText(TASK, width / 2, height * 0.645);

      // The buttons wear the find's green once the game can start, and the colour the
      // panel uses for anything not worth reading until it is. While the fleet is in
      // flight there is one of them and it is not a button, it is a status line.
      const size = short * TYPE.button;
      const pad = size * 0.55;
      const h = size * 0.86 + pad;
      const y = height * 0.74;
      const lay = [];

      if (!views) {
        ctx.font = face(size);
        const w = ctx.measureText(WAITING).width + pad * 2;
        lay.push({ label: WAITING, mode: null, x: (width - w) / 2, w });
      } else {
        ctx.font = face(size);
        const widths = [READY, ENDLESS].map((t) => ctx.measureText(t).width + pad * 2);
        const gap = size * 0.5;
        let x = (width - (widths[0] + widths[1] + gap)) / 2;
        [READY, ENDLESS].forEach((label, i) => {
          lay.push({ label, mode: i === 0 ? 'campaign' : 'endless', x, w: widths[i] });
          x += widths[i] + gap;
        });
      }

      for (const b of lay) {
        const role = views ? SEMANTIC.found : SEMANTIC.quiet;
        roundRect(ctx, b.x, y, b.w, h, size * 0.18);
        ctx.fillStyle = role.tint;
        ctx.fill();
        ctx.strokeStyle = role.loud;
        ctx.lineWidth = Math.max(1, short * 0.004);
        ctx.stroke();
        ctx.fillStyle = role.ink;
        ctx.textBaseline = 'middle';
        ctx.fillText(b.label, b.x + b.w / 2, y + h / 2 + 1);
      }

      if (views) {
        ctx.fillStyle = SEMANTIC.quiet.ink;
        ctx.font = face(short * TYPE.task * 0.86);
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('sixteen yards, or a belt that never stops',
                     width / 2, y + h + short * 0.045);
      }

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      buttons = views ? lay.map((b) => ({ ...b, y, h })) : null;
    },

    /**
     * Which mode a click chose, or null.
     *
     * Null for every point until the fleet has landed, so the screen cannot be clicked
     * past before there is anything behind it.
     */
    hit(point) {
      if (!buttons) return null;
      const on = buttons.find((b) =>
        point[0] >= b.x && point[0] <= b.x + b.w
        && point[1] >= b.y && point[1] <= b.y + b.h);
      return on ? on.mode : null;
    },
  };
}
