import test from 'node:test';
import assert from 'node:assert/strict';

import { fold, driftAt } from '../src/drift.js';

test('fold leaves a value already inside the bounds alone', () => {
  assert.equal(fold(30, 0, 100), 30);
});

test('fold turns a value back at the far edge', () => {
  assert.equal(fold(120, 0, 100), 80);
});

test('fold turns a value back at the near edge', () => {
  assert.equal(fold(-30, 0, 100), 30);
});

test('fold keeps a value in bounds however far it has travelled', () => {
  for (const value of [1e4, -1e4, 12345.6, -987.65]) {
    const folded = fold(value, 0, 100);
    assert.ok(folded >= 0 && folded <= 100, `${value} folded to ${folded}`);
  }
});

test('driftAt is a function of t, not of how it was reached', () => {
  const body = { x: 10, y: 20, vx: 37, vy: -19 };
  const field = { minX: 0, minY: 0, maxX: 200, maxY: 150 };
  assert.deepEqual(driftAt(body, 8.5, field), driftAt(body, 8.5, field));
});

test('a drifting body stays in the field', () => {
  const body = { x: 10, y: 20, vx: 37, vy: -19 };
  const field = { minX: 0, minY: 0, maxX: 200, maxY: 150 };
  for (let t = 0; t < 60; t += 0.37) {
    const { x, y } = driftAt(body, t, field);
    assert.ok(x >= 0 && x <= 200 && y >= 0 && y <= 150, `escaped at t=${t}`);
  }
});
