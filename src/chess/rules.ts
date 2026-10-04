import {
  CASTLE_BK, CASTLE_BQ, CASTLE_WK, CASTLE_WQ,
  FLAG_CAPTURE, FLAG_DOUBLE_PAWN, FLAG_EP_CAPTURE, FLAG_KSIDE_CASTLE, FLAG_QSIDE_CASTLE,
  type Color, type EndInfo, type HistoryEntry, type Move, type Piece,
  type PieceType, type Position, type Square, START_FEN,
  fileOf, other, rankOf, squareFromName, squareName,
} from './types';

/* ------------------------------------------------------------------ */
/* FEN                                                                */
/* ------------------------------------------------------------------ */

export function parseFen(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) throw new Error('Invalid FEN: ' + fen);
  const [placement, turn, castling, ep, halfmove, fullmove] = parts;
  const board: (Piece | null)[] = new Array(64).fill(null);
  let sq = 0;
  for (const ch of placement) {
    if (ch === '/') continue;
    if (ch >= '1' && ch <= '8') { sq += Number(ch); continue; }
    const color: Color = ch === ch.toUpperCase() ? 'w' : 'b';
    const type = ch.toLowerCase() as PieceType;
    if (sq > 63) throw new Error('Invalid FEN placement: ' + fen);
    board[sq++] = { color, type };
  }
  if (sq !== 64) throw new Error('Invalid FEN placement length: ' + fen);
  let castleFlags = 0;
  if (castling.includes('K')) castleFlags |= CASTLE_WK;
  if (castling.includes('Q')) castleFlags |= CASTLE_WQ;
  if (castling.includes('k')) castleFlags |= CASTLE_BK;
  if (castling.includes('q')) castleFlags |= CASTLE_BQ;
  return {
    board,
    turn: turn === 'w' ? 'w' : 'b',
    castling: castleFlags,
    ep: ep && ep !== '-' ? squareFromName(ep) : -1,
    halfmove: Number(halfmove) || 0,
    fullmove: Number(fullmove) || 1,
  };
}

export function toFen(p: Position): string {
  let placement = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const piece = p.board[r * 8 + f];
      if (!piece) { empty++; continue; }
      if (empty) { placement += String(empty); empty = 0; }
      placement += piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
    }
    if (empty) placement += String(empty);
    if (r < 7) placement += '/';
  }
  let castling = '';
  if (p.castling & CASTLE_WK) castling += 'K';
  if (p.castling & CASTLE_WQ) castling += 'Q';
  if (p.castling & CASTLE_BK) castling += 'k';
  if (p.castling & CASTLE_BQ) castling += 'q';
  return [
    placement,
    p.turn,
    castling || '-',
    p.ep >= 0 ? squareName(p.ep) : '-',
    p.halfmove,
    p.fullmove,
  ].join(' ');
}

export function clonePosition(p: Position): Position {
  return {
    board: p.board.slice(),
    turn: p.turn,
    castling: p.castling,
    ep: p.ep,
    halfmove: p.halfmove,
    fullmove: p.fullmove,
  };
}

/* ------------------------------------------------------------------ */
/* Attack detection                                                    */
/* ------------------------------------------------------------------ */

const KNIGHT_DELTAS = [-17, -15, -10, -6, 6, 10, 15, 17];
const KING_DELTAS = [-9, -8, -7, -1, 1, 7, 8, 9];
const BISHOP_DELTAS = [-9, -7, 7, 9];
const ROOK_DELTAS = [-8, -1, 1, 8];

/** Chebyshev distance-based file wrap guard for delta moves. */
function fileDelta(a: Square, b: Square): number {
  return Math.abs(fileOf(a) - fileOf(b));
}

export function findKing(p: Position, color: Color): Square {
  for (let sq = 0; sq < 64; sq++) {
    const pc = p.board[sq];
    if (pc && pc.type === 'k' && pc.color === color) return sq;
  }
  return -1;
}

