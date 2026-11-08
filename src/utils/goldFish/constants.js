/**
 * 金鱼消耗活动（端午 / 中秋 / 元旦 同款换皮活动）静态配置
 *
 * 数据口径：以“悬赏任务满档消耗”为基准，5 项任务全部做满 = 1050 个任务道具。
 * 参考：公开攻略与实测（详见 tmp_goldfish/plan.md）。数值集中在文件底部 PRESETS，
 * 若后续版本调整（例如金砖 50 万 → 40 万），只需改 PRESETS 即可。
 */

/** 兑换一条 5 星金鱼需要的“金色道具”数量 */
export const GOLDEN_ITEMS_NEEDED = 250;

/** 开任务道具时出金色道具的概率 */
export const GOLDEN_DROP_RATE = 0.25;

/** 开任务道具的保底次数（每 N 次必出 1 个金色道具） */
export const GOLDEN_PITY = 5;

/** 活动持续天数 */
export const EVENT_DURATION_DAYS = 7;

/** 盐罐每日收取上限 */
export const POT_DAILY_LIMIT = 20;

/** 宝箱积分：物品 ID → 单箱积分（钻石宝箱不计分） */
export const CHEST_POINTS = {
  2001: 1, // 木制宝箱
  2002: 10, // 青铜宝箱
  2003: 20, // 黄金宝箱
  2004: 50, // 铂金宝箱
  2005: 0, // 钻石宝箱
};

/** 五类资源定义：道具转化率 = itemPerUnit（每 1 单位资源获得的道具数） */
export const RESOURCES = [
  {
    key: "recruit",
    label: "招募令",
    unit: "个",
    itemId: 1001,
    itemPerUnit: 1 / 10,
    fullCost: 4000,
    icon: "🧾",
    priority: 1,
  },
  {
    key: "chest",
    label: "宝箱积分",
    unit: "分",
    itemPerUnit: 1 / 500,
    fullCost: 100000,
    icon: "🎁",
    priority: 3,
  },
  {
    key: "rod",
    label: "黄金鱼竿",
    unit: "竿",
    itemId: 1012,
    itemPerUnit: 16 / 100,
    fullCost: 1750,
    icon: "🎣",
    priority: 2,
  },
  {
    key: "gold",
    label: "金砖",
    unit: "砖",
    itemPerUnit: 15 / 50000,
    fullCost: 500000,
    icon: "💎",
    priority: 5,
  },
  {
    key: "pot",
    label: "盐罐",
    unit: "次",
    itemPerUnit: 1 / 3,
    fullCost: 60,
    icon: "🏺",
    priority: 4,
  },
];

export const RESOURCE_MAP = RESOURCES.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

/**
 * 活动档位方案
 *
 * props 为任务道具总数；communityRate 为社区经验成功率（保守口径），
 * 理论概率由 probability.js 按 25% + 5 次保底精算，会更高，UI 同时展示。
 */
export const PRESETS = [
  {
    key: "low",
    label: "最低档",
    desc: "只补金砖缺口，赌脸",
    props: 1002,
    communityRate: 0.7,
    costs: { recruit: 4000, chest: 100000, rod: 1600, gold: 420000, pot: 60 },
  },
  {
    key: "steady",
    label: "稳妥档",
    desc: "金砖多备 4 万",
    props: 1014,
    communityRate: 0.8,
    costs: { recruit: 4000, chest: 100000, rod: 1600, gold: 460000, pot: 60 },
  },
  {
    key: "safe",
    label: "推荐档",
    desc: "最常用方案，社区约 94%",
    props: 1026,
    communityRate: 0.94,
    costs: { recruit: 4000, chest: 100000, rod: 1600, gold: 500000, pot: 60 },
  },
  {
    key: "full",
    label: "保底档",
    desc: "全任务做满，官方兜底",
    props: 1050,
    communityRate: 1,
    costs: { recruit: 4000, chest: 100000, rod: 1750, gold: 500000, pot: 60 },
  },
];

