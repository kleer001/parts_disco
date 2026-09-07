// Entry point. The only file that touches the DOM, the clock or an event.
// Everything it calls is pure and takes what it needs as an argument.

import { createCompositor } from './compositor.js';
import { createBoard, fontSizeFor, BOARD_DEFAULTS } from './board.js';
import { createGame } from './game.js';
import { makeWords } from './words.js';
import { createPaperLayer, createWordsLayer, createPanelLayer, FONT_FAMILY } from './layers.js';

const SEED = 1983;
const PANEL_WIDTH = 300;
const NOTICE_MS = 900;

const NOTICES = {
  hit: (part) => ({ tone: 'hit', text: `${part.name} — found` }),
  wrong: (part) => ({ tone: 'miss', text: `that one is ${part.name}` }),
  empty: () => ({ tone: 'miss', text: 'bare paper' }),
};

/**
 * Measure each word at the size the board will draw it.
 *
 * The boundary: only a canvas knows how wide a string of glyphs is, so the widths
 * are taken here and handed to the board as data. Height comes from the font's own
 * ascent and descent rather than the point size, so the hit box matches the ink.
 */
function measureWords(ctx, words, fontSize) {
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  return words.map((word) => {
    const m = ctx.measureText(word);
    return {
      word,
      width: m.width,
      height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
    };
  });
}

/**
 * Wire a canvas to a run and start the loop.
 * @param {HTMLCanvasElement} canvas
 * @param {number} [seed]
 */
export function start(canvas, seed = SEED) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('start() requires a <canvas> element'); // boundary
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  const field = { width: canvas.width - PANEL_WIDTH, height: canvas.height };
  const fontSize = fontSizeFor(field);
  const words = makeWords(seed, BOARD_DEFAULTS.count);
  const board = createBoard(seed, field, measureWords(ctx, words, fontSize));
  const game = createGame(board, seed);
  game.next();

  const scene = createCompositor()
    .add(createPaperLayer())
    .add(createWordsLayer(board))
    .add(createPanelLayer());

  let notice = null;
  let noticeUntil = 0;
  const started = performance.now();
  const elapsed = (now) => (now - started) / 1000;

  canvas.addEventListener('pointerdown', (event) => {
    const box = canvas.getBoundingClientRect();
    const point = [
      ((event.clientX - box.left) / box.width) * canvas.width,
      ((event.clientY - box.top) / box.height) * canvas.height,
    ];
    if (point[0] > field.width || !game.target) return;

    const now = performance.now();
    const { outcome, part } = game.pick(point, elapsed(now));
    notice = NOTICES[outcome](part);
    noticeUntil = now + NOTICE_MS;
    if (outcome === 'hit') game.next();
  });

  const frame = (now) => {
    scene.render(ctx, {
      width: field.width,
      height: canvas.height,
      panelWidth: PANEL_WIDTH,
      fontSize,
      t: elapsed(now),
      target: game.target,
      found: game.found,
      total: board.parts.filter((part) => part.reachable).length,
      misses: game.misses,
      notice: now < noticeUntil ? notice : null,
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// Auto-start in the browser; skipped under `node --test`.
if (typeof document !== 'undefined') {
  const canvas = document.getElementById('screen');
  if (canvas) start(canvas);
}
