/** Inline SVG chess pieces (public-domain Cburnett-style outlines). */

import type { Color, PieceType } from '../chess/types';

type Svg = string;

const W = '#f8f8f8';
const B = '#1f1f1f';
const STROKE = '#000';

function wrap(body: string, fill: string): Svg {
  return `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg"><g fill="${fill}" stroke="${STROKE}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
}

const KING_W = wrap(
  `<path d="M22.5 11.63V6M20 8h5" stroke="${STROKE}" stroke-linejoin="miter" fill="none"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="${W}"/><path d="M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7" fill="${W}"/>`,
  W,
);

const KING_B = wrap(
  `<path d="M22.5 11.63V6M20 8h5" stroke="${STROKE}" stroke-linejoin="miter" fill="none"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="${B}"/><path d="M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7" fill="${B}"/>`,
  B,
);

const QUEEN_W = wrap(
  `<path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z" fill="${W}"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" fill="${W}"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 32.5c6-1 15-1 21 0" fill="none" stroke="${STROKE}"/><circle cx="6" cy="12" r="2"/><circle cx="14" cy="9" r="2"/><circle cx="22.5" cy="8" r="2"/><circle cx="31" cy="9" r="2"/><circle cx="39" cy="12" r="2"/>`,
  W,
);

const QUEEN_B = wrap(
  `<path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z" fill="${B}"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" fill="${B}"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 32.5c6-1 15-1 21 0" fill="none" stroke="#ececec" stroke-width="1.2"/><circle cx="6" cy="12" r="2"/><circle cx="14" cy="9" r="2"/><circle cx="22.5" cy="8" r="2"/><circle cx="31" cy="9" r="2"/><circle cx="39" cy="12" r="2"/>`,
  B,
);

const ROOK_W = wrap(
  `<path d="M9 39h27v-3H9v3zM12.5 32l1.5-2.5h17l1.5 2.5h-20zM12 36v-4h21v4H12z" stroke-linecap="butt"/><path d="M14 29.5v-13h17v13H14z" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M14 16.5L11 14h23l-3 2.5H14zM11 14V9h4v2h5V9h5v2h5V9h4v5H11z" stroke-linecap="butt"/><path d="M12 35.5h21M13 31.5h19M14 29.5h17M14 16.5h17M11 14h23" fill="none" stroke="${STROKE}" stroke-width="1"/>`,
  W,
);

const ROOK_B = wrap(
  `<path d="M9 39h27v-3H9v3zM12.5 32l1.5-2.5h17l1.5 2.5h-20zM12 36v-4h21v4H12z" stroke-linecap="butt" fill="${B}"/><path d="M14 29.5v-13h17v13H14z" stroke-linecap="butt" stroke-linejoin="miter" fill="${B}"/><path d="M14 16.5L11 14h23l-3 2.5H14zM11 14V9h4v2h5V9h5v2h5V9h4v5H11z" stroke-linecap="butt" fill="${B}"/><path d="M12 35.5h21M13 31.5h19M14 29.5h17M14 16.5h17M11 14h23" fill="none" stroke="#ececec" stroke-width="1"/>`,
  B,
);

const BISHOP_W = wrap(
  `<g fill="${W}" stroke-linecap="butt"><path d="M9 36c3.4-1 10.1.4 13-1.5 2.9 2 10.1.5 13 1.5 0 0 1.6.5 3-2-.7-1-1.6-1-3-1.5-3.4-.9-10.4.5-13-1.5-2.6 2-9.6.6-13 1.5-1.4.5-2.3.5-3 1.5 1.4 2.5 3 2 3 2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path d="M17.5 26h10M15 30h15M22.5 15.5v5M20 18h5" fill="none" stroke="${STROKE}" stroke-linejoin="miter"/>`,
  W,
);

const BISHOP_B = wrap(
  `<g fill="${B}" stroke-linecap="butt"><path d="M9 36c3.4-1 10.1.4 13-1.5 2.9 2 10.1.5 13 1.5 0 0 1.6.5 3-2-.7-1-1.6-1-3-1.5-3.4-.9-10.4.5-13-1.5-2.6 2-9.6.6-13 1.5-1.4.5-2.3.5-3 1.5 1.4 2.5 3 2 3 2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path d="M17.5 26h10M15 30h15M22.5 15.5v5M20 18h5" fill="none" stroke="#ececec" stroke-linejoin="miter"/>`,
  B,
);

const KNIGHT_W = wrap(
  `<path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="${W}"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="${W}"/><path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z" fill="${STROKE}"/>`,
  W,
);

const KNIGHT_B = wrap(
  `<path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="${B}"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="${B}"/><path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z" fill="#ececec"/>`,
  B,
);

const PAWN_W = wrap(
  `<path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47C28.06 24.84 29 23.03 29 21c0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="${W}"/>`,
  W,
);

const PAWN_B = wrap(
  `<path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47C28.06 24.84 29 23.03 29 21c0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="${B}"/>`,
  B,
);

const GLYPHS: Record<Color, Record<PieceType, Svg>> = {
  w: { k: KING_W, q: QUEEN_W, r: ROOK_W, b: BISHOP_W, n: KNIGHT_W, p: PAWN_W },
  b: { k: KING_B, q: QUEEN_B, r: ROOK_B, b: BISHOP_B, n: KNIGHT_B, p: PAWN_B },
};

export function pieceSvg(color: Color, type: PieceType): Svg {
  return GLYPHS[color][type];
}

/** Small inline unicode glyph for captured-piece trays. */
export function pieceChar(color: Color, type: PieceType): string {
  const table: Record<PieceType, string> = { k: 'k', q: 'q', r: 'r', b: 'b', n: 'n', p: 'p' };
  const base = table[type];
  return color === 'w' ? base.toUpperCase() : base;
}
