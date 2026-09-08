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

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

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
 */
export function createBoardLayer(viewOf, palette = PALETTE) {
  return {
    name: 'board',
    draw(ctx, frame) {
      const { anchors, span, width, height, inks: palletteSize, round, at } = frame;
      const won = round.winning(at);

      const ringsOf = (anchor) => viewOf(anchor.slot).silhouette;
      const trace = (anchor, rings, paint) => {
        for (const ring of rings) {
          ctx.beginPath();
          ctx.moveTo(anchor.cx + (ring[0][0] - 0.5) * span,
                     anchor.cy + (ring[0][1] - 0.5) * span);
          for (let k = 1; k < ring.length; k++) {
            ctx.lineTo(anchor.cx + (ring[k][0] - 0.5) * span,
                       anchor.cy + (ring[k][1] - 0.5) * span);
          }
          paint();
        }
      };

      // Once the last one is found the losers clear off, so only the winners are on
      // the board to be coloured and the map is a different map.
      const standing = won > 0
        ? anchors.filter((_, i) => round.found.has(i))
        : anchors;

      // First drawing: flat identifying colours, read back rather than looked at.
      ctx.fillStyle = 'rgb(255,255,255)';
      ctx.fillRect(0, 0, width, height);
      standing.forEach((anchor, i) => {
        ctx.fillStyle = `rgb(${i}, ${255 - i}, ${(i * 37) % 256})`;
        trace(anchor, ringsOf(anchor), () => ctx.fill());
      });

      const pixels = ctx.getImageData(0, 0, width, height);
      const { owner, regions } = labelRegions(
        pixels.data, width, height, standing.length, PAPER_RGB);
      const { ink } = assignInks(borders(owner, regions, width, height), palletteSize);
      const shades = INKS.slice(0, palletteSize).map(rgbOf);

      // Every winner goes to white as the ground does, so the board ends as paper
      // with the answers left standing on it in outline.
      const out = pixels.data;
      for (let p = 0, i = 0; p < owner.length; p++, i += 4) {
        const region = owner[p];
        const base = region >= 0 ? shades[ink[region]] : PAPER_RGB;
        out[i] = base[0] + (255 - base[0]) * won;
        out[i + 1] = base[1] + (255 - base[1]) * won;
        out[i + 2] = base[2] + (255 - base[2]) * won;
        out[i + 3] = 255;
      }
      ctx.putImageData(pixels, 0, 0);

      // Second drawing: the linework, over the colours it was measured against.
      ctx.lineWidth = STROKE;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = palette.ink;
      for (const anchor of standing) {
        const view = viewOf(anchor.slot);
        trace(anchor, view.strokes, () => ctx.stroke());
      }

      // A found car is ringed while the round is still running, so the tally on the
      // panel can be checked against the board.
      if (won === 0 && round.found.size) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = palette.found;
        for (const index of round.found) {
          const anchor = anchors[index];
          ctx.beginPath();
          ctx.arc(anchor.cx, anchor.cy, span * 0.09, 0, Math.PI * 2);
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
      ctx.fillText(round.left() ? `${round.left()} to go` : 'all found', left, y);
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = palette.quiet;
      ctx.textAlign = 'right';
      ctx.fillText(`${round.total} on the board`, left + span, y + 2);
      ctx.textAlign = 'left';

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
