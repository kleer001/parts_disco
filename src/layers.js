// Draw passes. Each honors the { name, draw(ctx, frame) } contract and reads the
// frame it is handed.
//
// The board layer is the odd one: it draws itself twice. The first drawing is only a
// question -- which regions does this board have, and which of them share a border --
// because a car and the ground beside it are one flat map and the map decides every
// colour on it. The answer is laid down underneath a second drawing rather than
// painted over the first, since a car's softened edge is neither car nor ground and
// survives any test for either.

import { mulberry32 } from './rng.js';
import { flashesBy } from './game.js';
import { SEMANTIC, TUNING, cardShake, findPulse, gridCellAt, meterKick,
         refuseWash } from './juice.js';

export const PALETTE = {
  paper: '#f4f1ea',
  ink: '#1a1a1a',
  panel: '#ffffff',
  rule: '#d4d0c8',
};

export const PAPER_RGB = [0xf4, 0xf1, 0xea];

/** Flat inks, held back from full saturation so the black linework survives on them. */
export const INKS = [
  '#c4553d', '#2f6b6a', '#c08a2e', '#4a6b96',
  '#6d7f52', '#8c5a72', '#9c9384', '#3f4a58',
];

export const STROKE = 1.5;

export const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** The inks pre-parsed, because the repaint loop wants numbers, not hex. */
const INK_RGB = INKS.map(rgbOf);

// When a winner stops flashing and blows out to white. The ground whitens across the
// whole win; a car holds its colour most of the way, so the flashes are still there
// to be seen when they are at their fastest.
const BURN_OUT = 0.75;

/**
 * The ink a winning vehicle is showing on its nth flash.
 *
 * Never the ink it showed last time. One in eight flashes would otherwise repeat and
 * read as a flash that did not happen, which at fifty milliseconds is the difference
 * between quick and stuttering.
 */
function flashInk(car, flash) {
  const roll = (n) => Math.abs(Math.imul(car * 2654435761 + n * 40503, 2246822519)) % 7;
  let ink = roll(0) % INKS.length;
  for (let n = 1; n <= flash; n++) ink = (ink + 1 + roll(n)) % INKS.length;
  return ink;
}

/**
 * The colour a found vehicle comes to rest in.
 *
 * Not one of the board's inks. Every ink is spent on the puzzle, so a resting colour
 * drawn from that set is a colour some unfound vehicle is also wearing -- the only
 * record that a vehicle was found reads as one more thing to sort through. A neutral
 * grey is in no one else's alphabet, so a found vehicle leaves the puzzle visibly.
 *
 * Its luminance is the darkest ink's, which is what keeps the black linework reading
 * over it exactly as it reads over the rest of the board.
 */
export const SETTLED = '#4c4c4c';
export const SETTLED_RGB = rgbOf(SETTLED);

/** The wash a refused vehicle wears for as long as the refusal lasts. */
export const REFUSED = '#c9c9c9';

/**
 * Trace one closed ring of a view, placed and sized.
 *
 * The swing is what a pulsing vehicle adds. It lives here rather than in the find
 * layer so that how a view lands on the board is stated once: a pulse that drew
 * itself by its own rule would drift off the board it is drawn over.
 */
function ring(ctx, anchor, points, span, scale = 1, dx = 0, dy = 0) {
  ctx.beginPath();
  for (let k = 0; k < points.length; k++) {
    const x = anchor.cx + (points[k][0] - 0.5) * span * scale + dx;
    const y = anchor.cy + (points[k][1] - 0.5) * span * scale + dy;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
}

/**
 * The cell the grid actually rules, which is not quite the cell it was asked for.
 *
 * The tile is eight cells wide and has to be a whole number of pixels, so the ask is
 * rounded on its way into the texture. The wipe steps on the same lines, and a wipe
 * stepping on the asked-for cell would drift off the ruled one across the screen --
 * so both read the cell from here rather than from `gridCellAt`.
 */
const cellOf = (s, along) => Math.max(8, Math.round(gridCellAt(along, s) * 8)) / 8;

/** How type is set, wherever it is set. */
const face = (px, s) => `${Math.round(px * s.typeScale)}px VT323, monospace`;

/** How a vehicle's linework is drawn, wherever it is drawn. */
function inkStroke(ctx) {
  ctx.lineWidth = STROKE;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = PALETTE.ink;
}

/** A shaded edge falling away from a lip, for anything sitting in a well. */
function sunkEdge(ctx, x0, y0, x1, y1, alpha) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
}

/**
 * Draw each car in a flat colour that is only its number, for a plan to be read back
 * off. Never seen: this is the question the colouring is the answer to.
 */
export function stampRegions(ctx, anchors, span, viewOf, width, height) {
  ctx.fillStyle = 'rgb(255,255,255)';
  ctx.fillRect(0, 0, width, height);
  anchors.forEach((anchor, i) => {
    ctx.fillStyle = `rgb(${i}, ${255 - i}, ${(i * 37) % 256})`;
    for (const points of viewOf(anchor.slot).silhouette) {
      ring(ctx, anchor, points, span);
      ctx.fill();
    }
  });
}

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

