import {
  generateLegalMoves, getStatus, makeMove, parseFen, toFen, positionKey,
  historyEntryFrom, startGame,
} from '../chess/rules';
import {
  FLAG_CAPTURE, FLAG_EP_CAPTURE, FLAG_KSIDE_CASTLE, FLAG_QSIDE_CASTLE,
  other, type Color, type EndInfo, type GameResultKind, type Move, type PieceType,
  type Position, type Square,
} from '../chess/types';
import { requestAiMove } from '../engine/aiClient';
import { levelById, bestMoveForHint, type AiDifficulty } from '../engine/search';
import { recordGame, loadProfile, type Settings } from './rating';
import { saveGame, loadSavedGame, clearSavedGame, type SavedGame } from './storage';
import { playSound, vibrate, type SoundName } from './sound';

export interface TimeControl {
  /** Base minutes; 0 = unlimited. */
  minutes: number;
  incrementSeconds: number;
}

export interface GameOptions {
  humanColor: Color;
  aiLevel: AiDifficulty;
  rated: boolean;
  time: TimeControl;
  mode: 'ai' | 'human-hotseat';
  settings: Settings;
}

export interface AiMeta {
  san: string;
  scoreCp: number;
  depth: number;
  nodes: number;
  timeMs: number;
}

export interface GameSnapshot {
  position: Position;
  fen: string;
  sans: string[];
  turn: Color;
  humanColor: Color;
  check: boolean;
  over: boolean;
  termination?: string;
  result: EndInfo['result'];
  whiteMs: number;
  blackMs: number;
  lastMove: { from: Square; to: Square } | null;
  thinking: boolean;
  canUndo: boolean;
  hints: Map<Square, Square[]> | null;
  selection: Square | null;
  capturedByWhite: PieceType[];
  capturedByBlack: PieceType[];
  aiMeta: AiMeta | null;
  promotionPending: { from: Square; to: Square } | null;
  premove: { from: Square; to: Square; promo?: PieceType } | null;
  /** Show a dashed ring on the premove target. */
  premoveSelection: Square | null;
  eloDelta: number | null;
}

type Listener = () => void;

const AI_MOVE_DELAY = 350;

/**
 * Test/seam hook: when set, used instead of the worker-based AI client.
 * Signature mirrors requestAiMove(fen, level).
 */
export let aiMoveHook: ((fen: string, level: import('../engine/search').AiDifficulty) => Promise<import('../engine/aiClient').AiMoveInfo>) | null = null;
export function setAiMoveHook(fn: typeof aiMoveHook): void { aiMoveHook = fn; }

export class GameController {
  position: Position = startGame();
  options: GameOptions;
  sans: string[] = [];
  /** FEN before each move; index 0 = starting position. */
  fens: string[] = [];
  repetitionKeys: string[] = [];
  capturedByWhite: PieceType[] = [];
  capturedByBlack: PieceType[] = [];
  whiteMs = 0;
  blackMs = 0;
  result: EndInfo['result'] = null;
  termination?: string;
  over = false;
  thinking = false;
  lastMove: { from: Square; to: Square } | null = null;
  selection: Square | null = null;
  hints: Map<Square, Square[]> | null = null;
  promotionPending: { from: Square; to: Square } | null = null;
  /** Queued premove — played automatically when it's your turn again. */
  premove: { from: Square; to: Square; promo?: PieceType } | null = null;
  aiMeta: AiMeta | null = null;
  eloDelta: number | null = null;
  ratedResultApplied = false;

  private listeners = new Set<Listener>();
  private clockInterval: number | null = null;
  private aiTimer: number | null = null;
  private lastTickAt = 0;
  private saveQueued = false;

  constructor(options: GameOptions, restore?: SavedGame) {
    this.options = options;
    const base = options.time.minutes > 0 ? options.time.minutes * 60_000 : 0;
    this.whiteMs = base;
    this.blackMs = base;

    if (restore) this.restore(restore);
    clearSavedGame();

    if (this.options.time.minutes > 0 && !this.over) {
      this.startClock();
    }
    if (!this.over && this.isAiTurn()) {
      this.scheduleAiMove(AI_MOVE_DELAY);
    }
  }

