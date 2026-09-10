// The board's voice: what a click sounds like.
//
// Four events make a sound -- a click on nothing, a click on a car already found, a
// click on the wrong vehicle, and a find. Three of them are one oscillator and one
// gain, so a voice is a row in a table and retuning one costs an edit rather than a
// recording. The find is a chord and has its own shape below. The win is the one
// recorded sample: it is the only moment worth a download, and a chord of that kind
// is not something three oscillators do convincingly.
//
// Everything runs through a small desk: a music bus and an effects bus into a master.
// It is here because a loop under the board buries the very sounds the board is
// answering with -- the find blips sit between 220 and 1760Hz and a disco track has
// most of its energy under that. So the music ducks out of the way of every effect and
// rides back, which is what lets it be loud enough to hear at all.
//
// This is a boundary, the way `layers.js` is the boundary onto the canvas. Nothing
// upstream of `main.js` knows a sound exists, and nothing here reads the round.

/**
 * Where the win lives, relative to the page -- the same rule the views follow, and
 * overridable the same way, because a bench sitting a directory or two down resolves
 * it against itself.
 */
export const CHIME = 'assets/sfx/win-chime.mp3';

/**
 * A voice per outcome of `round.choose` that answers with a single tone.
 *
 * `from` bends to `to` across the sound, which is what gives one a direction: the
 * refusal falls. The find is not here -- it is a chord, and a chord is a different
 * kind of thing from a bend.
 */
export const VOICES = {
  ground: { wave: 'sine',   from: 210, to: 165, ms: 70,  gain: 0.1433, duck: 0.35 },
  again:  { wave: 'sine',   from: 330, to: 330, ms: 45,  gain: 0.1110, duck: 0.25 },
  wrong:  { wave: 'square', from: 190, to: 135, ms: 175, gain: 0.1700, duck: 1 },
};

/**
 * How loud each sound is meant to be against a find, in decibels.
 *
 * A gain is not a loudness. A square at 0.07 and a sine at 0.07 are nowhere near each
 * other, and a recorded chime is a third thing again -- measured, the refusal came out
 * 3.8dB *above* the find it was supposed to sit under, and the win 10.3dB above.
 * Picking five gains by ear picks five unrelated numbers.
 *
 * So the ordering is declared here and the gains are solved to hit it. The find is the
 * reference because it is the sound the player is hunting for; everything else is
 * placed against it:
 *
 *   win    the round is over, and it should feel bigger -- but not twice as loud
 *   wrong  under the find on purpose. The wash and the meter already say it, and a
 *          buzzer that shouts twenty times a stage is what makes people mute a game
 *   ground a click on nothing, barely worth a sound
 *   again  the least informative click there is
 *
 * Loudness is the loudest 50ms, K-weighted per ITU-R BS.1770 -- the weighting is what
 * makes a 135Hz square and an 880Hz sine comparable, and 50ms is short enough that the
 * 45ms blip fills the window. The balance panel in `research/disco-loops/mixer.html`
 * measures the shipped voices against this table, and is the thing to re-run when one
 * of them moves.
 */
export const BALANCE = {
  /**
   * Where the whole set sits, in LUFS, measured through the effects fader at unity.
   *
   * Without this the table only says how the voices stand against each other, which
   * is half a mix. Balanced but unanchored, the find measured 15.9dB under an open
   * loop and 6.8dB under a ducked one -- every sound correctly placed, and the lot of
   * them buried. The anchor is what says how loud "the board" is before a fader
   * touches it, and it is chosen to clear a ducked bed by a few decibels.
   */
  findLufs: -20.5,

  /** And where each voice stands against a find, in decibels. */
  find: 0, win: 4, wrong: -2, ground: -9, again: -13,
};

/**
 * The find, which climbs and never runs out of ladder.
 *
 * A scale cannot rise forever, so this is a Shepard tone: three sine partials an
 * octave apart, moving up together, under a loudness window that is fixed in pitch
 * rather than carried with them. A partial climbing towards the top of the window
 * fades out as it goes; one entering at the bottom fades in. After `1 / step` finds
 * the three partials stand exactly where they started and the spectrum is the one it
 * began with -- so the seventh find is the first find, and still sounds higher than
 * the sixth. That is the whole illusion, and it is why the escalation no longer needs
 * a cap.
 *
 * The partials hold their pitch for the length of a blip. The rise lives between one
 * find and the next, not inside either, so nothing has to slide.
 */
