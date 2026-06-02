# Brick Blitz — Metal Tetris (HTML5)

A glossy-metal **Tetris** with a *blitz* speed-ramp — stack the falling metal bars, clear lines, and survive as gravity accelerates each level. Pure HTML5 + Canvas, no build step, deploys straight to GitHub Pages.

> Move & rotate the falling pieces, fill full rows to clear them for points. Every 10 lines the level rises and the pieces fall faster — beat the blitz.

This game **reuses the engine** from its siblings [Suika Merge](https://github.com/QuangLe1997/suika-merge) / [Dino Egg Pop](https://github.com/QuangLe1997/dino-egg-shooter) — scene manager, WebAudio SFX/music, particles/shake/coin-fly, economy, achievements, daily challenge, themes and PWA shell are shared. Only the gameplay core (board, pieces, line clears) is new.

## ▶ Play it

**Live:** <https://quangle1997.github.io/brick-blitz/>

Installable as a PWA (Add to Home Screen) and playable offline after first load.

## ✨ Features

**Core gameplay**
- Classic **Tetris** on a 10×20 well — 7 tetrominoes, **7-bag** randomizer
- Rotation with **wall-kicks**, **hold** slot, **ghost piece**, **next** queue (3 shown)
- **Soft drop / hard drop**, lock delay with move-reset
- **Line clears** with combo bonus; **TETRIS** (4 lines) and **Perfect Clear** pay big
- **Blitz speed-ramp** — gravity gets faster every level (10 lines), tuned per difficulty so higher levels feel urgent

**Look & feel**
- **Glossy metal bars** — each piece a brushed-metal hue with bevels, a chrome streak and a specular sheen (drawn to cached canvases, fast)
- Per-level **themes** (Ocean / Aurora / Twilight / Sunset) cross-fade as you climb
- Metallic SFX: move tick, rotate, **lock clack**, **hard-drop slam**, line-clear chimes, **Tetris fanfare**, level-up; screen shake + line-flash + sparks
- Score popups, coin-fly-to-wallet, haptics on lock/drop

**Controls**
- **Touch**: drag to move · tap to rotate · swipe down to hard-drop · plus an on-screen button pad (◀ ⟳ ▶ ▼ ⤓ ⇄)
- **Keyboard**: ← → move · ↑/X rotate CW · Z rotate CCW · ↓ soft · Space hard · C hold · P pause

**Power-ups** (shared coin economy)
- 🧹 **Clear row** — removes the bottom row
- 🔀 **New piece** — rerolls the current piece
- ❄️ **Slow-mo** — slows gravity for 6s

**Systems**
- 3 difficulty modes (Easy / Normal / Hard), coin economy + 7-day Daily Reward, **Achievements**, local **Leaderboard**, **Daily Challenge**, first-run onboarding, revive-on-game-over (mock rewarded ad)
- **PWA** — installable, offline, network-first service worker

## 📁 Project layout

```
.
├── index.html              # entry: HUD, control pad, dialogs, PWA + OG meta
├── style.css               # all UI styling
├── manifest.webmanifest    # PWA manifest
├── sw.js                   # service worker (network-first HTML/JS/CSS, cache-first images)
└── src/
    ├── main.js
    ├── config/
    │   ├── pieces.js        # tetrominoes, board geometry, metal palette, rotation + kicks
    │   ├── themes.js        # themes + theme-per-level
    │   └── constants.js     # play area, difficulty (gravity curve), scoring, daily rewards
    ├── managers/            # Scene · Asset · Audio · Ad · Save · Economy · Progress
    ├── scenes/
    │   ├── MenuScene.js
    │   ├── GameScene.js     # the Tetris core: board, gravity, rotate, clears, render, input
    │   ├── GameOverScene.js
    │   └── DailyScene.js
    └── effects/             # Particles · CoinFly · Popups · ScreenShake

assets/  # 4 theme backgrounds (.webp) · coin.png · PWA icons   (blocks are drawn, not images)
```

## 🚀 Run locally

```bash
python3 -m http.server 8000   # or: npx serve .
```
Open <http://localhost:8000>. (The service worker auto-disables on `localhost`.)

## 🧩 Tuning

- [`src/config/pieces.js`](src/config/pieces.js) — `BOARD` (cols/rows/cell), `SHAPES`, `METAL` palette, `KICKS`
- [`src/config/constants.js`](src/config/constants.js) — `DIFFICULTY` (`dropBase`/`dropFactor`/`dropFloor` gravity curve, `lockDelay`), `LINE_SCORE`, `LINES_PER_LEVEL`

## 🎨 Art note

Blocks and effects are fully procedural. The PWA icons / OG card are placeholders carried over from a sibling project — regenerate them for a metal-Tetris brand.

## 📜 License

MIT.
