import type {
  ActivityGameId,
  ActivityLobby,
  ActivityPlayerEntry,
  PublicProfile,
} from './types';

export interface ActivityGameMeta {
  id: ActivityGameId;
  name: string;
  badge: string;
  tagline: string;
  accent: string;
  defaultMaxPlayers: number;
  allowedPlayerCounts: number[];
}

export const ACTIVITY_GAMES: ActivityGameMeta[] = [
  {
    id: 'chess',
    name: 'Chess',
    badge: '1v1',
    tagline: 'Competitive 1v1 chess with coordinates, captured trays & animations',
    accent: '#f59e0b',
    defaultMaxPlayers: 2,
    allowedPlayerCounts: [2],
  },
  {
    id: 'checkers',
    name: 'Checkers',
    badge: '1v1',
    tagline: 'Competitive 1v1 draughts with fixed tiles, chained jumps & kings',
    accent: '#ef4444',
    defaultMaxPlayers: 2,
    allowedPlayerCounts: [2],
  },
  {
    id: 'minesweeper',
    name: 'Minesweeper',
    badge: 'Race',
    tagline: 'Live spectator split-screen race — first to flag all wins, hit a mine = loss!',
    accent: '#3b82f6',
    defaultMaxPlayers: 2,
    allowedPlayerCounts: [2, 3, 4],
  },
  {
    id: 'vexilloguessr',
    name: 'VexilloGuessr',
    badge: '1v1 · 3❤️',
    tagline: 'Turn-based 4-choice world flag duel with 3 lives each & zero repeat flags',
    accent: '#10b981',
    defaultMaxPlayers: 2,
    allowedPlayerCounts: [2],
  },
  {
    id: 'pool',
    name: 'Pool',
    badge: '8-Ball',
    tagline: 'Realistic 8-Ball billiards — pull back on the cue ball for strike force & speed',
    accent: '#8b5cf6',
    defaultMaxPlayers: 2,
    allowedPlayerCounts: [2],
  },
  {
    id: 'quoridor',
    name: 'Quoridor',
    badge: '2–4P',
    tagline: '1v1, 1v1v1, or 1v1v1v1 tactical wall-placement maze with live groove previews',
    accent: '#ec4899',
    defaultMaxPlayers: 2,
    allowedPlayerCounts: [2, 3, 4],
  },
];

export function getActivityGameMeta(gameId: ActivityGameId): ActivityGameMeta {
  return ACTIVITY_GAMES.find((g) => g.id === gameId) ?? ACTIVITY_GAMES[0];
}

/** Creates the VC control bar Activities icon (gamepad + sparkle). */
export function createActivitiesControlIconSvg(size = 18): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const paths = [
    'M6 11h4',
    'M8 9v4',
    'M15 12h.01',
    'M18 10h.01',
    'M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z',
  ];
  for (const d of paths) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

/** Creates a custom emblem SVG logo for each built-in game. */
export function createGameLogoSvg(gameId: ActivityGameId, size = 32): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 36 36');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');

  const meta = getActivityGameMeta(gameId);
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('x', '2');
  bg.setAttribute('y', '2');
  bg.setAttribute('width', '32');
  bg.setAttribute('height', '32');
  bg.setAttribute('rx', '10');
  bg.setAttribute('fill', meta.accent);
  bg.setAttribute('fill-opacity', '0.22');
  bg.setAttribute('stroke', meta.accent);
  bg.setAttribute('stroke-width', '1.6');
  svg.appendChild(bg);

  const addPath = (d: string, fill = 'none', stroke = '#ffffff', sw = '2') => {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', fill);
    p.setAttribute('stroke', stroke);
    p.setAttribute('stroke-width', sw);
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
  };

  if (gameId === 'chess') {
    addPath(
      'M11 26h14M12 23h12l-1.5-7 3.5-3.5-3.5-1.5-2-3.5-2.5 3-2.5-3-2 3.5-3.5 1.5 3.5 3.5L12 23z',
      meta.accent,
      '#ffffff',
      '1.7',
    );
  } else if (gameId === 'checkers') {
    const c1 = document.createElementNS(ns, 'circle');
    c1.setAttribute('cx', '18');
    c1.setAttribute('cy', '18');
    c1.setAttribute('r', '9');
    c1.setAttribute('fill', meta.accent);
    c1.setAttribute('stroke', '#ffffff');
    c1.setAttribute('stroke-width', '2');
    svg.appendChild(c1);
    addPath('M14 20l1-4 3 2 3-2 1 4H14z', '#ffffff', '#ffffff', '1.2');
  } else if (gameId === 'minesweeper') {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', '18');
    c.setAttribute('cy', '19');
    c.setAttribute('r', '6');
    c.setAttribute('fill', '#ffffff');
    svg.appendChild(c);
    addPath('M18 9v19M9 19h18M11.5 12.5l13 13M24.5 12.5l-13 13', 'none', '#ffffff', '2');
  } else if (gameId === 'vexilloguessr') {
    addPath('M11 9v18', 'none', '#ffffff', '2.2');
    addPath(
      'M11 10c3.5-1.5 6.5 1.5 10 0s4.5 0 4.5 0v9c0 0-1 1.5-4.5 0s-6.5-1.5-10 0V10z',
      meta.accent,
      '#ffffff',
      '1.8',
    );
  } else if (gameId === 'pool') {
    const outer = document.createElementNS(ns, 'circle');
    outer.setAttribute('cx', '18');
    outer.setAttribute('cy', '18');
    outer.setAttribute('r', '9.5');
    outer.setAttribute('fill', '#14151b');
    outer.setAttribute('stroke', '#ffffff');
    outer.setAttribute('stroke-width', '1.8');
    svg.appendChild(outer);
    const inner = document.createElementNS(ns, 'circle');
    inner.setAttribute('cx', '18');
    inner.setAttribute('cy', '18');
    inner.setAttribute('r', '4.6');
    inner.setAttribute('fill', '#ffffff');
    svg.appendChild(inner);
    const txt = document.createElementNS(ns, 'text');
    txt.setAttribute('x', '18');
    txt.setAttribute('y', '20.4');
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('fill', '#111217');
    txt.setAttribute('font-size', '7.5');
    txt.setAttribute('font-weight', '800');
    txt.setAttribute('font-family', 'system-ui, sans-serif');
    txt.textContent = '8';
    svg.appendChild(txt);
  } else if (gameId === 'quoridor') {
    addPath('M10 14h16M10 22h16M14 10v16M22 10v16', 'none', 'rgba(255,255,255,0.45)', '1.4');
    addPath('M14 14h8M22 14v8', 'none', '#ffffff', '3');
    const pawn = document.createElementNS(ns, 'circle');
    pawn.setAttribute('cx', '18');
    pawn.setAttribute('cy', '18');
    pawn.setAttribute('r', '2.6');
    pawn.setAttribute('fill', '#ffffff');
    svg.appendChild(pawn);
  }

  return svg;
}

/* ============================================================================
   GAME 1: CHESS ENGINE (Coordinates, Side Captured Trays, Piece Animations)
   ============================================================================ */

export type ChessColor = 'w' | 'b';
export type ChessPieceType = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K';
export type ChessPiece = `${ChessColor}${ChessPieceType}` | null;

export interface ChessGameState {
  board: ChessPiece[][];
  turn: ChessColor;
  whiteUsername: string;
  blackUsername: string;
  castling: { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean };
  enPassant: [number, number] | null;
  lastMove: { from: [number, number]; to: [number, number] } | null;
  capturedByWhite: ChessPiece[];
  capturedByBlack: ChessPiece[];
  statusText: string;
  inCheck: ChessColor | null;
  winnerUsername: string | null;
  winReason?: string;
  moveCount: number;
}

const CHESS_PIECE_VALUES: Record<ChessPieceType, number> = {
  P: 1,
  N: 3,
  B: 3,
  R: 5,
  Q: 9,
  K: 0,
};

/** Renders a crisp vector Staunton chess piece SVG with consistent bounding dimensions. */
function createChessPieceSvg(piece: NonNullable<ChessPiece>, size = 32): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 45 45');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');

  const isWhite = piece[0] === 'w';
  const kind = piece[1] as ChessPieceType;
  const fill = isWhite ? '#f8fafc' : '#1e2430';
  const stroke = isWhite ? '#1e293b' : '#f1f5f9';

  const g = document.createElementNS(ns, 'g');
  g.setAttribute('fill', fill);
  g.setAttribute('stroke', stroke);
  g.setAttribute('stroke-width', '2');
  g.setAttribute('stroke-linecap', 'round');
  g.setAttribute('stroke-linejoin', 'round');

  const addP = (d: string, customFill?: string) => {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    if (customFill) p.setAttribute('fill', customFill);
    g.appendChild(p);
  };

  if (kind === 'P') {
    addP(
      'M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z',
    );
  } else if (kind === 'R') {
    addP('M9 39h27v-3H9v3zM12 36v-4h21v4H12zM14 29.5v-13h17v13H14zM11 14V9h4v2h5V9h5v2h5V9h4v5H11z');
  } else if (kind === 'N') {
    addP('M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3');
  } else if (kind === 'B') {
    addP('M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.46 3-2 3-2zM15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z');
  } else if (kind === 'Q') {
    addP('M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12zM9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z');
  } else if (kind === 'K') {
    addP('M22.5 11.63V6M20 8h5', 'none');
    addP('M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5');
    addP('M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z');
  }

  svg.appendChild(g);
  return svg;
}

export function createInitialChessState(players: ActivityPlayerEntry[]): ChessGameState {
  const p0 = players[0]?.username ?? 'Player 1';
  const p1 = players[1]?.username ?? 'Player 2';
  const back: ChessPieceType[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  const board: ChessPiece[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    board[0][c] = `b${back[c]}`;
    board[1][c] = 'bP';
    board[6][c] = 'wP';
    board[7][c] = `w${back[c]}`;
  }
  return {
    board,
    turn: 'w',
    whiteUsername: p0,
    blackUsername: p1,
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    lastMove: null,
    capturedByWhite: [],
    capturedByBlack: [],
    statusText: 'White to move',
    inCheck: null,
    winnerUsername: null,
    moveCount: 0,
  };
}

function cloneChessBoard(board: ChessPiece[][]): ChessPiece[][] {
  return board.map((row) => [...row]);
}

function inBounds8(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function findKingSquare(board: ChessPiece[][], color: ChessColor): [number, number] | null {
  const target = `${color}K`;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === target) return [r, c];
    }
  }
  return null;
}

function isSquareAttacked(
  board: ChessPiece[][],
  targetR: number,
  targetC: number,
  byColor: ChessColor,
): boolean {
  const pawnRow = byColor === 'w' ? targetR + 1 : targetR - 1;
  for (const dc of [-1, 1]) {
    if (inBounds8(pawnRow, targetC + dc) && board[pawnRow][targetC + dc] === `${byColor}P`) {
      return true;
    }
  }
  for (const [dr, dc] of [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ]) {
    const nr = targetR + dr;
    const nc = targetC + dc;
    if (inBounds8(nr, nc) && board[nr][nc] === `${byColor}N`) return true;
  }
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = targetR + dr;
      const nc = targetC + dc;
      if (inBounds8(nr, nc) && board[nr][nc] === `${byColor}K`) return true;
    }
  }
  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    let nr = targetR + dr;
    let nc = targetC + dc;
    while (inBounds8(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p === `${byColor}R` || p === `${byColor}Q`) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
  for (const [dr, dc] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    let nr = targetR + dr;
    let nc = targetC + dc;
    while (inBounds8(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p === `${byColor}B` || p === `${byColor}Q`) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
  return false;
}

function isKingInCheck(board: ChessPiece[][], color: ChessColor): boolean {
  const kingPos = findKingSquare(board, color);
  if (!kingPos) return false;
  const enemy: ChessColor = color === 'w' ? 'b' : 'w';
  return isSquareAttacked(board, kingPos[0], kingPos[1], enemy);
}

function getLegalChessMoves(
  state: ChessGameState,
  r: number,
  c: number,
): Array<{ to: [number, number]; castle?: 'K' | 'Q'; enPassantCapture?: [number, number] }> {
  const piece = state.board[r]?.[c];
  if (!piece || piece[0] !== state.turn) return [];
  const color = piece[0] as ChessColor;
  const enemy: ChessColor = color === 'w' ? 'b' : 'w';
  const kind = piece[1] as ChessPieceType;
  const pseudo: Array<{
    to: [number, number];
    castle?: 'K' | 'Q';
    enPassantCapture?: [number, number];
  }> = [];

  if (kind === 'P') {
    const dir = color === 'w' ? -1 : 1;
    const startRow = color === 'w' ? 6 : 1;
    if (inBounds8(r + dir, c) && !state.board[r + dir][c]) {
      pseudo.push({ to: [r + dir, c] });
      if (r === startRow && !state.board[r + dir * 2][c]) {
        pseudo.push({ to: [r + dir * 2, c] });
      }
    }
    for (const dc of [-1, 1]) {
      const nr = r + dir;
      const nc = c + dc;
      if (!inBounds8(nr, nc)) continue;
      const target = state.board[nr][nc];
      if (target && target[0] === enemy) {
        pseudo.push({ to: [nr, nc] });
      } else if (state.enPassant && state.enPassant[0] === nr && state.enPassant[1] === nc) {
        pseudo.push({ to: [nr, nc], enPassantCapture: [r, nc] });
      }
    }
  } else if (kind === 'N') {
    for (const [dr, dc] of [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ]) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds8(nr, nc)) continue;
      const target = state.board[nr][nc];
      if (!target || target[0] === enemy) pseudo.push({ to: [nr, nc] });
    }
  } else if (kind === 'B' || kind === 'R' || kind === 'Q') {
    const dirs: Array<[number, number]> = [];
    if (kind === 'B' || kind === 'Q') dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    if (kind === 'R' || kind === 'Q') dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      while (inBounds8(nr, nc)) {
        const target = state.board[nr][nc];
        if (!target) {
          pseudo.push({ to: [nr, nc] });
        } else {
          if (target[0] === enemy) pseudo.push({ to: [nr, nc] });
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
  } else if (kind === 'K') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds8(nr, nc)) continue;
        const target = state.board[nr][nc];
        if (!target || target[0] === enemy) pseudo.push({ to: [nr, nc] });
      }
    }
    const homeRow = color === 'w' ? 7 : 0;
    if (r === homeRow && c === 4 && !isKingInCheck(state.board, color)) {
      const canK = color === 'w' ? state.castling.wK : state.castling.bK;
      const canQ = color === 'w' ? state.castling.wQ : state.castling.bQ;
      if (
        canK &&
        !state.board[homeRow][5] &&
        !state.board[homeRow][6] &&
        state.board[homeRow][7] === `${color}R` &&
        !isSquareAttacked(state.board, homeRow, 5, enemy) &&
        !isSquareAttacked(state.board, homeRow, 6, enemy)
      ) {
        pseudo.push({ to: [homeRow, 6], castle: 'K' });
      }
      if (
        canQ &&
        !state.board[homeRow][3] &&
        !state.board[homeRow][2] &&
        !state.board[homeRow][1] &&
        state.board[homeRow][0] === `${color}R` &&
        !isSquareAttacked(state.board, homeRow, 3, enemy) &&
        !isSquareAttacked(state.board, homeRow, 2, enemy)
      ) {
        pseudo.push({ to: [homeRow, 2], castle: 'Q' });
      }
    }
  }

  return pseudo.filter((mv) => {
    const test = cloneChessBoard(state.board);
    const moving = test[r][c];
    test[r][c] = null;
    if (mv.enPassantCapture) {
      test[mv.enPassantCapture[0]][mv.enPassantCapture[1]] = null;
    }
    if (mv.castle === 'K') {
      test[r][5] = test[r][7];
      test[r][7] = null;
    } else if (mv.castle === 'Q') {
      test[r][3] = test[r][0];
      test[r][0] = null;
    }
    test[mv.to[0]][mv.to[1]] = moving;
    return !isKingInCheck(test, color);
  });
}

function applyChessMove(
  state: ChessGameState,
  from: [number, number],
  to: [number, number],
  promotionType: ChessPieceType = 'Q',
): ChessGameState | null {
  const legal = getLegalChessMoves(state, from[0], from[1]);
  const matched = legal.find((m) => m.to[0] === to[0] && m.to[1] === to[1]);
  if (!matched) return null;

  const nextBoard = cloneChessBoard(state.board);
  const piece = nextBoard[from[0]][from[1]]!;
  const color = piece[0] as ChessColor;
  const enemy: ChessColor = color === 'w' ? 'b' : 'w';
  const kind = piece[1] as ChessPieceType;

  const capturedByWhite = [...(state.capturedByWhite || [])];
  const capturedByBlack = [...(state.capturedByBlack || [])];

  let captured = nextBoard[to[0]][to[1]];
  if (matched.enPassantCapture) {
    captured = nextBoard[matched.enPassantCapture[0]][matched.enPassantCapture[1]];
    nextBoard[matched.enPassantCapture[0]][matched.enPassantCapture[1]] = null;
  }
  if (captured) {
    if (color === 'w') capturedByWhite.push(captured);
    else capturedByBlack.push(captured);
  }

  nextBoard[from[0]][from[1]] = null;
  if (matched.castle === 'K') {
    nextBoard[from[0]][5] = nextBoard[from[0]][7];
    nextBoard[from[0]][7] = null;
  } else if (matched.castle === 'Q') {
    nextBoard[from[0]][3] = nextBoard[from[0]][0];
    nextBoard[from[0]][0] = null;
  }

  let finalPiece: ChessPiece = piece;
  if (kind === 'P' && (to[0] === 0 || to[0] === 7)) {
    finalPiece = `${color}${promotionType}`;
  }
  nextBoard[to[0]][to[1]] = finalPiece;

  const castling = { ...state.castling };
  if (piece === 'wK') {
    castling.wK = false;
    castling.wQ = false;
  } else if (piece === 'bK') {
    castling.bK = false;
    castling.bQ = false;
  }
  if (from[0] === 7 && from[1] === 0) castling.wQ = false;
  if (from[0] === 7 && from[1] === 7) castling.wK = false;
  if (from[0] === 0 && from[1] === 0) castling.bQ = false;
  if (from[0] === 0 && from[1] === 7) castling.bK = false;
  if (to[0] === 7 && to[1] === 0) castling.wQ = false;
  if (to[0] === 7 && to[1] === 7) castling.wK = false;
  if (to[0] === 0 && to[1] === 0) castling.bQ = false;
  if (to[0] === 0 && to[1] === 7) castling.bK = false;

  const enPassant: [number, number] | null =
    kind === 'P' && Math.abs(to[0] - from[0]) === 2
      ? [(from[0] + to[0]) / 2, from[1]]
      : null;

  const nextState: ChessGameState = {
    ...state,
    board: nextBoard,
    turn: enemy,
    castling,
    enPassant,
    lastMove: { from, to },
    capturedByWhite,
    capturedByBlack,
    inCheck: isKingInCheck(nextBoard, enemy) ? enemy : null,
    moveCount: (state.moveCount || 0) + 1,
    statusText: enemy === 'w' ? 'White to move' : 'Black to move',
  };

  let hasAnyLegalMove = false;
  outer: for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (nextBoard[r][c]?.[0] === enemy && getLegalChessMoves(nextState, r, c).length > 0) {
        hasAnyLegalMove = true;
        break outer;
      }
    }
  }

  if (!hasAnyLegalMove) {
    if (nextState.inCheck) {
      nextState.winnerUsername = color === 'w' ? state.whiteUsername : state.blackUsername;
      nextState.winReason = `Checkmate! ${color === 'w' ? 'White' : 'Black'} wins`;
      nextState.statusText = nextState.winReason;
    } else {
      nextState.winnerUsername = '';
      nextState.winReason = 'Stalemate — Draw!';
      nextState.statusText = nextState.winReason;
    }
  } else if (nextState.inCheck) {
    nextState.statusText = `${enemy === 'w' ? 'White' : 'Black'} is in Check!`;
  }

  return nextState;
}

