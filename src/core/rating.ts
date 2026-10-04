import type { Color, GameResultKind } from '../chess/types';

/* ------------------------------------------------------------------ */
/* ELO                                                                 */
/* ------------------------------------------------------------------ */

export const K_FACTOR = 32;
export const START_RATING = 1200;

export function expectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + 10 ** ((opponentElo - playerElo) / 400));
}

/**
 * Rating update with a taper curve: big, fast gains while you're low-rated,
 * increasingly conservative as you climb (like chess.com's early ramp).
 */
export function computeNewElo(
  playerElo: number, opponentElo: number, score: 0 | 0.5 | 1, gamesPlayed: number,
): number {
  // Higher K while new; also scaled DOWN as absolute rating rises.
  const kGames = gamesPlayed < 10 ? 56 : gamesPlayed < 30 ? 44 : K_FACTOR;
  const kRating = playerElo < 800 ? 1.5
    : playerElo < 1200 ? 1.25
    : playerElo < 1600 ? 1.0
    : playerElo < 2000 ? 0.85
    : 0.7;
  const k = kGames * kRating;
  const expected = expectedScore(playerElo, opponentElo);
  const delta = Math.round(k * (score - expected));
  return Math.max(100, playerElo + delta);
}

export function scoreForHuman(winner: Color | null, humanColor: Color): 0 | 0.5 | 1 {
  if (winner === null) return 0.5;
  return winner === humanColor ? 1 : 0;
}

export function resultTitle(kind: GameResultKind): string {
  switch (kind) {
    case 'checkmate': return 'Checkmate';
    case 'stalemate': return 'Stalemate';
    case 'fifty-move': return 'Fifty-move rule';
    case 'threefold': return 'Threefold repetition';
    case 'insufficient-material': return 'Insufficient material';
    case 'resign': return 'Resignation';
    case 'timeout': return 'Time out';
    case 'agreement': return 'Draw agreed';
  }
}

/* ------------------------------------------------------------------ */
/* Skill-based starting rating (onboarding)                            */
/* ------------------------------------------------------------------ */

export type SkillLevel = 'new' | 'beginner' | 'intermediate' | 'advanced';

export const SKILL_START_ELO: Record<SkillLevel, number> = {
  new: 400,
  beginner: 800,
  intermediate: 1200,
  advanced: 1600,
};

export const SKILL_LABELS: Record<SkillLevel, { title: string; desc: string }> = {
  new: { title: 'New to Chess', desc: 'I just learned the rules' },
  beginner: { title: 'Beginner', desc: 'I know basic tactics' },
  intermediate: { title: 'Intermediate', desc: 'I play regularly' },
  advanced: { title: 'Advanced', desc: 'Strong club player' },
};

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

const PREFIX = 'chess2d.';

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full/blocked — ignore
  }
}

export function removeKey(key: string): void {
  try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}

/* ------------------------- Profile / stats ------------------------ */

export interface GameRecord {
  at: number;            // epoch ms
  opponent: string;      // "Master (2100)" or "Emma"
  opponentElo: number | null;
  humanColor: Color;
  winner: Color | null;
  kind: GameResultKind;
  moves: number;         // plies
  eloBefore: number;
  eloAfter: number;
  rated: boolean;
}

export interface Profile {
  elo: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  bestWinElo: number | null;   // highest rated opponent beaten
  streak: number;              // + wins, - losses
  bestStreak: number;
  history: GameRecord[];       // newest last
}

const DEFAULT_PROFILE: Profile = {
  elo: START_RATING,
  games: 0, wins: 0, losses: 0, draws: 0,
  bestWinElo: null,
  streak: 0,
  bestStreak: 0,
  history: [],
};

export function loadProfile(): Profile {
  const p = loadJson<Profile>('profile', DEFAULT_PROFILE);
  return {
    ...DEFAULT_PROFILE,
    ...p,
    history: Array.isArray(p.history) ? p.history.slice(-100) : [],
  };
}

/** First-run onboarding: sets starting ELO from self-assessed skill. */
export function initializeProfileWithSkill(skill: SkillLevel): Profile {
  const p: Profile = {
    ...DEFAULT_PROFILE,
    elo: SKILL_START_ELO[skill],
    history: [],
  };
  saveProfile(p);
  saveJson('onboarded', true);
  return p;
}

export function isOnboarded(): boolean {
  return loadJson<boolean>('onboarded', false);
}

export function saveProfile(p: Profile): void {
  // Keep storage lean: last 100 games only.
  saveJson('profile', { ...p, history: p.history.slice(-100) });
}

export function resetProfile(): Profile {
  removeKey('profile');
  return loadProfile();
}

export function recordGame(
  p: Profile,
  rec: Omit<GameRecord, 'at' | 'eloBefore' | 'eloAfter'>,
  score: 0 | 0.5 | 1,
): { profile: Profile; delta: number } {
  const eloBefore = p.elo;
  const rated = rec.rated && rec.opponentElo !== null;
  const eloAfter = rated
    ? computeNewElo(eloBefore, rec.opponentElo!, score, p.games)
    : eloBefore;

  const streak = score === 1 ? Math.max(1, p.streak + 1)
    : score === 0 ? Math.min(-1, p.streak - 1)
    : p.streak;

  const next: Profile = {
    elo: eloAfter,
    games: p.games + 1,
    wins: p.wins + (score === 1 ? 1 : 0),
    losses: p.losses + (score === 0 ? 1 : 0),
    draws: p.draws + (score === 0.5 ? 1 : 0),
    bestWinElo: score === 1 && rec.opponentElo !== null
      ? Math.max(p.bestWinElo ?? 0, rec.opponentElo)
      : p.bestWinElo,
    streak,
    bestStreak: Math.max(p.bestStreak, streak),
    history: [...p.history, { ...rec, at: Date.now(), eloBefore, eloAfter }].slice(-100),
  };
  saveProfile(next);
  return { profile: next, delta: eloAfter - eloBefore };
}

/* ----------------------------- Settings --------------------------- */

export type ThemeId = 'classic' | 'emerald' | 'midnight' | 'walnut';

export interface Settings {
  theme: ThemeId;
  sound: boolean;
  haptics: boolean;
  showCoordinates: boolean;
  showLegalMoves: boolean;
  confirmResign: boolean;
  autoQueen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'classic',
  sound: true,
  haptics: true,
  showCoordinates: true,
  showLegalMoves: true,
  confirmResign: true,
  autoQueen: false,
};

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...loadJson<Partial<Settings>>('settings', {}) };
}

export function saveSettings(s: Settings): void {
  saveJson('settings', s);
}