export function isAttacked(p: Position, sq: Square, by: Color): boolean {
  const board = p.board;

  // Pawns: a white pawn attacks downward the index space (towards rank 1 is upward for black).
  // White pawn on e4 attacks d5/f5 => attacker squares are sq+7 and sq+9.
  // Black pawn on c7 attacks b6/d6 => attacker squares are sq-7 and sq-9.
  const pawnFrom = by === 'w' ? sq + 7 : sq - 9;
  const pawnFrom2 = by === 'w' ? sq + 9 : sq - 7;
  for (const from of [pawnFrom, pawnFrom2]) {
    if (from < 0 || from > 63) continue;
    if (fileDelta(from, sq) !== 1) continue;
    const pc = board[from];
    if (pc && pc.type === 'p' && pc.color === by) return true;
  }

  // Knights
  for (const d of KNIGHT_DELTAS) {
    const from = sq + d;
    if (from < 0 || from > 63) continue;
    if (fileDelta(from, sq) !== 2 && fileDelta(from, sq) !== 1) continue;
    const pc = board[from];
    if (pc && pc.type === 'n' && pc.color === by) return true;
  }

  // King
  for (const d of KING_DELTAS) {
    const from = sq + d;
    if (from < 0 || from > 63) continue;
    if (fileDelta(from, sq) > 1) continue;
    const pc = board[from];
    if (pc && pc.type === 'k' && pc.color === by) return true;
  }

  // Sliders
  for (const d of BISHOP_DELTAS) {
    let from = sq + d;
    while (from >= 0 && from <= 63 && fileDelta(from, from - d) === 1) {
      const pc = board[from];
      if (pc) {
        if (pc.color === by && (pc.type === 'b' || pc.type === 'q')) return true;
        break;
      }
      from += d;
    }
  }
  for (const d of ROOK_DELTAS) {
    let from = sq + d;
    while (from >= 0 && from <= 63 && (d === -8 || d === 8 || fileDelta(from, from - d) === 1)) {
      const pc = board[from];
      if (pc) {
        if (pc.color === by && (pc.type === 'r' || pc.type === 'q')) return true;
        break;
      }
      from += d;
    }
  }
  return false;
}

export function inCheck(p: Position, color: Color): boolean {
  const k = findKing(p, color);
  return k >= 0 && isAttacked(p, k, other(color));
}

/* ------------------------------------------------------------------ */
/* Move generation                                                     */
/* ------------------------------------------------------------------ */

const PROMO_PIECES: PieceType[] = ['q', 'r', 'b', 'n'];

function addPawnMoves(p: Position, from: Square, color: Color, out: Move[]): void {
  const dir = color === 'w' ? -8 : 8;
  const startRank = color === 'w' ? 6 : 1;
  const promoRank = color === 'w' ? 0 : 7;
  const board = p.board;
  const f = fileOf(from);

  // Pushes
  const one = from + dir;
  if (one >= 0 && one <= 63 && !board[one]) {
    if (rankOf(one) === promoRank) {
      for (const promo of PROMO_PIECES) out.push({ from, to: one, flags: 0, promo });
    } else {
      out.push({ from, to: one, flags: 0 });
      const two = one + dir;
      if (rankOf(from) === startRank && !board[two]) {
        out.push({ from, to: two, flags: FLAG_DOUBLE_PAWN });
      }
    }
  }

  // Captures
  for (const dd of [-1, 1]) {
    const to = from + dir + dd;
    if (to < 0 || to > 63) continue;
    if (Math.abs(fileOf(to) - f) !== 1) continue;
    const target = board[to];
    if (target && target.color !== color) {
      if (rankOf(to) === promoRank) {
        for (const promo of PROMO_PIECES) out.push({ from, to, flags: FLAG_CAPTURE, promo });
      } else {
        out.push({ from, to, flags: FLAG_CAPTURE });
      }
    } else if (to === p.ep && !target) {
      out.push({ from, to, flags: FLAG_EP_CAPTURE | FLAG_CAPTURE });
    }
  }
}

