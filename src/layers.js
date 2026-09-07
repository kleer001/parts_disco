// Draw passes. Each honors the { name, draw(ctx, frame) } contract and reads the
// frame it is handed — no layer reaches back into game state.
//
// The look is a screenprint pulled out of register: outlined letterforms stacked
// until the field is a thicket. Nothing is filled, so a word crossing five others
// stays readable as a word; the moment they fill, the pile buries itself.

import { boardAt } from './board.js';

export const PALETTE = {
  paper: '#f4f1ea',
  ink: '#1a1a1a',
  found: '#b8b2a6',
  panel: '#ffffff',
  rule: '#d4d0c8',
  hit: '#047857',
  miss: '#b91c1c',
  quiet: '#4b5563',
};

// Thin enough that the counters of a letter stay open at board size. A heavier
// stroke closes them and the words read as solids.
export const STROKE = 1;

export const FONT_FAMILY = 'sans-serif';

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

/** The pile. Later words draw over earlier ones, matching partAt(). */
export function createWordsLayer(board, palette = PALETTE) {
  return {
    name: 'words',
    draw(ctx, frame) {
      ctx.font = `${frame.fontSize}px ${FONT_FAMILY}`;
      ctx.lineWidth = STROKE;
      ctx.lineJoin = 'round';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      for (const part of boardAt(board, frame.t)) {
        const isFound = frame.found.includes(part.id);
        ctx.strokeStyle = isFound ? palette.found : palette.ink;
        ctx.strokeText(part.name, part.x, part.y);
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
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      ctx.fillStyle = palette.ink;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('FIND', left, 32);

      ctx.font = '600 30px system-ui, sans-serif';
      ctx.fillText(frame.target ?? 'board cleared', left, 52);

      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = palette.quiet;
      ctx.fillText(`found ${frame.found.length} of ${frame.total}`, left, 106);
      ctx.fillText(`misses ${frame.misses}`, left, 126);

      if (frame.notice) {
        ctx.fillStyle = frame.notice.tone === 'hit' ? palette.hit : palette.miss;
        ctx.font = '600 13px system-ui, sans-serif';
        ctx.fillText(frame.notice.text, left, 158);
      }
    },
  };
}
