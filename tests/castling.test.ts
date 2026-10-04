import { describe, it, expect, afterEach } from 'vitest';
import { parseFen } from '../src/chess/rules';
import { GameController, setAiMoveHook, type GameOptions } from '../src/core/game';
import type { Settings } from '../src/core/rating';
import { parseFen as pf } from '../src/chess/rules';

const settings: Settings = {
  theme: 'classic', sound: false, haptics: false, showCoordinates: true,
  showLegalMoves: true, confirmResign: false, autoQueen: false,
};

function opts(over: Partial<GameOptions> = {}): GameOptions {
  return {
    humanColor: 'w', aiLevel: 'beginner', rated: false,
    time: { minutes: 0, incrementSeconds: 0 }, mode: 'ai', settings, ...over,
  };
}

// No AI movement during these tests
setAiMoveHook(async () => {
  throw new Error('AI should not be called');
});

afterEach(() => GameController.clearAutosave());

describe('castling UX', () => {
  it('castles kingside by tapping king then rook', () => {
    const g = new GameController(opts());
    // Custom position: clear path for castling
    (g as unknown as { position: ReturnType<typeof parseFen> }).position =
      pf('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
    void parseFen;

    g.tapSquare(60); // select e1 king
    expect(g.selection).toBe(60);
    g.tapSquare(63); // tap h1 rook
    // King should now be on g1 (62), rook on f1 (61)
    expect(g.position.board[62]?.type).toBe('k');
    expect(g.position.board[61]?.type).toBe('r');
    expect(g.sans[g.sans.length - 1]).toBe('O-O');
  });

  it('castles queenside by tapping king then a-rook', () => {
    const g = new GameController(opts());
    (g as unknown as { position: ReturnType<typeof parseFen> }).position =
      pf('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');

    g.tapSquare(60);
    g.tapSquare(56); // a1 rook
    expect(g.position.board[58]?.type).toBe('k'); // c1
    expect(g.position.board[59]?.type).toBe('r'); // d1
    expect(g.sans[g.sans.length - 1]).toBe('O-O-O');
  });

  it('does not castle when path is attacked (falls through to reselect)', () => {
    const g = new GameController(opts());
    // Black rook on f8, no blockers on the f-file (white f2 pawn removed)
    // -> f1 is attacked -> kingside castling illegal.
    (g as unknown as { position: ReturnType<typeof parseFen> }).position =
      pf('k4r2/8/8/8/8/8/PPPPP1PP/R3K2R w KQq - 0 1');

    g.tapSquare(60);
    g.tapSquare(63); // h1 rook tap — castling illegal
    // King should NOT have moved; no move played
    expect(g.position.board[60]?.type).toBe('k');
    expect(g.sans.length).toBe(0);
  });

  it('king tap on g1 target also castles (direct hint flow)', () => {
    const g = new GameController(opts());
    (g as unknown as { position: ReturnType<typeof parseFen> }).position =
      pf('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');

    g.tapSquare(60); // king
    g.tapSquare(62); // g1 — normal castle target
    expect(g.position.board[62]?.type).toBe('k');
    expect(g.sans[g.sans.length - 1]).toBe('O-O');
  });
});
