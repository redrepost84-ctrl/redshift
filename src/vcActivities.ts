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
    tagline: 'Competitive 1v1 online chess with lobbies',
    accent: '#f59e0b',
    defaultMaxPlayers: 2,
    allowedPlayerCounts: [2],
  },
  {
    id: 'checkers',
    name: 'Checkers',
    badge: '1v1',
    tagline: 'Competitive 1v1 draughts with chained jumps & kings',
    accent: '#ef4444',
    defaultMaxPlayers: 2,
    allowedPlayerCounts: [2],
  },
  {
    id: 'minesweeper',
    name: 'Minesweeper',
    badge: 'Race',
    tagline: 'First to flag all mines wins — first to hit a mine loses!',
    accent: '#3b82f6',
    defaultMaxPlayers: 2,
    allowedPlayerCounts: [2, 3, 4],
  },
  {
    id: 'vexilloguessr',
    name: 'VexilloGuessr',
    badge: '1v1 · 3❤️',
    tagline: 'Turn-based 4-choice world flag duel with 3 lives each',
    accent: '#10b981',
    defaultMaxPlayers: 2,
    allowedPlayerCounts: [2],
  },
  {
    id: 'pool',
    name: 'Pool',
    badge: '8-Ball',
    tagline: 'Online 1v1 8-Ball billiards with physics & lobbies',
    accent: '#8b5cf6',
    defaultMaxPlayers: 2,
    allowedPlayerCounts: [2],
  },
  {
    id: 'quoridor',
    name: 'Quoridor',
    badge: '2–4P',
    tagline: '1v1, 1v1v1, or 1v1v1v1 tactical wall-placement maze',
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
    // Knight / Crown Chess logo
    addPath('M11 26h14M12 23h12l-1.5-7 3.5-3.5-3.5-1.5-2-3.5-2.5 3-2.5-3-2 3.5-3.5 1.5 3.5 3.5L12 23z', meta.accent, '#ffffff', '1.7');
  } else if (gameId === 'checkers') {
    // Stacked king checker discs
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
    // Naval mine + flag emblem
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', '18');
    c.setAttribute('cy', '19');
    c.setAttribute('r', '6');
    c.setAttribute('fill', '#ffffff');
    svg.appendChild(c);
    addPath('M18 9v19M9 19h18M11.5 12.5l13 13M24.5 12.5l-13 13', 'none', '#ffffff', '2');
  } else if (gameId === 'vexilloguessr') {
    // Waving flag on pole
    addPath('M11 9v18', 'none', '#ffffff', '2.2');
    addPath('M11 10c3.5-1.5 6.5 1.5 10 0s4.5 0 4.5 0v9c0 0-1 1.5-4.5 0s-6.5-1.5-10 0V10z', meta.accent, '#ffffff', '1.8');
  } else if (gameId === 'pool') {
    // 8-ball emblem
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
    // Grid + glowing walls + pawn
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
   GAME 1: CHESS ENGINE (Full Legal Moves, Check/Checkmate, Castling, En Passant, Promotion)
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

const CHESS_GLYPHS: Record<string, string> = {
  wK: '♔',
  wQ: '♕',
  wR: '♖',
  wB: '♗',
  wN: '♘',
  wP: '♙',
  bK: '♚',
  bQ: '♛',
  bR: '♜',
  bB: '♝',
  bN: '♞',
  bP: '♟',
};

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
  // Pawn attacks
  const pawnRow = byColor === 'w' ? targetR + 1 : targetR - 1;
  for (const dc of [-1, 1]) {
    if (inBounds8(pawnRow, targetC + dc) && board[pawnRow][targetC + dc] === `${byColor}P`) {
      return true;
    }
  }
  // Knight attacks
  const knightOffsets = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];
  for (const [dr, dc] of knightOffsets) {
    const nr = targetR + dr;
    const nc = targetC + dc;
    if (inBounds8(nr, nc) && board[nr][nc] === `${byColor}N`) return true;
  }
  // King attacks
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = targetR + dr;
      const nc = targetC + dc;
      if (inBounds8(nr, nc) && board[nr][nc] === `${byColor}K`) return true;
    }
  }
  // Orthogonal (Rook / Queen)
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
  // Diagonal (Bishop / Queen)
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
      } else if (
        state.enPassant &&
        state.enPassant[0] === nr &&
        state.enPassant[1] === nc
      ) {
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
    // Castling
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

  // Filter out moves that leave own king in check
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

  // Check if enemy has any legal move
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
   GAME 2: CHECKERS ENGINE (8x8 Draughts, Chained Multi-Jumps, Kings)
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
  };
}

