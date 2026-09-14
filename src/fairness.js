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

/** How many shapes may be lifted off a board to mend it before it is dealt again instead.
 *  A board with more faults than this is more tangled than it is worth un-picking. */
const MEND_CAP = 5;

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
  // The silhouette, the same polygon `pick` clicks against -- never the strokes, so a
  // shape is judged against the outline it is hit-tested against and the two cannot drift.
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

    // What each shape shows of itself: its samples, less those under any later (higher,
    // nearer) neighbour that overlaps it. The draw order is the array order, so a neighbour
    // is nearer when its index is greater, exactly as `pick` walks the pile.
    const vis = new Int32Array(n);
    const overlap = (i, j) => !(car[i].box.maxX < car[j].box.minX || car[j].box.maxX < car[i].box.minX
      || car[i].box.maxY < car[j].box.minY || car[j].box.maxY < car[i].box.minY);
    for (let i = 0; i < n; i++) {
      // A one bit per sample, all shown to start. `2 ** count` rather than `1 << count`
      // because at the 31-sample cap the shift would land on the sign bit.
      let seen = (2 ** car[i].count) - 1;
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
    // How much each shape shows, counted once: `faultsFor` reads it for every candidate ask.
    const shown = Int32Array.from(vis, bits);

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