/* ============================================================================
   GAME 2: CHECKERS ENGINE (Fixed Tiles, Side Captured Stacks, Animations)
   ============================================================================ */

export type CheckerCell = 'r' | 'R' | 'b' | 'B' | null;

export interface CheckersGameState {
  board: CheckerCell[][];
  turn: 'r' | 'b';
  redUsername: string;
  blackUsername: string;
  mustContinueFrom: [number, number] | null;
  lastMove: { from: [number, number]; to: [number, number] } | null;
  redCaptured: number;
  blackCaptured: number;
  winnerUsername: string | null;
  winReason?: string;
  statusText: string;
  moveCount?: number;
}

export function createInitialCheckersState(players: ActivityPlayerEntry[]): CheckersGameState {
  const board: CheckerCell[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) board[r][c] = 'b';
    }
  }
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) board[r][c] = 'r';
    }
  }
  return {
    board,
    turn: 'r',
    redUsername: players[0]?.username ?? 'Player 1',
    blackUsername: players[1]?.username ?? 'Player 2',
    mustContinueFrom: null,
    lastMove: null,
    redCaptured: 0,
    blackCaptured: 0,
    winnerUsername: null,
    statusText: 'Red to move',
    moveCount: 0,
  };
}

interface CheckerMove {
  from: [number, number];
  to: [number, number];
  captured?: [number, number];
}

function getCheckerPieceJumps(board: CheckerCell[][], r: number, c: number): CheckerMove[] {
  const p = board[r]?.[c];
  if (!p) return [];
  const color = p.toLowerCase() as 'r' | 'b';
  const isKing = p === 'R' || p === 'B';
  const rowDirs = isKing ? [-1, 1] : color === 'r' ? [-1] : [1];
  const jumps: CheckerMove[] = [];
  for (const dr of rowDirs) {
    for (const dc of [-1, 1]) {
      const mr = r + dr;
      const mc = c + dc;
      const tr = r + dr * 2;
      const tc = c + dc * 2;
      if (!inBounds8(tr, tc)) continue;
      const mid = board[mr][mc];
      if (mid && mid.toLowerCase() !== color && !board[tr][tc]) {
        jumps.push({ from: [r, c], to: [tr, tc], captured: [mr, mc] });
      }
    }
  }
  return jumps;
}

function getCheckerLegalMovesForSquare(
  state: CheckersGameState,
  r: number,
  c: number,
): CheckerMove[] {
  const p = state.board[r]?.[c];
  if (!p || p.toLowerCase() !== state.turn) return [];
  if (
    state.mustContinueFrom &&
    (state.mustContinueFrom[0] !== r || state.mustContinueFrom[1] !== c)
  ) {
    return [];
  }
  const jumps = getCheckerPieceJumps(state.board, r, c);
  if (state.mustContinueFrom) {
    return jumps;
  }
  let anyJumpExists = false;
  for (let rr = 0; rr < 8; rr++) {
    for (let cc = 0; cc < 8; cc++) {
      if (
        state.board[rr][cc]?.toLowerCase() === state.turn &&
        getCheckerPieceJumps(state.board, rr, cc).length > 0
      ) {
        anyJumpExists = true;
        break;
      }
    }
  }
  if (anyJumpExists) return jumps;

  const color = p.toLowerCase() as 'r' | 'b';
  const isKing = p === 'R' || p === 'B';
  const rowDirs = isKing ? [-1, 1] : color === 'r' ? [-1] : [1];
  const steps: CheckerMove[] = [];
  for (const dr of rowDirs) {
    for (const dc of [-1, 1]) {
      const tr = r + dr;
      const tc = c + dc;
      if (inBounds8(tr, tc) && !state.board[tr][tc]) {
        steps.push({ from: [r, c], to: [tr, tc] });
      }
    }
  }
  return steps;
}

function applyCheckersMove(
  state: CheckersGameState,
  from: [number, number],
  to: [number, number],
): CheckersGameState | null {
  const legal = getCheckerLegalMovesForSquare(state, from[0], from[1]);
  const mv = legal.find((m) => m.to[0] === to[0] && m.to[1] === to[1]);
  if (!mv) return null;

  const nextBoard = state.board.map((row) => [...row]);
  let piece = nextBoard[from[0]][from[1]]!;
  const color = piece.toLowerCase() as 'r' | 'b';
  const enemy: 'r' | 'b' = color === 'r' ? 'b' : 'r';
  nextBoard[from[0]][from[1]] = null;

  let redCaptured = state.redCaptured;
  let blackCaptured = state.blackCaptured;
  if (mv.captured) {
    nextBoard[mv.captured[0]][mv.captured[1]] = null;
    if (color === 'r') redCaptured += 1;
    else blackCaptured += 1;
  }

  let crownedJustNow = false;
  if (piece === 'r' && to[0] === 0) {
    piece = 'R';
    crownedJustNow = true;
  } else if (piece === 'b' && to[0] === 7) {
    piece = 'B';
    crownedJustNow = true;
  }
  nextBoard[to[0]][to[1]] = piece;

  if (mv.captured && !crownedJustNow) {
    const followUpJumps = getCheckerPieceJumps(nextBoard, to[0], to[1]);
    if (followUpJumps.length > 0) {
      return {
        ...state,
        board: nextBoard,
        mustContinueFrom: to,
        lastMove: { from, to },
        redCaptured,
        blackCaptured,
        moveCount: (state.moveCount || 0) + 1,
        statusText: `${color === 'r' ? 'Red' : 'Black'} multi-jump! Select next jump`,
      };
    }
  }

  const nextState: CheckersGameState = {
    ...state,
    board: nextBoard,
    turn: enemy,
    mustContinueFrom: null,
    lastMove: { from, to },
    redCaptured,
    blackCaptured,
    moveCount: (state.moveCount || 0) + 1,
    statusText: enemy === 'r' ? 'Red to move' : 'Black to move',
  };

  let enemyHasMoves = false;
  outer: for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (
        nextBoard[r][c]?.toLowerCase() === enemy &&
        getCheckerLegalMovesForSquare(nextState, r, c).length > 0
      ) {
        enemyHasMoves = true;
        break outer;
      }
    }
  }

  if (!enemyHasMoves) {
    nextState.winnerUsername = color === 'r' ? state.redUsername : state.blackUsername;
    nextState.winReason = `${color === 'r' ? 'Red' : 'Black'} wins by capturing/blocking all pieces!`;
    nextState.statusText = nextState.winReason;
  }

  return nextState;
}

/* ============================================================================
   GAME 3: MINESWEEPER RACE (Live Split-Screen Spectator Boards + Chord Reveal)
   ============================================================================ */

export interface MinesweeperPlayerBoard {
  revealed: number[];
  flagged: number[];
  status: 'playing' | 'won' | 'exploded';
  explodedIndex?: number;
}

export interface MinesweeperGameState {
  rows: number;
  cols: number;
  mineCount: number;
  seed: number;
  mines: number[] | null;
  playerBoards: Record<string, MinesweeperPlayerBoard>;
  winnerUsername: string | null;
  loserUsername: string | null;
  winReason?: string;
}

export function createInitialMinesweeperState(
  players: ActivityPlayerEntry[],
): MinesweeperGameState {
  const playerBoards: Record<string, MinesweeperPlayerBoard> = {};
  for (const p of players) {
    playerBoards[p.username.toLowerCase()] = {
      revealed: [],
      flagged: [],
      status: 'playing',
    };
  }
  return {
    rows: 10,
    cols: 12,
    mineCount: 18,
    seed: Math.floor(Math.random() * 1_000_000_000),
    mines: null,
    playerBoards,
    winnerUsername: null,
    loserUsername: null,
  };
}

function generateMinesFromSeed(
  rows: number,
  cols: number,
  mineCount: number,
  seed: number,
  safeIndex: number,
): number[] {
  const total = rows * cols;
  const safeRow = Math.floor(safeIndex / cols);
  const safeCol = safeIndex % cols;
  const candidates: number[] = [];
  for (let i = 0; i < total; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    if (Math.abs(r - safeRow) <= 1 && Math.abs(c - safeCol) <= 1) continue;
    candidates.push(i);
  }
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.slice(0, mineCount).sort((a, b) => a - b);
}

function countAdjacentMines(
  index: number,
  rows: number,
  cols: number,
  mineSet: Set<number>,
): number {
  const r = Math.floor(index / cols);
  const c = index % cols;
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && mineSet.has(nr * cols + nc)) {
        count += 1;
      }
    }
  }
  return count;
}

function floodRevealMinesweeper(
  startIndex: number,
  rows: number,
  cols: number,
  mineSet: Set<number>,
  revealedSet: Set<number>,
  flaggedSet: Set<number>,
): void {
  const queue = [startIndex];
  while (queue.length > 0) {
    const idx = queue.shift()!;
    if (revealedSet.has(idx) || flaggedSet.has(idx) || mineSet.has(idx)) continue;
    revealedSet.add(idx);
    if (countAdjacentMines(idx, rows, cols, mineSet) === 0) {
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            const nIdx = nr * cols + nc;
            if (!revealedSet.has(nIdx)) queue.push(nIdx);
          }
        }
      }
    }
  }
}

/* ============================================================================
   GAME 4: VEXILLOGUESSR (Never Repeat Previous Flag + 90+ Flag Deck)
   ============================================================================ */

export interface VexilloFlagEntry {
  code: string;
  name: string;
  colors: [string, string, string];
}

export const VEXILLO_FLAGS: VexilloFlagEntry[] = [
  { code: 'us', name: 'United States', colors: ['#b22234', '#ffffff', '#3c3b6e'] },
  { code: 'ca', name: 'Canada', colors: ['#ff0000', '#ffffff', '#ff0000'] },
  { code: 'mx', name: 'Mexico', colors: ['#006847', '#ffffff', '#ce1126'] },
  { code: 'br', name: 'Brazil', colors: ['#009c3b', '#ffdf00', '#002776'] },
  { code: 'ar', name: 'Argentina', colors: ['#74acdf', '#ffffff', '#74acdf'] },
  { code: 'gb', name: 'United Kingdom', colors: ['#012169', '#ffffff', '#c8102e'] },
  { code: 'fr', name: 'France', colors: ['#0055a4', '#ffffff', '#ef4135'] },
  { code: 'de', name: 'Germany', colors: ['#000000', '#dd0000', '#ffce00'] },
  { code: 'it', name: 'Italy', colors: ['#009246', '#ffffff', '#ce2b37'] },
  { code: 'es', name: 'Spain', colors: ['#aa151b', '#f1bf00', '#aa151b'] },
  { code: 'pt', name: 'Portugal', colors: ['#006600', '#ff0000', '#ffcc00'] },
  { code: 'nl', name: 'Netherlands', colors: ['#ae1c28', '#ffffff', '#21468b'] },
  { code: 'be', name: 'Belgium', colors: ['#000000', '#fae042', '#ed2939'] },
  { code: 'ch', name: 'Switzerland', colors: ['#ff0000', '#ffffff', '#ff0000'] },
  { code: 'se', name: 'Sweden', colors: ['#006aa7', '#fecc02', '#006aa7'] },
  { code: 'no', name: 'Norway', colors: ['#ba0c2f', '#ffffff', '#00205b'] },
  { code: 'fi', name: 'Finland', colors: ['#ffffff', '#003580', '#ffffff'] },
  { code: 'dk', name: 'Denmark', colors: ['#c60c30', '#ffffff', '#c60c30'] },
  { code: 'pl', name: 'Poland', colors: ['#ffffff', '#dc143c', '#dc143c'] },
  { code: 'ua', name: 'Ukraine', colors: ['#005bbb', '#ffd500', '#ffd500'] },
  { code: 'gr', name: 'Greece', colors: ['#0d5eaf', '#ffffff', '#0d5eaf'] },
  { code: 'tr', name: 'Turkey', colors: ['#e30a17', '#ffffff', '#e30a17'] },
  { code: 'jp', name: 'Japan', colors: ['#ffffff', '#bc002d', '#ffffff'] },
  { code: 'kr', name: 'South Korea', colors: ['#ffffff', '#cd2e3a', '#0047a0'] },
  { code: 'cn', name: 'China', colors: ['#de2910', '#ffde00', '#de2910'] },
  { code: 'in', name: 'India', colors: ['#ff9933', '#ffffff', '#138808'] },
  { code: 'au', name: 'Australia', colors: ['#00008b', '#ffffff', '#ff0000'] },
  { code: 'nz', name: 'New Zealand', colors: ['#00247d', '#cc142b', '#ffffff'] },
  { code: 'za', name: 'South Africa', colors: ['#007749', '#ffb81c', '#e03c31'] },
  { code: 'eg', name: 'Egypt', colors: ['#ce1126', '#ffffff', '#000000'] },
  { code: 'ng', name: 'Nigeria', colors: ['#008751', '#ffffff', '#008751'] },
  { code: 'ke', name: 'Kenya', colors: ['#000000', '#bb0000', '#006600'] },
  { code: 'ma', name: 'Morocco', colors: ['#c1272d', '#006233', '#c1272d'] },
  { code: 'sa', name: 'Saudi Arabia', colors: ['#006c35', '#ffffff', '#006c35'] },
  { code: 'ae', name: 'United Arab Emirates', colors: ['#00732f', '#ffffff', '#000000'] },
  { code: 'th', name: 'Thailand', colors: ['#a51931', '#f4f5f8', '#2d2a4a'] },
  { code: 'vn', name: 'Vietnam', colors: ['#da251d', '#ffff00', '#da251d'] },
  { code: 'ph', name: 'Philippines', colors: ['#0038a8', '#ce1126', '#fcd116'] },
  { code: 'id', name: 'Indonesia', colors: ['#ff0000', '#ffffff', '#ffffff'] },
  { code: 'my', name: 'Malaysia', colors: ['#010066', '#cc0001', '#ffcc00'] },
  { code: 'sg', name: 'Singapore', colors: ['#ef3340', '#ffffff', '#ffffff'] },
  { code: 'pk', name: 'Pakistan', colors: ['#01411c', '#ffffff', '#01411c'] },
  { code: 'cl', name: 'Chile', colors: ['#0039a6', '#ffffff', '#d52b1e'] },
  { code: 'co', name: 'Colombia', colors: ['#fcd116', '#003893', '#ce1126'] },
  { code: 'pe', name: 'Peru', colors: ['#d91023', '#ffffff', '#d91023'] },
  { code: 'ie', name: 'Ireland', colors: ['#169b62', '#ffffff', '#ff883e'] },
  { code: 'at', name: 'Austria', colors: ['#ed2939', '#ffffff', '#ed2939'] },
  { code: 'cz', name: 'Czechia', colors: ['#ffffff', '#d7141a', '#11457e'] },
  { code: 'hu', name: 'Hungary', colors: ['#ce2939', '#ffffff', '#477050'] },
  { code: 'ro', name: 'Romania', colors: ['#002b7f', '#fcd116', '#ce1126'] },
  { code: 'hr', name: 'Croatia', colors: ['#ff0000', '#ffffff', '#171796'] },
  { code: 'rs', name: 'Serbia', colors: ['#c6363c', '#0c4076', '#ffffff'] },
  { code: 'bg', name: 'Bulgaria', colors: ['#ffffff', '#00966e', '#d62612'] },
  { code: 'is', name: 'Iceland', colors: ['#02529c', '#ffffff', '#dc1e35'] },
  { code: 'ee', name: 'Estonia', colors: ['#0072ce', '#000000', '#ffffff'] },
  { code: 'lv', name: 'Latvia', colors: ['#9e3039', '#ffffff', '#9e3039'] },
  { code: 'lt', name: 'Lithuania', colors: ['#fdb913', '#006a44', '#c1272d'] },
  { code: 'jm', name: 'Jamaica', colors: ['#009b3a', '#fed100', '#000000'] },
  { code: 'cu', name: 'Cuba', colors: ['#002a8f', '#ffffff', '#cf142b'] },
  { code: 'gh', name: 'Ghana', colors: ['#cf0921', '#fcd116', '#006b3f'] },
  { code: 'uy', name: 'Uruguay', colors: ['#0038a8', '#ffffff', '#fcd116'] },
  { code: 've', name: 'Venezuela', colors: ['#ffcc00', '#00247d', '#cf142b'] },
  { code: 'ec', name: 'Ecuador', colors: ['#ffdd00', '#034ea2', '#ed1c24'] },
  { code: 'bo', name: 'Bolivia', colors: ['#d52b1e', '#f9e300', '#007934'] },
  { code: 'py', name: 'Paraguay', colors: ['#d52b1e', '#ffffff', '#0038a8'] },
  { code: 'cr', name: 'Costa Rica', colors: ['#002b7f', '#ffffff', '#ce1126'] },
  { code: 'pa', name: 'Panama', colors: ['#ffffff', '#005293', '#d21034'] },
  { code: 'do', name: 'Dominican Republic', colors: ['#002d62', '#ce1126', '#ffffff'] },
  { code: 'gt', name: 'Guatemala', colors: ['#4997d0', '#ffffff', '#4997d0'] },
  { code: 'hn', name: 'Honduras', colors: ['#00bce4', '#ffffff', '#00bce4'] },
  { code: 'dz', name: 'Algeria', colors: ['#006233', '#ffffff', '#d21034'] },
  { code: 'tn', name: 'Tunisia', colors: ['#e70013', '#ffffff', '#e70013'] },
  { code: 'et', name: 'Ethiopia', colors: ['#078930', '#fcdd09', '#da121a'] },
  { code: 'tz', name: 'Tanzania', colors: ['#1eb53a', '#00a3dd', '#000000'] },
  { code: 'sn', name: 'Senegal', colors: ['#00853f', '#fdef42', '#e31b23'] },
  { code: 'cm', name: 'Cameroon', colors: ['#007a5e', '#ce1126', '#fcd116'] },
  { code: 'ci', name: 'Ivory Coast', colors: ['#f77f00', '#ffffff', '#009e60'] },
  { code: 'AO', name: 'Angola', colors: ['#cc092f', '#000000', '#ffcb00'] },
  { code: 'il', name: 'Israel', colors: ['#ffffff', '#0038b8', '#ffffff'] },
  { code: 'jo', name: 'Jordan', colors: ['#000000', '#ffffff', '#007a3d'] },
  { code: 'lb', name: 'Lebanon', colors: ['#ed1c24', '#ffffff', '#00a651'] },
  { code: 'qa', name: 'Qatar', colors: ['#8d1b3d', '#ffffff', '#8d1b3d'] },
  { code: 'kw', name: 'Kuwait', colors: ['#007a3d', '#ffffff', '#ce1126'] },
  { code: 'om', name: 'Oman', colors: ['#db161b', '#ffffff', '#008000'] },
  { code: 'kz', name: 'Kazakhstan', colors: ['#00afca', '#fec50c', '#00afca'] },
  { code: 'uz', name: 'Uzbekistan', colors: ['#0099b5', '#ffffff', '#1eb53a'] },
  { code: 'ge', name: 'Georgia', colors: ['#ffffff', '#ff0000', '#ffffff'] },
  { code: 'am', name: 'Armenia', colors: ['#d90012', '#0033a0', '#f2a800'] },
  { code: 'az', name: 'Azerbaijan', colors: ['#0092bc', '#e4002b', '#00af66'] },
  { code: 'np', name: 'Nepal', colors: ['#dc143c', '#003893', '#ffffff'] },
  { code: 'lk', name: 'Sri Lanka', colors: ['#ffbe29', '#8d153a', '#00534e'] },
  { code: 'bd', name: 'Bangladesh', colors: ['#006a4e', '#f42a41', '#006a4e'] },
  { code: 'mn', name: 'Mongolia', colors: ['#da2032', '#0066b3', '#ffd900'] },
  { code: 'kh', name: 'Cambodia', colors: ['#032ea1', '#e00025', '#ffffff'] },
  { code: 'la', name: 'Laos', colors: ['#ce1126', '#002868', '#ffffff'] },
];

