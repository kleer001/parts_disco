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
 * Load every group's fleet, and the index that says which tiers each one holds.
 *
 * Each group is its own root under `assets/views`, loaded the same way the fleet is. A
 * board deals from one group, but the compositor draws every board through one `view`:
 * a slot carries its group, so the lookup reaches into the right fleet. The tiers come
 * off the index so the difficulty path -- which names tiers, not models -- can be filled
 * in by whichever group a board is dealing.
 *
 * `base` prefixes the index and every group root, for a page served from a subdirectory
 * (the dev benches). The game is at the site root and leaves it empty.
 *
 * @returns {{groups, ids, tiers, fleet, view, promptFor, anglesOf}}
 */
export async function loadAtlas(indexPath = 'assets/views/groups.json', base = '') {
  const index = await (await fetch(base + indexPath)).json();
  const fleets = {};
  await Promise.all(index.groups.map(async (g) => {
    fleets[g.id] = await loadViews(base + g.root);
  }));
  const fleetOf = (id) => {
    const found = fleets[id];
    if (!found) throw new Error(`no group ${id}`); // boundary
    return found;
  };
  const groupOf = (id) => {
    const found = index.groups.find((g) => g.id === id);
    if (!found) throw new Error(`no group ${id}`); // boundary
    return found;
  };
  return {
    groups: index.groups,
    ids: index.groups.map((g) => g.id),
    tiers: (id) => groupOf(id).tiers,
    fleet: fleetOf,
    view: (slot) => fleetOf(slot.group).view(slot.model, slot.angle),
    promptFor: (id, model, angle) => fleetOf(id).promptFor(model, angle),
    anglesOf: (id, model) => fleetOf(id).anglesOf(model),
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

/**
 * A board's two lookups, memoised: a slot's view, and the circle that stands in for it.
 *
 * Handed the `view(slot)` that reaches into the right group, since a board may draw from
 * any of them. Every caller that lays a board out needs both, and both are pure functions
 * of the slot's group, model and angle, so both are worth keeping. The cache key is the
 * whole shape of a slot -- which is a fact one file should state, not four: a board laid
 * against a stale hull packs to a different density without saying so.
 */
export function fleetLookups(viewOf) {
  const proxies = new Map();
  const proxyFor = (slot) => {
    const key = `${slot.group}/${slot.model}/${slot.angle}`;
    if (!proxies.has(key)) proxies.set(key, proxyOf(viewOf(slot)));
    return proxies.get(key);
  };
  return { viewOf, proxyFor };
}