  /* --------------------------- subscriptions ---------------------- */

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }

  snapshot(): GameSnapshot {
    return {
      position: this.position,
      fen: toFen(this.position),
      sans: [...this.sans],
      turn: this.position.turn,
      humanColor: this.options.humanColor,
      check: getStatus(this.position, this.repetitionKeys).check,
      over: this.over,
      termination: this.termination,
      result: this.result,
      whiteMs: this.whiteMs,
      blackMs: this.blackMs,
      lastMove: this.lastMove,
      thinking: this.thinking,
      canUndo: this.sans.length > 0 && !this.thinking,
      hints: this.hints,
      selection: this.selection,
      capturedByWhite: [...this.capturedByWhite],
      capturedByBlack: [...this.capturedByBlack],
      aiMeta: this.aiMeta,
      promotionPending: this.promotionPending,
      premove: this.premove,
      premoveSelection: this.premoveSelection,
      eloDelta: this.eloDelta,
    };
  }

  /* ------------------------------ clocks -------------------------- */

  private startClock(): void {
    this.stopClock();
    this.lastTickAt = Date.now();
    this.clockInterval = setInterval(() => this.tickClock(), 250) as unknown as number;
  }

  private stopClock(): void {
    if (this.clockInterval !== null) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
  }

  private tickClock(): void {
    if (this.over || this.options.time.minutes === 0) return;
    const now = Date.now();
    const dt = now - this.lastTickAt;
    this.lastTickAt = now;
    if (this.position.turn === 'w') this.whiteMs = Math.max(0, this.whiteMs - dt);
    else this.blackMs = Math.max(0, this.blackMs - dt);
    if (this.whiteMs === 0 || this.blackMs === 0) {
      this.onFlag();
    } else {
      this.emit();
    }
  }

  private onFlag(): void {
    if (this.over) return;
    this.stopClock();
    const flagged = this.whiteMs === 0 ? 'w' : 'b';
    const winner: Color = other(flagged);
    // A bare king cannot win on time -> draw.
    const winnerHasMaterial = this.position.board.some(
      (pc) => pc && pc.color === winner && pc.type !== 'k' && pc.type !== 'p',
    );
    this.endGame(
      { winner: winnerHasMaterial ? winner : null, kind: 'timeout' },
      'timeout',
    );
  }

  /* ---------------------------- interaction ----------------------- */

  legalMovesFrom(sq: Square): Move[] {
    return generateLegalMoves(this.position).filter((m) => m.from === sq);
  }

  /** Tap handling: select a piece, or move/capture with the selected one. */
  tapSquare(sq: Square): void {
    if (this.over || this.promotionPending) return;
    if (this.options.mode === 'ai' && this.position.turn !== this.options.humanColor) {
      // AI thinking: allow premove selection/queueing.
      this.handlePremoveTap(sq);
      return;
    }

    const piece = this.position.board[sq];
    const ownTurn = this.position.turn;

    if (this.selection !== null) {
      const targets = this.hints?.get(this.selection) ?? [];
      if (targets.includes(sq)) {
        this.playMove(this.selection, sq);
        return;
      }
      // Castling convenience: with own king selected, tapping own rook castles.
      if (piece && piece.color === ownTurn && this.tryCastleByRookTap(this.selection, sq)) {
        return;
      }
      if (piece && piece.color === ownTurn) {
        this.select(sq); // reselect own piece
        return;
      }
      this.deselect();
      return;
    }

    if (piece && piece.color === ownTurn) this.select(sq);
  }

  /** With the king selected, tapping own rook on its home square castles. */
  private tryCastleByRookTap(kingSq: Square, rookSq: Square): boolean {
    const king = this.position.board[kingSq];
    const rook = this.position.board[rookSq];
    if (!king || !rook || king.type !== 'k' || rook.type !== 'r') return false;
    if (king.color !== this.position.turn) return false;
    const home = king.color === 'w' ? 60 : 4;
    if (kingSq !== home) return false;

    let castleTo: Square | null = null;
    if (rookSq === home + 3) castleTo = home + 2; // h-rook -> kingside
    else if (rookSq === home - 4) castleTo = home - 2; // a-rook -> queenside
    if (castleTo === null) return false;

    const mv = generateLegalMoves(this.position).find(
      (m) => m.from === home && m.to === castleTo &&
        (m.flags & (FLAG_KSIDE_CASTLE | FLAG_QSIDE_CASTLE)) !== 0,
    );
    if (!mv) return false; // castling not legal here (through check, blocked, moved, etc.)
    this.applyMove(mv);
    return true;
  }

  select(sq: Square): void {
    this.selection = sq;
    const moves = this.legalMovesFrom(sq);
    this.hints = new Map([[sq, moves.map((m) => m.to)]]);
    const s = this.options.settings;
    playSound('click', s.sound);
    vibrate(8, s.haptics);
    this.emit();
  }

  deselect(): void {
    this.selection = null;
    this.hints = null;
    this.emit();
  }

  /** Try to play a move; returns true if accepted (or queued a promotion). */
  playMove(from: Square, to: Square, promo?: PieceType): boolean {
    if (this.over || this.thinking) return false;
    if (this.options.mode === 'ai' && this.position.turn !== this.options.humanColor) return false;

    const legal = generateLegalMoves(this.position).filter((m) => m.from === from && m.to === to);
    if (legal.length === 0) return false;

    if (legal[0].promo && !promo) {
      if (this.options.settings.autoQueen) {
        const q = legal.find((m) => m.promo === 'q');
        if (q) {
          this.applyMove(q);
          return true;
        }
      }
      this.promotionPending = { from, to };
      this.emit();
      return true;
    }
    const move = promo ? (legal.find((m) => m.promo === promo) ?? legal[0]) : legal[0];
    this.applyMove(move);
    return true;
  }

  completePromotion(promo: PieceType): void {
    if (!this.promotionPending) return;
    const { from, to } = this.promotionPending;
    this.promotionPending = null;
    const move = generateLegalMoves(this.position).find(
      (m) => m.from === from && m.to === to && m.promo === promo,
    );
    if (move) this.applyMove(move);
    else this.deselect();
  }

  cancelPromotion(): void {
    this.promotionPending = null;
    this.deselect();
  }

  /* ----------------------------- moves ---------------------------- */

  /** Queue a premove to play the instant it's your turn. Returns true if queued. */
  setPremove(from: Square, to: Square, promo?: PieceType): boolean {
    if (this.over) return false;
    if (this.options.mode === 'ai' && this.position.turn === this.options.humanColor) {
      // It's already your turn — just play normally.
      return this.playMove(from, to, promo);
    }
    this.premove = { from, to, promo };
    this.emit();
    return true;
  }

  private tryPremove(): void {
    const pm = this.premove;
    if (!pm || this.over || this.thinking) return;
    this.premove = null;
    const piece = this.position.board[pm.from];
    if (!piece || piece.color !== this.options.humanColor) return; // illegal now, drop it
    const legal = generateLegalMoves(this.position).find(
      (m) => m.from === pm.from && m.to === pm.to,
    );
    if (!legal) {
      playSound('illegal', this.options.settings.sound); // premove no longer valid
      return;
    }
    // Promotion premove: auto-queen or ask via normal flow.
    if (legal.promo && !pm.promo) {
      if (this.options.settings.autoQueen) {
        const q = legal.promo === 'q' ? legal : generateLegalMoves(this.position).find((m) => m.from === pm.from && m.to === pm.to && m.promo === 'q');
        if (q) { this.applyMove(q); return; }
      }
      this.promotionPending = { from: pm.from, to: pm.to };
      this.emit();
      return;
    }
    const move = pm.promo
      ? generateLegalMoves(this.position).find((m) => m.from === pm.from && m.to === pm.to && m.promo === pm.promo) ?? legal
      : legal;
    this.applyMove(move);
  }

  private applyMove(m: Move): void {
    const entry = historyEntryFrom(this.position, m, this.clockFor(this.position.turn));
    const moverColor = this.position.board[m.from]!.color;
    const wasCapture = !!(m.flags & (FLAG_CAPTURE | FLAG_EP_CAPTURE));
    const wasCastle = !!(m.flags & (FLAG_KSIDE_CASTLE | FLAG_QSIDE_CASTLE));

    makeMove(this.position, m);
    this.sans.push(entry.san);
    this.fens.push(entry.fenBefore);
    this.repetitionKeys.push(positionKey(this.position));
    if (entry.captured) {
      (moverColor === 'w' ? this.capturedByWhite : this.capturedByBlack).push(entry.captured);
    }

    this.lastMove = { from: m.from, to: m.to };
    this.selection = null;
    this.hints = null;

    // Increment clock (Fischer) for the mover if timed.
    if (this.options.time.minutes > 0) {
      const inc = this.options.time.incrementSeconds * 1000;
      if (moverColor === 'w') this.whiteMs += inc; else this.blackMs += inc;
    }

    const status = getStatus(this.position, this.repetitionKeys);
    const s = this.options.settings;
    let sound: SoundName = 'move';
    if (m.promo) sound = 'promote';
    else if (wasCastle) sound = 'castle';
    else if (wasCapture) sound = 'capture';
    if (status.over && status.termination === 'checkmate') sound = 'check';
    else if (status.check) sound = 'check';
    playSound(sound, s.sound);
    if (this.options.mode === 'ai' && moverColor === this.options.humanColor) {
      vibrate(wasCapture ? [12, 30, 12] : 10, s.haptics);
    }

    if (status.over) {
      this.endGame(status.result!, status.termination!);
      return;
    }

    this.emit();
    this.persist();
    if (this.isAiTurn()) this.scheduleAiMove(AI_MOVE_DELAY);
  }

  /** Tap handling while the AI is thinking: select/queue a premove. */
  private premoveSelection: Square | null = null;

  private handlePremoveTap(sq: Square): void {
    const piece = this.position.board[sq];

    if (this.premoveSelection !== null) {
      if (piece && piece.color === this.options.humanColor) {
        this.premoveSelection = sq; // reselect another own piece
        this.emit();
        return;
      }
      this.setPremove(this.premoveSelection, sq);
      this.premoveSelection = null;
      const s = this.options.settings;
      playSound('click', s.sound);
      vibrate(8, s.haptics);
      return;
    }

    if (piece && piece.color === this.options.humanColor) {
      this.premoveSelection = sq;
      const s = this.options.settings;
      playSound('click', s.sound);
      vibrate(8, s.haptics);
    }
    this.emit();
  }

  private clockFor(color: Color): number | null {
    if (this.options.time.minutes === 0) return null;
    return color === 'w' ? this.whiteMs : this.blackMs;
  }

  /* ------------------------------ AI ------------------------------ */

  isAiTurn(): boolean {
    if (this.over || this.options.mode !== 'ai') return false;
    return this.position.turn !== this.options.humanColor;
  }

  private scheduleAiMove(delayMs: number): void {
    if (this.aiTimer !== null || this.over) return;
    this.thinking = true;
    this.emit();
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      const fen = toFen(this.position);
      const request = aiMoveHook
        ? aiMoveHook(fen, this.options.aiLevel)
        : requestAiMove(fen, this.options.aiLevel);
      request
        .then((info) => {
          if (this.over) return;
          const legal = generateLegalMoves(this.position);
          const move = legal.find(
            (m) => m.from === info.from && m.to === info.to &&
              (m.promo ?? undefined) === (info.promo ?? undefined),
          );
          if (!move) {
            if (legal.length) this.applyMove(legal[0]); // safety net
            return;
          }
          this.aiMeta = {
            san: info.san, scoreCp: info.scoreCp, depth: info.depth,
            nodes: info.nodes, timeMs: info.timeMs,
          };
          this.thinking = false;
          this.applyMove(move);
          this.tryPremove(); // fire the queued premove right away, if any
        })
        .catch(() => {
          this.thinking = false;
          this.emit();
        });
    }, delayMs) as unknown as number;
  }

  cancelAi(): void {
    if (this.aiTimer !== null) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
    this.thinking = false;
  }

  requestHint(): boolean {
    if (this.over || this.thinking || this.promotionPending) return false;
    if (this.options.mode === 'ai' && this.position.turn !== this.options.humanColor) return false;
    this.thinking = true;
    this.emit();
    const fen = toFen(this.position);
    setTimeout(() => {
      try {
        const choice = bestMoveForHint(parseFen(fen));
        this.selection = choice.move.from;
        this.hints = new Map([[choice.move.from, [choice.move.to]]]);
      } finally {
        this.thinking = false;
        this.emit();
      }
    }, 30);
    return true;
  }

  /* ---------------------------- game end -------------------------- */

  resign(color: Color = this.options.humanColor): void {
    if (this.over) return;
    this.endGame({ winner: other(color), kind: 'resign' }, 'resign');
  }

  offerDrawAi(): void {
    if (this.over || this.options.mode !== 'ai') return;
    let matW = 0, matB = 0, n = 0;
    for (const pc of this.position.board) {
      if (!pc || pc.type === 'k') continue;
      n++;
      const v = pc.type === 'p' ? 1 : pc.type === 'n' || pc.type === 'b' ? 3 : pc.type === 'r' ? 5 : 9;
      if (pc.color === 'w') matW += v; else matB += v;
    }
    if (Math.abs(matW - matB) <= 1 && n <= 6) {
      this.endGame({ winner: null, kind: 'agreement' }, 'agreement');
    } else {
      playSound('illegal', this.options.settings.sound); // declined
    }
  }

  private endGame(result: NonNullable<EndInfo['result']>, termination: string): void {
    if (this.over) return;
    this.over = true;
    this.result = result;
    this.termination = termination;
    this.stopClock();
    this.cancelAi();

    const s = this.options.settings;
    if (this.options.mode === 'ai') {
      const humanWon = result.winner === this.options.humanColor;
      const draw = result.winner === null;
      playSound(draw ? 'draw' : humanWon ? 'win' : 'lose', s.sound);
      vibrate(humanWon ? [25, 50, 25, 50, 60] : draw ? 40 : [40, 40, 40], s.haptics);

      if (!this.ratedResultApplied) {
        this.ratedResultApplied = true;
        const level = levelById(this.options.aiLevel);
        const score: 0 | 0.5 | 1 = draw ? 0.5 : humanWon ? 1 : 0;
        const before = loadProfile();
        const { profile: after, delta } = recordGame(before, {
          opponent: `${level.name} (${level.elo})`,
          opponentElo: level.elo,
          humanColor: this.options.humanColor,
          winner: result.winner,
          kind: result.kind,
          moves: this.sans.length,
          rated: this.options.rated,
        }, score);
        this.eloDelta = delta;
        void after;
      }
    } else {
      playSound(result.winner ? 'win' : 'draw', s.sound);
    }

    this.persist();
    this.emit();
  }

  /* --------------------------- undo / new ------------------------- */

  undo(): void {
    if (this.sans.length === 0) return;
    const wasOver = this.over;
    // Allow undo even while the AI is "thinking": cancel its pending move.
    this.cancelAi();
    this.over = false;
    this.result = null;
    this.termination = undefined;
    this.ratedResultApplied = wasOver; // game already counted; replaying is unrated practice
    this.eloDelta = null;

    this.premove = null; // clear any queued premove

    let plies = 1;
    if (this.options.mode === 'ai') {
      // If it's the human's turn now, the last two plies are [AI reply, human move].
      // Undo both so the human is back with their move to rethink.
      plies = this.position.turn === this.options.humanColor ? 2 : 1;
    }
    plies = Math.min(plies, this.sans.length);
    for (let i = 0; i < plies; i++) this.unmakeLast();

    if (this.options.time.minutes > 0) this.startClock();
    this.deselect();
    this.persist();
    this.emit();
    // Safety: if undoing landed on the AI's turn (e.g. undo right after your own move
    // while its reply hadn't come yet), let it move again — otherwise it's your turn.
    if (this.isAiTurn()) this.scheduleAiMove(400);
  }

  private unmakeLast(): void {
    const fenBefore = this.fens.pop();
    if (!fenBefore) return;
    this.sans.pop();
    this.repetitionKeys.pop();
    this.position = parseFen(fenBefore);
    this.lastMove = null;
    this.rebuildCaptured();
  }

  private rebuildCaptured(): void {
    const seen: Record<Color, Partial<Record<PieceType, number>>> = { w: {}, b: {} };
    for (const pc of this.position.board) {
      if (!pc) continue;
      seen[pc.color][pc.type] = (seen[pc.color][pc.type] ?? 0) + 1;
    }
    const START: Record<PieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
    const ORDER: PieceType[] = ['q', 'r', 'b', 'n', 'p'];
    this.capturedByWhite = [];
    this.capturedByBlack = [];
    for (const color of ['w', 'b'] as Color[]) {
      for (const t of ORDER) {
        const missing = Math.max(0, START[t] - (seen[color][t] ?? 0));
        for (let i = 0; i < missing; i++) {
          (color === 'b' ? this.capturedByWhite : this.capturedByBlack).push(t);
        }
      }
    }
  }

  /* --------------------------- persistence ------------------------ */

  private persist(): void {
    if (this.saveQueued) return;
    this.saveQueued = true;
    setTimeout(() => {
      this.saveQueued = false;
      saveGame(this.toSavedGame());
    }, 150);
  }

  toSavedGame(): SavedGame {
    return {
      fen: toFen(this.position),
      sans: [...this.sans],
      fens: [...this.fens],
      humanColor: this.options.humanColor,
      aiLevel: this.options.aiLevel,
      rated: this.options.rated,
      mode: this.options.mode,
      whiteMs: this.options.time.minutes > 0 ? Math.round(this.whiteMs) : null,
      blackMs: this.options.time.minutes > 0 ? Math.round(this.blackMs) : null,
      incrementMs: this.options.time.incrementSeconds * 1000,
      savedAt: Date.now(),
      result: this.result ? { winner: this.result.winner, kind: this.result.kind } : null,
    };
  }

  private restore(g: SavedGame): void {
    this.position = parseFen(g.fen);
    this.sans = [...g.sans];
    this.fens = [...g.fens];
    this.repetitionKeys = this.fens.map((f) => positionKey(parseFen(f)));
    this.repetitionKeys.push(positionKey(this.position));
    this.options.humanColor = g.humanColor;
    this.options.aiLevel = g.aiLevel;
    this.options.rated = g.rated;
    this.options.mode = g.mode;
    if (g.whiteMs !== null) this.whiteMs = g.whiteMs;
    if (g.blackMs !== null) this.blackMs = g.blackMs;
    if (g.result) {
      this.over = true;
      this.result = g.result as { winner: Color | null; kind: GameResultKind };
      this.termination = g.result.kind === 'stalemate' || g.result.kind === 'fifty-move'
        || g.result.kind === 'threefold' || g.result.kind === 'insufficient-material'
        || g.result.kind === 'agreement'
        ? 'draw' : (g.result.kind as string);
      this.ratedResultApplied = true; // never double-count on restore
    }
    this.rebuildCaptured();
  }

  /* ----------------------------- misc ----------------------------- */

  setSettings(s: Settings): void {
    this.options.settings = s;
    this.emit();
  }

  /** Clear autosave and reinit to a fresh game. */
  static clearAutosave(): void {
    clearSavedGame();
  }

  static loadAutosave(): SavedGame | null {
    return loadSavedGame();
  }

  destroy(): void {
    this.stopClock();
    this.cancelAi();
    this.listeners.clear();
    saveGame(this.toSavedGame());
  }
}
