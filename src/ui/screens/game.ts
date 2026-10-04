import { h, clearEl, formatClock } from '../dom';
import { navigate } from '../router';
import { BoardView } from '../board';
import { pieceChar } from '../pieces';
import { GameController } from '../../core/game';
import { findKing } from '../../chess/rules';
import { other, type Color, type PieceType } from '../../chess/types';
import { levelById } from '../../engine/search';
import { loadProfile, loadSettings, saveSettings, resultTitle, type Settings } from '../../core/rating';
import { setupState } from './setup';
import { unlockAudio } from '../../core/sound';
import { initAds, maybeShowEndGameAd, markGameCount } from '../../ads/ads';
import { getHintState, canUseHint, spendHint, canWatchAdForHints, watchAdForHints } from '../../core/hints';
import { reviewGame, CLASS_META, type ReviewResult, type Classification } from '../../core/review';

let controller: GameController | null = null;
let board: BoardView | null = null;
let settings: Settings = loadSettings();

interface Parts {
  root: HTMLElement;
  topName: HTMLElement;
  topSub: HTMLElement;
  topCaptured: HTMLElement;
  topClock: HTMLElement;
  bottomName: HTMLElement;
  bottomSub: HTMLElement;
  bottomCaptured: HTMLElement;
  bottomClock: HTMLElement;
  statusLine: HTMLElement;
  moveList: HTMLElement;
  undoBtn: HTMLElement;
  hintBtn: HTMLElement;
  hintChip: HTMLElement;
  evalFill: HTMLElement;
}

let parts: Parts;
let hintAnimating = false;

export function renderGame(
  container: HTMLElement,
  opts: { resume?: boolean; newGame?: boolean } = {},
): void {
  settings = loadSettings();
  clearEl(container);
  container.classList.add('game-screen');
  endModalShown = false;
  reviewResult = null;

  initAds();

  let saved = null as ReturnType<typeof GameController.loadAutosave>;
  if (opts.resume) saved = GameController.loadAutosave();

  if (opts.newGame || !saved) {
    const color: Color = setupState.color === 'random'
      ? (Math.random() < 0.5 ? 'w' : 'b')
      : setupState.color;
    controller = new GameController({
      humanColor: color,
      aiLevel: setupState.level,
      rated: setupState.rated,
      time: { minutes: setupState.minutes, incrementSeconds: setupState.increment },
      mode: 'ai',
      settings,
    });
  } else {
    controller = new GameController(
      {
        humanColor: saved!.humanColor,
        aiLevel: saved!.aiLevel,
        rated: saved!.rated,
        time: {
          minutes: saved!.whiteMs !== null ? Math.max(1, Math.round(saved!.whiteMs / 60000)) : 0,
          incrementSeconds: Math.round((saved!.incrementMs ?? 0) / 1000),
        },
        mode: saved!.mode,
        settings,
      },
      saved!,
    );
  }

  markGameCount();

  /* ------------------------------ layout ------------------------------ */

  board = new BoardView({
    flipped: controller.options.humanColor === 'b',
    showCoordinates: settings.showCoordinates,
    onSquareTap: (sq) => { controller?.tapSquare(sq); render(); },
  });

  parts = {
    root: container,
    topName: h('div', { class: 'player-name' }),
    topSub: h('div', { class: 'player-sub' }),
    topCaptured: h('div', { class: 'captured' }),
    topClock: h('div', { class: 'clock' }, '–'),
    bottomName: h('div', { class: 'player-name' }),
    bottomSub: h('div', { class: 'player-sub' }),
    bottomCaptured: h('div', { class: 'captured' }),
    bottomClock: h('div', { class: 'clock' }, '–'),
    statusLine: h('div', { class: 'thinking-pill', style: 'visibility:hidden' },
      h('span', { class: 'dot' }), ' AI thinking…'),
    moveList: h('div', { class: 'move-list' }),
    undoBtn: h('button', { class: 'abtn', title: 'Undo' }, '↩', h('span', { class: 'lbl' }, 'Undo')),
    hintBtn: h('button', { class: 'abtn', title: 'Hint' }, '💡', h('span', { class: 'lbl' }, 'Hint')),
    hintChip: h('span', { class: 'hint-chip' }),
    evalFill: h('i'),
  };

  const evalBar = h('div', { class: 'eval-bar', title: 'Evaluation' }, parts.evalFill);
  board.root.appendChild(evalBar);

  const topRow = h('div', { class: 'players-bar' },
    h('div', { class: 'player-info' },
      h('div', { class: 'avatar' }, '🤖'),
      h('div', null, parts.topName, parts.topSub),
      parts.topCaptured,
    ),
    parts.topClock,
  );
  const bottomRow = h('div', { class: 'players-bar' },
    h('div', { class: 'player-info' },
      h('div', { class: 'avatar' }, '🧑'),
      h('div', null, parts.bottomName, parts.bottomSub),
      parts.bottomCaptured,
    ),
    parts.bottomClock,
  );

  const reviewBanner = h('div', { class: 'game-review-banner', style: 'display:none' },
    h('button', {
      class: 'btn small primary',
      onclick: openReviewModal,
    }, '⚡ Game Review'),
  );

  const actions = h('div', { class: 'action-bar' },
    parts.undoBtn,
    parts.hintBtn,
    h('button', {
      class: 'abtn', title: 'Offer draw',
      onclick: () => {
        if (confirm('Offer a draw? The AI accepts only in balanced positions.')) {
          controller?.offerDrawAi();
          render();
        }
      },
    }, '½', h('span', { class: 'lbl' }, 'Draw')),
    h('button', {
      class: 'abtn', title: 'Resign', onclick: onResign,
    }, '🏳', h('span', { class: 'lbl' }, 'Resign')),
    h('button', {
      class: 'abtn', title: 'Exit to menu', onclick: onExit,
    }, '☰', h('span', { class: 'lbl' }, 'Menu')),
  );

  container.append(
    topRow,
    board.root,
    bottomRow,
    h('div', { style: 'display:flex;justify-content:center;align-items:center;gap:8px' },
      parts.statusLine, parts.hintChip),
    actions,
    parts.moveList,
    reviewBanner,
  );

  parts.undoBtn.addEventListener('click', () => { controller?.undo(); render(); });
  parts.hintBtn.addEventListener('click', onHintTap);

  controller.subscribe(render);
  render();

  if (!controller.over && controller.isAiTurn()) {
    parts.statusLine.style.visibility = 'visible';
  }

  container.addEventListener('pointerdown', unlockAudio, { once: true });

  window.addEventListener('beforeunload', () => {
    try { controller?.destroy(); } catch { /* ignore */ }
  }, { once: true });
}

