// Endless: the yard on a conveyor, and the run that rides it.
//
// The sixteen-stage game deals a board and holds it still. This deals a belt that
// never stops arriving and asks the same question against a clock: tag every copy of
// the vehicle on the card before too many wrong ones end the run.
//
// The belt is drawn the only way that is affordable. Redrawing every vehicle every
// frame costs 78ms at a hundred and twenty of them; pre-rendering a section once and
// blitting it at a whole-pixel offset costs 0.23ms and does not move with density,
// because it is one copy either way. `dev/belt.html` is where those numbers came from
// and where they are re-taken. The offset is rounded because a snapped blit is a
// memory copy and an unsnapped one resamples -- five times the cost, and the same
// rounding is what stops a one-pixel line shimmering as it travels.
//
// Sections are coloured on their own, so two grounds meeting at a seam can share an
// ink. Inside a section the map rule holds exactly, which is where it does its work.
//
// What a player has already dealt with cannot be baked into a section, because the
// section is a picture made before the click happened. So tags are drawn over the top,
// and only the handful that have been tagged cost anything.

import { mulberry32, STRIDE } from './rng.js';
import { layout } from './board.js';
import { pick } from './game.js';
import { labelRegions, borders, assignInks } from './paint.js';
import { stampRegions, INKS, rgbOf, inkStroke, PAPER_RGB,
         SETTLED, REFUSED, PALETTE, promptCanvas,
         drawView, outline, face, tintedSlab, paintRegions } from './layers.js';
import { SEMANTIC } from './juice.js';
import { fleetLookups } from './views.js';
import { stageAt, PATH } from './levels.js';

/**
 * Which way the belt runs. One is drawn at the start of a run and holds for it.
 *
 * `sign` is which way the picture travels: -1 means content leaves by the low edge,
 * which is a belt running right-to-left or bottom-to-top.
 */
export const DIRECTIONS = [
  { name: 'right to left', axis: 'x', sign: -1 },
  { name: 'left to right', axis: 'x', sign: 1 },
  { name: 'top to bottom', axis: 'y', sign: 1 },
  { name: 'bottom to top', axis: 'y', sign: -1 },
];

/**
 * How a run tightens.
 *
 * Two dials on two schedules, so a player can tell which one is beating them. The
 * arrangement steps once a run and never inside one; the belt ramps inside a run and
 * starts over at the next.
 */
export const WAVE = {
  /** How long one run lasts, in seconds. */
  seconds: 120,
  /**
   * How fast the belt runs, in pixels a second: where every run starts, where it has
   * reached when that run is up, and what the ceiling gains once the path is spent.
   *
   * The ramp resets every run, so the belt is a sawtooth rather than one long climb.
   * What escalates before the plateau is the arrangement; the belt does the same thing
   * each time, which is what lets a player learn what it feels like. Past 4:4 there is
   * no harder arrangement left, so the ceiling is what goes on rising.
   *
   * Straight between the two rather than eased. A curve spends its steepest stretch in
   * the middle of a run, so the belt lurches at a moment nothing else happened and the
   * player reads the lurch as something they did.
   */
  speed: 40,
  topSpeed: 150,
  topSpeedPerRun: 20,
  /** How many wrong vehicles end a game. */
  errorsAllowed: 20,
  /** At least this many of the asked-for vehicle in every section. */
  leastTargets: 2,
  /**
   * How much belt starts clear, in screens.
   *
   * A belt that is already full on the first frame asks the player to begin partway
   * through something. One screen is the least that reads as a clear run up: at half a
   * screen the field is empty but the crowd is still standing in the far edge of it,
   * and the first thing a player sees is two vehicles leaving.
   *
   * A vehicle is kept out if any part of its art reaches the stretch, not merely its
   * centre. Art reaches half a span from a centre, which is 230 pixels at the opening
   * stage -- so testing centres leaves exactly the tails this is meant to avoid.
   *
   * It is only ever the opening of a game. Later runs arrive on a belt that is already
   * moving, and a gap in the middle of one would read as a fault.
   */
  leadIn: 1,
};

