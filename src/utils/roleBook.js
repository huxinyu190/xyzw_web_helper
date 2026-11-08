/**
 * 图鉴微星识别
 *
 * role_getroleinfo 没有独立的图鉴读取命令，图鉴数据只能从 role 里解析。
 * 游戏内图鉴展示的是「微星」：每次升星累积，每 50 点领一次奖励（上限 4600）。
 *
 * 解析顺序：
 *  1. 手动覆盖值（游戏里读到的微星，存 localStorage，最可靠）
 *  2. 显式字段：bookPoint / bookStar / microStar / bookScore …
 *  3. statistics / statisticsTime 里的 book:point / book:star …
 *  4. role.book / bookInfo / heroBook / handbook 内的 point/star/score/value（或直接是数字）
 *  5. 深度扫描：键路径包含 book/handbook/collection 与 point/star/score/micro 的数值
 *  6. 兜底：图鉴收录计数（bookCount / collectionCount）
 *
 * 全部未命中时返回 null（UI 显示 “-”），并把候选字段列出来，方便在下拉里手动选。
 */

const POINT_KEYS = [
  "bookPoint",
  "bookStar",
  "bookScore",
  "microStar",
  "microstar",
  "microStarCount",
  "bookMicroStar",
];

const POINT_STAT_KEYS = [
  "book:point",
  "book:star",
  "book:score",
  "book:microstar",
  "book:micro:star",
  "last:book:point",
  "last:book:star",
];

const COUNT_KEYS = ["bookCount", "heroBookCount", "collectionCount"];

const BOOK_CONTAINERS = [
  "book",
  "bookInfo",
  "heroBook",
  "handbook",
  "collection",
  "tujian",
];

function toNumber(value) {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function readStat(statistics, key) {
  if (!statistics) return null;
  try {
    if (typeof statistics.get === "function") {
      const value = toNumber(statistics.get(key));
      if (value != null) return value;
    }
    if (Object.prototype.hasOwnProperty.call(statistics, key)) {
      return toNumber(statistics[key]);
    }
  } catch {
    return null;
  }
  return null;
}

function pickFromContainer(container) {
  if (container == null) return null;
  const direct = toNumber(container);
  if (direct != null) return direct;
  if (typeof container !== "object") return null;
  return (
    toNumber(container.point) ??
    toNumber(container.star) ??
    toNumber(container.score) ??
    toNumber(container.value) ??
    toNumber(container.count)
  );
}

/**
 * 深度收集候选：路径里同时出现 book 类关键词与 point/star/score/micro 的数值
 * 返回 [{ path, value }]，最多 12 条
 */
export function findBookCandidates(role, limit = 12) {
  const results = [];
  const seen = new Set();

  const walk = (node, path, depth) => {
    if (results.length >= limit || node == null || depth > 3) return;
    if (typeof node === "number" || typeof node === "string") {
      const value = toNumber(node);
      if (value == null) return;
      if (!/book|handbook|collection|tujian/i.test(path)) return;
      if (!/point|star|score|micro/i.test(path)) return;
      if (seen.has(path)) return;
      seen.add(path);
      results.push({ path, value });
      return;
    }
    if (typeof node !== "object") return;

    if (typeof node.get === "function") {
      try {
        for (const key of POINT_STAT_KEYS) {
          const value = readStat(node, key);
          if (value != null && !seen.has(`statistics.${key}`)) {
            seen.add(`statistics.${key}`);
            results.push({ path: `statistics.${key}`, value });
          }
        }
      } catch {
        // ignore
      }
      return;
    }

    const entries = Array.isArray(node)
      ? node.map((item, index) => [String(index), item])
      : Object.entries(node);
    for (const [key, value] of entries) {
      if (/^\d+$/.test(key) && Array.isArray(node)) continue;
      walk(value, path ? `${path}.${key}` : key, depth + 1);
    }
  };

  walk(role, "", 0);
  return results;
}

/**
 * @param {any} role role_getroleinfo 返回里的 role 对象
 * @param {number} [override] 手动填写/选择的微星值（0 表示不覆盖）
 * @returns {{count: number|null, scope: string, label: string, candidates: Array<{path: string, value: number}>}} 微星值、来源标识、展示名与候选字段
 */
export function resolveBookInfo(role, override = 0) {
  const candidates = role ? findBookCandidates(role) : [];
  const manual = toNumber(override);
  if (manual != null && manual > 0) {
    return {
      count: manual,
      scope: "manual",
      label: "图鉴微星",
      candidates,
    };
  }

  if (!role) {
    return { count: null, scope: "unknown", label: "图鉴微星", candidates };
  }

  for (const key of POINT_KEYS) {
    const value = toNumber(role[key]);
    if (value != null && value >= 0) {
      return {
        count: value,
        scope: "bookPoint",
        label: "图鉴微星",
        candidates,
      };
    }
  }

  for (const key of POINT_STAT_KEYS) {
    const value =
      readStat(role.statistics, key) ?? readStat(role.statisticsTime, key);
    if (value != null && value >= 0) {
      return {
        count: value,
        scope: "bookPoint",
        label: "图鉴微星",
        candidates,
      };
    }
  }

  for (const key of BOOK_CONTAINERS) {
    const value = pickFromContainer(role[key]);
    if (value != null && value >= 0) {
      return {
        count: value,
        scope: "bookPoint",
        label: "图鉴微星",
        candidates,
      };
    }
  }

  if (candidates.length > 0) {
    return {
      count: candidates[0].value,
      scope: "bookPoint",
      label: "图鉴微星",
      candidates,
    };
  }

  for (const key of COUNT_KEYS) {
    const value = toNumber(role[key]);
    if (value != null && value >= 0) {
      return { count: value, scope: "bookCount", label: "图鉴数", candidates };
    }
  }

  return { count: null, scope: "unknown", label: "图鉴微星", candidates };
}

export const BOOK_SCOPE_HINT = {
  manual: "手动填写的图鉴微星",
  bookPoint: "图鉴微星（每 50 点领一次奖励）",
  bookCount: "图鉴收录数量（未取到微星字段）",
  unknown: "未识别到图鉴微星字段，可在采购设置里手动填写",
};
