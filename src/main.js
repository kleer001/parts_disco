// Entry point. The only file that touches the DOM, the clock or an event.
// Everything it calls is pure and takes what it needs as an argument.

import { createCompositor } from './compositor.js';
import { loadViews } from './views.js';
import { stageAt, RANGE } from './levels.js';
import { createPaperLayer, createBoardLayer, createGridLayer, createFindLayer,
         createRefuseLayer, createRecessLayer, createOverLayer, createPanelLayer,
         createWipeLayer } from './layers.js';
import { TUNING, createClock } from './juice.js';
import { layoutFor } from './layout.js';
import { createVoice } from './audio.js';
import { createOptions } from './options.js';
import { createRun } from './run.js';

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

  // The canvas is a shape, not a size: it takes the viewport's proportions and a
  // fixed pixel budget, and CSS scales it the rest of the way.
  const viewport = () =>
    layoutFor(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  let place = viewport();

  const run = createRun(place, views, seed);
  const viewOf = (slot) => views.view(slot.model, slot.angle);

  const resize = () => {
    canvas.width = place.width;
    canvas.height = place.height;
  };
  resize();

  // The one piece of HTML in the game, laid over the canvas. It is raised here rather
  // than in the markup because it has nothing to say until there is a desk to move.
  createOptions(document.body, voice);

  // The wipe is kept rather than added and forgotten, because the loop is what hands
  // it the screen it takes off.
  const wipe = createWipeLayer(document.createElement('canvas'));

  // Order is the picture: the ground goes over the board so the paper lies on top of
  // the ink, the find pulse goes over that, the recess frames the lot, and the wipe
  // is over everything because it takes the whole screen away.

  const scene = createCompositor()
    .add(createPaperLayer())
    .add(createBoardLayer(viewOf, run.held))
    .add(createGridLayer())
    .add(createRefuseLayer(viewOf))
    .add(createFindLayer(viewOf))
    .add(createRecessLayer())
    .add(createOverLayer())
    .add(createPanelLayer(RANGE))
    .add(wipe);

  // The clock is the game's, not the wall's, so a hit stop can hold the whole board
  // still without any layer knowing that it happened.
  const clock = createClock();

  canvas.addEventListener('pointerdown', (event) => {
    const point = run.pointIn(canvas, event);
    if (!point) return;
    event.preventDefault();
    const now = performance.now();
    const at = clock.tick(now);

    // A dead run is owed a board, and the click that says so is not a guess about
    // this one.
    if (run.meter.full()) {
      run.retry();
      return;
    }

    const { outcome } = run.round.choose(point, run.span, at);
    // Rank is the size of the found set, which this click just grew. The find knows
    // whether it won, because the win is a sound it queues behind itself.
    if (outcome === 'found') {
      clock.freeze(now, TUNING.hitStopMs);
      voice.find(run.round.found.size, run.round.wonAt !== null);
    } else {
      if (outcome === 'wrong') run.meter.take(run.level.along, at);
      voice.play(outcome);
    }
  });

  const frame = (now) => {
    const at = clock.tick(now);
    const dead = run.meter.full();
    // The win plays itself out on the board, and when it has run its two seconds the
    // next level is dealt. Nothing is timed here beyond that. What is on the canvas at
    // that moment is the win's last frame, so the wipe takes the picture first: after
    // `run.next()` the state behind it is the new level's.
    //
    // The wipe is told the level it is bringing in, not the one it is taking off: the
    // grid it leaves on is the arriving level's, which is what makes the transition an
    // announcement rather than a goodbye. That is the stage after this one, which is
    // why it is asked for by depth rather than read off the run.
    if (!dead && run.round.done(at)) {
      const arriving = run.depth + 1;
      wipe.take(ctx, at, seed + arriving, stageAt(arriving).along);
      run.next();
    }
    run.settle();

    scene.render(ctx, run.frameOf(at, dead));
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
      resize();
      run.reshape(place);
    }, 150);
  });
}

// Auto-start in the browser; skipped under `node --test`.
if (typeof document !== 'undefined') {
  const canvas = document.getElementById('screen');
  if (canvas) start(canvas);
}
