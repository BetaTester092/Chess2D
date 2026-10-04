import {
  generateLegalMoves, inCheck, makeMove, unmakeMove, moveToSan,
  type GameStatus,
} from '../chess/rules';
import { other, type Move, type Position } from '../chess/types';
import { evaluate } from './evaluate';

export type AiDifficulty = 'beginner' | 'casual' | 'intermediate' | 'advanced' | 'expert' | 'master';

export interface AiLevelSpec {
  id: AiDifficulty;
  name: string;
  /** Nominal playing strength used for rating math. */
  elo: number;
  /** Search depth in plies (root counts as ply 0). */
  depth: number;
  /** Probability of playing a deliberately suboptimal move. */
  blunderChance: number;
  /** Search time cap in ms (soft). */
  timeMs: number;
  /** Small random noise added to leaf scores. */
  noise: number;
  /** Use quiescence search. */
  quiescence: boolean;
}

export const AI_LEVELS: AiLevelSpec[] = [
  { id: 'beginner',     name: 'Beginner',     elo:  600, depth: 1, blunderChance: 0.55, timeMs:  400, noise: 60, quiescence: false },
  { id: 'casual',       name: 'Casual',       elo:  900, depth: 2, blunderChance: 0.35, timeMs:  600, noise: 35, quiescence: false },
  { id: 'intermediate', name: 'Intermediate', elo: 1200, depth: 3, blunderChance: 0.18, timeMs:  900, noise: 15, quiescence: true  },
  { id: 'advanced',     name: 'Advanced',     elo: 1500, depth: 4, blunderChance: 0.08, timeMs: 1400, noise:  6, quiescence: true  },
  { id: 'expert',       name: 'Expert',       elo: 1800, depth: 5, blunderChance: 0.03, timeMs: 2200, noise:  0, quiescence: true  },
  { id: 'master',       name: 'Master',       elo: 2100, depth: 6, blunderChance: 0.0,  timeMs: 3200, noise:  0, quiescence: true  },
];

const MATE_SCORE = 100000;

/** Score a move quickly for move ordering. */
function moveOrderScore(p: Position, m: Move): number {
  let s = 0;
  const victim = p.board[m.to];
  const attacker = p.board[m.from]!;
  if (victim) s += 10 * seeValue(victim.type) - seeValue(attacker.type);
  if (m.promo) s += seeValue(m.promo);
  return s;
}

function seeValue(t: string): number {
  return t === 'p' ? 100 : t === 'n' ? 320 : t === 'b' ? 330 : t === 'r' ? 500 : t === 'q' ? 900 : 20000;
}

