// The board's vocabulary: pronounceable nonsense built from one narrow alphabet.
//
// The letters are chosen for how they look, not for what they spell. Every one is a
// bowl, a stem, or both -- b, d, p and q are the same two strokes rotated, and o, e,
// a, c are the same ring closed to different degrees. A word made only of these is
// hard to tell from its neighbour at a glance, which is the whole difficulty of a
// find-it board: the search has to be a read, not a shape-match.
//
// Seeded, so a seed reproduces a vocabulary exactly.

import { mulberry32 } from './rng.js';

/** Data: the alphabet, split by role so syllables can be built from it. */
export const ALPHABET = {
  vowels: 'oea',
  consonants: 'splbqdc',
};

// Syllable shapes by word length, C consonant and V vowel. Nonsense still has to be
// sayable -- an unpronounceable run reads as a password, and the eye skips it instead
// of reading it.
export const SHAPES_BY_LENGTH = {
  1: ['V'],
  2: ['CV', 'VC'],
  3: ['CVC', 'VCV'],
  4: ['CVCV', 'CVCC', 'VCVC'],
  5: ['CVCVC', 'CVCCV', 'VCVCV'],
  6: ['CVCVCV', 'CVCCVC', 'CVCVCC'],
};

export const MIN_LENGTH = 1;
export const MAX_LENGTH = 6;

/**
 * Build a vocabulary of unique nonsense words.
 *
 * @param {number} seed
 * @param {number} count - how many distinct words to return
 * @param {object} [alphabet]
 * @returns {string[]} sorted by length, then alphabetically
 */
export function makeWords(seed, count, alphabet = ALPHABET) {
  const rand = mulberry32(seed);
  const pick = (letters) => letters[Math.floor(rand() * letters.length)];
  const lengths = Object.keys(SHAPES_BY_LENGTH).map(Number);

  const words = new Set();
  // The alphabet is small, so a length can run out of distinct words entirely --
  // there are only three one-letter ones. Give up after a run of misses rather than
  // spin forever chasing a count the alphabet cannot reach.
  let misses = 0;
  const ceiling = count * 200;
  while (words.size < count && misses < ceiling) {
    const length = lengths[Math.floor(rand() * lengths.length)];
    const shapes = SHAPES_BY_LENGTH[length];
    const shape = shapes[Math.floor(rand() * shapes.length)];
    const word = [...shape]
      .map((slot) => pick(slot === 'V' ? alphabet.vowels : alphabet.consonants))
      .join('');
    if (words.has(word)) misses++;
    else {
      words.add(word);
      misses = 0;
    }
  }
  return [...words].sort((a, b) => a.length - b.length || a.localeCompare(b));
}

/**
 * How many distinct words this alphabet can express at each length.
 * Useful for asking a board for a count the vocabulary can actually fill.
 * @param {object} [alphabet]
 */
export function vocabularySize(alphabet = ALPHABET) {
  const counts = {};
  for (const [length, shapes] of Object.entries(SHAPES_BY_LENGTH)) {
    const forms = new Set();
    for (const shape of shapes) {
      let total = 1;
      for (const slot of shape) {
        total *= slot === 'V' ? alphabet.vowels.length : alphabet.consonants.length;
      }
      forms.add(shape);
      counts[length] = (counts[length] ?? 0) + total;
    }
  }
  return counts;
}
