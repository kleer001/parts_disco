// Draw passes. Each honors the { name, draw(ctx, frame) } contract and reads the
// frame it is handed — no layer reaches back into game state.
//
// The look is screenprint: patent line art is black ink on white paper, and the
// board is that stack of impressions slightly out of register. So the parts are
// drawn as strokes in a few flat inks on a paper ground, and nothing is filled.
// Outlines do not occlude each other, which is what keeps a pile of twenty parts
// readable; the cost is that occlusion cannot be a difficulty knob until some
// layers are filled.

import { boardAt } from './board.js';

export const PALETTE = {
  paper: '#f4f1ea',
  inks: ['#1a1a1a', '#1d4ed8', '#b91c1c', '#047857'],
  found: '#9ca3af',
  target: '#111827',
  panel: '#ffffff',
  rule: '#d4d0c8',
};

export const INK_WIDTH = 2;

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

/** The drifting pile. Later parts draw over earlier ones, matching partAt(). */
export function createPartsLayer(board, palette = PALETTE) {
  return {
    name: 'parts',
    draw(ctx, frame) {
      ctx.lineWidth = INK_WIDTH;
      ctx.lineJoin = 'round';
      for (const part of boardAt(board, frame.t)) {
        const isFound = frame.found.includes(part.id);
        ctx.strokeStyle = isFound ? palette.found : palette.inks[part.id % palette.inks.length];
        ctx.globalAlpha = isFound ? 0.35 : 1;
        ctx.beginPath();
        part.outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.stroke();
      }
    },
  };
}

/** The prompt panel and the run's tally. */
export function createPanelLayer(palette = PALETTE) {
  return {
    name: 'panel',
    draw(ctx, frame) {
      const { panelWidth: width, height } = frame;
      ctx.fillStyle = palette.panel;
      ctx.fillRect(frame.width, 0, width, height);
      ctx.strokeStyle = palette.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(frame.width + 0.5, 0);
      ctx.lineTo(frame.width + 0.5, height);
      ctx.stroke();

      const left = frame.width + 24;
      ctx.fillStyle = palette.target;
      ctx.textBaseline = 'top';

      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('FIND', left, 32);

      ctx.font = '600 22px system-ui, sans-serif';
      ctx.fillText(frame.target ?? 'board cleared', left, 52);

      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = '#4b5563';
      ctx.fillText(`found ${frame.found.length} of ${frame.total}`, left, 104);
      ctx.fillText(`misses ${frame.misses}`, left, 124);

      if (frame.notice) {
        ctx.fillStyle = frame.notice.tone === 'hit' ? '#047857' : '#b91c1c';
        ctx.font = '600 13px system-ui, sans-serif';
        ctx.fillText(frame.notice.text, left, 156);
      }
    },
  };
}
