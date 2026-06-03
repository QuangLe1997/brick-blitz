// GameScene — Brick Blitz (Tetris with a blitz speed-ramp).
// 10×20 well, 7-bag, SRS-ish rotation with kicks, gravity + lock delay,
// line clears + combo, ghost piece, hold, next-queue, glossy-metal rendering.

import { PLAY_AREA, DIFFICULTY, LINES_PER_LEVEL, LINE_SCORE, SOFT_DROP_PTS, HARD_DROP_PTS, COMBO_PTS } from '../config/constants.js';
import { BOARD, SHAPES, PIECE_KEYS, METAL, KICKS, BLOCK_SRC, rotateCW, rotateCCW } from '../config/pieces.js';
import { themeForLevel } from '../config/themes.js';
import { ParticleSystem } from '../effects/Particles.js';
import { PopupSystem } from '../effects/Popups.js';
import { ScreenShake } from '../effects/ScreenShake.js';
import { CoinFly } from '../effects/CoinFly.js';
import { AudioManager } from '../managers/AudioManager.js';
import { SaveManager } from '../managers/SaveManager.js';
import { EconomyManager } from '../managers/EconomyManager.js';
import { AssetManager } from '../managers/AssetManager.js';
import { ProgressManager } from '../managers/ProgressManager.js';
import { Renderer3D } from '../render3d.js';

export class GameScene {
  constructor() {
    this.canvas = document.getElementById('game');
    this.hudEl = document.getElementById('hud');
    this.pauseEl = document.getElementById('pause');
    this.scoreEl = document.getElementById('hudScore');
    this.levelEl = document.getElementById('hudLevel');
    this.linesEl = document.getElementById('hudLines');
    this.levelFillEl = document.getElementById('hudLevelFill');
    this.bestEl = document.getElementById('hudBest');
    this.walletEl = document.getElementById('hudWallet');
    this.walletCountEl = document.getElementById('hudWalletCount');
    this.levelBanner = document.getElementById('levelBanner');
    this.comboBanner = document.getElementById('comboBanner');
    this.hammerEl = document.getElementById('boostHammer');
    this.bombEl = document.getElementById('boostBomb');
    this.freezeEl = document.getElementById('boostFreeze');
    this.optMusic = document.getElementById('optMusic');
    this.optSfx = document.getElementById('optSfx');
    this.optVibe = document.getElementById('optVibe');

    this.particles = new ParticleSystem();
    this.popups = new PopupSystem();
    this.shake = new ScreenShake();
    this.coinFly = new CoinFly();

    // geometry
    this.COLS = BOARD.cols; this.ROWS = BOARD.rows; this.CELL = BOARD.cell;
    this.FX = Math.round((PLAY_AREA.width - this.COLS * this.CELL) / 2);
    this.FY = 10;
    this._buildCellCache();

    // real-3D board renderer (WebGL); falls back to the 2D canvas if it fails
    this.r3d = null;
    try {
      const c3d = document.getElementById('game3d');
      if (c3d) { this.r3d = new Renderer3D(c3d); window.addEventListener('resize', () => { if (this.r3d) this.r3d.resize(); }); }
    } catch (e) { console.warn('3D renderer unavailable — using 2D', e); this.r3d = null; }

    // pause / settings
    document.getElementById('btnPause').addEventListener('click', () => { AudioManager.playClick(); this.paused ? this.resume() : this.pause(); });
    document.getElementById('btnResume').addEventListener('click', () => { AudioManager.playClick(); this.resume(); });
    document.getElementById('btnRestart').addEventListener('click', () => { AudioManager.playClick(); this.resume(); this._restart(); });
    document.getElementById('btnToMenu').addEventListener('click', () => { AudioManager.playClick(); this.resume(); this._mgr.switchTo('menu'); });
    [this.optMusic, this.optSfx, this.optVibe].forEach((el) => el && el.addEventListener('change', () => this._applySettings()));

    // power-ups popup
    this.boostBtn = document.getElementById('btnBoosters');
    this.boostPanel = document.getElementById('boosterPanel');
    this.boostTotalEl = document.getElementById('boostTotal');
    this.boostBtn.addEventListener('click', (e) => { e.stopPropagation(); AudioManager.playClick(); this._toggleBoostPanel(); });
    this.boosterBtns = [...document.querySelectorAll('.booster-btn')];
    this.boosterBtns.forEach((btn) => btn.addEventListener('click', () => this._useBooster(btn.dataset.booster)));

    this._setupInput();
  }

  // ---------- lifecycle ----------
  enter() {
    this.hudEl.classList.remove('hidden');
    this._closeBoostPanel();
    if (this.r3d) this.r3d.resize();
    this._loadSettingsIntoUI();
    this._initNewGame();
    AudioManager.resume();
    AudioManager.startMusic();
  }
  exit() { this.hudEl.classList.add('hidden'); this.pauseEl.classList.add('hidden'); AudioManager.stopMusic(); this._clearRepeat(); this._clearSoftHold(); this._cancelPendingRotate(); }

