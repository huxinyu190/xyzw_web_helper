import { useLocalStorage } from "@vueuse/core";
import { computed, ref } from "vue";
import {
  buildManifestUrl,
  buildProbeVersions,
  buildUpdateSummary,
  DEFAULT_GAME_CLIENT_VERSION,
  GAME_CLIENT_VERSION_KEY,
  GAME_VERSION_INFO_KEY,
  normalizeVersion,
  parseManifest,
  pickLatestVersion,
} from "@/utils/gameVersion";

/** 当前生效的游戏客户端版本（会被游戏页读取，见 public/game/xyzw-sound.js） */
export const gameClientVersion = useLocalStorage(
  GAME_CLIENT_VERSION_KEY,
  DEFAULT_GAME_CLIENT_VERSION,
);

/** 上次检查结果，仅用于回显 */
export const lastGameVersionInfo = useLocalStorage(GAME_VERSION_INFO_KEY, null);

const REQUEST_TIMEOUT = 8000;

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

/** 把所有已打开的游戏 iframe 里的版本号同步过去 */
export function broadcastClientVersion(version, { reload = false } = {}) {
  if (typeof document === "undefined") return;
  const payload = { type: "xyzw:version", version };
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
  const state = ref("idle"); // idle | checking | done | error
  const errorMessage = ref("");
  const result = ref(null);
  const checkedAt = ref(0);

  const checking = computed(() => state.value === "checking");

  /** 当前版本是否已失效（服务端不再返回清单） */
  const currentInvalid = computed(() => Boolean(result.value?.currentInvalid));

  async function checkForUpdate({ silent = false } = {}) {
    if (state.value === "checking") return result.value;
    state.value = "checking";
    errorMessage.value = "";
    if (!silent) result.value = null;

    const current =
      normalizeVersion(gameClientVersion.value) || DEFAULT_GAME_CLIENT_VERSION;
    const candidates = [current, ...buildProbeVersions(current)];

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
        settled.find((item) => item.version === current)?.manifest || null;
      const latest = pickLatestVersion(settled);

      if (!latest) {
        throw new Error("官方资源清单暂时不可用，请稍后再试");
      }

      const summary = buildUpdateSummary({
        current,
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

  /** 切换到指定版本（并通知已打开的游戏） */
  function applyVersion(version, { reload = true } = {}) {
    const value = normalizeVersion(version);
    if (!value) return false;
    gameClientVersion.value = value;
    broadcastClientVersion(value, { reload });
    return true;
  }

  /** 一键更新到检测到的最新版本 */
  function applyLatest() {
    const latestVersion = result.value?.latestVersion;
    if (!latestVersion) return false;
    return applyVersion(latestVersion);
  }

  /** 恢复默认版本 */
  function resetVersion() {
    return applyVersion(DEFAULT_GAME_CLIENT_VERSION);
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