/**
 * What one run asks for: the campaign's arrangement, stage for stage.
 *
 * Run one is 1:1 and run sixteen is 4:4, after which `stageAt` holds at the last. The
 * two modes then escalate off one table rather than two curves that drift apart, and a
 * number tuned for one is tuned for both.
 */
export const runOf = (n) => stageAt(n);

/** Where the belt tops out on this run. It only climbs once the path is spent. */
export const topSpeedOf = (n) =>
  WAVE.topSpeed + Math.max(0, n - (PATH.length - 1)) * WAVE.topSpeedPerRun;

/**
 * How fast the belt runs, this far into this run, in pixels a second.
 *
 * The clock is the run's, not the game's: every run starts slow again.
 */
export const speedAt = (into, run) =>
  WAVE.speed + ((topSpeedOf(run) - WAVE.speed) / WAVE.seconds)
             * Math.min(into, WAVE.seconds);

/**
 * The ink the bare ground always takes on a belt.
 *
 * A board can colour its ground as a map because it is one picture. A belt is made of
 * pictures that meet, and each one sees a different window of the same yard, so the
 * ground breaks into different regions in each -- one region on one side of a join
 * standing against three on the other. A region can only be one colour, so most of
 * that join has to disagree. Pinning the ground removes the disagreement rather than
 * negotiating it, at the cost of the ground's patchwork. The vehicles keep theirs,
 * which is where the rule was doing its work: colour still never says what a thing is.
 */
const GROUND_INK = 0;

/** A seeded shuffle, so a run's order of targets reproduces from its seed. */
function shuffled(list, rand) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Start an endless run.
 *
 * @param {object} place - a `layoutFor` result; the belt fills its board field
 * @param {object} views - a loaded fleet
 * @param {number} seed - the run's; the direction and every section come off it
 */