/**
 * The board: every car, the ground between them, and the colours both are painted in.
 *
 * The plan arrives already worked out -- which regions the board has, which of them
 * touch, and what ink each was given. That is a fact about the placement and the
 * placement does not move, so it is settled once when the board is laid rather than
 * asked again sixty times a second. What is left here is a lookup and a fade.
 */
export function createBoardLayer(viewOf, cache, palette = PALETTE) {
  let buffer = null;
  let heldPlan = null;
  let heldFound = -1;

  return {
    name: 'board',
    draw(ctx, frame) {
      const { standing, plan, shades, span, width, height, round, at } = frame;
      const won = round.winning(at);
      const burn = Math.max(0, (won - BURN_OUT) / (1 - BURN_OUT));

      // What the board looks like with nothing moving on it: every car in the ink the
      // map gave it, or in the one it came to rest in after being found.
      const restingOf = (region) => {
        if (region < 0) return PAPER_RGB;
        if (region < standing.length && round.found.has(region)) return SETTLED_RGB;
        return shades[plan.ink[region]];
      };

      const repaint = (colourOf, fadeOf) => {
        if (!buffer) buffer = ctx.createImageData(width, height);
        const out = buffer.data;
        const owner = plan.owner;
        for (let p = 0; p < owner.length; p++) {
          const base = colourOf(owner[p]);
          const fade = fadeOf(owner[p]);
          const i = p * 4;
          out[i] = base[0] + (255 - base[0]) * fade;
          out[i + 1] = base[1] + (255 - base[1]) * fade;
          out[i + 2] = base[2] + (255 - base[2]) * fade;
          out[i + 3] = 255;
        }
        ctx.putImageData(buffer, 0, 0);
      };

      const stroke = () => {
        inkStroke(ctx);
        for (const anchor of standing) {
          for (const points of viewOf(anchor.slot).strokes) {
            ring(ctx, anchor, points, span);
            ctx.stroke();
          }
        }
      };

      // The still board is kept and put back down, because most frames are the same
      // picture as the last one. It is rebuilt when the map changes or a car is found,
      // and it shows found cars already at rest -- whatever is answering a find is
      // painted over it afterwards.
      if (heldPlan !== plan || heldFound !== round.found.size) {
        repaint(restingOf, () => 0);
        stroke();
        cache.getContext('2d').drawImage(ctx.canvas, 0, 0, width, height, 0, 0, width, height);
        heldPlan = plan;
        heldFound = round.found.size;
      }

      // The win repaints everything every frame: the winners flash through every ink
      // the game has, and the ground whitens under all of them at once.
      if (won > 0) {
        const flash = flashesBy(won);
        const flashing = standing.map((_, i) => INK_RGB[flashInk(i, flash)]);
        repaint(
          (region) => (region < 0 ? PAPER_RGB
            : region < standing.length ? flashing[region] : shades[plan.ink[region]]),
          (region) => (region >= 0 && region < standing.length ? burn : won));
        stroke();
        return;
      }

      // Nothing on the board moves under its own steam. A found vehicle is answered
      // by the find layer, over the top, so the kept board is the whole picture.
      ctx.drawImage(cache, 0, 0);
    },
  };
}


/**
 * The ground the diagram is printed on: a ruled grid under a film of noise.
 *
 * Baked once into a tile and blitted, because the noise is a fact about the texture
 * and not about the frame. Regenerating it every frame would make it crawl, which
 * reads as a fault rather than as paper.
 *
 * The cell tightens as the path does, so the ground says how deep the board is.
 */
