// The run's damage: how much of the board's patience a player has spent, and when it
// runs out.
//
// Pure, and it knows nothing about a round. A wrong vehicle is the only thing that
// costs, and what it costs depends on where the run is standing on the path -- a
// tractor misread among ten loud cars is a worse mistake than a taxi misread among a
// hundred and twenty near-twins, so the two are not charged the same.

/** How much damage a life can take before the board is taken away, in units. */
export const CAPACITY = 10;

/** What one wrong vehicle costs at the first stage of the path, and at the last. */
export const COST_FIRST = 1;
export const COST_LAST = 0.25;

/**
 * What a wrong vehicle costs at this point on the path. `along` runs 0..1 and comes
 * from `stageAt`, so nothing here has to know how long the path is.
 *
 * Geometric rather than linear, for the reason the grid's cell is: a cost is read as
 * a ratio against the last one, so an even ratio per stage is what reads as an even
 * softening. Stepping down in equal units would spend most of the path barely
 * changing and then collapse over the last few stages.
 */
export function costAt(along) {
  return COST_FIRST * (COST_LAST / COST_FIRST) ** along;
}

/**
 * A life's worth of damage.
 *
 * It carries across stages and is never given back by playing well -- clearing a
 * board buys progress, not patience. Dying is the only thing that empties it, and
 * what dying costs is the board you were partway through.
 */
export function createMeter(capacity = CAPACITY) {
  const meter = {
    capacity,
    /** Damage taken, in units. Runs past the capacity by at most one hit. */
    filled: 0,
    /** When the last hit landed, in seconds. Null until one has. */
    hitAt: null,

    /**
     * Charge for one wrong vehicle.
     * @param {number} along - where the stage sits on the path, 0..1
     * @param {number} now - game seconds, for the needle's kick
     */
    take(along, now) {
      meter.filled += costAt(along);
      meter.hitAt = now;
    },

    /** How full the meter reads, 0..1. */
    level() {
      return Math.min(1, meter.filled / meter.capacity);
    },

    /** The run is over and the board is owed a retry. */
    full() {
      return meter.filled >= meter.capacity;
    },

    /** A death, which is the only thing that empties it. */
    clear() {
      meter.filled = 0;
      meter.hitAt = null;
    },
  };
  return meter;
}
