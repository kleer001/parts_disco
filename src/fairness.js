// Fair play for the silhouette boards. Pure: it reads a laid-out board and says whether
// it can be clicked fairly, and never draws, measures a canvas, or reads a clock.
//
// A silhouette board hides a shape's inner lines, so a shape is known by its outline
// alone. That is the difficulty, and it is also where a board can cheat two ways:
//
//   hidden target   Every copy of the asked-for shape is buried so deep that its own
//                   outline never reaches the top. A copy with nothing showing is worse
//                   than hard: the round cannot be won, because `pick` never reaches it.
//   decoy in a mask Another shape is buried down to the very outline the target has. The
//                   part that would give it away is covered, so what shows reads as the
//                   target, and clicking it -- the honest read -- is punished as a miss.
//
// This gives a board a fairness cost from those two faults, for a chosen target, and
// picks the target that reads most fairly. It does not move anything: a board that cheats
// is dealt again, not rearranged, because almost every board is fair as dealt and a fresh
// throw is a truer variety than a restack. The caller churns the deal; this is the judge.
//
// The cost is cheap because the shapes do not move on a given board: which of a shape's
// sample points fall under each overlapping neighbour is worked out once as a bitmask, so
// scoring a target is a handful of mask unions per shape.

import { mulberry32 } from './rng.js';
import { contains } from './geometry.js';

/** How much of two outlines must coincide before one can be mistaken for the other. */
const TWIN_IOU = 0.55;

/** A grid this many on a side is laid over each frame; the points inside the outline are
 *  its samples, thinned to fit one 31-bit mask so a stack is cheap to read. */
const SAMPLE_GRID = 12;
const MASK_BITS = 31;

/** A coarser grid, for the area overlap that decides whether two shapes are twins. */
const IOU_GRID = 12;

/** A shape has to show at least this share of itself, and never fewer than a couple of
 *  sample points, before it counts as something a player can pick out of a pile. A single
 *  sliver poking through is clickable in theory and unfindable in fact -- a target that
 *  shows only that is buried, and a decoy that shows only that is no trap. */
const CLICKABLE_FRAC = 0.15;
const CLICKABLE_MIN = 2;
const clickable = (visBits, count) => visBits >= Math.max(CLICKABLE_MIN, CLICKABLE_FRAC * count);

/** What each fault costs, so the judge can rank one unfair board against another. A hidden
 *  copy -- a round that cannot be won -- outweighs any number of the softer faults. */
const COST = { hidden: 100, unread: 10, decoy: 10 };

/** The point at local [x, y] of a view placed at an anchor, in board coordinates. */
const toBoard = (anchor, size, x, y) => [
  anchor.cx + (x - 0.5) * size,
  anchor.cy + (y - 0.5) * size,
];

/** Is a local point inside a view's silhouette? Even-odd across its rings -- a point in a
 *  traced hole (a window, an arch) is outside, exactly as `pick` reads it. */
function inSilhouette(silhouette, x, y) {
  let inside = false;
  for (const ring of silhouette) if (contains([x, y], ring)) inside = !inside;
  return inside;
}

/** popcount for one 31-bit mask. */
function bits(mask) {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
}

/**
 * The sample points of a view, and its outline's extent, both in the 0..1 frame.
 *
 * The grid is clipped to the silhouette, so a thin fork keeps only the cells its blade
 * covers and a full apple keeps most of them. The extent is the outline's own box, not
 * the samples', so a thin or hollow shape still reports the ground it truly reaches --
 * a box drawn to the samples would let a neighbour that covers the rest of it slip the
 * overlap test. When more than a mask holds, the set is thinned evenly, keeping its span.
 */