export function createGridLayer(settings = () => TUNING) {
  let tile = null;
  let mask = null;
  let cut = null;
  let tileKey = null;
  let cutKey = null;
  let planFrom = null;

  // Everything the tile is made of. One place, because a knob added to the tile and
  // forgotten here leaves a stale texture with nothing to report it.
  const keyOf = (s, cell) =>
    `${cell.toFixed(3)}|${s.gridAlpha}|${s.gridNoise}|${s.gridNoiseScale}`;

  const build = (s, cell) => {
    // Eight cells to a tile, so the repeat seam never lands on a rule.
    const size = Math.max(8, Math.round(cell * 8));
    tile = document.createElement('canvas');
    tile.width = size;
    tile.height = size;
    const c = tile.getContext('2d');

    if (s.gridNoise > 0) {
      const step = Math.max(1, Math.round(s.gridNoiseScale));
      const img = c.createImageData(size, size);
      // Its own seed, not the run's: the paper is a property of the texture and
      // should not change when the seed that deals the board does.
      const rand = mulberry32(0x9e3779b9);
      for (let y = 0; y < size; y += step) {
        for (let x = 0; x < size; x += step) {
          const v = rand() * 256 - 128;
          for (let j = 0; j < step && y + j < size; j++) {
            for (let i = 0; i < step && x + i < size; i++) {
              const p = ((y + j) * size + (x + i)) * 4;
              img.data[p] = img.data[p + 1] = img.data[p + 2] = 0;
              img.data[p + 3] = Math.max(0, v) * s.gridNoise * 2;
            }
          }
        }
      }
      c.putImageData(img, 0, 0);
    }

    c.strokeStyle = `rgba(0,0,0,${s.gridAlpha})`;
    c.lineWidth = 1;
    for (let at = 0; at <= size; at += size / 8) {
      c.beginPath();
      c.moveTo(at + 0.5, 0);
      c.lineTo(at + 0.5, size);
      c.moveTo(0, at + 0.5);
      c.lineTo(size, at + 0.5);
      c.stroke();
    }
  };

  // Which pixels are ground rather than vehicle. A fact about the plan, so it is
  // asked when the plan changes and not once a frame.
  const buildMask = (frame) => {
    mask = document.createElement('canvas');
    mask.width = frame.width;
    mask.height = frame.height;
    const c = mask.getContext('2d');
    const img = c.createImageData(frame.width, frame.height);
    const owner = frame.plan.owner;
    const cars = frame.standing.length;
    for (let p = 0; p < owner.length; p++) {
      img.data[p * 4 + 3] = owner[p] >= cars ? 255 : 0;
    }
    c.putImageData(img, 0, 0);
  };

  return {
    name: 'grid',
    draw(ctx, frame) {
      const s = settings();
      if (s.gridAlpha <= 0 && s.gridNoise <= 0) return;
      const cell = cellOf(s, frame.level.along);
      const key = keyOf(s, cell);
      if (tileKey !== key) {
        build(s, cell);
        tileKey = key;
      }

      if (!s.gridGroundOnly) {
        ctx.fillStyle = ctx.createPattern(tile, 'repeat');
        ctx.fillRect(0, 0, frame.width, frame.height);
        return;
      }

      // The tile cut to the ground is kept and blitted. Two things change it -- the
      // texture and the map it is cut to -- and cutting it every frame would allocate
      // a field-sized canvas sixty times a second to arrive at the same picture.
      if (planFrom !== frame.plan) {
        buildMask(frame);
        cutKey = null;
      }
      if (cutKey !== key) {
        if (!cut) {
          cut = document.createElement('canvas');
          cut.width = frame.width;
          cut.height = frame.height;
        }
        const c = cut.getContext('2d');
        c.clearRect(0, 0, frame.width, frame.height);
        c.fillStyle = c.createPattern(tile, 'repeat');
        c.fillRect(0, 0, frame.width, frame.height);
        c.globalCompositeOperation = 'destination-in';
        c.drawImage(mask, 0, 0);
        c.globalCompositeOperation = 'source-over';
        cutKey = key;
      }
      planFrom = frame.plan;
      ctx.drawImage(cut, 0, 0);
    },
  };
}

/**
 * The vehicles answering a find: a pulse, a shake and a strobe, over the board.
 *
 * Drawn on top rather than into the board, so the kept board never rebuilds for it.
 * A vehicle at the peak of its pulse reaches well outside its own bounds, which a
 * repaint of that box could not have covered anyway.
 */
export function createFindLayer(viewOf, settings = () => TUNING) {
  return {
    name: 'find',
    draw(ctx, frame) {
      const s = settings();
      const { standing, span, round, at, plan } = frame;
      if (round.winning(at) > 0) return;

      // Rank is the order this one was found in, which is what the escalation reads.
      // A Map keeps insertion order and finds are inserted as they happen, so the
      // walk is already ranked -- nothing has to be collected or sorted to know it.
      const alive = s.pulseMs / 1000;
      let rank = 0;
      for (const [region, when] of round.found) {
        rank++;
        // Almost every entry is a find that finished seconds ago. Skipping those on a
        // subtraction keeps a full round from costing a pulse's worth of work each.
        if (at - when >= alive || region >= standing.length) continue;
        const pulse = findPulse(at - when, s, rank);
        if (!pulse.alive) continue;

        const anchor = standing[region];
        const view = viewOf(anchor.slot);
        // The off beat is the colour the vehicle is about to keep, so the pulse ends
        // on the board's own answer instead of changing colour once more after it.
        ctx.fillStyle = pulse.lit ? SEMANTIC.found.loud : SETTLED;
        for (const points of view.silhouette) {
          ring(ctx, anchor, points, span, pulse.scale, pulse.dx, pulse.dy);
          ctx.fill();
        }
        inkStroke(ctx);
        for (const points of view.strokes) {
          ring(ctx, anchor, points, span, pulse.scale, pulse.dx, pulse.dy);
          ctx.stroke();
        }
      }
    },
  };
}

