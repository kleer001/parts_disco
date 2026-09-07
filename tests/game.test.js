import test from 'node:test';
import assert from 'node:assert/strict';

import { createBoard, boardAt, partAt, fontSizeFor } from '../src/board.js';
import { createGame } from '../src/game.js';
import { makeWords } from '../src/words.js';

const FIELD = { width: 800, height: 800 };

/** Stand-in for canvas text metrics: a glyph is half the font size wide. */
function measured(count) {
  const fontSize = fontSizeFor(FIELD);
  return makeWords(7, count).map((word) => ({
    word,
    width: word.length * fontSize * 0.5,
    height: fontSize,
  }));
}

/** A point where the asked-for word is actually on top, at time t. */
function pointOn(board, name, t) {
  const placed = boardAt(board, t);
  for (const part of placed) {
    if (part.name !== name) continue;
    const [[left, top], , [right, bottom]] = part.outline;
    for (let y = top + 2; y < bottom; y += 3) {
      for (let x = left + 2; x < right; x += 3) {
        if (partAt(placed, [x, y])?.id === part.id) return [x, y];
      }
    }
  }
  throw new Error(`no exposed point for ${name}`);
}

test('a round opens asking for a part that is on the board', () => {
  const board = createBoard(7, FIELD, measured(40));
  const game = createGame(board, 7);
  const target = game.next();
  assert.ok(board.parts.some((part) => part.name === target));
});

test('clicking the named part scores it', () => {
  const board = createBoard(7, FIELD, measured(40));
  const game = createGame(board, 7);
  const target = game.next();
  const { outcome } = game.pick(pointOn(board, target, 0), 0);
  assert.equal(outcome, 'hit');
  assert.equal(game.found.length, 1);
});

test('clicking bare paper is a miss and finds nothing', () => {
  const board = createBoard(7, FIELD, measured(40));
  const game = createGame(board, 7);
  game.next();
  const { outcome, part } = game.pick([1e6, 1e6], 0);
  assert.equal(outcome, 'empty');
  assert.equal(part, null);
  assert.equal(game.misses, 1);
});

test('clicking the wrong part names what it actually was', () => {
  const board = createBoard(7, FIELD, measured(40));
  const game = createGame(board, 7);
  const target = game.next();
  const other = boardAt(board, 0).reverse().find((part) => part.name !== target);
  const { outcome, part } = game.pick([other.x, other.y], 0);
  assert.equal(outcome, 'wrong');
  assert.notEqual(part.name, target);
  assert.equal(game.misses, 1);
});

test('the prompt only ever asks for a word the player can reach', () => {
  const board = createBoard(7, FIELD, measured(40));
  const game = createGame(board, 7);
  let target = game.next();
  const seen = new Set();
  while (target && seen.size < 60) {
    seen.add(target);
    const open = board.parts.filter((p) => p.reachable && !game.found.includes(p.id));
    assert.ok(open.some((p) => p.name === target), `${target} is buried`);
    game.found.push(open.find((p) => p.name === target).id);
    target = game.next();
  }
});

test('the prompt never asks twice for a part already found', () => {
  const board = createBoard(7, FIELD, measured(40));
  const game = createGame(board, 7);
  let target = game.next();
  while (target) {
    const remaining = board.parts.filter(
      (part) => part.reachable && !game.found.includes(part.id));
    assert.ok(remaining.some((part) => part.name === target));
    game.found.push(remaining.find((part) => part.name === target).id);
    target = game.next();
  }
  assert.ok(game.cleared());
});

test('a run reproduces from its seed', () => {
  const play = () => {
    const board = createBoard(7, FIELD, measured(40));
    const game = createGame(board, 7);
    return [game.next(), game.next(), game.next()];
  };
  assert.deepEqual(play(), play());
});
