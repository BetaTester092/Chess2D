import { describe, it, expect, afterEach } from 'vitest';
import { generateLegalMoves, makeMove } from '../src/chess/rules';
import { chooseMove, levelById } from '../src/engine/search';
import { parseFen } from '../src/chess/rules';
import {
  GameController, setAiMoveHook, type GameOptions,
} from '../src/core/game';
import type { Settings } from '../src/core/rating';

const settings: Settings = {
  theme: 'classic', sound: false, haptics: false, showCoordinates: true,
  showLegalMoves: true, confirmResign: false, autoQueen: false,
};

function opts(over: Partial<GameOptions> = {}): GameOptions {
  return {
    humanColor: 'w',
    aiLevel: 'beginner', // fast for tests
    rated: false,
    time: { minutes: 0, incrementSeconds: 0 },
    mode: 'ai',
    settings,
    ...over,
  };
}

// Deterministic sync-ish AI: uses the real engine but resolves immediately.
setAiMoveHook(async (fen) => {
  const pos = parseFen(fen);
  const choice = chooseMove(pos, levelById('beginner'));
  return {
    from: choice.move.from, to: choice.move.to, promo: choice.move.promo,
    san: choice.san, scoreCp: choice.scoreCp, depth: 1, nodes: 1, timeMs: 1,
  };
});

async function waitFor(cond: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}

afterEach(() => {
  GameController.clearAutosave();
});

describe('undo', () => {
  it('cancels pending AI move and takes back your move', async () => {
    const g = new GameController(opts());
    g.playMove(52, 36); // e2e4, AI reply scheduled at +350ms
    expect(g.sans.length).toBe(1);
    g.undo();
    // Wait out the AI timer that was cancelled — nothing should move.
    await new Promise((r) => setTimeout(r, 420));
    expect(g.sans.length).toBe(0);
    expect(g.position.turn).toBe('w');
    expect(g.position.board[36]).toBeNull();
    expect(g.position.board[52]?.type).toBe('p');
  });

  it('after AI reply, undo removes both plies', async () => {
    const g = new GameController(opts());
    g.playMove(52, 36);
    await new Promise((r) => setTimeout(r, 500)); // AI replies
    expect(g.sans.length).toBe(2);
    g.undo();
    expect(g.sans.length).toBe(0);
    expect(g.position.turn).toBe('w');
  });

  it('undo after game over reopens the game as unrated', async () => {
    const g = new GameController(opts({ humanColor: 'b' }));
    await waitFor(() => g.sans.length >= 1); // AI (white) opens
    g.playMove(12, 28); // human is black: e7e5
    await waitFor(() => g.sans.length >= 2); // AI replies
    g.resign();
    expect(g.over).toBe(true);
    const plies = g.sans.length;
    g.undo();
    expect(g.over).toBe(false);
    expect(g.result).toBeNull();
    expect(g.sans.length).toBeLessThan(plies);
    expect(g.position.turn).toBe('b'); // human's turn again
  });

  it('move make/unmake sanity: pawn is back after undo', async () => {
    const g = new GameController(opts());
    g.playMove(52, 36);
    await new Promise((r) => setTimeout(r, 500));
    expect(g.position.board[52]).toBeNull();
    g.undo();
    expect(g.position.board[52]?.type).toBe('p');
    expect(generateLegalMoves(g.position).length).toBeGreaterThan(0);
    void makeMove;
  });
});

describe('clock', () => {
  it('decreases for the side to move', async () => {
    const g = new GameController(opts({ time: { minutes: 1, incrementSeconds: 0 } }));
    const before = g.whiteMs;
    await new Promise((r) => setTimeout(r, 1200));
    expect(g.whiteMs).toBeLessThan(before);
    expect(g.blackMs).toBe(60000); // black not draining on white's turn
  });

  it('flags the player who runs out of time (white)', async () => {
    const g = new GameController(opts({ time: { minutes: 1, incrementSeconds: 0 } }));
    g.whiteMs = 1000; // simulate near-empty clock
    await new Promise((r) => setTimeout(r, 1600));
    expect(g.over).toBe(true);
    expect(g.result?.kind).toBe('timeout');
    expect(g.result?.winner).toBe('b');
  });

  it('flags the player who runs out of time (black)', async () => {
    const g = new GameController(opts({ humanColor: 'b', time: { minutes: 1, incrementSeconds: 0 } }));
    await waitFor(() => g.sans.length >= 1); // AI (white) played, black to move
    expect(g.position.turn).toBe('b');
    g.blackMs = 800;
    await waitFor(() => g.over, 5000);
    expect(g.result?.kind).toBe('timeout');
    expect(g.result?.winner).toBe('w');
  });

  it('unlimited games never flag', async () => {
    const g = new GameController(opts({ time: { minutes: 0, incrementSeconds: 0 } }));
    await new Promise((r) => setTimeout(r, 1200));
    expect(g.over).toBe(false);
    expect(g.whiteMs).toBe(0);
  });
});
