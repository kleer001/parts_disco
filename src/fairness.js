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

/** How many rows the fill scans a silhouette at. Fine enough that a thin shape, whose
 *  interior a coarse grid slips between, still crosses a row and lands a sample. */
const SAMPLE_RES = 48;

/** One sample is kept per cell of a grid this many on a side over the shape, so a shape
 *  stands for itself by evenly-spread samples -- fine enough that how much of it a cover
 *  hides tracks its area, few enough that the set is one bit per cell in a single mask. */
const SAMPLE_CELLS = 5;

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

/** How many shapes may be lifted off a board to mend it before it is dealt again instead.
 *  A board with more faults than this is more tangled than it is worth un-picking. */
const MEND_CAP = 5;

/** The share of itself a shape must show to be read at a glance, and so to be ruled out as
 *  not the shape being hunted. Below this a silhouette is too covered to place: on the
 *  silhouette stages, where a shape is known by its outline alone, every one must clear it. */
const READABLE = 0.75;

/** How many cells across the board `trim` fills to measure how much of each shape shows. A
 *  true pixel count, not a scatter of samples, so a thin frame or a fin is read as exactly
 *  the area it is -- fine enough to separate touching shapes, coarse enough to stay cheap. */
const TRIM_RES = 600;

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

/** popcount of a sample mask, at most one bit per grid cell. */
function bits(mask) {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
}

/**
 * The x's where the horizontal line at `y` crosses a silhouette's outline, sorted. Between
 * each pair is inside the shape -- the even-odd fill both `sampleView` and `trim` read, one
 * to place sample points across the body, the other to paint owner cells.
 */
function rowCrossings(silhouette, y) {
  const xs = [];
  for (const ring of silhouette) {
    for (let k = 0; k < ring.length; k++) {
      const [x0, y0] = ring[k];
      const [x1, y1] = ring[(k + 1) % ring.length];
      if ((y0 > y) !== (y1 > y)) xs.push(x0 + ((x1 - x0) * (y - y0)) / (y1 - y0));
    }
  }
  xs.sort((a, b) => a - b);
  return xs;
}

/**
 * Interior sample points of a view, spread over a grid across its body, and its outline's
 * box, in the 0..1 frame.
 *
 * The silhouette is filled by scanlines -- the ranges between the outline's crossings on
 * each row are inside it -- and one point is kept per cell of a grid over the shape. Filling
 * by range carries a thin shape, a fork on its side no wider than a hair at some angles,
 * that slips between the points of a plain grid; keeping one point per grid cell spreads the
 * samples over the body, so how many a neighbour hides tracks how much of its area it takes.
 * The points are interior, never on a cover's edge to read as neither in nor out, and one
 * per cell of a small grid, so the set fits one mask.
 */
