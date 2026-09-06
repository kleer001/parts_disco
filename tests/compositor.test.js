import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCompositor, activeLayers } from '../src/compositor.js';

// A stand-in context: the compositor only needs save()/restore() plus whatever the
// layers use. These fakes record the call order so we can assert on it.
const recordingCtx = (events) => ({
  save: () => events.push('save'),
  restore: () => events.push('restore'),
});

test('layers draw in insertion order', () => {
  const calls = [];
  createCompositor()
    .add({ name: 'a', draw: () => calls.push('a') })
    .add({ name: 'b', draw: () => calls.push('b') })
    .add({ name: 'c', draw: () => calls.push('c') })
    .render(recordingCtx([]), {});
  assert.deepEqual(calls, ['a', 'b', 'c']);
});

test('disabled layers are skipped, order preserved', () => {
  const calls = [];
  createCompositor()
    .add({ name: 'a', draw: () => calls.push('a') })
    .add({ name: 'b', enabled: false, draw: () => calls.push('b') })
    .add({ name: 'c', draw: () => calls.push('c') })
    .render(recordingCtx([]), {});
  assert.deepEqual(calls, ['a', 'c']);
});

test('each layer draws inside its own save/restore', () => {
  const events = [];
  const ctx = {
    save: () => events.push('save'),
    restore: () => events.push('restore'),
  };
  createCompositor()
    .add({ name: 'a', draw: () => events.push('draw-a') })
    .add({ name: 'b', draw: () => events.push('draw-b') })
    .render(ctx, {});
  assert.deepEqual(events, ['save', 'draw-a', 'restore', 'save', 'draw-b', 'restore']);
});

test('the frame object is threaded to every layer', () => {
  const seen = [];
  const frame = { width: 800, height: 400, seed: 7 };
  createCompositor()
    .add({ name: 'a', draw: (_ctx, f) => seen.push(f) })
    .render(recordingCtx([]), frame);
  assert.equal(seen[0], frame);
});

test('activeLayers is pure and filters disabled, preserving order', () => {
  const layers = [
    { name: 'a', draw() {} },
    { name: 'b', enabled: false, draw() {} },
    { name: 'c', draw() {} },
  ];
  assert.deepEqual(
    activeLayers(layers).map((l) => l.name),
    ['a', 'c'],
  );
});

test('add() rejects a malformed layer', () => {
  assert.throws(() => createCompositor().add({ name: 'x' }), /must be/); // no draw
  assert.throws(() => createCompositor().add({ draw() {} }), /must be/); // no name
  assert.throws(() => createCompositor().add(null), /must be/);
});

test('render() validates the context at the boundary', () => {
  assert.throws(() => createCompositor().render(null), /2D canvas context/);
  assert.throws(() => createCompositor().render({}), /2D canvas context/);
});
