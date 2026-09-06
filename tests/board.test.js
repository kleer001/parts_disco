import test from 'node:test';
import assert from 'node:assert/strict';

import { createBoard, boardAt, partAt, BOARD_DEFAULTS } from '../src/board.js';
import { SHAPES } from '../src/shapes.js';

const FIELD = { width: 900, height: 700 };

test('a seed rebuilds the same board', () => {
  assert.deepEqual(createBoard(7, FIELD, SHAPES), createBoard(7, FIELD, SHAPES));
});

test('different seeds lay out different boards', () => {
  assert.notDeepEqual(createBoard(7, FIELD, SHAPES), createBoard(8, FIELD, SHAPES));
});

test('a board is populated to its configured count', () => {
  assert.equal(createBoard(7, FIELD, SHAPES).parts.length, BOARD_DEFAULTS.count);
});

test('an empty shape list is refused rather than making an empty board', () => {
  assert.throws(() => createBoard(7, FIELD, []), /at least one shape/);
});

test('every part drifts on its own heading', () => {
  const headings = createBoard(7, FIELD, SHAPES).parts.map((p) => `${p.vx},${p.vy}`);
  assert.equal(new Set(headings).size, headings.length);
});

test('boardAt gives each part an outline where it currently is', () => {
  const board = createBoard(7, FIELD, SHAPES);
  const placed = boardAt(board, 3.5);
  assert.equal(placed.length, board.parts.length);
  for (const part of placed) {
    assert.equal(part.outline.length, part.points.length);
  }
});

test('partAt returns the part under the point', () => {
  const board = createBoard(7, FIELD, SHAPES);
  const placed = boardAt(board, 0);
  const found = partAt(placed, [placed[0].x, placed[0].y]);
  assert.ok(found, 'a part centre should be inside that part');
});

test('partAt returns null where no part is', () => {
  const board = createBoard(7, FIELD, SHAPES);
  assert.equal(partAt(boardAt(board, 0), [1e6, 1e6]), null);
});

test('partAt picks the part drawn last where two overlap', () => {
  const stacked = [
    { id: 0, name: 'under', outline: [[0, 0], [10, 0], [10, 10], [0, 10]] },
    { id: 1, name: 'over', outline: [[0, 0], [10, 0], [10, 10], [0, 10]] },
  ];
  assert.equal(partAt(stacked, [5, 5]).name, 'over');
});
