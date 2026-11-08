/**
 * 角色物品解析工具（身份牌 / 金鱼活动共用）
 *
 * role.items 可能是：
 *  - 数组：[{ id | itemId, num | count | quantity }]
 *  - 对象：{ "1001": 12 } 或 { "1001": { num: 12 } }
 *  - 对象数组混合：{ "x": { itemId: 1001, quantity: 12 } }
 */
import { CHEST_POINTS } from "./goldFish/constants.js";

export function readRoleItems(role) {
  if (!role) return null;
  return (
    role.items || role.itemList || role.bag?.items || role.inventory || null
  );
}

export function readRoleGold(role) {
  const value = Number(role?.diamond ?? role?.goldDiamond ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function getItemCount(items, id) {
  if (!items) return 0;

  if (Array.isArray(items)) {
    const found = items.find(
      (item) => Number(item?.id ?? item?.itemId) === Number(id),
    );
    if (!found) return 0;
    return Number(found.num ?? found.count ?? found.quantity ?? 0) || 0;
  }

  const node = items[String(id)] ?? items[id];
  if (node == null) {
    const match = Object.values(items).find(
      (value) => Number(value?.itemId ?? value?.id) === Number(id),
    );
    if (!match) return 0;
    return Number(match.num ?? match.count ?? match.quantity ?? 0) || 0;
  }
  if (typeof node === "number") return node;
  if (typeof node === "object") {
    return Number(node.num ?? node.count ?? node.quantity ?? 0) || 0;
  }
  return Number(node) || 0;
}

/** 现有宝箱折算成宝箱积分（木质 1 / 青铜 10 / 黄金 20 / 铂金 50） */
export function getChestPoints(items) {
  return Object.entries(CHEST_POINTS).reduce((sum, [itemId, points]) => {
    if (!points) return sum;
    return sum + getItemCount(items, Number(itemId)) * points;
  }, 0);
}