export const PRESET_MAP = PRESETS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

/**
 * 节日配置
 * dates 为该节日的公历日期（消耗活动以节日所在周开启），按年份列出；
 * 未列出的年份用 fallback 的月/日近似，活动周仍按“节日当周周五 12:00”计算。
 */
export const FESTIVALS = [
  {
    key: "newYear",
    label: "元旦",
    itemName: "手套",
    dates: ["2026-01-01", "2027-01-01", "2028-01-01", "2029-01-01"],
    fallback: { month: 1, day: 1 },
    note: "元旦消耗，通常在宝箱周/黑市周附近开启",
  },
  {
    key: "dragonBoat",
    label: "端午",
    itemName: "粽子",
    dates: ["2026-06-19", "2027-06-09", "2028-05-28", "2029-06-16"],
    fallback: { month: 6, day: 10 },
    note: "端午消耗，近两年多与黑市周/宝箱周重合",
  },
  {
    key: "midAutumn",
    label: "中秋",
    itemName: "月饼",
    dates: ["2026-09-25", "2027-09-15", "2028-10-03", "2029-09-22"],
    fallback: { month: 9, day: 20 },
    note: "中秋消耗，近两年多与宝箱周重合",
  },
];

export const FESTIVAL_MAP = FESTIVALS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

/** 周常循环锚点：2025-12-12 12:00 为黑市周开始（与身份牌现有算法一致） */
export const WEEK_ANCHOR = "2025-12-12T12:00:00+08:00";
export const WEEK_TYPES = ["黑市周", "招募周", "宝箱周"];

/** 不同周常下，活动内额外返还的金砖（宝箱周/招募周周常奖励） */
export const WEEK_GOLD_BONUS = {
  黑市周: 0,
  招募周: 14000,
  宝箱周: 30000,
};

/**
 * 活动内资源返还估算（以 1026 档为基准线性折算）
 * 招募：开道具约 550 + 钓鱼约 170
 * 宝箱积分：开道具约 10500 + 钓鱼约 10400
 * 金砖：道具约 11 万 + 7 天罐子 1.4 万 + 宝箱任务 7 万 + 月任务 0.6 万 + 周常奖励
 * 鱼竿：钓鱼返还约 11.11%
 */
export const RETURN_RATES = {
  recruitFromItems: 550 / 1026,
  recruitFromFishing: 170 / 1600,
  chestFromItems: 10500 / 1026,
  chestFromFishing: 10400 / 1600,
  goldFromItems: 110000,
  goldFromPots: 14000,
  goldFromChestTask: 70000,
  goldFromMonthTask: 6000,
  rodFromFishing: 0.1111,
};

/** 资源获取途径说明（展示在卡片备注里） */
export const ACQUISITION = {
  recruit: [
    "咸将塔：每 10 层 10~30 个（200 层后 30 个/10 层）",
    "图鉴：每 50 微星一次奖励，第三份常为招募令",
    "每日黑市：约 200 金砖/个，打折更低",
    "招募周：每轮 400 抽返还约 40 个",
  ],
  chest: [
    "黑市：青铜 ≤200 金砖、铂金 ≤500 金砖（≈10 金砖/分）",
    "梦境商店：青铜 90 金砖（≈9 金砖/分）",
    "挂机：满 8 小时 5 秒领，约 3 木 + 2 青铜（≈23 分）",
    "推图 / 咸王 / 俱乐部 BOSS / 竞技场结算",
  ],
  rod: [
    "黑市：400 金砖/竿，低于 400 的打折竿必买",
    "梦境高级商人：10 竿 / 3000 金砖（300 金砖/竿）",
    "金砖直购：约 646 金砖/竿（补金砖消耗时使用）",
    "钓鱼返还：每 100 竿约返 11 竿",
  ],
  gold: [
    "盐罐：每日 20 次，约 1200~1600 金砖/天（金 160~300、银 100~160、铜 40~60）",
    "盐场排名 / 竞技场 / 俱乐部 BOSS",
    "宝箱周：每轮约 7500 金砖",
    "挂机与日常活跃奖励",
  ],
  pot: [
    "客厅盐罐：每日上限 20 次，金罐 270 分钟 / 银罐 50 分钟 / 铜罐 15 分钟",
    "活动期盐罐掉活动道具，每日各品质上限 1000",
    "60 次任务：按每日 20 次计，3 天可完成",
  ],
};

