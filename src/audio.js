// The board's voice: what a click sounds like.
//
// Four events make a sound -- a click on nothing, a click on a car already found, a
// click on the wrong vehicle, and a find. Three of them are one oscillator and one
// gain, so a voice is a row in a table and retuning one costs an edit rather than a
// recording. The find is a chord and has its own shape below. The win is the one
// recorded sample: it is the only moment worth a download, and a chord of that kind
// is not something three oscillators do convincingly.
//
// This is a boundary, the way `layers.js` is the boundary onto the canvas. Nothing
// upstream of `main.js` knows a sound exists, and nothing here reads the round.

/** Where the win lives, relative to the page -- the same rule the views follow. */
const CHIME = 'assets/sfx/win-chime.mp3';

/**
 * A voice per outcome of `round.choose` that answers with a single tone.
 *
 * `from` bends to `to` across the sound, which is what gives one a direction: the
 * refusal falls. The find is not here -- it is a chord, and a chord is a different
 * kind of thing from a bend.
 */
export const VOICES = {
  ground: { wave: 'sine',   from: 210, to: 165, ms: 70,  gain: 0.030 },
  again:  { wave: 'sine',   from: 330, to: 330, ms: 45,  gain: 0.022 },
  wrong:  { wave: 'square', from: 190, to: 135, ms: 175, gain: 0.070 },
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
  gain: 0.055,
  /** A sine started at full volume clicks. This is the ramp that stops it. */
  attackMs: 8,
};

/** How long the board holds its breath between the find and the win, in ms. */
export const WIN_PAUSE = 250;

/** How loud the win sits over the rest. */
const WIN_GAIN = 0.35;

/** Below this a partial is inaudible, and an oscillator for it is one nobody hears. */
const FLOOR = 1e-4;

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
export function createVoice() {
  const ac = new AudioContext();
  let chime = null;

  // Suspended is where a context starts and where a backgrounded tab puts it back,
  // so it is asked every time rather than once.
  const resume = () => {
    if (ac.state === 'suspended') ac.resume();
  };

  /** One sine, held at a pitch, faded in and rung out. */
  const partial = (hz, peak, at, secs) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hz, at);
    gain.gain.setValueAtTime(FLOOR, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + FIND.attackMs / 1000);
    gain.gain.exponentialRampToValueAtTime(FLOOR, at + secs);
    osc.connect(gain).connect(ac.destination);
    osc.start(at);
    osc.stop(at + secs);
  };

  return {
    /** Fetch and decode the win. Awaited by `start()`, before the first frame. */
    async load() {
      const res = await fetch(CHIME);
      if (!res.ok) {
        throw new Error(`cannot load ${CHIME} (${res.status}) -- serve with ./run.sh`);
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
      const at = ac.currentTime;
      const secs = voice.ms / 1000;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = voice.wave;
      osc.frequency.setValueAtTime(voice.from, at);
      osc.frequency.exponentialRampToValueAtTime(voice.to, at + secs);
      gain.gain.setValueAtTime(voice.gain, at);
      gain.gain.exponentialRampToValueAtTime(FLOOR, at + secs);
      osc.connect(gain).connect(ac.destination);
      osc.start(at);
      osc.stop(at + secs);
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
      const secs = FIND.ms / 1000;
      // Where the bottom partial stands, in octaves above the window's floor. It
      // wraps, which is the point: rank 7 is rank 1 and still reads as higher than 6.
      const rung = ((rank - 1) * FIND.step) % 1;
      for (let k = 0; k < FIND.partials; k++) {
        const x = rung + k;
        const peak = FIND.gain * gainAt(x);
        if (peak < FLOOR) continue;
        partial(FIND.bottom * 2 ** x, peak, at, secs);
      }
      if (last) {
        const source = ac.createBufferSource();
        const gain = ac.createGain();
        source.buffer = chime;
        gain.gain.value = WIN_GAIN;
        source.connect(gain).connect(ac.destination);
        // Nothing keeps a handle on it, so it rings on over the wipe and into the
        // level that follows -- which is the point of it.
        source.start(at + secs + WIN_PAUSE / 1000);
      }
    },
  };
}
