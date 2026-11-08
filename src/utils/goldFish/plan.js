/**
 * 金鱼活动规划计算：节日 / 档位 → 五类资源目标 → 活动内返还 → 缺口 → 每日计划
 *
 * 口径说明：
 * - “task”= 悬赏任务需要消耗的量。
 * - “inEvent”= 活动内可获得：开道具/钓鱼/周常返还 + 宝箱开箱循环 + 活动期直购鱼竿。
 * - “target（需囤）”= task - inEvent，即活动开始前真正要囤的量。
 * - “gap（缺口）”= 需囤 - 现有，进度条只按现有 / 需囤。
 */
import {
  CHEST_POINTS_PER_ROUND,
  CHEST_STOCK_RATIO,
  DAILY_CAPACITY,
  EVENT_DURATION_DAYS,
  FESTIVAL_MAP,
  FESTIVALS,
  getBookTier,
  POT_DAILY_LIMIT,
  PRESET_MAP,
  PRESETS,
  RESOURCES,
  RETURN_RATES,
  ROD_EVENT_DIRECT,
  WEEK_ANCHOR,
  WEEK_GOLD_BONUS,
  WEEK_TYPES,
} from "./constants.js";
import { successProbability } from "./probability.js";
import { costsToProps, getNextTier, getTierProps } from "./tiers.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  const [y, m, d] = String(value || "")
    .split("-")
    .map((item) => Number(item));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** 取该节日的下一次（含今天）公历日期 */
export function getFestivalDate(festivalKey, now = new Date()) {
  const festival = FESTIVAL_MAP[festivalKey] || FESTIVALS[0];
  const today = startOfDay(now);
  const candidates = (festival.dates || [])
    .map(parseDate)
    .filter(Boolean)
    .sort((a, b) => a - b);
  const upcoming = candidates.find((date) => date >= today);
  if (upcoming) return upcoming;

  // 超出预置年份：用 fallback 月/日推算下一年
  const fallback = festival.fallback || { month: 1, day: 1 };
  const guess = new Date(today.getFullYear(), fallback.month - 1, fallback.day);
  if (guess < today) guess.setFullYear(guess.getFullYear() + 1);
  return guess;
}

/** 节日当周（或之前最近的）周五 12:00 开启，持续 7 天 */
export function getEventWindow(festivalDate) {
  const date = startOfDay(festivalDate);
  const weekday = date.getDay(); // 0=周日, 5=周五
  const offset = (weekday - 5 + 7) % 7;
  const start = new Date(date.getTime() - offset * DAY_MS);
  start.setHours(12, 0, 0, 0);
  const end = new Date(start.getTime() + EVENT_DURATION_DAYS * DAY_MS);
  return { start, end };
}

/** 按 21 天循环（黑市→招募→宝箱）判断活动落在哪个周常 */
export function getWeekType(date) {
  const anchor = new Date(WEEK_ANCHOR).getTime();
  const diff = date.getTime() - anchor;
  const weeks = Math.floor(diff / (7 * DAY_MS));
  const index = ((weeks % 3) + 3) % 3;
  return WEEK_TYPES[index];
}

export function getFestivalInfo(festivalKey, now = new Date()) {
  const festival = FESTIVAL_MAP[festivalKey] || FESTIVALS[0];
  const date = getFestivalDate(festival.key, now);
  const { start, end } = getEventWindow(date);
  const daysLeft = Math.max(
    0,
    Math.ceil((start.getTime() - now.getTime()) / DAY_MS),
  );
  return {
    key: festival.key,
    label: festival.label,
    itemName: festival.itemName,
    note: festival.note,
    date,
    start,
    end,
    daysLeft,
    weekType: getWeekType(start),
    isOngoing: now >= start && now <= end,
  };
}