export const FIND = {
  /** Hz. The bottom of the window, where a partial is silent on its way in. */
  bottom: 220,
  /** Partials, each an octave above the last. Three spans the window. */
  partials: 3,
  /** How far up the ladder one find moves, in octaves. Six finds is one turn. */
  step: 1 / 6,
  ms: 150,
  gain: 0.2725,
  /** A sine started at full volume clicks. This is the ramp that stops it. */
  attackMs: 8,
  /** A find is the thing a player is listening for, so it takes the whole duck. */
  duck: 1,
};

/** How long the board holds its breath between the find and the win, in ms. */
export const WIN_PAUSE = 250;

/**
 * Where the faders sit, as gains rather than decibels, because every one of them ends
 * up multiplying a sample.
 */
export const MIX = { master: 1, music: 0.42, sfx: 1 };

/**
 * How far the music gets out of the way, and how quickly it comes back.
 *
 * `depth` is what a full duck takes off the music -- a voice with `duck: 0.35` takes
 * that share of it. Down fast, hold while the sound is still speaking, up slowly: a
 * duck that returns as fast as it left pumps, and one that returns too slowly leaves
 * a hole where the music was.
 */
export const DUCK = { depth: 0.65, attackMs: 25, holdMs: 90, releaseMs: 420 };

/** How loud the win sits over the rest. Solved against `BALANCE`, not chosen. */
export const WIN_GAIN = 0.7509;

/**
 * How long the loop's tail and head are mixed across, in ms.
 *
 * Measured on the four shipped loops: at the wrap each one is a sharper edge than
 * most of what is inside it -- Funky and Piano sharper than everything, so they tick
 * once a bar. Blending drops all four into the ordinary run of the track (Funky from
 * the 100th percentile to the 21st, Piano to the 66th, Disco 77th to 51st, Techno-ish
 * 63rd to 31st). Twelve milliseconds is under a hi-hat and long enough to have no
 * step left in it; past that nothing improves, because what is being smoothed is a
 * single-sample jump.
 */
export const LOOP_CROSSFADE_MS = 12;

/** Below this a partial is inaudible, and an oscillator for it is one nobody hears. */
const FLOOR = 1e-4;

/**
 * Cut the loop out of a decoded file and blend the join shut.
 *
 * A `loopStart`/`loopEnd` on the source is a hard splice: the last sample of the bar
 * is followed by the first, and wherever those two do not meet the wrap is a step
 * that no music covers. So the loop is rendered once instead, and its head is mixed
 * under an equal-power pair with what the file does *after* `endSec` -- the take
 * carrying on past the bar, which is exactly the sound the wrap interrupts. Fading
 * the head up from what comes *before* `startSec` is the version that looks right and
 * is not: at the head of a file there is nothing there, so the loop fades in from
 * silence and the tick becomes a hole.
 *
 * Blending forwards is also what keeps the loop its stated length. Shortening it by
 * the fade is the other way round and drags the pulse forward by that much on every
 * repeat, which is the drift the bar-aligned trim exists to prevent.
 *
 * @param {BaseAudioContext} ctx - what the buffer is made in
 * @param {AudioBuffer} buffer - the whole decoded file
 * @param {{startSec?: number, endSec?: number}} trim - the bar-aligned loop
 * @returns {AudioBuffer} the loop, joined, to be played whole
 */
export function buildLoop(ctx, buffer, { startSec = 0, endSec = buffer.duration } = {}) {
  const rate = buffer.sampleRate;
  const from = Math.round(startSec * rate);
  const to = Math.round(endSec * rate);
  const fade = Math.round((LOOP_CROSSFADE_MS / 1000) * rate);
  if (to + fade > buffer.length) {
    // A boundary: the trim is data, and one cut this close to the end of the file has
    // nothing left to blend with. Silently skipping the fade would ship the tick.
    throw new Error(`loop ends ${((buffer.length - to) / rate * 1000).toFixed(0)}ms `
      + `before the file does, and the join needs ${LOOP_CROSSFADE_MS}ms`);
  }
  const out = ctx.createBuffer(buffer.numberOfChannels, to - from, rate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    dst.set(src.subarray(from, to));
    for (let i = 0; i < fade; i++) {
      // Equal power, so the level holds across the join instead of dipping through it.
      const t = ((i / fade) * Math.PI) / 2;
      dst[i] = dst[i] * Math.sin(t) + src[to + i] * Math.cos(t);
    }
  }
  return out;
}

