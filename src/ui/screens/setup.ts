import { h } from '../dom';
import { navigate } from '../router';
import { AI_LEVELS, type AiDifficulty } from '../../engine/search';
import { loadProfile } from '../../core/rating';

/** Nearest AI level to a rating. */
function levelForElo(elo: number): AiDifficulty {
  let best = AI_LEVELS[0];
  for (const l of AI_LEVELS) {
    if (Math.abs(l.elo - elo) < Math.abs(best.elo - elo)) best = l;
  }
  return best.id;
}

export interface SetupChoices {
  color: 'w' | 'b' | 'random';
  level: AiDifficulty;
  minutes: number;
  increment: number;
  rated: boolean;
}

export const setupState: SetupChoices = {
  color: 'w',
  level: 'intermediate',
  minutes: 10,
  increment: 0,
  rated: true,
};

/** Align the default opponent with the player's current rating. */
export function syncSetupToProfile(): void {
  setupState.level = levelForElo(loadProfile().elo);
}

export function renderSetup(container: HTMLElement): void {
  const profile = loadProfile();

  let color = setupState.color;
  let level = setupState.level;
  let rated = setupState.rated;

  const TIME_CONTROLS = [
    { label: '∞ Unlimited', minutes: 0, inc: 0 },
    { label: '1 min', minutes: 1, inc: 0 },
    { label: '3 min', minutes: 3, inc: 0 },
    { label: '5 min', minutes: 5, inc: 0 },
    { label: '10 min', minutes: 10, inc: 0 },
    { label: '15|10', minutes: 15, inc: 10 },
  ];

  // Default: 10+0 (index 4) — must be a real clock, not Unlimited.
  let tcIndex = TIME_CONTROLS.findIndex((t) => t.minutes === setupState.minutes && t.inc === setupState.increment);
  if (tcIndex < 0) tcIndex = 4;

  const colorSeg = h('div', { class: 'seg' });
  const levelSeg = h('div', { class: 'seg' });
  const tcSeg = h('div', { class: 'seg' });
  const ratedToggle = h('button', { class: `toggle ${rated ? 'on' : ''}` });
  const startBtn = h('button', { class: 'btn primary' }, 'Start game');

  function refresh() {
    // color
    colorSeg.innerHTML = '';
    for (const c of ['w', 'b', 'random'] as const) {
      const label = c === 'w' ? '♔ White' : c === 'b' ? '♚ Black' : '🎲 Random';
      const b = h('button', {
        class: c === color ? 'active' : '',
        onclick: () => { color = c; refresh(); },
      }, label);
      colorSeg.appendChild(b);
    }
    // level
    levelSeg.innerHTML = '';
    for (const l of AI_LEVELS) {
      const b = h('button', {
        class: l.id === level ? 'active' : '',
        onclick: () => { level = l.id; refresh(); },
      }, `${l.name}`);
      levelSeg.appendChild(b);
    }
    // time controls
    tcSeg.innerHTML = '';
    TIME_CONTROLS.forEach((tc, i) => {
      const b = h('button', {
        class: i === tcIndex ? 'active' : '',
        onclick: () => { tcIndex = i; refresh(); },
      }, tc.label);
      tcSeg.appendChild(b);
    });
    ratedToggle.className = `toggle ${rated ? 'on' : ''}`;
    startBtn.textContent = `Start game vs ${AI_LEVELS.find((l) => l.id === level)?.name ?? ''}`;
  }

  ratedToggle.addEventListener('click', () => { rated = !rated; refresh(); });

  refresh();

  container.append(
    h('div', { class: 'topbar' },
      h('button', { class: 'icon-btn', onclick: () => navigate('menu') }, '←'),
      h('h2', null, 'New game'),
      h('div', { style: 'width:42px' }),
    ),
    h('div', { class: 'card' },
      h('h3', null, 'Your color'),
      colorSeg,
    ),
    h('div', { class: 'card' },
      h('h3', null, `AI difficulty — your rating: ${profile.elo}`),
      levelSeg,
      h('p', {
        class: 'rating-sub',
        style: 'margin:8px 0 0',
      }, 'Recommended: the level closest to your rating for balanced ELO gains.'),
    ),
    h('div', { class: 'card' },
      h('h3', null, 'Time control'),
      tcSeg,
    ),
    h('div', { class: 'card' },
      h('div', { class: 'setting-row', style: 'border:none;padding:0' },
        h('div', null,
          h('div', { class: 'label' }, 'Rated game'),
          h('div', { class: 'hint' }, 'Rated games adjust your ELO rating'),
        ),
        ratedToggle,
      ),
    ),
    startBtn,
  );

  startBtn.addEventListener('click', () => {
    setupState.color = color;
    setupState.level = level;
    setupState.rated = rated;
    const tc = TIME_CONTROLS[tcIndex];
    setupState.minutes = tc.minutes;
    setupState.increment = tc.inc;
    navigate('game', { newGame: true });
  });
}
