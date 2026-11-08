import { useLocalStorage } from "@vueuse/core";
import { computed, ref, watchEffect } from "vue";
import { useBookStar } from "@/composables/useBookStar";
import { useTokenStore } from "@/stores/tokenStore";
import {
  DEFAULT_DAILY_GOLD,
  DEFAULT_MARKET_PRIORITY,
  MARKET_ITEMS,
  PRESET_MAP,
  PRESETS,
  RESOURCES,
} from "@/utils/goldFish/constants";
import { planMarket } from "@/utils/goldFish/market";
import {
  computePlan,
  getFestivalInfo,
  listFestivalOptions,
} from "@/utils/goldFish/plan";
import { resolveBookInfo } from "@/utils/roleBook";
import {
  getChestPoints,
  getItemCount,
  readRoleGold,
  readRoleItems,
} from "@/utils/roleItems";

function mergePriority(stored) {
  const list = Array.isArray(stored)
    ? stored.filter((key) => MARKET_ITEMS.some((item) => item.key === key))
    : [];
  for (const item of MARKET_ITEMS) {
    if (!list.includes(item.key)) list.push(item.key);
  }
  return list;
}

/**
 * 金鱼活动规划数据源
 * - 档位 / 节日 / 采购优先级 / 每日金砖收入 持久化到 localStorage
 * - 现有资源与图鉴微星实时取自 role_getroleinfo
 */
export function useGoldFishPlan() {
  const tokenStore = useTokenStore();

  const presetKey = useLocalStorage("goldfish:preset", "safe");
  const festivalKey = useLocalStorage("goldfish:festival", "newYear");
  const dailyIncome = useLocalStorage(
    "goldfish:dailyIncome",
    DEFAULT_DAILY_GOLD,
  );
  const marketPriority = useLocalStorage(
    "goldfish:marketPriority",
    DEFAULT_MARKET_PRIORITY,
  );
  const marketEnabled = useLocalStorage("goldfish:marketEnabled", {
    rod_black: true,
    chest_bronze: true,
    chest_platinum: true,
    recruit: true,
    rod_direct: true,
    chest_gold: false,
  });
  const now = ref(new Date());

  const role = computed(() => tokenStore.gameData?.roleInfo?.role || null);
  const hasRole = computed(() => Boolean(role.value));

  const stock = computed(() => {
    const items = readRoleItems(role.value);
    return {
      recruit: getItemCount(items, 1001),
      chest: getChestPoints(items),
      rod: getItemCount(items, 1012),
      gold: readRoleGold(role.value),
      pot: 0,
    };
  });

  const { bookStarOverride, bookTierOverride, setBookStar, setBookTier } =
    useBookStar();

  // 图鉴微星：自动解析优先，失败时可手动填写（localStorage 共用）
  const bookInfo = computed(() =>
    resolveBookInfo(role.value, bookStarOverride.value),
  );
  const microStar = computed(() => {
    const scope = bookInfo.value.scope;
    if (scope !== "bookPoint" && scope !== "manual") return 0;
    return bookInfo.value.count || 0;
  });
  // 是否识别到微星（未识别时规划按最高档保守计算）
  const bookKnown = computed(
    () =>
      bookInfo.value.scope === "bookPoint" || bookInfo.value.scope === "manual",
  );
  const bookTier = computed(() => bookTierOverride.value);

  // 开发环境下若取不到微星字段，打印一次 role 顶层键与候选，便于定位协议字段
  let bookWarned = false;
  watchEffect(() => {
    if (!import.meta.env.DEV || bookWarned) return;
    if (!role.value || bookInfo.value.scope !== "unknown") return;
    bookWarned = true;
    console.warn(
      "[图鉴微星] 未识别到微星字段，role 顶层键：",
      Object.keys(role.value),
      "候选：",
      bookInfo.value.candidates,
    );
  });

  const festivalOptions = computed(() => listFestivalOptions(now.value));
  const festival = computed(() =>
    getFestivalInfo(festivalKey.value, now.value),
  );

  // 活动进行中：普通道具 5261 / 金色道具 5262（与消耗活动进度组件一致）
  const live = computed(() => {
    const items = readRoleItems(role.value);
    const raw = tokenStore.gameData?.commonActivityInfo;
    const info =
      raw?.activity?.commonActivityInfo || raw?.commonActivityInfo || raw;
    const hasActivity =
      info &&
      typeof info === "object" &&
      Object.values(info).some((activity) => {
        if (!activity?.task) return false;
        return Object.keys(activity.task).some((key) => {
          const id = Number(key);
          return id >= 1 && id <= 5;
        });
      });
    const normal = getItemCount(items, 5261);
    const golden = getItemCount(items, 5262);
    return {
      normal,
      golden,
      hasData: Boolean(hasActivity) || normal > 0 || golden > 0,
    };
  });

  const plan = computed(() =>
    computePlan({
      presetKey: presetKey.value,
      festivalKey: festivalKey.value,
      stock: stock.value,
      microStar: microStar.value,
      bookKnown: bookKnown.value,
      bookTier: bookTier.value,
      now: now.value,
    }),
  );

  const priority = computed(() => mergePriority(marketPriority.value));

  const market = computed(() =>
    planMarket({
      plan: plan.value,
      currentGold: stock.value.gold,
      dailyIncome: dailyIncome.value,
      priority: priority.value,
      enabled: marketEnabled.value,
    }),
  );

  const presetOptions = computed(() =>
    PRESETS.map((preset) => ({
      key: preset.key,
      label: preset.label,
      desc: preset.desc,
      props: preset.props,
      rate: preset.communityRate,
    })),
  );

  const marketItems = computed(() =>
    priority.value.map((key) => {
      const item = MARKET_ITEMS.find((entry) => entry.key === key);
      const resource = RESOURCES.find((entry) => entry.key === item?.resource);
      return {
        ...item,
        unit: resource?.unit || "",
        enabled: marketEnabled.value[key] !== false,
      };
    }),
  );

  const setPresetKey = (value) => {
    if (PRESET_MAP[value]) presetKey.value = value;
  };

  const setFestivalKey = (value) => {
    festivalKey.value = value;
    now.value = new Date();
  };

  const toggleMarketItem = (key, value) => {
    marketEnabled.value = { ...marketEnabled.value, [key]: value };
  };

  const moveMarketItem = (key, direction) => {
    const list = [...priority.value];
    const index = list.indexOf(key);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    marketPriority.value = list;
  };

  const refresh = () => {
    now.value = new Date();
  };

  return {
    role,
    hasRole,
    stock,
    now,
    live,
    bookInfo,
    microStar,
    bookStarOverride,
    setBookStar,
    presetKey,
    festivalKey,
    dailyIncome,
    bookTier,
    setBookTier,
    presetOptions,
    festivalOptions,
    festival,
    plan,
    market,
    marketItems,
    priority,
    setPresetKey,
    setFestivalKey,
    toggleMarketItem,
    moveMarketItem,
    refresh,
  };
}
