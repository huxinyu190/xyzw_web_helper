/**
 * 黑市 / 直购采购规划
 *
 * 目标：在活动开始前把钱花在“最影响拿鱼”的资源上，活动期内再买（可同时完成金砖消耗任务）。
 *
 * 思路：
 * 1. 缺口 = 目标消耗 - 现有 - 活动返还 - 图鉴折算（来自 plan.rows[].gap）。
 * 2. 活动 7 天内的黑市购买也算资源，所以先扣掉“活动期内能买到的量”，剩下的才是活动前必须囤的。
 * 3. 按用户给定优先级依次购买，受每日限购、可用金砖、总天数约束。
 * 4. 今日清单按“活动前缺口 / 剩余天数”折算，并受今日可用金砖限制。
 */
import {
  DEFAULT_DAILY_GOLD,
  DEFAULT_MARKET_PRIORITY,
  EVENT_DURATION_DAYS,
  MARKET_ITEM_MAP,
  ROD_DIRECT_PRICE,
  ROD_EVENT_DIRECT,
} from "./constants.js";
import { successProbability } from "./probability.js";
import { getTierProps } from "./tiers.js";

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * @param {object} options
 * @param {object} options.plan computePlan 的结果
 * @param {number} [options.currentGold] 现有金砖
 * @param {number} [options.dailyIncome] 每日金砖收入
 * @param {string[]} [options.priority] 购买优先级（item key）
 * @param {Record<string, boolean>} [options.enabled] 是否启用某商品
 * @param {number} [options.eventDays] 活动天数
 */
export function planMarket({
  plan,
  currentGold = 0,
  dailyIncome = DEFAULT_DAILY_GOLD,
  priority = DEFAULT_MARKET_PRIORITY,
  enabled = {},
  eventDays = EVENT_DURATION_DAYS,
} = {}) {
  const rows = plan?.rows || [];
  const daysLeft = Math.max(1, safeNumber(plan?.daysLeft, 1));
  const totalDays = daysLeft + eventDays;
  const gold = Math.max(0, safeNumber(currentGold));
  const income = Math.max(0, safeNumber(dailyIncome));

  const items = (priority || [])
    .map((key) => MARKET_ITEM_MAP[key])
    .filter(Boolean)
    .filter((item) => enabled[item.key] !== false);

  const gaps = {};
  for (const row of rows) {
    if (row.key === "gold" || row.key === "pot") continue;
    gaps[row.key] = Math.max(0, safeNumber(row.gap));
  }

  // 活动期内可买到的量（双任务叠加的最佳窗口）
  // 不限购的直购商品不参与“活动期可覆盖”计算，避免把活动前囤货全部推后
  const eventCapacity = {};
  for (const item of items) {
    if (item.unlimited) continue;
    eventCapacity[item.resource] =
      (eventCapacity[item.resource] || 0) +
      item.amount * item.perDay * eventDays;
  }

  const remainingNeed = { ...gaps };
  const eventCapLeft = { ...eventCapacity };

  let budget = gold + income * totalDays;
  const purchases = [];

  for (const item of items) {
    const need = remainingNeed[item.resource] || 0;
    if (need <= 0) continue;

    const capQty = Math.floor(item.perDay * totalDays);
    const affordableQty = Math.floor(budget / item.price);
    const wantQty = Math.ceil(need / item.amount);
    const qty = Math.max(0, Math.min(wantQty, capQty, affordableQty));
    if (qty <= 0) continue;

    const units = qty * item.amount;
    const cost = qty * item.price;
    budget -= cost;
    remainingNeed[item.resource] = Math.max(0, need - units);

    // 能在活动期内买到的部分尽量留到活动期买（同时完成金砖消耗任务），
    // 活动期买不完的才需要在活动前囤。
    const capUnits = item.unlimited ? 0 : eventCapLeft[item.resource] || 0;
    const eventQty = Math.min(qty, Math.floor(capUnits / item.amount));
    const preQty = qty - eventQty;
    eventCapLeft[item.resource] = Math.max(
      0,
      capUnits - eventQty * item.amount,
    );

    purchases.push({
      key: item.key,
      label: item.label,
      resource: item.resource,
      price: item.price,
      amount: item.amount,
      note: item.note,
      qty,
      units,
      cost,
      preQty,
      eventQty,
      preCost: preQty * item.price,
      eventCost: eventQty * item.price,
      totalCost: cost,
    });
  }

  // 今日清单：活动前缺口按剩余天数摊，受每日限购和今日可用金砖限制
  let todayBudget = income + gold / daysLeft;
  const todayList = [];
  for (const purchase of purchases) {
    if (purchase.preQty <= 0) continue;
    const item = MARKET_ITEM_MAP[purchase.key];
    const dailyQty = Math.min(
      Math.ceil(purchase.preQty / daysLeft),
      item.perDay,
      Math.floor(todayBudget / item.price),
    );
    if (dailyQty <= 0) continue;
    const cost = dailyQty * item.price;
    todayBudget -= cost;
    todayList.push({
      key: purchase.key,
      label: purchase.label,
      qty: dailyQty,
      units: dailyQty * item.amount,
      cost,
      resource: item.resource,
    });
  }

  const totalCost = purchases.reduce((sum, item) => sum + item.cost, 0);
  const preCost = purchases.reduce((sum, item) => sum + item.preCost, 0);
  const eventCost = purchases.reduce((sum, item) => sum + item.eventCost, 0);
  const todayCost = todayList.reduce((sum, item) => sum + item.cost, 0);

  const unmet = Object.keys(remainingNeed)
    .filter((key) => remainingNeed[key] > 0)
    .map((key) => ({
      key,
      label: rows.find((row) => row.key === key)?.label || key,
      amount: Math.ceil(remainingNeed[key]),
    }));

  // 采购后的资源 → 道具
  const projectedProps = rows.reduce((sum, row) => {
    const bought = purchases
      .filter((item) => item.resource === row.key)
      .reduce((acc, item) => acc + item.units, 0);
    const task = row.task ?? row.target;
    const inEvent = row.inEvent ?? row.returned ?? 0;
    const reachable =
      row.key === "pot" ? task : Math.min(task, row.current + inEvent + bought);
    return sum + getTierProps(row.key, reachable);
  }, 0);

  const goldTaskTarget = plan?.preset?.costs?.gold || 0;
  const totalAvailable = gold + income * totalDays;
  // 活动期假定直购 600 竿，同样计入金砖消耗任务
  const assumedDirectSpend = ROD_EVENT_DIRECT * ROD_DIRECT_PRICE;
  const goldTaskGap = Math.max(
    0,
    goldTaskTarget - eventCost - assumedDirectSpend,
  );
  // 活动期最多还能花多少（活动前采购不计入金砖消耗任务）
  const maxEventSpend = Math.max(0, totalAvailable - preCost);
  const goldShortfall = Math.max(0, goldTaskTarget - maxEventSpend);

  return {
    daysLeft,
    eventDays,
    totalDays,
    gold: {
      current: gold,
      dailyIncome: income,
      totalAvailable,
      totalCost,
      preCost,
      eventCost,
      todayCost,
      remaining: totalAvailable - totalCost,
    },
    purchases,
    todayList,
    unmet,
    feasible: unmet.length === 0,
    projectedProps: Math.floor(projectedProps),
    projectedRate: successProbability(projectedProps),
    goldTaskGap,
    goldTaskTarget,
    assumedDirectSpend,
    maxEventSpend,
    goldShortfall,
    preCost,
    eventCost,
    totalCost,
    todayCost,
  };
}
