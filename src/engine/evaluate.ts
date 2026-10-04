import { findKing } from '../chess/rules';
import { type Color, type PieceType, type Position, type Square, fileOf, rankOf } from '../chess/types';

/* Piece values in centipawns */
export const PIECE_VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/* Piece-square tables from white's perspective, index 0 = a8 ... 63 = h1 */
const PST_PAWN = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
];
const PST_KNIGHT = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];
const PST_BISHOP = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
];
const PST_ROOK = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0,
];
const PST_QUEEN = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
   -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20,
];
const PST_KING_MG = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20,
];
const PST_KING_EG = [
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50,
];

const PST: Record<PieceType, number[]> = {
  p: PST_PAWN, n: PST_KNIGHT, b: PST_BISHOP, r: PST_ROOK, q: PST_QUEEN,
  k: PST_KING_MG,
};

/** Mirror square for black (vertical flip). */
const mirror = (sq: Square): Square => sq ^ 56;

export function evaluate(p: Position): number {
  let mgScore = 0;
  let egScore = 0;
  let phaseMaterial = 0;

  for (let sq = 0; sq < 64; sq++) {
    const pc = p.board[sq];
    if (!pc) continue;
    if (pc.type !== 'p' && pc.type !== 'k') phaseMaterial += PIECE_VALUE[pc.type];
    const idx = pc.color === 'w' ? sq : mirror(sq);
    const pst = pc.type === 'k' ? 0 : PST[pc.type][idx];
    const sign = pc.color === 'w' ? 1 : -1;
    mgScore += sign * (PIECE_VALUE[pc.type] + pst);
    const egPst = pc.type === 'k' ? PST_KING_EG[idx] : pst;
    egScore += sign * (PIECE_VALUE[pc.type] + egPst);
  }

  // King safety: pawn shield in front of a castled king (midgame only)
  mgScore += pawnShield(p, 'w') - pawnShield(p, 'b');

  // Bishop pair bonus
  let wb = 0, bb = 0;
  for (const pc of p.board) {
    if (pc?.type === 'b') pc.color === 'w' ? wb++ : bb++;
  }
  if (wb >= 2) mgScore += 30, egScore += 40;
  if (bb >= 2) mgScore -= 30, egScore -= 40;

  // Tapered eval: interpolate midgame -> endgame by remaining material
  const maxPhase = 2 * (2 * 320 + 2 * 330 + 2 * 500 + 900); // both sides full army
  const phase = Math.min(1, phaseMaterial / maxPhase);
  const score = Math.round(mgScore * phase + egScore * (1 - phase));

  return p.turn === 'w' ? score : -score;
}

function pawnShield(p: Position, color: Color): number {
  const k = findKing(p, color);
  if (k < 0) return 0;
  const f = fileOf(k);
  let shield = 0;
  for (let df = -1; df <= 1; df++) {
    const pf = f + df;
    if (pf < 0 || pf > 7) continue;
    // White's pawn shield sits towards rank 1 (higher index); black's towards rank 8 (lower index).
    for (const dr of color === 'w' ? [-1, -2] : [1, 2]) {
      const pr = rankOf(k) + dr;
      if (pr < 0 || pr > 7) continue;
      const sq = pr * 8 + pf;
      const pc = p.board[sq];
      if (pc && pc.type === 'p' && pc.color === color) { shield += dr === 1 || dr === -1 ? 12 : 6; break; }
    }
  }
  return shield;
}