export interface VexilloGuessrGameState {
  turnIndex: number;
  playerUsernames: [string, string];
  lives: Record<string, number>;
  scores: Record<string, number>;
  currentFlagCode: string;
  currentFlagName: string;
  lastFlagCode?: string;
  choices: string[];
  usedCodes: string[];
  lastFeedback: {
    username: string;
    chosen: string;
    correctName: string;
    isCorrect: boolean;
  } | null;
  winnerUsername: string | null;
  winReason?: string;
  roundNumber: number;
}

function dealNextVexilloRound(
  usedCodes: string[],
  lastFlagCode?: string,
): {
  flag: VexilloFlagEntry;
  choices: string[];
  nextUsed: string[];
} {
  const cleanLast = (lastFlagCode || '').toLowerCase();
  let nextUsed = usedCodes.map((c) => c.toLowerCase());
  const usedSet = new Set(nextUsed);
  if (cleanLast) usedSet.add(cleanLast);

  let pool = VEXILLO_FLAGS.filter(
    (f) => !usedSet.has(f.code.toLowerCase()) && f.code.toLowerCase() !== cleanLast,
  );
  if (pool.length < 4) {
    // Keep the most recent 20 flags excluded so a recent flag is NEVER repeated!
    const recentKeep = nextUsed.slice(-20);
    if (cleanLast && !recentKeep.includes(cleanLast)) recentKeep.push(cleanLast);
    const recentSet = new Set(recentKeep);
    nextUsed = recentKeep;
    pool = VEXILLO_FLAGS.filter((f) => !recentSet.has(f.code.toLowerCase()));
  }
  const correct = pool[Math.floor(Math.random() * pool.length)];
  const correctCode = correct.code.toLowerCase();
  nextUsed.push(correctCode);

  const distractors = VEXILLO_FLAGS.filter((f) => f.code.toLowerCase() !== correctCode)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map((f) => f.name);
  const choices = [correct.name, ...distractors].sort(() => Math.random() - 0.5);
  return { flag: correct, choices, nextUsed };
}

export function createInitialVexilloState(
  players: ActivityPlayerEntry[],
  previousLastFlagCode?: string,
): VexilloGuessrGameState {
  const p0 = players[0]?.username ?? 'Player 1';
  const p1 = players[1]?.username ?? 'Player 2';
  const deal = dealNextVexilloRound(
    previousLastFlagCode ? [previousLastFlagCode] : [],
    previousLastFlagCode,
  );
  return {
    turnIndex: 0,
    playerUsernames: [p0, p1],
    lives: { [p0.toLowerCase()]: 3, [p1.toLowerCase()]: 3 },
    scores: { [p0.toLowerCase()]: 0, [p1.toLowerCase()]: 0 },
    currentFlagCode: deal.flag.code.toLowerCase(),
    currentFlagName: deal.flag.name,
    lastFlagCode: deal.flag.code.toLowerCase(),
    choices: deal.choices,
    usedCodes: deal.nextUsed,
    lastFeedback: null,
    winnerUsername: null,
    roundNumber: 1,
  };
}

/* ============================================================================
   GAME 5: 8-BALL POOL (Realistic Sub-Stepped Physics + Pull-Back-on-Ball Strike Control)
   ============================================================================ */

export interface PoolBall {
  id: number; // 0 = cue, 1..7 = solids, 8 = eight-ball, 9..15 = stripes
  x: number;
  y: number;
  vx: number;
  vy: number;
  pocketed: boolean;
}

export interface PoolGameState {
  balls: PoolBall[];
  playerUsernames: [string, string];
  turnIndex: number;
  groups: Record<string, 'solids' | 'stripes' | null>;
  lastShot: {
    seq: number;
    shooter: string;
    angle: number;
    power: number;
    startBalls: PoolBall[];
  } | null;
  statusText: string;
  winnerUsername: string | null;
  winReason?: string;
}

const POOL_W = 740;
const POOL_H = 380;
const POOL_RAIL = 28;
const POOL_BALL_R = 10.5;
const POOL_POCKET_R = 20.5;
const POOL_MAX_SPEED = 22.5;

const POOL_BALL_COLORS: Record<number, string> = {
  0: '#f8fafc',
  1: '#facc15',
  2: '#2563eb',
  3: '#ef4444',
  4: '#7c3aed',
  5: '#f97316',
  6: '#16a34a',
  7: '#991b1b',
  8: '#0f172a',
  9: '#facc15',
  10: '#2563eb',
  11: '#ef4444',
  12: '#7c3aed',
  13: '#f97316',
  14: '#16a34a',
  15: '#991b1b',
};

export function createInitialPoolState(players: ActivityPlayerEntry[]): PoolGameState {
  const p0 = players[0]?.username ?? 'Player 1';
  const p1 = players[1]?.username ?? 'Player 2';
  const balls: PoolBall[] = [
    { id: 0, x: 195, y: POOL_H / 2, vx: 0, vy: 0, pocketed: false },
  ];
  const rackOrder = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  const apexX = 515;
  const apexY = POOL_H / 2;
  const dx = POOL_BALL_R * 1.75;
  const dy = POOL_BALL_R * 1.02;
  let idx = 0;
  for (let col = 0; col < 5; col++) {
    for (let row = 0; row <= col; row++) {
      const id = rackOrder[idx++];
      const x = apexX + col * dx;
      const y = apexY + (row - col / 2) * (dy * 2);
      balls.push({ id, x, y, vx: 0, vy: 0, pocketed: false });
    }
  }
  return {
    balls,
    playerUsernames: [p0, p1],
    turnIndex: 0,
    groups: { [p0.toLowerCase()]: null, [p1.toLowerCase()]: null },
    lastShot: null,
    statusText: `${p0} to break! Drag & pull back from the cue ball to strike`,
    winnerUsername: null,
  };
}

const POOL_POCKETS: Array<[number, number]> = [
  [POOL_RAIL + 2, POOL_RAIL + 2],
  [POOL_W / 2, POOL_RAIL - 3],
  [POOL_W - POOL_RAIL - 2, POOL_RAIL + 2],
  [POOL_RAIL + 2, POOL_H - POOL_RAIL - 2],
  [POOL_W / 2, POOL_H - POOL_RAIL + 3],
  [POOL_W - POOL_RAIL - 2, POOL_H - POOL_RAIL - 2],
];

/**
 * Sub-stepped realistic rigid-body billiards physics step (6 sub-steps per frame)
 * preventing high-speed tunneling and modeling sliding-to-rolling cloth friction.
 */
function simulatePoolFrame(balls: PoolBall[], pocketedThisShot: number[]): boolean {
  const SUB_STEPS = 6;
  let anyMoving = false;
  const minX = POOL_RAIL + POOL_BALL_R;
  const maxX = POOL_W - POOL_RAIL - POOL_BALL_R;
  const minY = POOL_RAIL + POOL_BALL_R;
  const maxY = POOL_H - POOL_RAIL - POOL_BALL_R;

  for (let s = 0; s < SUB_STEPS; s++) {
    for (const b of balls) {
      if (b.pocketed) continue;
      b.x += b.vx / SUB_STEPS;
      b.y += b.vy / SUB_STEPS;

      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 0) {
        // Realistic two-regime cloth friction: viscous drag + constant rolling resistance
        const decel = (speed * 0.011 + 0.018) / SUB_STEPS;
        const nextSpeed = Math.max(0, speed - decel);
        if (nextSpeed < 0.03) {
          b.vx = 0;
          b.vy = 0;
        } else {
          const ratio = nextSpeed / speed;
          b.vx *= ratio;
          b.vy *= ratio;
          anyMoving = true;
        }
      }

      // Pocket capture with gravity pull near lip
      for (const [px, py] of POOL_POCKETS) {
        const distToPocket = Math.hypot(b.x - px, b.y - py);
        if (distToPocket < POOL_POCKET_R) {
          b.pocketed = true;
          b.vx = 0;
          b.vy = 0;
          if (!pocketedThisShot.includes(b.id)) {
            pocketedThisShot.push(b.id);
          }
          break;
        } else if (distToPocket < POOL_POCKET_R + 6) {
          b.vx += ((px - b.x) / distToPocket) * 0.14;
          b.vy += ((py - b.y) / distToPocket) * 0.14;
        }
      }
      if (b.pocketed) continue;

      // Cushion rebound (skip rail bounce right inside pocket mouths)
      const nearCornerOrSidePocket = POOL_POCKETS.some(
        ([px, py]) => Math.hypot(b.x - px, b.y - py) < POOL_POCKET_R + 7,
      );
      if (!nearCornerOrSidePocket) {
        if (b.x < minX) {
          b.x = minX;
          b.vx = -b.vx * 0.84;
          b.vy *= 0.96;
        } else if (b.x > maxX) {
          b.x = maxX;
          b.vx = -b.vx * 0.84;
          b.vy *= 0.96;
        }
        if (b.y < minY) {
          b.y = minY;
          b.vy = -b.vy * 0.84;
          b.vx *= 0.96;
        } else if (b.y > maxY) {
          b.y = maxY;
          b.vy = -b.vy * 0.84;
          b.vx *= 0.96;
        }
      }
    }

    // Elastic ball-to-ball collision resolution
    const minDist = POOL_BALL_R * 2;
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.pocketed) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.pocketed) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < minDist) {
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = (minDist - dist) * 0.505;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;

          const dvx = a.vx - b.vx;
          const dvy = a.vy - b.vy;
          const normalVel = dvx * nx + dvy * ny;
          if (normalVel > 0) {
            const restitution = 0.965;
            const impulse = normalVel * restitution;
            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            b.vx += impulse * nx;
            b.vy += impulse * ny;
            anyMoving = true;
          }
        }
      }
    }
  }

  return anyMoving;
}

/** Raycasts the cue ball trajectory to find the exact first ball or rail impact point. */
function computePoolAimRaycast(
  balls: PoolBall[],
  angle: number,
): {
  hitX: number;
  hitY: number;
  hitBall: PoolBall | null;
  targetDirX?: number;
  targetDirY?: number;
} {
  const cue = balls.find((b) => b.id === 0 && !b.pocketed);
  if (!cue) return { hitX: 0, hitY: 0, hitBall: null };

  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const diam = POOL_BALL_R * 2;

  let bestT = 900;
  let hitBall: PoolBall | null = null;

  // Check rail distances
  const minX = POOL_RAIL + POOL_BALL_R;
  const maxX = POOL_W - POOL_RAIL - POOL_BALL_R;
  const minY = POOL_RAIL + POOL_BALL_R;
  const maxY = POOL_H - POOL_RAIL - POOL_BALL_R;

  if (dirX > 0.0001) bestT = Math.min(bestT, (maxX - cue.x) / dirX);
  else if (dirX < -0.0001) bestT = Math.min(bestT, (minX - cue.x) / dirX);
  if (dirY > 0.0001) bestT = Math.min(bestT, (maxY - cue.y) / dirY);
  else if (dirY < -0.0001) bestT = Math.min(bestT, (minY - cue.y) / dirY);

  // Check intersection with each object ball circle of radius 2*R
  for (const b of balls) {
    if (b.id === 0 || b.pocketed) continue;
    const fx = b.x - cue.x;
    const fy = b.y - cue.y;
    const proj = fx * dirX + fy * dirY;
    if (proj <= 0) continue;
    const perpSq = fx * fx + fy * fy - proj * proj;
    if (perpSq < diam * diam) {
      const t = proj - Math.sqrt(diam * diam - perpSq);
      if (t > 0 && t < bestT) {
        bestT = t;
        hitBall = b;
      }
    }
  }

  const hitX = cue.x + dirX * bestT;
  const hitY = cue.y + dirY * bestT;
  if (hitBall) {
    const nd = Math.hypot(hitBall.x - hitX, hitBall.y - hitY) || 1;
    return {
      hitX,
      hitY,
      hitBall,
      targetDirX: (hitBall.x - hitX) / nd,
      targetDirY: (hitBall.y - hitY) / nd,
    };
  }
  return { hitX, hitY, hitBall: null };
}

function executePoolShot(state: PoolGameState, angle: number, power: number): PoolGameState {
  const startBalls: PoolBall[] = state.balls.map((b) => ({ ...b }));
  const simBalls: PoolBall[] = state.balls.map((b) => ({ ...b }));
  const cue = simBalls.find((b) => b.id === 0);
  if (!cue || cue.pocketed) return state;

  const speed = Math.max(1.2, Math.min(POOL_MAX_SPEED, power));
  cue.vx = Math.cos(angle) * speed;
  cue.vy = Math.sin(angle) * speed;

  const pocketedThisShot: number[] = [];
  for (let frame = 0; frame < 750; frame++) {
    if (!simulatePoolFrame(simBalls, pocketedThisShot)) break;
  }
  for (const b of simBalls) {
    b.vx = 0;
    b.vy = 0;
  }

  const shooter = state.playerUsernames[state.turnIndex];
  const opponentIdx = state.turnIndex === 0 ? 1 : 0;
  const opponent = state.playerUsernames[opponentIdx];
  const shooterKey = shooter.toLowerCase();
  const oppKey = opponent.toLowerCase();
  const groups = { ...state.groups };

  const scratched = pocketedThisShot.includes(0);
  if (scratched) {
    cue.pocketed = false;
    cue.x = 195;
    cue.y = POOL_H / 2;
    cue.vx = 0;
    cue.vy = 0;
  }

  const pocketedEight = pocketedThisShot.includes(8);
  const objectPocketed = pocketedThisShot.filter((id) => id !== 0 && id !== 8);

  if (!groups[shooterKey] && !scratched && objectPocketed.length > 0) {
    const firstId = objectPocketed[0];
    const chosenGroup: 'solids' | 'stripes' = firstId <= 7 ? 'solids' : 'stripes';
    groups[shooterKey] = chosenGroup;
    groups[oppKey] = chosenGroup === 'solids' ? 'stripes' : 'solids';
  }

  const shooterGroup = groups[shooterKey];
  const remainingOwn = simBalls.filter((b) => {
    if (b.pocketed || b.id === 0 || b.id === 8) return false;
    if (shooterGroup === 'solids') return b.id >= 1 && b.id <= 7;
    if (shooterGroup === 'stripes') return b.id >= 9 && b.id <= 15;
    return true;
  }).length;

  let winnerUsername: string | null = null;
  let winReason: string | undefined;
  let nextTurnIndex = state.turnIndex;
  let statusText = '';

  if (pocketedEight) {
    if (!scratched && shooterGroup && remainingOwn === 0) {
      winnerUsername = shooter;
      winReason = `${shooter} legally sank the 8-Ball and won!`;
      statusText = winReason;
    } else {
      winnerUsername = opponent;
      winReason = scratched
        ? `${shooter} scratched on the 8-Ball — ${opponent} wins!`
        : `${shooter} sank the 8-Ball early — ${opponent} wins!`;
      statusText = winReason;
    }
  } else if (scratched) {
    nextTurnIndex = opponentIdx;
    statusText = `Scratch! Cue ball spotted — ${opponent}'s turn`;
  } else {
    const pocketedOwn = objectPocketed.some((id) =>
      shooterGroup === 'solids' ? id <= 7 : shooterGroup === 'stripes' ? id >= 9 : true,
    );
    if (pocketedOwn) {
      nextTurnIndex = state.turnIndex;
      statusText = `${shooter} pocketed a ball and shoots again!`;
    } else {
      nextTurnIndex = opponentIdx;
      statusText = `${opponent}'s turn — pull back on the cue ball to shoot`;
    }
  }

  return {
    balls: simBalls,
    playerUsernames: state.playerUsernames,
    turnIndex: nextTurnIndex,
    groups,
    lastShot: {
      seq: (state.lastShot?.seq ?? 0) + 1,
      shooter,
      angle,
      power: speed,
      startBalls,
    },
    statusText,
    winnerUsername,
    winReason,
  };
}

/* ============================================================================
   GAME 6: QUORIDOR (1v1, 1v1v1, 1v1v1v1 + Interactive Groove Hover & Pawn Animations)
   ============================================================================ */

export interface QuoridorPawn {
  username: string;
  displayName: string;
  seat: number;
  r: number;
  c: number;
  prevR?: number;
  prevC?: number;
  goalType: 'row' | 'col';
  goalTarget: number;
  wallsLeft: number;
  color: string;
}

