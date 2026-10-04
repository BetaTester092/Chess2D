import { h } from '../dom';
import { navigate } from '../router';
import {
  initializeProfileWithSkill, isOnboarded,
  SKILL_START_ELO, SKILL_LABELS, type SkillLevel,
} from '../../core/rating';
import { unlockAudio } from '../../core/sound';

export function shouldShowWelcome(): boolean {
  return !isOnboarded();
}

export function renderWelcome(container: HTMLElement): void {
  let selected: SkillLevel | null = null;

  const startBtn = h('button', {
    class: 'btn primary',
    disabled: true,
  }, 'Continue');

  const skillList = h('div', { class: 'skill-list' });

  function build() {
    (Object.keys(SKILL_LABELS) as SkillLevel[]).forEach((id) => {
      const meta = SKILL_LABELS[id];
      const card = h('button', {
        class: 'skill-card',
        onclick: () => {
          selected = id;
          skillList.querySelectorAll('.skill-card').forEach((c) => c.classList.remove('active'));
          card.classList.add('active');
          (startBtn as HTMLButtonElement).disabled = false;
          startBtn.textContent = `Start at ${SKILL_START_ELO[id]} ELO`;
        },
      },
        h('div', { class: 'skill-text' },
          h('div', { class: 'skill-title' }, meta.title),
          h('div', { class: 'skill-desc' }, meta.desc),
        ),
        h('div', { class: 'skill-elo' }, `${SKILL_START_ELO[id]}`),
      );
      skillList.appendChild(card);
    });
  }
  build();

  startBtn.addEventListener('click', () => {
    if (!selected) return;
    unlockAudio();
    initializeProfileWithSkill(selected);
    void import('./setup').then((m) => m.syncSetupToProfile());
    navigate('menu');
  });

  container.append(
    h('div', { class: 'logo' },
      h('div', { class: 'knight' }, '♞'),
      h('h1', null, 'Welcome to Chess 2D!'),
      h('p', null, 'Your journey to mastery starts here.'),
    ),
    h('div', { class: 'card' },
      h('h3', null, 'How good is your chess?'),
      h('p', { class: 'rating-sub', style: 'margin:0 0 12px' },
        'Pick your level — we use it to set your starting rating and suggest opponents.'),
      skillList,
    ),
    startBtn,
    h('p', { class: 'rating-sub', style: 'text-align:center;margin:4px 0 0' },
      'You can change opponents any time. Your rating grows as you play.'),
  );
}
