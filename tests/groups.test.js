import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroupOrder } from '../src/groups.js';
import { STAGES } from '../src/levels.js';

const IDS = ['a', 'b', 'c', 'd', 'e', 'f'];

test('a seed deals the same group order every time', () => {
  const one = createGroupOrder(1234, IDS);
  const two = createGroupOrder(1234, IDS);
  for (let d = 0; d < 40; d++) assert.equal(one(d), two(d));
});

test('different seeds deal different orders', () => {
  const seq = (seed) => Array.from({ length: 16 }, (_, d) => createGroupOrder(seed, IDS)(d)).join('');
  assert.notEqual(seq(1), seq(2));
});

test('no two boards in a row are the same group -- bookends never touch', () => {
  for (const seed of [1, 7, 42, 1983, 55555]) {
    const order = createGroupOrder(seed, IDS);
    let prev = order(0);
    for (let d = 1; d < 200; d++) {   // well past sixteen, into an endless climb
      const here = order(d);
      assert.notEqual(here, prev, `seed ${seed}: repeat at depth ${d}`);
      prev = here;
    }
  }
});

test('every board draws a group that is one of the ids, at any depth', () => {
  const order = createGroupOrder(9, IDS);
  for (let d = 0; d < 500; d++) assert.ok(IDS.includes(order(d)));
});

test('each level is its own shuffle -- no group twice inside one level', () => {
  const order = createGroupOrder(3, IDS);
  for (let lvl = 0; lvl < 10; lvl++) {
    const seen = new Set();
    for (let s = 0; s < STAGES; s++) seen.add(order(lvl * STAGES + s));
    assert.equal(seen.size, STAGES, `level ${lvl} reused a group within itself`);
  }
});
