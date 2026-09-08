// Where the board and the panel sit, given a viewport. Pure: two numbers in,
// rectangles out, so the arrangement can be checked without a browser.
//
// The board and the panel turn ninety degrees against each other. On a screen taller
// than it is wide the board takes the top and the panel sits under it; on a wider one
// the panel goes down the right-hand side. Nothing else in the game knows which.

/**
 * Canvas pixels to aim for.
 *
 * The board is repainted a pixel at a time, so this number is the cost of a repaint
 * and not a question of sharpness. A phone at three device pixels to the CSS pixel
 * would ask for four times this and spend it on a picture nobody can resolve.
 */
export const PIXEL_BUDGET = 1400000;

/** The panel's share of the short axis, and the range that share may not leave. */
const PANEL_SHARE = 0.26;
const PANEL_MIN = 168;
const PANEL_MAX_SHARE = 0.42;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/**
 * The canvas size and the two rectangles on it.
 *
 * @param {number} vw - viewport width in CSS pixels
 * @param {number} vh - viewport height in CSS pixels
 * @param {number} dpr - device pixels per CSS pixel
 * @returns {{width, height, portrait, board: {x,y,width,height},
 *            panel: {x,y,width,height}}}
 */
export function layoutFor(vw, vh, dpr = 1, budget = PIXEL_BUDGET) {
  if (!(vw > 0) || !(vh > 0)) throw new Error('layoutFor needs a positive viewport'); // boundary

  // Aim at the screen's own pixels, then come down to the budget if that is more
  // than the repaint can afford. Asking for fewer than the screen has is what makes
  // the panel's halftone render break up: the browser has to scale the canvas up,
  // and an upscale sharpens exactly the dither that a downscale averages away.
  // Past two device pixels to the CSS pixel there is nothing left to resolve.
  const scale = Math.min(2, Math.max(1, dpr));
  const want = vw * scale;
  const tall = vh * scale;
  const fit = Math.min(1, Math.sqrt(budget / (want * tall)));
  const width = Math.max(240, Math.round(want * fit));
  const height = Math.max(240, Math.round(tall * fit));
  const portrait = vh > vw;

  if (portrait) {
    const panelHeight = Math.round(
      clamp(height * PANEL_SHARE, Math.min(PANEL_MIN, height * PANEL_MAX_SHARE),
            height * PANEL_MAX_SHARE));
    return {
      width, height, portrait,
      board: { x: 0, y: 0, width, height: height - panelHeight },
      panel: { x: 0, y: height - panelHeight, width, height: panelHeight },
    };
  }

  const panelWidth = Math.round(
    clamp(width * PANEL_SHARE, Math.min(PANEL_MIN, width * PANEL_MAX_SHARE),
          width * PANEL_MAX_SHARE));
  return {
    width, height, portrait,
    board: { x: 0, y: 0, width: width - panelWidth, height },
    panel: { x: width - panelWidth, y: 0, width: panelWidth, height },
  };
}
