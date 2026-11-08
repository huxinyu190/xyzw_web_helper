/**
 * 金鱼活动概率精算
 *
 * 机制：开 1 个任务道具，25% 出 1 个“金色道具”；每 5 次必出 1 个。
 * 需要 250 个金色道具兑换 1 条 5 星金鱼。
 *
 * 单次“首中”次数 T 的分布（两次金色道具之间的开箱次数）：
 *   P(T=t) = 0.75^(t-1) * 0.25, t = 1..4
 *   P(T=5) = 0.75^4
 *   E[T] = 3.0508
 *
 * 用动态规划做 250 次卷积，得到“开 N 个道具能拿够 250 个金色道具”的精确概率。
 */
import {
  GOLDEN_DROP_RATE,
  GOLDEN_ITEMS_NEEDED,
  GOLDEN_PITY,
} from "./constants.js";

const MAX_PROPS = 1400;
const cdfCache = new Map();

/** 两次金色道具之间的开箱次数分布 */
export function getFirstHitDistribution(
  rate = GOLDEN_DROP_RATE,
  pity = GOLDEN_PITY,
) {
  const dist = [];
  let miss = 1;
  for (let t = 1; t < pity; t += 1) {
    dist.push(miss * rate);
    miss *= 1 - rate;
  }
  dist.push(miss);
  return dist;
}

/** 拿到 1 个金色道具的期望开箱次数 */
export function expectedPropsPerGolden(
  rate = GOLDEN_DROP_RATE,
  pity = GOLDEN_PITY,
) {
  return getFirstHitDistribution(rate, pity).reduce(
    (sum, p, index) => sum + p * (index + 1),
    0,
  );
}

/** 拿到 need 个金色道具的期望任务道具数 */
export function expectedProps(
  need = GOLDEN_ITEMS_NEEDED,
  rate = GOLDEN_DROP_RATE,
  pity = GOLDEN_PITY,
) {
  return expectedPropsPerGolden(rate, pity) * need;
}

/**
 * 计算累计分布：cdf[n] = P(开 n 个道具即可拿够 need 个金色道具)
 * 结果按 need 缓存，避免组件重复计算。
 */
export function buildCdf(
  need = GOLDEN_ITEMS_NEEDED,
  rate = GOLDEN_DROP_RATE,
  pity = GOLDEN_PITY,
) {
  const cacheKey = `${need}-${rate}-${pity}`;
  if (cdfCache.has(cacheKey)) return cdfCache.get(cacheKey);

  const dist = getFirstHitDistribution(rate, pity);
  const maxProps = Math.max(MAX_PROPS, need * pity);
  // dp[k][n]：拿到 k 个金色道具、累计开 n 个道具的概率
  let prev = new Float64Array(maxProps + 1);
  prev[0] = 1;

  for (let k = 0; k < need; k += 1) {
    const next = new Float64Array(maxProps + 1);
    for (let n = 0; n <= maxProps; n += 1) {
      const value = prev[n];
      if (value === 0) continue;
      for (let t = 1; t <= dist.length; t += 1) {
        const target = n + t;
        if (target > maxProps) break;
        next[target] += value * dist[t - 1];
      }
    }
    prev = next;
  }

  const cdf = new Float64Array(maxProps + 1);
  let acc = 0;
  for (let n = 0; n <= maxProps; n += 1) {
    acc += prev[n];
    cdf[n] = Math.min(1, acc);
  }

  const result = { cdf, maxProps, need };
  cdfCache.set(cacheKey, result);
  return result;
}

/** 开 props 个任务道具时，拿够 need 个金色道具的概率 */
export function successProbability(
  props,
  need = GOLDEN_ITEMS_NEEDED,
  rate = GOLDEN_DROP_RATE,
  pity = GOLDEN_PITY,
) {
  const { cdf, maxProps } = buildCdf(need, rate, pity);
  const n = Math.floor(Number(props) || 0);
  if (n <= 0) return 0;
  if (n >= maxProps) return 1;
  return cdf[n];
}

/** 反查：想达到 prob 概率，至少需要多少个任务道具 */
export function propsForProbability(
  prob,
  need = GOLDEN_ITEMS_NEEDED,
  rate = GOLDEN_DROP_RATE,
  pity = GOLDEN_PITY,
) {
  const { cdf, maxProps } = buildCdf(need, rate, pity);
  const target = Math.min(1, Math.max(0, Number(prob) || 0));
  if (target <= 0) return 0;
  for (let n = 0; n <= maxProps; n += 1) {
    if (cdf[n] >= target) return n;
  }
  return maxProps;
}

/** 常用分位数，便于展示“最低 / 平均 / 稳妥 / 保底” */
export function getQuantiles(need = GOLDEN_ITEMS_NEEDED) {
  return {
    best: propsForProbability(0.01, need),
    unlucky: propsForProbability(0.05, need),
    average: propsForProbability(0.5, need),
    steady: propsForProbability(0.95, need),
    safe: propsForProbability(0.99, need),
    worst: propsForProbability(0.9999, need),
  };
}
