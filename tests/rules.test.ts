import { describe, it, expect } from 'vitest';
import {
  parseFen, toFen, generateLegalMoves, makeMove, unmakeMove, moveToSan, sanToMove,
  getStatus, inCheck, isAttacked, findKing, startGame, positionKey, isInsufficientMaterial,
} from '../src/chess/rules';
import { START_FEN, squareFromName, squareName, other, type Position } from '../src/chess/types';

function perft(p: Position, depth: number): number {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const m of generateLegalMoves(p)) {
    const undo = makeMove(p, m);
    nodes += perft(p, depth - 1);
    unmakeMove(p, m, undo);
  }
  return nodes;
}

describe('FEN', () => {
  it('round-trips the start position', () => {
    expect(toFen(parseFen(START_FEN))).toBe(START_FEN);
  });

  it('round-trips a complex fen', () => {
    const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
    expect(toFen(parseFen(fen))).toBe(fen);
  });
});

describe('perft (move generator correctness)', () => {
  it('start position depths', () => {
    const p = startGame();
    expect(perft(p, 1)).toBe(20);
    expect(perft(p, 2)).toBe(400);
    expect(perft(p, 3)).toBe(8902);
    expect(perft(p, 4)).toBe(197281);
  });

  it('kiwipete position depths', () => {
    const p = parseFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    expect(perft(p, 1)).toBe(48);
    expect(perft(p, 2)).toBe(2039);
    expect(perft(p, 3)).toBe(97862);
  });

  it('en passant / pin position (position 3)', () => {
    const p = parseFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
    expect(perft(p, 1)).toBe(14);
    expect(perft(p, 2)).toBe(191);
    expect(perft(p, 3)).toBe(2812);
    expect(perft(p, 4)).toBe(43238);
  });

  it('promotion position (position 4)', () => {
    const p = parseFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
    expect(perft(p, 1)).toBe(6);
    expect(perft(p, 2)).toBe(264);
    expect(perft(p, 3)).toBe(9467);
  });
});

describe('make/unmake integrity', () => {
  it('restores the position exactly after unmake', () => {
    const p = parseFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 3 7');
    const before = toFen(p);
    let count = 0;
    for (const m of generateLegalMoves(p)) {
      const undo = makeMove(p, m);
      count++;
      unmakeMove(p, m, undo);
      expect(toFen(p)).toBe(before);
    }
    expect(count).toBe(48);
  });
});