function sampleView(view) {
  const { silhouette } = view;
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
  const spanX = (maxX - minX) || 1;
  const spanY = (maxY - minY) || 1;
  const cellOf = (v, lo, span) => Math.min(SAMPLE_CELLS - 1, Math.floor(((v - lo) / span) * SAMPLE_CELLS));
  const chosen = new Map();
  for (let r = 0; r < SAMPLE_RES; r++) {
    const y = (r + 0.5) / SAMPLE_RES;
    const gy = cellOf(y, minY, spanY);
    const xs = rowCrossings(silhouette, y);
    for (let p = 0; p + 1 < xs.length; p += 2) {
      // A point per cell the range reaches, each strictly inside it -- one at the midpoint
      // when the range is thinner than a cell, so a hairline stretch still stands for the
      // shape. The first point to land in a cell keeps it, spreading the set over the body.
      const xa = xs[p];
      const xb = xs[p + 1];
      const count = Math.max(1, Math.ceil(((xb - xa) / spanX) * SAMPLE_CELLS));
      for (let m = 0; m < count; m++) {
        const x = xa + ((m + 0.5) / count) * (xb - xa);
        const key = gy * SAMPLE_CELLS + cellOf(x, minX, spanX);
        if (!chosen.has(key)) chosen.set(key, [x, y]);
      }
    }
  }
  const samples = chosen.size ? [...chosen.values()]
    : (silhouette.length ? [silhouette[0][0]] : []);
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
      return {
        model: a.slot.model,
        data: d,
        count: d.samples.length,
        box: {
          minX: a.cx + (d.ext.minX - 0.5) * s, maxX: a.cx + (d.ext.maxX - 0.5) * s,
          minY: a.cy + (d.ext.minY - 0.5) * s, maxY: a.cy + (d.ext.maxY - 0.5) * s,
        },
      };
    });

    // Which later, nearer neighbours cover which of a shape's samples, worked out once. The
    // draw order is the array order, so a neighbour is nearer when its index is greater,
    // exactly as `pick` walks the pile. From it, how much of each shape shows.
    const full = car.map((c) => (2 ** c.count) - 1);
    const overlap = (i, j) => !(car[i].box.maxX < car[j].box.minX || car[j].box.maxX < car[i].box.minX
      || car[i].box.maxY < car[j].box.minY || car[j].box.maxY < car[i].box.minY);
    const cover = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!overlap(i, j)) continue;
        const a = anchors[i];
        const b = anchors[j];
        const sj = size(j);
        let mask = 0;
        car[i].data.samples.forEach(([x, y], k) => {
          const [bx, by] = toBoard(a, size(i), x, y);
          if (inSilhouette(car[j].data.silhouette, (bx - b.cx) / sj + 0.5, (by - b.cy) / sj + 0.5)) {
            mask |= (1 << k);
          }
        });
        if (mask) cover[i].push({ j, mask });
      }
    }
    // What each shape shows of itself on the full board, and how much of it -- read once by
    // `faultsFor` for every candidate ask.
    const vis = full.map((seen, i) => {
      for (const { mask } of cover[i]) seen &= ~mask;
      return seen;
    });
    const shown = vis.map(bits);

    const models = [...new Set(car.map((c) => c.model))];

    // Every other shape whose outline coincides enough with shape `i` to be mistaken for it,
    // and their combined tell. `matchTarget` picks the side: a copy of the target is read
    // against the other models, a decoy against the target's own copies.
    const twinTell = (i, target, matchTarget) => {
      let tell = 0;
      let twinned = false;
      for (let k = 0; k < n; k++) {
        if ((car[k].model === target) !== matchTarget) continue;
        const cmp = pairFor(anchors[i].slot, anchors[k].slot);
        if (cmp.iou >= TWIN_IOU) { tell |= cmp.tell; twinned = true; }
      }
      return { tell, twinned };
    };

    // The faults asking for one shape carries on this board, sorted by how each is mended.
    // A copy of the target showing too little to click is buried -- the round cannot be won
    // until it is gone -- and a buried copy showing nothing at all can be lifted off the
    // board without changing a pixel. A copy that shows enough but hides the tell that holds
    // it apart from a twin is unread. A twin of the target clickable yet showing no tell of
    // its own reads as the target, an unfair click. Kept per target, since the ask is scored
    // once for every candidate and again as a board is mended.
    const faultCache = new Map();
    const faultsFor = (target) => {
      const done = faultCache.get(target);
      if (done) return done;
      const buried = [];   // a target copy showing nothing -- invisible, free to lift off
      const dim = [];      // a target copy showing only a sliver -- too little to find
      const unread = [];   // a target copy clickable but tell-hidden -- taken for a twin
      const decoy = [];    // a twin of the target reading as the target -- an unfair click
      for (let i = 0; i < n; i++) {
        if (car[i].model === target) {
          const { tell, twinned } = twinTell(i, target, false);
          if (shown[i] === 0) buried.push(i);
          else if (!clickable(shown[i], car[i].count)) dim.push(i);
          else if (twinned && (vis[i] & tell) === 0) unread.push(i);
        } else {
          const { tell, twinned } = twinTell(i, target, true);
          if (twinned && clickable(shown[i], car[i].count) && (vis[i] & tell) === 0) decoy.push(i);
        }
      }
      const faults = { buried, dim, unread, decoy };
      faultCache.set(target, faults);
      return faults;
    };

    const costFor = (target) => {
      const f = faultsFor(target);
      return COST.hidden * (f.buried.length + f.dim.length)
        + COST.unread * f.unread.length + COST.decoy * f.decoy.length;
    };

    return { models, costFor, faultsFor };
  };

  // The fairest ask on an assessed board: the least unfair, keeping a preferred ask when it
  // is among the fairest so the board's own variety stands, ties broken by the seed.
  const pickTarget = (assessed, rng, prefer) => {
    let best = [];
    let low = Infinity;
    for (const target of assessed.models) {
      const cost = assessed.costFor(target);
      if (cost < low) { low = cost; best = [target]; } else if (cost === low) best.push(target);
    }
    return best.includes(prefer) ? prefer : best[Math.floor(rng() * best.length)];
  };

  // The angle to ask a target at: one no copy on the board is wearing, so the prompt has to
  // be recognised rather than matched. None spare gives null, and the caller falls back.
  const askAngle = (laid, target, anglesOf, rng) => {
    const here = new Set(laid.filter((a) => a.slot.model === target).map((a) => a.slot.angle));
    const spare = anglesOf(target).filter((a) => !here.has(a));
    return spare.length ? spare[Math.floor(rng() * spare.length)] : null;
  };

  return {
    /**
     * The readable shapes of a board: every one left showing at least `READABLE` of itself.
     *
     * A silhouette board is known by outline alone, so a shape too covered to read is one the
     * player can neither find nor rule out -- the overlap that gives the full-detail stages
     * their depth is, here, a shape hidden in plain sight. A shape is covered as much by the
     * board's own edge, which eats whatever runs off it, as by a neighbour on top. This lifts
     * the worst-covered shape off and reads the board again, over and over, until none is left
     * too covered. Lifting a shape only uncovers what was under it, never buries more, so the
     * pass settles and every survivor clears the bar. About one shape in five goes on the
     * densest silhouette boards.
     *
     * @param {object} [field] - the board `{ width, height }`; what runs off it does not count
     *   as shown. Given none, the shapes are read against nothing but each other.
     * @returns {Array} the anchors that stay, in their original order
     */
    trim(anchors, span, field = null) {
      const n = anchors.length;
      if (!n) return anchors;
      const size = (i) => anchors[i].span ?? span;
      const data = anchors.map((a) => dataFor(a.slot));

      // The board region the shapes span, and a grid of square cells over it.
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      const box = anchors.map((a, i) => {
        const s = size(i);
        const e = data[i].ext;
        const [bx0, by0] = toBoard(a, s, e.minX, e.minY);
        const [bx1, by1] = toBoard(a, s, e.maxX, e.maxY);
        if (bx0 < x0) x0 = bx0;
        if (bx1 > x1) x1 = bx1;
        if (by0 < y0) y0 = by0;
        if (by1 > y1) y1 = by1;
        return { x0: bx0, x1: bx1, y0: by0, y1: by1 };
      });
      const cell = (x1 - x0) / TRIM_RES || 1;
      const w = TRIM_RES;
      const h = Math.max(1, Math.ceil((y1 - y0) / cell));

      // Each shape's cells and its full footprint, worked out once: they are fixed for the
      // whole trim, only which shapes are present changes. A run is `[row, from, to]` packed
      // flat, three numbers a stretch, so a pass paints from it without touching the outline.
      const runs = [];
      const total = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        const a = anchors[i];
        const s = size(i);
        const run = [];
        const ry0 = Math.max(0, Math.floor((box[i].y0 - y0) / cell));
        const ry1 = Math.min(h - 1, Math.floor((box[i].y1 - y0) / cell));
        for (let ry = ry0; ry <= ry1; ry++) {
          const ly = ((y0 + (ry + 0.5) * cell) - a.cy) / s + 0.5;
          const xs = rowCrossings(data[i].silhouette, ly);
          for (let p = 0; p + 1 < xs.length; p += 2) {
            const from = Math.max(0, Math.floor((a.cx + (xs[p] - 0.5) * s - x0) / cell));
            const to = Math.min(w - 1, Math.floor((a.cx + (xs[p + 1] - 0.5) * s - x0) / cell));
            if (to < from) continue;
            run.push(ry, from, to);
            total[i] += to - from + 1;
          }
        }
        runs.push(run);
      }

      // What falls on the board. A shape run off an edge is as good as covered there -- the
      // player never sees that part -- so its off-board cells, though it is the topmost shape
      // in them, do not count as shown. Given no field, the whole grid counts.
      const cxLo = field ? Math.max(0, Math.ceil((0 - x0) / cell - 0.5)) : 0;
      const cxHi = field ? Math.min(w - 1, Math.floor((field.width - x0) / cell - 0.5)) : w - 1;
      const ryLo = field ? Math.max(0, Math.ceil((0 - y0) / cell - 0.5)) : 0;
      const ryHi = field ? Math.min(h - 1, Math.floor((field.height - y0) / cell - 0.5)) : h - 1;

      // Lift off every shape under the bar, then read the board again: removing a shape only
      // uncovers what was under it, so a shape that was just short may clear the bar once its
      // cover goes, and none is ever pushed under. A pass paints the present shapes' cells --
      // later over earlier, as they are drawn -- counts each shape's on-board topmost cells,
      // and lifts those showing too few. A few passes settle it, and every survivor clears.
      const owner = new Int32Array(w * h);
      const visible = new Int32Array(n);
      const present = new Uint8Array(n).fill(1);
      for (;;) {
        owner.fill(-1);
        for (let i = 0; i < n; i++) {
          if (!present[i]) continue;
          const run = runs[i];
          for (let q = 0; q < run.length; q += 3) {
            const base = run[q] * w;
            for (let cx = run[q + 1]; cx <= run[q + 2]; cx++) owner[base + cx] = i;
          }
        }
        visible.fill(0);
        for (let ry = ryLo; ry <= ryHi; ry++) {
          const base = ry * w;
          for (let cx = cxLo; cx <= cxHi; cx++) {
            const o = owner[base + cx];
            if (o >= 0) visible[o]++;
          }
        }
        let lifted = false;
        for (let i = 0; i < n; i++) {
          if (present[i] && total[i] && visible[i] / total[i] < READABLE) { present[i] = 0; lifted = true; }
        }
        if (!lifted) break;
      }
      return anchors.filter((_, i) => present[i]);
    },

    /** The fairness cost of asking for `target` on this board, in its own draw order. 0 is fair. */
    judge(anchors, target, span) {
      return assess(anchors, span).costFor(target);
    },

    /**
     * The faults asking for `target` carries on this board, as anchor indices by kind:
     * `buried` (a copy showing nothing), `dim` (a copy showing too little to find),
     * `unread` (a copy taken for a twin), `decoy` (a twin reading as the target). Lifting
     * the buried and dim copies off the board wins back a board a churn would have redealt.
     */
    faults(anchors, target, span) {
      return assess(anchors, span).faultsFor(target);
    },

    /**
     * A fair board from this one, by lifting off its few offending shapes rather than
     * dealing a whole new one.
     *
     * The fairest ask is chosen, then the shapes that make it unfair are removed: a buried
     * or half-shown copy of the target, a copy taken for a twin, a twin that reads as the
     * target. Removing a shape only reveals what was under it, so it makes no new fault --
     * the board is re-read after a lift and settles in a pass or two. A board with more
     * faults than the cap, or one that would lose its last target copy, is handed back
     * unmended for the caller to deal again. Most boards mend in one lift or were fair.
     *
     * @param {string} [prefer] - the ask to keep if it reads as fairly as any other
     * @returns {{ anchors, target, askedAt, cost, removed }}
     */
    mend(anchors, anglesOf, span, seed, prefer = null) {
      const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
      let laid = anchors;
      let assessed = assess(laid, span);
      const target = pickTarget(assessed, rng, prefer);
      let removed = 0;
      for (let pass = 0; pass < 3; pass++) {
        const f = assessed.faultsFor(target);
        const lift = [...f.buried, ...f.dim, ...f.unread, ...f.decoy];
        if (!lift.length) break;
        const copiesLost = f.buried.length + f.dim.length + f.unread.length;
        const copiesLeft = laid.reduce((k, a) => k + (a.slot.model === target ? 1 : 0), 0) - copiesLost;
        if (lift.length > MEND_CAP || copiesLeft < 1) break;   // too tangled -- deal again
        const drop = new Set(lift);
        laid = laid.filter((_, i) => !drop.has(i));
        removed += lift.length;
        assessed = assess(laid, span);   // re-read only after an actual lift
      }
      return {
        anchors: laid,
        target,
        askedAt: askAngle(laid, target, anglesOf, rng),
        cost: assessed.costFor(target),
        removed,
      };
    },
  };
}
