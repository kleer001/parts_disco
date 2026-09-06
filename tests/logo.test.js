import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanlineBands, rowLayout, LOGO_DEFAULTS } from '../src/logo.js';

test('scanline thickness stays within [min, max]', () => {
  const bands = scanlineBands(LOGO_DEFAULTS.height, LOGO_DEFAULTS);
  for (const { thickness } of bands) {
    assert.ok(
      thickness >= LOGO_DEFAULTS.thicknessMin - 1e-9 &&
        thickness <= LOGO_DEFAULTS.thicknessMax + 1e-9,
      `thickness out of range: ${thickness}`,
    );
  }
});

test('taper peaks at the equator and thins toward the poles', () => {
  const height = LOGO_DEFAULTS.height;
  const bands = scanlineBands(height, LOGO_DEFAULTS);
  const centerOf = (b) => b.y + b.thickness / 2;
  // Band nearest the vertical center should be (near) the thickest.
  const equator = bands.reduce((a, b) =>
    Math.abs(centerOf(a) - height / 2) < Math.abs(centerOf(b) - height / 2) ? a : b,
  );
  const maxThickness = Math.max(...bands.map((b) => b.thickness));
  assert.ok(
    Math.abs(equator.thickness - maxThickness) < 0.2,
    `equator band (${equator.thickness}) is not near the max (${maxThickness})`,
  );
  // The very first (pole) band should be thinner than the equator band.
  assert.ok(bands[0].thickness < equator.thickness);
});

test('taper is symmetric about the center', () => {
  const height = 560;
  const cfg = { ...LOGO_DEFAULTS, height, pitch: 10 }; // 560/10 -> clean mirror
  const bands = scanlineBands(height, cfg);
  for (let i = 0; i < bands.length; i++) {
    const mirror = bands[bands.length - 1 - i];
    assert.ok(
      Math.abs(bands[i].thickness - mirror.thickness) < 1e-9,
      `bands ${i} and its mirror differ: ${bands[i].thickness} vs ${mirror.thickness}`,
    );
  }
});

test('scanlineBands is deterministic', () => {
  const a = scanlineBands(LOGO_DEFAULTS.height, LOGO_DEFAULTS);
  const b = scanlineBands(LOGO_DEFAULTS.height, LOGO_DEFAULTS);
  assert.deepEqual(a, b);
});

test('rows are centered as a block on the field', () => {
  const rows = rowLayout(LOGO_DEFAULTS);
  assert.equal(rows.length, LOGO_DEFAULTS.rows.length);
  // Midpoint of the first and last row centers is the field center.
  const mid = (rows[0].cy + rows[rows.length - 1].cy) / 2;
  assert.ok(Math.abs(mid - LOGO_DEFAULTS.height / 2) < 1e-9, `block not centered: ${mid}`);
  // Spacing matches rowGap.
  assert.ok(Math.abs(rows[1].cy - rows[0].cy - LOGO_DEFAULTS.rowGap) < 1e-9);
});
