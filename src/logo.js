// Trace ROM Studio wordmark — the house mark, rendered procedurally to Canvas.
//
// The look: TRACE / ROM / STUDIO stacked in three width-justified rows, then cut
// by horizontal scanlines whose thickness tapers thin -> thick -> thin from the
// poles to the equator (a cos² profile). Flat lines read as one lit, curved
// surface — the Saul Bass AT&T globe (1983) trick, recast as a CRT readout.
//
// House rules honored here:
//   - Code/data separation: all tuning lives in LOGO_DEFAULTS (data); the
//     functions below only consume it. Retune the mark without editing logic.
//   - Pure core, boundary rendering: scanlineBands() and rowLayout() are pure and
//     testable; only drawLogo() touches a canvas, and it takes the ctx in.
//   - Deterministic: no Math.random(); same config -> same pixels.
//   - Fail loudly: drawLogo() validates its context at the boundary.

/** Tuning for the mark. Tuned against a 900×560 field; scales via options. */
export const LOGO_DEFAULTS = {
  width: 900,
  height: 560,
  background: '#0a0a0a',
  foreground: '#ffb000', // phosphor amber — recontextualized, not AT&T blue
  fontFamily: '"Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif',
  fontWeight: 900,
  fontSize: 130,
  rows: ['TRACE', 'ROM', 'STUDIO'],
  targetWidth: 600, // every row is justified (glyph-stretched) to this width
  rowGap: 100, // center-to-center row spacing; near-touching at fontSize 130
  pitch: 11, // scanline center-to-center spacing
  thicknessMax: 9.0, // band thickness at the equator (densest)
  thicknessMin: 1.4, // band thickness at the poles (airiest)
};

/**
 * The cos² luminance profile: 1 at the vertical center, 0 at the poles.
 * @param {number} y - pixel row.
 * @param {number} height - field height.
 * @returns {number} taper weight in [0, 1].
 */
function taperAt(y, height) {
  const d = (y - height / 2) / (height / 2); // -1..1
  const c = Math.cos((d * Math.PI) / 2);
  return c * c;
}

/**
 * Horizontal scanline bands for a field of the given height. Pure geometry —
 * no canvas. Each band is the mask stripe that reveals the letters beneath it.
 * @param {number} height
 * @param {object} [cfg] - overrides for pitch / thicknessMin / thicknessMax.
 * @returns {Array<{y: number, thickness: number}>} top-edge y and height per band.
 */
export function scanlineBands(height, cfg = LOGO_DEFAULTS) {
  const { pitch, thicknessMin, thicknessMax } = cfg;
  const bands = [];
  for (let center = 0; center <= height; center += pitch) {
    const t = thicknessMin + (thicknessMax - thicknessMin) * taperAt(center, height);
    bands.push({ y: center - t / 2, thickness: t });
  }
  return bands;
}

/**
 * Vertical placement of the rows, centered as a block on the field. Pure.
 * @param {object} [cfg]
 * @returns {Array<{text: string, cy: number}>} each row's text and midline y.
 */
export function rowLayout(cfg = LOGO_DEFAULTS) {
  const { rows, rowGap, height } = cfg;
  const firstCy = height / 2 - ((rows.length - 1) * rowGap) / 2;
  return rows.map((text, i) => ({ text, cy: firstCy + i * rowGap }));
}

/** Draw one row centered at (width/2, cy), stretched to targetWidth. */
function drawJustifiedRow(ctx, text, cy, cfg) {
  const natural = ctx.measureText(text).width;
  const scaleX = natural > 0 ? cfg.targetWidth / natural : 1;
  ctx.save();
  ctx.translate(cfg.width / 2, cy);
  ctx.scale(scaleX, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/**
 * Render the wordmark to a 2D canvas context. This is the boundary: it owns the
 * canvas so the geometry above can stay pure.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} [options] - shallow overrides of LOGO_DEFAULTS.
 */
export function drawLogo(ctx, options = {}) {
  if (!ctx || typeof ctx.fillRect !== 'function' || typeof ctx.clip !== 'function') {
    throw new Error('drawLogo() requires a 2D canvas context'); // boundary check
  }
  const cfg = { ...LOGO_DEFAULTS, ...options };

  ctx.fillStyle = cfg.background;
  ctx.fillRect(0, 0, cfg.width, cfg.height);

  ctx.fillStyle = cfg.foreground;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${cfg.fontWeight} ${cfg.fontSize}px ${cfg.fontFamily}`;

  const rows = rowLayout(cfg);
  // Clip to each scanline band and paint the rows through it — the band acts as
  // the mask, so only the lit stripes of each letter survive.
  for (const band of scanlineBands(cfg.height, cfg)) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, band.y, cfg.width, band.thickness);
    ctx.clip();
    for (const row of rows) drawJustifiedRow(ctx, row.text, row.cy, cfg);
    ctx.restore();
  }
}

// Auto-render when a <canvas id="logo"> is present (skipped under `node --test`).
if (typeof document !== 'undefined') {
  const canvas = document.getElementById('logo');
  if (canvas) {
    drawLogo(canvas.getContext('2d'), { width: canvas.width, height: canvas.height });
  }
}
