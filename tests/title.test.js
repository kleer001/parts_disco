import test from 'node:test';
import assert from 'node:assert/strict';
import { createTitle, READY, WAITING } from '../src/title.js';

const PLACE = { width: 1000, height: 700, portrait: false };

/**
 * Just enough of a 2D context to be drawn into, and a record of what was written.
 *
 * The title is a boundary onto the canvas the way `layers.js` is, so what can be
 * asserted about it outside a browser is what it asked the context to do.
 */
function fakeCtx() {
  const said = [];
  return {
    said,
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '',
    textAlign: '', textBaseline: '',
    shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    fillRect() {}, fill() {}, stroke() {},
    beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {}, closePath() {},
    save() {}, restore() {},
    measureText: (t) => ({ width: t.length * 10 }),
    fillText(t) { said.push(t); },
  };
}

/** A fleet of one model, which is all the title asks a fleet for. */
const fleet = {
  models: [{ name: 'van', angles: [0] }],
  anglesOf: () => [0],
  view: () => ({ strokes: [[[0, 0], [1, 0], [1, 1]]], silhouette: [[[0, 0], [1, 0], [1, 1]]] }),
};

test('the screen paints before there is a fleet to paint', () => {
  const title = createTitle(PLACE, 1983);
  const ctx = fakeCtx();
  title.draw(ctx, null);
  assert.ok(ctx.said.includes(WAITING), 'it says what it is waiting for');
  assert.ok(!ctx.said.includes(READY), 'and does not offer a game it cannot start');
});

test('nothing can click past the title until the fleet has landed', () => {
  const title = createTitle(PLACE, 1983);
  const ctx = fakeCtx();
  title.draw(ctx, null);

  // Sweep the whole screen: while the fleet is in flight there is no live pixel.
  for (let x = 0; x <= PLACE.width; x += 25) {
    for (let y = 0; y <= PLACE.height; y += 25) {
      assert.ok(!title.hit([x, y]), `nothing is pressable at ${x},${y}`);
    }
  }
});

test('the button goes live where it was drawn, and only there', () => {
  const title = createTitle(PLACE, 1983);
  const ctx = fakeCtx();
  title.draw(ctx, fleet);
  assert.ok(ctx.said.includes(READY), 'the button offers the game');

  // The label is centred, and the button is drawn around it at 74% down.
  const mid = [PLACE.width / 2, PLACE.height * 0.76];
  assert.ok(title.hit(mid), 'the middle of the button presses it');
  assert.ok(!title.hit([PLACE.width / 2, PLACE.height * 0.2]), 'the yard does not');
  assert.ok(!title.hit([2, PLACE.height * 0.76]), 'nor the margin beside it');
});