export interface QuoridorGameState {
  pawns: QuoridorPawn[];
  turnIndex: number;
  hWalls: string[];
  vWalls: string[];
  statusText: string;
  winnerUsername: string | null;
  winReason?: string;
  moveCount?: number;
}

const QUORIDOR_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b'];

export function createInitialQuoridorState(
  players: ActivityPlayerEntry[],
): QuoridorGameState {
  const count = Math.max(2, Math.min(4, players.length));
  const wallsPerPlayer = count === 2 ? 10 : count === 3 ? 6 : 5;
  const configs: Array<{ r: number; c: number; goalType: 'row' | 'col'; goalTarget: number }> = [
    { r: 8, c: 4, goalType: 'row', goalTarget: 0 },
    { r: 0, c: 4, goalType: 'row', goalTarget: 8 },
    { r: 4, c: 0, goalType: 'col', goalTarget: 8 },
    { r: 4, c: 8, goalType: 'col', goalTarget: 0 },
  ];
  const pawns: QuoridorPawn[] = players.slice(0, 4).map((p, idx) => ({
    username: p.username,
    displayName: p.displayName,
    seat: idx,
    r: configs[idx].r,
    c: configs[idx].c,
    goalType: configs[idx].goalType,
    goalTarget: configs[idx].goalTarget,
    wallsLeft: wallsPerPlayer,
    color: QUORIDOR_COLORS[idx] ?? '#ef4444',
  }));

  return {
    pawns,
    turnIndex: 0,
    hWalls: [],
    vWalls: [],
    statusText: `${pawns[0]?.displayName ?? 'Player 1'}'s turn`,
    winnerUsername: null,
    moveCount: 0,
  };
}

function isQuoridorEdgeBlocked(
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  hWallSet: Set<string>,
  vWallSet: Set<string>,
): boolean {
  if (r2 < 0 || r2 >= 9 || c2 < 0 || c2 >= 9) return true;
  if (r1 === r2) {
    const minC = Math.min(c1, c2);
    return vWallSet.has(`${r1},${minC}`) || vWallSet.has(`${r1 - 1},${minC}`);
  }
  if (c1 === c2) {
    const minR = Math.min(r1, r2);
    return hWallSet.has(`${minR},${c1}`) || hWallSet.has(`${minR},${c1 - 1}`);
  }
  return true;
}

function getLegalQuoridorPawnMoves(
  state: QuoridorGameState,
  pawnIndex: number,
): Array<[number, number]> {
  const pawn = state.pawns[pawnIndex];
  if (!pawn) return [];
  const hSet = new Set(state.hWalls);
  const vSet = new Set(state.vWalls);
  const occupied = new Set(
    state.pawns.filter((_, i) => i !== pawnIndex).map((p) => `${p.r},${p.c}`),
  );
  const moves: Array<[number, number]> = [];

  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    const nr = pawn.r + dr;
    const nc = pawn.c + dc;
    if (isQuoridorEdgeBlocked(pawn.r, pawn.c, nr, nc, hSet, vSet)) continue;
    if (!occupied.has(`${nr},${nc}`)) {
      moves.push([nr, nc]);
    } else {
      const jr = nr + dr;
      const jc = nc + dc;
      if (
        !isQuoridorEdgeBlocked(nr, nc, jr, jc, hSet, vSet) &&
        !occupied.has(`${jr},${jc}`)
      ) {
        moves.push([jr, jc]);
      } else {
        const perp: Array<[number, number]> =
          dr !== 0
            ? [
                [0, -1],
                [0, 1],
              ]
            : [
                [-1, 0],
                [1, 0],
              ];
        for (const [pdr, pdc] of perp) {
          const sr = nr + pdr;
          const sc = nc + pdc;
          if (
            !isQuoridorEdgeBlocked(nr, nc, sr, sc, hSet, vSet) &&
            !occupied.has(`${sr},${sc}`)
          ) {
            moves.push([sr, sc]);
          }
        }
      }
    }
  }
  return moves;
}

function hasQuoridorPathToGoal(
  pawn: QuoridorPawn,
  hSet: Set<string>,
  vSet: Set<string>,
): boolean {
  const visited = new Set<string>([`${pawn.r},${pawn.c}`]);
  const queue: Array<[number, number]> = [[pawn.r, pawn.c]];
  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    if (pawn.goalType === 'row' && r === pawn.goalTarget) return true;
    if (pawn.goalType === 'col' && c === pawn.goalTarget) return true;
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nr = r + dr;
      const nc = c + dc;
      const key = `${nr},${nc}`;
      if (!visited.has(key) && !isQuoridorEdgeBlocked(r, c, nr, nc, hSet, vSet)) {
        visited.add(key);
        queue.push([nr, nc]);
      }
    }
  }
  return false;
}

function canPlaceQuoridorWall(
  state: QuoridorGameState,
  orientation: 'h' | 'v',
  r: number,
  c: number,
): boolean {
  if (r < 0 || r >= 8 || c < 0 || c >= 8) return false;
  const key = `${r},${c}`;
  const hSet = new Set(state.hWalls);
  const vSet = new Set(state.vWalls);
  if (orientation === 'h') {
    if (hSet.has(key) || hSet.has(`${r},${c - 1}`) || hSet.has(`${r},${c + 1}`)) return false;
    if (vSet.has(key)) return false;
    hSet.add(key);
  } else {
    if (vSet.has(key) || vSet.has(`${r - 1},${c}`) || vSet.has(`${r + 1},${c}`)) return false;
    if (hSet.has(key)) return false;
    vSet.add(key);
  }
  return state.pawns.every((p) => hasQuoridorPathToGoal(p, hSet, vSet));
}

export function createInitialGameStateForLobby(lobby: ActivityLobby): any {
  switch (lobby.gameId) {
    case 'chess':
      return createInitialChessState(lobby.players);
    case 'checkers':
      return createInitialCheckersState(lobby.players);
    case 'minesweeper':
      return createInitialMinesweeperState(lobby.players);
    case 'vexilloguessr':
      return createInitialVexilloState(
        lobby.players,
        lobby.gameState?.currentFlagCode || lobby.gameState?.lastFlagCode,
      );
    case 'pool':
      return createInitialPoolState(lobby.players);
    case 'quoridor':
      return createInitialQuoridorState(lobby.players);
  }
}

/* ============================================================================
   CHAT-BUBBLE SCROLLABLE TOOLTIP & STREAM-STYLE ACTIVITY STAGE CONTROLLER
   ============================================================================ */

export interface VcActivitiesControllerOptions {
  getSelfProfile: () => PublicProfile | null;
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  sendActivityFrame: (payload: Record<string, unknown>) => void;
  onStateChanged: () => void;
}

export interface VcActivitiesController {
  getRenderRevision: () => number;
  handleLobbyList: (lobbies: ActivityLobby[]) => void;
  handleLobbyUpdate: (lobby: ActivityLobby) => void;
  handleLobbyRemoved: (lobbyId: string) => void;
  getCallLobbies: (threadKey: string) => ActivityLobby[];
  isLobbyWatched: (lobbyId: string) => boolean;
  isStageExpandedForCall: (threadKey: string) => boolean;
  getExpandedStageKey: () => string | null;
  watchLobby: (lobbyId: string, expandBigScreen?: boolean) => void;
  stopWatchingLobby: (lobbyId: string) => void;
  toggleExpandLobby: (lobbyId: string) => void;
  hideExpandedStage: () => void;
  openGameBrowser: (threadKey: string, gameId: ActivityGameId) => void;
  toggleActivitiesBubble: (anchorBtn: HTMLElement, threadKey: string) => void;
  closeActivitiesBubble: () => void;
  renderActivityStageTiles: (
    threadKey: string,
    inThisCall: boolean,
    onRequireJoinCall: (lobbyId: string) => void,
  ) => HTMLElement[];
  renderExpandedActivityStage: (threadKey: string) => HTMLElement | null;
}

