import { useLocalStorage } from "@vueuse/core";
import { computed, ref } from "vue";
import {
  buildManifestUrl,
  buildProbeVersions,
  buildUpdateSummary,
  DEFAULT_GAME_CLIENT_VERSION,
  DEFAULT_GAME_CODE_VERSION,
  GAME_CLIENT_VERSION_KEY,
  GAME_CODE_VERSION_KEY,
  GAME_VERSION_INFO_KEY,
  normalizeVersion,
  parseManifest,
  pickLatestVersion,
} from "@/utils/gameVersion";

/**
 * 两个版本号，必须成对使用：
 * - 资源清单版本（0.3x）：决定向官方请求哪一份 bundleVers
 * - 游戏代码版本（2.5x.x）：game-defines 里的 CODE_VERSION，官方用它判断客户端是否最新
 *
 * 两者来自同一份清单：清单里的 codeVersion 就是游戏代码版本。
 * 混搭会出现「版本不一致，请重启」的弹窗，所以更新时必须一起写。
 */

/** 资源清单版本 */
export const gameClientVersion = useLocalStorage(
  GAME_CLIENT_VERSION_KEY,
  DEFAULT_GAME_CLIENT_VERSION,
);

/** 游戏代码版本（形如 2.54.2） */
export const gameCodeVersion = useLocalStorage(
  GAME_CODE_VERSION_KEY,
  DEFAULT_GAME_CODE_VERSION,
);

/** 上次检查结果，仅用于回显 */
export const lastGameVersionInfo = useLocalStorage(GAME_VERSION_INFO_KEY, null);

const REQUEST_TIMEOUT = 8000;
let migrated = false;

/**
 * 老版本只存过资源版本（且与当前代码版本不匹配），统一升级成默认的一对，
 * 避免出现「清单是 0.32、代码版本是 2.54.2」的错配。
 */
function ensureVersionPair() {
  if (migrated) return;
  migrated = true;
  try {
    const hasCodeVersion = Boolean(localStorage.getItem(GAME_CODE_VERSION_KEY));
    if (!hasCodeVersion) {
      gameClientVersion.value = DEFAULT_GAME_CLIENT_VERSION;
      gameCodeVersion.value = DEFAULT_GAME_CODE_VERSION;
    }
  } catch {
    // 无 localStorage（SSR / 隐私模式）时忽略
  }
}

/** 请求某个版本的资源清单 */
export async function fetchManifest(
  version,
  { timeout = REQUEST_TIMEOUT, fetchImpl } = {},
) {
  const doFetch = fetchImpl || globalThis.fetch;
  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), timeout)
    : null;

  try {
    const response = await doFetch(buildManifestUrl(version), {
      method: "POST",
      headers: {
        Accept: "application/json,text/plain,*/*",
        "Content-Type": "application/json;charset=UTF-8",
      },
      body: "",
      cache: "no-store",
      signal: controller ? controller.signal : undefined,
    });
    if (!response || !response.ok) {
      throw new Error(`HTTP ${response ? response.status : "无响应"}`);
    }
    const payload = await response.json();
    return parseManifest(payload);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 把版本信息同步给已打开的游戏 iframe，可选立即刷新 */
export function broadcastClientVersion(
  clientVersion,
  codeVersion,
  { reload = false } = {},
) {
  if (typeof document === "undefined") return;
  const payload = {
    type: "xyzw:version",
    version: clientVersion,
    gameVersion: codeVersion,
  };
  document.querySelectorAll("iframe").forEach((frame) => {
    try {
      frame.contentWindow?.postMessage(payload, window.location.origin);
      if (reload && /\/game\//.test(frame.getAttribute("src") || "")) {
        frame.contentWindow?.location.reload();
      }
    } catch {
      // ignore
    }
  });
}

/**
 * 组合式：检查 / 应用游戏版本更新
 */
export function useGameVersion() {
  ensureVersionPair();

  const state = ref("idle"); // idle | checking | done | error
  const errorMessage = ref("");
  const result = ref(null);
  const checkedAt = ref(0);

  const checking = computed(() => state.value === "checking");
  const currentInvalid = computed(() => Boolean(result.value?.currentInvalid));

  async function checkForUpdate({ silent = false } = {}) {
    if (state.value === "checking") return result.value;
    state.value = "checking";
    errorMessage.value = "";
    if (!silent) result.value = null;

    const currentClient =
      normalizeVersion(gameClientVersion.value) || DEFAULT_GAME_CLIENT_VERSION;
    const currentCode =
      normalizeVersion(gameCodeVersion.value) || DEFAULT_GAME_CODE_VERSION;
    const candidates = [currentClient, ...buildProbeVersions(currentClient)];

    try {
      const settled = await Promise.all(
        candidates.map(async (version) => {
          try {
            return { version, manifest: await fetchManifest(version) };
          } catch {
            return { version, manifest: null };
          }
        }),
      );

      const currentManifest =
        settled.find((item) => item.version === currentClient)?.manifest ||
        null;
      // 按清单里的 codeVersion 选“最新”，而不是按客户端版本号
      const latest = pickLatestVersion(settled);

      if (!latest) {
        throw new Error("官方资源清单暂时不可用，请稍后再试");
      }

      const summary = buildUpdateSummary({
        currentCodeVersion: currentCode,
        currentClientVersion: currentClient,
        currentManifest,
        latest,
      });

      checkedAt.value = Date.now();
      result.value = {
        ...summary,
        checkedAt: checkedAt.value,
      };
      state.value = "done";
      lastGameVersionInfo.value = result.value;
      return result.value;
    } catch (error) {
      state.value = "error";
      errorMessage.value = error?.message || "检查更新失败";
      return null;
    }
  }

  /** 同时切换资源清单版本与游戏代码版本（并通知已打开的游戏） */
  function applyVersion(clientVersion, codeVersion, { reload = true } = {}) {
    const client = normalizeVersion(clientVersion);
    const code = normalizeVersion(codeVersion);
    if (!client || !code) return false;
    gameClientVersion.value = client;
    gameCodeVersion.value = code;
    broadcastClientVersion(client, code, { reload });
    return true;
  }

  /** 一键更新到检测到的最新版本 */
  function applyLatest() {
    const latestClient = result.value?.latestClientVersion;
    const latestCode = result.value?.latestVersion;
    if (!latestClient || !latestCode) return false;
    return applyVersion(latestClient, latestCode);
  }

  /** 恢复默认版本 */
  function resetVersion() {
    return applyVersion(DEFAULT_GAME_CLIENT_VERSION, DEFAULT_GAME_CODE_VERSION);
  }

  return {
    state,
    checking,
    errorMessage,
    result,
    checkedAt,
    currentInvalid,
    checkForUpdate,
    applyVersion,
    applyLatest,
    resetVersion,
  };
}
