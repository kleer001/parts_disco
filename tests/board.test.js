import test from 'node:test';
import assert from 'node:assert/strict';
import { layout } from '../src/board.js';

// A stand-in for the real proxy: a shape centred in its frame, wider than it is tall. The
// half-extents are what the on-board margin keeps in from each edge.
const PROXY = { cx: 0.5, cy: 0.5, halfW: 0.3, halfH: 0.2, r: 0.2 };
const proxyFor = () => PROXY;
const placed = Array.from({ length: 8 }, (_, i) => ({ group: 'g', model: 'm', angle: i }));
const field = { width: 1000, height: 800 };
const SPAN = 200;

// Where a laid shape's outline box lands on the board, from its anchor and the proxy.
const boxOf = (anchor) => ({
  left: anchor.cx + (PROXY.cx - PROXY.halfW - 0.5) * SPAN,
  right: anchor.cx + (PROXY.cx + PROXY.halfW - 0.5) * SPAN,
  top: anchor.cy + (PROXY.cy - PROXY.halfH - 0.5) * SPAN,
  bottom: anchor.cy + (PROXY.cy + PROXY.halfH - 0.5) * SPAN,
});

test('onBoard keeps every shape whole inside the field', () => {
  const anchors = layout(placed, 1, SPAN, field, proxyFor, null, true);
  assert.equal(anchors.length, placed.length);
  for (const a of anchors) {
    const b = boxOf(a);
    assert.ok(b.left >= -0.5 && b.right <= field.width + 0.5, `x ${b.left}..${b.right} off the board`);
    assert.ok(b.top >= -0.5 && b.bottom <= field.height + 0.5, `y ${b.top}..${b.bottom} off the board`);
  }
});

test('without onBoard a shape is free to run off an edge', () => {
  // Over many seeds, the unmargined throw puts at least one shape past an edge -- the very
  // thing the silhouette stages cannot allow.
  let ranOff = false;
  for (let seed = 1; seed <= 40 && !ranOff; seed++) {
    for (const a of layout(placed, seed, SPAN, field, proxyFor, null, false)) {
      const b = boxOf(a);
      if (b.left < 0 || b.right > field.width || b.top < 0 || b.bottom > field.height) ranOff = true;
    }
  }
  assert.ok(ranOff, 'no shape ran off in 40 throws -- the margin would be untestable');
});