/**
 * The vehicles refusing a click: a light wash over the one that was hit in error.
 *
 * Drawn over the board and not into it, for the reason the find pulse is -- the board
 * is a kept bitmap and a wash that is gone in half a second is not worth rebuilding
 * it. The linework is redrawn at the wash's own alpha so the vehicle keeps the edge
 * it had, and the wash reads as the colour draining out of it rather than as a shape
 * being painted over.
 *
 * It sits under the find pulse: a wrong click and a find can overlap, and the answer
 * is the thing that should be on top.
 */
export function createRefuseLayer(viewOf, settings = () => TUNING) {
  return {
    name: 'refuse',
    draw(ctx, frame) {
      const s = settings();
      const { standing, span, round, at } = frame;
      if (round.winning(at) > 0) return;

      const alive = s.refuseMs / 1000;
      for (const [region, when] of round.refused) {
        // Most entries are refusals that finished seconds ago. Skipping those on a
        // subtraction keeps a round full of misses from costing a wash's work each.
        if (at - when >= alive || region >= standing.length) continue;
        const wash = refuseWash(at - when, s);
        if (!wash.alive) continue;

        const anchor = standing[region];
        const view = viewOf(anchor.slot);
        ctx.save();
        ctx.globalAlpha = wash.alpha;
        ctx.fillStyle = REFUSED;
        for (const points of view.silhouette) {
          ring(ctx, anchor, points, span);
          ctx.fill();
        }
        inkStroke(ctx);
        for (const points of view.strokes) {
          ring(ctx, anchor, points, span);
          ctx.stroke();
        }
        ctx.restore();
      }
    },
  };
}

/** The board sitting in a well rather than lying on the page. */
export function createRecessLayer(settings = () => TUNING) {
  let sides = null;
  let builtFrom = null;

  return {
    name: 'recess',
    draw(ctx, frame) {
      const s = settings();
      if (s.recess <= 0) return;
      const { width, height } = frame;
      const d = s.recess;
      const key = `${width}x${height}|${d}|${s.recessAlpha}`;

      // Four gradients that only move when a knob does. Building them per frame is
      // four objects and four colour strings for a picture that did not change.
      if (builtFrom !== key) {
        // The light is above and to the left, so the far edges catch less of it.
        const near = s.recessAlpha;
        const far = s.recessAlpha * 0.45;
        sides = [
          [0, 0, 0, d, near, 0, 0, width, d],
          [0, 0, d, 0, near, 0, 0, d, height],
          [0, height, 0, height - d, far, 0, height - d, width, d],
          [width, 0, width - d, 0, far, width - d, 0, d, height],
        ].map(([x0, y0, x1, y1, alpha, ...box]) => {
          sunkEdge(ctx, x0, y0, x1, y1, alpha);
          return { fill: ctx.fillStyle, box };
        });
        builtFrom = key;
      }

      for (const side of sides) {
        ctx.fillStyle = side.fill;
        ctx.fillRect(...side.box);
      }
    },
  };
}

/* ---- the panel ----------------------------------------------------------- */

