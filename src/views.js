// The board's vocabulary: vehicles, each traced from a handful of camera angles.
//
// A view is one model seen from one angle -- outline strokes to draw, a silhouette to
// fill and to test clicks against, and a solid render of the same angle for the panel
// to ask with. All of it comes out of tools/model_views; nothing here draws or
// measures anything, it only fetches.
//
// Coordinates run 0..1 across the camera's frame with y down, which is what a canvas
// wants, so a view is placed by choosing a centre and a size and needs no measuring
// pass of its own.

/** Where the views live, relative to the page. */
const ROOT = 'assets/views';

const key = (model, angle) => `${model}/${String(angle).padStart(3, '0')}`;

/**
 * Load every view of every model.
 *
 * All of them, up front. The whole fleet is a couple of megabytes and a board deals
 * from any of it at any moment, so paying once at the start beats a fetch in the
 * middle of a round.
 *
 * @returns {{models: Array, view: Function, promptFor: Function}}
 */
export async function loadViews(root = ROOT) {
  const manifest = await (await fetch(`${root}/manifest.json`)).json();

  const views = new Map();
  await Promise.all(manifest.models.flatMap((model) =>
    model.angles.map(async (angle) => {
      const at = key(model.name, angle);
      views.set(at, await (await fetch(`${root}/${at}.json`)).json());
    })));

  return {
    models: manifest.models,

    /** The strokes and silhouette of one view. */
    view(model, angle) {
      const found = views.get(key(model, angle));
      if (!found) throw new Error(`no view ${model} at ${angle}`); // boundary
      return found;
    },

    /** The path to the solid render of one view, for the panel to show. */
    promptFor(model, angle) {
      return `${root}/${key(model, angle)}.png`;
    },

    /** The angles a model was traced from. */
    anglesOf(model) {
      const found = manifest.models.find((m) => m.name === model);
      if (!found) throw new Error(`no model ${model}`); // boundary
      return found.angles;
    },
  };
}

/**
 * The circle that stands in for a view while a board is being laid out, and the box
 * its ink fills. Both in the view's own 0..1 frame.
 *
 * The circle is centred on the ink and no wider than the box's SHORT edge, so it falls
 * well short of the vehicle along its long way. That shortfall is the point rather
 * than a fault in it: two cars whose circles have just stopped touching are already
 * well inside one another, which is the board this game wants. A proxy that covered
 * the whole car would space them out politely.
 */
export function proxyOf(view) {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const stroke of view.strokes) {
    for (const [x, y] of stroke) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    halfW: (maxX - minX) / 2,
    halfH: (maxY - minY) / 2,
    r: Math.min(maxX - minX, maxY - minY) / 2,
  };
}
