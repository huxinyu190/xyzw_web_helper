import assert from "node:assert/strict";
import test from "node:test";

import {
  bookEventRecruit,
  bookRecruitBonus,
  FESTIVALS,
  PRESET_MAP,
  PRESETS,
  RESOURCES,
} from "../src/utils/goldFish/constants.js";
import { planMarket } from "../src/utils/goldFish/market.js";
import {
  computePlan,
  estimateReturns,
  getEventWindow,
  getFestivalDate,
  getWeekType,
  listFestivalOptions,
} from "../src/utils/goldFish/plan.js";
import {
  expectedProps,
  getQuantiles,
  propsForProbability,
  successProbability,
} from "../src/utils/goldFish/probability.js";
import {
  costsToProps,
  getNextTier,
  getTierProps,
} from "../src/utils/goldFish/tiers.js";
import { resolveBookInfo } from "../src/utils/roleBook.js";
import { getChestPoints, getItemCount } from "../src/utils/roleItems.js";

test("道具换算：满档 1050", () => {
  const full = PRESET_MAP.full;
  const props = RESOURCES.reduce(
    (sum, resource) => sum + full.costs[resource.key] * resource.itemPerUnit,
    0,
  );
  assert.equal(Math.round(props), 1050);
});

test("道具换算：各档位与声明一致", () => {
  for (const preset of PRESETS) {
    const props = RESOURCES.reduce(
      (sum, resource) =>
        sum + preset.costs[resource.key] * resource.itemPerUnit,
      0,
    );
    assert.ok(
      Math.abs(props - preset.props) < 0.001,
      `${preset.label} 应为 ${preset.props}，实际 ${props}`,
    );
  }
});

test("概率模型：期望与分位数对齐公开模拟", () => {
  assert.ok(Math.abs(expectedProps(250) - 762.7) < 0.2);

  const quantiles = getQuantiles(250);
  assert.equal(quantiles.unlucky, 721);
  assert.equal(quantiles.average, 763);
  assert.equal(quantiles.steady, 804);
});

test("概率单调性", () => {
  let last = 0;
  for (let props = 600; props <= 1000; props += 20) {
    const rate = successProbability(props);
    assert.ok(rate >= last - 1e-9, `${props} 概率应单调不减`);
    last = rate;
  }
  assert.ok(successProbability(762) > 0.45);
  assert.ok(successProbability(804) > 0.94);
  assert.ok(successProbability(1050) > 0.999);
});

test("概率反查", () => {
  assert.equal(propsForProbability(0.5), 763);
  assert.ok(propsForProbability(0.95) === 804);
});

test("活动窗口：节日当周周五 12:00 开启", () => {
  const newYear = getFestivalDate("newYear", new Date(2026, 10, 8));
  assert.equal(newYear.getFullYear(), 2027);
  const { start, end } = getEventWindow(newYear);
  assert.equal(start.getDay(), 5);
  assert.equal(start.getHours(), 12);
  assert.equal(end.getTime() - start.getTime(), 7 * 24 * 60 * 60 * 1000);

  const dragonBoat = getFestivalDate("dragonBoat", new Date(2026, 10, 8));
  const dragonWindow = getEventWindow(dragonBoat);
  assert.equal(dragonWindow.start.getDay(), 5);
  assert.ok(dragonWindow.start <= dragonBoat);
});

test("周常循环：锚点为黑市周", () => {
  assert.equal(getWeekType(new Date("2025-12-12T12:00:00+08:00")), "黑市周");
  assert.equal(getWeekType(new Date("2025-12-19T12:00:00+08:00")), "招募周");
  assert.equal(getWeekType(new Date("2025-12-26T12:00:00+08:00")), "宝箱周");
});

test("节日列表按距离排序", () => {
  const options = listFestivalOptions(new Date(2026, 10, 8));
  assert.equal(options.length, FESTIVALS.length);
  assert.equal(options[0].key, "newYear");
  assert.ok(options[0].daysLeft > 0);
});