/* ------------------------------ hints ------------------------------- */

function onHintTap(): void {
  if (!controller || controller.over || hintAnimating) return;
  if (canUseHint()) {
    if (spendHint()) {
      controller.requestHint();
      render();
      // animate chip
      hintAnimating = true;
      setTimeout(() => { hintAnimating = false; render(); }, 600);
    }
  } else {
    openHintAdModal();
  }
}

function openHintAdModal(): void {
  const canWatch = canWatchAdForHints();
  const modal = h('div', { class: 'modal' },
    h('div', { class: 'result-emoji' }, '💡'),
    h('h2', null, 'Out of hints'),
    h('p', { class: 'sub' }, 'Watch a short ad to get 5 more hints. You keep your game progress.'),
    h('button', {
      class: 'btn primary',
      disabled: !canWatch,
      onclick: async () => {
        try {
          await watchAdForHints();
          backdrop.remove();
          toastMsg('+5 hints added!');
          render();
        } catch {
          toastMsg('Ad not ready — try again in a minute', true);
        }
      },
    }, canWatch ? '▶ Watch ad for +5 hints' : '⏳ Ad cooling down…'),
    h('button', { class: 'btn', onclick: () => backdrop.remove() }, 'Maybe later'),
  );
  const backdrop = h('div', { class: 'modal-backdrop' }, modal);
  document.getElementById('modal-root')!.appendChild(backdrop);
}

