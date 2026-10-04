/** Core chess types shared by rules engine, AI and UI. */

export type Color = 'w' | 'b';

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  color: Color;
  type: PieceType;
}

/** 0..63, a8 = 0 ... h1 = 63 (rank 8 first, files a-h left to right). */
export type Square = number;

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1';

export const A1 = 56, B1 = 57, C1 = 58, D1 = 59, E1 = 60, F1 = 61, G1 = 62, H1 = 63;
export const A8 = 0, B8 = 1, C8 = 2, D8 = 3, E8 = 4, F8 = 5, G8 = 6, H8 = 7;

export function fileOf(sq: Square): number { return sq & 7; }
export function rankOf(sq: Square): number { return sq >> 3; }

export function squareName(sq: Square): string {
  return String.fromCharCode(97 + fileOf(sq)) + String(8 - rankOf(sq));
}

export function squareFromName(name: string): Square {
  const f = name.charCodeAt(0) - 97;
  const r = 8 - Number(name[1]);
  return r * 8 + f;
}

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** Castling rights bit flags. */
export const CASTLE_WK = 1, CASTLE_WQ = 2, CASTLE_BK = 4, CASTLE_BQ = 8;
export type CastleFlags = number;

export interface Move {
  from: Square;
  to: Square;
  /** Promotion piece type (lowercase) if this is a promotion. */
  promo?: PieceType;
  flags: number;
}

export const FLAG_CAPTURE = 1;
export const FLAG_DOUBLE_PAWN = 2;
export const FLAG_EP_CAPTURE = 4;
export const FLAG_KSIDE_CASTLE = 8;
export const FLAG_QSIDE_CASTLE = 16;

export interface Position {
  /** 64 squares, null = empty; index 0 = a8 ... 63 = h1. */
  board: (Piece | null)[];
  turn: Color;
  castling: CastleFlags;
  /** En-passant target square (the square behind the double-pushed pawn) or -1. */
  ep: Square;
  halfmove: number;
  fullmove: number;
}

export type GameResultKind =
  | 'checkmate'
  | 'stalemate'
  | 'fifty-move'
  | 'threefold'
  | 'insufficient-material'
  | 'resign'
  | 'timeout'
  | 'agreement';

export interface GameResult {
  /** Winner color, or null for a draw. */
  winner: Color | null;
  kind: GameResultKind;
}

export type Termination = 'checkmate' | 'stalemate' | 'draw' | 'resign' | 'timeout' | 'agreement';

export interface EndInfo {
  over: boolean;
  termination?: Termination;
  result: GameResult | null;
}

export interface HistoryEntry {
  san: string;
  move: Move;
  /** FEN before the move. */
  fenBefore: string;
  /** Milliseconds left on the mover's clock after the move. */
  clockAfterMs: number | null;
  captured?: PieceType;
}