/** 每日可获取量参考（保守值，用于判断缺口能否补上） */
export const DAILY_CAPACITY = {
  recruit: 30,
  chest: 300,
  rod: 25,
  gold: 1500,
  pot: POT_DAILY_LIMIT,
};

/** 默认每日金砖收入（盐罐每日 20 次，保守 1500） */
export const DEFAULT_DAILY_GOLD = 1500;

/**
 * 图鉴微星 → 招募令
 *
 * 图鉴每 50 微星领一次奖励，每 3 次奖励中有 1 次是招募令，单次约 25 个
 * （社区口径：图鉴 300 微星 ≈ 50 招募令）。
 *
 * 消耗活动期间用招募、开宝箱会大量升星，微星继续增长并触发图鉴奖励。
 * 微星越接近上限，可新增的图鉴奖励越少，因此按“剩余微星空间”折算活动内返还：
 *   图鉴返还招募令 ≈ (1 - 当前微星 / 4600) × 120
 */
export const BOOK_REWARD = {
  starsPerReward: 50,
  rewardsPerRecruit: 3,
  recruitPerReward: 25,
  starCap: 4600,
  eventRecruitMax: 120,
};

/** 图鉴微星总量可换取的招募令（长期累计，已领取的部分不会重复给） */
export function bookRecruitBonus(stars) {
  const value = Number(stars) || 0;
  if (value <= 0) return 0;
  const step = BOOK_REWARD.starsPerReward * BOOK_REWARD.rewardsPerRecruit;
  return Math.floor(value / step) * BOOK_REWARD.recruitPerReward;
}

/** 活动期间靠升星推进图鉴、预计还能拿到的招募令（低微星更多） */
export function bookEventRecruit(stars) {
  const value = Math.max(0, Math.min(BOOK_REWARD.starCap, Number(stars) || 0));
  const remainRatio = 1 - value / BOOK_REWARD.starCap;
  return Math.round(remainRatio * BOOK_REWARD.eventRecruitMax);
}

/**
 * 宝箱开箱循环：开箱会返箱子，消耗 100000 积分实际只需一半左右的库存积分。
 * 0.5 为保守口径（社区实测 0.43~0.5，取高值留余量）。
 */
export const CHEST_STOCK_RATIO = 0.5;

/** 宝箱一轮 ≈ 3400 库存积分（8000 分消耗，开箱返还后；社区实测 3340~3440） */
export const CHEST_POINTS_PER_ROUND = 3400;

/**
 * 活动期用金砖直购鱼竿的数量（社区常用 600 杆，约 38.8 万金砖）。
 * 这部分会同时完成“金砖消耗”任务，因此鱼竿的库存储备可以少一些。
 */
export const ROD_EVENT_DIRECT = 600;
export const ROD_DIRECT_PRICE = 646;

/**
 * 图鉴档位 → 入场（需囤）目标
 *
 * 社区口径：图鉴微星越高，图鉴奖励（升星→微星→每 50 微星一次奖励）剩余越少，
 * 自己能拿到的一次性资源越少，因此需要囤得更多。
 *
 * 单位：招募令 / 黄金鱼竿 / 宝箱轮次（1 轮 ≈ 3400 库存积分）/ 金砖
 */