test("返还估算：1026 档", () => {
  const returns = estimateReturns(PRESET_MAP.safe.costs, "宝箱周");
  assert.equal(returns.props, 1026);
  // 道具约 550 + 钓鱼约 170（图鉴档位部分单独计算）
  assert.ok(returns.recruit >= 700 && returns.recruit <= 740);
  assert.ok(returns.chest >= 20000);
  assert.ok(returns.gold >= 200000);
  assert.ok(returns.rod > 150 && returns.rod < 200);
});

test("规划：无资源时有缺口，资源充足时达标", () => {
  const empty = computePlan({
    presetKey: "safe",
    festivalKey: "newYear",
    stock: { recruit: 0, chest: 0, rod: 0, gold: 0 },
    now: new Date(2026, 10, 8),
  });
  assert.equal(empty.totalProps, 1026);
  assert.ok(empty.gapProps > 0);
  assert.equal(empty.isReady, false);
  assert.ok(empty.rows.every((row) => row.target > 0));

  const rich = computePlan({
    presetKey: "safe",
    festivalKey: "newYear",
    stock: { recruit: 4000, chest: 100000, rod: 1600, gold: 500000 },
    now: new Date(2026, 10, 8),
  });
  assert.equal(rich.gapProps, 0);
  assert.equal(rich.isReady, true);
  assert.ok(rich.projectedRate > 0.999);
});

test("规划：按图鉴档位给出需囤目标", () => {
  const plan = computePlan({
    presetKey: "safe",
    festivalKey: "midAutumn",
    stock: { recruit: 1000, chest: 20000, rod: 500, gold: 100000 },
    microStar: 1500,
    now: new Date(2026, 10, 8),
  });
  assert.equal(plan.bookTier, "low");
  const recruit = plan.rows.find((row) => row.key === "recruit");
  const chest = plan.rows.find((row) => row.key === "chest");
  const rod = plan.rows.find((row) => row.key === "rod");
  const gold = plan.rows.find((row) => row.key === "gold");

  // 低图鉴档位：招募 2500 / 宝箱 8.5 轮 / 鱼竿 700 / 金砖 18 万
  assert.equal(recruit.target, 2500);
  assert.equal(chest.target, Math.round(8.5 * 3400));
  assert.equal(rod.target, 700);
  assert.equal(gold.target, 180000);
  assert.equal(recruit.inEvent, 4000 - 2500);
  assert.equal(recruit.gap, 1500);
  assert.equal(chest.gap, 28900 - 20000);
  assert.equal(rod.gap, 200);
  assert.equal(gold.gap, 80000);

  // 中/高图鉴档位
  const mid = computePlan({
    presetKey: "safe",
    festivalKey: "midAutumn",
    stock: {},
    microStar: 2500,
    now: new Date(2026, 10, 8),
  });
  assert.equal(mid.bookTier, "mid");
  assert.equal(mid.rows.find((row) => row.key === "recruit").target, 2800);
  assert.equal(mid.rows.find((row) => row.key === "chest").target, 30600);
  assert.equal(mid.rows.find((row) => row.key === "rod").target, 700);
  assert.equal(mid.rows.find((row) => row.key === "gold").target, 200000);

  const high = computePlan({
    presetKey: "safe",
    festivalKey: "midAutumn",
    stock: {},
    microStar: 3500,
    now: new Date(2026, 10, 8),
  });
  assert.equal(high.bookTier, "high");
  assert.equal(high.rows.find((row) => row.key === "recruit").target, 3300);
  assert.equal(high.rows.find((row) => row.key === "chest").target, 34000);
  assert.equal(high.rows.find((row) => row.key === "rod").target, 750);
  assert.equal(high.rows.find((row) => row.key === "gold").target, 250000);

  // 保底档鱼竿 +150
  const full = computePlan({
    presetKey: "full",
    festivalKey: "midAutumn",
    stock: {},
    microStar: 3500,
    now: new Date(2026, 10, 8),
  });
  assert.equal(full.rows.find((row) => row.key === "rod").target, 900);
});

