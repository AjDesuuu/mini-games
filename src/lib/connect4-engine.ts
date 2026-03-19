export type CellValue = 0 | 1 | 2; // 0=empty, 1=player1, 2=player2

export const ROWS = 6;
export const COLS = 7;

export type Board = CellValue[][];

export interface C4State {
  board: Board;
  currentPlayer: 1 | 2;
  winner: 0 | 1 | 2; // 0 = no winner yet
  isDraw: boolean;
  lastMove: { row: number; col: number } | null;
  winCells: { row: number; col: number }[] | null;
}

export function createBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

export function initC4(): C4State {
  return {
    board: createBoard(),
    currentPlayer: 1,
    winner: 0,
    isDraw: false,
    lastMove: null,
    winCells: null,
  };
}

export function dropDisc(state: C4State, col: number): C4State | null {
  if (state.winner || state.isDraw) return null;
  if (col < 0 || col >= COLS) return null;

  // Find lowest empty row in column
  let row = -1;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (state.board[r][col] === 0) {
      row = r;
      break;
    }
  }
  if (row === -1) return null; // column full

  const newBoard = state.board.map((r) => [...r]);
  newBoard[row][col] = state.currentPlayer;

  const winCells = checkWin(newBoard, row, col, state.currentPlayer);
  const won = winCells !== null;
  const isDraw = !won && newBoard.every((r) => r.every((c) => c !== 0));

  return {
    board: newBoard,
    currentPlayer:
      won || isDraw ? state.currentPlayer : state.currentPlayer === 1 ? 2 : 1,
    winner: won ? state.currentPlayer : 0,
    isDraw,
    lastMove: { row, col },
    winCells,
  };
}

function checkWin(
  board: Board,
  row: number,
  col: number,
  player: CellValue,
): { row: number; col: number }[] | null {
  const directions = [
    [0, 1], // horizontal
    [1, 0], // vertical
    [1, 1], // diagonal down-right
    [1, -1], // diagonal down-left
  ];

  for (const [dr, dc] of directions) {
    const cells: { row: number; col: number }[] = [{ row, col }];

    // Check forward
    for (let i = 1; i < 4; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
        cells.push({ row: r, col: c });
      } else break;
    }

    // Check backward
    for (let i = 1; i < 4; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
        cells.push({ row: r, col: c });
      } else break;
    }

    if (cells.length >= 4) return cells;
  }

  return null;
}

export interface C4ClientView {
  board: Board;
  myColor: 1 | 2;
  isMyTurn: boolean;
  winner: string | null; // winner name or null
  isDraw: boolean;
  myName: string;
  opponentName: string;
  lastMove: { row: number; col: number } | null;
  winCells: { row: number; col: number }[] | null;
}
