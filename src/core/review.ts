import {
  parseFen, makeMove, unmakeMove, generateLegalMoves, moveToSan, isAttacked, toFen,
} from '../chess/rules';
import { other, type Color, type Move, type Position } from '../chess/types';
import { evaluate, PIECE_VALUE } from '../engine/evaluate';
import { chooseMove, type AiLevelSpec } from '../engine/search';

export type Classification =
  | 'book' | 'brilliant' | 'best' | 'excellent' | 'good'
  | 'inaccuracy' | 'mistake' | 'blunder';

export const CLASS_META: Record<Classification, { label: string; icon: string; color: string }> = {
  book: { label: 'Book', icon: '📖', color: '#b0b7c3' },
  brilliant: { label: 'Brilliant', icon: '!!', color: '#00c7b7' },
  best: { label: 'Best', icon: '★', color: '#81b64c' },
  excellent: { label: 'Excellent', icon: '✓', color: '#95bb4a' },
  good: { label: 'Good', icon: '✓', color: '#a3b5a3' },
  inaccuracy: { label: 'Inaccuracy', icon: '?!', color: '#f7c631' },
  mistake: { label: 'Mistake', icon: '?', color: '#ffa459' },
  blunder: { label: 'Blunder', icon: '??', color: '#fa412d' },
};

export interface ReviewItem {
  ply: number;          // 1-based
  san: string;
  color: Color;
  classification: Classification;
  lossCp: number;
  bestSan: string;
}

export interface ReviewSideSummary {
  accuracy: number;
  acpl: number; // average centipawn loss
  counts: Record<Classification, number>;
}

export interface ReviewResult {
  items: ReviewItem[];
  white: ReviewSideSummary;
  black: ReviewSideSummary;
}

const REVIEW_SPEC: AiLevelSpec = {
  id: 'advanced', name: 'Reviewer', elo: 1500,
  depth: 3, blunderChance: 0, timeMs: 1200, noise: 0, quiescence: true,
};

/** Small opening book (very common first moves by ply). */
const BOOK: string[][] = [
  // ply 1 (white)
  ['e4', 'd4', 'Nf3', 'c4', 'b3', 'g3', 'Nc3', 'e3', 'd3', 'c3', 'f4', 'g4', 'h4', 'b4'],
  // ply 2 (black)
  ['e5', 'c5', 'e6', 'c6', 'd5', 'd6', 'Nf6', 'Nc6', 'g6', 'a6', 'b6', 'h6', 'Nf6'],
  ['Nf6', 'Nc6', 'Bc4', 'Bb5', 'Be2', 'Bd3', 'Bc4', 'Bb5+', 'd4', 'Nc3', 'c3', 'f4'],
  ['Nf6', 'Nc6', 'Bc5', 'Be7', 'Bc4', 'Be7', 'd6', 'd5', 'e5', 'Qc7', 'a6'],
  ['Nf6', 'Nc6', 'Bb4', 'Be7', 'Bd6', 'Bc5', 'Nbd7', 'd5', 'e5', 'c6'],
  ['Nf6', 'Nc6', 'Be7', 'Bd6', 'Bc5', 'Nf6', 'h6', 'c5', 'c6', 'd5'],
  ['Nf6', 'Nc6', 'Re8', 'O-O', 'Be7', 'Nd7', 'Bd6', 'Qc7', 'b5', 'c5'],
  ['Nf6', 'Nc6', 'O-O', 'Be7', 'Re8', 'Qb6', 'Qc7', 'a6', 'b5', 'd5'],
];

