// The board's voice: what a click sounds like.
//
// Four events make a sound -- a click on nothing, a click on the wrong vehicle, a
// find, and the win. Three of them are made on the spot from one oscillator and one
// gain, so a voice is a row in a table and retuning one costs an edit rather than a
// recording. The win is the one recorded sample: it is the only moment worth a
// download, and a chord is not something two oscillators do convincingly.
//
// This is a boundary, the way `layers.js` is the boundary onto the canvas. Nothing
// upstream of `main.js` knows a sound exists, and nothing here reads the round.

import { TUNING } from './juice.js';

/** Where the win lives, relative to the page -- the same rule the views follow. */
const CHIME = 'assets/sfx/win-chime.mp3';

/**
 * A voice per outcome of `round.choose`, keyed by the name it answers to.
 *
 * `from` bends to `to` across the sound, which is what makes two of them read as a
 * direction: the refusal falls and the find climbs. `step` is how much higher each
 * later find in a round sits than the one before -- the same escalation the pulse
 * has, so the ear and the eye are counting the same thing.
 */
export const VOICES = {
  ground: { wave: 'sine',     from: 210, to: 165, ms: 70,  gain: 0.030 },
  again:  { wave: 'sine',     from: 330, to: 330, ms: 45,  gain: 0.022 },
  wrong:  { wave: 'square',   from: 190, to: 135, ms: 175, gain: 0.070 },
  found:  { wave: 'triangle', from: 520, to: 720, ms: 115, gain: 0.055, step: 1.09 },
};

/** How loud the win sits over the beeps. */
const WIN_GAIN = 0.35;

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
     * Say one outcome.
     * @param {string} name - a key of VOICES
     * @param {number} [rank] - which find of the round this is, for the climb
     */
    play(name, rank = 1) {
      resume();
      const voice = VOICES[name];
      const at = ac.currentTime;
      const secs = voice.ms / 1000;
      // The climb runs out where the pulse's does. One number says how far an
      // escalation goes in this game, and it is not this file's to choose.
      const climb = (voice.step ?? 1) ** Math.min(rank - 1, TUNING.rampCap - 1);
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = voice.wave;
      osc.frequency.setValueAtTime(voice.from * climb, at);
      osc.frequency.exponentialRampToValueAtTime(voice.to * climb, at + secs);
      gain.gain.setValueAtTime(voice.gain, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + secs);
      osc.connect(gain).connect(ac.destination);
      osc.start(at);
      osc.stop(at + secs);
    },

    /**
     * The win. Nothing keeps a handle on it, so it rings on over the wipe and into
     * the level that follows -- which is the point of it.
     */
    win() {
      resume();
      const source = ac.createBufferSource();
      const gain = ac.createGain();
      source.buffer = chime;
      gain.gain.value = WIN_GAIN;
      source.connect(gain).connect(ac.destination);
      source.start();
    },
  };
}