function sampleView(view) {
  const silhouette = (view.silhouette && view.silhouette.length) ? view.silhouette : view.strokes;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const ring of silhouette) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const pts = [];
  for (let r = 0; r < SAMPLE_GRID; r++) {
    for (let c = 0; c < SAMPLE_GRID; c++) {
      const x = (c + 0.5) / SAMPLE_GRID;
      const y = (r + 0.5) / SAMPLE_GRID;
      if (inSilhouette(silhouette, x, y)) pts.push([x, y]);
    }
  }
  // A shape thinner than a cell keeps its outline's own points, so it is never left with
  // nothing to test with.
  if (!pts.length) for (const ring of silhouette) for (const p of ring) pts.push(p);
  let samples = pts;
  if (samples.length > MASK_BITS) {
    const step = samples.length / MASK_BITS;
    samples = Array.from({ length: MASK_BITS }, (_, i) => pts[Math.floor(i * step)]);
  }
  return { samples, silhouette, ext: { minX, minY, maxX, maxY } };
}

/**
 * How alike two outlines are, 0..1, and which of the first's samples fall outside the
 * second -- the first's tell against it.
 *
 * Both read in the same 0..1 frame, which is how the fleet's tiers are drawn apart to
 * begin with: a loud shape shares little of its frame with anything, twins share almost
 * all of theirs. The tell is the rest -- the samples of A that B does not cover, the part
 * of A that, seen, would rule B out.
 */
function compare(a, b) {
  let both = 0;
  let either = 0;
  for (let r = 0; r < IOU_GRID; r++) {
    for (let c = 0; c < IOU_GRID; c++) {
      const x = (c + 0.5) / IOU_GRID;
      const y = (r + 0.5) / IOU_GRID;
      const inA = inSilhouette(a.silhouette, x, y);
      const inB = inSilhouette(b.silhouette, x, y);
      if (inA || inB) either++;
      if (inA && inB) both++;
    }
  }
  let tell = 0;
  a.samples.forEach(([x, y], k) => {
    if (!inSilhouette(b.silhouette, x, y)) tell |= (1 << k);
  });
  return { iou: either ? both / either : 0, tell };
}

/**
 * A fair-play judge for one atlas, holding what carries across boards.
 *
 * Sampling a view and comparing two of them are facts about the art, not the board, so
 * they are worked out when a view or a pair is first seen and kept. A board is then only
 * its layout laid over that.
 *
 * @param {Function} viewOf - a slot's traced view, as `atlas.view`
 */
