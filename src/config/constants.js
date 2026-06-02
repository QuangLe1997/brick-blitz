// Game constants & difficulty tunings (Brick Blitz — Tetris)

export const PLAY_AREA = {
  width: 460,
  height: 720,
};

export const LINES_PER_LEVEL = 10;

// base points per simultaneous line-clear (× level)
export const LINE_SCORE = { 1: 100, 2: 300, 3: 500, 4: 800 };
export const SOFT_DROP_PTS = 1;  // per cell
export const HARD_DROP_PTS = 2;  // per cell
export const COMBO_PTS = 50;     // × combo × level

// difficulty modes — "blitz" = an aggressive gravity curve so it speeds up fast.
// gravity = sec-per-row = max(dropFloor, dropBase * dropFactor^(level-1))
export const DIFFICULTY = {
  easy: {
    label: 'Easy',
    dropBase: 1.05, dropFactor: 0.86, dropFloor: 0.14,
    lockDelay: 0.55,
    coinReward: 0.7,
    startingBoosters: { hammer: 3, bomb: 2, freeze: 3 },
  },
  normal: {
    label: 'Normal',
    dropBase: 0.85, dropFactor: 0.82, dropFloor: 0.07,
    lockDelay: 0.5,
    coinReward: 1.0,
    startingBoosters: { hammer: 2, bomb: 1, freeze: 2 },
  },
  hard: {
    label: 'Hard',
    dropBase: 0.62, dropFactor: 0.80, dropFloor: 0.045,
    lockDelay: 0.42,
    coinReward: 1.4,
    startingBoosters: { hammer: 1, bomb: 1, freeze: 1 },
  },
};

// ads
export const AD = {
  interstitialEveryN: 3,
  maxRevivesPerGame: 1,
};

// storage keys (brick_* — own namespace)
export const STORAGE = {
  highscore: 'brick_highscore_v1',
  coins: 'brick_coins_v1',
  settings: 'brick_settings_v1',
  daily: 'brick_daily_v1',
  ads: 'brick_ads_stats_v1',
  mode: 'brick_mode_v1',
  boosters: 'brick_boosters_v1',
};

// daily reward chain (Day 1..7)
export const DAILY_REWARDS = [
  { day: 1, type: 'coin', amount: 20 },
  { day: 2, type: 'coin', amount: 40 },
  { day: 3, type: 'boost', booster: 'freeze', amount: 1 },
  { day: 4, type: 'coin', amount: 80 },
  { day: 5, type: 'boost', booster: 'hammer', amount: 2 },
  { day: 6, type: 'coin', amount: 150 },
  { day: 7, type: 'mega', label: '🎁 MEGA: 300 🪙 + boosters' },
];