function toastMsg(msg: string, error = false): void {
  const root = document.getElementById('toast-root') ?? (() => {
    const r = h('div', { id: 'toast-root' });
    document.body.appendChild(r);
    return r;
  })();
  const t = h('div', { class: `toast ${error ? 'error' : ''}` }, msg);
  root.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

/* ------------------------------ render ------------------------------ */

function render(): void {
  if (!controller || !board || !parts) return;
  const snap = controller.snapshot();
  const level = levelById(controller.options.aiLevel);
  const profile = loadProfile();

  // Player chips
  parts.topName.textContent = `AI · ${level.name}`;
  parts.topSub.textContent = `~${level.elo} ELO`;
  parts.bottomName.textContent = 'You';
  parts.bottomSub.textContent = String(profile.elo);

  // Captured pieces (victim color glyphs)
  parts.topCaptured.replaceChildren(
    ...sortCapturedList(snap.capturedByBlack).map((t) => h('span', null, pieceChar('w', t))),
  );
  parts.bottomCaptured.replaceChildren(
    ...sortCapturedList(snap.capturedByWhite).map((t) => h('span', null, pieceChar('b', t))),
  );

  // Clocks
  const unlimited = controller.options.time.minutes === 0;
  const oppColor = other(controller.options.humanColor);
  if (unlimited) {
    parts.topClock.textContent = '∞';
    parts.bottomClock.textContent = '∞';
    parts.topClock.classList.remove('active', 'low');
    parts.bottomClock.classList.remove('active', 'low');
  } else {
    updateClock(parts.topClock, oppColor === 'w' ? snap.whiteMs : snap.blackMs, snap.turn === oppColor);
    updateClock(parts.bottomClock, controller.options.humanColor === 'w' ? snap.whiteMs : snap.blackMs, snap.turn === controller.options.humanColor);
  }

  // Hint chip
  const hs = getHintState();
  parts.hintChip.textContent = `💡 ${hs.remaining}`;
  parts.hintChip.classList.toggle('zero', hs.remaining === 0);
  (parts.hintBtn as HTMLButtonElement).disabled = snap.over || snap.thinking;

  // Status
  if (snap.over) {
    parts.statusLine.style.visibility = 'hidden';
    showGameEndModal();
  } else if (snap.thinking) {
    parts.statusLine.style.visibility = 'visible';
  } else {
    parts.statusLine.style.visibility = 'hidden';
  }

  // Undo availability
  (parts.undoBtn as HTMLButtonElement).disabled = !snap.canUndo;

  // Show the review banner once the game has ended.
  const banner = parts.root.querySelector('.game-review-banner') as HTMLElement | null;
  if (banner) banner.style.display = snap.over ? 'flex' : 'none';

  // Move list (grid with review icons if reviewed)
  renderMoveList(snap.sans);

  // Board
  const pos = snap.position;
  board.render({
    board: pos.board.map((p) => (p ? p.type : null)) as (PieceType | null)[],
    colors: pos.board.map((p) => (p ? p.color : null)) as (Color | null)[],
    lastMove: snap.lastMove,
    checkSquare: snap.check ? findKing(pos, snap.turn) : null,
    selection: snap.selection,
    hintTargets: snap.hints && snap.selection !== null
      ? new Set(snap.hints.get(snap.selection) ?? [])
      : null,
    showLegal: settings.showLegalMoves,
    premoveSelection: snap.premoveSelection,
    premoveTarget: snap.premove?.to ?? null,
  });

  // Eval bar (from AI's last search if available; else 50%)
  const evalCp = snap.aiMeta ? snap.aiMeta.scoreCp : 0;
  // Convert white-perspective cp to fill fraction via sigmoid.
  const humanIsWhite = controller.options.humanColor === 'w';
  const whiteCp = humanIsWhite ? evalCp : -evalCp;
  const frac = 1 / (1 + Math.exp(-whiteCp / 300));
  parts.evalFill.style.height = `${Math.round(frac * 100)}%`;

  // Promotion modal
  if (snap.promotionPending) showPromotionModal();
}

function renderMoveList(sans: string[]): void {
  const el = parts.moveList;
  el.innerHTML = '';
  if (sans.length === 0) {
    el.append(h('div', { class: 'empty' }, 'Moves will appear here'));
    return;
  }
  const grid = h('div', { class: 'move-list-grid' });
  for (let i = 0; i < sans.length; i += 2) {
    const num = i / 2 + 1;
    grid.appendChild(h('span', { class: 'mvnum' }, `${num}.`));
    for (const j of [i, i + 1]) {
      if (j < sans.length) {
        const reviewCls = reviewResult?.items[j]?.classification;
        const icon = reviewCls ? CLASS_META[reviewCls].icon : '';
        grid.appendChild(h('span', { class: 'mv current' }, sans[j], icon ? h('span', { class: 'rv-ico', style: `color:${CLASS_META[reviewCls!].color}` }, icon) : null));
      } else {
        grid.appendChild(h('span', { class: 'mv' }, ''));
      }
    }
  }
  el.appendChild(grid);
  el.scrollTop = el.scrollHeight;
}

function updateClock(el: HTMLElement, ms: number, active: boolean): void {
  el.textContent = formatClock(ms);
  el.classList.toggle('active', active);
  el.classList.toggle('low', ms > 0 && ms < 30000);
}

const CAPTURE_ORDER: PieceType[] = ['q', 'r', 'b', 'n', 'p'];
function sortCapturedList(list: PieceType[]): PieceType[] {
  return [...list].sort((a, b) => CAPTURE_ORDER.indexOf(a) - CAPTURE_ORDER.indexOf(b));
}

/* ------------------------------ modals ------------------------------ */

function showPromotionModal(): void {
  const existing = document.querySelector('.modal-backdrop');
  if (existing) existing.remove();

  const choices: PieceType[] = ['q', 'r', 'b', 'n'];
  const gl: Record<PieceType, string> = { q: '♕', r: '♖', b: '♗', n: '♘', k: '♔', p: '♙' };
  const modal = h('div', { class: 'modal' },
    h('h2', null, 'Promote to'),
    h('div', { class: 'promo-choices' },
      ...choices.map((t) => h('button', {
        textContent: gl[t],
        onclick: () => {
          backdrop.remove();
          controller?.completePromotion(t);
          render();
        },
      })),
    ),
  );
  const backdrop = h('div', { class: 'modal-backdrop' }, modal);
  document.getElementById('modal-root')!.appendChild(backdrop);
}

let endModalShown = false;
let reviewResult: ReviewResult | null = null;

function showGameEndModal(): void {
  if (endModalShown || !controller) return;
  endModalShown = true;
  const snap = controller.snapshot();
  const result = snap.result!;
  const humanWon = result.winner === controller.options.humanColor;
  const draw = result.winner === null;

  const emoji = draw ? '🤝' : humanWon ? '🏆' : '💀';
  const headline = draw ? 'Draw' : humanWon ? 'You win!' : 'AI wins';
  const delta = snap.eloDelta;
  const newElo = loadProfile().elo;

  const eloBlock = delta !== null && delta !== undefined
    ? h('div', { class: `elo-delta ${delta >= 0 ? 'up' : 'down'}` },
        `${delta >= 0 ? '+' : ''}${delta} ELO`,
        h('span', { class: 'new' }, `→ ${newElo}`),
      )
    : h('div', { class: 'elo-delta', style: 'font-size:1rem' }, 'Unrated game');

  const buttons = h('div', null,
    h('button', { class: 'btn primary', onclick: () => { cleanup(); openReviewModal(); } }, '⚡ Game Review'),
    h('button', { class: 'btn', onclick: () => { cleanup(); navigate('setup'); } }, '↺ New game'),
    h('button', { class: 'btn', onclick: () => { cleanup(); navigate('menu'); } }, '☰ Main menu'),
    h('button', {
      class: 'btn',
      onclick: () => { cleanup(); controller?.undo(); endModalShown = false; render(); },
    }, '↩ Take back last move'),
  );

  const modal = h('div', { class: 'modal' },
    h('div', { class: 'result-emoji' }, emoji),
    h('h2', null, headline),
    h('p', { class: 'sub' }, `${resultTitle(result.kind)} · ${snap.sans.length} moves`),
    eloBlock,
    buttons,
  );
  const backdrop = h('div', { class: 'modal-backdrop' }, modal);
  const cleanup = () => backdrop.remove();
  document.getElementById('modal-root')!.appendChild(backdrop);

  // Occasionally show ad popup after game end (frequency-capped; off until keys set).
  maybeShowEndGameAd();
}

/* ------------------------------ review ------------------------------ */

function openReviewModal(): void {
  if (!controller) return;
  const fens = ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ...controller.fens];
  const sans = [...controller.sans];

  const barFill = h('i');
  const label = h('div', { class: 'rating-sub' }, 'Analyzing… 0%');
  const body = h('div', { class: 'review-progress' },
    h('div', { class: 'spinner', style: 'font-size:1.6rem' }, '🔎'),
    h('div', { class: 'bar' }, barFill),
    label,
  );
  const modal = h('div', { class: 'modal' },
    h('h2', null, 'Game Review'),
    body,
  );
  const backdrop = h('div', { class: 'modal-backdrop' }, modal);
  document.getElementById('modal-root')!.appendChild(backdrop);

  reviewGame(fens, sans, (done, total) => {
    const pct = Math.round((done / total) * 100);
    barFill.style.width = `${pct}%`;
    label.textContent = `Analyzing… ${pct}%`;
  }).then((res) => {
    reviewResult = res;
    renderReviewSummary(modal, body, res);
    render(); // refresh move list icons
  }).catch(() => {
    label.textContent = 'Review failed. Try again.';
  });
}

