/** Adsterra ads: top + bottom 320x50 banners, occasional game-end popup. */

/* ====================================================================
 * ADSTERRA CONFIG — the ONLY file you need to edit.
 * In your Adsterra dashboard create ad units, then paste each unit's key
 * (the string inside  atOptions = { 'key' : 'XXXX', ... }  code):
 *  - BANNER_TOP_KEY / BANNER_BOTTOM_KEY : "Banner" 320x50
 *  - END_GAME_NATIVE_KEY                : "Native Banner" (game-end modal)
 *  - POPUNDER_KEY                       : "Popunder" (frequency capped)
 * ==================================================================== */

export const KEYS = {
  BANNER_TOP_KEY: '',
  BANNER_BOTTOM_KEY: '',
  END_GAME_NATIVE_KEY: '',
  POPUNDER_KEY: '',
  REWARDED_KEY: '',
  BANNER_REFRESH_SEC: 45,
};

/* ------------------------ popup frequency --------------------------- */

const AD_FREQ_KEY = 'chess2d.adstate';

interface AdState {
  gamesSincePopup: number;
  lastPopupAt: number;
}

function loadAdState(): AdState {
  try {
    const raw = localStorage.getItem(AD_FREQ_KEY);
    if (raw) return JSON.parse(raw) as AdState;
  } catch { /* ignore */ }
  return { gamesSincePopup: 0, lastPopupAt: 0 };
}

function saveAdState(s: AdState): void {
  try { localStorage.setItem(AD_FREQ_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

const POPUP_EVERY_N_GAMES = 3;
const POPUP_MIN_GAP_MS = 3 * 60 * 1000;

/**
 * Call once per finished game. Returns true when the game-end ad popup
 * should be shown (every N games, with a minimum gap between popups).
 */
export function shouldShowEndGameAd(): boolean {
  if (!KEYS.END_GAME_NATIVE_KEY && !KEYS.POPUNDER_KEY) return false;
  const state = loadAdState();
  state.gamesSincePopup += 1;
  const due = state.gamesSincePopup >= POPUP_EVERY_N_GAMES &&
    Date.now() - state.lastPopupAt >= POPUP_MIN_GAP_MS;
  if (due) {
    state.gamesSincePopup = 0;
    state.lastPopupAt = Date.now();
  }
  saveAdState(state);
  return due;
}

/* -------------------------- banner loader --------------------------- */

function invokeBanner(container: HTMLElement, key: string, width: number): void {
  if (!key) return;
  container.innerHTML = '';
  const conf = document.createElement('script');
  conf.type = 'text/javascript';
  conf.textContent =
    "atOptions = { 'key' : '" + key + "', 'format' : 'iframe', 'height' : 50, 'width' : " + width + ", 'params' : {} };";
  const invoke = document.createElement('script');
  invoke.type = 'text/javascript';
  invoke.src = '//www.highperformanceformat.com/' + key + '/invoke.js';
  invoke.async = true;
  container.appendChild(conf);
  container.appendChild(invoke);
}

const mounted = { top: false, bottom: false };

function bannerWidth(): number {
  return window.innerWidth <= 360 ? 300 : 320;
}

export function initAds(): void {
  const top = document.getElementById('ad-top');
  const bottom = document.getElementById('ad-bottom');

  if (top && !mounted.top) {
    mounted.top = true;
    if (KEYS.BANNER_TOP_KEY) {
      top.classList.add('active');
      const w = bannerWidth();
      invokeBanner(top, KEYS.BANNER_TOP_KEY, w);
      window.setInterval(
        () => invokeBanner(top, KEYS.BANNER_TOP_KEY, w),
        KEYS.BANNER_REFRESH_SEC * 1000,
      );
    }
  }

  if (bottom && !mounted.bottom) {
    mounted.bottom = true;
    if (KEYS.BANNER_BOTTOM_KEY) {
      bottom.classList.add('active');
      const w = bannerWidth();
      invokeBanner(bottom, KEYS.BANNER_BOTTOM_KEY, w);
      window.setInterval(
        () => invokeBanner(bottom, KEYS.BANNER_BOTTOM_KEY, w),
        KEYS.BANNER_REFRESH_SEC * 1000,
      );
    }
  }

  updateAdHeights();
  window.addEventListener('resize', updateAdHeights);
}

function triggerPopunder(): void {
  if (!KEYS.POPUNDER_KEY) return;
  if (document.getElementById('adsterra-popunder')) return;
  const s = document.createElement('script');
  s.id = 'adsterra-popunder';
  s.type = 'text/javascript';
  s.src = '//www.highperformanceformat.com/' + KEYS.POPUNDER_KEY + '/invoke.js';
  document.body.appendChild(s);
}

/** Returns true if the game-end ad popup should appear (call once per game). */
export function maybeShowEndGameAd(): boolean {
  const due = shouldShowEndGameAd();
  if (due) triggerPopunder();
  return due;
}

/**
 * Fired when the user explicitly opts in (e.g. "watch ad for +5 hints").
 * With a real REWARDED key this loads the rewarded interstitial; otherwise no-op.
 */
export function fireRewardedAd(): void {
  if (!KEYS.REWARDED_KEY) return;
  if (document.getElementById('adsterra-rewarded')) return;
  const s = document.createElement('script');
  s.id = 'adsterra-rewarded';
  s.type = 'text/javascript';
  s.src = '//www.highperformanceformat.com/' + KEYS.REWARDED_KEY + '/invoke.js';
  document.body.appendChild(s);
}

export function markGameCount(): void { /* counting happens per game end */ }

export function updateAdHeights(): void {
  const root = document.documentElement;
  const top = document.getElementById('ad-top');
  const bottom = document.getElementById('ad-bottom');
  root.style.setProperty('--ad-top-h', (top?.offsetHeight ?? 0) + 'px');
  root.style.setProperty('--ad-bottom-h', (bottom?.offsetHeight ?? 0) + 'px');
}

export const REFRESH_BANNERS: Array<() => void> = [];
