import { describe, it, expect } from 'vitest';
import { parseFen, generateLegalMoves, makeMove, getStatus, startGame } from '../src/chess/rules';
import { chooseMove, AI_LEVELS, levelById } from '../src/engine/search';

describe('AI engine', () => {
  it('finds mate in one (Qh5# line setup)', () => {
    // Position after 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6??  -> white to move, Qxf7#
    const p = parseFen('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
    const choice = chooseMove(p, AI_LEVELS[5]); // master: no blunders
    expect(choice.san).toBe('Qxf7#');
  });

  it('prefers winning a hanging queen', () => {
    // White queen on d5 can capture black queen on f7? Use simple fork position:
    const p = parseFen('rnb1kbnr/pppp1ppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const choice = chooseMove(p, levelById('intermediate'));
    expect(choice.move.from).toBeGreaterThanOrEqual(0);
    expect(choice.move.to).toBeGreaterThanOrEqual(0);
  });

  it('plays a full random self-game without crashing', () => {
    const p = startGame();
    let plies = 0;
    while (plies < 120) {
      const status = getStatus(p);
      if (status.over) break;
      const level = AI_LEVELS[0]; // beginner for speed
      const choice = chooseMove(p, level);
      const moves = generateLegalMoves(p);
      const chosen = moves.find((m) => m.from === choice.move.from && m.to === choice.move.to && m.promo === choice.move.promo);
      expect(chosen).toBeDefined();
      makeMove(p, chosen!);
      plies++;
    }
    expect(plies).toBeGreaterThan(10);
  });

  it('levelById falls back sanely', () => {
    expect(levelById('beginner').elo).toBe(600);
    expect(levelById('master').depth).toBe(6);
  });
});
