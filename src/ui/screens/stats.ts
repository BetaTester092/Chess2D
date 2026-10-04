import { h } from '../dom';
import { navigate } from '../router';
import { loadProfile, resetProfile } from '../../core/rating';

function resultPill(rec: { winner: string | null; humanColor: 'w' | 'b' }): { text: string; cls: string } {
  if (rec.winner === null) return { text: 'DRAW', cls: 'pill-draw' };
  return rec.winner === rec.humanColor
    ? { text: 'WIN', cls: 'pill-win' }
    : { text: 'LOSS', cls: 'pill-loss' };
}

export function renderStats(container: HTMLElement): void {
  const profile = loadProfile();
  const winRate = profile.games > 0 ? Math.round((profile.wins / profile.games) * 100) : 0;

  const recent = [...profile.history].reverse().slice(0, 20);
  const list = recent.length === 0
    ? [h('div', { class: 'empty' }, 'No games played yet — play your first game!')]
    : recent.map((rec) => {
        const pill = resultPill(rec);
        const d = new Date(rec.at);
        return h('div', { class: 'game-history-row' },
          h('div', null,
            h('div', null, rec.opponent),
            h('div', { class: 'meta' },
              `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${rec.moves} moves · ${rec.rated ? 'rated' : 'unrated'}`),
          ),
          h('div', { style: 'text-align:right' },
            h('div', { class: pill.cls }, pill.text),
            h('div', { class: 'meta' },
              rec.eloBefore !== rec.eloAfter
                ? `${rec.eloBefore} → ${rec.eloAfter} (${rec.eloAfter - rec.eloBefore >= 0 ? '+' : ''}${rec.eloAfter - rec.eloBefore})`
                : 'unrated'),
          ),
        );
      });

  container.append(
    h('div', { class: 'topbar' },
      h('button', { class: 'icon-btn', onclick: () => navigate('menu') }, '←'),
      h('h2', null, 'Your stats'),
      h('button', {
        class: 'icon-btn', title: 'Reset all data',
        onclick: () => {
          if (confirm('Reset rating and ALL stats? This cannot be undone.')) {
            resetProfile();
            navigate('stats');
          }
        },
      }, '🗑'),
    ),
    h('div', { class: 'card rating-card' },
      h('div', { class: 'rating-big' }, String(profile.elo)),
      h('div', null,
        h('div', { class: 'rating-sub' }, 'ELO rating'),
        h('div', { class: 'rating-sub' }, `best win: ${profile.bestWinElo ?? '—'}`),
      ),
    ),
    h('div', { class: 'stat-grid' },
      h('div', { class: 'stat' }, h('b', null, String(profile.games)), h('span', null, 'games')),
      h('div', { class: 'stat' }, h('b', null, `${winRate}%`), h('span', null, 'win rate')),
      h('div', { class: 'stat' }, h('b', null, (profile.streak >= 0 ? `+${profile.streak}` : String(profile.streak))), h('span', null, 'streak')),
      h('div', { class: 'stat' }, h('b', null, String(profile.wins)), h('span', null, 'wins')),
      h('div', { class: 'stat' }, h('b', null, String(profile.losses)), h('span', null, 'losses')),
      h('div', { class: 'stat' }, h('b', null, String(profile.draws)), h('span', null, 'draws')),
    ),
    h('div', { class: 'card' },
      h('h3', null, 'Recent games'),
      ...list,
    ),
  );
}