/** A rounded path, for a slab or a card. */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A sunken block: dark along the top and left, a lit edge along the bottom. */
function well(ctx, x, y, w, h, depth, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (depth <= 0) return;
  let g = ctx.createLinearGradient(x, y, x, y + depth);
  g.addColorStop(0, 'rgba(0,0,0,0.16)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, depth);
  g = ctx.createLinearGradient(x, y, x + depth, y);
  g.addColorStop(0, 'rgba(0,0,0,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, depth, h);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(x, y + h - 1, w, 1);
}

/**
 * The panel: what to find, how many are left, and how hard this board was made.
 *
 * Every number sits on a slab tinted by what it means, because the board's own inks
 * are spent on the puzzle and cannot say anything. The asked-for vehicle sits on a
 * card that hangs straight and flinches when the board answers.
 */
/**
 * Where a unit of the meter sits in the run's remaining patience, as a colour.
 *
 * The zones are the meter's scale and not the fill's state: a unit is amber because
 * it is the eighth unit, not because the needle has reached it. That is what lets a
 * player read how much trouble is left from the ladder alone, before anything has
 * lit up.
 */
const zoneOf = (fraction) => {
  if (fraction < 0.6) return SEMANTIC.quiet;
  if (fraction < 0.85) return SEMANTIC.last;
  return SEMANTIC.miss;
};

/**
 * The run's damage, as a ladder of units that light from the left.
 *
 * A unit lights in proportion, not all at once: late on the path a wrong vehicle
 * costs a quarter of a unit, and a ladder that could only light whole ones would show
 * nothing for three mistakes and then jump.
 *
 * @returns {number} the height it filled.
 */
function meterBar(ctx, x, y, w, meter, kick, s) {
  const h = 22 * 0.86 + s.slabPad * 2;
  const units = meter.capacity;
  const gap = 3;
  const cell = (w - gap * (units - 1)) / units;
  // The needle may be thrown past the end; the ladder cannot show more than it has.
  const shown = Math.max(0, Math.min(1, meter.level() + kick));
  for (let i = 0; i < units; i++) {
    const zone = zoneOf(i / units);
    const cx = x + i * (cell + gap);
    ctx.fillStyle = zone.tint;
    roundRect(ctx, cx, y, cell, h, s.slabRadius);
    ctx.fill();
    const part = Math.max(0, Math.min(1, shown * units - i));
    if (part > 0) {
      ctx.fillStyle = zone.loud;
      roundRect(ctx, cx, y, cell * part, h, s.slabRadius);
      ctx.fill();
    }
  }
  return h;
}

export function createPanelLayer(range, settings = () => TUNING, palette = PALETTE) {

  /**
   * The largest of these sizes whose text fits the width, or the smallest if none
   * does. A column is a fixed width and the text in it is not, so something has to
   * give, and it is better that the type shrinks than that it runs into the column
   * beside it.
   */
  const fitted = (ctx, text, size, room, s) => {
    let px = size;
    ctx.font = face(px, s);
    while (px > 9 && ctx.measureText(text).width > room) {
      px -= 1;
      ctx.font = face(px, s);
    }
    return px;
  };

  /** A number on a tinted slab. Returns the height it filled. */
  const slab = (ctx, x, y, text, role, size, s, minWidth = 0, maxWidth = Infinity) => {
    const px = maxWidth === Infinity
      ? size : fitted(ctx, text, size, maxWidth - s.slabPad * 2, s);
    ctx.font = face(px, s);
    size = px;
    const w = Math.min(maxWidth,
                       Math.max(minWidth, ctx.measureText(text).width + s.slabPad * 2));
    const h = size * 0.86 + s.slabPad * 2;
    roundRect(ctx, x, y, w, h, s.slabRadius);
    ctx.fillStyle = role.tint;
    ctx.fill();
    ctx.fillStyle = role.ink;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + s.slabPad, y + h / 2 + 1);
    ctx.textBaseline = 'top';
    return h;
  };

  // A dial's bar, so a setting reads as a position on a path rather than as a number
  // with nothing to be large or small against. The range is given the way the dial
  // runs -- reversed for the ones where a smaller number is the harder board -- so
  // which way is harder stays with the difficulty data and not in here.
  const dial = (ctx, x, y, width, label, shown, value, [low, high], s) => {
    const along = high === low ? 1 : (value - low) / (high - low);
    // A label and its value share one line, so they are sized against the pair.
    ctx.font = face(fitted(ctx, `${label}  ${shown}`, 17, width, s), s);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = SEMANTIC.quiet.ink;
    ctx.fillText(label, x, y);
    ctx.textAlign = 'right';
    ctx.fillText(shown, x + width, y);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const track = y + 8;
    ctx.fillStyle = SEMANTIC.quiet.tint;
    ctx.fillRect(x, track, width, 4);
    ctx.fillStyle = SEMANTIC.quiet.loud;
    ctx.fillRect(x, track, Math.max(2, width * along), 4);
  };

  const dialsOf = (level) => [
    ['vehicles', `${level.cars}/${range.cars[1]}`, level.cars, range.cars],
    ['size', `${Math.round(level.size * 100)}%`, level.size,
     [range.size[1], range.size[0]]],
    ['kinds', `${level.fleet.length}/${range.kinds[1]}`, level.fleet.length,
     range.kinds],
    ['inks', `${level.inks}/${range.inks[1]}`, level.inks,
     [range.inks[1], range.inks[0]]],
  ];

  /**
   * The asked-for vehicle, with its dither averaged back into greys.
   *
   * The renders are one bit deep: every grey in them is a halftone, not a value. Ask
   * a canvas to scale that by anything other than a whole number and the dot grid
   * beats against the pixel grid, which is what puts white diamonds across the
   * render. Halving is the exception -- it averages an exact two-by-two block -- so
   * the picture is halved down until the dots have become greys, and only then
   * scaled to the size the card wants.
   */
  const GREY_AT = 128;
  const flatten = (prompt) => {
    let from = prompt;
    let size = prompt.naturalWidth;
    while (size > GREY_AT) {
      size = Math.max(GREY_AT, Math.round(size / 2));
      const half = document.createElement('canvas');
      half.width = size;
      half.height = size;
      const c = half.getContext('2d');
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(from, 0, 0, size, size);
      from = half;
    }
    return from;
  };

  // The card is the same picture every frame: a shadow, a rounded white ground and a
  // resampled render. Only where it sits changes. Baked once a level, because
  // shadowBlur is among the slowest things a canvas does and this one was paying it
  // sixty times a second to arrive at an identical bitmap.
  let card = null;
  let cardKey = null;
  const bakeCard = (span, prompt, s) => {
    const pad = Math.ceil(s.cardBlur + s.cardShadow + 4);
    card = document.createElement('canvas');
    card.width = span + pad * 2;
    card.height = span + pad * 2;
    const c = card.getContext('2d');
    c.translate(pad, pad);
    c.shadowColor = 'rgba(0,0,0,0.28)';
    c.shadowOffsetY = s.cardShadow;
    c.shadowBlur = s.cardBlur;
    c.fillStyle = palette.panel;
    roundRect(c, 0, 0, span, span, 6);
    c.fill();
    c.shadowColor = 'transparent';
    c.strokeStyle = palette.rule;
    c.lineWidth = 1;
    c.stroke();
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(flatten(prompt), 6, 6, span - 12, span - 12);
  };

  /** The card, drawn centred on a point and flinching. */
  const drawCard = (ctx, cx, cy, span, prompt, shake, s) => {
    if (!prompt || !prompt.complete) return;
    const key = `${prompt.src}|${span}|${s.cardShadow}|${s.cardBlur}`;
    if (cardKey !== key) {
      bakeCard(span, prompt, s);
      cardKey = key;
    }
    ctx.save();
    ctx.translate(cx + shake.dx, cy + shake.dy);
    ctx.rotate((shake.tilt * Math.PI) / 180);
    ctx.drawImage(card, -card.width / 2, -card.height / 2);
    ctx.restore();
  };

  const countRole = (round) =>
    round.left() === 0 ? SEMANTIC.found
      : round.left() === 1 ? SEMANTIC.last : SEMANTIC.quiet;

  const countText = (round) => (round.left() ? `${round.left()} TO FIND` : 'ALL FOUND');

  const countSize = (round) =>
    26 + 14 * (round.total ? round.found.size / round.total : 0);

  return {
    name: 'panel',
    draw(ctx, frame) {
      const s = settings();
      const { panel, round, level, prompt, at, meter } = frame;
      // The needle rings down from the last hit, whichever stage it landed on.
      const kick = meter.hitAt === null ? 0 : meterKick(at - meter.hitAt, s);

      ctx.fillStyle = palette.panel;
      ctx.fillRect(panel.x, panel.y, panel.width, panel.height);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      // The card answers the most recent find, and answers the last one hardest.
      let lastFind = -1;
      for (const when of round.found.values()) if (when > lastFind) lastFind = when;
      const shake = lastFind < 0
        ? { dx: 0, dy: 0, tilt: 0 }
        : cardShake(at - lastFind, s, round.found.size === round.total);

      const pad = Math.round(Math.min(24, panel.width * 0.05, panel.height * 0.07));
      const stage = `LEVEL ${level.level}:${level.stage}${level.last ? '  LAST' : ''}`;

      // Wider than it is tall: the card takes the left and the readout runs beside it
      // in two columns. This is the shape a phone held upright gives the panel.
      if (panel.width > panel.height) {
        // The card is what you are matching against, so it takes as much of the
        // panel's short edge as the readout beside it can spare.
        const span = Math.round(
          Math.min(panel.height - pad * 2, panel.width * 0.38));
        drawCard(ctx, panel.x + pad + span / 2, panel.y + panel.height / 2,
                 span, prompt, shake, s);

        const rest = panel.width - span - pad * 3;
        const colX = panel.x + pad * 2 + span;
        const colW = Math.round(rest * 0.54);
        const dialsX = colX + colW + pad;
        const dialsW = panel.x + panel.width - pad - dialsX;

        // Both columns sit against the card, which is centred, so they are centred
        // too. Starting them at the top leaves the panel bottom-heavy and empty.
        const height = (px) => px * 0.86 + s.slabPad * 2;
        const readout = 24 + 20 + height(30) + 10 + height(countSize(round))
                        + 8 + 18 + height(22);
        let y = panel.y + (panel.height - readout) / 2;

        ctx.font = face(19, s);
        ctx.fillStyle = SEMANTIC.quiet.ink;
        ctx.fillText(stage, colX, y);
        y += 24;
        ctx.font = face(17, s);
        ctx.fillStyle = SEMANTIC.quiet.loud;
        ctx.fillText('FIND', colX, y);
        y += 20;
        y += slab(ctx, colX, y, round.target.toUpperCase(), SEMANTIC.target, 30, s,
                  0, colW) + 10;
        y += slab(ctx, colX, y, countText(round), countRole(round),
                  countSize(round), s, colW, colW) + 8;
        ctx.font = face(17, s);
        ctx.fillStyle = SEMANTIC.quiet.loud;
        ctx.fillText('MISSES', colX, y);
        meterBar(ctx, colX, y + 18, colW, meter, kick, s);

        const rows = dialsOf(level);
        const step = Math.min(40, (panel.height - pad * 2) / rows.length);
        const block = step * rows.length + 16;
        const top = panel.y + (panel.height - block) / 2;
        well(ctx, dialsX - 10, top, dialsW + 20, block, s.panelRecess,
             SEMANTIC.quiet.tint);
        let dy = top + 18;
        for (const row of rows) {
          dial(ctx, dialsX, dy, dialsW, ...row, s);
          dy += step;
        }
        return;
      }

      // Taller than it is wide: one column, the card above the readout.
      const left = panel.x + pad;
      const span = panel.width - pad * 2;
      let y = panel.y + pad;

      ctx.font = face(19, s);
      ctx.fillStyle = SEMANTIC.quiet.ink;
      ctx.fillText(stage, left, y);
      y += 26;
      ctx.font = face(17, s);
      ctx.fillStyle = SEMANTIC.quiet.loud;
      ctx.fillText('FIND', left, y);
      y += 18;
      y += slab(ctx, left, y, round.target.toUpperCase(), SEMANTIC.target, 32, s) + 14;

      drawCard(ctx, left + span / 2, y + span / 2, span, prompt, shake, s);
      y += span + 24;

      y += slab(ctx, left, y, countText(round), countRole(round),
                countSize(round), s, span) + 10;
      ctx.font = face(17, s);
      ctx.fillStyle = SEMANTIC.quiet.loud;
      ctx.fillText('MISSES', left, y);
      y += 18;
      y += meterBar(ctx, left, y, span, meter, kick, s) + 22;

      well(ctx, left - 10, y - 8, span + 20, 4 * 34 + 22, s.panelRecess,
           SEMANTIC.quiet.tint);
      y += 16;
      for (const row of dialsOf(level)) {
        dial(ctx, left, y, span, ...row, s);
        y += 34;
      }
    },
  };
}


/**
 * The end of a life: the yard behind frosted paper, and what to do about it.
 *
 * Over the board only. The panel keeps working, because the full meter beside the
 * message is the explanation -- a player who has just died should be able to see the
 * thing that killed them, not a screen that has replaced it.
 */
export function createOverLayer(settings = () => TUNING, palette = PALETTE) {
  return {
    name: 'over',
    draw(ctx, frame) {
      const { width, height, dead } = frame;
      if (!dead) return;
      const s = settings();

      ctx.fillStyle = `rgba(255,255,255,0.82)`;
      ctx.fillRect(0, 0, width, height);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const mid = Math.min(width, height);
      ctx.font = face(Math.round(mid * 0.11), s);
      ctx.fillStyle = SEMANTIC.miss.ink;
      ctx.fillText('GAME OVER', width / 2, height / 2 - mid * 0.05);
      ctx.font = face(Math.round(mid * 0.038), s);
      ctx.fillStyle = SEMANTIC.quiet.loud;
      ctx.fillText('CLICK TO TRY THIS YARD AGAIN', width / 2, height / 2 + mid * 0.06);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    },
  };
}

/**
 * The four sides a wipe can run from, as the two facts that tell them apart.
 *
 * `vertical` says which axis the edge travels along, and so which way the lanes run:
 * an edge falling or rising is crossed by columns, one crossing left or right by
 * rows. `forward` says whether it travels in the direction the coordinate grows.
 * Everything else about the four is the same arithmetic read through those two.
 */
const SIDES = [
  { vertical: true,  forward: true  },  // from the north, the edge falling
  { vertical: false, forward: false },  // from the east, crossing to the left
  { vertical: true,  forward: false },  // from the south, the edge rising
  { vertical: false, forward: true  },  // from the west, crossing to the right
];

/**
 * The side a wipe runs from.
 *
 * Drawn off the seed of the level the wipe is bringing in, so a level always arrives
 * the same way and a run stays reproducible from its seed.
 */
export const wipeFrom = (seed) => Math.floor(mulberry32(seed)() * SIDES.length);

/**
 * The last screen of a level, taken off on the grid of the level arriving.
 *
 * A wipe is over the whole canvas, panel included, so this goes on top of everything.
 * It is the only layer that draws what the game is no longer holding: the new level is
 * dealt and drawn from the first frame, and the old screen is a picture laid back over
 * the part of it the new one has not taken yet. Nothing has to be kept alive to be
 * wiped away, so no other layer knows a transition is happening.
 *
 * The old screen does not slide off in one piece. It leaves in the cells of the grid
 * the *incoming* level rules, which is how a level announces its density before it is
 * playable: a first stage leaves in a few fat squares, a last stage in a fine rattle.
 * Three things carry that.
 *
 * Every lane opens at its own moment and they all finish together, so the front starts
 * ragged and closes up. Within a lane the cells open one at a time along the grid, and
 * each square grows into its cell rather than appearing whole -- so a square is at its
 * smallest at the front and full a cell or two back. And a square finishes growing
 * before the next cell opens, which is the wait on the line: the lane lands a tile,
 * rests, and lands the next.
 *
 * The whole shape is read off the cell. A lane's tread is its own share of the wipe
 * divided by the cells it has to cross, the wait takes what it is asked for out of
 * that tread, and the growing takes the rest -- so a coarse grid rests properly and a
 * fine one only hesitates, without either being told which it is.
 *
 * @param {HTMLCanvasElement} shot - an offscreen canvas to keep the old screen in
 */
export function createWipeLayer(shot, settings = () => TUNING) {
  let began = -1;
  let plan = null;

  return {
    name: 'wipe',

    /**
     * Keep what is on the canvas now, and start taking it off.
     *
     * The shape of the wipe is settled here rather than per frame: it is a fact about
     * the screen and the level arriving, and neither moves while it runs.
     *
     * @param {number} seed - the incoming level's seed, for the side and the stagger
     * @param {number} along - where the incoming level sits on the path, 0..1
     */
    take(ctx, at, seed, along) {
      const s = settings();
      const { width, height } = ctx.canvas;
      shot.width = width;
      shot.height = height;
      shot.getContext('2d').drawImage(ctx.canvas, 0, 0);

      const side = wipeFrom(seed);
      const vertical = SIDES[side].vertical;
      const travel = vertical ? height : width;
      const cross = vertical ? width : height;

      // A late stage rules a five-pixel grid, which is two hundred lines to wait on
      // and far more squares than anyone can see leave. So the wipe opens every kth
      // ruled cell rather than every one: still exactly on the grid, just reading a
      // coarser beat of it. What the cap costs is that the last stages all wipe at the
      // same beat, because past that point the grid is finer than the wipe can show.
      const ruled = cellOf(s, along);
      const every = Math.max(1, Math.ceil(Math.max(cross, travel) / ruled / s.wipeCells));
      const cell = ruled * every;

      const steps = Math.max(1, Math.ceil(travel / cell));
      const lanes = Math.max(1, Math.ceil(cross / cell));

      const rand = mulberry32(seed);
      const offsets = [];
      for (let i = 0; i < lanes; i++) offsets.push(rand() * s.wipeStagger);

      began = at;
      plan = { side, vertical, cell, steps, lanes, offsets, width, height };
    },

    draw(ctx, frame) {
      if (began < 0 || plan === null) return;
      const s = settings();
      const t = (frame.at - began) / (s.wipeMs / 1000);
      if (t >= 1) return;
      // A wipe only runs over the screen it was taken from. A turned phone deals a new
      // board on a canvas of a different shape, and the old screen has no place on it.
      if (plan.width !== ctx.canvas.width || plan.height !== ctx.canvas.height) return;

      const { vertical, cell, steps, lanes, offsets } = plan;
      const { forward } = SIDES[plan.side];
      const travel = vertical ? plan.height : plan.width;
      const cross = vertical ? plan.width : plan.height;

      // One rectangle is one subpath, and the odd-even rule turns a cell holding a
      // smaller square into a ring: old screen around the edges, new screen through
      // the middle. The whole wipe is therefore one clip and one blit, however many
      // squares are in the air.
      const held = new Path2D();
      const lay = (at, size, start, len) => {
        if (len <= 0) return;
        if (vertical) held.rect(at, start, size, len);
        else held.rect(start, at, len, size);
      };

      for (let i = 0; i < lanes; i++) {
        const opens = offsets[i];
        const runs = Math.max(0.05, 1 - opens);
        const p = Math.max(0, Math.min(1, (t - opens) / runs));

        // What one cell costs this lane, and how that time is split between landing a
        // square and resting on the line before the next one opens.
        const tread = (runs * s.wipeMs) / steps;
        const rest = Math.min(s.wipeDwellMs, tread * s.wipeDwellMax);
        const grows = Math.max(1, tread - rest) / s.wipeMs;

        const at = i * cell;
        const size = Math.min(cell, cross - at);
        // Cells opened so far. Cell j opens at p = j / steps, so the front is always
        // on a ruled line and the lane's last cell opens one tread before the end.
        const open = t < opens ? 0 : Math.min(steps, Math.floor(p * steps) + 1);

        // Everything not yet opened is the old screen, in one piece.
        if (forward) lay(at, size, open * cell, travel - open * cell);
        else lay(at, size, 0, Math.min((steps - open) * cell, travel));

        // The squares still growing. They are walked back from the front and the walk
        // stops at the first full one, because every square behind it is full too.
        for (let j = open - 1; j >= 0; j--) {
          const landed = opens + (j / steps) * runs;
          const grown = (t - landed) / grows;
          if (grown >= 1) break;
          const scale = s.wipeLead + (1 - s.wipeLead) * Math.max(0, grown);
          const inset = (cell * (1 - scale)) / 2;
          // Which cell of the screen this is. A wipe running backwards opens the last
          // cell first, so the count and the coordinate run opposite ways.
          const c = forward ? j : steps - 1 - j;
          lay(at, size, c * cell, cell);
          lay(at + inset, size - inset * 2, c * cell + inset, cell - inset * 2);
        }
      }

      ctx.save();
      ctx.clip(held, 'evenodd');
      ctx.drawImage(shot, 0, 0);
      ctx.restore();
    },
  };
}