interface CheckerMove {
  from: [number, number];
  to: [number, number];
  captured?: [number, number];
}

function getCheckerPieceJumps(
  board: CheckerCell[][],
  r: number,
  c: number,
): CheckerMove[] {
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
  // Check if any piece of current turn has a jump (mandatory jump rule)
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

  // Check chained multi-jump
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
        statusText: `${color === 'r' ? 'Red' : 'Black'} double-jump! Select next jump`,
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
   GAME 3: MINESWEEPER RACE (First to Flag All Wins / First to Lose Loses)
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
  mines: number[] | null; // Generated on first click so first click is always safe
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
   GAME 4: VEXILLOGUESSR (1v1 Turn-Based Flag Duel, 4 Choices, 3 Lives Each)
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
  { code: 'CL', name: 'Chile', colors: ['#0039a6', '#ffffff', '#d52b1e'] },
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
];

export interface VexilloGuessrGameState {
  turnIndex: number;
  playerUsernames: [string, string];
  lives: Record<string, number>;
  scores: Record<string, number>;
  currentFlagCode: string;
  currentFlagName: string;
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

function dealNextVexilloRound(usedCodes: string[]): {
  flag: VexilloFlagEntry;
  choices: string[];
  nextUsed: string[];
} {
  const usedSet = new Set(usedCodes);
  let pool = VEXILLO_FLAGS.filter((f) => !usedSet.has(f.code.toLowerCase()));
  let nextUsed = [...usedCodes];
  if (pool.length < 4) {
    pool = [...VEXILLO_FLAGS];
    nextUsed = [];
  }
  const correct = pool[Math.floor(Math.random() * pool.length)];
  nextUsed.push(correct.code.toLowerCase());
  const distractors = VEXILLO_FLAGS.filter((f) => f.code !== correct.code)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map((f) => f.name);
  const choices = [correct.name, ...distractors].sort(() => Math.random() - 0.5);
  return { flag: correct, choices, nextUsed };
}

export function createInitialVexilloState(
  players: ActivityPlayerEntry[],
): VexilloGuessrGameState {
  const p0 = players[0]?.username ?? 'Player 1';
  const p1 = players[1]?.username ?? 'Player 2';
  const deal = dealNextVexilloRound([]);
  return {
    turnIndex: 0,
    playerUsernames: [p0, p1],
    lives: { [p0.toLowerCase()]: 3, [p1.toLowerCase()]: 3 },
    scores: { [p0.toLowerCase()]: 0, [p1.toLowerCase()]: 0 },
    currentFlagCode: deal.flag.code.toLowerCase(),
    currentFlagName: deal.flag.name,
    choices: deal.choices,
    usedCodes: deal.nextUsed,
    lastFeedback: null,
    winnerUsername: null,
    roundNumber: 1,
  };
}

/* ============================================================================
   GAME 5: 8-BALL POOL (1v1 Online Billiards with Deterministic 120Hz Physics)
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

const POOL_W = 700;
const POOL_H = 360;
const POOL_RAIL = 26;
const POOL_BALL_R = 10.5;
const POOL_POCKET_R = 20;

const POOL_BALL_COLORS: Record<number, string> = {
  0: '#f8fafc',
  1: '#eab308',
  2: '#2563eb',
  3: '#dc2626',
  4: '#7c3aed',
  5: '#ea580c',
  6: '#16a34a',
  7: '#991b1b',
  8: '#111827',
  9: '#eab308',
  10: '#2563eb',
  11: '#dc2626',
  12: '#7c3aed',
  13: '#ea580c',
  14: '#16a34a',
  15: '#991b1b',
};

export function createInitialPoolState(players: ActivityPlayerEntry[]): PoolGameState {
  const p0 = players[0]?.username ?? 'Player 1';
  const p1 = players[1]?.username ?? 'Player 2';
  const balls: PoolBall[] = [
    { id: 0, x: 185, y: POOL_H / 2, vx: 0, vy: 0, pocketed: false },
  ];
  // Rack 1..15 in standard 5-column triangle with 8-ball in center (row 2, col 1)
  const rackOrder = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  const apexX = 485;
  const apexY = POOL_H / 2;
  const dx = POOL_BALL_R * 1.76;
  const dy = POOL_BALL_R * 1.03;
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
    statusText: `${p0} to break! Aim & shoot`,
    winnerUsername: null,
  };
}

const POOL_POCKETS: Array<[number, number]> = [
  [POOL_RAIL + 2, POOL_RAIL + 2],
  [POOL_W / 2, POOL_RAIL - 2],
  [POOL_W - POOL_RAIL - 2, POOL_RAIL + 2],
  [POOL_RAIL + 2, POOL_H - POOL_RAIL - 2],
  [POOL_W / 2, POOL_H - POOL_RAIL + 2],
  [POOL_W - POOL_RAIL - 2, POOL_H - POOL_RAIL - 2],
];

function simulatePoolStep(balls: PoolBall[], pocketedThisShot: number[]): boolean {
  let moving = false;
  const minX = POOL_RAIL + POOL_BALL_R;
  const maxX = POOL_W - POOL_RAIL - POOL_BALL_R;
  const minY = POOL_RAIL + POOL_BALL_R;
  const maxY = POOL_H - POOL_RAIL - POOL_BALL_R;

  for (const b of balls) {
    if (b.pocketed) continue;
    b.x += b.vx;
    b.y += b.vy;
    b.vx *= 0.985;
    b.vy *= 0.985;
    if (Math.hypot(b.vx, b.vy) < 0.045) {
      b.vx = 0;
      b.vy = 0;
    } else {
      moving = true;
    }

    // Pocket detection
    for (const [px, py] of POOL_POCKETS) {
      if (Math.hypot(b.x - px, b.y - py) < POOL_POCKET_R) {
        b.pocketed = true;
        b.vx = 0;
        b.vy = 0;
        if (!pocketedThisShot.includes(b.id)) {
          pocketedThisShot.push(b.id);
        }
        break;
      }
    }
    if (b.pocketed) continue;

    // Cushion bounce
    if (b.x < minX) {
      b.x = minX;
      b.vx = -b.vx * 0.82;
    } else if (b.x > maxX) {
      b.x = maxX;
      b.vx = -b.vx * 0.82;
    }
    if (b.y < minY) {
      b.y = minY;
      b.vy = -b.vy * 0.82;
    } else if (b.y > maxY) {
      b.y = maxY;
      b.vy = -b.vy * 0.82;
    }
  }

  // Elastic ball-ball collisions
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.pocketed) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.pocketed) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const minDist = POOL_BALL_R * 2;
      if (dist > 0 && dist < minDist) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = (minDist - dist) * 0.5;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;

        const dvx = a.vx - b.vx;
        const dvy = a.vy - b.vy;
        const impact = dvx * nx + dvy * ny;
        if (impact > 0) {
          const impulse = impact * 0.94;
          a.vx -= impulse * nx;
          a.vy -= impulse * ny;
          b.vx += impulse * nx;
          b.vy += impulse * ny;
          moving = true;
        }
      }
    }
  }

  return moving;
}

function executePoolShot(
  state: PoolGameState,
  angle: number,
  power: number,
): PoolGameState {
  const startBalls: PoolBall[] = state.balls.map((b) => ({ ...b }));
  const simBalls: PoolBall[] = state.balls.map((b) => ({ ...b }));
  const cue = simBalls.find((b) => b.id === 0);
  if (!cue || cue.pocketed) return state;

  const speed = Math.max(1.5, Math.min(17.5, power));
  cue.vx = Math.cos(angle) * speed;
  cue.vy = Math.sin(angle) * speed;

  const pocketedThisShot: number[] = [];
  for (let step = 0; step < 900; step++) {
    if (!simulatePoolStep(simBalls, pocketedThisShot)) break;
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
    cue.x = 185;
    cue.y = POOL_H / 2;
    cue.vx = 0;
    cue.vy = 0;
  }

  const pocketedEight = pocketedThisShot.includes(8);
  const objectPocketed = pocketedThisShot.filter((id) => id !== 0 && id !== 8);

  // Assign Solids / Stripes if table was open and shooter legally pocketed an object ball
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
      statusText = `${opponent}'s turn to shoot`;
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
   GAME 6: QUORIDOR (1v1, 1v1v1, or 1v1v1v1 Online Strategy Maze + BFS Wall Check)
   ============================================================================ */

export interface QuoridorPawn {
  username: string;
  displayName: string;
  seat: number;
  r: number;
  c: number;
  goalType: 'row' | 'col';
  goalTarget: number;
  wallsLeft: number;
  color: string;
}

export interface QuoridorGameState {
  pawns: QuoridorPawn[];
  turnIndex: number;
  hWalls: string[]; // "r,c" top-left of 2-cell horizontal wall below row r (cols c and c+1)
  vWalls: string[]; // "r,c" top-left of 2-cell vertical wall right of col c (rows r and r+1)
  statusText: string;
  winnerUsername: string | null;
  winReason?: string;
}

const QUORIDOR_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b'];

export function createInitialQuoridorState(
  players: ActivityPlayerEntry[],
): QuoridorGameState {
  const count = Math.max(2, Math.min(4, players.length));
  const wallsPerPlayer = count === 2 ? 10 : count === 3 ? 6 : 5;
  const configs: Array<{ r: number; c: number; goalType: 'row' | 'col'; goalTarget: number }> = [
    { r: 8, c: 4, goalType: 'row', goalTarget: 0 }, // Bottom -> Top
    { r: 0, c: 4, goalType: 'row', goalTarget: 8 }, // Top -> Bottom
    { r: 4, c: 0, goalType: 'col', goalTarget: 8 }, // Left -> Right
    { r: 4, c: 8, goalType: 'col', goalTarget: 0 }, // Right -> Left
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
    // Horizontal step between col minC and minC+1 at row r1
    const minC = Math.min(c1, c2);
    return vWallSet.has(`${r1},${minC}`) || vWallSet.has(`${r1 - 1},${minC}`);
  }
  if (c1 === c2) {
    // Vertical step between row minR and minR+1 at col c1
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
      // Jump straight over adjacent pawn if unblocked
      const jr = nr + dr;
      const jc = nc + dc;
      if (
        !isQuoridorEdgeBlocked(nr, nc, jr, jc, hSet, vSet) &&
        !occupied.has(`${jr},${jc}`)
      ) {
        moves.push([jr, jc]);
      } else {
        // Diagonal sidestep jumps
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
    if (vSet.has(key)) return false; // Crossing perpendicular wall at same center
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
      return createInitialVexilloState(lobby.players);
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
  renderActivityStageTiles: (threadKey: string, inThisCall: boolean, onRequireJoinCall: (lobbyId: string) => void) => HTMLElement[];
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
  let expandedTarget:
    | { kind: 'browser'; threadKey: string; gameId: ActivityGameId }
    | { kind: 'lobby'; threadKey: string; lobbyId: string }
    | null = null;

  // Client-side UI selections that persist across re-renders
  let selectedBoardSquare: [number, number] | null = null;
  let minesweeperFlagMode = false;
  let quoridorTool: 'move' | 'hwall' | 'vwall' = 'move';
  let poolAimAngle = 0;
  let poolPower = 9.5;
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
    // If the user is already a player in a lobby for this game in this call, open that lobby directly!
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
      // Prefer above the VC controls bar if room, else below
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

  /** Renders theLobby Browser view for a selected game. */
  const renderGameBrowserView = (
    threadKey: string,
    gameId: ActivityGameId,
  ): HTMLElement => {
    const meta = getActivityGameMeta(gameId);
    const selfKey = getSelfKey();
    const wrap = document.createElement('div');
    wrap.className = 'vc-activity-browser';

    // Game Selector Tabs at top of Stage so user can switch games smoothly
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

    // Hero Create Bar
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

    // Filter Tabs (In This Call vs All Public Lobbies)
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

    // Lobby List
    const matchingLobbies = Array.from(lobbiesById.values()).filter(
      (l) =>
        l.gameId === gameId &&
        (lobbyScopeFilter === 'public' ? l.isPublic || l.threadKey === threadKey : l.threadKey === threadKey),
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

    const grid = document.createElement('div');
    grid.className = 'vc-chess-grid';

    const legalForSelected =
      selectedBoardSquare && isMyTurn
        ? getLegalChessMoves(state, selectedBoardSquare[0], selectedBoardSquare[1])
        : [];

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
        const isLastMove =
          (state.lastMove?.from[0] === r && state.lastMove?.from[1] === c) ||
          (state.lastMove?.to[0] === r && state.lastMove?.to[1] === c);
        const isCheckedKing =
          piece === `${state.inCheck}K`;

        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = `vc-chess-cell ${isLight ? 'vc-chess-cell--light' : 'vc-chess-cell--dark'}`;
        if (isSelected) cell.classList.add('vc-chess-cell--selected');
        if (isLegalDest) cell.classList.add('vc-chess-cell--legal');
        if (isLastMove) cell.classList.add('vc-chess-cell--last');
        if (isCheckedKing) cell.classList.add('vc-chess-cell--check');

        if (piece) {
          const pSpan = document.createElement('span');
          pSpan.className = `vc-chess-piece vc-chess-piece--${piece[0]}`;
          pSpan.textContent = CHESS_GLYPHS[piece] ?? '';
          cell.appendChild(pSpan);
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

    wrap.appendChild(grid);
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
    statusBanner.textContent = `${state.statusText} · Captured: Red ${state.redCaptured} / Black ${state.blackCaptured}`;
    wrap.appendChild(statusBanner);

    const grid = document.createElement('div');
    grid.className = 'vc-chess-grid';

    const legalForSelected =
      selectedBoardSquare && isMyTurn
        ? getCheckerLegalMovesForSquare(state, selectedBoardSquare[0], selectedBoardSquare[1])
        : [];

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

        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = `vc-chess-cell ${isLight ? 'vc-chess-cell--light' : 'vc-chess-cell--dark'}`;
        if (isSelected) cell.classList.add('vc-chess-cell--selected');
        if (isLegalDest) cell.classList.add('vc-chess-cell--legal');

        if (piece) {
          const disc = document.createElement('span');
          const pColor = piece.toLowerCase();
          const isKing = piece === 'R' || piece === 'B';
          disc.className = `vc-checker-disc vc-checker-disc--${pColor}${isKing ? ' vc-checker-disc--king' : ''}`;
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

    wrap.appendChild(grid);
    return wrap;
  };

  const renderMinesweeperBoard = (lobby: ActivityLobby, selfKey: string): HTMLElement => {
    const state: MinesweeperGameState =
      lobby.gameState ?? createInitialMinesweeperState(lobby.players);
    const wrap = document.createElement('div');
    wrap.className = 'vc-game-board-wrap';

    const myBoard: MinesweeperPlayerBoard = state.playerBoards?.[selfKey] ?? {
      revealed: [],
      flagged: [],
      status: 'playing',
    };
    const isSeated = lobby.players.some((p) => p.username.toLowerCase() === selfKey);
    const totalSafe = state.rows * state.cols - state.mineCount;

    // Live Progress Strip for all players
    const raceBar = document.createElement('div');
    raceBar.className = 'vc-mine-race-bar';
    for (const p of lobby.players) {
      const pKey = p.username.toLowerCase();
      const pb = state.playerBoards?.[pKey] ?? { revealed: [], flagged: [], status: 'playing' };
      const pct = Math.min(100, Math.round(((pb.revealed?.length ?? 0) / totalSafe) * 100));
      const chip = document.createElement('div');
      chip.className = `vc-mine-player-chip vc-mine-player-chip--${pb.status}`;
      chip.textContent = `${p.displayName}: 🚩 ${pb.flagged?.length ?? 0}/${state.mineCount} · ${pct}%${pb.status === 'exploded' ? ' 💥' : pb.status === 'won' ? ' 🏆' : ''}`;
      raceBar.appendChild(chip);
    }
    wrap.appendChild(raceBar);

    // Mode toggle (Reveal vs Flag) for mobile & desktop convenience
    const toolRow = document.createElement('div');
    toolRow.className = 'vc-mine-tool-row';
    const modeBtn = document.createElement('button');
    modeBtn.type = 'button';
    modeBtn.className = minesweeperFlagMode
      ? 'vc-activity-mode-pill vc-activity-mode-pill--active'
      : 'vc-activity-mode-pill';
    modeBtn.textContent = minesweeperFlagMode
      ? '🚩 Flag Mode (Tap to Flag)'
      : '⛏️ Dig Mode (Right-click or Toggle to Flag)';
    modeBtn.addEventListener('click', () => {
      minesweeperFlagMode = !minesweeperFlagMode;
      options.onStateChanged();
    });
    toolRow.appendChild(modeBtn);
    wrap.appendChild(toolRow);

    const grid = document.createElement('div');
    grid.className = 'vc-mine-grid';
    grid.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;

    const mineSet = new Set(state.mines ?? []);
    const revSet = new Set(myBoard.revealed ?? []);
    const flagSet = new Set(myBoard.flagged ?? []);
    const matchOver = Boolean(state.winnerUsername) || myBoard.status !== 'playing';

    const handleCellAction = (idx: number, isFlagAction: boolean) => {
      if (!isSeated || matchOver) return;
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
      const nextRev = new Set(revSet);
      const nextFlag = new Set(flagSet);
      let nextStatus: 'playing' | 'won' | 'exploded' = 'playing';
      let explodedIndex: number | undefined;

      if (isFlagAction) {
        if (nextRev.has(idx)) return;
        if (nextFlag.has(idx)) nextFlag.delete(idx);
        else nextFlag.add(idx);
      } else {
        if (nextFlag.has(idx) || nextRev.has(idx)) return;
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

      // Check win condition: all mines flagged accurately (with no extra flags) OR all safe cells revealed
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
        winReason = `${selfProf?.displayName ?? selfKey} flagged all mines first and won!`;
      } else if (nextStatus === 'exploded') {
        // First to lose loses! Award win to surviving opponent
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

      cell.addEventListener('click', () => {
        handleCellAction(idx, minesweeperFlagMode);
      });
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        handleCellAction(idx, true);
      });
      grid.appendChild(cell);
    }

    wrap.appendChild(grid);
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

    // Hearts / Lives Header
    const livesRow = document.createElement('div');
    livesRow.className = 'vc-vexillo-lives-row';
    for (const p of lobby.players) {
      const pKey = p.username.toLowerCase();
      const heartsCount = Math.max(0, state.lives?.[pKey] ?? 3);
      const scoreCount = state.scores?.[pKey] ?? 0;
      const card = document.createElement('div');
      card.className =
        pKey === activeUsername.toLowerCase() && !state.winnerUsername
          ? 'vc-vexillo-player vc-vexillo-player--turn'
          : 'vc-vexillo-player';
      const heartsStr = '❤️'.repeat(heartsCount) + '🖤'.repeat(Math.max(0, 3 - heartsCount));
      card.textContent = `${p.displayName}: ${heartsStr} (${scoreCount} pts)`;
      livesRow.appendChild(card);
    }
    wrap.appendChild(livesRow);

    if (state.lastFeedback) {
      const fb = document.createElement('div');
      fb.className = state.lastFeedback.isCorrect
        ? 'vc-vexillo-feedback vc-vexillo-feedback--ok'
        : 'vc-vexillo-feedback vc-vexillo-feedback--wrong';
      fb.textContent = state.lastFeedback.isCorrect
        ? `✓ ${state.lastFeedback.username} guessed ${state.lastFeedback.correctName}!`
        : `✗ ${state.lastFeedback.username} guessed ${state.lastFeedback.chosen} (Correct: ${state.lastFeedback.correctName}) — Lost 1 ❤️`;
      wrap.appendChild(fb);
    }

    // Flag display card (FlagCDN crisp SVG with tricolor SVG fallback)
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
      // Fallback to inline SVG tricolor if offline
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
        ? 'Your Turn! Click the correct country name for this flag:'
        : `Waiting for ${activeUsername} to guess this flag...`;
    wrap.appendChild(turnPrompt);

    // 4 Choice Buttons
    const choicesGrid = document.createElement('div');
    choicesGrid.className = 'vc-vexillo-choices';
    for (const choice of state.choices) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vc-vexillo-choice-btn';
      btn.disabled = !isMyTurn || Boolean(state.winnerUsername);
      btn.textContent = choice;
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
          winReason = `${activeUsername} ran out of lives — ${opponentName} wins VexilloGuessr!`;
        }

        const deal = dealNextVexilloRound(state.usedCodes);
        const nextState: VexilloGuessrGameState = {
          ...state,
          turnIndex: nextTurnIdx,
          lives: nextLives,
          scores: nextScores,
          currentFlagCode: deal.flag.code.toLowerCase(),
          currentFlagName: deal.flag.name,
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
    }
    wrap.appendChild(choicesGrid);
    return wrap;
  };

  const renderPoolBoard = (lobby: ActivityLobby, selfKey: string): HTMLElement => {
    const state: PoolGameState = lobby.gameState ?? createInitialPoolState(lobby.players);
    const wrap = document.createElement('div');
    wrap.className = 'vc-game-board-wrap vc-pool-wrap';

    const activeShooter = state.playerUsernames[state.turnIndex] ?? state.playerUsernames[0];
    const isMyTurn = !state.winnerUsername && activeShooter.toLowerCase() === selfKey;

    // Group assignment banner
    const groupInfo = lobby.players
      .map((p) => {
        const g = state.groups?.[p.username.toLowerCase()];
        return `${p.displayName}: ${g ? g.toUpperCase() : 'OPEN'}`;
      })
      .join(' · ');

    const statusBanner = document.createElement('div');
    statusBanner.className = 'vc-game-status-banner';
    statusBanner.textContent = `${state.statusText} (${groupInfo})`;
    wrap.appendChild(statusBanner);

    const canvas = document.createElement('canvas');
    canvas.className = 'vc-pool-canvas';
    canvas.width = POOL_W;
    canvas.height = POOL_H;
    wrap.appendChild(canvas);

    // Power & Shoot controls bar for desktop & mobile touch
    const controlsRow = document.createElement('div');
    controlsRow.className = 'vc-pool-controls';

    const powerLabel = document.createElement('span');
    powerLabel.className = 'vc-pool-power-label';
    powerLabel.textContent = `Power: ${Math.round((poolPower / 17.5) * 100)}%`;

    const powerSlider = document.createElement('input');
    powerSlider.type = 'range';
    powerSlider.className = 'vc-pool-power-slider';
    powerSlider.min = '2';
    powerSlider.max = '17.5';
    powerSlider.step = '0.5';
    powerSlider.value = String(poolPower);
    powerSlider.disabled = !isMyTurn;
    powerSlider.addEventListener('input', () => {
      poolPower = Number(powerSlider.value) || 9.5;
      powerLabel.textContent = `Power: ${Math.round((poolPower / 17.5) * 100)}%`;
    });

    const shootBtn = document.createElement('button');
    shootBtn.type = 'button';
    shootBtn.className = 'btn-primary vc-pool-shoot-btn';
    shootBtn.disabled = !isMyTurn;
    shootBtn.textContent = 'Shoot 🎱';
    shootBtn.addEventListener('click', () => {
      if (!isMyTurn) return;
      const nextState = executePoolShot(state, poolAimAngle, poolPower);
      options.sendActivityFrame({
        type: 'activity:action',
        lobbyId: lobby.id,
        gameState: nextState,
        status: nextState.winnerUsername ? 'finished' : 'playing',
        winnerUsername: nextState.winnerUsername || undefined,
      });
    });

    controlsRow.appendChild(powerLabel);
    controlsRow.appendChild(powerSlider);
    controlsRow.appendChild(shootBtn);
    wrap.appendChild(controlsRow);

    const ctx = canvas.getContext('2d');
    let displayBalls: PoolBall[] = state.balls.map((b) => ({ ...b }));

    const drawTable = (ballsToDraw: PoolBall[], showCueStick: boolean) => {
      if (!ctx) return;
      ctx.clearRect(0, 0, POOL_W, POOL_H);

      // Wood rails
      ctx.fillStyle = '#3b2314';
      ctx.fillRect(0, 0, POOL_W, POOL_H);

      // Felt surface
      ctx.fillStyle = '#0f6b48';
      ctx.fillRect(POOL_RAIL, POOL_RAIL, POOL_W - POOL_RAIL * 2, POOL_H - POOL_RAIL * 2);

      // Head string line
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(185, POOL_RAIL);
      ctx.lineTo(185, POOL_H - POOL_RAIL);
      ctx.stroke();

      // 6 Pockets
      for (const [px, py] of POOL_POCKETS) {
        ctx.beginPath();
        ctx.arc(px, py, POOL_POCKET_R, 0, Math.PI * 2);
        ctx.fillStyle = '#090a0d';
        ctx.fill();
      }

      // Aim line & cue stick when it's player's turn
      const cue = ballsToDraw.find((b) => b.id === 0 && !b.pocketed);
      if (cue && showCueStick && isMyTurn) {
        const rayLen = 190;
        const tx = cue.x + Math.cos(poolAimAngle) * rayLen;
        const ty = cue.y + Math.sin(poolAimAngle) * rayLen;
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(cue.x, cue.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.restore();

        // Cue stick behind cue ball
        const pullOffset = 18 + poolPower * 2.2;
        const stickStartX = cue.x - Math.cos(poolAimAngle) * pullOffset;
        const stickStartY = cue.y - Math.sin(poolAimAngle) * pullOffset;
        const stickEndX = cue.x - Math.cos(poolAimAngle) * (pullOffset + 125);
        const stickEndY = cue.y - Math.sin(poolAimAngle) * (pullOffset + 125);
        ctx.strokeStyle = '#f5d0a9';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(stickStartX, stickStartY);
        ctx.lineTo(stickEndX, stickEndY);
        ctx.stroke();
      }

      // Balls
      for (const b of ballsToDraw) {
        if (b.pocketed) continue;
        ctx.beginPath();
        ctx.arc(b.x, b.y, POOL_BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = b.id >= 9 ? '#ffffff' : POOL_BALL_COLORS[b.id] ?? '#ffffff';
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.stroke();

        if (b.id >= 9) {
          // Stripe band
          ctx.save();
          ctx.beginPath();
          ctx.arc(b.x, b.y, POOL_BALL_R, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillStyle = POOL_BALL_COLORS[b.id] ?? '#dc2626';
          ctx.fillRect(b.x - POOL_BALL_R, b.y - 5.5, POOL_BALL_R * 2, 11);
          ctx.restore();
        }

        if (b.id > 0) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, 4.8, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.fillStyle = '#111318';
          ctx.font = 'bold 6.5px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(b.id), b.x, b.y + 0.5);
        }
      }
    };

    const updateAimFromPointer = (e: PointerEvent) => {
      if (!isMyTurn) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = POOL_W / rect.width;
      const scaleY = POOL_H / rect.height;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;
      const cue = displayBalls.find((b) => b.id === 0 && !b.pocketed);
      if (!cue) return;
      poolAimAngle = Math.atan2(py - cue.y, px - cue.x);
      drawTable(displayBalls, true);
    };

    canvas.addEventListener('pointerdown', (e) => {
      updateAimFromPointer(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.buttons === 1 || e.pointerType === 'mouse') {
        updateAimFromPointer(e);
      }
    });

    // Animate last shot smoothly if a new shot sequence arrived
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
        let stillMoving = false;
        for (let k = 0; k < 3; k++) {
          if (simulatePoolStep(animBalls, dummyPocketed)) stillMoving = true;
        }
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

    // Player Wall Counts & Goal Direction Bar
    const infoStrip = document.createElement('div');
    infoStrip.className = 'vc-quoridor-players';
    const goalLabels = ['↑ Top Edge', '↓ Bottom Edge', '→ Right Edge', '← Left Edge'];
    state.pawns.forEach((p, idx) => {
      const chip = document.createElement('div');
      chip.className =
        idx === state.turnIndex && !state.winnerUsername
          ? 'vc-quoridor-chip vc-quoridor-chip--turn'
          : 'vc-quoridor-chip';
      chip.style.borderColor = p.color;
      chip.textContent = `${p.displayName} (${goalLabels[idx] ?? ''}) · 🧱 ${p.wallsLeft}`;
      infoStrip.appendChild(chip);
    });
    wrap.appendChild(infoStrip);

    // Tool Toggle: Move Pawn vs Horizontal Wall vs Vertical Wall
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

    // 9x9 cells
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

        const pawnHere = state.pawns.find((p) => p.r === r && p.c === c);
        if (pawnHere) {
          const pawnEl = document.createElement('span');
          pawnEl.className = 'vc-quoridor-pawn';
          pawnEl.style.background = pawnHere.color;
          pawnEl.title = pawnHere.displayName;
          cell.appendChild(pawnEl);
        }

        cell.addEventListener('click', () => {
          if (!isMyTurn) return;
          if (quoridorTool === 'move' && isLegalMove) {
            const nextPawns = state.pawns.map((p, idx) =>
              idx === state.turnIndex ? { ...p, r, c } : { ...p },
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
              winnerUsername: reachedGoal ? moved.username : null,
              winReason: reachedGoal
                ? `${moved.displayName} reached the opposite side and won Quoridor!`
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
              idx === state.turnIndex ? { ...p, wallsLeft: p.wallsLeft - 1 } : { ...p },
            );
            const nextTurn = (state.turnIndex + 1) % nextPawns.length;
            const nextState: QuoridorGameState = {
              ...state,
              pawns: nextPawns,
              turnIndex: nextTurn,
              hWalls: orient === 'h' ? [...state.hWalls, `${r},${c}`] : state.hWalls,
              vWalls: orient === 'v' ? [...state.vWalls, `${r},${c}`] : state.vWalls,
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

    // Render placed Horizontal & Vertical walls overlay
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

    // Scoreboard & Seat Strip
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

    if (isSeated && lobby.status === 'finished' && lobby.players.length >= 2) {
      const rematchBtn = document.createElement('button');
      rematchBtn.type = 'button';
      rematchBtn.className = 'btn-primary vc-activity-sm-btn';
      rematchBtn.textContent = 'Rematch ↻';
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
      leaveLobbyBtn.textContent = 'Leave Lobby';
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

    // Victory Banner if finished
    if (lobby.status === 'finished') {
      const winBanner = document.createElement('div');
      winBanner.className = 'vc-activity-win-banner';
      const reason =
        lobby.gameState?.winReason ||
        (lobby.gameState?.winnerUsername
          ? `🏆 ${lobby.gameState.winnerUsername} won the match!`
          : 'Match finished — Draw!');
      winBanner.textContent = reason;
      container.appendChild(winBanner);
    }

    // Render specific game board
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

  /** Renders the expanded big-screen Activity stage above `.vc-top-stage`, just like `.vc-expanded-stage` for streams! */
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
      // If self just created this lobby, automatically watch & expand it for self ONLY (never force others!)
      if (isNew && lobby.hostUsername.toLowerCase() === selfKey) {
        watchedLobbyIds.add(lobby.id);
        expandedTarget = { kind: 'lobby', threadKey: lobby.threadKey, lobbyId: lobby.id };
      }
      // Auto-start 2-player waiting lobby as soon as 2nd player joins if gameState isn't initialized yet
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
      if (expandedTarget?.kind === 'lobby' && expandedTarget.lobbyId === lobbyId) {
        expandedTarget = null;
      }
      options.onStateChanged();
    },
    getCallLobbies,
    isLobbyWatched: (lobbyId) => watchedLobbyIds.has(lobbyId),
    isStageExpandedForCall: (threadKey) => Boolean(expandedTarget && expandedTarget.threadKey === threadKey),
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
