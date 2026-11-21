const configsByVersion = new Map();
const activeTokenRuns = new Set();

/** 官方静态资源配置根地址 */
const DATA_CDN = "https://xxz-xyzw-res.hortorgames.com";
/** 服务器下发的「任务配置版本 -> 实际可读的版本」映射（官方会清理旧版本目录） */
const resolvedVersionByServer = new Map();
/** 官方 data/version.json 公布的当前版本（进程内缓存，失败不缓存） */
let publishedVersion = null;
/** config.json 约 15 MB，慢网下 30 秒容易超时 */
const CONFIG_TIMEOUT_MS = 60000;
const VERSION_TIMEOUT_MS = 10000;

// The official HangUpInviteDialog exposes four help slots, independently of daily tasks.
const HANG_UP_HELP_SLOTS = 4;

/**
 * Keep daily and hang-up operations for one account from overlapping.
 * @param {string} tokenId Account identity.
 * @param {Function} execute Operation to execute once.
 * @returns {Promise<*>} The operation result; the lock is always released.
 */
export async function runWithDailyTaskLock(tokenId, execute) {
  if (activeTokenRuns.has(tokenId))
    throw new Error("该账号的日常或挂机任务正在执行中");
  activeTokenRuns.add(tokenId);
  try {
    return await execute();
  } finally {
    activeTokenRuns.delete(tokenId);
  }
}

/**
 * Count unexpired help slots using the official client's checkFriendTimeout order.
 * @param {object} role Fresh role_getroleinfo data, including hangUp.helpFriend.
 * @param {number} serverTime Server response timestamp in milliseconds.
 * @returns {{active: number, remaining: number}} Occupied slots and slots to fill.
 * @throws {Error} When the server snapshot or server clock cannot be trusted.
 */
export function getHangUpState(role, serverTime) {
  const hangUp = role?.hangUp;
  const helpers = hangUp?.helpFriend;
  if (
    !Number.isFinite(serverTime) ||
    serverTime <= 0 ||
    !Number.isFinite(hangUp?.checkTime) ||
    hangUp.checkTime < 0 ||
    !Array.isArray(helpers) ||
    helpers.length > HANG_UP_HELP_SLOTS ||
    helpers.some(
      (helper) =>
        !Number.isInteger(helper?.helpTime) ||
        helper.helpTime <= 0 ||
        !Number.isInteger(helper.slot) ||
        helper.slot < 0 ||
        helper.slot >= HANG_UP_HELP_SLOTS,
    ) ||
    new Set(helpers.map((helper) => helper.slot)).size !== helpers.length
  ) {
    const error = new Error("服务器挂机槽位或时间不完整，不能判断加钟状态");
    error.hangUpStateUnavailable = true;
    throw error;
  }
  let elapsed = Math.max(serverTime / 1000 - hangUp.checkTime, 0);
  let active = 0;
  for (const helper of helpers) {
    if (elapsed >= helper.helpTime) elapsed -= helper.helpTime;
    else active++;
  }
  return { active, remaining: HANG_UP_HELP_SLOTS - active };
}

/**
 * Fill only the server's empty help slots, then verify with one fresh snapshot.
 * No local completion cache or automatic write retry is used.
 * @param {object} options Transport, account, cancellation, logging and read/send hooks.
 * @param {object} options.tokenStore Live account transport and connection state.
 * @param {string} options.tokenId Account to query and extend.
 * @param {Function} [options.readRole] Read a fresh role snapshot without retries.
 * @param {Function} [options.sendCommand] Send one hang-up share command.
 * @param {Function} [options.check] Check cancellation before another operation.
 * @param {Function} [options.onLog] Report execution and server verification.
 * @param {Function} [options.sleep] Await the requested delay.
 * @param {number} [options.delay] Delay after each share acknowledgement.
 * @returns {Promise<object>} Sent request count and server-confirmed remaining slots.
 * @throws {Error} On unavailable state, disconnect, cancellation or command failure.
 */
