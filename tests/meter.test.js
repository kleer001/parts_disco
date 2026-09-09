import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeter, costAt, CAPACITY, COST_FIRST, COST_LAST } from '../src/meter.js';

test('a wrong vehicle costs less the further down the path it is', () => {
  assert.equal(costAt(0), COST_FIRST, 'the first stage charges full price');
  assert.equal(costAt(1), COST_LAST, 'the last stage charges the floor');

  let last = Infinity;
  for (let i = 0; i <= 20; i++) {
    const cost = costAt(i / 20);
    assert.ok(cost < last, `the cost falls at every step of the path (${i})`);
    last = cost;
  }
});

test('the meter fills to its capacity and then the run is over', () => {
  const meter = createMeter();
  assert.equal(meter.filled, 0);
  assert.ok(!meter.full(), 'a fresh meter is not full');

  // Charged at the first stage, where a wrong vehicle costs a whole unit.
  for (let i = 1; i < CAPACITY; i++) {
    meter.take(0, i);
    assert.ok(!meter.full(), `${i} of ${CAPACITY} is not yet the end`);
  }
  meter.take(0, CAPACITY);
  assert.ok(meter.full(), 'the last unit ends it');
});

test('the reading never runs past the end of the ladder', () => {
  const meter = createMeter();
  for (let i = 0; i < CAPACITY * 3; i++) meter.take(0, i);
  assert.equal(meter.level(), 1, 'a meter charged past full still reads as full');
});

test('a hit is remembered, and a death forgets everything', () => {
  const meter = createMeter();
  assert.equal(meter.hitAt, null, 'nothing has hit it yet');
  meter.take(0.5, 12.5);
  assert.equal(meter.hitAt, 12.5, 'the needle knows when it was thrown');
  assert.ok(meter.filled > 0);

  meter.clear();
  assert.equal(meter.filled, 0, 'a death empties it');
  assert.equal(meter.hitAt, null, 'and the needle is at rest');
});