/**
 * One bent tone, built into whatever context and wired to whatever it should reach.
 *
 * Taken out of the player so the same construction can be rendered offline and
 * measured. A loudness read off a second copy of this arithmetic measures the copy.
 */
export function buildTone(ctx, dest, voice, at) {
  const secs = voice.ms / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = voice.wave;
  osc.frequency.setValueAtTime(voice.from, at);
  osc.frequency.exponentialRampToValueAtTime(voice.to, at + secs);
  gain.gain.setValueAtTime(voice.gain, at);
  gain.gain.exponentialRampToValueAtTime(FLOOR, at + secs);
  osc.connect(gain).connect(dest);
  osc.start(at);
  osc.stop(at + secs);
  return secs;
}

/**
 * One rung of the endless ladder: the partials that are audible at this rank.
 *
 * @returns {number} how long it lasts, in seconds.
 */
export function buildFind(ctx, dest, rank, at) {
  const secs = FIND.ms / 1000;
  const rung = ((rank - 1) * FIND.step) % 1;
  for (let k = 0; k < FIND.partials; k++) {
    const x = rung + k;
    const peak = FIND.gain * gainAt(x);
    if (peak < FLOOR) continue;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(FIND.bottom * 2 ** x, at);
    gain.gain.setValueAtTime(FLOOR, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + FIND.attackMs / 1000);
    gain.gain.exponentialRampToValueAtTime(FLOOR, at + secs);
    osc.connect(gain).connect(dest);
    osc.start(at);
    osc.stop(at + secs);
  }
  return secs;
}

/**
 * How loud a partial `x` octaves above the bottom of the window is.
 *
 * A raised cosine across the whole window: silent at both ends, loudest in the
 * middle. Zero at the ends is what makes the wrap seamless -- the partial leaving the
 * top and the one arriving at the bottom are both already silent when they swap.
 */
export function gainAt(x, partials = FIND.partials) {
  return 0.5 * (1 - Math.cos((2 * Math.PI * x) / partials));
}

/**
 * Open the audio device and hold the sounds.
 *
 * The context is built before any gesture, which browsers allow: it starts suspended
 * and decoding into it works anyway. That is what lets the chime be fetched and
 * decoded up front with the fleet, so no win can ever arrive ahead of its sound.
 * The first click resumes it.
 */