export function listFestivalOptions(now = new Date()) {
  return FESTIVALS.map((festival) => {
    const info = getFestivalInfo(festival.key, now);
    return {
      key: info.key,
      label: info.label,
      daysLeft: info.daysLeft,
      weekType: info.weekType,
      date: info.date,
      isOngoing: info.isOngoing,
    };
  });
}

function normalizeStock(stock) {
  const source = stock || {};
  return RESOURCES.reduce((acc, resource) => {
    const value = Number(source[resource.key]);
    acc[resource.key] = Number.isFinite(value) && value > 0 ? value : 0;
    return acc;
  }, {});
}

/** 活动内预计返还（按档位道具数与鱼竿数线性折算，不含图鉴档位部分） */
export function estimateReturns(costs, weekType) {
  const props = costsToProps(costs);

  const recruit = Math.round(
    props * RETURN_RATES.recruitFromItems +
      costs.rod * RETURN_RATES.recruitFromFishing,
  );
  const chestWeekBonus = weekType === "宝箱周" ? 2000 : 0;
  const chest = Math.round(
    props * RETURN_RATES.chestFromItems +
      costs.rod * RETURN_RATES.chestFromFishing +
      chestWeekBonus,
  );
  const rod = Math.round(costs.rod * RETURN_RATES.rodFromFishing);
  const gold =
    RETURN_RATES.goldFromItems +
    RETURN_RATES.goldFromPots +
    RETURN_RATES.goldFromChestTask +
    RETURN_RATES.goldFromMonthTask +
    (WEEK_GOLD_BONUS[weekType] || 0);

  return { props, recruit, chest, rod, gold, pot: 0 };
}

const RESOURCE_TIPS = {
  recruit: "招募令不可逆，优先爬塔 + 图鉴，黑市只在打折时补。",
  chest: "宝箱平时不要开，攒到宝箱周/消耗活动再一次消耗；黑市青铜、铂金优先。",
  rod: "鱼竿靠黑市 + 梦境慢慢囤，低于 400 金砖/竿就买；买竿的金砖计入金砖消耗任务。",
  gold: "金砖主要靠盐罐（每日 20 次），盐场排名和活动是额外补充。",
  pot: "盐罐 60 次是行动任务，活动期每天收满 20 次，3 天即可完成。",
};

/**
 * 生成完整规划
 * @param {object} options
 * @param {string} options.presetKey 档位 key
 * @param {string} options.festivalKey 节日 key
 * @param {object} options.stock 现有资源 { recruit, chest, rod, gold, pot }
 * @param {number} [options.microStar] 图鉴微星数
 * @param {boolean} [options.bookKnown] 是否识别到微星（未识别按最高档保守算）
 * @param {string} [options.bookTier] 手动指定图鉴档位 low/mid/high/auto
 * @param {Date} [options.now]
 */
