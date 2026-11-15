/**
 * 游戏客户端版本相关的纯逻辑（无副作用，便于单测）
 *
 * 背景：
 * 游戏启动时会向官方 manifest 接口请求资源清单，请求参数里带一个“客户端版本”：
 *   POST https://xxz-xyzw.hortorgames.com/login/manifest?platform=hortor&version=<版本>-android
 * 服务端按版本返回不同的 bundleVers。旧版本拿到的清单里没有新活动的资源包
 * （例如 ui_fiveYearSpecialActivity、ui_legionWarCupAd_*），于是新活动进不去。
 *
 * 这里负责：版本号解析/比较、探测候选版本、解析清单、对比资源包差异。
 */

/** localStorage：当前使用的游戏客户端版本 */
export const GAME_CLIENT_VERSION_KEY = "xyzw:gameClientVersion";

/** localStorage：上次检查结果（用于回显） */
export const GAME_VERSION_INFO_KEY = "xyzw:gameVersionInfo";

/** 与 public/game/main.2a00e.js 里的兜底值保持一致 */
export const DEFAULT_GAME_CLIENT_VERSION = "0.32.0";

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export const MANIFEST_BASE_URL =
  "https://xxz-xyzw.hortorgames.com/login/manifest";

/** 规范化版本号：只接受 x.y.z，其余返回空串 */
export function normalizeVersion(value) {
  const text = String(value ?? "").trim();
  return VERSION_PATTERN.test(text) ? text : "";
}

