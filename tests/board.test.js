import test from 'node:test';
import assert from 'node:assert/strict';

import { createBoard, boardAt, partAt, fontSizeFor, BOARD_DEFAULTS } from '../src/board.js';
import { makeWords } from '../src/words.js';

const FIELD = { width: 800, height: 800 };

/** Stand-in for canvas text metrics: a glyph is half the font size wide. */
function measured(count, fontSize = fontSizeFor(FIELD)) {
  return makeWords(7, count).map((word) => ({
    word,
    width: word.length * fontSize * 0.5,
    height: fontSize,
  }));
}

test('a seed rebuilds the same board', () => {
  assert.deepEqual(createBoard(7, FIELD, measured(40)), createBoard(7, FIELD, measured(40)));
});

test('a board is populated to its configured count', () => {
  const board = createBoard(7, FIELD, measured(BOARD_DEFAULTS.count + 20));
  assert.equal(board.parts.length, BOARD_DEFAULTS.count);
});

test('an empty word list is refused rather than making an empty board', () => {
  assert.throws(() => createBoard(7, FIELD, []), /at least one word/);
});

test('the font is sized against the field, not hard-coded', () => {
  assert.equal(fontSizeFor(FIELD), FIELD.height * BOARD_DEFAULTS.fontScale);
  assert.equal(fontSizeFor({ width: 400, height: 400 }), 400 * BOARD_DEFAULTS.fontScale);
});

test('words are spaced evenly across the field, one to a cell', () => {
  const board = createBoard(7, FIELD, measured(BOARD_DEFAULTS.count));
  const pitch = FIELD.width / BOARD_DEFAULTS.columns;
  const first = board.parts[0];
  const second = board.parts[1];
  assert.equal(second.x - first.x, pitch);
  assert.equal(second.y, first.y);
  // The row below sits one pitch down.
  assert.equal(board.parts[BOARD_DEFAULTS.columns].y - first.y, pitch);
});

test('a word in an edge cell hangs off the edge', () => {
  const board = createBoard(7, FIELD, measured(BOARD_DEFAULTS.count));
  const placed = boardAt(board, 0);
  const overhangs = placed.filter((p) => {
    const [[left]] = p.outline;
    const right = p.outline[1][0];
    return left < 0 || right > FIELD.width;
  });
  assert.ok(overhangs.length > 0, 'a board this dense should spill past its edges');
});

test('the board holds still until it is given a drift', () => {
  const board = createBoard(7, FIELD, measured(20));
  assert.deepEqual(boardAt(board, 0), boardAt(board, 30));
});

test('a drift makes it move, without touching the code that places it', () => {
  const moving = { ...BOARD_DEFAULTS, drift: 20 };
  const board = createBoard(7, FIELD, measured(20), moving);
  assert.notDeepEqual(boardAt(board, 0), boardAt(board, 3));
});

test('partAt returns the topmost word covering the point', () => {
  const board = createBoard(7, FIELD, measured(20));
  const placed = boardAt(board, 0);
  const hit = partAt(placed, [placed[0].x, placed[0].y]);
  assert.ok(hit, 'a word centre is covered by something');
  // Whatever is returned is drawn no earlier than the word whose centre it is:
  // on a pile this deep the top of the stack wins, not the word you aimed at.
  assert.ok(hit.id >= placed[0].id);
});

test('a word the pile has buried is marked unreachable', () => {
  const board = createBoard(7, FIELD, measured(BOARD_DEFAULTS.count));
  const buried = board.parts.filter((part) => !part.reachable);
  const open = board.parts.filter((part) => part.reachable);
  assert.ok(open.length > 0, 'some words must be clickable');
  for (const part of buried) {
    const placed = boardAt(board, 0);
    const box = placed.find((p) => p.id === part.id);
    assert.equal(partAt(placed, [box.x, box.y]).id !== part.id, true);
  }
});

test('partAt returns null where no word is', () => {
  const board = createBoard(7, FIELD, measured(20));
  assert.equal(partAt(boardAt(board, 0), [1e6, 1e6]), null);
});

test('partAt picks the word drawn last where two overlap', () => {
  const stacked = [
    { id: 0, name: 'under', outline: [[0, 0], [10, 0], [10, 10], [0, 10]] },
    { id: 1, name: 'over', outline: [[0, 0], [10, 0], [10, 10], [0, 10]] },
  ];
  assert.equal(partAt(stacked, [5, 5]).name, 'over');
});
