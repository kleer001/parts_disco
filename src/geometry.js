// Polygon math. Pure: no canvas, no DOM, no clock.
//
// A word's hit area is the box its glyphs occupy, given as a closed polygon so the
// same containment test would serve a shape that is not a rectangle.

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
