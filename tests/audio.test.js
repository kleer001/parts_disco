import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLoop, LOOP_CROSSFADE_MS } from '../src/audio.js';

const RATE = 44100;

/**
 * Just enough of a context and a buffer for `buildLoop`, which touches nothing else.
 *
 * The same reason `buildTone` takes its context: the construction is measurable
 * outside a browser only if nothing in it reaches for one.
 */
const ctx = {
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels, length, sampleRate,
      duration: length / sampleRate,
      getChannelData: (ch) => data[ch],
    };
  },
};

/** A file whose samples say where they came from, so a blend can be read off. */
function file(seconds, fill) {
  const length = Math.round(seconds * RATE);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) data[i] = fill(i);
  return {
    numberOfChannels: 1, length, sampleRate: RATE, duration: length / RATE,
    getChannelData: () => data,
  };
}

test('the loop is exactly as long as its trim', () => {
  const src = file(4, (i) => Math.sin(i / 50));
  const out = buildLoop(ctx, src, { startSec: 0.5, endSec: 3.5 });
  assert.equal(out.length, Math.round(3.5 * RATE) - Math.round(0.5 * RATE));
});

test('the head is mixed with what the file does after the loop ends', () => {
  const src = file(4, (i) => i);                 // every sample is its own index
  const from = Math.round(0.5 * RATE);
  const to = Math.round(3.5 * RATE);
  const fade = Math.round((LOOP_CROSSFADE_MS / 1000) * RATE);
  const out = buildLoop(ctx, src, { startSec: 0.5, endSec: 3.5 }).getChannelData(0);

  // At the very join the tail has all the weight, so the first sample of the loop is
  // the one the take carried on to -- not the one at `startSec`.
  assert.equal(out[0], to);
  // And past the fade nothing is touched.
  assert.equal(out[fade], from + fade);
  assert.equal(out[out.length - 1], to - 1);
});

test('blending closes the step the splice would have left', () => {
  // A tone whose period does not divide the trim, so head and tail meet badly.
  const src = file(4, (i) => Math.sin(i / 7.3));
  const raw = src.getChannelData(0);
  const from = Math.round(0.5 * RATE);
  const to = Math.round(3.5 * RATE);
  const spliced = Math.abs(raw[from] - raw[to - 1]);

  const out = buildLoop(ctx, src, { startSec: 0.5, endSec: 3.5 }).getChannelData(0);
  const joined = Math.abs(out[0] - out[out.length - 1]);
  assert.ok(joined < spliced / 10, `join ${joined} against splice ${spliced}`);
});

test('a trim with no room left to blend is refused, not quietly spliced', () => {
  const src = file(4, (i) => Math.sin(i / 50));
  assert.throws(() => buildLoop(ctx, src, { startSec: 0, endSec: 4 }), /join needs/);
});
