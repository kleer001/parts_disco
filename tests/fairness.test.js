import test from 'node:test';
import assert from 'node:assert/strict';
import { createFairPlay } from '../src/fairness.js';

// Synthetic views, so a test can say exactly which shapes are twins and which are not. A
// view is silhouette rings in the 0..1 frame; the strokes double them, as a real view
// carries both.
const view = (...rings) => ({ silhouette: rings, strokes: rings });
const box = (a, b) => [[a, a], [b, a], [b, b], [a, b]];

// base sits inside bump: bump is base with a tab on top, so base cannot be told from a
// bump whose tab is hidden -- a shape and its own silhouette-subset are confusable both
// ways. tabl and tabr share a body but wear the tab on opposite sides: twins, yet each
// carries a tell the other lacks, so either is plain once it is fully shown.
const BASE = view([[0.2, 0.3], [0.8, 0.3], [0.8, 0.8], [0.2, 0.8]]);
const BUMP = view([[0.2, 0.3], [0.35, 0.3], [0.35, 0.05], [0.65, 0.05], [0.65, 0.3],
                   [0.8, 0.3], [0.8, 0.8], [0.2, 0.8]]);
const TABL = view([[0.2, 0.05], [0.4, 0.05], [0.4, 0.3], [0.8, 0.3], [0.8, 0.8], [0.2, 0.8]]);
const TABR = view([[0.6, 0.05], [0.8, 0.05], [0.8, 0.8], [0.2, 0.8], [0.2, 0.3], [0.6, 0.3]]);
const VIEWS = {
  full: view(box(0.1, 0.9)),        // fills most of its frame
  corner: view(box(0.6, 0.95)),     // a small corner shape -- shares little with full
  base: BASE,
  bump: BUMP,
  tabl: TABL,
  tabr: TABR,
};
const viewOf = (slot) => VIEWS[slot.model];
const anglesOf = () => [0, 90, 180, 270];
const at = (model, cx, cy) => ({ slot: { group: 'g', model, angle: 0 }, cx, cy });
const SPAN = 100;

test('a shape read against a distant copy of itself is fair', () => {
  const fair = createFairPlay(viewOf);
  const board = [at('full', 200, 200), at('full', 600, 200)];
  assert.equal(fair.judge(board, 'full', SPAN), 0);
});

test('a target with a wholly buried copy cannot be won, and scores as such', () => {
  const fair = createFairPlay(viewOf);
  // Three copies stacked exactly: the two under the top one show nothing, so two copies
  // of the target are unfindable.
  const board = [at('full', 300, 300), at('full', 300, 300), at('full', 300, 300)];
  assert.ok(fair.judge(board, 'full', SPAN) >= 100);
});

test('the ask falls on the target the board reads most fairly for', () => {
  const fair = createFairPlay(viewOf);
  // full has a buried copy; corner is clear. The fair ask is corner.
  const board = [at('full', 300, 300), at('full', 300, 300), at('corner', 700, 400)];
  const out = fair.choose(board, anglesOf, SPAN, 11);
  assert.equal(out.target, 'corner');
  assert.equal(out.cost, 0);
  assert.ok(out.askedAt === null || anglesOf().includes(out.askedAt));
});

test('twins that each show their own tell read fairly', () => {
  const fair = createFairPlay(viewOf);
  // Both fully shown and apart: tabl shows its left tab, tabr its right, so neither can be
  // taken for the other. Asking either is fair.
  const board = [at('tabl', 200, 200), at('tabr', 600, 200)];
  assert.equal(fair.judge(board, 'tabl', SPAN), 0);
  assert.equal(fair.judge(board, 'tabr', SPAN), 0);
});

test('a shape and its silhouette-subset are unfair to ask either way', () => {
  const fair = createFairPlay(viewOf);
  // base is wholly inside bump. A base could be a bump with its tab hidden, and a bump
  // read only across its body could be a base -- neither ask is safe.
  const board = [at('bump', 200, 200), at('base', 600, 200)];
  assert.ok(fair.judge(board, 'bump', SPAN) > 0, 'a visible base should trap a bump ask');
  assert.ok(fair.judge(board, 'base', SPAN) > 0, 'a visible bump should trap a base ask');
});

test('the same seed chooses the same ask; a valid one', () => {
  const fair = createFairPlay(viewOf);
  const board = [at('full', 200, 200), at('corner', 260, 220), at('full', 320, 240),
                 at('corner', 240, 300)];
  const a = fair.choose(board, anglesOf, SPAN, 77);
  const b = fair.choose(board, anglesOf, SPAN, 77);
  assert.deepEqual(a, b);
  assert.ok(['full', 'corner'].includes(a.target));
});
