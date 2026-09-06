// Entry point. The only file that touches the DOM, the clock or an event.
// Everything it calls is pure and takes what it needs as an argument.

import { createCompositor } from './compositor.js';
import { createBoard } from './board.js';
import { createGame } from './game.js';
import { SHAPES } from './shapes.js';
import { createPaperLayer, createPartsLayer, createPanelLayer } from './layers.js';

const SEED = 1983;
const PANEL_WIDTH = 300;
const NOTICE_MS = 900;

const NOTICES = {
  hit: (part) => ({ tone: 'hit', text: `${part.name} — found` }),
  wrong: (part) => ({ tone: 'miss', text: `that is a ${part.name}` }),
  empty: () => ({ tone: 'miss', text: 'nothing there' }),
};

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
  const board = createBoard(seed, field, SHAPES);
  const game = createGame(board, seed);
  game.next();

  const scene = createCompositor()
    .add(createPaperLayer())
    .add(createPartsLayer(board))
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
      t: elapsed(now),
      target: game.target,
      found: game.found,
      total: board.parts.length,
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
