/// <reference lib="webworker" />
import { parseFen } from '../chess/rules';
import { chooseMove, levelById, type AiDifficulty } from './search';

export interface AiRequest {
  type: 'search';
  fen: string;
  level: AiDifficulty;
  requestId: number;
}

export type AiResponse =
  | { type: 'result'; requestId: number; from: number; to: number; promo?: string; san: string; scoreCp: number; depth: number; nodes: number; timeMs: number }
  | { type: 'error'; requestId: number; message: string };

self.onmessage = (ev: MessageEvent<AiRequest>) => {
  const req = ev.data;
  if (req.type !== 'search') return;
  try {
    const pos = parseFen(req.fen);
    const level = levelById(req.level);
    const choice = chooseMove(pos, level);
    const res: AiResponse = {
      type: 'result',
      requestId: req.requestId,
      from: choice.move.from,
      to: choice.move.to,
      promo: choice.move.promo,
      san: choice.san,
      scoreCp: choice.scoreCp,
      depth: choice.depth,
      nodes: choice.nodes,
      timeMs: choice.timeMs,
    };
    (self as unknown as Worker).postMessage(res);
  } catch (err) {
    const res: AiResponse = {
      type: 'error',
      requestId: req.requestId,
      message: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(res);
  }
};
