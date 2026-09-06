import test from 'node:test';
import assert from 'node:assert/strict';

import { place, contains, bounds } from '../src/geometry.js';

const SQUARE = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

test('place moves and scales a unit outline onto the board', () => {
  assert.deepEqual(
    place(SQUARE, { x: 100, y: 50, scale: 10 }),
    [[90, 40], [110, 40], [110, 60], [90, 60]],
  );
});

test('contains finds a point inside the outline', () => {
  assert.ok(contains([100, 50], place(SQUARE, { x: 100, y: 50, scale: 10 })));
});

test('contains rejects a point outside the outline', () => {
  assert.ok(!contains([200, 50], place(SQUARE, { x: 100, y: 50, scale: 10 })));
});

test('contains rejects a point in the notch of a concave outline', () => {
  // An L: the corner the L wraps around is inside the bounding box but not the part.
  const ell = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]];
  assert.ok(contains([0.5, 0.5], ell));
  assert.ok(!contains([2, 2], ell));
});

test('bounds reports the box the outline occupies', () => {
  assert.deepEqual(bounds(place(SQUARE, { x: 100, y: 50, scale: 10 })), {
    minX: 90, minY: 40, maxX: 110, maxY: 60,
  });
});
