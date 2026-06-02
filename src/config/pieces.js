// The 7 tetrominoes + board geometry + a glossy-metal palette per piece.
// Shapes are square 0/1 matrices (spawn orientation); rotation spins the matrix.

export const BOARD = { cols: 10, rows: 20, cell: 31 };

export const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};

export const PIECE_KEYS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// AI-generated glossy chrome block sprites (one per piece); rendered per cell.
export const BLOCK_SRC = {
  I: 'assets/blocks/I.png', O: 'assets/blocks/O.png', T: 'assets/blocks/T.png',
  S: 'assets/blocks/S.png', Z: 'assets/blocks/Z.png', J: 'assets/blocks/J.png', L: 'assets/blocks/L.png',
};

// Each piece is a brushed-metal bar tinted with its hue.
// light/mid/dark drive the bevel gradient; glow is for particles/edges.
export const METAL = {
  I: { light: '#a8f3fb', mid: '#3dc6d6', dark: '#1b7e8c', glow: '#9bf6ff' },
  O: { light: '#ffe9a8', mid: '#e8b53d', dark: '#9a7113', glow: '#ffe082' },
  T: { light: '#e2bbff', mid: '#b15cff', dark: '#6a2fb0', glow: '#e0b8ff' },
  S: { light: '#bff0a8', mid: '#5ed24f', dark: '#2c8a2f', glow: '#9dffc1' },
  Z: { light: '#ffb3bd', mid: '#ff4d5e', dark: '#a3052f', glow: '#ff9bb6' },
  J: { light: '#a8c6ff', mid: '#3d7df0', dark: '#15409a', glow: '#9ddcff' },
  L: { light: '#ffd2ad', mid: '#ff8a3d', dark: '#bf4a05', glow: '#ffc48f' },
  // garbage / locked-neutral fallback (not normally used)
  X: { light: '#cfd6df', mid: '#8d97a5', dark: '#4a525e', glow: '#e8edf3' },
};

// Simplified SRS wall-kick offsets (tried in order when a rotation collides).
export const KICKS = [
  [0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0],
  [0, -1], [-1, -1], [1, -1],
];

export function rotateCW(m) {
  const n = m.length;
  const out = Array.from({ length: n }, () => Array(n).fill(0));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[x][n - 1 - y] = m[y][x];
  return out;
}

export function rotateCCW(m) {
  const n = m.length;
  const out = Array.from({ length: n }, () => Array(n).fill(0));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[n - 1 - x][y] = m[y][x];
  return out;
}
