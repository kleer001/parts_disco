// The screen the game opens on, and the thing that covers the wait.
//
// The fleet is a couple of megabytes across a hundred-odd requests, and until it lands
// there is no board to draw. So this paints on the first frame, before any of it is
// asked for, and the loading happens behind it. There is no separate loading screen:
// the title is the cover, which is what the games this one is measured against do.
//
// What says the wait is over is the game's own content rather than a bar. The screen
// litters itself with the game's own things the moment its own small yard file lands,
// and the button turns from grey to the green a find already wears once the fleet is
// in. A player learns the colour here and meets it again the first time they are right.
//
// Like `layers.js` this only ever draws. It is handed a context and told what it may
// know; it reaches for nothing.

import { mulberry32 } from './rng.js';
import { PALETTE, INKS, drawView, roundRect, ruledTile, face } from './layers.js';
import { SEMANTIC, TUNING } from './juice.js';

/** What the screen says. Here rather than inline, because it is copy, not logic. */
export const WORDMARK = 'parts disco';
export const WAITING = 'backing the yard out';
export const READY = 'PLAY';
export const ENDLESS = 'ENDLESS';

/**
 * The yard behind the title: how thickly the screen is littered.
 *
 * A jittered grid rather than a row, filling the whole field, because the game is a
 * crowded yard and the opening shot should be one. `wanted` is a target: the grid it
 * picks is whatever squares up closest to the screen's own proportions.
 *
 * `span` and `jitter` are shares of the screen's short edge rather than of its width,
 * which keeps the crowding the same in both orientations. Set against the width, a
 * landscape screen pulls the crowd apart into a lineup.
 */
const YARD = { wanted: 176, span: 0.208, jitter: 0.72, cell: 16 };

/** Type, as a share of the screen's short edge, so it holds at any size. */
const TYPE = { wordmark: 0.115, button: 0.05 };

/**
 * How far the three panels stand off the yard.
 *
 * Shares of the short edge, like everything else here. The shadow is cast by the fill
 * and not by the border: a stroke that casts one too draws the edge twice and the panel
 * reads as embossed rather than as lifted.
 */
const LIFT = { blur: 0.016, x: 0.005, y: 0.008, edge: 0.004,
               ink: 'rgba(26, 26, 26, 0.42)' };

/**
 * Draw the current path as a panel standing off the yard.
 *
 * The shadow is cast by the fill and not by the border: a stroke that casts one too
 * draws the edge twice and the panel reads as embossed rather than as lifted.
 */
