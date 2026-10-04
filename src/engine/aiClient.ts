import { parseFen } from '../chess/rules';
import type { Move, PieceType } from '../chess/types';
import { chooseMove, levelById } from './search';
import type { AiDifficulty } from './search';
import type { AiRequest, AiResponse } from './worker';

let worker: Worker | null = null;
let requestId = 0;

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  return worker;
}

export interface AiMoveInfo {
  from: number;
  to: number;
  promo?: PieceType;
  san: string;
  scoreCp: number;
  depth: number;
  nodes: number;
  timeMs: number;
}

/** Ask the AI for a move. Resolves with a legal move for the side to move in `fen`. */
export function requestAiMove(fen: string, level: AiDifficulty): Promise<AiMoveInfo> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    if (!w) {
      // Fallback: search on main thread (blocks briefly, acceptable degradation).
      setTimeout(() => {
        try {
          const pos = parseFen(fen);
          const choice = chooseMove(pos, levelById(level));
          resolve({
            from: choice.move.from,
            to: choice.move.to,
            promo: choice.move.promo,
            san: choice.san,
            scoreCp: choice.scoreCp,
            depth: choice.depth,
            nodes: choice.nodes,
            timeMs: choice.timeMs,
          });
        } catch (err) {
          reject(err);
        }
      }, 30);
      return;
    }

    const id = ++requestId;
    const onMessage = (ev: MessageEvent<AiResponse>) => {
      const msg = ev.data;
      if (msg.requestId !== id) return;
      w.removeEventListener('message', onMessage);
      if (msg.type === 'result') {
        resolve({
          from: msg.from,
          to: msg.to,
          promo: msg.promo as PieceType | undefined,
          san: msg.san,
          scoreCp: msg.scoreCp,
          depth: msg.depth,
          nodes: msg.nodes,
          timeMs: msg.timeMs,
        });
      } else {
        reject(new Error(msg.message));
      }
    };
    w.addEventListener('message', onMessage);
    const req: AiRequest = { type: 'search', fen, level, requestId: id };
    w.postMessage(req);
  });
}

export function terminateAi(): void {
  worker?.terminate();
  worker = null;
}

export type { Move };
