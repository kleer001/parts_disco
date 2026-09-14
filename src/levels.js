// The difficulty path. Data, not logic: every stage is the same game with a few
// numbers changed, and the numbers are the whole of the design.
//
// What can be made harder, each in its own way:
//
//   tier   WHICH members are on the board. LOUD carries its own silhouette; PLAIN is
//          nearer its neighbours. (TWINS -- four bodies of one shell -- are retired from
//          the path: they can only be told apart by inner detail, which the silhouette
//          half below takes away, so they have no fair place here.)
//   cars   HOW MANY there are. More to look at, and more burying each other.
//   size   HOW BIG each one is. Smaller is harder twice over -- less of the detail that
//          tells two shells apart, and more of them fitting on the field.
//   inks   HOW MANY COLOURS the board is painted in. Above five, every two touching
//          regions get a different one and the board reads as separate objects. Below
//          that they start sharing, and a shape begins to merge into what it lies on.
//   render FULL keeps every inner line; SILHOUETTE keeps only the outline, so a shape
//          has to be known by its edge alone. The back half of the path is the front
//          half in silhouette: the same sets, learnt in detail, then seen in the dark.
//
// Four stages to a level, and a level is one idea about what is hard. Within a level
// the numbers tighten; between levels the idea changes.

/** How many stages make a level. */
export const STAGES = 4;

/**
 * The fleet in three tiers, by how much a vehicle looks like anything else.
 *
 * This is the ordering the whole path hangs off. LOUD carries its own silhouette --
 * nothing else on the board has wheels that size or a ladder on the roof. TWINS is
 * four bodies that are the same shell with different trim, and from the front they
 * differ by a roof sign and nothing else. Every group the game deals is built to this
 * same shape -- four loud, four plain, four twins -- so the path reads in tiers and the
 * board's group supplies the names. These are the fleet's, and the default when a stage
 * is read without a group (the endless belt, the panel's range).
 */
export const TIERS = {
  loud: ['tractor', 'firetruck', 'race', 'delivery'],
  plain: ['van', 'truck', 'suv', 'hatchback-sports'],
  twins: ['sedan', 'sedan-sports', 'taxi', 'police'],
};

/**
 * The path, in order. Sixteen stages: four levels of four.
 *
 * A stage names the tiers it draws from, not the models: which tiers is the difficulty,
 * and the board's group fills them in with its own loud / plain. A stage may also ask to
 * be drawn in silhouette, which is what carries the back half.
 *
 * Level 1 -- loud, in full detail: four kinds that look nothing like each other.
 * Level 2 -- loud and plain, still in detail: eight kinds, the work becomes searching.
 * Level 3 -- the loud set again, now as bare silhouettes; the colours begin to run out.
 * Level 4 -- loud and plain in silhouette, small, the palette collapsing toward one ink.
 */
export const PATH = [
  { cars: 10, size: 0.44, inks: 6, tiers: ['loud'] },
  { cars: 14, size: 0.42, inks: 6, tiers: ['loud'] },
  { cars: 18, size: 0.40, inks: 6, tiers: ['loud'] },
  { cars: 24, size: 0.38, inks: 6, tiers: ['loud'] },

  { cars: 28, size: 0.36, inks: 6, tiers: ['loud', 'plain'] },
  { cars: 34, size: 0.34, inks: 6, tiers: ['loud', 'plain'] },
  { cars: 40, size: 0.32, inks: 5, tiers: ['loud', 'plain'] },
  { cars: 46, size: 0.31, inks: 5, tiers: ['loud', 'plain'] },

  { cars: 52, size: 0.30, inks: 5, tiers: ['loud'], render: 'silhouette' },
  { cars: 60, size: 0.29, inks: 4, tiers: ['loud'], render: 'silhouette' },
  { cars: 68, size: 0.28, inks: 4, tiers: ['loud'], render: 'silhouette' },
  { cars: 76, size: 0.26, inks: 4, tiers: ['loud'], render: 'silhouette' },

  { cars: 84, size: 0.24, inks: 3, tiers: ['loud', 'plain'], render: 'silhouette' },
  { cars: 96, size: 0.22, inks: 3, tiers: ['loud', 'plain'], render: 'silhouette' },
  { cars: 108, size: 0.20, inks: 2, tiers: ['loud', 'plain'], render: 'silhouette' },
  { cars: 120, size: 0.19, inks: 1, tiers: ['loud', 'plain'], render: 'silhouette' },
];

/** The models a tier selection names, in the fleet -- the default when no group is given. */
export const fleetOf = (names) => names.flatMap((t) => TIERS[t]);

/** The span each dial covers over the whole path, for the panel to show against. */
export const RANGE = {
  cars: [Math.min(...PATH.map((s) => s.cars)), Math.max(...PATH.map((s) => s.cars))],
  size: [Math.min(...PATH.map((s) => s.size)), Math.max(...PATH.map((s) => s.size))],
  inks: [Math.min(...PATH.map((s) => s.inks)), Math.max(...PATH.map((s) => s.inks))],
  kinds: [Math.min(...PATH.map((s) => fleetOf(s.tiers).length)),
          Math.max(...PATH.map((s) => fleetOf(s.tiers).length))],
};

/**
 * The stage at this depth, with where it sits in the path.
 *
 * The path holds at its last stage rather than running out, so a player who gets to
 * the end keeps playing the hardest board rather than falling off it.
 */
export function stageAt(depth) {
  const index = Math.min(depth, PATH.length - 1);
  return {
    ...PATH[index],
    // The fleet's members for this stage's tiers, so a stage read without a group still
    // names models. The campaign overrides this with the board's own group; the endless
    // belt takes it as is.
    fleet: fleetOf(PATH[index].tiers),
    index,
    // Where this stage sits on the whole path, 0..1. Anything that ramps with
    // difficulty reads this rather than working it out from the index and a length.
    along: PATH.length > 1 ? index / (PATH.length - 1) : 1,
    level: Math.floor(index / STAGES) + 1,
    stage: (index % STAGES) + 1,
    last: index === PATH.length - 1,
  };
}