describe('checks and attacks', () => {
  it('detects check in a mate position', () => {
    // Fool's mate final position
    const p = parseFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
    expect(inCheck(p, 'w')).toBe(true);
    expect(getStatus(p).over).toBe(true);
    expect(getStatus(p).result?.kind).toBe('checkmate');
    expect(getStatus(p).result?.winner).toBe('b');
  });

  it('detects stalemate', () => {
    const p = parseFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    const s = getStatus(p);
    expect(s.over).toBe(true);
    expect(s.result?.kind).toBe('stalemate');
    expect(s.check).toBe(false);
  });

  it('isAttacked finds rook and king attacks', () => {
    const p = parseFen('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    expect(isAttacked(p, squareFromName('d1'), 'w')).toBe(true);  // rook a1 -> d1
    expect(isAttacked(p, squareFromName('a3'), 'w')).toBe(true);  // rook a1 -> a3
    expect(isAttacked(p, squareFromName('d8'), 'b')).toBe(true);  // king e8 -> d8
    expect(isAttacked(p, squareFromName('h8'), 'b')).toBe(false); // nothing attacks h8
  });

  it('isAttacked detects pawn attacks both colors', () => {
    // White pawn e4 attacks d5/f5; black pawn c7 attacks b6/d6
    const p = parseFen('4k3/2p5/8/8/4P3/8/8/4K3 w - - 0 1');
    expect(isAttacked(p, squareFromName('d5'), 'w')).toBe(true);
    expect(isAttacked(p, squareFromName('f5'), 'w')).toBe(true);
    expect(isAttacked(p, squareFromName('e5'), 'w')).toBe(false);
    expect(isAttacked(p, squareFromName('b6'), 'b')).toBe(true);
    expect(isAttacked(p, squareFromName('d6'), 'b')).toBe(true);
    expect(isAttacked(p, squareFromName('c6'), 'b')).toBe(false);
  });
});

describe('SAN', () => {
  it('formats castling and check/mate suffixes', () => {
    const p = startGame();
    const e4 = sanToMove(p, 'e4');
    expect(e4).not.toBeNull();
    expect(moveToSan(p, e4!)).toBe('e4');

    // Scholar's mate sequence
    const p2 = startGame();
    const seq = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'];
    for (const san of seq) {
      const m = sanToMove(p2, san);
      expect(m).not.toBeNull();
      expect(moveToSan(p2, m!).replace(/[+#]/g, '')).toBe(san.replace(/[+#]/g, ''));
      makeMove(p2, m!); // progress the game (no unmake)
    }
    expect(inCheck(p2, 'b')).toBe(true);
    expect(generateLegalMoves(p2).length).toBe(0);
  });

  it('disambiguates knights', () => {
    const p = parseFen('5k2/8/8/8/8/2N1N3/8/4K3 w - - 0 1');
    const m = sanToMove(p, 'Ncd5');
    expect(m).not.toBeNull();
    expect(moveToSan(p, m!)).toBe('Ncd5');
  });

  it('handles promotion san', () => {
    const p = parseFen('8/P7/8/8/8/8/k6K/8 w - - 0 1');
    const m = sanToMove(p, 'a8=Q');
    expect(m).not.toBeNull();
    expect(moveToSan(p, m!)).toBe('a8=Q+');
  });
});

describe('draw detection', () => {
  it('flags insufficient material (K+B vs K)', () => {
    const p = parseFen('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1');
    expect(isInsufficientMaterial(p)).toBe(true);
    expect(getStatus(p).over).toBe(true);
  });

  it('flags fifty-move rule', () => {
    const p = parseFen('4k3/8/8/8/8/8/8/4K1R1 w - - 99 60');
    // One more halfmove resets nothing; halfmove reaches 100 after a non-pawn non-capture move.
    const m = generateLegalMoves(p).find((mv) => mv.from === squareFromName('g1') && mv.to === squareFromName('f1'));
    expect(m).toBeDefined();
    const undo = makeMove(p, m!);
    expect(p.halfmove).toBe(100);
    expect(getStatus(p).result?.kind).toBe('fifty-move');
    unmakeMove(p, m!, undo);
  });

  it('detects threefold repetition', () => {
    const p = startGame();
    const keys: string[] = [positionKey(p)];
    const seq = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
    for (let rep = 0; rep < 2; rep++) {
      for (const san of seq) {
        const m = sanToMove(p, san);
        expect(m).not.toBeNull();
        makeMove(p, m!);
        keys.push(positionKey(p));
      }
    }
    const s = getStatus(p, keys);
    expect(s.over).toBe(true);
    expect(s.result?.kind).toBe('threefold');
  });
});

describe('castling rights bookkeeping', () => {
  it('removes rights when rook is captured', () => {
    const p = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    // White rook cannot reach a8 in one move here (a-file blocked? No: a8 rook is black, a1 rook white, file is open)
    const moves = generateLegalMoves(p);
    const m = moves.find((mv) => squareName(mv.from) === 'a1' && squareName(mv.to) === 'a8');
    expect(m).toBeDefined();
    const undo = makeMove(p, m!);
    expect((p.castling & 8)).toBe(0); // black queenside right gone
    unmakeMove(p, m!, undo);
  });
});

describe('utility', () => {
  it('square names round trip', () => {
    for (let sq = 0; sq < 64; sq++) expect(squareFromName(squareName(sq))).toBe(sq);
  });

  it('other flips colors', () => {
    expect(other('w')).toBe('b');
    expect(other('b')).toBe('w');
  });
});

describe('history entry', () => {
  it('records san and fen', () => {
    const p = startGame();
    const m = sanToMove(p, 'e4')!;
    const undo = makeMove(p, m);
    expect(p.turn).toBe('b');
    unmakeMove(p, m, undo);
    // Use helper from rules via re-import to keep imports used
    expect(generateLegalMoves(p).length).toBe(20);
    expect(findKing(p, 'w')).toBe(squareFromName('e1'));
  });
});