test("规划：进度条只按现有/需囤，手动档位与未识别兜底", () => {
  const plan = computePlan({
    presetKey: "safe",
    festivalKey: "newYear",
    stock: { recruit: 1000, chest: 0, rod: 0, gold: 0 },
    microStar: 300,
    now: new Date(2026, 10, 8),
  });
  const recruit = plan.rows.find((row) => row.key === "recruit");
  assert.equal(recruit.progress, 1000 / recruit.target);
  assert.ok(recruit.bookPart >= 0);

  // 未识别微星时按最高档保守计算
  const unknown = computePlan({
    presetKey: "safe",
    festivalKey: "newYear",
    stock: {},
    bookKnown: false,
    now: new Date(2026, 10, 8),
  });
  assert.equal(unknown.bookTier, "high");
  assert.equal(unknown.rows.find((row) => row.key === "recruit").target, 3300);

  // 手动指定档位优先
  const manual = computePlan({
    presetKey: "safe",
    festivalKey: "newYear",
    stock: {},
    microStar: 3500,
    bookTier: "low",
    now: new Date(2026, 10, 8),
  });
  assert.equal(manual.bookTier, "low");
  assert.equal(manual.rows.find((row) => row.key === "recruit").target, 2500);
});

test("图鉴微星识别：优先微星字段", () => {
  assert.equal(resolveBookInfo({ bookPoint: 460 }).count, 460);
  assert.equal(resolveBookInfo({ bookPoint: 460 }).scope, "bookPoint");
  assert.equal(resolveBookInfo({ bookPoint: 460 }).label, "图鉴微星");
  assert.equal(resolveBookInfo({ microStar: 1200 }).count, 1200);
  assert.equal(resolveBookInfo({ book: { point: 800 } }).count, 800);
  assert.equal(
    resolveBookInfo({ statistics: { "book:star": 320 } }).count,
    320,
  );
  assert.equal(resolveBookInfo({ myBookPoints: 150 }).count, 150);
  // 图鉴收录数量只作为兜底，不再返回武将数
  assert.equal(resolveBookInfo({ bookCount: 168 }).label, "图鉴数");
  assert.equal(
    resolveBookInfo({ heroes: { 101: { level: 1 }, 102: { level: 2 } } }).count,
    null,
  );
  assert.equal(resolveBookInfo({}).count, null);
});

test("图鉴微星折算招募令", () => {
  assert.equal(bookRecruitBonus(0), 0);
  assert.equal(bookRecruitBonus(149), 0);
  assert.equal(bookRecruitBonus(150), 25);
  assert.equal(bookRecruitBonus(300), 50);
  assert.equal(bookRecruitBonus(4600), 750);
  // 活动内图鉴返还：微星越低越多
  assert.equal(bookEventRecruit(0), 120);
  assert.equal(bookEventRecruit(2300), 60);
  assert.equal(bookEventRecruit(4600), 0);
  assert.equal(bookEventRecruit(9999), 0);
});

test("图鉴微星：手动覆盖与候选字段", () => {
  const role = { book: { point: 800 }, other: { myBookStar: 300 } };
  assert.equal(resolveBookInfo(role).count, 800);
  // 手动值优先
  assert.equal(resolveBookInfo(role, 1234).count, 1234);
  assert.equal(resolveBookInfo(role, 1234).scope, "manual");
  assert.equal(resolveBookInfo({}, 500).count, 500);
  // 解析不到时给出候选，便于手动选择
  const info = resolveBookInfo({ nested: { bookStarCount: 456 } });
  assert.equal(info.count, 456);
  assert.ok(info.candidates.some((item) => item.value === 456));
});

