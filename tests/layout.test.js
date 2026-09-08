import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutFor, PIXEL_BUDGET } from '../src/layout.js';

test('the panel turns ninety degrees with the screen', () => {
  const tall = layoutFor(393, 852, 3);
  assert.ok(tall.portrait);
  assert.equal(tall.panel.x, 0, 'a tall screen puts the panel under the board');
  assert.equal(tall.panel.y, tall.board.height);
  assert.equal(tall.panel.width, tall.width, 'and it runs the full width');

  const wide = layoutFor(1440, 900, 1);
  assert.ok(!wide.portrait);
  assert.equal(wide.panel.y, 0, 'a wide screen puts the panel beside the board');
  assert.equal(wide.panel.x, wide.board.width);
  assert.equal(wide.panel.height, wide.height, 'and it runs the full height');
});

test('the board and the panel tile the canvas exactly', () => {
  for (const [w, h, dpr] of [[393, 852, 3], [1440, 900, 1], [1024, 1366, 2],
                             [852, 393, 3], [2560, 1440, 1]]) {
    const { width, height, board, panel } = layoutFor(w, h, dpr);
    const covered = board.width * board.height + panel.width * panel.height;
    assert.equal(covered, width * height, `${w}x${h} leaves a gap or overlaps`);
  }
});

test('the canvas keeps the screen shape and stays inside the budget', () => {
  for (const [w, h, dpr] of [[393, 852, 3], [1440, 900, 1], [2560, 1440, 1]]) {
    const place = layoutFor(w, h, dpr);
    assert.ok(place.width * place.height <= PIXEL_BUDGET * 1.01,
              `${w}x${h} asks for more pixels than the repaint affords`);
    const asked = w / h;
    const got = place.width / place.height;
    assert.ok(Math.abs(asked - got) / asked < 0.01,
              `${w}x${h} distorts: wanted ${asked.toFixed(3)}, got ${got.toFixed(3)}`);
  }
});

test('the canvas is never asked to be scaled up beyond the budget', () => {
  // Under the budget the canvas matches the device pixels, so nothing is upscaled.
  const place = layoutFor(1440, 900, 1);
  assert.equal(place.width, 1440);
  assert.equal(place.height, 900);
});

test('a viewport with no area is refused rather than guessed at', () => {
  assert.throws(() => layoutFor(0, 800, 1));
  assert.throws(() => layoutFor(800, 0, 1));
});
