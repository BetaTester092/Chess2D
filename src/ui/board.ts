import { h, clearEl } from './dom';
import { pieceSvg } from './pieces';
import { fileOf, rankOf, type Color, type PieceType, type Square } from '../chess/types';

export interface BoardViewOptions {
  onSquareTap: (sq: Square) => void;
  showCoordinates: boolean;
  flipped: boolean;
}

export class BoardView {
  root: HTMLElement;
  private squares: HTMLElement[] = [];
  private opts: BoardViewOptions;

  constructor(opts: BoardViewOptions) {
    this.opts = opts;
    this.root = h('div', { class: 'board-wrap' });
    const grid = h('div', { class: 'board-grid' });
    this.root.appendChild(grid);

    for (let i = 0; i < 64; i++) {
      const idx = this.viewToSquare(i);
      const light = (fileOf(idx) + rankOf(idx)) % 2 === 1;
      const sq = h('div', {
        class: `square ${light ? 'light' : 'dark'}`,
        dataset: { sq: String(idx) },
      });
      sq.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.opts.onSquareTap(idx);
      });
      this.squares[idx] = sq;
      grid.appendChild(sq);
    }
  }

  private viewToSquare(viewIndex: number): Square {
    const row = Math.floor(viewIndex / 8);
    const col = viewIndex % 8;
    if (this.opts.flipped) {
      return (7 - row) * 8 + (7 - col);
    }
    return row * 8 + col;
  }

  render(state: {
    board: (PieceType | null)[];
    colors: (Color | null)[];
    lastMove: { from: Square; to: Square } | null;
    checkSquare: Square | null;
    selection: Square | null;
    hintTargets: Set<Square> | null;
    showLegal: boolean;
    /** Square the player has pre-selected while the AI thinks. */
    premoveSelection?: Square | null;
    /** Queued premove destination (drawn as a dashed ring). */
    premoveTarget?: Square | null;
  }): void {
    for (let sq = 0; sq < 64; sq++) {
      const el = this.squares[sq];
      clearEl(el);
      el.classList.remove('lastmove', 'selected', 'in-check', 'premove-from', 'premove-to');

      const piece = state.board[sq];
      const color = state.colors[sq];

      if (state.lastMove && (sq === state.lastMove.from || sq === state.lastMove.to)) {
        el.classList.add('lastmove');
      }
      if (state.selection === sq) el.classList.add('selected');
      if (state.checkSquare === sq) el.classList.add('in-check');
      if (state.premoveSelection === sq) el.classList.add('premove-from');
      if (state.premoveTarget === sq) el.classList.add('premove-to');

      if (piece && color) {
        const pieceEl = h('div', { class: 'piece', html: pieceSvg(color, piece) });
        el.appendChild(pieceEl);
      }

      if (state.showLegal && state.hintTargets?.has(sq) && !state.selection) {
        // hint mode (e.g. engine hint) — mark with ring
      }
      if (state.showLegal && state.hintTargets?.has(sq)) {
        const capturing = !!(piece && color && state.selection !== null);
        const marker = capturing
          ? h('div', { class: 'hint-capture' })
          : h('div', { class: 'hint-dot' });
        el.appendChild(marker);
      }

      if (this.opts.showCoordinates && this.isEdgeForCoord(sq)) {
        if (rankOf(sq) === (this.opts.flipped ? 7 : 0) || true) {
          // coordinates drawn on edge squares only
        }
        if (fileOf(sq) === 0) {
          el.appendChild(h('span', { class: 'coord rank' }, String(8 - rankOf(sq))));
        }
        if (rankOf(sq) === (this.opts.flipped ? 7 : 0)) {
          el.appendChild(h('span', { class: 'coord file' }, 'abcdefgh'[fileOf(sq)]));
        }
      }
    }
  }

  private isEdgeForCoord(_sq: Square): boolean {
    return true;
  }
}
