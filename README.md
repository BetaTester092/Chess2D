# Chess 2D ♞

A high-quality, mobile-first chess game as an installable PWA. Play offline against a
built-in AI with 6 strength levels, track your ELO rating, and never lose a game —
it autosaves after every move.

## Features

- **Full chess rules** — castling, en passant, promotion, check/checkmate/stalemate,
  fifty-move rule, threefold repetition, insufficient material. Verified with perft tests.
- **AI opponent** — alpha-beta search with quiescence + iterative deepening, running in a
  web worker (UI never freezes). 6 levels: Beginner (600) → Master (2100).
- **ELO rating system** — your rating updates after each rated game; faster changes while
  your rating is new. Full history, win/loss/draw stats, streaks, best win.
- **Autosave** — game state persists after every move and on tab close; resume anytime.
- **Game clock** — Unlimited, 1+0, 3+2, 5+0, 10+0, 15+10 (Fischer increment). Flag = loss
  (except bare-king draw rule).
- **Quality of life** — legal-move hints, undo (unrated replay), engine hint button,
  draw offers (AI accepts in balanced positions), resign confirmation, move list,
  captured pieces, promotion picker, auto-queen option.
- **Feel** — 4 board themes, synthesized sounds, haptics, fully responsive 2D board.
- **PWA** — installable on Android/iOS/desktop, offline play via service worker.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 25 unit tests (perft-verified rules engine)
npm run build      # production build in dist/ (PWA ready)
npm run preview    # serve the production build
```

Deploy the `dist/` folder to any static host (Netlify, Vercel, GitHub Pages, Cloudflare…).

## Adsterra ad setup

All ad code lives in **`src/ads/ads.ts`** — it's the only file you need to edit.

1. Sign up at [adsterra.com](https://adsterra.com) → **Websites** → add your site.
2. Create these **Ad Units** and copy each one's **key**
   (the string inside `atOptions = { 'key' : 'XXXXXXXX', ... }`):
   - **Banner 320×50** → paste into `BANNER_TOP_KEY` (small banner at top)
   - **Banner 320×50** → paste into `BANNER_BOTTOM_KEY` (small banner at bottom)
   - **Popunder** *(optional)* → paste into `POPUNDER_KEY`
3. Done. Banners mount automatically, refresh every 45 s, and slots stay hidden until
   keys are set (so dev/local play is ad-free).

### Popup ads "only sometimes" (as requested)

`maybeShowEndGameAd()` runs once when a game ends and shows the popup only when **both**:
- at least **3 games** have finished since the last popup (`POPUP_EVERY_N_GAMES`), and
- at least **3 minutes** have passed since the last popup (`POPUP_MIN_GAP_MS`).

Tune both constants in `src/ads/ads.ts`. Set `POPUNDER_KEY` to `''` to disable popups
entirely; the game-end result modal itself never contains ads unless you add the
optional native banner key.

## Project structure

```
src/
  chess/     rules engine (movegen, FEN, SAN, game-end detection)
  engine/    AI (evaluation, alpha-beta search, web worker)
  core/      game controller, ELO + storage, autosave, sounds
  ui/        screens (menu/setup/game/stats/settings), board renderer, styles
  ads/       Adsterra integration (edit KEYS here)
tests/       25 unit tests incl. standard perft positions
```

## Notes

- All data (rating, stats, settings, autosave) stays on-device in `localStorage`.
  "Reset all data" is available at the top of the Stats screen.
- Undo marks the replayed game as unrated so ratings can't be farmed.
