// Entry point. The only file that touches the DOM, the clock or an event.
// Everything it calls is pure and takes what it needs as an argument.

import { createCompositor } from './compositor.js';
import { loadViews, proxyOf } from './views.js';
import { deal, layout } from './board.js';
import { createRound } from './game.js';
import { stageAt, RANGE } from './levels.js';
import { createPaperLayer, createBoardLayer, createGridLayer, createFindLayer,
         createRefuseLayer, createRecessLayer, createPanelLayer, createWipeLayer,
         stampRegions, wipeFrom, INKS, rgbOf } from './layers.js';
import { planBoard } from './paint.js';
import { TUNING, createClock } from './juice.js';
import { layoutFor } from './layout.js';
import { createVoice } from './audio.js';

const SEED = 1983;

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

  // The panel measures text to size its slabs, so the face has to be there before
  // the first frame or every slab is cut to the fallback's widths. It is asked for
  // alongside the fleet rather than ahead of it -- the fleet is megabytes and the
  // face is kilobytes, so waiting for one before starting the other is a round trip
  // spent on nothing.
  // The chime joins them for the same reason: it is decoded before the first frame,
  // so no win can ever arrive ahead of its sound. Its context starts suspended, which
  // is allowed without a gesture; the first click resumes it.
  const voice = createVoice();
  const [views] = await Promise.all([
    loadViews(), document.fonts.load('16px VT323'), voice.load(),
  ]);
  const viewOf = (slot) => views.view(slot.model, slot.angle);

  // The canvas is a shape, not a size: it takes the viewport's proportions and a
  // fixed pixel budget, and CSS scales it the rest of the way.
  const viewport = () =>
    layoutFor(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  let place = viewport();
  let field = place.board;

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
  const scratchCtx = scratch.getContext('2d', { willReadFrequently: true });
  const held = document.createElement('canvas');
  const shot = document.createElement('canvas');

  const resize = () => {
    canvas.width = place.width;
    canvas.height = place.height;
    scratch.width = held.width = field.width;
    scratch.height = held.height = field.height;
  };
  resize();

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
    // Off the short edge, so a vehicle is the same size in a tall field as a wide one.
    span = Math.min(field.width, field.height) * level.size;
    const { placed, target, askedAt } = deal(seed + depth, level, views);
    round = createRound(layout(placed, seed + depth, span, field, proxyFor),
                        target, viewOf);
    prompt = new Image();
    prompt.src = views.promptFor(target, askedAt ?? views.anglesOf(target)[0]);
    shades = INKS.slice(0, level.inks).map(rgbOf);
    replan(round.anchors);
  };
  nextLevel();

  // The wipe is kept rather than added and forgotten, because the loop is what hands
  // it the screen it takes off.
  const wipe = createWipeLayer(shot);

  // Order is the picture: the ground goes over the board so the paper lies on top of
  // the ink, the find pulse goes over that, the recess frames the lot, and the wipe
  // is over everything because it takes the whole screen away.

  const scene = createCompositor()
    .add(createPaperLayer())
    .add(createBoardLayer(viewOf, held))
    .add(createGridLayer())
    .add(createRefuseLayer(viewOf))
    .add(createFindLayer(viewOf))
    .add(createRecessLayer())
    .add(createPanelLayer(RANGE))
    .add(wipe);

  // The clock is the game's, not the wall's, so a hit stop can hold the whole board
  // still without any layer knowing that it happened.
  const clock = createClock();

  canvas.addEventListener('pointerdown', (event) => {
    const box = canvas.getBoundingClientRect();
    const point = [
      ((event.clientX - box.left) / box.width) * canvas.width,
      ((event.clientY - box.top) / box.height) * canvas.height,
    ];
    if (point[0] > field.width || point[1] > field.height) return;
    event.preventDefault();
    const now = performance.now();
    const { outcome } = round.choose(point, span, clock.tick(now));
    // Rank is the size of the found set, which this click just grew. The find knows
    // whether it won, because the win is a sound it queues behind itself.
    if (outcome === 'found') {
      clock.freeze(now, TUNING.hitStopMs);
      voice.find(round.found.size, round.wonAt !== null);
    } else {
      voice.play(outcome);
    }
  });

  const frame = (now) => {
    const at = clock.tick(now);
    // The win plays itself out on the board, and when it has run its two seconds the
    // next level is dealt. Nothing is timed here beyond that. What is on the canvas at
    // that moment is the win's last frame, so the wipe takes the picture first: after
    // this line the state behind it is the new level's.
    if (round.done(at)) {
      depth++;
      wipe.take(ctx, at, wipeFrom(seed + depth));
      nextLevel();
    }

    // The moment the last one is found the losers clear off, and what is left is a
    // different map that has to be coloured again. Once, not every frame after.
    if (round.wonAt !== null && standing.length === round.anchors.length) {
      replan(round.anchors.filter((_, i) => round.found.has(i)));
    }

    scene.render(ctx, {
      width: field.width,
      height: field.height,
      panel: place.panel,
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

  // A turned phone is a different board, so the stage is dealt again rather than
  // stretched. Only a change of shape counts: scaling within one orientation is
  // what the CSS is already doing, and re-dealing on every pixel of a desktop drag
  // would throw the yard away while it was being resized.
  let settling = null;
  window.addEventListener('resize', () => {
    const next = viewport();
    if (next.portrait === place.portrait) return;
    clearTimeout(settling);
    settling = setTimeout(() => {
      place = next;
      field = place.board;
      resize();
      nextLevel();
    }, 150);
  });
}

// Auto-start in the browser; skipped under `node --test`.
if (typeof document !== 'undefined') {
  const canvas = document.getElementById('screen');
  if (canvas) start(canvas);
}
