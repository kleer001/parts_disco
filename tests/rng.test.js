import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js';

test('same seed produces the same sequence', () => {
  const a = mulberry32(12345);
  const b = mulberry32(12345);
  const seqA = [a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test('different seeds diverge', () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  assert.notEqual(a(), b());
});

test('output stays in [0, 1)', () => {
  const rand = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const x = rand();
    assert.ok(x >= 0 && x < 1, `value out of range: ${x}`);
  }
});
