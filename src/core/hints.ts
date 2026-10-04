import { loadJson, saveJson } from './rating';

const KEY = 'hints.state';

export interface HintState {
  remaining: number;
  totalUsed: number;
  totalEarned: number;
}

const FREE_HINTS = 5;
const REFILL_AMOUNT = 5;
const MAX_BANK = 15;

export function getHintState(): HintState {
  const s = loadJson<HintState>(KEY, { remaining: FREE_HINTS, totalUsed: 0, totalEarned: FREE_HINTS });
  return {
    remaining: Math.max(0, Math.min(MAX_BANK, s.remaining)),
    totalUsed: s.totalUsed ?? 0,
    totalEarned: s.totalEarned ?? FREE_HINTS,
  };
}

export function canUseHint(): boolean {
  return getHintState().remaining > 0;
}

/** Spend one hint; returns false if none left. */
export function spendHint(): boolean {
  const s = getHintState();
  if (s.remaining <= 0) return false;
  s.remaining--;
  s.totalUsed++;
  saveJson(KEY, s);
  return true;
}

/** Grant hints after a completed ad view. */
export function grantAdHints(): HintState {
  const s = getHintState();
  s.remaining = Math.min(MAX_BANK, s.remaining + REFILL_AMOUNT);
  s.totalEarned += REFILL_AMOUNT;
  saveJson(KEY, s);
  return s;
}

/** Simulated rewarded-ad flow with a cooldown so it can't be spammed. */
const AD_COOLDOWN_MS = 90_000;
const LAST_AD_KEY = 'hints.lastAdAt';

export function canWatchAdForHints(): boolean {
  const last = loadJson<number>(LAST_AD_KEY, 0);
  return Date.now() - last >= AD_COOLDOWN_MS;
}

export function adCooldownLeftMs(): number {
  const last = loadJson<number>(LAST_AD_KEY, 0);
  return Math.max(0, AD_COOLDOWN_MS - (Date.now() - last));
}

/**
 * Runs the rewarded flow: fires the Adsterra popup/break script, marks the
 * cooldown, and grants +5 hints. In production with real ad keys this is
 * where the Adsterra "Rewarded Interstitial" callback would confirm the view.
 */
export function watchAdForHints(): Promise<HintState> {
  const last = loadJson<number>(LAST_AD_KEY, 0);
  if (Date.now() - last < AD_COOLDOWN_MS) {
    return Promise.reject(new Error('Ad not ready yet'));
  }
  saveJson(LAST_AD_KEY, Date.now());
  // Fire the optional rewarded/popunder script if configured.
  try {
    // Lazy import avoids a circular dependency at module init.
    import('../ads/ads').then((m) => m.fireRewardedAd()).catch(() => { /* ignore */ });
  } catch { /* ignore */ }
  return Promise.resolve(grantAdHints());
}