export function createFairPlay(viewOf) {
  const keyOf = (slot) => `${slot.group}/${slot.model}/${slot.angle}`;
  const viewData = new Map();
  const pairData = new Map();

  const dataFor = (slot) => {
    const key = keyOf(slot);
    if (!viewData.has(key)) viewData.set(key, sampleView(viewOf(slot)));
    return viewData.get(key);
  };
  // A→B is not B→A: the tell is the first shape's, so the pair is keyed in order.
  const pairFor = (slotA, slotB) => {
    const key = `${keyOf(slotA)}|${keyOf(slotB)}`;
    if (!pairData.has(key)) pairData.set(key, compare(dataFor(slotA), dataFor(slotB)));
    return pairData.get(key);
  };

  /**
   * Everything about one laid-out board that a target choice reads, worked out once: what
   * each shape sees of itself past its neighbours (in the board's own draw order), and how
   * alike any two shapes are. From here, scoring a target is bitmask work.
   */
  const assess = (anchors, span) => {
    const n = anchors.length;
    const size = (i) => anchors[i].span ?? span;
    const car = anchors.map((a, i) => {
      const d = dataFor(a.slot);
      const s = size(i);
      const count = d.samples.length;
      return {
        model: a.slot.model,
        data: d,
        count,
        // A bit per sample. At the cap the shift would reach the sign bit, so it is spelt out.
        full: count >= MASK_BITS ? 0x7fffffff : (1 << count) - 1,
        box: {
          minX: a.cx + (d.ext.minX - 0.5) * s, maxX: a.cx + (d.ext.maxX - 0.5) * s,
          minY: a.cy + (d.ext.minY - 0.5) * s, maxY: a.cy + (d.ext.maxY - 0.5) * s,
        },
      };
    });

    // What each shape shows of itself: its samples, less those under any later (higher,
    // nearer) neighbour that overlaps it. The draw order is the array order, so a neighbour
    // is nearer when its index is greater, exactly as `pick` walks the pile.
    const vis = new Int32Array(n);
    const overlap = (i, j) => !(car[i].box.maxX < car[j].box.minX || car[j].box.maxX < car[i].box.minX
      || car[i].box.maxY < car[j].box.minY || car[j].box.maxY < car[i].box.minY);
    for (let i = 0; i < n; i++) {
      let seen = car[i].full;
      for (let j = i + 1; j < n; j++) {
        if (!overlap(i, j)) continue;
        const a = anchors[i];
        const b = anchors[j];
        const sj = size(j);
        car[i].data.samples.forEach(([x, y], k) => {
          if (!(seen & (1 << k))) return;
          const [bx, by] = toBoard(a, size(i), x, y);
          if (inSilhouette(car[j].data.silhouette, (bx - b.cx) / sj + 0.5, (by - b.cy) / sj + 0.5)) {
            seen &= ~(1 << k);
          }
        });
      }
      vis[i] = seen;
    }

    const models = [...new Set(car.map((c) => c.model))];

    // The fairness cost of asking for one of the shapes on this board. A copy of the
    // target must show the tell that holds it apart from its nearest twin, or it cannot
    // be told from one; a twin of the target that shows enough to be clicked must show the
    // tell that gives it away, or it reads as the target and punishes the honest click.
    const costFor = (target) => {
      let cost = 0;
      for (let i = 0; i < n; i++) {
        if (car[i].model === target) {
          let tell = 0;
          let twinned = false;
          for (let k = 0; k < n; k++) {
            if (car[k].model === target) continue;
            const cmp = pairFor(anchors[i].slot, anchors[k].slot);
            if (cmp.iou >= TWIN_IOU) { tell |= cmp.tell; twinned = true; }
          }
          if (!clickable(bits(vis[i]), car[i].count)) cost += COST.hidden;
          else if (twinned && (vis[i] & tell) === 0) cost += COST.unread;
        } else {
          let tell = 0;
          let twin = false;
          for (let k = 0; k < n; k++) {
            if (car[k].model !== target) continue;
            const cmp = pairFor(anchors[i].slot, anchors[k].slot);
            if (cmp.iou >= TWIN_IOU) { tell |= cmp.tell; twin = true; }
          }
          if (twin && clickable(bits(vis[i]), car[i].count) && (vis[i] & tell) === 0) {
            cost += COST.decoy;
          }
        }
      }
      return cost;
    };

    return { models, costFor };
  };

  return {
    /** The fairness cost of asking for `target` on this board, in its own draw order. 0 is fair. */
    judge(anchors, target, span) {
      return assess(anchors, span).costFor(target);
    },

    /**
     * The target this board reads most fairly for, and the angle to ask it at.
     *
     * Every shape on the board is a candidate, and the least unfair wins; the dealt target
     * keeps the ask when it is among the fairest, so the board's own variety stands unless
     * it is the thing that cheats. Remaining ties are broken by the seed. The board is not
     * touched -- an unfair one is dealt again.
     *
     * @param {string} [prefer] - the ask to keep if it reads as fairly as any other
     * @returns {{ target, askedAt, cost }}
     */
    choose(anchors, anglesOf, span, seed, prefer = null) {
      const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
      const { models, costFor } = assess(anchors, span);
      let best = [];
      let low = Infinity;
      for (const target of models) {
        const cost = costFor(target);
        if (cost < low) { low = cost; best = [target]; } else if (cost === low) best.push(target);
      }
      const target = best.includes(prefer) ? prefer : best[Math.floor(rng() * best.length)];
      const here = new Set(anchors.filter((a) => a.slot.model === target).map((a) => a.slot.angle));
      const spare = anglesOf(target).filter((a) => !here.has(a));
      return { target, askedAt: spare.length ? spare[Math.floor(rng() * spare.length)] : null, cost: low };
    },
  };
}