export function createVoice(chimeUrl = CHIME) {
  const ac = new AudioContext();
  let chime = null;

  // The desk. Effects and music each have a fader, and between the music fader and
  // the master sits the thing every effect leans on to make room for itself.
  const master = ac.createGain();
  const sfx = ac.createGain();
  const music = ac.createGain();
  const duck = ac.createGain();
  master.gain.value = MIX.master;
  sfx.gain.value = MIX.sfx;
  music.gain.value = MIX.music;
  duck.gain.value = 1;
  sfx.connect(master);
  music.connect(duck).connect(master);
  master.connect(ac.destination);

  let loop = null;      // the music source, while one is playing
  const mix = { ...MIX };
  const dip = { ...DUCK };

  // Suspended is where a context starts and where a backgrounded tab puts it back,
  // so it is asked every time rather than once.
  const resume = () => {
    if (ac.state === 'suspended') ac.resume();
  };

  /**
   * Take the music down and walk it back up.
   *
   * Read off wherever the gain actually is rather than from a remembered value: two
   * finds in quick succession would otherwise have the second one ramp up from a
   * level the first had already left, and the music would surge between them.
   *
   * @param {number} share - how much of a full duck this sound is worth, 0..1
   */
  const makeRoom = (share) => {
    if (share <= 0 || dip.depth <= 0) return;
    const at = ac.currentTime;
    const floor = Math.max(0.0001, 1 - dip.depth * share);
    const down = at + dip.attackMs / 1000;
    duck.gain.cancelScheduledValues(at);
    duck.gain.setValueAtTime(duck.gain.value, at);
    duck.gain.linearRampToValueAtTime(floor, down);
    duck.gain.setValueAtTime(floor, down + dip.holdMs / 1000);
    duck.gain.linearRampToValueAtTime(1, down + (dip.holdMs + dip.releaseMs) / 1000);
  };

  return {
    /** Fetch and decode the win. Awaited by `start()`, before the first frame. */
    async load() {
      const res = await fetch(chimeUrl);
      if (!res.ok) {
        throw new Error(`cannot load ${chimeUrl} (${res.status}) -- serve with ./run.sh`);
      }
      chime = await ac.decodeAudioData(await res.arrayBuffer());
    },

    /**
     * Say one outcome that answers with a single tone.
     * @param {string} name - a key of VOICES
     */
    play(name) {
      resume();
      const voice = VOICES[name];
      buildTone(ac, sfx, voice, ac.currentTime);
      makeRoom(voice.duck);
    },

    /**
     * Put a loop under the board, or take it off.
     *
     * The trim is the loop's, not the file's: a candidate is rarely cut to a whole
     * bar, and coming round a few tens of milliseconds early drags the pulse forward
     * on every repeat. Passing the bar-aligned points is what stops that. The loop is
     * cut out and its join blended by `buildLoop`, so the whole buffer is the loop and
     * the source needs no loop points of its own.
     *
     * `gain` is the loop's own, not the fader's: published loops vary by more than ten
     * decibels, so without one the music fader means a different thing per track --
     * one leaves the board shouting over it and the next buries the board. It is
     * measured per track and travels with it.
     *
     * @param {string|null} url - the loop, or null to stop
     * @param {{startSec?: number, endSec?: number, gain?: number}} [trim]
     */
    async setMusic(url, trim = {}) {
      if (loop) {
        try { loop.stop(); } catch { /* already ended */ }
        loop = null;
      }
      if (!url) return;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`cannot load ${url} (${res.status})`);
      const buffer = buildLoop(ac, await ac.decodeAudioData(await res.arrayBuffer()), trim);
      resume();
      loop = ac.createBufferSource();
      loop.buffer = buffer;
      loop.loop = true;
      const trackGain = ac.createGain();
      trackGain.gain.value = trim.gain ?? 1;
      loop.connect(trackGain).connect(music);
      loop.start();
      return buffer;
    },

    /**
     * Move the faders, or the duck. Only what is named changes.
     * @returns {{mix: object, duck: object}} where everything now sits
     */
    levels(next = {}) {
      for (const [k, v] of Object.entries(next.mix ?? {})) {
        if (!(k in mix)) throw new Error(`no fader "${k}"`); // boundary
        mix[k] = v;
      }
      for (const [k, v] of Object.entries(next.duck ?? {})) {
        if (!(k in dip)) throw new Error(`no duck knob "${k}"`); // boundary
        dip[k] = v;
      }
      const at = ac.currentTime;
      // Ramped rather than set: a fader that jumps clicks, and these are moved live.
      for (const [node, value] of [[master, mix.master], [sfx, mix.sfx], [music, mix.music]]) {
        node.gain.cancelScheduledValues(at);
        node.gain.setValueAtTime(node.gain.value, at);
        node.gain.linearRampToValueAtTime(value, at + 0.02);
      }
      return { mix: { ...mix }, duck: { ...dip } };
    },

    /** What the duck is doing right now, 1 when the music is unpressed. */
    duckedTo() {
      return duck.gain.value;
    },

    /**
     * A find: one rung up the endless ladder, and the win behind it if this was the
     * last one.
     *
     * The find that wins still sounds. It is the blip that earned the win, and the
     * chime is what the win says back -- so the two are laid end to end with a beat
     * of silence between them rather than played over each other. The gap is booked
     * on the audio clock and not on the frame loop, so a stalled frame cannot smear
     * it.
     *
     * @param {number} rank - which find of the round this is, from 1
     * @param {boolean} last - whether it ended the round
     */
    find(rank, last) {
      resume();
      const at = ac.currentTime;
      makeRoom(FIND.duck);
      const secs = buildFind(ac, sfx, rank, at);
      if (last) {
        const source = ac.createBufferSource();
        const gain = ac.createGain();
        source.buffer = chime;
        gain.gain.value = WIN_GAIN;
        source.connect(gain).connect(sfx);
        // Nothing keeps a handle on it, so it rings on over the wipe and into the
        // level that follows -- which is the point of it.
        source.start(at + secs + WIN_PAUSE / 1000);
      }
    },
  };
}
