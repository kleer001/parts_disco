// Endless: the yard on a conveyor, and the run that rides it.
//
// The sixteen-stage game deals a board and holds it still. This deals a belt that
// never stops arriving and asks the same question against a clock: tag every copy of
// the vehicle on the card, and ten wrong ones end the run.
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

import { mulberry32 } from './rng.js';
import { layout } from './board.js';
import { pick } from './game.js';
import { planBoard } from './paint.js';
import { stampRegions, INKS, rgbOf, ring, inkStroke, PAPER_RGB,
         SETTLED, REFUSED, PALETTE, roundRect } from './layers.js';
import { SEMANTIC } from './juice.js';
import { proxyOf } from './views.js';
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
  const viewOf = (slot) => views.view(slot.model, slot.angle);
  const proxies = new Map();
  const proxyFor = (slot) => {
    const key = `${slot.model}/${slot.angle}`;
    if (!proxies.has(key)) proxies.set(key, proxyOf(viewOf(slot)));
    return proxies.get(key);
  };

  const field = place.board;
  // The direction is drawn once per seed and holds for the run: a belt that changed
  // its mind mid-run would be a different game every two minutes.
  let dir = DIRECTIONS[Math.floor(mulberry32(seed)() * DIRECTIONS.length)];
  let along = dir.axis === 'x';
  // A section is one screen-length of belt, which is the length at which two cover the
  // screen however far it has scrolled and a third is always waiting.
  let runLen = Math.round(along ? field.width : field.height);
  let crossLen = Math.round(along ? field.height : field.width);

  let into = 0;            // seconds into this run; the belt's ramp rides on this
  let offset = 0;          // how far the belt has travelled, in pixels
  let run = 0;             // which run, and so which stage of the path
  let target = null;
  let roster = [];         // the shuffled order the targets are handed out in
  let live = new Map();    // section index -> the built section

  // Three tallies, all carried from run to run. A match is a vehicle tagged rightly,
  // an error is one tagged wrongly, and an escape is one that went past untagged --
  // which is a different failure from the other two and is counted as one.
  const tally = { matches: 0, errors: 0, escapes: 0 };

  /**
   * Deal and render one section.
   *
   * Vehicle centres are inset by half a span along the running axis so that nothing is
   * cut in half by the edge of its own canvas. Art still reaches the seam from both
   * sides, so the join stays covered; what thins is the density of centres, not the
   * coverage.
   */
  const buildSection = (index) => {
    const at = runOf(run);
    const span = Math.min(field.width, field.height) * at.size;
    const draw = seed + index * 7919 + run * 104729;
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

    const inset = along
      ? { x: 0, y: 0, width: Math.max(1, runLen - span), height: crossLen }
      : { x: 0, y: 0, width: crossLen, height: Math.max(1, runLen - span) };
    const anchors = layout(placed, draw, span, inset, proxyFor).map((a) => ({
      slot: a.slot,
      cx: a.cx + (along ? span / 2 : 0),
      cy: a.cy + (along ? 0 : span / 2),
    }));

    const w = along ? runLen : crossLen;
    const h = along ? crossLen : runLen;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d', { willReadFrequently: true });

    // The ground is a map rather than a palette: the plan says which region takes
    // which ink, and owns a pixel-for-pixel record of which region is where.
    const scratch = document.createElement('canvas');
    scratch.width = w;
    scratch.height = h;
    const sg = scratch.getContext('2d', { willReadFrequently: true });
    stampRegions(sg, anchors, span, viewOf, w, h);
    const plan = planBoard(sg.getImageData(0, 0, w, h).data, w, h, anchors.length,
                           at.inks);
    const shades = INKS.slice(0, at.inks).map(rgbOf);

    const img = g.createImageData(w, h);
    const out = img.data;
    for (let p = 0; p < plan.owner.length; p++) {
      const region = plan.owner[p];
      const rgb = region < 0 ? PAPER_RGB : shades[plan.ink[region]];
      const i = p * 4;
      out[i] = rgb[0];
      out[i + 1] = rgb[1];
      out[i + 2] = rgb[2];
      out[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    inkStroke(g);
    for (const anchor of anchors) {
      for (const points of viewOf(anchor.slot).strokes) {
        ring(g, anchor, points, span);
        g.stroke();
      }
    }

    // How many of the asked-for vehicle rode in on this section, so that what is left
    // untagged when it leaves can be counted as having got away.
    const carrying = anchors.filter((a) => a.slot.model === target).length;
    return { index, canvas, anchors, span, carrying, tagged: new Map() };
  };

  /**
   * Where a section's near edge sits on screen, along the running axis.
   *
   * Both directions run the same counter forwards; which edge new belt arrives at is
   * the only difference, and it is the sign that says so.
   */
  const screenOf = (index) =>
    dir.sign < 0 ? index * runLen - offset : offset - index * runLen;

  /**
   * Hold exactly the sections the screen can see, plus the one behind them.
   *
   * The window is worked out from the offset rather than tracked, so it cannot drift
   * out of step with where the belt actually is.
   */
  const restock = () => {
    const first = Math.floor(offset / runLen);
    const want = [first, first + 1, first + 2];
    for (const [index, section] of live) {
      if (want.includes(index)) continue;
      // A section leaving is the moment its untagged targets have got away. It is the
      // only moment they can be counted: before it there is still time to tag them.
      let caught = 0;
      for (const tag of section.tagged.values()) if (tag.right) caught++;
      tally.escapes += Math.max(0, section.carrying - caught);
      live.delete(index);
    }
    for (const index of want) {
      if (!live.has(index)) live.set(index, buildSection(index));
    }
  };

  let card = null;         // the picture of what is being asked for

  /**
   * The next vehicle to ask for.
   *
   * Dealt from a shuffled roster rather than rolled, so every model in the fleet is
   * asked for once before any is asked for twice. The roster is reshuffled when it
   * runs out, and when the stage changes which vehicles are in play.
   */
  const nextTarget = () => {
    const fleet = runOf(run).fleet;
    const rand = mulberry32(seed + run * 7919 + 13);
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
    const rand = mulberry32(seed + run * 104729 + 7);
    card = new Image();
    card.src = views.promptFor(target, angles[Math.floor(rand() * angles.length)]);
    into = 0;
    // Only what arrives is new: what is already in front of the player stays as it is
    // until it has scrolled past, so the board never changes under a click.
    live = new Map();
    restock();
  };
  nextRun();

  /** A section's anchor, moved to where it is on screen this frame. */
  const onScreen = (index, anchor) => {
    const at = Math.round(screenOf(index));
    return along
      ? { slot: anchor.slot, cx: field.x + anchor.cx + at, cy: field.y + anchor.cy }
      : { slot: anchor.slot, cx: field.x + anchor.cx, cy: field.y + anchor.cy + at };
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
      offset += speedAt(into, run) * dt;
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
      const a = (along ? point[0] : point[1]) - (along ? field.x : field.y);
      const cross = (along ? point[1] : point[0]) - (along ? field.y : field.x);
      if (cross < 0 || cross > crossLen) return { outcome: 'ground', slot: null };

      for (const [index, section] of live) {
        const near = screenOf(index);
        if (a < near || a > near + runLen) continue;
        const local = along ? [a - near, cross] : [cross, a - near];
        const hit = pick(section.anchors, section.span, local, viewOf);
        if (!hit) return { outcome: 'ground', slot: null };
        if (section.tagged.has(hit.index)) return { outcome: 'again', slot: hit.slot };

        const right = hit.slot.model === target;
        section.tagged.set(hit.index, { when: now, right });
        if (!right) {
          // Every wrong vehicle costs the same here. The campaign's price falls along
          // its path because the path has an end; a belt does not.
          tally.errors++;
          return { outcome: 'wrong', slot: hit.slot };
        }
        tally.matches++;
        return { outcome: 'found', slot: hit.slot };
      }
      return { outcome: 'ground', slot: null };
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

      for (const [index] of live) {
        const section = live.get(index);
        const at = Math.round(screenOf(index));
        if (along) ctx.drawImage(section.canvas, field.x + at, field.y);
        else ctx.drawImage(section.canvas, field.x, field.y + at);
      }

      for (const [index, section] of live) {
        for (const [which, tag] of section.tagged) {
          const anchor = onScreen(index, section.anchors[which]);
          const view = viewOf(anchor.slot);
          ctx.fillStyle = tag.right ? SETTLED : REFUSED;
          for (const points of view.silhouette) {
            ring(ctx, anchor, points, section.span);
            ctx.fill();
          }
          inkStroke(ctx);
          for (const points of view.strokes) {
            ring(ctx, anchor, points, section.span);
            ctx.stroke();
          }
        }
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
      const type = (px) => `${Math.round(px)}px VT323, monospace`;

      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.width, box.height);
      ctx.clip();
      ctx.fillStyle = PALETTE.panel;
      ctx.fillRect(box.x, box.y, box.width, box.height);

      // The card, as large as the panel's short edge allows.
      const cardSize = Math.min(box.height - pad * 2, box.width * 0.33);
      if (card && card.complete && card.naturalWidth) {
        ctx.drawImage(card, box.x + pad, box.y + pad, cardSize, cardSize);
      }
      ctx.strokeStyle = PALETTE.rule;
      ctx.lineWidth = 1;
      ctx.strokeRect(box.x + pad + 0.5, box.y + pad + 0.5, cardSize, cardSize);

      const left = box.x + pad * 2 + cardSize;
      const room = box.x + box.width - pad - left;
      let y = box.y + pad;

      const slab = (text, role, size) => {
        ctx.font = type(size);
        const w = Math.min(room, ctx.measureText(text).width + size * 0.7);
        const h = size * 0.86 + size * 0.4;
        roundRect(ctx, left, y, w, h, size * 0.16);
        ctx.fillStyle = role.tint;
        ctx.fill();
        ctx.fillStyle = role.ink;
        ctx.textBaseline = 'middle';
        ctx.fillText(text, left + size * 0.35, y + h / 2 + 1);
        ctx.textBaseline = 'top';
        y += h + pad * 0.45;
      };

      ctx.textAlign = 'left';
      ctx.fillStyle = SEMANTIC.quiet.ink;
      ctx.font = type(line * 0.62);
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
        ctx.font = type(line * 0.95);
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
      dir = DIRECTIONS[Math.floor(mulberry32(seed)() * DIRECTIONS.length)];
      along = dir.axis === 'x';
      runLen = Math.round(along ? field.width : field.height);
      crossLen = Math.round(along ? field.height : field.width);
      this.restart();
    },
  };
}