function addPieceMoves(p: Position, from: Square, color: Color, type: PieceType, out: Move[]): void {
  const slide = type === 'b' ? BISHOP_DELTAS : type === 'r' ? ROOK_DELTAS : type === 'q' ? [...BISHOP_DELTAS, ...ROOK_DELTAS] : [];
  if (type === 'n' || type === 'k') {
    const deltas = type === 'n' ? KNIGHT_DELTAS : KING_DELTAS;
    for (const d of deltas) {
      const to = from + d;
      if (to < 0 || to > 63) continue;
      const fd = fileDelta(from, to);
      if (type === 'n' ? fd !== 1 && fd !== 2 : fd > 1) continue;
      const target = p.board[to];
      if (target && target.color === color) continue;
      out.push({ from, to, flags: target ? FLAG_CAPTURE : 0 });
    }
    return;
  }
  for (const d of slide) {
    let to = from + d;
    while (to >= 0 && to <= 63) {
      const fd = Math.abs(fileOf(to) - fileOf(to - d));
      if ((d === -8 || d === 8) ? fd !== 0 : fd !== 1) break;
      const target = p.board[to];
      if (target) {
        if (target.color !== color) out.push({ from, to, flags: FLAG_CAPTURE });
        break;
      }
      out.push({ from, to, flags: 0 });
      to += d;
    }
  }
}

function pushWithLegality(p: Position, m: Move, out: Move[]): void {
  // Tentatively apply and verify own king is not left in check.
  const piece = p.board[m.from]!;
  const captured = p.board[m.to];
  const epVictim = m.flags & FLAG_EP_CAPTURE
    ? p.board[m.to + (piece.color === 'w' ? 8 : -8)]
    : null;
  p.board[m.to] = piece;
  p.board[m.from] = null;
  if (epVictim) p.board[m.to + (piece.color === 'w' ? 8 : -8)] = null;
  const legal = !inCheck(p, piece.color);
  p.board[m.from] = piece;
  p.board[m.to] = captured;
  if (epVictim) p.board[m.to + (piece.color === 'w' ? 8 : -8)] = epVictim;
  if (legal) out.push(m);
}

/** All legal moves for the side to move. */
export function generateLegalMoves(p: Position): Move[] {
  const out: Move[] = [];
  const color = p.turn;
  for (let from = 0; from < 64; from++) {
    const piece = p.board[from];
    if (!piece || piece.color !== color) continue;
    if (piece.type === 'p') {
      addPawnMoves(p, from, color, out);
    } else {
      addPieceMoves(p, from, color, piece.type, out);
    }
  }

  // Castling
  const k = findKing(p, color);
  if (k >= 0 && !isAttacked(p, k, other(color))) {
    const kingSide = color === 'w' ? CASTLE_WK : CASTLE_BK;
    const queenSide = color === 'w' ? CASTLE_WQ : CASTLE_BQ;
    const home = color === 'w' ? 60 : 4;
    if (k === home && (p.castling & kingSide) &&
        !p.board[home + 1] && !p.board[home + 2] &&
        !isAttacked(p, home + 1, other(color)) && !isAttacked(p, home + 2, other(color))) {
      out.push({ from: home, to: home + 2, flags: FLAG_KSIDE_CASTLE });
    }
    if (k === home && (p.castling & queenSide) &&
        !p.board[home - 1] && !p.board[home - 2] && !p.board[home - 3] &&
        !isAttacked(p, home - 1, other(color)) && !isAttacked(p, home - 2, other(color))) {
      out.push({ from: home, to: home - 2, flags: FLAG_QSIDE_CASTLE });
    }
  }

  // Legality filter (handles pins, ep reveals, etc.)
  const legal: Move[] = [];
  for (const m of out) pushWithLegality(p, m, legal);
  return legal;
}

/** True if the move (already legal) gives check. */
export function givesCheck(p: Position, m: Move): boolean {
  const undo = makeMove(p, m);
  const chk = inCheck(p, p.turn);
  unmakeMove(p, m, undo);
  return chk;
}

/* ------------------------------------------------------------------ */
/* Make / unmake                                                       */
/* ------------------------------------------------------------------ */

export interface Undo {
  captured?: Piece | null;
  epVictim?: Piece | null;
  prevCastling: number;
  prevEp: number;
  prevHalfmove: number;
  prevFullmove: number;
}