/** 版本号 → 数字段，非法返回 null */
export function parseVersion(value) {
  const text = normalizeVersion(value);
  if (!text) return null;
  const match = VERSION_PATTERN.exec(text);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/** 比较两个版本，a > b 返回正数，相等返回 0，非法版本视为最小 */
export function compareVersions(a, b) {
  const left = parseVersion(a) || { major: -1, minor: -1, patch: -1 };
  const right = parseVersion(b) || { major: -1, minor: -1, patch: -1 };
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

/**
 * 生成待探测的更高版本。
 *
 * 官方版本并不是连续发布的（实测 0.30 / 0.31 / 0.32 / 0.35 / 0.36 / 0.37 有效，
 * 0.33 / 0.34 返回空清单），所以往后多探一段，命中哪个算哪个。
 */
export function buildProbeVersions(
  current,
  { minorSpan = 12, majorCandidates = [1, 2] } = {},
) {
  const base =
    parseVersion(current) || parseVersion(DEFAULT_GAME_CLIENT_VERSION);
  const versions = [];
  for (let step = 1; step <= minorSpan; step += 1) {
    versions.push(`${base.major}.${base.minor + step}.0`);
  }
  for (const major of majorCandidates) {
    if (major > base.major) versions.push(`${major}.0.0`);
  }
  return [...new Set(versions)];
}

export function buildManifestUrl(version) {
  const value = normalizeVersion(version) || DEFAULT_GAME_CLIENT_VERSION;
  return `${MANIFEST_BASE_URL}?platform=hortor&version=${encodeURIComponent(
    value,
  )}-android`;
}

/**
 * 解析 manifest 返回体
 * @param {any} payload 接口返回的 JSON
 * @returns {{ok: boolean, bundleCount: number, game: string, launcher: string, commitId: string, dataVers: string, bundles: Record<string, string>|null}} 解析结果，ok 为 false 表示该版本没有清单
 */
export function parseManifest(payload) {
  const empty = {
    ok: false,
    bundleCount: 0,
    game: "",
    launcher: "",
    commitId: "",
    dataVers: "",
    bundles: null,
  };
  const body = payload && typeof payload === "object" ? payload.body : null;
  if (!body || typeof body !== "object") return empty;

  let bundles = body.bundleVers;
  if (typeof bundles === "string") {
    try {
      bundles = JSON.parse(bundles);
    } catch {
      bundles = null;
    }
  }
  if (!bundles || typeof bundles !== "object" || Array.isArray(bundles)) {
    return empty;
  }

  const keys = Object.keys(bundles);
  if (keys.length === 0) return empty;

  return {
    ok: true,
    bundleCount: keys.length,
    game: typeof bundles.game === "string" ? bundles.game : "",
    launcher: typeof bundles.launcher === "string" ? bundles.launcher : "",
    commitId: typeof bundles.COMMIT_ID === "string" ? bundles.COMMIT_ID : "",
    dataVers: typeof body.dataVers === "string" ? body.dataVers : "",
    bundles,
  };
}

/**
 * 从探测结果里挑出最高且有清单的版本
 * @param {Array<{version: string, manifest: {ok: boolean}}>} results
 */
export function pickLatestVersion(results) {
  let best = null;
  for (const item of results || []) {
    if (!item || !item.manifest || !item.manifest.ok) continue;
    if (!parseVersion(item.version)) continue;
    if (!best || compareVersions(item.version, best.version) > 0) best = item;
  }
  return best;
}

/** 对比两份清单的资源包差异 */
export function diffBundles(currentBundles, latestBundles) {
  const current = currentBundles || {};
  const latest = latestBundles || {};
  const added = [];
  const removed = [];
  const changed = [];

  for (const key of Object.keys(latest)) {
    if (!Object.prototype.hasOwnProperty.call(current, key)) added.push(key);
    else if (current[key] !== latest[key]) changed.push(key);
  }
  for (const key of Object.keys(current)) {
    if (!Object.prototype.hasOwnProperty.call(latest, key)) removed.push(key);
  }

  return {
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort(),
    addedCount: added.length,
    changedCount: changed.length,
    removedCount: removed.length,
  };
}

/** 把包名转成更易读的说明（活动类包名比较长，先做轻量归类） */
export function describeBundle(name) {
  const value = String(name || "");
  if (/fiveYear|anniversary|zhouNian/i.test(value)) return "周年活动";
  if (/legionWarCupAd|legionWar/i.test(value)) return "军团战/联赛广告位";
  if (/festival|springFestival|midAutumn|dragonBoat/i.test(value))
    return "节日活动";
  if (/pearl|yuling/i.test(value)) return "鱼灵/珍珠";
  if (value.startsWith("ui_")) return "界面资源";
  if (value.startsWith("map_")) return "地图资源";
  return "其它资源";
}

/**
 * 把检查结果整理成 UI 需要的结构
 * @param {{current: string, currentManifest: object|null, latest: object|null}} input
 */
export function buildUpdateSummary({ current, currentManifest, latest }) {
  const currentVersion =
    normalizeVersion(current) || DEFAULT_GAME_CLIENT_VERSION;
  if (!latest || !latest.manifest || !latest.manifest.ok) {
    return {
      currentVersion,
      latestVersion: "",
      hasUpdate: false,
      currentInvalid: false,
      bundles: null,
      currentBundleCount: currentManifest?.bundleCount || 0,
      latestBundleCount: 0,
    };
  }

  const latestVersion = latest.version;
  const bundles =
    currentManifest && currentManifest.ok
      ? diffBundles(currentManifest.bundles, latest.manifest.bundles)
      : null;

  const versionChanged = compareVersions(latestVersion, currentVersion) > 0;
  const contentChanged = Boolean(
    bundles &&
    (bundles.addedCount > 0 ||
      bundles.changedCount > 0 ||
      bundles.removedCount > 0),
  );

  // 当前版本已被官方下线时，即使版本号更高也要切回可用版本
  const currentInvalid = !currentManifest || !currentManifest.ok;

  return {
    currentVersion,
    latestVersion,
    hasUpdate: versionChanged || contentChanged || currentInvalid,
    currentInvalid,
    bundles,
    currentBundleCount: currentManifest?.bundleCount || 0,
    latestBundleCount: latest.manifest.bundleCount,
    dataVers: latest.manifest.dataVers,
    commitId: latest.manifest.commitId,
  };
}
