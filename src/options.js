// The options panel: the one part of the game that is HTML rather than canvas.
//
// A slider drawn on canvas is a hundred lines of hit-testing and drag state to arrive
// at something a browser already does, with keyboard and screen reader included. So
// this is DOM, laid over the board, and it is built here rather than in `index.html`
// because it only exists once something can be adjusted.
//
// It knows about the desk and nothing else: it moves faders and picks a track. What a
// fader does is `audio.js`'s business.

import { MIX } from './audio.js';
import { TRACKS, MUSIC_ROOT } from './music.js';

/**
 * The loudest each fader can go, as a gain.
 *
 * The board can be pushed past unity because a player may want it over the music; the
 * music cannot, because its level was measured against a bed and going past it would
 * undo that.
 */
const CEILING = { master: 1, sfx: 2, music: 1 };

/**
 * A fader's position, 0..100, against the gain it asks for.
 *
 * Squared, because a linear fader does not feel linear: halfway up a straight gain
 * scale is barely quieter, and everything useful is crowded into the top of the
 * travel. Squaring puts the half-way point around twelve decibels down, which is what
 * a hand expects halfway to be.
 */
const gainOf = (pos, of) => (pos / 100) ** 2 * CEILING[of];
const posOf = (gain, of) => Math.round(Math.sqrt(gain / CEILING[of]) * 100);

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * Build the panel and its opener, and wire them to the desk.
 *
 * @param {HTMLElement} mount - what to hang it on
 * @param {object} voice - the audio module, for `levels` and `setMusic`
 * @returns {{open: Function}} for anything that wants to raise it
 */
export function createOptions(mount, voice) {
  const state = { master: MIX.master, sfx: MIX.sfx, music: MIX.music, muted: false };
  let track = null;

  const opener = el('button', 'opts-open');
  opener.type = 'button';
  opener.setAttribute('aria-label', 'Options');
  opener.setAttribute('aria-expanded', 'false');
  for (let i = 0; i < 3; i++) opener.append(el('span'));

  const panel = el('div', 'opts-panel');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-label', 'Options');

  const head = el('header');
  head.append(el('h2', null, 'Options'));
  const close = el('button', 'opts-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close options');
  head.append(close);
  panel.append(head);

  const body = el('div', 'opts-body');
  panel.append(body);

  // -- what a fader does ---------------------------------------------------
  const apply = () => {
    voice.levels({
      mix: {
        master: state.muted ? 0 : state.master,
        sfx: state.sfx,
        music: state.music,
      },
    });
  };

  const fader = (label, which) => {
    const row = el('div', 'opts-row');
    const id = `opt-${which}`;
    const name = el('label', null, label);
    name.htmlFor = id;
    const input = el('input');
    input.type = 'range';
    input.id = id;
    input.min = 0;
    input.max = 100;
    input.step = 1;
    input.value = posOf(state[which], which);
    const out = el('output', null, `${input.value}`);
    input.addEventListener('input', () => {
      state[which] = gainOf(Number(input.value), which);
      out.textContent = input.value;
      apply();
    });
    row.append(name, input, out);
    return row;
  };

  body.append(el('h3', null, 'Sound'));
  body.append(fader('board', 'sfx'));
  body.append(fader('overall', 'master'));

  const muteRow = el('div', 'opts-check');
  const mute = el('input');
  mute.type = 'checkbox';
  mute.id = 'opt-mute';
  const muteLabel = el('label', null, 'mute everything');
  muteLabel.htmlFor = 'opt-mute';
  mute.addEventListener('change', () => {
    state.muted = mute.checked;
    apply();
  });
  muteRow.append(mute, muteLabel);
  body.append(muteRow);

  // -- music ---------------------------------------------------------------
  body.append(el('h3', null, 'Music'));

  const picks = el('div', 'opts-tracks');
  const buttons = new Map();
  const choose = async (chosen) => {
    track = chosen;
    for (const [name, button] of buttons) {
      button.classList.toggle('on', (chosen?.name ?? 'off') === name);
    }
    musicRow.hidden = chosen === null;
    if (!chosen) {
      voice.setMusic(null);
      return;
    }
    await voice.setMusic(`${MUSIC_ROOT}/${chosen.file}`, {
      startSec: chosen.startSec, endSec: chosen.endSec, gain: chosen.gain,
    });
  };

  // Off is first and is where this starts: music under a search is a preference, and
  // a game that begins by playing something at you has made the choice for you.
  for (const entry of [null, ...TRACKS]) {
    const name = entry?.name ?? 'off';
    const button = el('button', 'opts-track', name);
    button.type = 'button';
    if (entry) button.title = `${entry.bpm} bpm, ${entry.bars} bars — ${entry.by}`;
    button.addEventListener('click', () => choose(entry));
    buttons.set(name, button);
    picks.append(button);
  }
  body.append(picks);

  const musicRow = fader('level', 'music');
  musicRow.hidden = true;
  body.append(musicRow);

  const credit = el('p', 'opts-note',
    'All four are CC0. Hover a name for its tempo and who made it.');
  body.append(credit);

  // -- raising and lowering it ---------------------------------------------
  const setOpen = (open) => {
    panel.hidden = !open;
    opener.setAttribute('aria-expanded', String(open));
    opener.classList.toggle('on', open);
    if (open) panel.querySelector('input, button').focus();
  };
  opener.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => {
    setOpen(false);
    opener.focus();
  });
  // Escape closes it wherever the focus is, and a click on the board closes it too:
  // the board is what the panel is covering, so reaching for it is a way of dismissing.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      opener.focus();
    }
  });

  buttons.get('off').classList.add('on');
  mount.append(opener, panel);
  apply();
  return { open: () => setOpen(true), close: () => setOpen(false) };
}
