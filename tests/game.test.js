import test from 'node:test';
import assert from 'node:assert/strict';

import { createBoard, boardAt } from '../src/board.js';
import { createGame } from '../src/game.js';
import { SHAPES } from '../src/shapes.js';

const FIELD = { width: 900, height: 700 };

/** A point on a part carrying the asked-for name, at time t. */
function pointOn(board, name, t) {
  const part = boardAt(board, t).find((candidate) => candidate.name === name);
  return [part.x, part.y];
}

test('a round opens asking for a part that is on the board', () => {
  const board = createBoard(7, FIELD, SHAPES);
  const game = createGame(board, 7);
  const target = game.next();
  assert.ok(board.parts.some((part) => part.name === target));
});

test('clicking the named part scores it', () => {
  const board = createBoard(7, FIELD, SHAPES);
  const game = createGame(board, 7);
  const target = game.next();
  const { outcome } = game.pick(pointOn(board, target, 0), 0);
  assert.equal(outcome, 'hit');
  assert.equal(game.found.length, 1);
});

test('clicking bare paper is a miss and finds nothing', () => {
  const board = createBoard(7, FIELD, SHAPES);
  const game = createGame(board, 7);
  game.next();
  const { outcome, part } = game.pick([1e6, 1e6], 0);
  assert.equal(outcome, 'empty');
  assert.equal(part, null);
  assert.equal(game.misses, 1);
});

test('clicking the wrong part names what it actually was', () => {
  const board = createBoard(7, FIELD, SHAPES);
  const game = createGame(board, 7);
  const target = game.next();
  const other = boardAt(board, 0).reverse().find((part) => part.name !== target);
  const { outcome, part } = game.pick([other.x, other.y], 0);
  assert.equal(outcome, 'wrong');
  assert.notEqual(part.name, target);
  assert.equal(game.misses, 1);
});

test('the prompt never asks twice for a part already found', () => {
  const board = createBoard(7, FIELD, SHAPES);
  const game = createGame(board, 7);
  let target = game.next();
  while (target) {
    const remaining = board.parts.filter((part) => !game.found.includes(part.id));
    assert.ok(remaining.some((part) => part.name === target));
    game.found.push(remaining.find((part) => part.name === target).id);
    target = game.next();
  }
  assert.ok(game.cleared());
});

test('a run reproduces from its seed', () => {
  const play = () => {
    const board = createBoard(7, FIELD, SHAPES);
    const game = createGame(board, 7);
    return [game.next(), game.next(), game.next()];
  };
  assert.deepEqual(play(), play());
});