export function computePlan({
  presetKey = "safe",
  festivalKey = "newYear",
  stock,
  microStar = 0,
  bookKnown = true,
  bookTier = "auto",
  now = new Date(),
} = {}) {
  const preset = PRESET_MAP[presetKey] || PRESETS[2];
  const festival = getFestivalInfo(festivalKey, now);
  const holdings = normalizeStock(stock);
  const returns = estimateReturns(preset.costs, festival.weekType);
  const daysLeft = Math.max(1, festival.daysLeft);
  const tier = getBookTier(microStar, bookKnown, bookTier);

  /**
   * 图鉴档位对应的入场（需囤）目标：
   * - 招募/宝箱任务量固定，直接用档位给的数
   * - 鱼竿/金砖随档位方案（最低/保底）增减
   */
  const tierTarget = (key, task) => {
    if (key === "recruit") return tier.recruit;
    if (key === "chest") return tier.chestPoints;
    if (key === "rod") return tier.rodMax + (preset.costs.rod - 1600);
    if (key === "gold") return tier.gold + (preset.costs.gold - 500000);
    return task;
  };

  const rows = RESOURCES.map((resource) => {
    // task：悬赏任务需要消耗的量；target：社区图鉴档位给出的“需囤”目标
    const task = preset.costs[resource.key] || 0;
    const current = holdings[resource.key] || 0;
    const returned = returns[resource.key] || 0;
    // 开箱循环返还（宝箱）：开箱本身会返箱子，100000 分只需一半库存
    const recycle =
      resource.key === "chest" ? Math.round(task * (1 - CHEST_STOCK_RATIO)) : 0;
    // 活动期内用金砖直购鱼竿（同时完成金砖消耗任务）
    const direct = resource.key === "rod" ? ROD_EVENT_DIRECT : 0;

    // 盐罐是活动期内的“行动任务”（每日上限 20 次），不存在提前囤积
    const isAction = resource.key === "pot";
    const target = isAction
      ? task
      : Math.min(task, Math.max(0, Math.round(tierTarget(resource.key, task))));
    const inEvent = isAction ? 0 : Math.max(0, task - target);
    // 图鉴/其他收益 = 活动内可获得 - 常规返还
    const bookPart = Math.max(0, inEvent - returned - recycle - direct);
    const gap = isAction ? 0 : Math.max(0, target - current);
    const perDay = isAction
      ? Math.min(POT_DAILY_LIMIT, target)
      : gap > 0
        ? gap / daysLeft
        : 0;
    const capacity = isAction
      ? POT_DAILY_LIMIT
      : DAILY_CAPACITY[resource.key] || Infinity;
    const feasible = perDay <= capacity;
    const reachable = isAction ? task : Math.min(task, current + inEvent);
    return {
      ...resource,
      task,
      target,
      current,
      returned,
      recycle,
      direct,
      inEvent,
      bookPart,
      gap,
      perDay,
      capacity,
      feasible,
      reachable,
      props: getTierProps(resource.key, task),
      reachableProps: getTierProps(resource.key, reachable),
      nextTier: getNextTier(resource.key, current + inEvent),
      // 进度条只反映“已囤到的量”，不含活动内返还
      progress: target > 0 ? Math.min(1, current / target) : 1,
      stockProps: getTierProps(resource.key, Math.min(task, current)),
      tip: RESOURCE_TIPS[resource.key] || "",
    };
  });

  // 现有资源 + 活动内可获得，能折算出的任务道具（按档位阶梯精确累计）
  const projectedProps = rows.reduce((sum, row) => sum + row.reachableProps, 0);
  // 仅现有资源（不含活动内返还），用于“囤货进度”
  const stockProps = rows.reduce((sum, row) => sum + row.stockProps, 0);

  const totalProps = costsToProps(preset.costs);
  const theoryRate = successProbability(totalProps);
  const projectedRate = successProbability(projectedProps);
  const gapProps = Math.max(0, totalProps - projectedProps);

  // 金砖缺口对应的“还差多少天盐罐”
  const goldRow = rows.find((row) => row.key === "gold");
  const goldDaysNeeded =
    goldRow && goldRow.perDay > 0
      ? Math.ceil(goldRow.gap / (DAILY_CAPACITY.gold || 1))
      : 0;

  return {
    festival,
    preset,
    rows,
    daysLeft,
    totalProps,
    projectedProps: Math.floor(projectedProps),
    stockProps: Math.floor(stockProps),
    bookTier: tier.key,
    bookTierLabel: tier.label,
    bookTierRounds: tier.chestRounds,
    chestPointsPerRound: CHEST_POINTS_PER_ROUND,
    microStar: Number(microStar) || 0,
    bookKnown: Boolean(bookKnown),
    projectedRate,
    gapProps: Math.ceil(gapProps),
    theoryRate,
    communityRate: preset.communityRate,
    goldDaysNeeded,
    potDays: Math.ceil((preset.costs.pot || 0) / Math.max(1, POT_DAILY_LIMIT)),
    isReady: gapProps <= 0,
  };
}