export async function fillHangUpTime({
  tokenStore,
  tokenId,
  readRole = () =>
    tokenStore.sendMessageWithPromise(tokenId, "role_getroleinfo", {}, 15000),
  sendCommand = () =>
    tokenStore.sendMessageWithPromise(
      tokenId,
      "system_mysharecallback",
      { isSkipShareCard: true, type: 2 },
      8000,
    ),
  check = () => {},
  onLog = () => {},
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  delay = 500,
}) {
  let snapshotClient;
  const assertConnected = () => {
    check();
    const status = tokenStore.getWebSocketStatus?.(tokenId);
    if (
      (status && status !== "connected") ||
      (snapshotClient &&
        snapshotClient !== tokenStore.wsConnections?.[tokenId]?.client)
    ) {
      const error = new Error(
        "WebSocket 已断开，停止加钟并等待重新读取服务器状态",
      );
      error.interrupted = true;
      throw error;
    }
  };
  const readState = async () => {
    assertConnected();
    // role_getroleinfo is limited independently of the share command.
    await sleep(1000);
    assertConnected();
    const client = tokenStore.wsConnections?.[tokenId]?.client;
    const response = await readRole();
    assertConnected();
    if (client !== tokenStore.wsConnections?.[tokenId]?.client) {
      const error = new Error("连接会话已变化，请重新读取服务器挂机状态");
      error.interrupted = true;
      throw error;
    }
    snapshotClient = client;
    return getHangUpState(response?.role, client?.serverTime);
  };
  const before = await readState();
  if (!before.remaining) {
    onLog("跳过挂机加钟：服务器确认助力槽位已满");
    return { sent: 0, ...before };
  }
  onLog(
    `服务器挂机槽位 ${before.active}/${HANG_UP_HELP_SLOTS}，补加钟 ${before.remaining} 次`,
  );
  for (let i = 0; i < before.remaining; i++) {
    assertConnected();
    onLog(`执行挂机加钟 ${i + 1}/${before.remaining}`);
    await sendCommand();
    assertConnected();
    await sleep(delay);
  }
  const after = await readState();
  onLog(
    after.remaining
      ? `加钟后服务器仍有 ${after.remaining} 个空槽位，保留待继续`
      : "服务器确认挂机加钟已补满",
  );
  return { sent: before.remaining, ...after };
}

/**
 * Clear cached configuration and version mapping.
 * 仅用于测试，生产环境不需要调用（切账号不会串配置，缓存按版本区分）。
 * @internal
 */
export function resetDailyTaskConfigCache() {
  configsByVersion.clear();
  resolvedVersionByServer.clear();
  publishedVersion = null;
}

/** @param {string} value 候选版本号 @returns {boolean} 是否可作为 URL 路径片段 */
function isSafeVersion(value) {
  return typeof value === "string" && /^[\w-]+$/.test(value);
}

/** @param {number} ms 超时毫秒 @returns {AbortSignal|undefined} 超时信号（老环境可能不支持） */
function timeoutSignal(ms) {
  return typeof AbortSignal?.timeout === "function"
    ? AbortSignal.timeout(ms)
    : undefined;
}

/**
 * 只缓存一个版本的配置，避免旧版本长期占内存。
 * @param {string} keep 需要保留的版本
 */
function pruneConfigs(keep) {
  for (const key of configsByVersion.keys()) {
    if (key !== keep) configsByVersion.delete(key);
  }
}

/**
 * Read and validate one config version, merging concurrent requests.
 * @param {string} version Config directory version.
 * @param {Function} fetchConfig Fetch implementation.
 * @returns {Promise<object>} Validated config tagged with its version.
 */
