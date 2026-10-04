import { loadJson, saveJson, removeKey } from './rating';
import type { AiDifficulty } from '../engine/search';

export interface SavedGame {
  fen: string;
  /** SAN history for the move list. */
  sans: string[];
  /** FENs before each move (index 0 = start position). */
  fens: string[];
  humanColor: 'w' | 'b';
  aiLevel: AiDifficulty;
  rated: boolean;
  mode: 'ai' | 'human-hotseat';
  /** Remaining clock time in ms; null = unlimited. */
  whiteMs: number | null;
  blackMs: number | null;
  incrementMs: number;
  /** Timestamp of last save to resume clocks reasonably. */
  savedAt: number;
  /** Result already applied (game over but user still viewing). */
  result: { winner: 'w' | 'b' | null; kind: string } | null;
}

const KEY = 'game.autosave';

export function saveGame(g: SavedGame): void {
  saveJson(KEY, g);
}

export function loadSavedGame(): SavedGame | null {
  return loadJson<SavedGame | null>(KEY, null);
}

export function clearSavedGame(): void {
  removeKey(KEY);
}

export function hasSavedGame(): boolean {
  return loadSavedGame() !== null;
}