export const BOOK_TIER_TARGETS = [
  {
    key: "low",
    label: "图鉴 < 2000",
    maxStar: 2000,
    recruit: 2500,
    rodMin: 600,
    rodMax: 700,
    chestRounds: 8.5,
    gold: 180000,
  },
  {
    key: "mid",
    label: "图鉴 2000-3000",
    maxStar: 3000,
    recruit: 2800,
    rodMin: 700,
    rodMax: 700,
    chestRounds: 9,
    gold: 200000,
  },
  {
    key: "high",
    label: "图鉴 > 3000",
    maxStar: Number.POSITIVE_INFINITY,
    recruit: 3300,
    rodMin: 750,
    rodMax: 750,
    chestRounds: 10,
    gold: 250000,
  },
];

export const BOOK_TIER_MAP = BOOK_TIER_TARGETS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

/**
 * 按微星取图鉴档位
 * @param {number} stars 图鉴微星
 * @param {boolean} known 是否识别到微星（未识别时按最高档保守计算）
 * @param {string} [override] 手动指定档位 low/mid/high
 */
export function getBookTier(stars, known = true, override = "auto") {
  const tier = BOOK_TIER_MAP[override];
  if (tier) {
    return {
      ...tier,
      chestPoints: Math.round(tier.chestRounds * CHEST_POINTS_PER_ROUND),
    };
  }
  if (!known) {
    const fallback = BOOK_TIER_MAP.high;
    return {
      ...fallback,
      label: "图鉴未识别（按 >3000 保守）",
      chestPoints: Math.round(fallback.chestRounds * CHEST_POINTS_PER_ROUND),
    };
  }
  const value = Math.max(0, Number(stars) || 0);
  const matched =
    BOOK_TIER_TARGETS.find((item) => value < item.maxStar) ||
    BOOK_TIER_TARGETS[BOOK_TIER_TARGETS.length - 1];
  return {
    ...matched,
    chestPoints: Math.round(matched.chestRounds * CHEST_POINTS_PER_ROUND),
  };
}

/**
 * 黑市 / 直购商品
 * price：金砖单价；amount：一次购买得到的资源量（与 RESOURCES 单位一致）
 * perDay：每日可买次数上限（按刷新 2 次估算，VIP 更高可自行上调）
 */
export const MARKET_ITEMS = [
  {
    key: "rod_black",
    label: "黑市黄金鱼竿",
    resource: "rod",
    price: 400,
    amount: 1,
    perDay: 10,
    note: "2000 金砖 / 5 竿，低于 400 的打折竿优先",
  },
  {
    key: "chest_bronze",
    label: "黑市青铜宝箱",
    resource: "chest",
    price: 100,
    amount: 10,
    perDay: 4,
    note: "200 金砖 / 2 个，10 金砖每积分",
  },
  {
    key: "chest_platinum",
    label: "黑市铂金宝箱",
    resource: "chest",
    price: 500,
    amount: 50,
    perDay: 2,
    note: "500 金砖 / 1 个，10 金砖每积分",
  },
  {
    key: "recruit",
    label: "黑市招募令",
    resource: "recruit",
    price: 250,
    amount: 1,
    perDay: 10,
    note: "2500 金砖 / 10 个，仅金砖充裕时补",
  },
  {
    key: "rod_direct",
    label: "金砖直购鱼竿",
    resource: "rod",
    price: 646,
    amount: 1,
    perDay: 200,
    unlimited: true,
    note: "缺鱼竿又缺金砖消耗时使用",
  },
  {
    key: "chest_gold",
    label: "黑市黄金宝箱",
    resource: "chest",
    price: 300,
    amount: 20,
    perDay: 2,
    note: "300 金砖 / 1 个，15 金砖每积分，最后考虑",
  },
];

export const MARKET_ITEM_MAP = MARKET_ITEMS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

/** 默认购买优先级 */
export const DEFAULT_MARKET_PRIORITY = [
  "rod_black",
  "chest_bronze",
  "chest_platinum",
  "recruit",
  "rod_direct",
  "chest_gold",
];