export function makeMove(p: Position, m: Move): Undo {
  const piece = p.board[m.from]!;
  const undo: Undo = {
    captured: p.board[m.to],
    epVictim: null,
    prevCastling: p.castling,
    prevEp: p.ep,
    prevHalfmove: p.halfmove,
    prevFullmove: p.fullmove,
  };

  p.halfmove = piece.type === 'p' || (m.flags & FLAG_CAPTURE) ? 0 : p.halfmove + 1;
  p.ep = -1;

  p.board[m.from] = null;
  if (m.flags & FLAG_EP_CAPTURE) {
    const capSq = m.to + (piece.color === 'w' ? 8 : -8);
    undo.epVictim = p.board[capSq];
    p.board[capSq] = null;
  }
  p.board[m.to] = m.promo ? { color: piece.color, type: m.promo } : piece;

  if (m.flags & FLAG_DOUBLE_PAWN) {
    p.ep = (m.from + m.to) / 2;
  }

  if (m.flags & FLAG_KSIDE_CASTLE) {
    p.board[m.to - 1] = p.board[m.to + 1];
    p.board[m.to + 1] = null;
  } else if (m.flags & FLAG_QSIDE_CASTLE) {
    p.board[m.to + 1] = p.board[m.to - 2];
    p.board[m.to - 2] = null;
  }

  // Castling rights: king moved, rook moved, or rook captured.
  if (piece.type === 'k') p.castling &= piece.color === 'w' ? ~(CASTLE_WK | CASTLE_WQ) : ~(CASTLE_BK | CASTLE_BQ);
  if (m.from === 63 || m.to === 63) p.castling &= ~CASTLE_WK;
  if (m.from === 56 || m.to === 56) p.castling &= ~CASTLE_WQ;
  if (m.from === 7 || m.to === 7) p.castling &= ~CASTLE_BK;
  if (m.from === 0 || m.to === 0) p.castling &= ~CASTLE_BQ;

  if (p.turn === 'b') p.fullmove++;
  p.turn = other(p.turn);
  return undo;
}

export function unmakeMove(p: Position, m: Move, undo: Undo): void {
  const moved = p.board[m.to]!;
  const origColor = p.turn === 'w' ? 'b' : 'w'; // side that just moved
  p.turn = origColor;
  if (origColor === 'b') p.fullmove--;

  p.board[m.from] = m.promo ? { color: origColor, type: 'p' } : moved;
  p.board[m.to] = undo.captured ?? null;

  if (m.flags & FLAG_EP_CAPTURE) {
    const capSq = m.to + (origColor === 'w' ? 8 : -8);
    p.board[capSq] = undo.epVictim ?? { color: other(origColor), type: 'p' };
    p.board[m.to] = null;
  }

  if (m.flags & FLAG_KSIDE_CASTLE) {
    p.board[m.to + 1] = p.board[m.to - 1];
    p.board[m.to - 1] = null;
  } else if (m.flags & FLAG_QSIDE_CASTLE) {
    p.board[m.to - 2] = p.board[m.to + 1];
    p.board[m.to + 1] = null;
  }

  p.castling = undo.prevCastling;
  p.ep = undo.prevEp;
  p.halfmove = undo.prevHalfmove;
  p.fullmove = undo.prevFullmove;
}

/* ------------------------------------------------------------------ */
/* SAN                                                                 */
/* ------------------------------------------------------------------ */

const SAN_LETTER: Record<PieceType, string> = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };

export function moveToSan(p: Position, m: Move): string {
  const piece = p.board[m.from]!;
  if (m.flags & FLAG_KSIDE_CASTLE) return finishSan(p, m, 'O-O');
  if (m.flags & FLAG_QSIDE_CASTLE) return finishSan(p, m, 'O-O-O');

  let san = SAN_LETTER[piece.type];
  if (piece.type === 'p') {
    if (m.flags & FLAG_CAPTURE) san += 'abcdefgh'[fileOf(m.from)] + 'x';
    san += squareName(m.to);
    if (m.promo) san += '=' + SAN_LETTER[m.promo];
  } else {
    // Disambiguation
    const others = generateLegalMoves(p).filter(
      (o) => o.to === m.to && o.from !== m.from && p.board[o.from]?.type === piece.type,
    );
    if (others.length) {
      const sameFile = others.some((o) => fileOf(o.from) === fileOf(m.from));
      const sameRank = others.some((o) => rankOf(o.from) === rankOf(m.from));
      if (!sameFile) san += 'abcdefgh'[fileOf(m.from)];
      else if (!sameRank) san += String(8 - rankOf(m.from));
      else san += squareName(m.from);
    }
    if (m.flags & FLAG_CAPTURE) san += 'x';
    san += squareName(m.to);
  }
  return finishSan(p, m, san);
}