test("采购规划：按优先级补齐缺口并给出今日清单", () => {
  const fakePlan = {
    daysLeft: 10,
    preset: { costs: { gold: 500000 } },
    rows: [
      {
        key: "recruit",
        label: "招募令",
        target: 4000,
        current: 4000,
        returned: 0,
        bonus: 0,
        gap: 0,
      },
      {
        key: "chest",
        label: "宝箱积分",
        target: 1000,
        current: 0,
        returned: 0,
        bonus: 0,
        gap: 1000,
      },
      {
        key: "rod",
        label: "黄金鱼竿",
        target: 100,
        current: 0,
        returned: 0,
        bonus: 0,
        gap: 100,
      },
      { key: "gold", label: "金砖", target: 500000, current: 0, gap: 0 },
      { key: "pot", label: "盐罐", target: 60, current: 0, gap: 0 },
    ],
  };

  const market = planMarket({
    plan: fakePlan,
    currentGold: 100000,
    dailyIncome: 1000,
    priority: ["chest_bronze"],
    enabled: { chest_bronze: true },
    eventDays: 7,
  });

  // 活动期可买 4*10*7 = 280，缺口 1000，活动前需囤 720（72 次），受日限 4*10=40 次限制
  assert.equal(market.purchases.length, 1);
  assert.equal(market.purchases[0].preQty, 40);
  assert.equal(market.purchases[0].eventQty, 28);
  assert.equal(market.purchases[0].qty, 68);
  assert.equal(market.purchases[0].cost, 6800);
  assert.ok(market.unmet.some((item) => item.key === "chest"));
  assert.equal(market.todayCost, 400);
  assert.equal(market.todayList[0].qty, 4);
});

test("采购规划：不勾选则不买", () => {
  const market = planMarket({
    plan: {
      daysLeft: 10,
      preset: { costs: { gold: 500000 } },
      rows: [
        {
          key: "rod",
          label: "黄金鱼竿",
          target: 1600,
          current: 0,
          returned: 0,
          bonus: 0,
          gap: 1600,
        },
        { key: "gold", label: "金砖", target: 500000, current: 0, gap: 0 },
      ],
    },
    currentGold: 1000000,
    dailyIncome: 2000,
    priority: ["rod_black"],
    enabled: { rod_black: false },
  });
  assert.equal(market.purchases.length, 0);
  assert.equal(market.totalCost, 0);
  assert.equal(market.todayList.length, 0);
  assert.ok(market.unmet.length > 0);
});

test("物品解析：数组 / 对象 / 宝箱积分", () => {
  assert.equal(getItemCount([{ id: 1001, num: 5 }], 1001), 5);
  assert.equal(getItemCount({ 1001: 7 }, 1001), 7);
  assert.equal(getItemCount({ 1001: { num: 9 } }, 1001), 9);
  assert.equal(getItemCount({ x: { itemId: 1001, quantity: 3 } }, 1001), 3);
  const points = getChestPoints({ 2001: 3, 2002: 5, 2004: 2, 2005: 9 });
  assert.equal(points, 3 * 1 + 5 * 10 + 2 * 50);
});

test("档位阶梯：与游戏内 20 档一致", () => {
  assert.equal(getTierProps("recruit", 400), 40);
  assert.equal(getTierProps("recruit", 4000), 400);
  assert.equal(getTierProps("recruit", 3999), 368);
  assert.equal(getTierProps("chest", 10000), 20);
  assert.equal(getTierProps("chest", 100000), 200);
  assert.equal(getTierProps("rod", 1600), 256);
  assert.equal(getTierProps("rod", 1750), 280);
  assert.equal(getTierProps("gold", 50000), 15);
  assert.equal(getTierProps("gold", 500000), 150);
  assert.equal(getTierProps("pot", 60), 20);
  assert.equal(
    getTierProps("recruit", 4000) +
      getTierProps("chest", 100000) +
      getTierProps("rod", 1600) +
      getTierProps("gold", 500000) +
      getTierProps("pot", 60),
    1026,
  );
});

test("档位阶梯：下一档提示", () => {
  const next = getNextTier("rod", 0);
  assert.equal(next.threshold, 25);
  assert.equal(next.reward, 4);
  assert.equal(next.remain, 25);
  assert.equal(getNextTier("recruit", 4000).done, true);
});

test("档位阶梯：五类消耗折算道具", () => {
  assert.equal(costsToProps(PRESET_MAP.safe.costs), 1026);
  assert.equal(costsToProps(PRESET_MAP.full.costs), 1050);
  assert.equal(costsToProps({}), 0);
});
