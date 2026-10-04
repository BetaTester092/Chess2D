import './ui/styles.css';

import { initRouter, registerScreen, navigate } from './ui/router';
import { renderMenu } from './ui/screens/menu';
import { renderSetup } from './ui/screens/setup';
import { renderGame } from './ui/screens/game';
import { renderStats } from './ui/screens/stats';
import { renderSettings, applyTheme } from './ui/screens/settings';
import { renderWelcome, shouldShowWelcome } from './ui/screens/welcome';
import { loadSettings } from './core/rating';
import { initAds, updateAdHeights } from './ads/ads';

const screensEl = document.getElementById('screens')!;

applyTheme(loadSettings());
initRouter(screensEl);
registerScreen('welcome', renderWelcome);
registerScreen('menu', renderMenu);
registerScreen('setup', renderSetup);
registerScreen('game', (el, params) => { renderGame(el, params); });
registerScreen('stats', renderStats);
registerScreen('settings', renderSettings);

// Ads stay dormant until keys are set; nothing shows on the welcome/intro flow.
initAds();
window.addEventListener('load', updateAdHeights);

navigate(shouldShowWelcome() ? 'welcome' : 'menu');

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* offline unavailable */ });
  });
}