function finishSan(p: Position, m: Move, san: string): string {
  const undo = makeMove(p, m);
  const opponentInCheck = inCheck(p, p.turn);
  const hasMoves = generateLegalMoves(p).length > 0;
  unmakeMove(p, m, undo);
  if (opponentInCheck) san += hasMoves ? '+' : '#';
  return san;
}

export function sanToMove(p: Position, san: string): Move | null {
  const clean = san.replace(/[+#!?]/g, '');
  const moves = generateLegalMoves(p);
  for (const m of moves) {
    if (moveToSan(p, m).replace(/[+#!?]/g, '') === clean) return m;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Game end detection                                                  */
/* ------------------------------------------------------------------ */

export function isInsufficientMaterial(p: Position): boolean {
  const pieces: { color: Color; type: PieceType; sq: Square }[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const pc = p.board[sq];
    if (pc && pc.type !== 'k') pieces.push({ color: pc.color, type: pc.type, sq });
  }
  if (pieces.length === 0) return true;
  if (pieces.some((x) => x.type === 'p' || x.type === 'q' || x.type === 'r')) return false;
  const knights = pieces.filter((x) => x.type === 'n');
  const bishops = pieces.filter((x) => x.type === 'b');
  if (knights.length === 1 && bishops.length === 0) return true; // K+N vs K
  if (bishops.length === 1 && knights.length === 0) return true; // K+B vs K
  if (bishops.length >= 2 && knights.length === 0) {
    // All bishops (both sides) on same color squares -> dead position
    const colors = new Set(bishops.map((b) => (fileOf(b.sq) + rankOf(b.sq)) % 2));
    return colors.size === 1;
  }
  return false;
}

export function positionKey(p: Position): string {
  return toFen(p).split(' ').slice(0, 4).join(' ');
}

export interface GameStatus extends EndInfo {
  check: boolean;
}

export function getStatus(p: Position, repetitionKeys?: string[]): GameStatus {
  const check = inCheck(p, p.turn);
  const moves = generateLegalMoves(p);
  if (moves.length === 0) {
    if (check) {
      return {
        over: true, check,
        termination: 'checkmate',
        result: { winner: other(p.turn), kind: 'checkmate' },
      };
    }
    return { over: true, check, termination: 'stalemate', result: { winner: null, kind: 'stalemate' } };
  }
  if (p.halfmove >= 100) {
    return { over: true, check, termination: 'draw', result: { winner: null, kind: 'fifty-move' } };
  }
  if (repetitionKeys) {
    const key = positionKey(p);
    let count = 0;
    for (const k of repetitionKeys) if (k === key) count++;
    if (count >= 3) {
      return { over: true, check, termination: 'draw', result: { winner: null, kind: 'threefold' } };
    }
  }
  if (isInsufficientMaterial(p)) {
    return { over: true, check, termination: 'draw', result: { winner: null, kind: 'insufficient-material' } };
  }
  return { over: false, check, termination: undefined, result: null };
}

export function startGame(): Position {
  return parseFen(START_FEN);
}

export function historyEntryFrom(p: Position, m: Move, clockAfterMs: number | null): HistoryEntry {
  const captured = p.board[m.to]?.type ?? (m.flags & FLAG_EP_CAPTURE ? 'p' : undefined);
  return {
    san: moveToSan(p, m),
    move: { ...m },
    fenBefore: toFen(p),
    clockAfterMs,
    captured,
  };
}

export { fileOf, rankOf, squareName, squareFromName, other };