  _loadSettingsIntoUI() {
    const s = SaveManager.getSettings();
    this.optMusic.checked = !!s.music; this.optSfx.checked = !!s.sfx; this.optVibe.checked = !!s.vibe;
  }
  _applySettings() {
    AudioManager.setSettings({ music: this.optMusic.checked, sfx: this.optSfx.checked, vibe: this.optVibe.checked });
  }

  _initNewGame() {
    this.mode = SaveManager.getMode();
    this.diff = DIFFICULTY[this.mode] || DIFFICULTY.normal;

    this.board = Array.from({ length: this.ROWS }, () => Array(this.COLS).fill(null));
    this.bag = [];
    this.queue = [];
    this._refillQueue();
    this.hold = null;
    this.holdUsed = false;
    this._revived = false;

    this.score = 0; this.lines = 0; this.level = 1; this.combo = -1;
    this.gravTimer = 0; this.lockTimer = 0; this.lockResets = 0; this.slowTimer = 0;
    this.gameOver = false; this.paused = false;

    this.theme = themeForLevel(1);
    this.bgImg = AssetManager.get(this.theme.bg);
    this.bgPrev = null; this.bgFade = 1;

    this.runCoins = 0; this.walletCount = EconomyManager.coins; this.coinFly.clear();
    this.boosters = { ...EconomyManager.getBoosters() };
    Object.entries(this.diff.startingBoosters).forEach(([k, v]) => { if (!this.boosters[k]) this.boosters[k] = v; });

    this._spawn();
    this._updateWalletUI();
    this._refreshBoosterUI();
    this._updateHUD();
    this.bestEl.textContent = SaveManager.getHighScore(this.mode);
  }
  _restart() { this._initNewGame(); }

