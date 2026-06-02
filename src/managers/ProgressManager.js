// ProgressManager — lifetime stats, achievements, local leaderboard and a
// date-seeded daily challenge. All persisted via SaveManager (localStorage).

import { SaveManager } from './SaveManager.js';

const KEYS = {
  stats: 'brick_stats_v1',
  ach: 'brick_ach_v1',
  lb: 'brick_lb_v1',
  daily: 'brick_dailychal_v1',
};

// `totalMerges` = line-clear events; `maxFruit` = most lines cleared at once (4 = Tetris).
export const ACHIEVEMENTS = [
  { id: 'first_clear', icon: '🧱', title: 'First Clear',  desc: 'Clear your first line',       test: s => s.totalMerges >= 1 },
  { id: 'combo3',      icon: '🔥', title: 'Combo x3',     desc: 'Reach a ×3 combo',            test: s => s.bestCombo >= 3 },
  { id: 'combo5',      icon: '⚡', title: 'Chain Master', desc: 'Reach a ×5 combo',            test: s => s.bestCombo >= 5 },
  { id: 'tetris',      icon: '💠', title: 'TETRIS!',      desc: 'Clear 4 lines at once',        test: s => s.maxFruit >= 4 },
  { id: 'score5k',     icon: '⭐', title: '5,000 Club',   desc: 'Score 5,000 in one game',     test: s => s.bestScore >= 5000 },
  { id: 'score20k',    icon: '🌟', title: '20,000 Club',  desc: 'Score 20,000 in one game',    test: s => s.bestScore >= 20000 },
  { id: 'level5',      icon: '🏆', title: 'Speed Demon',  desc: 'Reach Level 5',               test: s => s.maxLevel >= 5 },
  { id: 'level10',     icon: '🚀', title: 'Blitz Master', desc: 'Reach Level 10',              test: s => s.maxLevel >= 10 },
  { id: 'perfect',     icon: '🎯', title: 'Perfect Clear',desc: 'Clear the whole board',       test: s => s.boardCleared >= 1 },
  { id: 'play10',      icon: '🎮', title: 'Regular',      desc: 'Play 10 games',               test: s => s.gamesPlayed >= 10 },
];

class _ProgressManager {
  constructor() {
    this.stats = SaveManager.load(KEYS.stats, {
      gamesPlayed: 0, totalMerges: 0, bestCombo: 0, maxFruit: 0, bestScore: 0, maxLevel: 1, boardCleared: 0,
    });
    if (this.stats.boardCleared === undefined) this.stats.boardCleared = 0;
    this.unlocked = new Set(SaveManager.load(KEYS.ach, []));
    this.lb = SaveManager.load(KEYS.lb, {});
    this.daily = SaveManager.load(KEYS.daily, { date: null, progress: 0, done: false });
  }

  _saveStats() { SaveManager.save(KEYS.stats, this.stats); }

  noteMerge(size) {
    this.stats.totalMerges++;
    if (size > this.stats.maxFruit) this.stats.maxFruit = size;
    this._saveStats();
  }
  noteCombo(c) { if (c > this.stats.bestCombo) { this.stats.bestCombo = c; this._saveStats(); } }
  noteLevel(l) { if (l > this.stats.maxLevel) { this.stats.maxLevel = l; this._saveStats(); } }
  noteClear() { this.stats.boardCleared = (this.stats.boardCleared || 0) + 1; this._saveStats(); }

  check(extra = {}) {
    const s = { ...this.stats, ...extra };
    const newly = [];
    for (const a of ACHIEVEMENTS) {
      if (!this.unlocked.has(a.id) && a.test(s)) { this.unlocked.add(a.id); newly.push(a); }
    }
    if (newly.length) SaveManager.save(KEYS.ach, [...this.unlocked]);
    return newly;
  }
  getAchievements() { return ACHIEVEMENTS.map(a => ({ ...a, unlocked: this.unlocked.has(a.id) })); }
  unlockedCount() { return this.unlocked.size; }

  recordGame(mode, score, level) {
    this.stats.gamesPlayed++;
    if (score > this.stats.bestScore) this.stats.bestScore = score;
    if (level > this.stats.maxLevel) this.stats.maxLevel = level;
    this._saveStats();
    const arr = this.lb[mode] || [];
    arr.push(score);
    arr.sort((a, b) => b - a);
    this.lb[mode] = arr.slice(0, 10);
    SaveManager.save(KEYS.lb, this.lb);
    return this.check();
  }
  getLeaderboard(mode) { return this.lb[mode] || []; }

  _today() { return new Date().toISOString().slice(0, 10); }
  _seed(d) { let h = 2166136261; for (const ch of d) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

  getDailyChallenge() {
    const today = this._today();
    const seed = this._seed(today);
    const defs = [
      { type: 'merges', label: 'Clear {n} lines',     n: 20 + (seed % 21),        reward: 60 },
      { type: 'score',  label: 'Score {n} points',    n: 2000 + (seed % 6) * 800, reward: 90 },
      { type: 'big',    label: 'Score a TETRIS 💠',    n: 1,                       reward: 120 },
    ];
    const def = defs[seed % defs.length];
    if (this.daily.date !== today) {
      this.daily = { date: today, progress: 0, done: false };
      SaveManager.save(KEYS.daily, this.daily);
    }
    return { ...def, label: def.label.replace('{n}', def.n), progress: this.daily.progress, done: this.daily.done };
  }

  progressDaily(type, value = 1, absolute = false) {
    const ch = this.getDailyChallenge();
    if (ch.done || ch.type !== type) return null;
    this.daily.progress = absolute ? Math.max(this.daily.progress, value) : this.daily.progress + value;
    let justDone = false;
    if (this.daily.progress >= ch.n) { this.daily.done = true; justDone = true; }
    SaveManager.save(KEYS.daily, this.daily);
    return justDone ? ch : null;
  }
}

export const ProgressManager = new _ProgressManager();
