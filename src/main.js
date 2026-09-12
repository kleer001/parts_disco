// Entry point. The only file that touches the DOM, the clock or an event.
// Everything it calls is pure and takes what it needs as an argument.

import { freshSeed } from './rng.js';
import { createCompositor } from './compositor.js';
import { loadAtlas } from './views.js';
import { stageAt, RANGE } from './levels.js';
import { createPaperLayer, createBoardLayer, createGridLayer, createFindLayer,
         createRefuseLayer, createRecessLayer, createOverLayer, createPanelLayer,
         createWipeLayer } from './layers.js';
import { TUNING, createClock } from './juice.js';
import { layoutFor } from './layout.js';
import { createVoice } from './audio.js';
import { createOptions } from './options.js';
import { createRun } from './run.js';
import { createTitle } from './title.js';
import { createBelt } from './belt.js';


/**
 * A pointer event's position in canvas pixels.
 *
 * The canvas is a fixed pixel budget stretched by CSS, so a client coordinate is not
 * a canvas one and the ratio changes with the window. This is the only place that
 * conversion happens.
 */
function pointOf(canvas, event) {
  const box = canvas.getBoundingClientRect();
  return [
    ((event.clientX - box.left) / box.width) * canvas.width,
    ((event.clientY - box.top) / box.height) * canvas.height,
  ];
}

/**
 * Put the title up, fetch the game behind it, and wait for PLAY.
 *
 * The order is the point. The title needs a fill and some type, so it is on screen
 * within a frame; the fleet is a couple of megabytes and arrives whenever it arrives.
 * Nothing here is a loading screen that gets replaced -- the title simply gains its
 * yard when the yard turns up, and the button goes live at the same moment.
 *
 * @returns {Promise<{fleet: object, voice: object, mode: string}>} once a mode is chosen
 */
async function openOn(canvas, ctx, placeOf, seed) {
  let title = createTitle(placeOf(), seed);
  let shape = `${canvas.width}x${canvas.height}`;
  let fleet = null;

  // The font is asked for alongside the fleet rather than ahead of it: the panel
  // measures text to size its slabs, and the title redraws every frame anyway, so it
  // picks the face up the moment it lands. The chime rides along so that no win can
  // arrive ahead of its sound; its context starts suspended, which is allowed without
  // a gesture, and the press that leaves this screen is the gesture that resumes it.
  const voice = createVoice();
  const loading = Promise.all([
    loadAtlas(), document.fonts.load('16px VT323'), voice.load(),
  ]).then(([atlas]) => { fleet = atlas; });

  // The title's own crowd, a fraction of the fleet's weight, so the yard on the screen
  // fills while the board's vehicles are still in flight.
  let yard = null;
  fetch('assets/title/yard.json').then((res) => res.json()).then((baked) => { yard = baked; });

  let showing = true;
  const paint = () => {
    if (!showing) return;
    const now = `${canvas.width}x${canvas.height}`;
    if (now !== shape) {
      title = createTitle(placeOf(), seed);
      shape = now;
    }
    title.draw(ctx, fleet, yard);
    requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);

  const mode = await new Promise((pressed) => {
    const press = (event) => {
      // `hit` answers null until the fleet has landed, so there is no way to click
      // past this screen into a game that has nothing to draw.
      const chosen = title.hit(pointOf(canvas, event));
      if (!chosen) return;
      event.preventDefault();
      canvas.removeEventListener('pointerdown', press);
      showing = false;
      pressed(chosen);
    };
    canvas.addEventListener('pointerdown', press);
  });

  await loading;
  return { fleet, voice, mode };
}

/**
 * The endless run: a belt, a clock and a meter, and nothing that holds still.
 *
 * It is its own loop rather than a branch inside the campaign's. The two share a
 * fleet, a voice and a hit test and agree on nothing else -- one deals a board and
 * waits, the other never stops arriving -- and a loop that served both would be a
 * loop with a mode flag threaded through every line of it.
 */
function runEndless(canvas, ctx, place, views, seed) {
  // Endless runs the vehicle fleet: it has no levels to shuffle groups between, it is one
  // belt that never stops. The campaign is where the groups turn over.
  const belt = createBelt(place, views.fleet.fleet('fleet'), seed);
  createOptions(document.body, views.voice, belt);

  let rank = 0;
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const now = performance.now() / 1000;
    if (belt.dead) {
      belt.restart();
      rank = 0;
      return;
    }
    const { outcome } = belt.choose(pointOf(canvas, event), now);
    if (outcome === 'found') views.voice.find(++rank, false);
    else if (outcome !== 'ground') views.voice.play(outcome);
  });

  let last = null;
  const frame = (now) => {
    const at = now / 1000;
    if (last === null) last = at;
    // Clamped, because a backgrounded tab hands back a gap of seconds and the belt
    // would arrive somewhere nobody watched it travel to.
    belt.advance(Math.min(0.1, at - last));
    last = at;

    // No clear first. The belt's sections are opaque and tile the board, and the panel
    // fills its own box, so the pair cover every pixel -- measured, 0 of 960,000
    // differ without it. A clear here is a full-screen fill that nothing ever sees.
    belt.draw(ctx);
    belt.drawPanel(ctx);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/**
 * Wire a canvas to a run and start the loop.
 * @param {HTMLCanvasElement} canvas
 * @param {number} [seed]
 */
export async function start(canvas, seed = freshSeed()) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('start() requires a <canvas> element'); // boundary
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable'); // boundary

  // The canvas is a shape, not a size: it takes the viewport's proportions and a
  // fixed pixel budget, and CSS scales it the rest of the way.
  const viewport = () =>
    layoutFor(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  let place = viewport();

  const resize = () => {
    canvas.width = place.width;
    canvas.height = place.height;
  };
  resize();

  // Nothing is fetched before this line. The fleet is megabytes and the title is a
  // fill and some type, so the screen is up on the first frame and the wait happens
  // behind it rather than in front of a blank canvas.
  const views = await openOn(canvas, ctx, () => place, seed);

  if (views.mode === 'endless') {
    runEndless(canvas, ctx, place, views, seed);
    return;
  }

  const run = createRun(place, views.fleet, seed);
  // The atlas's view reaches into the slot's own group, so one lookup draws every board
  // whatever group it deals from.
  const viewOf = views.fleet.view;

  // The one piece of HTML in the game, laid over the canvas. It is raised here rather
  // than in the markup because it has nothing to say until there is a desk to move.
  createOptions(document.body, views.voice, run);

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
    const point = pointOf(canvas, event);
    if (!run.onBoard(point)) return;
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
      views.voice.find(run.round.found.size, run.round.wonAt !== null);
    } else {
      if (outcome === 'wrong') run.meter.take(run.level.along, at);
      views.voice.play(outcome);
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
      wipe.take(ctx, at, run.seed + arriving, stageAt(arriving).along);
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