  // ---------- piece queue ----------
  _refillQueue() {
    while (this.queue.length < 6) {
      if (this.bag.length === 0) {
        this.bag = [...PIECE_KEYS];
        for (let i = this.bag.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]; }
      }
      this.queue.push(this.bag.pop());
    }
  }
  _clone(m) { return m.map((r) => r.slice()); }
  _minRow(m) { for (let r = 0; r < m.length; r++) if (m[r].some((v) => v)) return r; return 0; }

  _spawn(key) {
    if (!key) { key = this.queue.shift(); this._refillQueue(); }
    const m = this._clone(SHAPES[key]);
    const x = Math.floor((this.COLS - m.length) / 2);
    const y = -this._minRow(m);
    this.cur = { key, m, x, y };
    this.lockTimer = 0; this.lockResets = 0; this.gravTimer = 0;
    this.holdUsed = false;
    if (this._collides(m, x, y)) this._triggerGameOver(); // block out
  }

  // ---------- collision / movement ----------
  _collides(m, ox, oy) {
    for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) {
      if (!m[y][x]) continue;
      const bx = ox + x, by = oy + y;
      if (bx < 0 || bx >= this.COLS || by >= this.ROWS) return true;
      if (by >= 0 && this.board[by][bx]) return true;
    }
    return false;
  }
  _grounded() { return this.cur && this._collides(this.cur.m, this.cur.x, this.cur.y + 1); }
  _resetLock() { if (this._grounded() && this.lockResets < 15) { this.lockTimer = 0; this.lockResets++; } }

  _move(dx) {
    if (this.gameOver || this.paused || !this.cur) return false;
    if (!this._collides(this.cur.m, this.cur.x + dx, this.cur.y)) { this.cur.x += dx; AudioManager.playMove?.(); this._resetLock(); return true; }
    return false;
  }
  _rotate(dir) {
    if (this.gameOver || this.paused || !this.cur || this.cur.key === 'O') return;
    const nm = dir > 0 ? rotateCW(this.cur.m) : rotateCCW(this.cur.m);
    for (const [kx, ky] of KICKS) {
      if (!this._collides(nm, this.cur.x + kx, this.cur.y + ky)) { this.cur.m = nm; this.cur.x += kx; this.cur.y += ky; AudioManager.playRotate?.(); this._resetLock(); return; }
    }
  }
  _softDrop() {
    if (this.gameOver || this.paused || !this.cur) return;
    if (!this._collides(this.cur.m, this.cur.x, this.cur.y + 1)) { this.cur.y++; this.score += SOFT_DROP_PTS; this.gravTimer = 0; this._updateHUD(); }
  }
  _hardDrop() {
    if (this.gameOver || this.paused || !this.cur) return;
    let d = 0;
    while (!this._collides(this.cur.m, this.cur.x, this.cur.y + 1)) { this.cur.y++; d++; }
    this.score += HARD_DROP_PTS * d;
    AudioManager.playHardDrop?.();
    this.shake.trigger(3 + Math.min(7, d * 0.5), 0.14);
    this._lockPiece();
  }
  _hold() {
    if (this.gameOver || this.paused || this.holdUsed || !this.cur) return;
    AudioManager.playHold?.();
    const curKey = this.cur.key;
    if (this.hold == null) this._spawn(); else this._spawn(this.hold);
    this.hold = curKey; this.holdUsed = true;
  }
  _ghostY() { let y = this.cur.y; while (!this._collides(this.cur.m, this.cur.x, y + 1)) y++; return y; }

  // ---------- lock + clears ----------
  _lockPiece() {
    const { m, x, y, key } = this.cur;
    let topOut = false;
    for (let cy = 0; cy < m.length; cy++) for (let cx = 0; cx < m.length; cx++) {
      if (!m[cy][cx]) continue;
      const by = y + cy, bx = x + cx;
      if (by < 0) { topOut = true; continue; }
      this.board[by][bx] = key;
    }
    AudioManager.playLock?.();
    this.shake.trigger(2.5, 0.1);
    this.cur = null;
    this._cancelPendingRotate();   // don't let a queued tap-rotate hit the next piece
    this._clearLines();
    if (topOut) { this._triggerGameOver(); return; }
    this._spawn();
    this._updateHUD();
  }

  _clearLines() {
    const full = [];
    for (let r = 0; r < this.ROWS; r++) if (this.board[r].every((c) => c)) full.push(r);
    const n = full.length;
    if (n === 0) { this.combo = -1; return; }

    // the more rows at once, the bigger/denser the burst + a shockwave ring per row
    const power = 2 + n * 2;
    const accent = (this.theme && this.theme.accent2) || '#9bf6ff';
    for (const r of full) {
      const cy = this.FY + r * this.CELL + this.CELL / 2;
      this.particles.flash(PLAY_AREA.width / 2, cy, 200 + n * 70, 'rgba(255,255,255,0.7)');
      this.particles.shockwave(PLAY_AREA.width / 2, cy, accent, 120 + n * 80, 3 + n);
      for (let c = 0; c < this.COLS; c++) { const key = this.board[r][c] || 'X'; this.particles.burst(this.FX + c * this.CELL + this.CELL / 2, cy, [METAL[key].glow, '#fff'], power); }
    }
    if (n >= 3) { const my = this.FY + full[0] * this.CELL; this.particles.confetti(PLAY_AREA.width / 2, my); }   // big clears rain confetti
    const fullSet = new Set(full);
    const kept = this.board.filter((_, r) => !fullSet.has(r));
    while (kept.length < this.ROWS) kept.unshift(Array(this.COLS).fill(null));
    this.board = kept;

    this.combo++;
    const base = (LINE_SCORE[n] || 0) * this.level;
    const comboBonus = this.combo > 0 ? COMBO_PTS * this.combo * this.level : 0;
    const gained = base + comboBonus;
    this.score += gained;
    this.lines += n;

    const midY = this.FY + full[0] * this.CELL;
    this.popups.add('+' + gained, PLAY_AREA.width / 2, midY, { color: '#fff', size: 24 + n * 4 });
    if (n >= 4) { this._showBanner('TETRIS!', this.theme.accent2 || '#9bf6ff'); AudioManager.playTetris?.(); this.shake.trigger(16, 0.4); }
    else { this._showBanner(['', 'SINGLE', 'DOUBLE', 'TRIPLE'][n], this.theme.accent2 || '#fff'); AudioManager.playLineClear?.(n); this.shake.trigger(5 + n * 2, 0.22); }
    if (this.combo >= 1) this._showCombo(this.combo + 1);

    const coins = Math.max(1, Math.round(n * 2 * this.diff.coinReward + this.combo));
    this._flyCoins(coins, PLAY_AREA.width / 2, midY);

    ProgressManager.noteMerge(n);
    ProgressManager.noteCombo(this.combo + 1);
    let d = ProgressManager.progressDaily('merges', n); if (d) this._onDailyComplete(d);
    d = ProgressManager.progressDaily('score', this.score, true); if (d) this._onDailyComplete(d);
    if (n >= 4) { d = ProgressManager.progressDaily('big', 1); if (d) this._onDailyComplete(d); }

    if (this.board.every((row) => row.every((c) => !c))) {
      this.score += 1000 * this.level;
      this._showBanner('PERFECT!', '#caffbf');
      this.particles.confetti(PLAY_AREA.width / 2, PLAY_AREA.height * 0.4);
      AudioManager.playNewRecord?.();
      ProgressManager.noteClear();
    }
    this._checkLevel();
  }

  _checkLevel() { const nl = Math.floor(this.lines / LINES_PER_LEVEL) + 1; if (nl > this.level) this._levelUp(nl); }
  _levelUp(nl) {
    this.level = nl;
    const theme = themeForLevel(nl);
    if (theme.key !== this.theme.key) { this.bgPrev = this.bgImg; this.theme = theme; this.bgImg = AssetManager.get(theme.bg); this.bgFade = 0; }
    else this.theme = theme;
    ProgressManager.noteLevel(nl);
    AudioManager.playLevelUp?.();
    this.shake.trigger(7, 0.35);
    this.particles.flash(PLAY_AREA.width / 2, PLAY_AREA.height / 2, 320, 'rgba(255,255,255,0.5)');
    this._flyCoins(10 + nl * 3, PLAY_AREA.width / 2, PLAY_AREA.height * 0.5);
    this._showLevelBanner(nl, theme);
  }

  _gravityInterval() {
    const d = this.diff;
    const g = Math.max(d.dropFloor, d.dropBase * Math.pow(d.dropFactor, this.level - 1));
    return this.slowTimer > 0 ? g * 2.6 : g;
  }

  // ---------- power-ups ----------
  _useBooster(key) {
    if (!this.boosters[key] || this.boosters[key] <= 0) { this._toast('Out of power-ups'); return; }
    if (this.gameOver || this.paused) return;
    AudioManager.playClick();
    if (key === 'hammer') {
      let r = -1; for (let i = this.ROWS - 1; i >= 0; i--) if (this.board[i].some((c) => c)) { r = i; break; }
      if (r < 0) { this._toast('Board is empty'); return; }
      const cy = this.FY + r * this.CELL + this.CELL / 2;
      for (let c = 0; c < this.COLS; c++) if (this.board[r][c]) this.particles.burst(this.FX + c * this.CELL + this.CELL / 2, cy, [METAL[this.board[r][c]].glow, '#fff'], 3);
      this.board.splice(r, 1); this.board.unshift(Array(this.COLS).fill(null));
      this.shake.trigger(6, 0.25); AudioManager.playLineClear?.(1);
      this.boosters.hammer--;
    } else if (key === 'bomb') {
      this._spawn(); this.boosters.bomb--; AudioManager.playWoosh?.(); this._toast('🔀 New piece');
    } else if (key === 'freeze') {
      this.slowTimer = 6; this.boosters.freeze--; AudioManager.playWoosh?.();
      this.popups.add('SLOW 6s', PLAY_AREA.width / 2, PLAY_AREA.height * 0.5, { color: '#7ad7f0', size: 26 });
    }
    this._refreshBoosterUI();
    EconomyManager.setBoosters(this.boosters);
    this._closeBoostPanel();
  }
  _toggleBoostPanel() { const open = !this.boostPanel.classList.toggle('hidden'); this.boostBtn.classList.toggle('open', open); }
  _closeBoostPanel() { if (!this.boostPanel) return; this.boostPanel.classList.add('hidden'); this.boostBtn.classList.remove('open'); }

  // ---------- input ----------
  _clearRepeat() { if (this._repeat) { clearInterval(this._repeat); this._repeat = null; } }
  _startRepeat(fn) { this._clearRepeat(); fn(); this._repeat = setInterval(() => { if (!this.paused && !this.gameOver) fn(); }, 90); }
  // press-and-hold (mobile): keep the finger down to make the piece fall fast
  _startSoftHold() {
    this._clearSoftHold();
    this._softDrop();
    this._softHold = setInterval(() => {
      if (this.paused || this.gameOver || !this.cur) { this._clearSoftHold(); return; }
      this._softDrop();
    }, 45);
  }
  _clearSoftHold() { if (this._softHold) { clearInterval(this._softHold); this._softHold = null; } }
  _cancelPendingRotate() { if (this._pendingRotate) { clearTimeout(this._pendingRotate); this._pendingRotate = null; } }
  // is the pointer (PLAY_AREA coords) on the current falling piece? (with a small
  // grab margin) — used so holding ON the piece grabs/moves it instead of fast-dropping
  _pointerOnPiece(p, pad = 0) {
    if (!this.cur) return false;
    const m = this.cur.m;
    for (let cy = 0; cy < m.length; cy++) for (let cx = 0; cx < m.length; cx++) {
      if (!m[cy][cx]) continue;
      const bx = this.FX + (this.cur.x + cx) * this.CELL;
      const by = this.FY + (this.cur.y + cy) * this.CELL;
      if (p.x >= bx - pad && p.x <= bx + this.CELL + pad && p.y >= by - pad && p.y <= by + this.CELL + pad) return true;
    }
    return false;
  }

  _setupInput() {
    window.addEventListener('keydown', (e) => {
      if (this._mgr && this._mgr.current !== this) return;
      const k = e.key;
      if (k === 'ArrowLeft') { this._move(-1); e.preventDefault(); }
      else if (k === 'ArrowRight') { this._move(1); e.preventDefault(); }
      else if (k === 'ArrowDown') { this._softDrop(); e.preventDefault(); }
      else if (k === 'ArrowUp' || k === 'x' || k === 'X') { if (!e.repeat) this._rotate(1); e.preventDefault(); }
      else if (k === 'z' || k === 'Z' || k === 'Control') { if (!e.repeat) this._rotate(-1); e.preventDefault(); }
      else if (k === ' ') { if (!e.repeat) this._hardDrop(); e.preventDefault(); }
      else if (k === 'p' || k === 'P' || k === 'Escape') { if (!e.repeat) (this.paused ? this.resume() : this.pause()); }
    });

    // controls are touch/click gestures only (drag = move, tap = rotate,
    // drag down = soft, flick down = hard) + keyboard on desktop.
    const canvas = this.canvas;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * (PLAY_AREA.width / r.width), y: (t.clientY - r.top) * (PLAY_AREA.height / r.height) }; };
    let g = null, holdTimer = null, holding = false;
    const HOLD_MS = 160;        // press still for this long → fast auto soft-drop
    const cancelHoldTimer = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };
    const stopHold = () => { cancelHoldTimer(); holding = false; this._clearSoftHold(); };
    canvas.addEventListener('pointerdown', (e) => {
      if (this.paused || this.gameOver) return;
      AudioManager.resume(); e.preventDefault();
      const p = pos(e); g = { sx: p.x, sy: p.y, lx: p.x, ly: p.y, t: performance.now(), moved: false };
      // hold-to-fast-drop ONLY when pressing empty space — never on the piece
      // itself, so grabbing it to slide left/right doesn't trigger a fast drop.
      cancelHoldTimer();
      if (!this._pointerOnPiece(p, this.CELL * 0.5)) {
        holdTimer = setTimeout(() => { if (g && !g.moved) { holding = true; this._startSoftHold(); } }, HOLD_MS);
      }
    }, { passive: false });
    canvas.addEventListener('pointermove', (e) => {
      if (!g || this.paused || this.gameOver) return;
      e.preventDefault(); const p = pos(e);
      while (p.x - g.lx >= this.CELL) { this._move(1); g.lx += this.CELL; g.moved = true; }
      while (p.x - g.lx <= -this.CELL) { this._move(-1); g.lx -= this.CELL; g.moved = true; }
      // a real drag/flick cancels the still-hold engage
      if (Math.abs(p.x - g.sx) > 12 || (!holding && Math.abs(p.y - g.sy) > 12)) cancelHoldTimer();
      // manual per-cell soft-drop only when not already auto-holding
      if (!holding) { while (p.y - g.ly >= this.CELL) { this._softDrop(); g.ly += this.CELL; g.moved = true; } }
    }, { passive: false });
    // tap = rotate, double-tap = hard-drop. Rotate is deferred briefly so a
    // second quick tap can cancel it and slam the piece down instead.
    const DBL_MS = 190;
    let lastTapT = 0, lastTapX = 0, lastTapY = 0;
    const end = (e) => {
      if (!g) return; const had = g, wasHolding = holding; g = null; stopHold();
      if (this.paused || this.gameOver) return;
      if (wasHolding) return;   // a hold gesture: don't also rotate / hard-drop
      const p = pos(e); const dx = p.x - had.sx, dy = p.y - had.sy, dt = performance.now() - had.t;
      const isTap = !had.moved && Math.abs(dx) < 14 && Math.abs(dy) < 14 && dt < 250;
      if (isTap) {
        const now = performance.now();
        if (this._pendingRotate && now - lastTapT < DBL_MS && Math.abs(p.x - lastTapX) < 40 && Math.abs(p.y - lastTapY) < 40) {
          this._cancelPendingRotate();          // second quick tap → double-tap
          lastTapT = 0;
          this._hardDrop();
        } else {
          this._cancelPendingRotate();
          lastTapT = now; lastTapX = p.x; lastTapY = p.y;
          this._pendingRotate = setTimeout(() => { this._pendingRotate = null; this._rotate(1); }, DBL_MS);
        }
      } else if (dy > 70 && dy > Math.abs(dx) * 1.4 && dt < 320) {
        this._cancelPendingRotate();            // flick down → pure hard-drop (no rotate)
        this._hardDrop();
      }
    };
    window.addEventListener('pointerup', end, { passive: false });
    window.addEventListener('pointercancel', () => { g = null; stopHold(); }, { passive: false });
  }

  // ---------- coins / wallet ----------
  _walletTargetCoords() {
    const c = this.canvas, w = this.walletEl;
    if (!c || !w) return [PLAY_AREA.width / 2, 44];
    const cr = c.getBoundingClientRect(), wr = w.getBoundingClientRect();
    return [(wr.left + wr.width / 2 - cr.left) * (PLAY_AREA.width / cr.width), (wr.top + wr.height / 2 - cr.top) * (PLAY_AREA.height / cr.height)];
  }
  _flyCoins(amount, x, y) {
    if (amount <= 0) return;
    this.runCoins += amount;
    const [tx, ty] = this._walletTargetCoords();
    const n = Math.min(16, Math.max(3, Math.round(amount / 2)));
    this.coinFly.spawn(n, x, y, tx, ty, { onAllDone: () => { EconomyManager.addCoins(amount); this.walletCount = EconomyManager.coins; this._updateWalletUI(); this._bumpWallet(); AudioManager.playCoin(); } });
  }
  _updateWalletUI() { if (this.walletCountEl) this.walletCountEl.textContent = this.walletCount; }
  _bumpWallet() { if (!this.walletEl) return; this.walletEl.classList.remove('bump'); void this.walletEl.offsetWidth; this.walletEl.classList.add('bump'); }

  // ---------- banners / HUD ----------
  _showCombo(n) {
    const b = this.comboBanner; if (!b) return;
    b.textContent = 'COMBO ×' + n; b.style.color = '#fff'; b.classList.remove('hidden', 'show'); void b.offsetWidth; b.classList.add('show');
    AudioManager.playCombo?.(n); clearTimeout(this._comboTo); this._comboTo = setTimeout(() => b.classList.remove('show'), 900);
  }
  _showBanner(text, color) {
    if (!text || !this.comboBanner) return;
    const b = this.comboBanner; b.textContent = text; b.style.color = color || '#fff';
    b.classList.remove('hidden', 'show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(this._comboTo); this._comboTo = setTimeout(() => b.classList.remove('show'), 1000);
  }
  _showLevelBanner(level, theme) {
    if (!this.levelBanner) return;
    this.levelBanner.textContent = `LEVEL ${level} · ${theme.name}`;
    this.levelBanner.style.setProperty('--lvl-accent', theme.accent2);
    this.levelBanner.classList.remove('hidden', 'show'); void this.levelBanner.offsetWidth; this.levelBanner.classList.add('show');
    clearTimeout(this._lvlTo); this._lvlTo = setTimeout(() => this.levelBanner.classList.remove('show'), 2000);
  }
  _onDailyComplete(ch) {
    EconomyManager.addCoins(ch.reward); this.walletCount = EconomyManager.coins; this._updateWalletUI();
    this.popups.add(`DAILY ✓ +${ch.reward}`, PLAY_AREA.width / 2, PLAY_AREA.height * 0.45, { color: '#9bf6ff', size: 24 });
    AudioManager.playReward?.();
  }
  _achToast(a) { this._toast(`🏅 ${a.title}`); AudioManager.playReward?.(); }

  _updateHUD() {
    this.scoreEl.textContent = this.score;
    if (this.levelEl) this.levelEl.textContent = this.level;
    if (this.linesEl) this.linesEl.textContent = this.lines;
    if (this.levelFillEl) this.levelFillEl.style.width = ((this.lines % LINES_PER_LEVEL) / LINES_PER_LEVEL * 100) + '%';
  }
  _refreshBoosterUI() {
    this.hammerEl.textContent = this.boosters.hammer || 0;
    this.bombEl.textContent = this.boosters.bomb || 0;
    this.freezeEl.textContent = this.boosters.freeze || 0;
    const total = (this.boosters.hammer || 0) + (this.boosters.bomb || 0) + (this.boosters.freeze || 0);
    if (this.boostTotalEl) { this.boostTotalEl.textContent = total; this.boostTotalEl.classList.toggle('hidden', total <= 0); }
  }

  // ---------- pause / game over ----------
  pause() { if (this.gameOver) return; this.paused = true; this._clearRepeat(); this._clearSoftHold(); this._cancelPendingRotate(); this.pauseEl.classList.remove('hidden'); AudioManager.stopMusic(); }
  resume() { this.paused = false; this.pauseEl.classList.add('hidden'); AudioManager.startMusic(); }

  _triggerGameOver() {
    if (this.gameOver) return;
    this.gameOver = true; this.cur = null; this._clearRepeat(); this._clearSoftHold(); this._cancelPendingRotate();
    AudioManager.playGameOver(); this.shake.trigger(14, 0.6);
    EconomyManager.setBoosters(this.boosters);
    const isNew = SaveManager.setHighScore(this.mode, this.score);
    const newly = ProgressManager.recordGame(this.mode, this.score, this.level);
    newly.forEach((a, i) => setTimeout(() => this._achToast(a), 500 + i * 1500));
    setTimeout(() => this._mgr.switchTo('gameover', { score: this.score, coins: this.runCoins, level: this.level, newRecord: isNew, mode: this.mode, revive: () => this._reviveFromAd() }), 600);
  }
  async _reviveFromAd() {
    if (this._revived) return false;
    this._revived = true;
    for (let r = 0; r < 6; r++) this.board[r] = Array(this.COLS).fill(null);
    this.gameOver = false; this._spawn(); this.shake.trigger(6, 0.3); AudioManager.playReward?.();
    this.hudEl.classList.remove('hidden');
    return true;
  }

  // ---------- update ----------
  update(dt) {
    if (this.paused || this.gameOver) { this.coinFly.update(dt); return; }
    if (this.slowTimer > 0) this.slowTimer = Math.max(0, this.slowTimer - dt);
    if (this.cur) {
      if (this._grounded()) {
        this.lockTimer += dt;
        if (this.lockTimer >= this.diff.lockDelay) this._lockPiece();
      } else {
        this.lockTimer = 0;
        this.gravTimer += dt;
        if (this.gravTimer >= this._gravityInterval()) { this.gravTimer = 0; if (!this._collides(this.cur.m, this.cur.x, this.cur.y + 1)) this.cur.y++; }
      }
    }
    this.particles.update(dt); this.popups.update(dt); this.shake.update(dt); this.coinFly.update(dt);
    if (this.bgFade < 1) this.bgFade = Math.min(1, this.bgFade + dt * 1.2);
  }

  // ---------- render ----------
  _buildCellCache() {
    this._cellCache = {};
    const s = this.CELL;
    const bev = Math.max(4, Math.round(s * 0.22)); // chunky bevel = strong 3D extrusion
    for (const key of Object.keys(METAL)) {
      const cv = document.createElement('canvas'); cv.width = s; cv.height = s;
      const c = cv.getContext('2d'); const m = METAL[key];
      const poly = (pts, fill) => { c.fillStyle = fill; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); c.fill(); };
      // 4 bevel faces — top/left lit, right/bottom shaded → the block "pops"
      poly([[0, 0], [s, 0], [s - bev, bev], [bev, bev]], m.light);              // top
      poly([[0, 0], [bev, bev], [bev, s - bev], [0, s]], m.light);              // left
      poly([[s, 0], [s, s], [s - bev, s - bev], [s - bev, bev]], m.dark);       // right
      poly([[0, s], [bev, s - bev], [s - bev, s - bev], [s, s]], m.dark);       // bottom
      // raised centre face — vertical metal gradient
      const g = c.createLinearGradient(0, bev, 0, s - bev);
      g.addColorStop(0, m.light); g.addColorStop(0.5, m.mid); g.addColorStop(1, m.dark);
      c.fillStyle = g; c.fillRect(bev, bev, s - 2 * bev, s - 2 * bev);
      // diagonal chrome streak + specular dot on the centre
      c.save();
      c.beginPath(); c.rect(bev, bev, s - 2 * bev, s - 2 * bev); c.clip();
      const iw = s - 2 * bev;
      c.globalAlpha = 0.28; c.fillStyle = '#fff';
      c.beginPath(); c.moveTo(bev + iw * 0.1, bev); c.lineTo(bev + iw * 0.42, bev); c.lineTo(bev + iw * 0.18, s - bev); c.lineTo(bev, s - bev); c.closePath(); c.fill();
      c.globalAlpha = 0.7;
      c.beginPath(); c.ellipse(bev + iw * 0.28, bev + iw * 0.26, iw * 0.16, iw * 0.1, -0.6, 0, Math.PI * 2); c.fill();
      c.restore();
      // crisp outline for separation
      c.globalAlpha = 1; c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1; c.strokeRect(0.5, 0.5, s - 1, s - 1);
      this._cellCache[key] = cv;
    }
  }

  // prefer the AI chrome sprite; fall back to the procedural cube until it loads
  _blockImg(key) {
    const src = BLOCK_SRC[key];
    const img = src && AssetManager.get(src);
    return (img && img.complete && img.naturalWidth) ? img : this._cellCache[key];
  }
  // each cell = a brick one layer thick: a glossy top face + extruded right/bottom
  // depth faces (toward bottom-right). Packed cells hide internal depth, so the
  // stack reads as a solid 3D brick wall; exposed edges show the thickness.
  _drawCell(ctx, key, px, py, size) {
    const m = METAL[key];
    const d = Math.max(3, Math.round(size * 0.22)); // brick thickness
    // right depth face
    ctx.fillStyle = m.dark;
    ctx.beginPath();
    ctx.moveTo(px + size, py); ctx.lineTo(px + size + d, py + d);
    ctx.lineTo(px + size + d, py + size + d); ctx.lineTo(px + size, py + size);
    ctx.closePath(); ctx.fill();
    // bottom depth face (darker)
    ctx.beginPath();
    ctx.moveTo(px, py + size); ctx.lineTo(px + size, py + size);
    ctx.lineTo(px + size + d, py + size + d); ctx.lineTo(px + d, py + size + d);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fill(); // darken the bottom face (reuses the path above)
    // glossy top face
    ctx.drawImage(this._blockImg(key), px, py, size, size);
  }

  _draw3D(ctx) {
    const W = PLAY_AREA.width, H = PLAY_AREA.height;
    const [sx, sy] = this.shake.getOffset();
    this.r3d.setTheme(this.theme);
    this.r3d.sync(this.board, this.cur, this.cur ? this._ghostY() : 0);
    this.r3d.render(sx, sy);
    // 2D overlay (transparent, in front): side previews + effects
    ctx.save(); ctx.translate(sx, sy);
    if (this.slowTimer > 0) { ctx.fillStyle = 'rgba(120,215,240,0.06)'; ctx.fillRect(0, 0, W, H); }
    this.particles.draw(ctx);
    this.popups.draw(ctx);
    ctx.restore();
    this.coinFly.draw(ctx);
  }

  draw(ctx) {
    if (this.r3d) { this._draw3D(ctx); return; }
    const W = PLAY_AREA.width, H = PLAY_AREA.height;
    this._drawBackground(ctx, W, H);
    const [sx, sy] = this.shake.getOffset();
    ctx.save(); ctx.translate(sx, sy);

    const FX = this.FX, FY = this.FY, CELL = this.CELL, fw = this.COLS * CELL, fh = this.ROWS * CELL;
    ctx.fillStyle = 'rgba(4,6,16,0.62)';
    this._roundRect(ctx, FX - 6, FY - 6, fw + 12, fh + 12, 10); ctx.fill();
    ctx.strokeStyle = this.theme.wallEdge || 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
    this._roundRect(ctx, FX - 6, FY - 6, fw + 12, fh + 12, 10); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let c = 1; c < this.COLS; c++) { ctx.moveTo(FX + c * CELL, FY); ctx.lineTo(FX + c * CELL, FY + fh); }
    for (let r = 1; r < this.ROWS; r++) { ctx.moveTo(FX, FY + r * CELL); ctx.lineTo(FX + fw, FY + r * CELL); }
    ctx.stroke();

    for (let r = 0; r < this.ROWS; r++) for (let c = 0; c < this.COLS; c++) { const k = this.board[r][c]; if (k) this._drawCell(ctx, k, FX + c * CELL, FY + r * CELL, CELL); }

    if (this.cur && !this.gameOver) {
      const gy = this._ghostY();
      ctx.save(); ctx.globalAlpha = 0.28; ctx.strokeStyle = METAL[this.cur.key].glow; ctx.lineWidth = 2;
      this._eachCell(this.cur.m, this.cur.x, gy, (bx, by) => { if (by >= 0) ctx.strokeRect(FX + bx * CELL + 1.5, FY + by * CELL + 1.5, CELL - 3, CELL - 3); });
      ctx.restore();
      this._eachCell(this.cur.m, this.cur.x, this.cur.y, (bx, by) => { if (by >= 0) this._drawCell(ctx, this.cur.key, FX + bx * CELL, FY + by * CELL, CELL); });
    }


    if (this.slowTimer > 0) { ctx.fillStyle = 'rgba(120,215,240,0.06)'; ctx.fillRect(0, 0, W, H); }

    this.particles.draw(ctx);
    this.popups.draw(ctx);
    ctx.restore();
    this.coinFly.draw(ctx);
  }

  _eachCell(m, ox, oy, fn) { for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x]) fn(ox + x, oy + y); }

  _drawMiniBox(ctx, bx, by, label, key, dim) {
    const bw = 62, bh = label ? 70 : 54, top = label ? by + 16 : by;
    ctx.save();
    ctx.fillStyle = 'rgba(4,6,16,0.5)'; this._roundRect(ctx, bx, by, bw, bh, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5; this._roundRect(ctx, bx, by, bw, bh, 8); ctx.stroke();
    if (label) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = "800 10px 'Fredoka', system-ui, sans-serif"; ctx.textAlign = 'center'; ctx.fillText(label, bx + bw / 2, by + 12); }
    if (key) {
      const m = SHAPES[key], s = 12;
      let minx = 9, miny = 9, maxx = 0, maxy = 0;
      for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x]) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }
      const pw = (maxx - minx + 1) * s, ph = (maxy - miny + 1) * s;
      const innerH = label ? bh - 16 : bh;
      const ox = bx + (bw - pw) / 2, oy = top + (innerH - ph) / 2;
      ctx.globalAlpha = dim ? 0.4 : 1;
      for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x]) this._drawCell(ctx, key, ox + (x - minx) * s, oy + (y - miny) * s, s);
    }
    ctx.restore();
  }

  _drawBackground(ctx, W, H) {
    ctx.fillStyle = this.theme.field || '#0a0524'; ctx.fillRect(0, 0, W, H);
    if (this.bgFade < 1 && this.bgPrev) { ctx.globalAlpha = (1 - this.bgFade) * (this.theme.dim ?? 0.5); this._drawImageCover(ctx, this.bgPrev, W, H); ctx.globalAlpha = 1; }
    if (this.bgImg && this.bgImg.complete && this.bgImg.naturalWidth) { ctx.globalAlpha = (this.theme.dim ?? 0.5) * (this.bgFade < 1 ? this.bgFade : 1); this._drawImageCover(ctx, this.bgImg, W, H); ctx.globalAlpha = 1; }
    const g = ctx.createRadialGradient(W / 2, H * 0.42, 60, W / 2, H * 0.5, H * 0.8);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, this.theme.scrim || 'rgba(5,8,20,0.7)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  _drawImageCover(ctx, img, W, H) {
    const ar = img.naturalWidth / img.naturalHeight, tar = W / H; let dw, dh;
    if (ar > tar) { dh = H; dw = H * ar; } else { dw = W; dh = W / ar; }
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  _toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1400); }
}
