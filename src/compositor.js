// Compositor — ordered draw passes over one canvas.
//
// The house stance: LAYERING is endorsed, not merely allowed. The character grid
// is *a* layer, not the whole frame. Stack more on top (sprites, HUD, a scanline /
// CRT overlay) or slip them underneath — each layer is a small module honoring one
// contract, added to the compositor without editing the loop (open/closed).
//
// Layer contract:
//   { name: string, draw(ctx, frame): void, enabled?: boolean }
//
// draw() receives the 2D context (the boundary) and a plain `frame` data object
// (dims, seed, tick — whatever the game threads through). Layers stay pure with
// respect to game logic: they only touch the canvas they're handed, and read the
// frame data passed in. The compositor wraps each layer in save()/restore() so one
// layer's canvas state can't bleed into the next.

/**
 * Create an ordered layer compositor.
 * @param {Array<{name: string, draw: Function, enabled?: boolean}>} [layers]
 * @returns {{add: Function, layers: Function, render: Function}}
 */
export function createCompositor(layers = []) {
  const stack = [];
  const api = {
    /** Append a layer. Chainable. */
    add(layer) {
      assertLayer(layer);
      stack.push(layer);
      return api;
    },
    /** Snapshot of the current layer stack (in draw order). */
    layers() {
      return stack.slice();
    },
    /** Draw every enabled layer, in order, each inside its own save/restore. */
    render(ctx, frame = {}) {
      if (!ctx || typeof ctx.save !== 'function' || typeof ctx.restore !== 'function') {
        throw new Error('compositor.render() requires a 2D canvas context'); // boundary
      }
      for (const layer of activeLayers(stack)) {
        ctx.save();
        layer.draw(ctx, frame);
        ctx.restore();
      }
    },
  };
  layers.forEach(api.add);
  return api;
}

/**
 * The layers that will actually draw, in order — enabled ones only. Pure, so the
 * ordering/visibility rule is testable without a canvas.
 * @param {Array<{enabled?: boolean}>} layers
 * @returns {Array} the drawable subset, order preserved.
 */
export function activeLayers(layers) {
  return layers.filter((layer) => layer.enabled !== false);
}

function assertLayer(layer) {
  if (!layer || typeof layer.name !== 'string' || typeof layer.draw !== 'function') {
    throw new Error('a layer must be { name: string, draw(ctx, frame) }'); // boundary
  }
}
