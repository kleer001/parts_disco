// Draw passes. Each honors the { name, draw(ctx, frame) } contract and reads the
// frame it is handed.
//
// The board layer is the odd one: it draws itself twice. The first drawing is only a
// question -- which regions does this board have, and which of them share a border --
// because a car and the ground beside it are one flat map and the map decides every
// colour on it. The answer is laid down underneath a second drawing rather than
// painted over the first, since a car's softened edge is neither car nor ground and
// survives any test for either.

import { labelRegions, borders, assignInks } from './paint.js';
import { flashesBy, blinkOf, FIND_BLINKS } from './game.js';

export const PALETTE = {
  paper: '#f4f1ea',
  ink: '#1a1a1a',
  panel: '#ffffff',
  rule: '#d4d0c8',
  quiet: '#4b5563',
  found: '#0f5f57',
  miss: '#b91c1c',
};

export const PAPER_RGB = [0xf4, 0xf1, 0xea];

/** Flat inks, held back from full saturation so the black linework survives on them. */
export const INKS = [
  '#c4553d', '#2f6b6a', '#c08a2e', '#4a6b96',
  '#6d7f52', '#8c5a72', '#9c9384', '#3f4a58',
];

export const STROKE = 1.5;

// When a winner stops flashing and blows out to white. The ground whitens across the
// whole win; a car holds its colour most of the way, so the flashes are still there
// to be seen when they are at their fastest.
const BURN_OUT = 0.75;

/**
 * The ink a winning vehicle is showing on its nth flash.
 *
 * Never the ink it showed last time. One in eight flashes would otherwise repeat and
 * read as a flash that did not happen, which at fifty milliseconds is the difference
 * between quick and stuttering.
 */
function flashInk(car, flash) {
  const roll = (n) => Math.abs(Math.imul(car * 2654435761 + n * 40503, 2246822519)) % 7;
  let ink = roll(0) % INKS.length;
  for (let n = 1; n <= flash; n++) ink = (ink + 1 + roll(n)) % INKS.length;
  return ink;
}

export const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Trace one closed ring of a view, placed and sized. */
function ring(ctx, anchor, points, span) {
  ctx.beginPath();
  ctx.moveTo(anchor.cx + (points[0][0] - 0.5) * span,
             anchor.cy + (points[0][1] - 0.5) * span);
  for (let k = 1; k < points.length; k++) {
    ctx.lineTo(anchor.cx + (points[k][0] - 0.5) * span,
               anchor.cy + (points[k][1] - 0.5) * span);
  }
}

/**
 * Draw each car in a flat colour that is only its number, for a plan to be read back
 * off. Never seen: this is the question the colouring is the answer to.
 */
export function stampRegions(ctx, anchors, span, viewOf, width, height) {
  ctx.fillStyle = 'rgb(255,255,255)';
  ctx.fillRect(0, 0, width, height);
  anchors.forEach((anchor, i) => {
    ctx.fillStyle = `rgb(${i}, ${255 - i}, ${(i * 37) % 256})`;
    for (const points of viewOf(anchor.slot).silhouette) {
      ring(ctx, anchor, points, span);
      ctx.fill();
    }
  });
}

/** Ground: the paper every impression is pulled onto. */
export function createPaperLayer(palette = PALETTE) {
  return {
    name: 'paper',
    draw(ctx, frame) {
      ctx.fillStyle = palette.paper;
      ctx.fillRect(0, 0, frame.width, frame.height);
    },
  };
}

/**
 * The board: every car, the ground between them, and the colours both are painted in.
 *
 * The plan arrives already worked out -- which regions the board has, which of them
 * touch, and what ink each was given. That is a fact about the placement and the
 * placement does not move, so it is settled once when the board is laid rather than
 * asked again sixty times a second. What is left here is a lookup and a fade.
 */
