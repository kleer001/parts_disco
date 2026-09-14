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

/** How finely a silhouette is filled to sample its body -- rows and columns. Fine enough
 *  that a thin shape, whose interior a coarse grid slips between, still fills a run of cells
 *  on every row it crosses. */
const SAMPLE_RES = 48;

/** The fill is reduced to one sample per cell of a grid this many on a side over the shape,
 *  so a shape stands for itself by evenly-spread samples -- fine enough that how much of it a
 *  cover hides tracks its area, capped so the set fits the two-lane mask. */
const SAMPLE_CELLS = 7;

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
const TRIM_RES = 220;

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

/** popcount for one 30-bit lane. */
function bits(lane) {
  let n = 0;
  for (let m = lane; m; m &= m - 1) n++;
  return n;
}

// A set of sample bits as two 30-bit lanes, so a shape can carry more samples than one
// number holds bits -- enough that how many a cover hides tracks how much area it takes.
// Each helper is the plain bit op it is named for, on the pair.
const LANE = 30;
const emptyMask = () => [0, 0];
const copyMask = (m) => [m[0], m[1]];
const setBit = (m, k) => { if (k < LANE) m[0] |= 1 << k; else m[1] |= 1 << (k - LANE); };
const orMask = (m, o) => { m[0] |= o[0]; m[1] |= o[1]; };          // m |= o
const clearMask = (m, o) => { m[0] &= ~o[0]; m[1] &= ~o[1]; };     // m &= ~o
const countMask = (m) => bits(m[0]) + bits(m[1]);
const anyMask = (m) => m[0] !== 0 || m[1] !== 0;
const meetMask = (a, b) => (a[0] & b[0]) !== 0 || (a[1] & b[1]) !== 0;   // a & b is non-empty
const fullMask = (count) => [(2 ** Math.min(count, LANE)) - 1, count > LANE ? (2 ** (count - LANE)) - 1 : 0];

