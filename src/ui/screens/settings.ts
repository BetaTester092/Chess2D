import { h } from '../dom';
import { navigate } from '../router';
import {
  loadSettings, saveSettings, resetProfile, type Settings, type ThemeId,
} from '../../core/rating';
import { GameController } from '../../core/game';
import { clearSavedGame } from '../../core/storage';
import { loadJson, saveJson } from '../../core/rating';

const THEMES: { id: ThemeId; name: string; light: string; dark: string }[] = [
  { id: 'classic', name: 'Classic', light: '#edd6b0', dark: '#b58863' },
  { id: 'emerald', name: 'Emerald', light: '#eeeed2', dark: '#769656' },
  { id: 'midnight', name: 'Midnight', light: '#97a6c4', dark: '#4c5a7a' },
  { id: 'walnut', name: 'Walnut', light: '#e8d0aa', dark: '#7c4a2d' },
];

export function renderSettings(container: HTMLElement): void {
  const s = loadSettings();

  const themeDots = h('div', { class: 'theme-dots' });
  THEMES.forEach((t) => {
    const dot = h('button', {
      class: `theme-dot ${s.theme === t.id ? 'active' : ''}`,
      title: t.name,
      onclick: () => {
        s.theme = t.id;
        applyTheme(s);
        saveSettings(s);
        themeDots.querySelectorAll('.theme-dot').forEach((d) => d.classList.remove('active'));
        dot.classList.add('active');
      },
    });
    dot.innerHTML = `<i style="background:${t.light}"></i><i style="background:${t.dark}"></i>`;
    themeDots.appendChild(dot);
  });

  function toggleRow(
    label: string, hint: string, get: () => boolean, set: (v: boolean) => void,
  ): HTMLElement {
    const t = h('button', { class: `toggle ${get() ? 'on' : ''}` });
    const row = h('div', { class: 'setting-row' },
      h('div', null,
        h('div', { class: 'label' }, label),
        hint ? h('div', { class: 'hint' }, hint) : null,
      ),
      t,
    );
    const flip = () => {
      set(!get());
      t.classList.toggle('on', get());
      saveSettings(s);
    };
    t.addEventListener('click', flip);
    return row;
  }

  container.append(
    h('div', { class: 'topbar' },
      h('button', { class: 'icon-btn', onclick: () => navigate('menu') }, '←'),
      h('h2', null, 'Settings'),
      h('div', { style: 'width:42px' }),
    ),
    h('div', { class: 'card' },
      h('h3', null, 'Board theme'),
      themeDots,
    ),
    h('div', { class: 'card' },
      toggleRow('Sound effects', 'Move, capture, check and game-end sounds', () => s.sound, (v) => { s.sound = v; }),
      toggleRow('Vibration', 'Haptic feedback on moves', () => s.haptics, (v) => { s.haptics = v; }),
      toggleRow('Board coordinates', 'Show a-h / 1-8 labels', () => s.showCoordinates, (v) => { s.showCoordinates = v; }),
      toggleRow('Legal move hints', 'Show dots for possible moves', () => s.showLegalMoves, (v) => { s.showLegalMoves = v; }),
      toggleRow('Auto-queen', 'Always promote to queen without asking', () => s.autoQueen, (v) => { s.autoQueen = v; }),
      toggleRow('Confirm resign', 'Ask before resigning', () => s.confirmResign, (v) => { s.confirmResign = v; }),
    ),
    h('div', { class: 'card danger-zone' },
      h('h3', null, 'Danger zone'),
      h('button', {
        class: 'btn danger',
        onclick: prestigeConfirm,
      }, '🔄 Reset progress (Prestige)'),
      h('div', { class: 'hint', style: 'margin-top:8px' },
        'Wipes rating, stats, hints bank and the saved game, then restarts onboarding.'),
    ),
    h('div', { class: 'card' },
      h('h3', null, 'About'),
      h('div', { class: 'rating-sub' },
        'Chess 2D v1.1 — full rules, 6 AI levels with ELO ratings, premoves, autosave, offline play. Data stays on your device.'),
    ),
  );
}

function prestigeConfirm(): void {
  if (!confirm('Start Prestige?\n\nThis resets EVERYTHING: your ELO rating, all stats, hint bank and the current game. This cannot be undone.')) return;
  if (!confirm('Really sure? This is your last chance to keep your progress.')) return;

  resetProfile();
  clearSavedGame();
  GameController.clearAutosave();
  // Hint bank + ad state
  try { localStorage.removeItem('chess2d.hints.state'); } catch { /* ignore */ }
  try { localStorage.removeItem('chess2d.adstate'); } catch { /* ignore */ }
  // Onboarding flag -> welcome flow runs again on next navigation.
  try { localStorage.removeItem('chess2d.onboarded'); } catch { /* ignore */ }
  saveJson('prestige.count', loadJson<number>('prestige.count', 0) + 1);

  navigate('welcome');
}

export function applyTheme(s: Settings): void {
  document.documentElement.setAttribute('data-theme', s.theme);
}
