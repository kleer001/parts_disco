// Entry point. The only file that touches the DOM, the clock or an event.
// Everything it calls is pure and takes what it needs as an argument.

import { createCompositor } from './compositor.js';
import { loadViews, proxyOf } from './views.js';
import { deal, layout } from './board.js';
import { createRound } from './game.js';
import { stageAt, RANGE } from './levels.js';
import { createPaperLayer, createBoardLayer, createPanelLayer,
         stampRegions, INKS, rgbOf } from './layers.js';
import { planBoard } from './paint.js';

const SEED = 1983;
const PANEL_WIDTH = 300;

/**
 * Wire a canvas to a run and start the loop.
 * @param {HTMLCanvasElement} canvas
 * @param {number} [seed]
 */
export async function start(canvas, seed = SEED) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('start() requires a <canvas> element'); // boundary
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable'); // boundary

  const views = await loadViews();
  const field = { width: canvas.width - PANEL_WIDTH, height: canvas.height };
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
  scratch.width = field.width;
  scratch.height = field.height;
  const scratchCtx = scratch.getContext('2d', { willReadFrequently: true });

  let depth = 0;
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

  const nextLevel = () => {
    level = stageAt(depth);
    span = field.height * level.size;
    const { placed, target, askedAt } = deal(seed + depth, level, views);
    round = createRound(layout(placed, seed + depth, span, field, proxyFor),
                        target, viewOf);
    prompt = new Image();
    prompt.src = views.promptFor(target, askedAt ?? views.anglesOf(target)[0]);
    shades = INKS.slice(0, level.inks).map(rgbOf);
    replan(round.anchors);
  };
  nextLevel();

  const scene = createCompositor()
    .add(createPaperLayer())
    .add(createBoardLayer(viewOf))
    .add(createPanelLayer(RANGE));

  const started = performance.now();
  const elapsed = (now) => (now - started) / 1000;

  canvas.addEventListener('pointerdown', (event) => {
    const box = canvas.getBoundingClientRect();
    const point = [
      ((event.clientX - box.left) / box.width) * canvas.width,
      ((event.clientY - box.top) / box.height) * canvas.height,
    ];
    if (point[0] > field.width) return;
    round.choose(point, span, elapsed(performance.now()));
  });

  const frame = (now) => {
    const at = elapsed(now);
    // The win plays itself out on the board, and when it has run its two seconds the
    // next level is dealt. Nothing is timed here beyond that.
    if (round.done(at)) { depth++; nextLevel(); }

    // The moment the last one is found the losers clear off, and what is left is a
    // different map that has to be coloured again. Once, not every frame after.
    if (round.wonAt !== null && standing.length === round.anchors.length) {
      replan(round.anchors.filter((_, i) => round.found.has(i)));
    }

    scene.render(ctx, {
      width: field.width,
      height: field.height,
      panelWidth: PANEL_WIDTH,
      standing,
      plan,
      shades,
      span,
      round,
      level,
      prompt,
      at,
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