export function createBelt(place, views, seed) {
  const { viewOf, proxyFor } = fleetLookups(views);

  const field = place.board;
  let dir, along, runLen, crossLen;

  // The region stamp is read back a pixel at a time, so it wants to stay in software
  // -- and it is the same size for every section, so it is made once rather than per
  // section. It is the only canvas here that is read rather than blitted.
  const scratch = document.createElement('canvas');
  const scratchCtx = scratch.getContext('2d', { willReadFrequently: true });

  /**
   * Point the belt, and size everything that follows from which way it runs.
   *
   * The direction is drawn once per seed and holds for the whole run: a belt that
   * changed its mind would be a different game every two minutes.
   */
  const aim = () => {
    dir = DIRECTIONS[Math.floor(mulberry32(seed)() * DIRECTIONS.length)];
    along = dir.axis === 'x';
    // A section is one screen-length of belt, which is the length at which two cover
    // the screen however far it has scrolled and a third is always waiting.
    runLen = Math.round(along ? field.width : field.height);
    crossLen = Math.round(along ? field.height : field.width);
    scratch.width = along ? runLen : crossLen;
    scratch.height = along ? crossLen : runLen;
  };
  aim();

  let into = 0;            // seconds into this run; the belt's ramp rides on this
  let offset = 0;          // how far the belt has travelled, in pixels
  let run = 0;             // which run, and so which stage of the path
  let target = null;
  let roster = [];         // the shuffled order the targets are handed out in

  // The vehicles on the belt, in the order they were dealt, each at a belt coordinate
  // rather than inside any one section. This is what makes the belt continuous: a
  // vehicle belongs to the belt, and a section is only a picture of a stretch of it,
  // so one standing on a join gets drawn into both pictures and lines up exactly.
  let cars = [];
  let dealt = new Set();   // which section indices have had their vehicles dealt
  let sections = new Map();// section index -> its rendered picture

  /**
   * The stretch of belt the game opens on, kept clear.
   *
   * Against the edge the belt leaves by, which is the low one when it runs
   * right-to-left or bottom-to-top.
   */
  const opening = () => {
    const clear = runLen * WAVE.leadIn;
    return dir.sign < 0 ? [0, clear] : [runLen - clear, runLen];
  };

  // Three tallies, all carried from run to run. A match is a vehicle tagged rightly,
  // an error is one tagged wrongly, and an escape is one that went past untagged --
  // which is a different failure from the other two and is counted as one.
  const tally = { matches: 0, errors: 0, escapes: 0 };

  /**
   * Where a belt coordinate sits on screen, along the running axis.
   *
   * One mapping for all four directions: a larger belt coordinate is always further
   * along the screen. Which way the belt runs is only which way the offset moves --
   * and it has to be only that, because a section's own pixels run in belt order and
   * nothing can reverse them without mirroring the vehicles printed on it.
   */
  const screenOf = (u) => u - offset;

  /** Deal one section-length of belt, appending to the vehicles already on it. */
  const dealInto = (index) => {
    const at = runOf(run);
    const span = Math.min(field.width, field.height) * at.size;
    const draw = seed + index * STRIDE.near + run * STRIDE.far;
    const rand = mulberry32(draw);

    // The asked-for vehicle is guaranteed present. A stretch of belt holding none of
    // it is time the player can only wait out, which is the one thing an endless mode
    // cannot afford.
    const placed = [];
    for (let i = 0; i < at.cars; i++) {
      const model = at.fleet[Math.floor(rand() * at.fleet.length)];
      const angles = views.anglesOf(model);
      placed.push({ model, angle: angles[Math.floor(rand() * angles.length)] });
    }
    let owed = WAVE.leastTargets - placed.filter((p) => p.model === target).length;
    while (owed-- > 0) {
      const angles = views.anglesOf(target);
      placed[Math.floor(rand() * placed.length)] =
        { model: target, angle: angles[Math.floor(rand() * angles.length)] };
    }

    // Thrown across the whole section, with nothing held back from its edges. A
    // vehicle that lands on a join is drawn by both neighbours rather than clipped by
    // one, so there is no band at the join where the crowd thins out.
    //
    // The opening stretch is the exception: whatever falls in it is dropped, so the
    // game starts on part of a field rather than in the middle of a full one.
    const box = along ? { x: 0, y: 0, width: runLen, height: crossLen }
                      : { x: 0, y: 0, width: crossLen, height: runLen };
    const clear = opening();
    for (const a of layout(placed, draw, span, box, proxyFor)) {
      const u = index * runLen + (along ? a.cx : a.cy);
      // Any part of it reaching the clear stretch keeps it out, not just its centre.
      if (u + span / 2 > clear[0] && u - span / 2 < clear[1]) continue;
      cars.push({
        slot: a.slot,
        u,
        cross: along ? a.cy : a.cx,
        span,
        wanted: a.slot.model === target,
        tagged: null,
        ink: null,
        seen: false,
        counted: false,
      });
    }
    dealt.add(index);
  };

  /** A vehicle placed inside one section's canvas. */
  const inSection = (car, index) => (along
    ? { slot: car.slot, span: car.span, cx: car.u - index * runLen, cy: car.cross }
    : { slot: car.slot, span: car.span, cx: car.cross, cy: car.u - index * runLen });

  /**
   * Render one stretch of belt.
   *
   * Everything whose art reaches into this stretch is drawn, including vehicles that
   * belong further along, so a vehicle on a join appears whole in both pictures.
   *
   * The colouring is handed the inks its neighbour already used along their shared
   * edge, and made to keep them. A region running off one picture and onto the next is
   * one region of one yard, and painting it two colours is what turns an arbitrary
   * rendering boundary into a stripe the player can see.
   */
  const renderSection = (index) => {
    const at = runOf(run);
    const lo = index * runLen;
    const hi = lo + runLen;
    // Half a span is how far a vehicle's art actually reaches from its centre, so
    // this is everything that puts ink on this stretch and nothing that does not.
    const mine = cars.filter((c) => c.u + c.span / 2 > lo && c.u - c.span / 2 < hi);
    const anchors = mine.map((c) => inSection(c, index));

    const w = along ? runLen : crossLen;
    const h = along ? crossLen : runLen;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    // Written to and then blitted, never read back, so it wants to stay on the GPU.
    // The scratch canvas below is the one that is read, and it keeps the hint.
    const g = canvas.getContext('2d');

    // Every anchor carries its own size, so the span argument these take is never
    // consulted. It is passed as zero rather than recomputed to say so.
    stampRegions(scratchCtx, anchors, 0, viewOf, w, h);
    const stamp = scratchCtx.getImageData(0, 0, w, h).data;

    // Nothing here is free to pick its own colours twice. The ground is always the
    // one ink, and a vehicle keeps whatever it was given the first time any section
    // drew it -- so a vehicle standing on a join is one colour, not two.
    //
    // Labelled once and coloured from that labelling. `planBoard` would label again
    // from the same pixels, and over a full-screen section that second pass is a
    // measured 13ms of repeating work.
    const { owner, regions } = labelRegions(stamp, w, h, anchors.length);
    const fixed = new Map();
    for (let r = anchors.length; r < regions; r++) fixed.set(r, GROUND_INK);
    mine.forEach((car, i) => { if (car.ink !== null) fixed.set(i, car.ink); });

    const neighbours = borders(owner, regions, w, h);
    const plan = { owner, neighbours, ink: assignInks(neighbours, at.inks, fixed).ink };
    // Whatever the colouring settled on for a vehicle it had not met before is now
    // that vehicle's, for as long as it is on the belt -- but only if this section
    // actually drew any of it. A vehicle whose art falls outside this canvas is a
    // region with no pixels and no neighbours, and the colouring hands it the ink it
    // has used least, which is the ground's. Letting that stick paints a vehicle the
    // colour of the yard in every section that follows.
    mine.forEach((car, i) => {
      if (car.ink === null && plan.neighbours[i] && plan.neighbours[i].size > 0) {
        car.ink = plan.ink[i];
      }
    });
    const shades = INKS.slice(0, at.inks).map(rgbOf);

    const img = g.createImageData(w, h);
    paintRegions(img.data, plan.owner,
                 (region) => (region < 0 ? PAPER_RGB : shades[plan.ink[region]]));
    g.putImageData(img, 0, 0);
    inkStroke(g);
    // One path per vehicle rather than one per ring. A section at full density holds
    // 120 vehicles and some 23,000 rings, and asking the canvas to open and stroke a
    // path for each of them is most of what building a section costs.
    for (const anchor of anchors) {
      outline(g, anchor, viewOf(anchor.slot).strokes, 0);
      g.stroke();
    }

    return { index, canvas };
  };

  /**
   * Hold exactly the sections the screen can see, plus the one behind them.
   *
   * The window is worked out from the offset rather than tracked, so it cannot drift
   * out of step with where the belt actually is.
   */
  /** The largest vehicle currently on the belt, for deciding what reaches where. */
  const maxSpan = () => cars.reduce((m, c) => Math.max(m, c.span), 0);

  /** Which sections are alive: two cover the screen, and one is being arrived at. */
  const wanted = () => {
    const first = Math.floor(offset / runLen);
    return dir.sign < 0 ? [first, first + 1, first + 2]
                        : [first - 1, first, first + 1];
  };

  /** Whether a vehicle has gone past the screen on the side the belt leaves by. */
  const isPast = (car) => (dir.sign < 0 ? car.u + car.span < offset
                                        : car.u - car.span > offset + runLen);

  const restock = () => {
    const want = wanted();
    // Dealt a section wider than it is drawn, on both sides. A vehicle near a join
    // reaches back into its neighbour, and a section rendered before that neighbour
    // had been dealt has a vehicle-shaped hole where the neighbour will draw one --
    // which is the join showing itself.
    const first = Math.min(...want) - 1;
    const last = Math.max(...want) + 1;
    for (let index = first; index <= last; index++) {
      if (!dealt.has(index)) dealInto(index);
    }

    // Everything the live sections might have to draw has to stay on the belt. The
    // window is worked out from the sections rather than from the screen: a section
    // reaches a whole section-length beyond what anyone can see, and a vehicle dropped
    // before the section holding it was drawn is a hole in that section -- which is
    // what a join built from an incomplete list looks like.
    const reach = maxSpan();
    const lo = first * runLen - reach;
    const hi = (last + 1) * runLen + reach;

    const kept = [];
    for (const car of cars) {
      // A vehicle only gets away if it was there to be caught. The belt is dealt on
      // both sides of the screen, so a freshly dealt one can already sit beyond the
      // far edge -- it has not gone past the player, it has not arrived yet.
      if (!car.seen && car.u + car.span / 2 > offset
                    && car.u - car.span / 2 < offset + runLen) {
        car.seen = true;
      }
      // Gone past the screen is what counts as having got away, and it is counted the
      // once. Leaving the belt entirely happens later and is only housekeeping.
      if (car.seen && !car.counted && isPast(car)) {
        car.counted = true;
        if (car.wanted && !car.tagged) tally.escapes++;
      }
      if (car.u >= lo && car.u <= hi) kept.push(car);
    }
    cars = kept;

    for (const index of [...sections.keys()]) {
      if (!want.includes(index)) sections.delete(index);
    }
    // Built towards the edge the belt is arriving at, so each has a drawn neighbour.
    for (const index of (dir.sign < 0 ? want : [...want].reverse())) {
      if (!sections.has(index)) sections.set(index, renderSection(index));
    }
  };

  let card = null;         // the render of what is being asked for
  let printed = null;      // that render made ready to print, once it has loaded

  /**
   * The next vehicle to ask for.
   *
   * Dealt from a shuffled roster rather than rolled, so every model in the fleet is
   * asked for once before any is asked for twice. The roster is reshuffled when it
   * runs out, and when the stage changes which vehicles are in play.
   */
  const nextTarget = () => {
    const fleet = runOf(run).fleet;
    const rand = mulberry32(seed + run * STRIDE.near + 13);
    if (!roster.length || roster.some((m) => !fleet.includes(m))) {
      roster = shuffled(fleet, rand);
      // Never the same model twice running, even across a reshuffle.
      if (roster[0] === target && roster.length > 1) {
        [roster[0], roster[1]] = [roster[1], roster[0]];
      }
    }
    return roster.shift();
  };

  /** Whether the run is finished. */
  const over = () => tally.errors >= WAVE.errorsAllowed;

  const nextRun = () => {
    target = nextTarget();
    // Shown from an angle the belt will not hand you, the same as the campaign: a
    // picture you can match against a picture is not identification.
    const angles = views.anglesOf(target);
    const rand = mulberry32(seed + run * STRIDE.far + 7);
    printed = null;
    // The render is one bit deep and cannot be resampled until its dither has been
    // averaged back into greys, which `promptCanvas` does. Done once, when the render
    // arrives, rather than per frame.
    //
    // The handler holds the image it was attached to rather than reading whichever is
    // current. Runs turn over on a two-minute clock and renders arrive in
    // milliseconds, so the two never normally cross -- but they do under a slow
    // network or a fast-forward, and then the wrong render is flattened, or one that
    // has not decoded at all and has no width to read.
    const arriving = new Image();
    arriving.addEventListener('load', () => {
      if (card === arriving) printed = promptCanvas(arriving);
    }, { once: true });
    arriving.src = views.promptFor(target, angles[Math.floor(rand() * angles.length)]);
    card = arriving;
    into = 0;
    // A new run is a new arrangement, but only for belt that has not arrived yet:
    // what a player can already see stays as it is until it has scrolled off, so the
    // board never changes under a click.
    const showing = wanted().slice(0, 2);
    for (const index of [...dealt]) {
      if (!showing.includes(index)) dealt.delete(index);
    }
    const keep = new Set(showing);
    cars = cars.filter((c) => keep.has(Math.floor(c.u / runLen)));
    for (const index of [...sections.keys()]) {
      if (!showing.includes(index)) sections.delete(index);
    }
    restock();
  };
  nextRun();

  /** Where a vehicle sits on screen this frame. */
  const onScreen = (car) => {
    const at = Math.round(screenOf(car.u));
    return along
      ? { slot: car.slot, span: car.span, cx: field.x + at, cy: field.y + car.cross }
      : { slot: car.slot, span: car.span, cx: field.x + car.cross, cy: field.y + at };
  };

  return {
    get target() { return target; },
    get tally() { return { ...tally }; },
    get run() { return run; },
    get secondsLeft() { return Math.max(0, WAVE.seconds - into); },
    get speed() { return speedAt(into, run); },
    get direction() { return dir; },
    get dead() { return over(); },

    /** Move the belt on, and turn the run over when its two minutes are up. */
    advance(dt) {
      if (over()) return;
      into += dt;
      // Away from the edge the belt leaves by. A belt running right-to-left leaves by
      // the low edge, so its offset climbs and the picture slides down towards it.
      offset -= dir.sign * speedAt(into, run) * dt;
      if (into >= WAVE.seconds) {
        run++;
        nextRun();
        return;
      }
      restock();
    },

    /**
     * Answer a click.
     *
     * Sections do not overlap, so the one a point lands in is the only one that can
     * own it, and inside a section the ordinary board hit test applies.
     */
    choose(point, now) {
      if (over()) return { outcome: 'again', slot: null };

      // Tested against the vehicles rather than against the pictures of them, so a
      // vehicle standing on a join is one thing to click and not two halves. The list
      // is in draw order, so walking it backwards asks the topmost one first.
      const placed = cars.map(onScreen);
      const hit = pick(placed, cars.length ? cars[0].span : 1, point, viewOf);
      if (!hit) return { outcome: 'ground', slot: null };

      const car = cars[hit.index];
      if (car.tagged) return { outcome: 'again', slot: car.slot };
      car.tagged = { when: now, right: car.wanted };
      if (!car.wanted) {
        // Every wrong vehicle costs the same here. The campaign's price falls along
        // its path because the path has an end; a belt does not.
        tally.errors++;
        return { outcome: 'wrong', slot: car.slot };
      }
      tally.matches++;
      return { outcome: 'found', slot: car.slot };
    },

    /**
     * Blit the live sections, then mark what has been answered.
     *
     * The offset is rounded, which is the whole trick. Tags go over the top because a
     * section is a picture taken before the click, and only the answered ones are
     * drawn, so the overlay costs what the player has earned rather than what is on
     * screen.
     */
    draw(ctx) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(field.x, field.y, field.width, field.height);
      ctx.clip();

      for (const [index, section] of sections) {
        const at = Math.round(screenOf(index * runLen));
        if (along) ctx.drawImage(section.canvas, field.x + at, field.y);
        else ctx.drawImage(section.canvas, field.x, field.y + at);
      }

      for (const car of cars) {
        if (!car.tagged) continue;
        const anchor = onScreen(car);
        const view = viewOf(anchor.slot);
        drawView(ctx, anchor, view, 0, { fill: car.tagged.right ? SETTLED : REFUSED });
      }
      ctx.restore();
    },

    /**
     * What the run is worth and what is left of it.
     *
     * Everything here is a number the player is spending or earning, so it is set in
     * the same slab language the campaign's panel uses: the score in the green a find
     * wears, the clock in amber as it runs out, damage in red.
     */
    drawPanel(ctx) {
      const box = place.panel;
      const pad = Math.round(Math.min(box.width, box.height) * 0.06);
      const line = Math.max(13, Math.round(Math.min(box.width, box.height) * 0.075));

      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.width, box.height);
      ctx.clip();
      ctx.fillStyle = PALETTE.panel;
      ctx.fillRect(box.x, box.y, box.width, box.height);

      // The card, as large as the panel's short edge allows. Drawn from the flattened
      // render: scaling the one-bit original by anything but a whole number beats its
      // dot grid against the pixel grid, which prints bright cross hatches over the
      // vehicle.
      const cardSize = Math.min(box.height - pad * 2, box.width * 0.33);
      if (printed) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(printed, box.x + pad, box.y + pad, cardSize, cardSize);
      }
      ctx.strokeStyle = PALETTE.rule;
      ctx.lineWidth = 1;
      ctx.strokeRect(box.x + pad + 0.5, box.y + pad + 0.5, cardSize, cardSize);

      const left = box.x + pad * 2 + cardSize;
      const room = box.x + box.width - pad - left;
      let y = box.y + pad;

      // Padding is this panel's to choose; what a slab is, is not.
      const slab = (text, role, size) => {
        y += tintedSlab(ctx, left, y, text, role, {
          font: face(size), size, pad: size * 0.3, radius: size * 0.16, maxWidth: room,
        }) + pad * 0.45;
      };

      ctx.textAlign = 'left';
      ctx.fillStyle = SEMANTIC.quiet.ink;
      ctx.font = face(line * 0.62);
      const at = runOf(run);
      ctx.fillText(`RUN ${run + 1} · ${at.level}:${at.stage} · ${dir.name.toUpperCase()}`,
                   left, y);
      y += line * 0.72;

      slab(target ? target.toUpperCase() : '', SEMANTIC.target, line);
      slab(`${tally.matches} TAGGED`, SEMANTIC.found, line);

      // The clock, as a bar that empties rather than a number that counts down.
      const barH = Math.max(4, Math.round(line * 0.22));
      ctx.fillStyle = SEMANTIC.last.tint;
      ctx.fillRect(left, y, room, barH);
      ctx.fillStyle = SEMANTIC.last.loud;
      ctx.fillRect(left, y, room * Math.max(0, (WAVE.seconds - into) / WAVE.seconds),
                   barH);
      y += barH + pad * 0.6;

      // The two ways of being wrong, kept apart. Tagging the wrong vehicle is a
      // different mistake from letting the right one go past, and a player who cannot
      // see which one is costing them cannot do anything about either.
      slab(`${tally.errors} / ${WAVE.errorsAllowed} WRONG`, SEMANTIC.miss, line * 0.8);
      slab(`${tally.escapes} GOT PAST`, SEMANTIC.quiet, line * 0.8);

      if (over()) {
        ctx.fillStyle = SEMANTIC.miss.ink;
        ctx.font = face(line * 0.95);
        ctx.textAlign = 'center';
        ctx.fillText(`${tally.matches} TAGGED — CLICK TO BEGIN AGAIN`,
                     box.x + box.width / 2, box.y + box.height - pad);
      }
      ctx.textAlign = 'left';
      ctx.restore();
    },

    /** Wipe the tallies and start over from the first arrangement. */
    restart() {
      tally.matches = 0;
      tally.errors = 0;
      tally.escapes = 0;
      into = 0;
      offset = 0;
      run = 0;
      roster = [];
      cars = [];
      dealt = new Set();
      sections = new Map();
      nextRun();
    },

    /** What is dealing this run, so it can be shown and written down. */
    get seed() { return seed; },

    /**
     * Start again on a different draw.
     *
     * A seed picks the belt's direction as well as its contents, so taking a new one
     * is a different game and not a different board.
     */
    reseed(next) {
      seed = next;
      aim();
      this.restart();
    },
  };
}