export function createBoardLayer(viewOf, palette = PALETTE) {
  let buffer = null;

  return {
    name: 'board',
    draw(ctx, frame) {
      const { standing, plan, shades, span, width, height, round, at } = frame;
      const won = round.winning(at);
      const burn = Math.max(0, (won - BURN_OUT) / (1 - BURN_OUT));

      // Through the win the winners flash, faster and faster, through every ink the
      // game has rather than the few this board was allowed.
      const flash = won > 0 ? flashesBy(won) : 0;
      const flashing = won > 0
        ? standing.map((_, i) => rgbOf(INKS[flashInk(i, flash)]))
        : null;

      // A car found during play blinks, then holds a colour nothing beside it is
      // wearing -- picked against its neighbours so an answer cannot settle into the
      // very thing it was hiding against.
      const blinking = won > 0 ? null : new Map();
      if (blinking) {
        for (const [index, found] of round.found) {
          const step = blinkOf(at - found);
          if (step < 1) {
            blinking.set(index, rgbOf(INKS[flashInk(index, Math.floor(step * FIND_BLINKS))]));
          } else {
            const taken = new Set();
            for (const j of plan.neighbours[index]) taken.add(plan.ink[j]);
            let settled = flashInk(index, FIND_BLINKS);
            for (let n = 0; n < INKS.length && taken.has(settled); n++) {
              settled = (settled + 1) % INKS.length;
            }
            blinking.set(index, rgbOf(INKS[settled]));
          }
        }
      }

      // One question, asked once a region: what colour, and how far gone to white.
      // The ground whitens across the whole win; a winner holds its colour to the last
      // quarter, so the flashes are still there to be seen at their fastest.
      const paper = PAPER_RGB;
      const inkOf = (region) => {
        if (region < 0) return paper;
        if (region >= standing.length) return shades[plan.ink[region]];
        if (flashing) return flashing[region];
        return blinking.get(region) ?? shades[plan.ink[region]];
      };
      const fadeOf = (region) => (
        flashing && region >= 0 && region < standing.length ? burn : won);

      if (!buffer) buffer = ctx.createImageData(width, height);
      const out = buffer.data;
      const owner = plan.owner;
      for (let p = 0, i = 0; p < owner.length; p++, i += 4) {
        const region = owner[p];
        const base = inkOf(region);
        const fade = fadeOf(region);
        out[i] = base[0] + (255 - base[0]) * fade;
        out[i + 1] = base[1] + (255 - base[1]) * fade;
        out[i + 2] = base[2] + (255 - base[2]) * fade;
        out[i + 3] = 255;
      }
      ctx.putImageData(buffer, 0, 0);

      // The linework, over the colours it was measured against.
      ctx.lineWidth = STROKE;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = palette.ink;
      for (const anchor of standing) {
        for (const points of viewOf(anchor.slot).strokes) {
          ring(ctx, anchor, points, span);
          ctx.stroke();
        }
      }
    },
  };
}

/** The prompt panel: what to find, and how hard this board was made. */
export function createPanelLayer(range, palette = PALETTE) {
  // A dial's bar, so the settings read as a position on a path rather than as
  // numbers with nothing to be large or small against.
  const dial = (ctx, x, y, width, label, value, shown, [low, high]) => {
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = palette.quiet;
    ctx.fillText(label, x, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = palette.ink;
    ctx.fillText(shown, x + width, y);
    ctx.textAlign = 'left';

    const track = y + 17;
    ctx.fillStyle = palette.rule;
    ctx.fillRect(x, track, width, 3);
    ctx.fillStyle = palette.found;
    const along = high === low ? 1 : (value - low) / (high - low);
    ctx.fillRect(x, track, Math.max(2, width * along), 3);
  };

  return {
    name: 'panel',
    draw(ctx, frame) {
      const { width, height, panelWidth, round, level, prompt } = frame;
      ctx.fillStyle = palette.panel;
      ctx.fillRect(width, 0, panelWidth, height);
      ctx.strokeStyle = palette.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(width + 0.5, 0);
      ctx.lineTo(width + 0.5, height);
      ctx.stroke();

      const left = width + 24;
      const span = panelWidth - 48;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      ctx.fillStyle = palette.quiet;
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText(`LEVEL ${level.level}:${level.stage}`
                   + (level.last ? '  (last)' : ''), left, 28);

      ctx.fillStyle = palette.ink;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('FIND', left, 54);
      ctx.font = '600 26px system-ui, sans-serif';
      ctx.fillText(round.target, left, 72);

      if (prompt && prompt.complete) {
        // Smoothed, against every instinct about a one-bit picture. The render is a
        // halftone, and point-sampling a halftone at half its size beats the screen
        // against the pixel grid and returns a chequerboard. Averaging it back is
        // what recovers the greys the dither was standing in for.
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(prompt, left, 110, span, span);
      }

      let y = 110 + span + 22;
      ctx.font = '600 16px system-ui, sans-serif';
      ctx.fillStyle = round.left() ? palette.ink : palette.found;
      ctx.fillText(round.left() ? `${round.left()} of ${round.total} to find` : 'all found',
                   left, y);

      y += 34;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillStyle = palette.quiet;
      ctx.fillText('DIFFICULTY', left, y);

      y += 22;
      for (const row of [
        ['vehicles', level.cars, `${level.cars} / ${range.cars[1]}`, range.cars],
        ['size', -level.size, `${Math.round(level.size * 100)}% of ${Math.round(range.size[1] * 100)}%`,
         [-range.size[1], -range.size[0]]],
        ['kinds', level.fleet.length, `${level.fleet.length} of ${range.kinds[1]}`, range.kinds],
        ['inks', -level.inks, `${level.inks} of ${range.inks[1]}`, [-range.inks[1], -range.inks[0]]],
      ]) {
        dial(ctx, left, y, span, row[0], row[1], row[2], row[3]);
        y += 32;
      }

      y += 8;
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = palette.quiet;
      ctx.fillText(`misses ${round.misses}`, left, y);
    },
  };
}