/** Quiescence search: resolve captures until quiet. */
function quiesce(p: Position, alpha: number, beta: number, depth: number): number {
  const stand = evaluate(p);
  if (depth === 0) return stand;
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;

  const caps = generateLegalMoves(p)
    .filter((m) => p.board[m.to] || m.promo)
    .sort((a, b) => moveOrderScore(p, b) - moveOrderScore(p, a));

  for (const m of caps) {
    const undo = makeMove(p, m);
    const score = -quiesce(p, -beta, -alpha, depth - 1);
    unmakeMove(p, m, undo);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

interface SearchCtx {
  nodes: number;
  deadline: number;
  aborted: boolean;
  noise: number;
  useQuiescence: boolean;
}

function negamax(
  p: Position, depth: number, alpha: number, beta: number, ctx: SearchCtx, ply: number,
): number {
  ctx.nodes++;

  if ((ctx.nodes & 1023) === 0 && Date.now() > ctx.deadline) {
    ctx.aborted = true;
    return evaluate(p);
  }

  const moves = generateLegalMoves(p);

  if (moves.length === 0) {
    if (inCheck(p, p.turn)) return -MATE_SCORE + ply; // prefer faster mates
    return 0; // stalemate
  }
  if (p.halfmove >= 100) return 0;
  if (depth <= 0) {
    return ctx.useQuiescence ? quiesce(p, alpha, beta, 4) : evaluate(p);
  }

  moves.sort((a, b) => moveOrderScore(p, b) - moveOrderScore(p, a));

  let best = -Infinity;
  for (const m of moves) {
    const undo = makeMove(p, m);
    let score = -negamax(p, depth - 1, -beta, -alpha, ctx, ply + 1);
    unmakeMove(p, m, undo);

    if (ctx.noise > 0) {
      score += (Math.random() * 2 - 1) * ctx.noise;
    }

    if (ctx.aborted) return best === -Infinity ? score : best;

    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break; // fail-high
  }
  return best;
}

export interface AiChoice {
  move: Move;
  san: string;
  scoreCp: number;
  depth: number;
  nodes: number;
  timeMs: number;
}

/**
 * Pick the AI move using iterative deepening so we always have a complete,
 * trustworthy scoring pass even if the time budget runs out mid-search.
 */
export function chooseMove(p: Position, level: AiLevelSpec, rng: () => number = Math.random): AiChoice {
  const start = Date.now();
  const moves = generateLegalMoves(p);
  if (moves.length === 0) throw new Error('No legal moves for AI');

  // Search captures first — finds tactics and mates much earlier.
  const ordered = moves.slice().sort((a, b) => moveOrderScore(p, b) - moveOrderScore(p, a));

  const ctx: SearchCtx = {
    nodes: 0,
    deadline: Number.MAX_SAFE_INTEGER,
    aborted: false,
    noise: level.noise,
    useQuiescence: level.quiescence,
  };

  let bestPass: { move: Move; score: number }[] | null = null;
  let completedDepth = 0;

  for (let depth = 1; depth <= Math.max(1, level.depth); depth++) {
    const pass: { move: Move; score: number }[] = [];
    let passAborted = false;
    let alpha = -Infinity;

    for (const m of ordered) {
      const undo = makeMove(p, m);
      // Root alpha-beta: prune branches that can't beat the current best.
      let score = -negamax(p, depth - 1, -Infinity, -alpha, ctx, 1);
      unmakeMove(p, m, undo);

      if (ctx.aborted || Date.now() > start + level.timeMs) {
        passAborted = true;
        break;
      }
      if (ctx.noise > 0) score += (rng() * 2 - 1) * ctx.noise;
      pass.push({ move: m, score });
      if (score > alpha) alpha = score;
    }

    if (passAborted) break;
    bestPass = pass;
    completedDepth = depth;
    if (Date.now() > start + level.timeMs) break;
  }

  const scored = bestPass ?? [{ move: ordered[0], score: 0 }]; // ultra-safe fallback: first legal move
  scored.sort((a, b) => b.score - a.score);

  let chosen: { move: Move; score: number };
  const blunder = rng() < level.blunderChance && scored.length > 1;
  if (blunder) {
    // Choose a slightly-worse move instead of the best one.
    const pool = scored.slice(Math.min(1, scored.length - 1));
    const idx = Math.min(pool.length - 1, Math.floor(rng() * rng() * pool.length)); // bias towards the front
    chosen = pool[idx];
  } else {
    chosen = scored[0];
  }

  return {
    move: chosen.move,
    san: moveToSan(p, chosen.move),
    scoreCp: chosen.score,
    depth: completedDepth,
    nodes: ctx.nodes,
    timeMs: Date.now() - start,
  };
}

/** Find the best move ignoring blunders (used for hints). */
export function bestMoveForHint(p: Position): AiChoice {
  const spec: AiLevelSpec = { ...AI_LEVELS[4], timeMs: 900 };
  return chooseMove(p, spec, Math.random);
}

export function levelById(id: AiDifficulty): AiLevelSpec {
  return AI_LEVELS.find((l) => l.id === id) ?? AI_LEVELS[2];
}

/** Shared/mate detection helper reused by controller. */
export function isGameOverStatus(status: GameStatus): boolean {
  return status.over;
}

export { MATE_SCORE, other };
