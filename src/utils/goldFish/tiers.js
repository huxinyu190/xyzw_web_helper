/**
 * 消耗活动 20 档任务表（与游戏内一致，取自项目既有消耗活动进度组件）
 *
 * thresholds[i] 为第 i+1 档的累计消耗阈值，rewards[i] 为该档完成后获得的任务道具数。
 * 5 项全部满档：400 + 200 + 280 + 150 + 20 = 1050 个任务道具。
 */

export const TASK_TIERS = {
  recruit: {
    thresholds: [
      80, 160, 240, 320, 400, 560, 720, 880, 1040, 1200, 1440, 1680, 1920, 2160,
      2400, 2720, 3040, 3360, 3680, 4000,
    ],
    rewards: [
      8, 8, 8, 8, 8, 16, 16, 16, 16, 16, 24, 24, 24, 24, 24, 32, 32, 32, 32, 32,
    ],
  },
  chest: {
    thresholds: [
      2000, 4000, 6000, 8000, 10000, 14000, 18000, 22000, 26000, 30000, 36000,
      42000, 48000, 54000, 60000, 68000, 76000, 84000, 92000, 100000,
    ],
    rewards: [
      4, 4, 4, 4, 4, 8, 8, 8, 8, 8, 12, 12, 12, 12, 12, 16, 16, 16, 16, 16,
    ],
  },
  rod: {
    thresholds: [
      25, 50, 75, 125, 175, 225, 300, 375, 450, 525, 625, 725, 825, 925, 1050,
      1175, 1300, 1450, 1600, 1750,
    ],
    rewards: [
      4, 4, 4, 8, 8, 8, 12, 12, 12, 12, 16, 16, 16, 16, 20, 20, 20, 24, 24, 24,
    ],
  },
  pot: {
    thresholds: [
      3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57,
      60,
    ],
    rewards: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
  gold: {
    thresholds: [
      10000, 20000, 30000, 40000, 50000, 70000, 90000, 110000, 130000, 150000,
      180000, 210000, 240000, 270000, 300000, 340000, 380000, 420000, 460000,
      500000,
    ],
    rewards: [3, 3, 3, 3, 3, 6, 6, 6, 6, 6, 9, 9, 9, 9, 9, 12, 12, 12, 12, 12],
  },
};

/** 已完成档位数（累计消耗达到的档位） */
export function getCompletedTiers(resourceKey, cost) {
  const tiers = TASK_TIERS[resourceKey];
  const value = Number(cost) || 0;
  if (!tiers || value <= 0) return 0;
  let completed = 0;
  for (const threshold of tiers.thresholds) {
    if (value >= threshold) completed += 1;
    else break;
  }
  return completed;
}

/** 指定消耗量可获得的道具数（按档位累计） */
export function getTierProps(resourceKey, cost) {
  const tiers = TASK_TIERS[resourceKey];
  if (!tiers) return 0;
  const completed = getCompletedTiers(resourceKey, cost);
  return tiers.rewards.slice(0, completed).reduce((sum, item) => sum + item, 0);
}

/** 下一档信息（阈值 / 奖励 / 还差多少） */
export function getNextTier(resourceKey, cost) {
  const tiers = TASK_TIERS[resourceKey];
  const value = Number(cost) || 0;
  if (!tiers) return null;
  const index = tiers.thresholds.findIndex((threshold) => value < threshold);
  if (index === -1) {
    return {
      done: true,
      threshold: tiers.thresholds[tiers.thresholds.length - 1],
      reward: 0,
      remain: 0,
      tier: tiers.thresholds.length,
      totalTiers: tiers.thresholds.length,
    };
  }
  return {
    done: false,
    threshold: tiers.thresholds[index],
    reward: tiers.rewards[index],
    remain: tiers.thresholds[index] - value,
    tier: index + 1,
    totalTiers: tiers.thresholds.length,
  };
}

/** 五类消耗 → 任务道具总数 */
export function costsToProps(costs = {}) {
  return Object.keys(TASK_TIERS).reduce(
    (sum, key) => sum + getTierProps(key, costs[key] || 0),
    0,
  );
}

/** 某类资源满档道具数 */
export function getMaxProps(resourceKey) {
  const tiers = TASK_TIERS[resourceKey];
  if (!tiers) return 0;
  return tiers.rewards.reduce((sum, item) => sum + item, 0);
}
