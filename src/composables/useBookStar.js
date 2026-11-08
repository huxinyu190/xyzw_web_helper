import { useLocalStorage } from "@vueuse/core";

/**
 * 图鉴微星手动覆盖值（0 = 自动识别）
 *
 * 协议里字段名不固定，自动解析失败时可以在「金鱼活动 → 采购设置」里
 * 直接填游戏内图鉴微星，身份牌与规划会共用这个值。
 */
export const bookStarOverride = useLocalStorage("goldfish:bookStar", 0);

/** 图鉴档位手动指定：auto / low / mid / high */
export const bookTierOverride = useLocalStorage("goldfish:bookTier", "auto");

export function useBookStar() {
  const setBookStar = (value) => {
    const num = Number(value);
    bookStarOverride.value = Number.isFinite(num) && num > 0 ? num : 0;
  };
  const setBookTier = (value) => {
    bookTierOverride.value = ["auto", "low", "mid", "high"].includes(value)
      ? value
      : "auto";
  };
  return {
    bookStarOverride,
    bookTierOverride,
    setBookStar,
    setBookTier,
  };
}