export function createVcActivitiesController(
  rawOptions: VcActivitiesControllerOptions,
): VcActivitiesController {
  let renderRevision = 1;
  const options: VcActivitiesControllerOptions = {
    ...rawOptions,
    onStateChanged: () => {
      renderRevision += 1;
      rawOptions.onStateChanged();
    },
  };
  const lobbiesById = new Map<string, ActivityLobby>();
  const watchedLobbyIds = new Set<string>();
  const lastAnimatedMoveKeyByLobby = new Map<string, string>();

  let expandedTarget:
    | { kind: 'browser'; threadKey: string; gameId: ActivityGameId }
    | { kind: 'lobby'; threadKey: string; lobbyId: string }
    | null = null;

  let selectedBoardSquare: [number, number] | null = null;
  let minesweeperFlagMode = false;
  let minesweeperViewTarget: string = 'auto'; // 'auto' | 'split' | usernameLower
  let quoridorTool: 'move' | 'hwall' | 'vwall' = 'move';
  let poolAimAngle = 0;
  let poolAnimatingSeq = 0;
  let lobbyScopeFilter: 'call' | 'public' = 'call';
  let createMaxPlayersDraft = 2;
  let activeBubbleEl: HTMLElement | null = null;
  let activeBubbleCleanup: (() => void) | null = null;

  const getSelfKey = () => (options.getSelfProfile()?.username ?? '').toLowerCase();

  const closeActivitiesBubble = () => {
    if (activeBubbleCleanup) {
      activeBubbleCleanup();
      activeBubbleCleanup = null;
    }
    if (activeBubbleEl) {
      activeBubbleEl.remove();
      activeBubbleEl = null;
    }
  };

  const getCallLobbies = (threadKey: string): ActivityLobby[] => {
    const list: ActivityLobby[] = [];
    for (const lobby of lobbiesById.values()) {
      if (lobby.threadKey === threadKey) {
        list.push(lobby);
      }
    }
    return list.sort((a, b) => a.createdAt - b.createdAt);
  };

  const openGameBrowser = (threadKey: string, gameId: ActivityGameId) => {
    closeActivitiesBubble();
    const meta = getActivityGameMeta(gameId);
    createMaxPlayersDraft = meta.defaultMaxPlayers;
    const selfKey = getSelfKey();
    const existingOwn = getCallLobbies(threadKey).find(
      (l) =>
        l.gameId === gameId &&
        l.players.some((p) => p.username.toLowerCase() === selfKey),
    );
    if (existingOwn) {
      watchedLobbyIds.add(existingOwn.id);
      expandedTarget = { kind: 'lobby', threadKey, lobbyId: existingOwn.id };
      options.onStateChanged();
      return;
    }
    expandedTarget = { kind: 'browser', threadKey, gameId };
    options.onStateChanged();
  };

  const toggleActivitiesBubble = (anchorBtn: HTMLElement, threadKey: string) => {
    if (activeBubbleEl) {
      closeActivitiesBubble();
      return;
    }
    options.sendActivityFrame({ type: 'activity:list' });

    const bubble = document.createElement('div');
    bubble.className = 'vc-activities-bubble';
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-label', 'Voice Call Activities');

    const header = document.createElement('div');
    header.className = 'vc-activities-bubble-head';
    const title = document.createElement('span');
    title.className = 'vc-activities-bubble-title';
    title.textContent = 'Activities — Play in Call';
    const hint = document.createElement('span');
    hint.className = 'vc-activities-bubble-hint';
    hint.textContent = 'Scroll →';
    header.appendChild(title);
    header.appendChild(hint);
    bubble.appendChild(header);

    const stripWrap = document.createElement('div');
    stripWrap.className = 'vc-activities-strip-wrap';

    const scrollStrip = document.createElement('div');
    scrollStrip.className = 'vc-activities-scroll';
    scrollStrip.addEventListener(
      'wheel',
      (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          scrollStrip.scrollLeft += e.deltaY;
        }
      },
      { passive: false },
    );

    const callLobbies = getCallLobbies(threadKey);

    for (const game of ACTIVITY_GAMES) {
      const activeCount = callLobbies.filter((l) => l.gameId === game.id).length;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'vc-activity-logo-card';
      card.dataset.activityGame = game.id;
      card.title = `${game.name} — ${game.tagline}`;

      const iconWrap = document.createElement('div');
      iconWrap.className = 'vc-activity-logo-icon';
      iconWrap.appendChild(createGameLogoSvg(game.id, 42));

      const badge = document.createElement('span');
      badge.className =
        activeCount > 0
          ? 'vc-activity-logo-badge vc-activity-logo-badge--live'
          : 'vc-activity-logo-badge';
      badge.textContent = activeCount > 0 ? `${activeCount} LIVE` : game.badge;
      iconWrap.appendChild(badge);

      const nameEl = document.createElement('span');
      nameEl.className = 'vc-activity-logo-name';
      nameEl.textContent = game.name;

      card.appendChild(iconWrap);
      card.appendChild(nameEl);
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        openGameBrowser(threadKey, game.id);
      });
      scrollStrip.appendChild(card);
    }

    stripWrap.appendChild(scrollStrip);
    bubble.appendChild(stripWrap);
    document.body.appendChild(bubble);
    activeBubbleEl = bubble;

    const positionBubble = () => {
      if (!activeBubbleEl || !anchorBtn.isConnected) {
        closeActivitiesBubble();
        return;
      }
      const rect = anchorBtn.getBoundingClientRect();
      const bRect = bubble.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      let left = centerX - bRect.width / 2;
      left = Math.max(10, Math.min(window.innerWidth - bRect.width - 10, left));
      const aboveTop = rect.top - bRect.height - 12;
      const placeBelow = aboveTop < 12;
      const top = placeBelow ? rect.bottom + 12 : aboveTop;
      bubble.classList.toggle('vc-activities-bubble--below', placeBelow);
      bubble.style.left = `${Math.round(left)}px`;
      bubble.style.top = `${Math.round(top)}px`;
      const arrowOffset = Math.max(22, Math.min(bRect.width - 22, centerX - left));
      bubble.style.setProperty('--vc-bubble-arrow-x', `${Math.round(arrowOffset)}px`);
    };

    positionBubble();

    const onOutsideDown = (e: Event) => {
      const target = e.target as Node | null;
      if (target && (bubble.contains(target) || anchorBtn.contains(target))) {
        return;
      }
      closeActivitiesBubble();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeActivitiesBubble();
    };

    window.addEventListener('pointerdown', onOutsideDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', positionBubble);

    activeBubbleCleanup = () => {
      window.removeEventListener('pointerdown', onOutsideDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', positionBubble);
    };
  };

  /** Renders stream-style Activity preview tiles inside `.vc-top-stage`. */
  const renderActivityStageTiles = (
    threadKey: string,
    inThisCall: boolean,
    onRequireJoinCall: (lobbyId: string) => void,
  ): HTMLElement[] => {
    const callLobbies = getCallLobbies(threadKey);
    const selfKey = getSelfKey();
    const tiles: HTMLElement[] = [];

    for (const lobby of callLobbies) {
      const meta = getActivityGameMeta(lobby.gameId);
      const isWatched = watchedLobbyIds.has(lobby.id);
      const isSelfSeated = lobby.players.some((p) => p.username.toLowerCase() === selfKey);
      const isExpanded =
        expandedTarget?.kind === 'lobby' && expandedTarget.lobbyId === lobby.id;

      const tile = document.createElement('div');
      tile.className = 'vc-screen-share-tile vc-activity-tile';
      tile.dataset.vcActivityTile = lobby.id;
      if (!isWatched) {
        tile.classList.add('vc-screen-share-tile--unwatched');
      }
      if (isExpanded) {
        tile.classList.add('vc-screen-share-tile--expanded');
      }

      const thumbBox = document.createElement('div');
      thumbBox.className = isWatched
        ? 'vc-screen-thumb-box vc-activity-thumb-box'
        : 'vc-screen-thumb-box vc-screen-thumb-box--unwatched vc-activity-thumb-box';

      const artBg = document.createElement('div');
      artBg.className = isWatched
        ? 'vc-activity-thumb-art'
        : 'vc-activity-thumb-art vc-activity-thumb-art--blurred';
      artBg.style.setProperty('--activity-accent', meta.accent);
      artBg.appendChild(createGameLogoSvg(lobby.gameId, 38));
      const statusSub = document.createElement('div');
      statusSub.className = 'vc-activity-thumb-meta';
      statusSub.textContent =
        lobby.status === 'playing'
          ? `In Match · ${lobby.players.length}/${lobby.maxPlayers}P`
          : `Lobby · ${lobby.players.length}/${lobby.maxPlayers}P`;
      artBg.appendChild(statusSub);
      thumbBox.appendChild(artBg);

      const livePill = document.createElement('span');
      livePill.className = 'vc-screen-live-pill vc-activity-live-pill';
      livePill.textContent = isSelfSeated
        ? 'PLAYING'
        : lobby.status === 'playing'
          ? 'LIVE'
          : 'LOBBY';
      thumbBox.appendChild(livePill);

      const openThisLobby = () => {
        if (!inThisCall) {
          watchedLobbyIds.add(lobby.id);
          expandedTarget = { kind: 'lobby', threadKey, lobbyId: lobby.id };
          onRequireJoinCall(lobby.id);
          return;
        }
        watchedLobbyIds.add(lobby.id);
        expandedTarget = { kind: 'lobby', threadKey, lobbyId: lobby.id };
        options.onStateChanged();
      };

      if (!isWatched) {
        const watchOverlay = document.createElement('div');
        watchOverlay.className = 'vc-screen-watch-overlay';
        const watchBtn = document.createElement('button');
        watchBtn.type = 'button';
        watchBtn.className = 'vc-screen-watch-btn';
        watchBtn.dataset.vcRole = 'watch-activity';
        watchBtn.textContent =
          lobby.status === 'waiting' && lobby.players.length < lobby.maxPlayers
            ? 'Join / Watch'
            : 'Watch';
        watchBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openThisLobby();
        });
        watchOverlay.appendChild(watchBtn);
        thumbBox.appendChild(watchOverlay);
      }

      thumbBox.addEventListener('click', () => {
        if (!isWatched) {
          openThisLobby();
        } else if (isExpanded) {
          expandedTarget = null;
          options.onStateChanged();
        } else {
          expandedTarget = { kind: 'lobby', threadKey, lobbyId: lobby.id };
          options.onStateChanged();
        }
      });

      const label = document.createElement('div');
      label.className = 'vc-tile-name';
      label.textContent = `${meta.name} · ${lobby.title}`;

      tile.appendChild(thumbBox);
      tile.appendChild(label);
      tiles.push(tile);
    }

    return tiles;
  };

  /** Renders the Lobby Browser view for a selected game. */
  const renderGameBrowserView = (
    threadKey: string,
    gameId: ActivityGameId,
  ): HTMLElement => {
    const meta = getActivityGameMeta(gameId);
    const selfKey = getSelfKey();
    const wrap = document.createElement('div');
    wrap.className = 'vc-activity-browser';

    const gameStrip = document.createElement('div');
    gameStrip.className = 'vc-activity-stage-gametabs';
    for (const g of ACTIVITY_GAMES) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className =
        g.id === gameId
          ? 'vc-activity-gametab vc-activity-gametab--active'
          : 'vc-activity-gametab';
      tab.appendChild(createGameLogoSvg(g.id, 20));
      const tSpan = document.createElement('span');
      tSpan.textContent = g.name;
      tab.appendChild(tSpan);
      tab.addEventListener('click', () => {
        createMaxPlayersDraft = g.defaultMaxPlayers;
        expandedTarget = { kind: 'browser', threadKey, gameId: g.id };
        options.onStateChanged();
      });
      gameStrip.appendChild(tab);
    }
    wrap.appendChild(gameStrip);

    const createBar = document.createElement('div');
    createBar.className = 'vc-activity-create-bar';

    const heroInfo = document.createElement('div');
    heroInfo.className = 'vc-activity-hero-info';
    heroInfo.appendChild(createGameLogoSvg(gameId, 44));
    const heroText = document.createElement('div');
    const hTitle = document.createElement('div');
    hTitle.className = 'vc-activity-hero-title';
    hTitle.textContent = `${meta.name} Online Lobbies`;
    const hSub = document.createElement('div');
    hSub.className = 'vc-activity-hero-sub';
    hSub.textContent = meta.tagline;
    heroText.appendChild(hTitle);
    heroText.appendChild(hSub);
    heroInfo.appendChild(heroText);
    createBar.appendChild(heroInfo);

    const createActions = document.createElement('div');
    createActions.className = 'vc-activity-create-actions';

    if (meta.allowedPlayerCounts.length > 1) {
      const modeGroup = document.createElement('div');
      modeGroup.className = 'vc-activity-mode-pills';
      for (const count of meta.allowedPlayerCounts) {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className =
          createMaxPlayersDraft === count
            ? 'vc-activity-mode-pill vc-activity-mode-pill--active'
            : 'vc-activity-mode-pill';
        pill.textContent =
          count === 2 ? '1v1 (2P)' : count === 3 ? '1v1v1 (3P)' : '1v1v1v1 (4P)';
        pill.addEventListener('click', () => {
          createMaxPlayersDraft = count;
          options.onStateChanged();
        });
        modeGroup.appendChild(pill);
      }
      createActions.appendChild(modeGroup);
    }

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'btn-primary vc-activity-create-btn';
    createBtn.textContent = `+ Create ${meta.name} Lobby`;
    createBtn.addEventListener('click', () => {
      const selfProf = options.getSelfProfile();
      options.sendActivityFrame({
        type: 'activity:create',
        gameId,
        threadKey,
        maxPlayers: createMaxPlayersDraft,
        isPublic: true,
        title: `${selfProf?.displayName ?? 'Player'}'s ${meta.name}`,
      });
    });
    createActions.appendChild(createBtn);
    createBar.appendChild(createActions);
    wrap.appendChild(createBar);

    const filterRow = document.createElement('div');
    filterRow.className = 'vc-activity-filter-row';
    for (const scope of ['call', 'public'] as const) {
      const fBtn = document.createElement('button');
      fBtn.type = 'button';
      fBtn.className =
        lobbyScopeFilter === scope
          ? 'vc-activity-filter-btn vc-activity-filter-btn--active'
          : 'vc-activity-filter-btn';
      fBtn.textContent =
        scope === 'call' ? 'In This Voice Call' : 'All Online Public Lobbies';
      fBtn.addEventListener('click', () => {
        lobbyScopeFilter = scope;
        options.sendActivityFrame({ type: 'activity:list' });
        options.onStateChanged();
      });
      filterRow.appendChild(fBtn);
    }
    wrap.appendChild(filterRow);

    const matchingLobbies = Array.from(lobbiesById.values()).filter(
      (l) =>
        l.gameId === gameId &&
        (lobbyScopeFilter === 'public'
          ? l.isPublic || l.threadKey === threadKey
          : l.threadKey === threadKey),
    );

    const listEl = document.createElement('div');
    listEl.className = 'vc-activity-lobby-list';

    if (matchingLobbies.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'vc-activity-lobby-empty';
      empty.textContent = `No active ${meta.name} lobbies yet. Click "+ Create ${meta.name} Lobby" above to start one!`;
      listEl.appendChild(empty);
    } else {
      for (const lobby of matchingLobbies) {
        const row = document.createElement('div');
        row.className = 'vc-activity-lobby-card';

        const left = document.createElement('div');
        left.className = 'vc-activity-lobby-info';
        const lTitle = document.createElement('div');
        lTitle.className = 'vc-activity-lobby-title';
        lTitle.textContent = `${lobby.title} (${lobby.players.length}/${lobby.maxPlayers})`;
        const lPlayers = document.createElement('div');
        lPlayers.className = 'vc-activity-lobby-players';
        lPlayers.textContent =
          lobby.players.map((p) => `${p.displayName} (${p.wins}W)`).join(' vs ') ||
          'Waiting for players';
        left.appendChild(lTitle);
        left.appendChild(lPlayers);

        const right = document.createElement('div');
        right.className = 'vc-activity-lobby-btns';
        const isSeated = lobby.players.some((p) => p.username.toLowerCase() === selfKey);
        const canJoinSeat =
          !isSeated &&
          lobby.players.length < lobby.maxPlayers &&
          lobby.status === 'waiting';

        if (isSeated) {
          const resumeBtn = document.createElement('button');
          resumeBtn.type = 'button';
          resumeBtn.className = 'btn-primary vc-activity-sm-btn';
          resumeBtn.textContent = 'Resume Game';
          resumeBtn.addEventListener('click', () => {
            watchedLobbyIds.add(lobby.id);
            expandedTarget = { kind: 'lobby', threadKey, lobbyId: lobby.id };
            options.onStateChanged();
          });
          right.appendChild(resumeBtn);
        } else if (canJoinSeat) {
          const joinBtn = document.createElement('button');
          joinBtn.type = 'button';
          joinBtn.className = 'btn-primary vc-activity-sm-btn';
          joinBtn.textContent = 'Join Match';
          joinBtn.addEventListener('click', () => {
            watchedLobbyIds.add(lobby.id);
            expandedTarget = { kind: 'lobby', threadKey, lobbyId: lobby.id };
            options.sendActivityFrame({
              type: 'activity:join',
              lobbyId: lobby.id,
              asSpectator: false,
            });
          });
          right.appendChild(joinBtn);
        }

        const specBtn = document.createElement('button');
        specBtn.type = 'button';
        specBtn.className = 'btn-secondary vc-activity-sm-btn';
        specBtn.textContent = 'Watch';
        specBtn.addEventListener('click', () => {
          watchedLobbyIds.add(lobby.id);
          expandedTarget = { kind: 'lobby', threadKey, lobbyId: lobby.id };
          if (!isSeated) {
            options.sendActivityFrame({
              type: 'activity:join',
              lobbyId: lobby.id,
              asSpectator: true,
            });
          }
          options.onStateChanged();
        });
        right.appendChild(specBtn);

        row.appendChild(left);
        row.appendChild(right);
        listEl.appendChild(row);
      }
    }

    wrap.appendChild(listEl);
    return wrap;
  };

  /* ==========================================================================
     RENDER INDIVIDUAL GAME BOARDS INSIDE ACTIVE LOBBY
     ========================================================================== */

  const renderChessBoard = (lobby: ActivityLobby, selfKey: string): HTMLElement => {
    const state: ChessGameState =
      lobby.gameState ?? createInitialChessState(lobby.players);
    const wrap = document.createElement('div');
    wrap.className = 'vc-game-board-wrap';

    const isWhite = state.whiteUsername.toLowerCase() === selfKey;
    const isBlack = state.blackUsername.toLowerCase() === selfKey;
    const isMyTurn =
      !state.winnerUsername &&
      state.winnerUsername !== '' &&
      ((state.turn === 'w' && isWhite) || (state.turn === 'b' && isBlack));
    const flipBoard = isBlack && !isWhite;

    const statusBanner = document.createElement('div');
    statusBanner.className = 'vc-game-status-banner';
    statusBanner.textContent = state.statusText;
    wrap.appendChild(statusBanner);

    // Compute material advantage for side captured trays
    const whiteCaptures = (state.capturedByWhite || []).filter(Boolean) as NonNullable<ChessPiece>[];
    const blackCaptures = (state.capturedByBlack || []).filter(Boolean) as NonNullable<ChessPiece>[];
    const whiteScore = whiteCaptures.reduce((acc, p) => acc + (CHESS_PIECE_VALUES[p[1] as ChessPieceType] ?? 0), 0);
    const blackScore = blackCaptures.reduce((acc, p) => acc + (CHESS_PIECE_VALUES[p[1] as ChessPieceType] ?? 0), 0);

    const flankLayout = document.createElement('div');
    flankLayout.className = 'vc-board-flank-layout';

    const buildCapturedSideTray = (
      titleLabel: string,
      playerUsername: string,
      isTurnNow: boolean,
      capturedList: NonNullable<ChessPiece>[],
      materialDiff: number,
    ) => {
      const tray = document.createElement('div');
      tray.className = isTurnNow
        ? 'vc-captured-side-tray vc-captured-side-tray--active'
        : 'vc-captured-side-tray';

      const head = document.createElement('div');
      head.className = 'vc-captured-tray-head';
      const sideTag = document.createElement('span');
      sideTag.className = 'vc-captured-tray-side';
      sideTag.textContent = titleLabel;
      const pName = document.createElement('span');
      pName.className = 'vc-captured-tray-player';
      const playerEntry = lobby.players.find(
        (p) => p.username.toLowerCase() === playerUsername.toLowerCase(),
      );
      pName.textContent = playerEntry?.displayName ?? playerUsername;
      head.appendChild(sideTag);
      head.appendChild(pName);
      if (materialDiff > 0) {
        const adv = document.createElement('span');
        adv.className = 'vc-captured-tray-adv';
        adv.textContent = `+${materialDiff}`;
        head.appendChild(adv);
      }
      tray.appendChild(head);

      const subLabel = document.createElement('div');
      subLabel.className = 'vc-captured-tray-label';
      subLabel.textContent = 'Taken Pieces';
      tray.appendChild(subLabel);

      const piecesBox = document.createElement('div');
      piecesBox.className = 'vc-captured-pieces-grid';
      if (capturedList.length === 0) {
        const none = document.createElement('span');
        none.className = 'vc-captured-empty';
        none.textContent = 'None yet';
        piecesBox.appendChild(none);
      } else {
        const order: Record<ChessPieceType, number> = { Q: 1, R: 2, B: 3, N: 4, P: 5, K: 0 };
        const sorted = [...capturedList].sort(
          (a, b) => (order[a[1] as ChessPieceType] ?? 9) - (order[b[1] as ChessPieceType] ?? 9),
        );
        for (const cp of sorted) {
          const slot = document.createElement('span');
          slot.className = 'vc-captured-piece-icon';
          slot.appendChild(createChessPieceSvg(cp, 22));
          piecesBox.appendChild(slot);
        }
      }
      tray.appendChild(piecesBox);
      return tray;
    };

    // Left Tray: White's captured pieces; Right Tray: Black's captured pieces
    flankLayout.appendChild(
      buildCapturedSideTray(
        '⚪ WHITE',
        state.whiteUsername,
        state.turn === 'w' && !state.winnerUsername,
        whiteCaptures,
        whiteScore - blackScore,
      ),
    );

    const grid = document.createElement('div');
    grid.className = 'vc-chess-grid';

    const legalForSelected =
      selectedBoardSquare && isMyTurn
        ? getLegalChessMoves(state, selectedBoardSquare[0], selectedBoardSquare[1])
        : [];

    const moveKey = state.lastMove
      ? `${state.moveCount}:${state.lastMove.from[0]},${state.lastMove.from[1]}->${state.lastMove.to[0]},${state.lastMove.to[1]}`
      : '';
    const shouldAnimateLastMove =
      Boolean(moveKey) && lastAnimatedMoveKeyByLobby.get(lobby.id) !== moveKey;
    if (shouldAnimateLastMove) {
      lastAnimatedMoveKeyByLobby.set(lobby.id, moveKey);
    }

    const files = 'abcdefgh';

    for (let vr = 0; vr < 8; vr++) {
      for (let vc = 0; vc < 8; vc++) {
        const r = flipBoard ? 7 - vr : vr;
        const c = flipBoard ? 7 - vc : vc;
        const piece = state.board[r]?.[c];
        const isLight = (r + c) % 2 === 0;
        const isSelected =
          selectedBoardSquare?.[0] === r && selectedBoardSquare?.[1] === c;
        const isLegalDest = legalForSelected.some(
          (m) => m.to[0] === r && m.to[1] === c,
        );
        const isLastFrom =
          state.lastMove?.from[0] === r && state.lastMove?.from[1] === c;
        const isLastTo =
          state.lastMove?.to[0] === r && state.lastMove?.to[1] === c;
        const isCheckedKing = piece === `${state.inCheck}K`;

        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = `vc-chess-cell ${isLight ? 'vc-chess-cell--light' : 'vc-chess-cell--dark'}`;
        if (isSelected) cell.classList.add('vc-chess-cell--selected');
        if (isLegalDest) {
          cell.classList.add(piece ? 'vc-chess-cell--legal-capture' : 'vc-chess-cell--legal');
        }
        if (isLastFrom || isLastTo) cell.classList.add('vc-chess-cell--last');
        if (isCheckedKing) cell.classList.add('vc-chess-cell--check');

        // Rank numbers (1-8) along the left edge of the board
        if (vc === 0) {
          const rankTag = document.createElement('span');
          rankTag.className = 'vc-board-coord vc-board-coord--rank';
          rankTag.textContent = String(8 - r);
          cell.appendChild(rankTag);
        }
        // File letters (a-h) along the bottom edge of the board
        if (vr === 7) {
          const fileTag = document.createElement('span');
          fileTag.className = 'vc-board-coord vc-board-coord--file';
          fileTag.textContent = files[c] ?? '';
          cell.appendChild(fileTag);
        }

        if (piece) {
          const pWrap = document.createElement('span');
          pWrap.className = 'vc-chess-piece-svg-wrap';
          if (shouldAnimateLastMove && isLastTo && state.lastMove) {
            const fromVr = flipBoard ? 7 - state.lastMove.from[0] : state.lastMove.from[0];
            const fromVc = flipBoard ? 7 - state.lastMove.from[1] : state.lastMove.from[1];
            pWrap.classList.add('vc-piece-sliding');
            pWrap.style.setProperty('--slide-from-x', `${(fromVc - vc) * 100}%`);
            pWrap.style.setProperty('--slide-from-y', `${(fromVr - vr) * 100}%`);
          }
          pWrap.appendChild(createChessPieceSvg(piece, 34));
          cell.appendChild(pWrap);
        }

        cell.addEventListener('click', () => {
          if (!isMyTurn) return;
          if (selectedBoardSquare && isLegalDest) {
            const nextState = applyChessMove(state, selectedBoardSquare, [r, c], 'Q');
            selectedBoardSquare = null;
            if (nextState) {
              const isDone = nextState.winnerUsername !== null;
              options.sendActivityFrame({
                type: 'activity:action',
                lobbyId: lobby.id,
                gameState: nextState,
                status: isDone ? 'finished' : 'playing',
                winnerUsername: nextState.winnerUsername || undefined,
              });
            }
            return;
          }
          if (piece && piece[0] === state.turn) {
            selectedBoardSquare = [r, c];
          } else {
            selectedBoardSquare = null;
          }
          options.onStateChanged();
        });

        grid.appendChild(cell);
      }
    }

    flankLayout.appendChild(grid);

    flankLayout.appendChild(
      buildCapturedSideTray(
        '⚫ BLACK',
        state.blackUsername,
        state.turn === 'b' && !state.winnerUsername,
        blackCaptures,
        blackScore - whiteScore,
      ),
    );

    wrap.appendChild(flankLayout);
    return wrap;
  };

  const renderCheckersBoard = (lobby: ActivityLobby, selfKey: string): HTMLElement => {
    const state: CheckersGameState =
      lobby.gameState ?? createInitialCheckersState(lobby.players);
    const wrap = document.createElement('div');
    wrap.className = 'vc-game-board-wrap';

    const isRed = state.redUsername.toLowerCase() === selfKey;
    const isBlack = state.blackUsername.toLowerCase() === selfKey;
    const isMyTurn =
      !state.winnerUsername &&
      ((state.turn === 'r' && isRed) || (state.turn === 'b' && isBlack));
    const flipBoard = isBlack && !isRed;

    if (state.mustContinueFrom && isMyTurn) {
      selectedBoardSquare = state.mustContinueFrom;
    }

    const statusBanner = document.createElement('div');
    statusBanner.className = 'vc-game-status-banner';
    statusBanner.textContent = state.statusText;
    wrap.appendChild(statusBanner);

    const flankLayout = document.createElement('div');
    flankLayout.className = 'vc-board-flank-layout';

    const buildCheckerSideTray = (
      titleLabel: string,
      playerUsername: string,
      isTurnNow: boolean,
      capturedCount: number,
      capturedColorClass: 'r' | 'b',
    ) => {
      const tray = document.createElement('div');
      tray.className = isTurnNow
        ? 'vc-captured-side-tray vc-captured-side-tray--active'
        : 'vc-captured-side-tray';

      const head = document.createElement('div');
      head.className = 'vc-captured-tray-head';
      const sideTag = document.createElement('span');
      sideTag.className = 'vc-captured-tray-side';
      sideTag.textContent = titleLabel;
      const pName = document.createElement('span');
      pName.className = 'vc-captured-tray-player';
      const playerEntry = lobby.players.find(
        (p) => p.username.toLowerCase() === playerUsername.toLowerCase(),
      );
      pName.textContent = playerEntry?.displayName ?? playerUsername;
      head.appendChild(sideTag);
      head.appendChild(pName);
      tray.appendChild(head);

      const subLabel = document.createElement('div');
      subLabel.className = 'vc-captured-tray-label';
      subLabel.textContent = `Taken (${capturedCount}/12)`;
      tray.appendChild(subLabel);

      const piecesBox = document.createElement('div');
      piecesBox.className = 'vc-captured-pieces-grid';
      if (capturedCount === 0) {
        const none = document.createElement('span');
        none.className = 'vc-captured-empty';
        none.textContent = 'None yet';
        piecesBox.appendChild(none);
      } else {
        for (let i = 0; i < capturedCount; i++) {
          const mini = document.createElement('span');
          mini.className = `vc-captured-checker-mini vc-captured-checker-mini--${capturedColorClass}`;
          piecesBox.appendChild(mini);
        }
      }
      tray.appendChild(piecesBox);
      return tray;
    };

    flankLayout.appendChild(
      buildCheckerSideTray(
        '🔴 RED',
        state.redUsername,
        state.turn === 'r' && !state.winnerUsername,
        state.redCaptured,
        'b',
      ),
    );

    const grid = document.createElement('div');
    grid.className = 'vc-chess-grid';

    const legalForSelected =
      selectedBoardSquare && isMyTurn
        ? getCheckerLegalMovesForSquare(state, selectedBoardSquare[0], selectedBoardSquare[1])
        : [];

    const moveKey = state.lastMove
      ? `${state.moveCount ?? 0}:${state.lastMove.from[0]},${state.lastMove.from[1]}->${state.lastMove.to[0]},${state.lastMove.to[1]}`
      : '';
    const shouldAnimateLastMove =
      Boolean(moveKey) && lastAnimatedMoveKeyByLobby.get(lobby.id) !== moveKey;
    if (shouldAnimateLastMove) {
      lastAnimatedMoveKeyByLobby.set(lobby.id, moveKey);
    }

    const files = 'abcdefgh';

    for (let vr = 0; vr < 8; vr++) {
      for (let vc = 0; vc < 8; vc++) {
        const r = flipBoard ? 7 - vr : vr;
        const c = flipBoard ? 7 - vc : vc;
        const piece = state.board[r]?.[c];
        const isLight = (r + c) % 2 === 0;
        const isSelected =
          selectedBoardSquare?.[0] === r && selectedBoardSquare?.[1] === c;
        const isLegalDest = legalForSelected.some(
          (m) => m.to[0] === r && m.to[1] === c,
        );
        const isLastFrom =
          state.lastMove?.from[0] === r && state.lastMove?.from[1] === c;
        const isLastTo =
          state.lastMove?.to[0] === r && state.lastMove?.to[1] === c;

        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = `vc-chess-cell ${isLight ? 'vc-chess-cell--light' : 'vc-chess-cell--dark'}`;
        if (isSelected) cell.classList.add('vc-chess-cell--selected');
        if (isLegalDest) cell.classList.add('vc-chess-cell--legal');
        if (isLastFrom || isLastTo) cell.classList.add('vc-chess-cell--last');

        if (vc === 0) {
          const rankTag = document.createElement('span');
          rankTag.className = 'vc-board-coord vc-board-coord--rank';
          rankTag.textContent = String(8 - r);
          cell.appendChild(rankTag);
        }
        if (vr === 7) {
          const fileTag = document.createElement('span');
          fileTag.className = 'vc-board-coord vc-board-coord--file';
          fileTag.textContent = files[c] ?? '';
          cell.appendChild(fileTag);
        }

        if (piece) {
          const disc = document.createElement('span');
          const pColor = piece.toLowerCase();
          const isKing = piece === 'R' || piece === 'B';
          disc.className = `vc-checker-disc vc-checker-disc--${pColor}${isKing ? ' vc-checker-disc--king' : ''}`;
          if (shouldAnimateLastMove && isLastTo && state.lastMove) {
            const fromVr = flipBoard ? 7 - state.lastMove.from[0] : state.lastMove.from[0];
            const fromVc = flipBoard ? 7 - state.lastMove.from[1] : state.lastMove.from[1];
            disc.className += ' vc-piece-sliding';
            disc.style.setProperty('--slide-from-x', `${(fromVc - vc) * 100}%`);
            disc.style.setProperty('--slide-from-y', `${(fromVr - vr) * 100}%`);
          }
          if (isKing) disc.textContent = '♛';
          cell.appendChild(disc);
        }

        cell.addEventListener('click', () => {
          if (!isMyTurn) return;
          if (selectedBoardSquare && isLegalDest) {
            const nextState = applyCheckersMove(state, selectedBoardSquare, [r, c]);
            if (nextState) {
              selectedBoardSquare = nextState.mustContinueFrom;
              const isDone = Boolean(nextState.winnerUsername);
              options.sendActivityFrame({
                type: 'activity:action',
                lobbyId: lobby.id,
                gameState: nextState,
                status: isDone ? 'finished' : 'playing',
                winnerUsername: nextState.winnerUsername || undefined,
              });
            }
            return;
          }
          if (state.mustContinueFrom) return;
          if (piece && piece.toLowerCase() === state.turn) {
            selectedBoardSquare = [r, c];
          } else {
            selectedBoardSquare = null;
          }
          options.onStateChanged();
        });

        grid.appendChild(cell);
      }
    }

    flankLayout.appendChild(grid);
    flankLayout.appendChild(
      buildCheckerSideTray(
        '⚫ BLACK',
        state.blackUsername,
        state.turn === 'b' && !state.winnerUsername,
        state.blackCaptured,
        'r',
      ),
    );

    wrap.appendChild(flankLayout);
    return wrap;
  };

  const renderMinesweeperBoard = (lobby: ActivityLobby, selfKey: string): HTMLElement => {
    const state: MinesweeperGameState =
      lobby.gameState ?? createInitialMinesweeperState(lobby.players);
    const wrap = document.createElement('div');
    wrap.className = 'vc-game-board-wrap';

    const isSeated = lobby.players.some((p) => p.username.toLowerCase() === selfKey);
    const totalSafe = state.rows * state.cols - state.mineCount;
    const mineSet = new Set(state.mines ?? []);

    // Determine which board(s) to display:
    // - If spectator (!isSeated), default to 'split' so spectators watch ALL players' live boards side-by-side!
    // - Any user (player or spectator) can also click a player tab or 'Split-Screen All' to watch live progress!
    const effectiveView =
      minesweeperViewTarget === 'auto'
        ? isSeated
          ? selfKey
          : 'split'
        : minesweeperViewTarget;

    const switcherBar = document.createElement('div');
    switcherBar.className = 'vc-mine-race-bar';

    const splitTab = document.createElement('button');
    splitTab.type = 'button';
    splitTab.className =
      effectiveView === 'split'
        ? 'vc-mine-player-chip vc-mine-player-chip--active'
        : 'vc-mine-player-chip';
    splitTab.textContent = '👁️ Split-Screen (Watch All Live)';
    splitTab.addEventListener('click', () => {
      minesweeperViewTarget = 'split';
      options.onStateChanged();
    });
    switcherBar.appendChild(splitTab);

    for (const p of lobby.players) {
      const pKey = p.username.toLowerCase();
      const pb = state.playerBoards?.[pKey] ?? { revealed: [], flagged: [], status: 'playing' };
      const pct = Math.min(100, Math.round(((pb.revealed?.length ?? 0) / totalSafe) * 100));
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `vc-mine-player-chip vc-mine-player-chip--${pb.status}${effectiveView === pKey ? ' vc-mine-player-chip--active' : ''}`;
      chip.textContent = `${pKey === selfKey ? '★ You' : p.displayName}: 🚩 ${pb.flagged?.length ?? 0}/${state.mineCount} · ${pct}%${pb.status === 'exploded' ? ' 💥' : pb.status === 'won' ? ' 🏆' : ''}`;
      chip.addEventListener('click', () => {
        minesweeperViewTarget = pKey;
        options.onStateChanged();
      });
      switcherBar.appendChild(chip);
    }
    wrap.appendChild(switcherBar);

    if (isSeated) {
      const toolRow = document.createElement('div');
      toolRow.className = 'vc-mine-tool-row';
      const modeBtn = document.createElement('button');
      modeBtn.type = 'button';
      modeBtn.className = minesweeperFlagMode
        ? 'vc-activity-mode-pill vc-activity-mode-pill--active'
        : 'vc-activity-mode-pill';
      modeBtn.textContent = minesweeperFlagMode
        ? '🚩 Flag Mode Active (Click/Tap to Flag)'
        : '⛏️ Dig Mode Active (Right-click or Toggle to Flag)';
      modeBtn.addEventListener('click', () => {
        minesweeperFlagMode = !minesweeperFlagMode;
        options.onStateChanged();
      });
      toolRow.appendChild(modeBtn);
      wrap.appendChild(toolRow);
    }

    const handleOwnCellAction = (idx: number, isFlagAction: boolean) => {
      if (!isSeated) return;
      const myBoard: MinesweeperPlayerBoard = state.playerBoards?.[selfKey] ?? {
        revealed: [],
        flagged: [],
        status: 'playing',
      };
      if (Boolean(state.winnerUsername) || myBoard.status !== 'playing') return;

      let minesList = state.mines;
      if (!minesList) {
        minesList = generateMinesFromSeed(
          state.rows,
          state.cols,
          state.mineCount,
          state.seed,
          idx,
        );
      }
      const curMineSet = new Set(minesList);
      const nextRev = new Set(myBoard.revealed ?? []);
      const nextFlag = new Set(myBoard.flagged ?? []);
      let nextStatus: 'playing' | 'won' | 'exploded' = 'playing';
      let explodedIndex: number | undefined;

      if (isFlagAction) {
        if (nextRev.has(idx)) return;
        if (nextFlag.has(idx)) nextFlag.delete(idx);
        else nextFlag.add(idx);
      } else if (nextRev.has(idx)) {
        // Number chording: if clicking a revealed number whose adjacent flag count matches, reveal unflagged neighbors!
        const adjMines = countAdjacentMines(idx, state.rows, state.cols, curMineSet);
        if (adjMines <= 0) return;
        const r = Math.floor(idx / state.cols);
        const c = idx % state.cols;
        const neighbors: number[] = [];
        let flaggedNeighbors = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
              const nIdx = nr * state.cols + nc;
              neighbors.push(nIdx);
              if (nextFlag.has(nIdx)) flaggedNeighbors += 1;
            }
          }
        }
        if (flaggedNeighbors !== adjMines) return;
        for (const nIdx of neighbors) {
          if (nextFlag.has(nIdx) || nextRev.has(nIdx)) continue;
          if (curMineSet.has(nIdx)) {
            nextStatus = 'exploded';
            explodedIndex = nIdx;
            for (const m of curMineSet) nextRev.add(m);
            break;
          }
          floodRevealMinesweeper(nIdx, state.rows, state.cols, curMineSet, nextRev, nextFlag);
        }
      } else {
        if (nextFlag.has(idx)) return;
        if (curMineSet.has(idx)) {
          nextStatus = 'exploded';
          explodedIndex = idx;
          for (const m of curMineSet) nextRev.add(m);
        } else {
          floodRevealMinesweeper(
            idx,
            state.rows,
            state.cols,
            curMineSet,
            nextRev,
            nextFlag,
          );
        }
      }

      const allMinesFlagged =
        nextFlag.size === state.mineCount &&
        Array.from(nextFlag).every((f) => curMineSet.has(f));
      const allSafeRevealed = nextRev.size >= totalSafe && nextStatus !== 'exploded';
      if (allMinesFlagged || allSafeRevealed) {
        nextStatus = 'won';
      }

      const nextPlayerBoard: MinesweeperPlayerBoard = {
        revealed: Array.from(nextRev),
        flagged: Array.from(nextFlag),
        status: nextStatus,
        explodedIndex,
      };

      let winnerUsername = state.winnerUsername;
      let winReason = state.winReason;
      const selfProf = options.getSelfProfile();

      if (nextStatus === 'won') {
        winnerUsername = selfProf?.username ?? selfKey;
        winReason = `${selfProf?.displayName ?? selfKey} flagged/cleared all mines first and won!`;
      } else if (nextStatus === 'exploded') {
        const opponent = lobby.players.find((p) => p.username.toLowerCase() !== selfKey);
        winnerUsername = opponent?.username ?? selfKey;
        winReason = `${selfProf?.displayName ?? selfKey} hit a mine! ${opponent?.displayName ?? 'Opponent'} wins!`;
      }

      options.sendActivityFrame({
        type: 'activity:action',
        lobbyId: lobby.id,
        playerBoardPatch: nextPlayerBoard,
        gameStatePatch: {
          mines: minesList,
          winnerUsername,
          winReason,
        },
        status: winnerUsername ? 'finished' : 'playing',
        winnerUsername: winnerUsername || undefined,
      });
    };

    const buildPlayerGridCard = (player: ActivityPlayerEntry, compact: boolean) => {
      const pKey = player.username.toLowerCase();
      const isOwnBoard = pKey === selfKey && isSeated;
      const pb: MinesweeperPlayerBoard = state.playerBoards?.[pKey] ?? {
        revealed: [],
        flagged: [],
        status: 'playing',
      };
      const revSet = new Set(pb.revealed ?? []);
      const flagSet = new Set(pb.flagged ?? []);

      const card = document.createElement('div');
      card.className = compact
        ? 'vc-mine-board-card vc-mine-board-card--compact'
        : 'vc-mine-board-card';

      const cardHeader = document.createElement('div');
      cardHeader.className = 'vc-mine-board-header';
      const nameEl = document.createElement('span');
      nameEl.className = 'vc-mine-board-owner';
      nameEl.textContent = isOwnBoard
        ? `${player.displayName} (Your Board)`
        : `${player.displayName}'s Live Board`;
      const countEl = document.createElement('span');
      countEl.className = 'vc-mine-board-counter';
      const minesLeft = Math.max(0, state.mineCount - flagSet.size);
      countEl.textContent = `💣 ${minesLeft} Left · ${revSet.size}/${totalSafe} Cleared`;
      cardHeader.appendChild(nameEl);
      cardHeader.appendChild(countEl);
      card.appendChild(cardHeader);

      const grid = document.createElement('div');
      grid.className = compact ? 'vc-mine-grid vc-mine-grid--compact' : 'vc-mine-grid';
      grid.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;

      for (let idx = 0; idx < state.rows * state.cols; idx++) {
        const isRev = revSet.has(idx);
        const isFlag = flagSet.has(idx);
        const isMine = mineSet.has(idx);
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'vc-mine-cell';

        if (isRev) {
          cell.classList.add('vc-mine-cell--revealed');
          if (isMine) {
            cell.classList.add('vc-mine-cell--mine');
            cell.textContent = '💣';
          } else {
            const adj = countAdjacentMines(idx, state.rows, state.cols, mineSet);
            if (adj > 0) {
              cell.textContent = String(adj);
              cell.dataset.adj = String(adj);
            }
          }
        } else if (isFlag) {
          cell.classList.add('vc-mine-cell--flagged');
          cell.textContent = '🚩';
        }

        if (isOwnBoard) {
          cell.addEventListener('click', () => {
            handleOwnCellAction(idx, minesweeperFlagMode);
          });
          cell.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            handleOwnCellAction(idx, true);
          });
        } else {
          cell.disabled = true;
        }
        grid.appendChild(cell);
      }

      card.appendChild(grid);
      return card;
    };

    if (effectiveView === 'split') {
      const splitContainer = document.createElement('div');
      splitContainer.className = 'vc-mine-split-container';
      for (const p of lobby.players) {
        splitContainer.appendChild(buildPlayerGridCard(p, lobby.players.length > 1));
      }
      wrap.appendChild(splitContainer);
    } else {
      const targetPlayer =
        lobby.players.find((p) => p.username.toLowerCase() === effectiveView) ??
        lobby.players[0];
      if (targetPlayer) {
        wrap.appendChild(buildPlayerGridCard(targetPlayer, false));
      }
    }

    return wrap;
  };

  const renderVexilloGuessrBoard = (lobby: ActivityLobby, selfKey: string): HTMLElement => {
    const state: VexilloGuessrGameState =
      lobby.gameState ?? createInitialVexilloState(lobby.players);
    const wrap = document.createElement('div');
    wrap.className = 'vc-game-board-wrap vc-vexillo-wrap';

    const activeUsername = state.playerUsernames[state.turnIndex] ?? state.playerUsernames[0];
    const isMyTurn =
      !state.winnerUsername && activeUsername.toLowerCase() === selfKey;

    // Duel Arena Header with Avatars, 3 Hearts, and Round Badge
    const livesRow = document.createElement('div');
    livesRow.className = 'vc-vexillo-lives-row';
    for (const p of lobby.players) {
      const pKey = p.username.toLowerCase();
      const heartsCount = Math.max(0, state.lives?.[pKey] ?? 3);
      const scoreCount = state.scores?.[pKey] ?? 0;
      const isCurrentTurn = pKey === activeUsername.toLowerCase() && !state.winnerUsername;

      const card = document.createElement('div');
      card.className = isCurrentTurn
        ? 'vc-vexillo-player vc-vexillo-player--turn'
        : 'vc-vexillo-player';

      const av = document.createElement('img');
      av.className = 'vc-vexillo-avatar';
      av.src = options.resolveAvatar(p);
      av.alt = p.displayName;
      card.appendChild(av);

      const metaCol = document.createElement('div');
      metaCol.className = 'vc-vexillo-player-meta';
      const nameEl = document.createElement('div');
      nameEl.className = 'vc-vexillo-player-name';
      nameEl.textContent = `${p.displayName} · ${scoreCount} pts`;
      const heartsEl = document.createElement('div');
      heartsEl.className = 'vc-vexillo-player-hearts';
      heartsEl.textContent = '❤️'.repeat(heartsCount) + '🖤'.repeat(Math.max(0, 3 - heartsCount));
      metaCol.appendChild(nameEl);
      metaCol.appendChild(heartsEl);
      card.appendChild(metaCol);

      livesRow.appendChild(card);
    }
    wrap.appendChild(livesRow);

    if (state.lastFeedback) {
      const fb = document.createElement('div');
      fb.className = state.lastFeedback.isCorrect
        ? 'vc-vexillo-feedback vc-vexillo-feedback--ok'
        : 'vc-vexillo-feedback vc-vexillo-feedback--wrong';
      fb.textContent = state.lastFeedback.isCorrect
        ? `✓ ${state.lastFeedback.username} correctly identified ${state.lastFeedback.correctName}!`
        : `✗ ${state.lastFeedback.username} picked ${state.lastFeedback.chosen} (Answer: ${state.lastFeedback.correctName}) — Lost 1 ❤️`;
      wrap.appendChild(fb);
    }

    const flagStage = document.createElement('div');
    flagStage.className = 'vc-vexillo-flag-box';
    const flagEntry =
      VEXILLO_FLAGS.find((f) => f.code.toLowerCase() === state.currentFlagCode.toLowerCase()) ??
      VEXILLO_FLAGS[0];

    const flagImg = document.createElement('img');
    flagImg.className = 'vc-vexillo-flag-img';
    flagImg.src = `https://flagcdn.com/w320/${state.currentFlagCode.toLowerCase()}.png`;
    flagImg.alt = 'Mystery Country Flag';
    flagImg.onerror = () => {
      const [c1, c2, c3] = flagEntry.colors;
      const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180"><rect width="300" height="60" fill="${c1}"/><rect y="60" width="300" height="60" fill="${c2}"/><rect y="120" width="300" height="60" fill="${c3}"/></svg>`;
      flagImg.src = `data:image/svg+xml;utf8,${encodeURIComponent(svgXml)}`;
    };
    flagStage.appendChild(flagImg);
    wrap.appendChild(flagStage);

    const turnPrompt = document.createElement('div');
    turnPrompt.className = 'vc-game-status-banner';
    turnPrompt.textContent = state.winnerUsername
      ? state.winReason || `${state.winnerUsername} wins!`
      : isMyTurn
        ? `Round ${state.roundNumber || 1} — Your Turn! Click the matching country:`
        : `Round ${state.roundNumber || 1} — Waiting for ${activeUsername} to guess...`;
    wrap.appendChild(turnPrompt);

    const choicesGrid = document.createElement('div');
    choicesGrid.className = 'vc-vexillo-choices';
    state.choices.forEach((choice, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vc-vexillo-choice-btn';
      btn.disabled = !isMyTurn || Boolean(state.winnerUsername);

      const numBadge = document.createElement('span');
      numBadge.className = 'vc-vexillo-choice-num';
      numBadge.textContent = String(idx + 1);
      const labelSpan = document.createElement('span');
      labelSpan.textContent = choice;
      btn.appendChild(numBadge);
      btn.appendChild(labelSpan);

      btn.addEventListener('click', () => {
        if (!isMyTurn || state.winnerUsername) return;
        const isCorrect = choice === state.currentFlagName;
        const nextLives = { ...state.lives };
        const nextScores = { ...state.scores };
        if (isCorrect) {
          nextScores[selfKey] = (nextScores[selfKey] ?? 0) + 1;
        } else {
          nextLives[selfKey] = Math.max(0, (nextLives[selfKey] ?? 3) - 1);
        }

        const nextTurnIdx = state.turnIndex === 0 ? 1 : 0;
        const opponentName = state.playerUsernames[nextTurnIdx];
        let winnerUsername: string | null = null;
        let winReason: string | undefined;
        if (nextLives[selfKey] <= 0) {
          winnerUsername = opponentName;
          winReason = `${activeUsername} lost all 3 lives — ${opponentName} wins VexilloGuessr!`;
        }

        // Deal next round guaranteeing currentFlagCode is NEVER chosen again
        const deal = dealNextVexilloRound(state.usedCodes, state.currentFlagCode);
        const nextState: VexilloGuessrGameState = {
          ...state,
          turnIndex: nextTurnIdx,
          lives: nextLives,
          scores: nextScores,
          currentFlagCode: deal.flag.code.toLowerCase(),
          currentFlagName: deal.flag.name,
          lastFlagCode: state.currentFlagCode.toLowerCase(),
          choices: deal.choices,
          usedCodes: deal.nextUsed,
          lastFeedback: {
            username: options.getSelfProfile()?.displayName ?? activeUsername,
            chosen: choice,
            correctName: state.currentFlagName,
            isCorrect,
          },
          winnerUsername,
          winReason,
          roundNumber: (state.roundNumber || 1) + 1,
        };

        options.sendActivityFrame({
          type: 'activity:action',
          lobbyId: lobby.id,
          gameState: nextState,
          status: winnerUsername ? 'finished' : 'playing',
          winnerUsername: winnerUsername || undefined,
        });
      });
      choicesGrid.appendChild(btn);
    });
    wrap.appendChild(choicesGrid);
    return wrap;
  };

  const renderPoolBoard = (lobby: ActivityLobby, selfKey: string): HTMLElement => {
    const state: PoolGameState = lobby.gameState ?? createInitialPoolState(lobby.players);
    const wrap = document.createElement('div');
    wrap.className = 'vc-game-board-wrap vc-pool-wrap';

    const activeShooter = state.playerUsernames[state.turnIndex] ?? state.playerUsernames[0];
    const isMyTurn = !state.winnerUsername && activeShooter.toLowerCase() === selfKey;

    // Top Pocketed Balls & Solids/Stripes Assignment HUD
    const hudBar = document.createElement('div');
    hudBar.className = 'vc-pool-hud';
    for (const p of lobby.players) {
      const pKey = p.username.toLowerCase();
      const group = state.groups?.[pKey];
      const isTurn = pKey === activeShooter.toLowerCase() && !state.winnerUsername;
      const card = document.createElement('div');
      card.className = isTurn ? 'vc-pool-player-card vc-pool-player-card--turn' : 'vc-pool-player-card';
      const title = document.createElement('div');
      title.className = 'vc-pool-player-title';
      title.textContent = `${p.displayName} · ${group ? group.toUpperCase() : 'OPEN TABLE'}`;
      card.appendChild(title);

      const tray = document.createElement('div');
      tray.className = 'vc-pool-pocketed-tray';
      const ids = group === 'solids' ? [1, 2, 3, 4, 5, 6, 7] : group === 'stripes' ? [9, 10, 11, 12, 13, 14, 15] : [];
      for (const bid of ids) {
        const bObj = state.balls.find((b) => b.id === bid);
        const dot = document.createElement('span');
        dot.className = bObj?.pocketed
          ? 'vc-pool-mini-ball vc-pool-mini-ball--sunk'
          : 'vc-pool-mini-ball';
        dot.style.background = POOL_BALL_COLORS[bid] ?? '#ffffff';
        dot.textContent = String(bid);
        tray.appendChild(dot);
      }
      card.appendChild(tray);
      hudBar.appendChild(card);
    }
    wrap.appendChild(hudBar);

    const statusBanner = document.createElement('div');
    statusBanner.className = 'vc-game-status-banner';
    statusBanner.textContent = isMyTurn
      ? `${state.statusText} — Click & pull back from the cue ball to aim and release to strike!`
      : state.statusText;
    wrap.appendChild(statusBanner);

    const canvas = document.createElement('canvas');
    canvas.className = 'vc-pool-canvas';
    canvas.width = POOL_W;
    canvas.height = POOL_H;
    wrap.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let displayBalls: PoolBall[] = state.balls.map((b) => ({ ...b }));
    let isPullingCue = false;
    let pullPower = 0; // 0 .. POOL_MAX_SPEED

    const drawTable = (ballsToDraw: PoolBall[], showCueStick: boolean) => {
      if (!ctx) return;
      ctx.clearRect(0, 0, POOL_W, POOL_H);

      // Mahogany bevelled outer rails
      const railGrad = ctx.createLinearGradient(0, 0, 0, POOL_H);
      railGrad.addColorStop(0, '#4a2511');
      railGrad.addColorStop(0.5, '#2f1608');
      railGrad.addColorStop(1, '#4a2511');
      ctx.fillStyle = railGrad;
      ctx.fillRect(0, 0, POOL_W, POOL_H);

      // Cushion border trim
      ctx.fillStyle = '#094d33';
      ctx.fillRect(POOL_RAIL - 5, POOL_RAIL - 5, POOL_W - (POOL_RAIL - 5) * 2, POOL_H - (POOL_RAIL - 5) * 2);

      // Tournament felt surface with subtle radial vignette
      const feltGrad = ctx.createRadialGradient(
        POOL_W / 2,
        POOL_H / 2,
        30,
        POOL_W / 2,
        POOL_H / 2,
        POOL_W * 0.65,
      );
      feltGrad.addColorStop(0, '#138457');
      feltGrad.addColorStop(1, '#0b5c3b');
      ctx.fillStyle = feltGrad;
      ctx.fillRect(POOL_RAIL, POOL_RAIL, POOL_W - POOL_RAIL * 2, POOL_H - POOL_RAIL * 2);

      // Diamond rail sights
      ctx.fillStyle = '#e5c185';
      for (let i = 1; i <= 7; i++) {
        if (i === 4) continue;
        const sx = POOL_RAIL + ((POOL_W - POOL_RAIL * 2) * i) / 8;
        ctx.beginPath();
        ctx.arc(sx, POOL_RAIL / 2 - 1, 2.3, 0, Math.PI * 2);
        ctx.arc(sx, POOL_H - POOL_RAIL / 2 + 1, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Head string line & spot
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(195, POOL_RAIL);
      ctx.lineTo(195, POOL_H - POOL_RAIL);
      ctx.stroke();

      // 6 Pockets with brass rim
      for (const [px, py] of POOL_POCKETS) {
        ctx.beginPath();
        ctx.arc(px, py, POOL_POCKET_R + 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#241409';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px, py, POOL_POCKET_R, 0, Math.PI * 2);
        ctx.fillStyle = '#07080b';
        ctx.fill();
      }

      // Aim raycast, ghost ball, deflection guide & pull-back cue stick
      const cue = ballsToDraw.find((b) => b.id === 0 && !b.pocketed);
      if (cue && showCueStick && isMyTurn) {
        const ray = computePoolAimRaycast(ballsToDraw, poolAimAngle);

        // Primary trajectory line
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(cue.x, cue.y);
        ctx.lineTo(ray.hitX, ray.hitY);
        ctx.stroke();
        ctx.restore();

        // Ghost cue ball at collision point
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(ray.hitX, ray.hitY, POOL_BALL_R, 0, Math.PI * 2);
        ctx.stroke();

        // Object ball target travel vector
        if (ray.hitBall && ray.targetDirX !== undefined && ray.targetDirY !== undefined) {
          ctx.strokeStyle = '#34d399';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(ray.hitBall.x, ray.hitBall.y);
          ctx.lineTo(
            ray.hitBall.x + ray.targetDirX * 72,
            ray.hitBall.y + ray.targetDirY * 72,
          );
          ctx.stroke();
        }
        ctx.restore();

        // Pull-back force ring & percentage label when pulling back
        const activePull = isPullingCue ? pullPower : 0;
        const pct = Math.round((activePull / POOL_MAX_SPEED) * 100);
        if (isPullingCue && activePull > 0.4) {
          const powerColor =
            pct < 45 ? '#34d399' : pct < 78 ? '#facc15' : '#ef4444';
          ctx.save();
          ctx.strokeStyle = powerColor;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(
            cue.x,
            cue.y,
            POOL_BALL_R + 7 + (activePull / POOL_MAX_SPEED) * 14,
            0,
            Math.PI * 2,
          );
          ctx.stroke();

          // Pull-back tether line
          const pullDist = 20 + activePull * 4.2;
          ctx.strokeStyle = powerColor;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(cue.x, cue.y);
          ctx.lineTo(
            cue.x - Math.cos(poolAimAngle) * pullDist,
            cue.y - Math.sin(poolAimAngle) * pullDist,
          );
          ctx.stroke();

          // Floating power pill
          ctx.fillStyle = 'rgba(13, 15, 21, 0.88)';
          ctx.fillRect(cue.x - 38, cue.y - 36, 76, 20);
          ctx.fillStyle = powerColor;
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            activePull < 1.2 ? 'CANCEL' : `FORCE ${pct}%`,
            cue.x,
            cue.y - 26,
          );
          ctx.restore();
        }

        // Cue stick drawn back by pullPower
        const pullOffset = 16 + activePull * 4.2;
        const tipX = cue.x - Math.cos(poolAimAngle) * pullOffset;
        const tipY = cue.y - Math.sin(poolAimAngle) * pullOffset;
        const buttX = cue.x - Math.cos(poolAimAngle) * (pullOffset + 150);
        const buttY = cue.y - Math.sin(poolAimAngle) * (pullOffset + 150);

        ctx.save();
        ctx.strokeStyle = '#f5d0a9';
        ctx.lineWidth = 5.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(buttX, buttY);
        ctx.stroke();

        // Blue chalk cue tip
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 5.5;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(
          tipX - Math.cos(poolAimAngle) * 5,
          tipY - Math.sin(poolAimAngle) * 5,
        );
        ctx.stroke();
        ctx.restore();
      }

      // Render 3D-shaded billiard balls
      for (const b of ballsToDraw) {
        if (b.pocketed) continue;

        // Soft drop shadow on felt
        ctx.beginPath();
        ctx.arc(b.x + 2, b.y + 2.5, POOL_BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
        ctx.fill();

        // Base sphere
        ctx.beginPath();
        ctx.arc(b.x, b.y, POOL_BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = b.id >= 9 ? '#f8fafc' : POOL_BALL_COLORS[b.id] ?? '#f8fafc';
        ctx.fill();

        if (b.id >= 9) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(b.x, b.y, POOL_BALL_R, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillStyle = POOL_BALL_COLORS[b.id] ?? '#ef4444';
          ctx.fillRect(b.x - POOL_BALL_R, b.y - 5.5, POOL_BALL_R * 2, 11);
          ctx.restore();
        }

        if (b.id > 0) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, 4.9, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 6.6px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(b.id), b.x, b.y + 0.4);
        }

        // Glossy 3D specular highlight
        const shine = ctx.createRadialGradient(
          b.x - 3.5,
          b.y - 3.5,
          1,
          b.x - 2,
          b.y - 2,
          POOL_BALL_R,
        );
        shine.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
        shine.addColorStop(0.35, 'rgba(255, 255, 255, 0.08)');
        shine.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
        ctx.beginPath();
        ctx.arc(b.x, b.y, POOL_BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = shine;
        ctx.fill();
      }
    };

    const getCanvasCoords = (e: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [
        ((e.clientX - rect.left) * POOL_W) / rect.width,
        ((e.clientY - rect.top) * POOL_H) / rect.height,
      ];
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (!isMyTurn) return;
      const cue = displayBalls.find((b) => b.id === 0 && !b.pocketed);
      if (!cue) return;
      canvas.setPointerCapture?.(e.pointerId);
      const [px, py] = getCanvasCoords(e);
      isPullingCue = true;
      const dist = Math.hypot(px - cue.x, py - cue.y);
      if (dist > 6) {
        // Pulling back from the cue ball aims in the opposite direction (slingshot / cue pullback!)
        poolAimAngle = Math.atan2(cue.y - py, cue.x - px);
      }
      pullPower = Math.min(POOL_MAX_SPEED, Math.max(0, (dist - 8) / 5.2));
      drawTable(displayBalls, true);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!isMyTurn) return;
      const cue = displayBalls.find((b) => b.id === 0 && !b.pocketed);
      if (!cue) return;
      const [px, py] = getCanvasCoords(e);
      if (isPullingCue) {
        const dist = Math.hypot(px - cue.x, py - cue.y);
        if (dist > 6) {
          poolAimAngle = Math.atan2(cue.y - py, cue.x - px);
        }
        pullPower = Math.min(POOL_MAX_SPEED, Math.max(0, (dist - 8) / 5.2));
        drawTable(displayBalls, true);
      } else if (e.pointerType === 'mouse') {
        poolAimAngle = Math.atan2(py - cue.y, px - cue.x);
        drawTable(displayBalls, true);
      }
    });

    const finishCuePull = () => {
      if (!isPullingCue) return;
      const firedPower = pullPower;
      isPullingCue = false;
      pullPower = 0;
      if (!isMyTurn || firedPower < 1.2) {
        drawTable(displayBalls, true);
        return;
      }
      const nextState = executePoolShot(state, poolAimAngle, firedPower);
      options.sendActivityFrame({
        type: 'activity:action',
        lobbyId: lobby.id,
        gameState: nextState,
        status: nextState.winnerUsername ? 'finished' : 'playing',
        winnerUsername: nextState.winnerUsername || undefined,
      });
    };

    canvas.addEventListener('pointerup', finishCuePull);
    canvas.addEventListener('pointercancel', () => {
      isPullingCue = false;
      pullPower = 0;
      drawTable(displayBalls, true);
    });

    if (state.lastShot && state.lastShot.seq !== poolAnimatingSeq) {
      poolAnimatingSeq = state.lastShot.seq;
      const animBalls: PoolBall[] = state.lastShot.startBalls.map((b) => ({ ...b }));
      const cue = animBalls.find((b) => b.id === 0);
      if (cue) {
        cue.vx = Math.cos(state.lastShot.angle) * state.lastShot.power;
        cue.vy = Math.sin(state.lastShot.angle) * state.lastShot.power;
      }
      const dummyPocketed: number[] = [];
      const tick = () => {
        if (!canvas.isConnected) return;
        const stillMoving = simulatePoolFrame(animBalls, dummyPocketed);
        drawTable(animBalls, false);
        if (stillMoving) {
          requestAnimationFrame(tick);
        } else {
          displayBalls = state.balls.map((b) => ({ ...b }));
          drawTable(displayBalls, true);
        }
      };
      requestAnimationFrame(tick);
    } else {
      drawTable(displayBalls, true);
    }

    return wrap;
  };

  const renderQuoridorBoard = (lobby: ActivityLobby, selfKey: string): HTMLElement => {
    const state: QuoridorGameState =
      lobby.gameState ?? createInitialQuoridorState(lobby.players);
    const wrap = document.createElement('div');
    wrap.className = 'vc-game-board-wrap vc-quoridor-wrap';

    const activePawn = state.pawns[state.turnIndex] ?? state.pawns[0];
    const isMyTurn =
      !state.winnerUsername && activePawn?.username.toLowerCase() === selfKey;

    const infoStrip = document.createElement('div');
    infoStrip.className = 'vc-quoridor-players';
    const goalLabels = ['↑ Goal: Row 8 (Top)', '↓ Goal: Row 1 (Bottom)', '→ Goal: Col I (Right)', '← Goal: Col A (Left)'];
    state.pawns.forEach((p, idx) => {
      const chip = document.createElement('div');
      chip.className =
        idx === state.turnIndex && !state.winnerUsername
          ? 'vc-quoridor-chip vc-quoridor-chip--turn'
          : 'vc-quoridor-chip';
      chip.style.borderColor = p.color;
      chip.textContent = `${p.displayName} (${goalLabels[idx] ?? ''}) · 🧱 ${p.wallsLeft} Walls`;
      infoStrip.appendChild(chip);
    });
    wrap.appendChild(infoStrip);

    const toolRow = document.createElement('div');
    toolRow.className = 'vc-quoridor-tools';
    const tools: Array<{ id: 'move' | 'hwall' | 'vwall'; label: string }> = [
      { id: 'move', label: '♟️ Move Pawn' },
      { id: 'hwall', label: `➖ Horizontal Wall (${activePawn?.wallsLeft ?? 0})` },
      { id: 'vwall', label: `➕ Vertical Wall (${activePawn?.wallsLeft ?? 0})` },
    ];
    for (const t of tools) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        quoridorTool === t.id
          ? 'vc-activity-mode-pill vc-activity-mode-pill--active'
          : 'vc-activity-mode-pill';
      btn.textContent = t.label;
      btn.disabled = t.id !== 'move' && (activePawn?.wallsLeft ?? 0) <= 0;
      btn.addEventListener('click', () => {
        quoridorTool = t.id;
        options.onStateChanged();
      });
      toolRow.appendChild(btn);
    }
    wrap.appendChild(toolRow);

    const boardEl = document.createElement('div');
    boardEl.className = 'vc-quoridor-board';

    const legalMoves = isMyTurn ? getLegalQuoridorPawnMoves(state, state.turnIndex) : [];
    const files = 'abcdefghi';

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'vc-quoridor-cell';
        const isLegalMove =
          isMyTurn &&
          quoridorTool === 'move' &&
          legalMoves.some(([mr, mc]) => mr === r && mc === c);
        if (isLegalMove) cell.classList.add('vc-quoridor-cell--legal');

        if (c === 0) {
          const rCoord = document.createElement('span');
          rCoord.className = 'vc-board-coord vc-board-coord--rank';
          rCoord.textContent = String(9 - r);
          cell.appendChild(rCoord);
        }
        if (r === 8) {
          const fCoord = document.createElement('span');
          fCoord.className = 'vc-board-coord vc-board-coord--file';
          fCoord.textContent = files[c] ?? '';
          cell.appendChild(fCoord);
        }

        const pawnHere = state.pawns.find((p) => p.r === r && p.c === c);
        if (pawnHere) {
          const pawnEl = document.createElement('span');
          pawnEl.className = 'vc-quoridor-pawn';
          if (pawnHere.prevR !== undefined && pawnHere.prevC !== undefined) {
            pawnEl.classList.add('vc-piece-sliding');
            pawnEl.style.setProperty('--slide-from-x', `${(pawnHere.prevC - c) * 100}%`);
            pawnEl.style.setProperty('--slide-from-y', `${(pawnHere.prevR - r) * 100}%`);
          }
          pawnEl.style.background = pawnHere.color;
          pawnEl.title = pawnHere.displayName;
          cell.appendChild(pawnEl);
        }

        cell.addEventListener('click', () => {
          if (!isMyTurn) return;
          if (quoridorTool === 'move' && isLegalMove) {
            const nextPawns = state.pawns.map((p, idx) =>
              idx === state.turnIndex
                ? { ...p, prevR: p.r, prevC: p.c, r, c }
                : { ...p, prevR: undefined, prevC: undefined },
            );
            const moved = nextPawns[state.turnIndex];
            const reachedGoal =
              (moved.goalType === 'row' && moved.r === moved.goalTarget) ||
              (moved.goalType === 'col' && moved.c === moved.goalTarget);
            const nextTurn = (state.turnIndex + 1) % nextPawns.length;
            const nextState: QuoridorGameState = {
              ...state,
              pawns: nextPawns,
              turnIndex: nextTurn,
              moveCount: (state.moveCount || 0) + 1,
              winnerUsername: reachedGoal ? moved.username : null,
              winReason: reachedGoal
                ? `${moved.displayName} reached the opposite goal edge and won Quoridor!`
                : undefined,
              statusText: reachedGoal
                ? `${moved.displayName} wins!`
                : `${nextPawns[nextTurn].displayName}'s turn`,
            };
            options.sendActivityFrame({
              type: 'activity:action',
              lobbyId: lobby.id,
              gameState: nextState,
              status: reachedGoal ? 'finished' : 'playing',
              winnerUsername: reachedGoal ? moved.username : undefined,
            });
          } else if (
            (quoridorTool === 'hwall' || quoridorTool === 'vwall') &&
            r < 8 &&
            c < 8 &&
            activePawn.wallsLeft > 0
          ) {
            const orient = quoridorTool === 'hwall' ? 'h' : 'v';
            if (!canPlaceQuoridorWall(state, orient, r, c)) {
              return;
            }
            const nextPawns = state.pawns.map((p, idx) =>
              idx === state.turnIndex
                ? { ...p, prevR: undefined, prevC: undefined, wallsLeft: p.wallsLeft - 1 }
                : { ...p, prevR: undefined, prevC: undefined },
            );
            const nextTurn = (state.turnIndex + 1) % nextPawns.length;
            const nextState: QuoridorGameState = {
              ...state,
              pawns: nextPawns,
              turnIndex: nextTurn,
              hWalls: orient === 'h' ? [...state.hWalls, `${r},${c}`] : state.hWalls,
              vWalls: orient === 'v' ? [...state.vWalls, `${r},${c}`] : state.vWalls,
              moveCount: (state.moveCount || 0) + 1,
              statusText: `${nextPawns[nextTurn].displayName}'s turn`,
            };
            quoridorTool = 'move';
            options.sendActivityFrame({
              type: 'activity:action',
              lobbyId: lobby.id,
              gameState: nextState,
              status: 'playing',
            });
          }
        });

        boardEl.appendChild(cell);
      }
    }

    for (const hw of state.hWalls) {
      const [r, c] = hw.split(',').map(Number);
      const wallEl = document.createElement('div');
      wallEl.className = 'vc-quoridor-wall vc-quoridor-wall--h';
      wallEl.style.left = `calc(${(c / 9) * 100}% + 2px)`;
      wallEl.style.top = `calc(${((r + 1) / 9) * 100}% - 3px)`;
      wallEl.style.width = `calc(${(2 / 9) * 100}% - 4px)`;
      boardEl.appendChild(wallEl);
    }
    for (const vw of state.vWalls) {
      const [r, c] = vw.split(',').map(Number);
      const wallEl = document.createElement('div');
      wallEl.className = 'vc-quoridor-wall vc-quoridor-wall--v';
      wallEl.style.left = `calc(${((c + 1) / 9) * 100}% - 3px)`;
      wallEl.style.top = `calc(${(r / 9) * 100}% + 2px)`;
      wallEl.style.height = `calc(${(2 / 9) * 100}% - 4px)`;
      boardEl.appendChild(wallEl);
    }

    wrap.appendChild(boardEl);
    return wrap;
  };

  /** Renders the active Lobby & Game Board view. */
  const renderActiveLobbyView = (
    threadKey: string,
    lobby: ActivityLobby,
  ): HTMLElement => {
    const meta = getActivityGameMeta(lobby.gameId);
    const selfKey = getSelfKey();
    const isSeated = lobby.players.some((p) => p.username.toLowerCase() === selfKey);
    const isHost = lobby.hostUsername.toLowerCase() === selfKey;

    const container = document.createElement('div');
    container.className = 'vc-activity-lobby-stage';

    const seatBar = document.createElement('div');
    seatBar.className = 'vc-activity-seat-bar';

    const playersList = document.createElement('div');
    playersList.className = 'vc-activity-players-strip';
    for (const p of lobby.players) {
      const pill = document.createElement('div');
      pill.className = 'vc-activity-player-pill';
      const av = document.createElement('img');
      av.className = 'vc-activity-player-avatar';
      av.src = options.resolveAvatar(p);
      av.alt = p.displayName;
      const nameSpan = document.createElement('span');
      nameSpan.textContent = `${p.displayName} (${p.wins}W)`;
      pill.appendChild(av);
      pill.appendChild(nameSpan);
      playersList.appendChild(pill);
    }
    seatBar.appendChild(playersList);

    const seatActions = document.createElement('div');
    seatActions.className = 'vc-activity-seat-actions';

    if (!isSeated && lobby.players.length < lobby.maxPlayers && lobby.status === 'waiting') {
      const takeSeatBtn = document.createElement('button');
      takeSeatBtn.type = 'button';
      takeSeatBtn.className = 'btn-primary vc-activity-sm-btn';
      takeSeatBtn.textContent = 'Join Match Seat';
      takeSeatBtn.addEventListener('click', () => {
        options.sendActivityFrame({
          type: 'activity:join',
          lobbyId: lobby.id,
          asSpectator: false,
        });
      });
      seatActions.appendChild(takeSeatBtn);
    }

    if (isHost && lobby.status === 'waiting' && meta.allowedPlayerCounts.length > 1) {
      for (const cnt of meta.allowedPlayerCounts) {
        const cntBtn = document.createElement('button');
        cntBtn.type = 'button';
        cntBtn.className =
          lobby.maxPlayers === cnt
            ? 'vc-activity-mode-pill vc-activity-mode-pill--active'
            : 'vc-activity-mode-pill';
        cntBtn.textContent = `${cnt}P`;
        cntBtn.addEventListener('click', () => {
          options.sendActivityFrame({
            type: 'activity:config',
            lobbyId: lobby.id,
            maxPlayers: cnt,
          });
        });
        seatActions.appendChild(cntBtn);
      }
    }

    if (isSeated && lobby.status === 'waiting' && lobby.players.length >= 2) {
      const startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.className = 'btn-primary vc-activity-sm-btn';
      startBtn.textContent = 'Start Match ▶';
      startBtn.addEventListener('click', () => {
        selectedBoardSquare = null;
        options.sendActivityFrame({
          type: 'activity:start',
          lobbyId: lobby.id,
          gameState: createInitialGameStateForLobby(lobby),
        });
      });
      seatActions.appendChild(startBtn);
    }

    // Mutual Rematch Vote button (both players must vote!)
    if (isSeated && lobby.status === 'finished' && lobby.players.length >= 2) {
      const votes = (lobby.rematchVotes ?? []).map((u) => u.toLowerCase());
      const hasSelfVoted = votes.includes(selfKey);
      const rematchBtn = document.createElement('button');
      rematchBtn.type = 'button';
      rematchBtn.className = hasSelfVoted
        ? 'btn-secondary vc-activity-sm-btn'
        : 'btn-primary vc-activity-sm-btn';
      rematchBtn.textContent = hasSelfVoted
        ? `✓ Voted Rematch (${votes.length}/${lobby.players.length})`
        : votes.length > 0
          ? `Accept Rematch (${votes.length}/${lobby.players.length}) ✓`
          : `Vote Rematch (0/${lobby.players.length}) ↻`;
      rematchBtn.addEventListener('click', () => {
        selectedBoardSquare = null;
        options.sendActivityFrame({
          type: 'activity:rematch',
          lobbyId: lobby.id,
          gameState: createInitialGameStateForLobby(lobby),
        });
      });
      seatActions.appendChild(rematchBtn);
    }

    const browseBtn = document.createElement('button');
    browseBtn.type = 'button';
    browseBtn.className = 'btn-secondary vc-activity-sm-btn';
    browseBtn.textContent = 'All Lobbies';
    browseBtn.addEventListener('click', () => {
      expandedTarget = { kind: 'browser', threadKey, gameId: lobby.gameId };
      options.onStateChanged();
    });
    seatActions.appendChild(browseBtn);

    if (isSeated) {
      const leaveLobbyBtn = document.createElement('button');
      leaveLobbyBtn.type = 'button';
      leaveLobbyBtn.className = 'btn-danger vc-activity-sm-btn';
      leaveLobbyBtn.textContent = 'Leave & Cancel Game';
      leaveLobbyBtn.addEventListener('click', () => {
        watchedLobbyIds.delete(lobby.id);
        expandedTarget = null;
        options.sendActivityFrame({
          type: 'activity:leave',
          lobbyId: lobby.id,
        });
        options.onStateChanged();
      });
      seatActions.appendChild(leaveLobbyBtn);
    }

    seatBar.appendChild(seatActions);
    container.appendChild(seatBar);

    if (lobby.status === 'waiting') {
      const waitCard = document.createElement('div');
      waitCard.className = 'vc-activity-waiting-card';
      waitCard.textContent =
        lobby.players.length < 2
          ? `Waiting for an opponent to join (${lobby.players.length}/${lobby.maxPlayers} players seated)... Others in the call can click the ${meta.name} tile to join!`
          : `Ready to play (${lobby.players.length}/${lobby.maxPlayers} players seated)! Click "Start Match ▶" above to begin.`;
      container.appendChild(waitCard);
      return container;
    }

    if (lobby.status === 'finished') {
      const winBanner = document.createElement('div');
      winBanner.className = 'vc-activity-win-banner';
      const votesCount = (lobby.rematchVotes ?? []).length;
      const reason =
        lobby.gameState?.winReason ||
        (lobby.gameState?.winnerUsername
          ? `🏆 ${lobby.gameState.winnerUsername} won the match!`
          : 'Match finished — Draw!');
      winBanner.textContent =
        votesCount > 0
          ? `${reason} · Rematch Vote: ${votesCount}/${lobby.players.length}`
          : reason;
      container.appendChild(winBanner);
    }

    if (lobby.gameId === 'chess') {
      container.appendChild(renderChessBoard(lobby, selfKey));
    } else if (lobby.gameId === 'checkers') {
      container.appendChild(renderCheckersBoard(lobby, selfKey));
    } else if (lobby.gameId === 'minesweeper') {
      container.appendChild(renderMinesweeperBoard(lobby, selfKey));
    } else if (lobby.gameId === 'vexilloguessr') {
      container.appendChild(renderVexilloGuessrBoard(lobby, selfKey));
    } else if (lobby.gameId === 'pool') {
      container.appendChild(renderPoolBoard(lobby, selfKey));
    } else if (lobby.gameId === 'quoridor') {
      container.appendChild(renderQuoridorBoard(lobby, selfKey));
    }

    return container;
  };

  const renderExpandedActivityStage = (threadKey: string): HTMLElement | null => {
    if (!expandedTarget || expandedTarget.threadKey !== threadKey) {
      return null;
    }
    let activeGameId: ActivityGameId = 'chess';
    let activeLobby: ActivityLobby | undefined;

    if (expandedTarget.kind === 'browser') {
      activeGameId = expandedTarget.gameId;
    } else {
      activeLobby = lobbiesById.get(expandedTarget.lobbyId);
      if (!activeLobby) {
        expandedTarget = null;
        return null;
      }
      activeGameId = activeLobby.gameId;
    }

    const meta = getActivityGameMeta(activeGameId);
    const expWrap = document.createElement('div');
    expWrap.className = 'vc-expanded-stage vc-expanded-stage--activity';

    const expHeader = document.createElement('div');
    expHeader.className = 'vc-expanded-header';

    const expTitle = document.createElement('span');
    expTitle.className = 'vc-expanded-title';
    expTitle.textContent = activeLobby
      ? `${meta.name} — ${activeLobby.title}`
      : `${meta.name} — Lobbies`;
    expHeader.appendChild(expTitle);

    const expActions = document.createElement('div');
    expActions.className = 'vc-expanded-actions';

    if (activeLobby) {
      const stopWatchBtn = document.createElement('button');
      stopWatchBtn.type = 'button';
      stopWatchBtn.className = 'vc-stage-tool-btn vc-stage-tool-btn--stop-watch';
      stopWatchBtn.dataset.vcRole = 'stop-watching-activity';
      stopWatchBtn.title = 'Close activity view without leaving your game';
      stopWatchBtn.textContent = 'Hide Game';
      stopWatchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        expandedTarget = null;
        options.onStateChanged();
      });
      expActions.appendChild(stopWatchBtn);
    } else {
      const closeBrowserBtn = document.createElement('button');
      closeBrowserBtn.type = 'button';
      closeBrowserBtn.className = 'vc-stage-tool-btn vc-stage-tool-btn--stop-watch';
      closeBrowserBtn.textContent = 'Close';
      closeBrowserBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        expandedTarget = null;
        options.onStateChanged();
      });
      expActions.appendChild(closeBrowserBtn);
    }

    expHeader.appendChild(expActions);
    expWrap.appendChild(expHeader);

    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'vc-activity-stage-body';
    if (activeLobby) {
      bodyWrap.appendChild(renderActiveLobbyView(threadKey, activeLobby));
    } else {
      bodyWrap.appendChild(renderGameBrowserView(threadKey, activeGameId));
    }
    expWrap.appendChild(bodyWrap);

    return expWrap;
  };

  return {
    getRenderRevision: () => renderRevision,
    handleLobbyList: (lobbies) => {
      lobbiesById.clear();
      for (const l of lobbies) {
        lobbiesById.set(l.id, l);
      }
      options.onStateChanged();
    },
    handleLobbyUpdate: (lobby) => {
      const isNew = !lobbiesById.has(lobby.id);
      lobbiesById.set(lobby.id, lobby);
      const selfKey = getSelfKey();
      if (isNew && lobby.hostUsername.toLowerCase() === selfKey) {
        watchedLobbyIds.add(lobby.id);
        expandedTarget = { kind: 'lobby', threadKey: lobby.threadKey, lobbyId: lobby.id };
      }
      if (
        lobby.status === 'waiting' &&
        lobby.players.length === lobby.maxPlayers &&
        lobby.hostUsername.toLowerCase() === selfKey &&
        !lobby.gameState
      ) {
        selectedBoardSquare = null;
        options.sendActivityFrame({
          type: 'activity:start',
          lobbyId: lobby.id,
          gameState: createInitialGameStateForLobby(lobby),
        });
      }
      options.onStateChanged();
    },
    handleLobbyRemoved: (lobbyId) => {
      lobbiesById.delete(lobbyId);
      watchedLobbyIds.delete(lobbyId);
      lastAnimatedMoveKeyByLobby.delete(lobbyId);
      if (expandedTarget?.kind === 'lobby' && expandedTarget.lobbyId === lobbyId) {
        expandedTarget = null;
      }
      options.onStateChanged();
    },
    getCallLobbies,
    isLobbyWatched: (lobbyId) => watchedLobbyIds.has(lobbyId),
    isStageExpandedForCall: (threadKey) =>
      Boolean(expandedTarget && expandedTarget.threadKey === threadKey),
    getExpandedStageKey: () =>
      expandedTarget
        ? expandedTarget.kind === 'lobby'
          ? `act:${expandedTarget.lobbyId}`
          : `act-browser:${expandedTarget.gameId}`
        : null,
    watchLobby: (lobbyId, expandBigScreen = true) => {
      const l = lobbiesById.get(lobbyId);
      if (!l) return;
      watchedLobbyIds.add(lobbyId);
      if (expandBigScreen) {
        expandedTarget = { kind: 'lobby', threadKey: l.threadKey, lobbyId };
      }
      options.onStateChanged();
    },
    stopWatchingLobby: (lobbyId) => {
      watchedLobbyIds.delete(lobbyId);
      if (expandedTarget?.kind === 'lobby' && expandedTarget.lobbyId === lobbyId) {
        expandedTarget = null;
      }
      options.onStateChanged();
    },
    toggleExpandLobby: (lobbyId) => {
      const l = lobbiesById.get(lobbyId);
      if (!l) return;
      watchedLobbyIds.add(lobbyId);
      if (expandedTarget?.kind === 'lobby' && expandedTarget.lobbyId === lobbyId) {
        expandedTarget = null;
      } else {
        expandedTarget = { kind: 'lobby', threadKey: l.threadKey, lobbyId };
      }
      options.onStateChanged();
    },
    hideExpandedStage: () => {
      expandedTarget = null;
      options.onStateChanged();
    },
    openGameBrowser,
    toggleActivitiesBubble,
    closeActivitiesBubble,
    renderActivityStageTiles,
    renderExpandedActivityStage,
  };
}