function bookClassify(plyIdx: number, san: string): boolean {
  if (plyIdx >= BOOK.length) return false;
  const clean = san.replace(/[+#]/g, '');
  return BOOK[plyIdx].includes(clean);
}

function emptyCounts(): Record<Classification, number> {
  return { book: 0, brilliant: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
}

/** Loss in cp -> classification. */
function classifyLoss(lossCp: number, isBook: boolean, sacrificeAndBest: boolean): Classification {
  if (isBook) return 'book';
  if (sacrificeAndBest) return 'brilliant';
  if (lossCp <= 15) return 'best';
  if (lossCp <= 50) return 'excellent';
  if (lossCp <= 100) return 'good';
  if (lossCp <= 200) return 'inaccuracy';
  if (lossCp <= 350) return 'mistake';
  return 'blunder';
}

/** Rough sacrifice detector: moved piece lands where a cheaper enemy piece can take it. */
function isSacrifice(posBefore: Position, m: Move): boolean {
  const piece = posBefore.board[m.from]!;
  if (piece.type === 'p' || piece.type === 'k') return false;
  const captured = posBefore.board[m.to];
  const pos = parseFen(toFen(posBefore)); // work on a copy
  makeMove(pos, m);
  const attacked = isAttacked(pos, m.to, other(piece.color));
  if (!attacked) return false;
  // Find cheapest attacker value
  let cheapest = 9999;
  // approximate via generateLegalMoves for opponent on copied position: they could capture on m.to
  const oppMoves = generateLegalMoves(pos);
  for (const om of oppMoves) {
    if (om.to === m.to) {
      const attacker = pos.board[om.from];
      if (attacker) cheapest = Math.min(cheapest, PIECE_VALUE[attacker.type]);
    }
  }
  const gained = captured ? PIECE_VALUE[captured.type] : 0;
  return PIECE_VALUE[piece.type] - gained > 120 && cheapest < PIECE_VALUE[piece.type];
}

/** Accuracy from average centipawn loss (lichess-like curve, clamped). */
function accuracyFromAcpl(acpl: number): number {
  const a = 103.1668 * Math.exp(-0.04354 * acpl) - 3.1669;
  return Math.max(20, Math.min(99.9, Math.round(a * 10) / 10));
}

export async function reviewGame(
  fens: string[], sans: string[], onProgress?: (done: number, total: number) => void,
): Promise<ReviewResult> {
  const total = sans.length;
  const items: ReviewItem[] = [];

  for (let i = 0; i < total; i++) {
    const posBefore = parseFen(fens[i]);
    const mover = posBefore.turn;
    const legal = generateLegalMoves(posBefore);

    // Find the played move by SAN (robust against from/to mismatches)
    let played: Move | null = null;
    for (const m of legal) {
      if (moveToSan(posBefore, m).replace(/[+#]/g, '') === sans[i].replace(/[+#]/g, '')) {
        played = m;
        break;
      }
    }
    if (!played) {
      // Fallback: skip unmatchable move
      items.push({
        ply: i + 1, san: sans[i], color: mover,
        classification: 'good', lossCp: 0, bestSan: sans[i],
      });
      onProgress?.(i + 1, total);
      continue;
    }

    // Best move + its score (from mover's perspective)
    let bestScore = 0;
    let bestSan = sans[i];
    try {
      const choice = chooseMove(parseFen(fens[i]), REVIEW_SPEC);
      bestScore = choice.scoreCp;
      bestSan = choice.san;
    } catch { /* keep defaults */ }

    // Score of the played move (from mover's perspective)
    const posCopy = parseFen(fens[i]);
    const undo = makeMove(posCopy, played);
    // Value after the move, from the MOVER's perspective (position is now opponent-to-move).
    const playedScore = -evaluate(posCopy);
    unmakeMove(posCopy, played, undo);

    const lossCp = Math.max(0, Math.min(1200, bestScore - playedScore));

    let sac = false;
    if (lossCp <= 30) {
      try { sac = isSacrifice(posBefore, played); } catch { sac = false; }
    }

    items.push({
      ply: i + 1,
      san: moveToSan(posBefore, played),
      color: mover,
      classification: classifyLoss(lossCp, bookClassify(i, sans[i]), sac && lossCp <= 30),
      lossCp,
      bestSan,
    });

    onProgress?.(i + 1, total);
    // Yield to the UI between plies
    await new Promise((r) => setTimeout(r, 0));
  }

  const sides: Record<Color, ReviewSideSummary> = {
    w: { accuracy: 0, acpl: 0, counts: emptyCounts() },
    b: { accuracy: 0, acpl: 0, counts: emptyCounts() },
  };
  const sums: Record<Color, { total: number; n: number }> = { w: { total: 0, n: 0 }, b: { total: 0, n: 0 } };
  for (const it of items) {
    sides[it.color].counts[it.classification]++;
    // Don't punish book moves in ACPL
    if (it.classification !== 'book') {
      sums[it.color].total += it.lossCp;
      sums[it.color].n++;
    }
  }
  for (const c of ['w', 'b'] as Color[]) {
    const s = sums[c];
    sides[c].acpl = s.n > 0 ? Math.round(s.total / s.n) : 0;
    sides[c].accuracy = accuracyFromAcpl(sides[c].acpl);
  }

  return { items, white: sides.w, black: sides.b };
}
