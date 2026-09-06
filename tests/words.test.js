import test from 'node:test';
import assert from 'node:assert/strict';

import { makeWords, vocabularySize, ALPHABET, MAX_LENGTH } from '../src/words.js';

test('a seed rebuilds the same vocabulary', () => {
  assert.deepEqual(makeWords(1983, 60), makeWords(1983, 60));
});

test('different seeds give different vocabularies', () => {
  assert.notDeepEqual(makeWords(1983, 60), makeWords(7, 60));
});

test('every word is spelled from the board alphabet', () => {
  const allowed = new RegExp(`^[${ALPHABET.vowels}${ALPHABET.consonants}]+$`);
  for (const word of makeWords(1983, 100)) {
    assert.match(word, allowed);
  }
});

test('no word is longer than the longest shape', () => {
  for (const word of makeWords(1983, 100)) {
    assert.ok(word.length >= 1 && word.length <= MAX_LENGTH, word);
  }
});

test('the words are distinct', () => {
  const words = makeWords(1983, 100);
  assert.equal(new Set(words).size, words.length);
});

test('asking for more than the alphabet can spell returns what it can', () => {
  // Three vowels means three one-letter words, so a vowels-only alphabet runs dry
  // rather than looping forever.
  const tiny = { vowels: 'o', consonants: 'b' };
  const words = makeWords(1983, 5000, tiny);
  assert.ok(words.length > 0);
  assert.ok(words.length < 5000);
  assert.equal(new Set(words).size, words.length);
});

test('vocabularySize counts what each length can spell', () => {
  const counts = vocabularySize();
  // One-letter words are a single vowel slot, so there are as many as vowels.
  assert.equal(counts[1], ALPHABET.vowels.length);
  assert.ok(counts[6] > counts[3]);
});
