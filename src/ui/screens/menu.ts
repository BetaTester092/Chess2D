import { h } from '../dom';
import { navigate } from '../router';
import { loadProfile } from '../../core/rating';
import { loadSavedGame } from '../../core/storage';
import { unlockAudio } from '../../core/sound';
import { syncSetupToProfile } from './setup';
import { AI_LEVELS } from '../../engine/search';

export function renderMenu(container: HTMLElement): void {
  const profile = loadProfile();
  const saved = loadSavedGame();
  const canResume = saved !== null && !saved.result;
  syncSetupToProfile();

  const nextLevel =
    AI_LEVELS.find((l) => l.elo >= profile.elo) ?? AI_LEVELS[AI_LEVELS.length - 1];

  const ratingTile = h('div', { class: 'rating-tile' },
    h('div', { class: 'rt-left' },
      h('div', { class: 'rt-label' }, 'YOUR RATING'),
      h('div', { class: 'rt-elo' }, String(profile.elo)),
    ),
    h('div', { class: 'rt-right' },
      h('div', { class: 'rt-record' }, `${profile.wins}W · ${profile.losses}L · ${profile.draws}D`),
      h('div', { class: 'rt-streak' },
        profile.streak > 0 ? `🔥 ${profile.streak} win streak` : ''),
    ),
  );

  const resumeStrip = canResume
    ? h('button', {
        class: 'resume-strip',
        onclick: () => { unlockAudio(); navigate('game', { resume: true }); },
      },
        h('span', { class: 'rs-ic' }, '⏵'),
        h('span', { class: 'rs-text' },
          h('b', null, 'Resume game'),
          h('span', null, `vs AI · move ${Math.ceil((saved!.sans?.length ?? 0) / 2) + 1}`),
        ),
        h('span', { class: 'rs-arrow' }, '›'),
      )
    : null;

  container.append(
    h('div', { class: 'home-head' },
      h('div', { class: 'home-logo' }, '♞'),
      h('div', null,
        h('h1', null, 'Chess 2D'),
        h('p', null, 'Play. Improve. Climb.'),
      ),
    ),
    ratingTile,
    h('button', {
      class: 'play-cta',
      onclick: () => { unlockAudio(); navigate('setup'); },
    },
      h('span', { class: 'pc-icon' }, '♟'),
      h('span', { class: 'pc-text' },
        h('b', null, 'Play'),
        h('span', null, `Suggested: ${nextLevel.name} (~${nextLevel.elo})`),
      ),
      h('span', { class: 'pc-arrow' }, '›'),
    ),
    ...(resumeStrip ? [resumeStrip] : []),
    h('div', { class: 'quick-grid' },
      h('button', { class: 'quick-tile', onclick: () => navigate('stats') },
        h('span', { class: 'qt-icon' }, '📈'),
        h('span', { class: 'qt-label' }, 'Stats'),
      ),
      h('button', { class: 'quick-tile', onclick: () => navigate('settings') },
        h('span', { class: 'qt-icon' }, '⚙️'),
        h('span', { class: 'qt-label' }, 'Settings'),
      ),
    ),
  );
}
