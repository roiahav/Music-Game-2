/**
 * Fixed map for the "סולמות ולהיטים" board: 100 squares (1..100), eight
 * piano-shaped ladders (jump UP) and eight saxophone-shaped slides (slip DOWN).
 *
 * Layout follows the classic snakes-&-ladders serpentine:
 *  - Square 1 is bottom-left (visual), square 100 is top-left.
 *  - Even rows from the bottom run left-to-right; odd rows run right-to-left.
 *
 * The same map is shared by client and server so the visual position always
 * matches the game-state position. Server imports it via dynamic ESM import
 * to avoid a duplicated source-of-truth.
 */

// [from, to] — landing on `from` jumps you up to `to` (to > from).
export const LADDERS = [
  [4, 25],
  [9, 31],
  [21, 42],
  [28, 84],
  [36, 57],
  [51, 67],
  [71, 91],
  [80, 99],
];

// [from, to] — landing on `from` slides you down to `to` (to < from).
export const SLIDES = [
  [17, 7],
  [54, 34],
  [62, 19],
  [64, 60],
  [87, 36],
  [93, 73],
  [95, 75],
  [98, 78],
];

export const BOARD_SIZE = 100;
export const COLS = 10;
export const ROWS = 10;

/**
 * Convert a board position (1..100) into a {row, col} grid coordinate where
 * row 0 is the visual TOP and col 0 is the visual LEFT. The serpentine path
 * starts at the bottom-left and zig-zags up.
 */
export function positionToCell(pos) {
  const p = Math.max(1, Math.min(BOARD_SIZE, pos | 0));
  const rowFromBottom = Math.floor((p - 1) / COLS);
  const inRow = (p - 1) % COLS;
  const leftToRight = rowFromBottom % 2 === 0;
  const col = leftToRight ? inRow : COLS - 1 - inRow;
  const row = ROWS - 1 - rowFromBottom;
  return { row, col };
}

/** Apply ladder/slide effect after landing on `pos`. Returns the FINAL pos. */
export function resolveBoardEffect(pos) {
  const ladder = LADDERS.find(([from]) => from === pos);
  if (ladder) return { final: ladder[1], kind: 'ladder', from: ladder[0], to: ladder[1] };
  const slide = SLIDES.find(([from]) => from === pos);
  if (slide) return { final: slide[1], kind: 'slide', from: slide[0], to: slide[1] };
  return { final: pos, kind: null };
}
