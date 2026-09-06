// Polygon math. Pure: no canvas, no DOM, no clock.
//
// A part is one closed polygon of points in its own unit space, placed on the board
// by a scale and an offset. Keeping placement a transform rather than baked-in
// coordinates means the same outline can appear twice on a board at two sizes, and
// the drift code only ever moves an offset.

/**
 * Move and scale a unit polygon onto the board.
 * @param {Array<[number, number]>} points
 * @param {{x: number, y: number, scale: number}} placement
 * @returns {Array<[number, number]>}
 */
export function place(points, placement) {
  const { x, y, scale } = placement;
  return points.map(([px, py]) => [x + px * scale, y + py * scale]);
}

/**
 * Is the point inside the polygon? Crossing-number test.
 * @param {[number, number]} point
 * @param {Array<[number, number]>} polygon
 * @returns {boolean}
 */
export function contains([px, py], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    // Count only edges that straddle the ray's row, so a vertex exactly on the ray
    // is counted once rather than twice.
    const straddles = yi > py !== yj > py;
    if (straddles && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Axis-aligned bounds of a polygon, as {minX, minY, maxX, maxY}.
 * @param {Array<[number, number]>} polygon
 */
export function bounds(polygon) {
  const xs = polygon.map(([x]) => x);
  const ys = polygon.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}