/**
 * Interior sample points of a view, and its outline's box, in the 0..1 frame.
 *
 * The silhouette is filled by scanlines: on each row the ranges between the outline's
 * crossings are inside it, and every cell a range touches is taken as a sample. Filling by
 * range rather than testing a grid of points is what carries a thin shape -- a fork on its
 * side, no wider than a hair at some angles -- which slips between the points of any grid
 * but still fills a cell on each row it crosses. The samples are interior, so how many a
 * neighbour hides is how much of the shape's body it covers, with no edge-of-a-cover point
 * to read as neither in nor out. Capped to one 31-bit mask, thinned evenly across the fill.
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
  const filled = [];
  for (let r = 0; r < SAMPLE_RES; r++) {
    const y = (r + 0.5) / SAMPLE_RES;
    const crossings = [];
    for (const ring of silhouette) {
      for (let k = 0; k < ring.length; k++) {
        const [x0, y0] = ring[k];
        const [x1, y1] = ring[(k + 1) % ring.length];
        if ((y0 > y) !== (y1 > y)) crossings.push(x0 + ((x1 - x0) * (y - y0)) / (y1 - y0));
      }
    }
    crossings.sort((a, b) => a - b);
    // Between each pair of crossings is inside the shape. Spread points evenly within the
    // range -- always strictly inside it, never on a cover's edge -- one at the midpoint when
    // the range is thinner than a cell, so a hairline stretch still stands for the shape.
    for (let p = 0; p + 1 < crossings.length; p += 2) {
      const xa = crossings[p];
      const xb = crossings[p + 1];
      const count = Math.max(1, Math.round((xb - xa) * SAMPLE_RES));
      for (let m = 0; m < count; m++) filled.push([xa + ((m + 0.5) / count) * (xb - xa), y]);
    }
  }
  // Reduce the fill to one sample per cell of a coarse grid over the shape, so the samples
  // are spread across its body rather than picked by a stride through the fill's row order.
  // That stride lines up with a covered region often enough to miss it whole; a grid loses
  // samples to a cover in proportion to the area it takes, which is what visibility is.
  const spanX = (maxX - minX) || 1;
  const spanY = (maxY - minY) || 1;
  const chosen = new Map();
  for (const [x, y] of filled) {
    const gx = Math.min(SAMPLE_CELLS - 1, Math.floor(((x - minX) / spanX) * SAMPLE_CELLS));
    const gy = Math.min(SAMPLE_CELLS - 1, Math.floor(((y - minY) / spanY) * SAMPLE_CELLS));
    const key = gy * SAMPLE_CELLS + gx;
    if (!chosen.has(key)) chosen.set(key, [x, y]);
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
  const tell = emptyMask();
  a.samples.forEach(([x, y], k) => {
    if (!inSilhouette(b.silhouette, x, y)) setBit(tell, k);
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
    const full = car.map((c) => fullMask(c.count));
    const overlap = (i, j) => !(car[i].box.maxX < car[j].box.minX || car[j].box.maxX < car[i].box.minX
      || car[i].box.maxY < car[j].box.minY || car[j].box.maxY < car[i].box.minY);
    const cover = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!overlap(i, j)) continue;
        const a = anchors[i];
        const b = anchors[j];
        const sj = size(j);
        const mask = emptyMask();
        car[i].data.samples.forEach(([x, y], k) => {
          const [bx, by] = toBoard(a, size(i), x, y);
          if (inSilhouette(car[j].data.silhouette, (bx - b.cx) / sj + 0.5, (by - b.cy) / sj + 0.5)) {
            setBit(mask, k);
          }
        });
        if (anyMask(mask)) cover[i].push({ j, mask });
      }
    }
    // What each shape shows of itself on the full board, and how much of it -- read once by
    // `faultsFor` for every candidate ask.
    const vis = full.map((f, i) => {
      const seen = copyMask(f);
      for (const { mask } of cover[i]) clearMask(seen, mask);
      return seen;
    });
    const shown = vis.map(countMask);

    const models = [...new Set(car.map((c) => c.model))];

    // Every other shape whose outline coincides enough with shape `i` to be mistaken for it,
    // and their combined tell. `matchTarget` picks the side: a copy of the target is read
    // against the other models, a decoy against the target's own copies.
    const twinTell = (i, target, matchTarget) => {
      const tell = emptyMask();
      let twinned = false;
      for (let k = 0; k < n; k++) {
        if ((car[k].model === target) !== matchTarget) continue;
        const cmp = pairFor(anchors[i].slot, anchors[k].slot);
        if (cmp.iou >= TWIN_IOU) { orMask(tell, cmp.tell); twinned = true; }
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
          else if (twinned && !meetMask(vis[i], tell)) unread.push(i);
        } else {
          const { tell, twinned } = twinTell(i, target, true);
          if (twinned && clickable(shown[i], car[i].count) && !meetMask(vis[i], tell)) decoy.push(i);
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
        const b = { x0: a.cx + (e.minX - 0.5) * s, x1: a.cx + (e.maxX - 0.5) * s,
                    y0: a.cy + (e.minY - 0.5) * s, y1: a.cy + (e.maxY - 0.5) * s };
        if (b.x0 < x0) x0 = b.x0;
        if (b.x1 > x1) x1 = b.x1;
        if (b.y0 < y0) y0 = b.y0;
        if (b.y1 > y1) y1 = b.y1;
        return b;
      });
      const cell = (x1 - x0) / TRIM_RES || 1;
      const w = TRIM_RES;
      const h = Math.max(1, Math.ceil((y1 - y0) / cell));
      const owner = new Int32Array(w * h);
      const total = new Int32Array(n);
      const visible = new Int32Array(n);

      // Fill every present shape into the grid, later over earlier as the board is drawn, and
      // count both the cells each shape covers and the cells it keeps as topmost. A shape's
      // share shown is the ratio -- an exact area, since every cell it fills is counted.
      const measure = (present) => {
        owner.fill(-1);
        total.fill(0);
        for (let i = 0; i < n; i++) {
          if (!present[i]) continue;
          const a = anchors[i];
          const s = size(i);
          const ry0 = Math.max(0, Math.floor((box[i].y0 - y0) / cell));
          const ry1 = Math.min(h - 1, Math.floor((box[i].y1 - y0) / cell));
          for (let ry = ry0; ry <= ry1; ry++) {
            const ly = ((y0 + (ry + 0.5) * cell) - a.cy) / s + 0.5;
            const xs = [];
            for (const ring of data[i].silhouette) {
              for (let k = 0; k < ring.length; k++) {
                const [lx0, lyy0] = ring[k];
                const [lx1, lyy1] = ring[(k + 1) % ring.length];
                if ((lyy0 > ly) !== (lyy1 > ly)) xs.push(lx0 + ((lx1 - lx0) * (ly - lyy0)) / (lyy1 - lyy0));
              }
            }
            xs.sort((p, q) => p - q);
            for (let p = 0; p + 1 < xs.length; p += 2) {
              const from = Math.max(0, Math.floor((a.cx + (xs[p] - 0.5) * s - x0) / cell));
              const to = Math.min(w - 1, Math.floor((a.cx + (xs[p + 1] - 0.5) * s - x0) / cell));
              for (let cx = from; cx <= to; cx++) { owner[ry * w + cx] = i; total[i]++; }
            }
          }
        }
        // Only what falls on the board counts as shown. A shape run off an edge is as good as
        // covered there -- the player never sees that part -- so its off-board cells, though it
        // is the topmost shape in them, are left out. Given no field, the whole grid counts.
        visible.fill(0);
        const cxLo = field ? Math.max(0, Math.ceil((0 - x0) / cell - 0.5)) : 0;
        const cxHi = field ? Math.min(w - 1, Math.floor((field.width - x0) / cell - 0.5)) : w - 1;
        const ryLo = field ? Math.max(0, Math.ceil((0 - y0) / cell - 0.5)) : 0;
        const ryHi = field ? Math.min(h - 1, Math.floor((field.height - y0) / cell - 0.5)) : h - 1;
        for (let ry = ryLo; ry <= ryHi; ry++) {
          for (let cx = cxLo; cx <= cxHi; cx++) {
            const o = owner[ry * w + cx];
            if (o >= 0) visible[o]++;
          }
        }
      };

      // Lift off every shape under the bar, then read the board again: removing a shape only
      // uncovers what was under it, so a shape that was just short may clear the bar once its
      // cover goes, and none is ever pushed under. A few passes settle it, far fewer reads
      // than lifting one shape at a time, and every survivor ends over the bar.
      const present = new Uint8Array(n).fill(1);
      for (;;) {
        measure(present);
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