function renderReviewSummary(modal: HTMLElement, oldBody: HTMLElement, res: ReviewResult): void {
  const backdrop = oldBody.closest('.modal-backdrop') as HTMLElement;
  const humanColor = controller?.options.humanColor ?? 'w';
  const mine = humanColor === 'w' ? res.white : res.black;
  const theirs = humanColor === 'w' ? res.black : res.white;

  const mkChips = (counts: Record<Classification, number>) =>
    h('div', { class: 'review-counts' },
      ...(Object.keys(CLASS_META) as Classification[])
        .filter((c) => counts[c] > 0)
        .map((c) => h('span', { class: 'chip' },
          h('span', { style: `color:${CLASS_META[c].color}` }, CLASS_META[c].icon),
          CLASS_META[c].label,
          h('span', { class: 'n' }, `×${counts[c]}`),
        )),
    );

  const moveRows = res.items.slice(-40).map((it) => {
    const meta = CLASS_META[it.classification];
    return h('div', { class: 'review-move-row' },
      h('span', { class: 'num' }, `${Math.ceil(it.ply / 2)}${it.color === 'w' ? '.' : '…'}`),
      h('span', { class: 'san' }, it.san),
      h('span', { class: 'cls', style: `color:${meta.color}` }, meta.icon, meta.label),
      h('span', { class: 'loss' }, it.classification === 'book' ? 'book' : `-${it.lossCp}cp`),
    );
  });

  const doneBtn = h('button', { class: 'btn primary', style: 'margin-top:10px', onclick: () => { backdrop.remove(); } }, 'Done');

  const summary = h('div', null,
    h('div', { class: 'review-summary' },
      h('div', { class: 'side' },
        h('div', { class: 'acc', style: 'color:var(--cc-green)' }, mine.accuracy.toFixed(1)),
        h('div', { class: 'who' }, 'You'),
      ),
      h('div', { class: 'vs' }, 'VS'),
      h('div', { class: 'side' },
        h('div', { class: 'acc', style: 'color:var(--text-dim)' }, theirs.accuracy.toFixed(1)),
        h('div', { class: 'who' }, 'AI opponent'),
      ),
    ),
    mkChips(mine.counts),
    h('div', { class: 'review-moves' }, ...moveRows),
    doneBtn,
  );

  modal.replaceChildren(
    h('h2', null, 'Game Review'),
    summary,
  );
  void oldBody;
}

function onResign(): void {
  if (!controller || controller.over) return;
  if (controller.options.settings.confirmResign) {
    if (!confirm('Resign the game?')) return;
  }
  controller.resign();
  render();
}

function onExit(): void {
  controller?.destroy(); // persists autosave
  controller = null;
  endModalShown = false;
  reviewResult = null;
  navigate('menu');
}

/* ------------------------- settings shortcuts ----------------------- */

export function currentGameSettings(): Settings {
  return settings;
}

export function persistSettings(s: Settings): void {
  settings = s;
  saveSettings(s);
  controller?.setSettings(s);
}