async function loadConfigForVersion(version, fetchConfig) {
  const cached = configsByVersion.get(version);
  if (cached) return cached;

  const loading = (async () => {
    const response = await fetchConfig(
      `${DATA_CDN}/data/${version}/config.json`,
      {
        signal: timeoutSignal(CONFIG_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      const error = new Error(
        `官方任务配置读取失败（HTTP ${response.status}，版本 ${version}）`,
      );
      error.configUnavailable = true;
      error.httpStatus = response.status;
      error.configVersion = version;
      throw error;
    }
    const config = validateDailyTaskConfig(await response.json());
    return { ...config, configVersion: version };
  })();

  configsByVersion.set(version, loading);
  loading.catch(() => {
    if (configsByVersion.get(version) === loading)
      configsByVersion.delete(version);
  });
  return loading;
}

/**
 * Read the version the official client itself is using.
 * 服务器返回的 dataBundleVer 可能已被官方从 CDN 清理，此时用这里兜底。
 * @param {Function} fetchConfig Fetch implementation.
 * @returns {Promise<string|null>} Published data version, or null.
 */
async function fetchPublishedVersion(fetchConfig) {
  if (publishedVersion) return publishedVersion;
  try {
    const response = await fetchConfig(`${DATA_CDN}/data/version.json`, {
      signal: timeoutSignal(VERSION_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (isSafeVersion(data?.version)) {
      publishedVersion = data.version;
      return publishedVersion;
    }
  } catch {
    /* 版本清单拿不到就继续用服务器版本或缓存 */
  }
  return null;
}

/**
 * Load task targets from the official data version returned by the game server.
 * Only immutable configuration is cached; role progress is never cached here.
 *
 * 顺序：上次成功读取的版本 -> 服务器 dataBundleVer -> 官方 data/version.json。
 * 官方会定期删除旧数据目录，服务器字段又可能滞后，只用服务器版本会 404。
 * @param {object} tokenStore Live command transport.
 * @param {string} tokenId Selected account identity.
 * @param {Function} [fetchConfig] Fetch implementation for the official CDN.
 * @returns {Promise<object>} Validated task definitions and point-reward thresholds.
 */
export async function loadDailyTaskConfig(
  tokenStore,
  tokenId,
  fetchConfig = globalThis.fetch,
) {
  const response = await tokenStore.sendMessageWithPromise(
    tokenId,
    "system_getdatabundlever",
    {},
    15000,
  );
  const serverVersion = response?.dataBundleVer;
  if (!isSafeVersion(serverVersion))
    throw new Error("服务器未提供有效的任务配置版本");

  // 先试服务器给的版本（正常路径），失败再用上次成功的版本（命中缓存，不重复下载），
  // 最后才去问官方 data/version.json。顺序反了会一直停在旧配置上。
  const candidates = [serverVersion];
  const resolved = resolvedVersionByServer.get(serverVersion);
  if (resolved && !candidates.includes(resolved)) candidates.push(resolved);

  let lastError = null;
  for (const version of candidates) {
    try {
      const config = await loadConfigForVersion(version, fetchConfig);
      resolvedVersionByServer.set(serverVersion, version);
      pruneConfigs(version);
      return config;
    } catch (error) {
      lastError = error;
    }
  }

  const published = await fetchPublishedVersion(fetchConfig);
  if (published && !candidates.includes(published)) {
    try {
      const config = await loadConfigForVersion(published, fetchConfig);
      resolvedVersionByServer.set(serverVersion, published);
      pruneConfigs(published);
      return config;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`官方任务配置读取失败（版本 ${serverVersion}）`);
}

/**
 * Validate official task IDs separately from their completion-condition IDs.
 * @param {object} config Official configuration response.
 * @returns {object} Minimal task and reward configuration.
 * @throws {Error} When targets or reward thresholds cannot be trusted.
 */
export function validateDailyTaskConfig(config) {
  const tasks = Object.values(config?.DailyTaskConf ?? {});
  const dailyRewards = Object.values(config?.DayLimitConf ?? {});
  const weeklyRewards = Object.values(config?.WeekLimitConf ?? {});
  if (
    !tasks.length ||
    !dailyRewards.length ||
    !weeklyRewards.length ||
    tasks.some(
      (task) =>
        !Number.isInteger(task.id) ||
        task.id <= 0 ||
        !Number.isInteger(task.completeCondition) ||
        task.completeCondition <= 0 ||
        !Number.isInteger(task.completeValue) ||
        task.completeValue <= 0,
    ) ||
    new Set(tasks.map((task) => task.id)).size !== tasks.length ||
    new Set(tasks.map((task) => task.completeCondition)).size !==
      tasks.length ||
    [dailyRewards, weeklyRewards].some(
      (rewards) =>
        new Set(rewards.map((reward) => reward.id)).size !== rewards.length,
    ) ||
    [...dailyRewards, ...weeklyRewards].some(
      (reward) =>
        !Number.isInteger(reward.id) ||
        reward.id <= 0 ||
        !Number.isFinite(reward.limit) ||
        reward.limit < 0,
    )
  )
    throw new Error("官方每日任务配置无效，停止执行");
  const claimSeconds = config?.ConstantConf?.stayRewardTime;
  return {
    tasks,
    dailyRewards,
    weeklyRewards,
    ...(Number.isFinite(claimSeconds) && claimSeconds > 0
      ? { hangUpClaimInterval: claimSeconds * 1000 }
      : {}),
  };
}

/**
 * Decode a freshly fetched role's daily progress, including unclaimed completion.
 * Missing counters in an otherwise valid server map represent zero progress.
 * @param {object} role Role returned by the live role_getroleinfo response.
 * @param {object} config Validated official definitions.
 * @returns {Array<object>} Pending, claimable or claimed tasks with remaining counts.
 * @throws {Error} When the server snapshot is incomplete or malformed.
 */
export function getDailyTaskStates(role, config) {
  const daily = role?.dailyTask;
  if (
    !Number.isFinite(daily?.dailyTime) ||
    daily.dailyTime <= 0 ||
    !daily.complete ||
    typeof daily.complete !== "object" ||
    Array.isArray(daily.complete)
  )
    throw new Error("服务器任务列表不完整，不能判断完成状态");
  return config.tasks.map((task) => {
    const value = Object.hasOwn(daily.complete, task.completeCondition)
      ? daily.complete[task.completeCondition]
      : 0;
    if (!Number.isInteger(value) || value < -1)
      throw new Error("服务器任务进度无效，停止执行");
    const claimed = value === -1;
    const progress = claimed ? task.completeValue : value;
    return {
      id: task.id,
      condition: task.completeCondition,
      required: task.completeValue,
      progress,
      remaining: Math.max(task.completeValue - progress, 0),
      status: claimed
        ? "claimed"
        : progress >= task.completeValue
          ? "claimable"
          : "pending",
    };
  });
}

/**
 * Determine point rewards from the server's point total and claimed-reward map.
 * @param {object} daily Server dailyTask data.
 * @param {Array<object>} definitions Official reward IDs and thresholds.
 * @param {boolean} [weekly] Select weekPoint/weekReward instead of daily fields.
 * @returns {Array<number>} Only eligible, unclaimed server reward IDs.
 */
export function getClaimablePointRewards(daily, definitions, weekly = false) {
  const points = daily?.[weekly ? "weekPoint" : "dailyPoint"];
  const claimed = daily?.[weekly ? "weekReward" : "dailyReward"];
  if (
    !Number.isFinite(points) ||
    !claimed ||
    typeof claimed !== "object" ||
    Array.isArray(claimed) ||
    Object.values(claimed).some((value) => typeof value !== "boolean")
  )
    throw new Error("服务器积分奖励状态不完整");
  return definitions
    .filter((reward) => points >= reward.limit && claimed[reward.id] !== true)
    .map((reward) => reward.id);
}