function panel(ctx, short, fill, edge) {
  ctx.save();
  ctx.shadowColor = LIFT.ink;
  ctx.shadowBlur = short * LIFT.blur;
  ctx.shadowOffsetX = short * LIFT.x;
  ctx.shadowOffsetY = short * LIFT.y;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(1, short * LIFT.edge);
  ctx.stroke();
}

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
  const cols = Math.max(1, Math.round(Math.sqrt(YARD.wanted * width / height)));
  const rows = Math.ceil(YARD.wanted / cols);
  const cellW = width / cols;
  const cellH = height / rows;

  const parked = [];
  for (let i = 0; i < cols * rows; i++) {
    parked.push({
      cx: (i % cols + 0.5) * cellW + (rand() - 0.5) * cellW * YARD.jitter,
      cy: (Math.floor(i / cols) + 0.5) * cellH + (rand() - 0.5) * cellH * YARD.jitter,
      ink: INKS[Math.floor(rand() * INKS.length)],
      // Which drawing stands here. Drawn once from the run's seed so the crowd holds
      // still while the screen redraws, and differs from one run to the next.
      pick: Math.floor(rand() * 1e6),
    });
  }
  // Down the screen, so an overlap reads as one thing standing in front of another.
  parked.sort((a, b) => a.cy - b.cy);

  // Where the buttons land, so a click can be tested against them. Written by `draw`
  // because the type is measured rather than assumed, and read by `hit`.
  let buttons = null;

  // The crowd, printed once. It never moves while the screen is up, and drawing it
  // again every frame costs a stroke for every point of every drawing on it -- at this
  // litter that is tens of thousands of paths a frame, and the title is what the player
  // is looking at while the fleet lands. Printed to its own canvas it costs one blit.
  let sheet = null;

  const print = (yard) => {
    sheet = document.createElement('canvas');
    // Rounded up, not to nearest: the sheet is blitted unscaled, so a sheet a fraction
    // short of a fractional layout would leave a bare strip down the edge.
    sheet.width = Math.ceil(width);
    sheet.height = Math.ceil(height);
    const sc = sheet.getContext('2d');
    sc.fillStyle = PALETTE.paper;
    sc.fillRect(0, 0, sheet.width, sheet.height);

    // The same ruled, speckled paper the board is printed on, at a fixed cell rather
    // than the board's -- the title has no depth to say, so the rules only have to say
    // paper. Laid under the crowd so the whole screen is one blit.
    sc.fillStyle = sc.createPattern(
      ruledTile(YARD.cell, TUNING.gridAlpha, TUNING.gridNoise, TUNING.gridNoiseScale,
                '#000000'), 'repeat');
    sc.fillRect(0, 0, sheet.width, sheet.height);

    const span = short * YARD.span;
    for (const spot of parked) {
      const drawing = yard.drawings[spot.pick % yard.drawings.length];
      drawView(sc, spot, drawing, span, { fill: spot.ink });
    }
  };

  return {
    /**
     * Paint the screen.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {object|null} views - the loaded fleet, or null while it is still coming
     * @param {object|null} yard - the baked title drawings, or null while they are
     */
    draw(ctx, views, yard) {

      // The yard, once there is one. It is drawn from the baked title set rather than
      // from the fleet: the crowd is a portrait of everything the game can deal, not of
      // the twelve it happens to open with, and it lands long before the fleet does.
      // Each thing takes its own ink, so the field reads as the map the board is rather
      // than as a catalogue.
      if (!sheet && yard) print(yard);
      if (sheet) {
        ctx.drawImage(sheet, 0, 0);
      } else {
        ctx.fillStyle = PALETTE.paper;
        ctx.fillRect(0, 0, width, height);
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';

      // The wordmark sits on a card of its own. With the field littered there is no
      // clear ground left to set type on, and the card is the same paper the yard is
      // printed on, so it reads as a label pinned over the crowd rather than a hole.
      const mark = short * TYPE.wordmark;
      ctx.font = face(mark);
      const markW = ctx.measureText(WORDMARK).width;
      const cardW = markW + mark * 0.9;
      const cardH = mark * 1.5;
      const cardY = height * 0.53 - mark * 0.98;
      roundRect(ctx, (width - cardW) / 2, cardY, cardW, cardH, mark * 0.18);
      panel(ctx, short, PALETTE.paper, PALETTE.ink);

      ctx.fillStyle = PALETTE.ink;
      ctx.fillText(WORDMARK, width / 2, height * 0.53);

      // The buttons wear the find's green once the game can start, and the colour the
      // panel uses for anything not worth reading until it is. While the fleet is in
      // flight there is one of them and it is not a button, it is a status line.
      const size = short * TYPE.button;
      const pad = size * 0.55;
      const h = size * 0.86 + pad;
      const y = height * 0.74;
      const lay = [];

      ctx.font = face(size);
      if (!views) {
        const w = ctx.measureText(WAITING).width + pad * 2;
        lay.push({ label: WAITING, x: (width - w) / 2, w });
      } else {
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
        panel(ctx, short, role.tint, role.loud);
        ctx.fillStyle = role.ink;
        ctx.textBaseline = 'middle';
        ctx.fillText(b.label, b.x + b.w / 2, y + h / 2 + 1);
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
