# 游戏版本检查与更新

> 解决「进入游戏后部分新活动参加不了」的问题。

## 1. 两个版本号，别混

游戏启动涉及两个版本，必须**成对**：

| 名称 | 例子 | 作用 | 存在哪 |
| --- | --- | --- | --- |
| 资源清单版本 | `0.36.0` | 决定向官方请求哪一份 `bundleVers`（资源包清单） | 请求参数 `version=0.36.0-android` |
| 游戏代码版本 | `2.54.2` | 官方用它判断客户端是否最新（`CODE_VERSION`） | 清单里的 `bundleVers.codeVersion` |

游戏包里 `GameVersionTask.resolveGameVersion()` 的逻辑：

```js
const bundleVers = JSON.parse(manifest.bundleVers);
const serverCode = bundleVers.codeVersion ?? CODE_VERSION;
IsLastVersion = CODE_VERSION === serverCode;
```

不一致时游戏会弹「版本不一致，请重启」并跳回启动流程，新活动也会被锁。

### 之前的错误

项目原先写死两处：

```js
// main.2a00e.js
version=0.32.0-android
// game-defines.a175e.js
GAME_VERSION = '1.89.8-wx'
CODE_VERSION = '1.89.8'
```

于是清单是 0.32 的（`codeVersion = 2.48.2`），本地代码版本是 1.89.8，两边都对不上，
官方还会认为这是很旧的客户端。

### 官方版本实测（2026-11-15）

| 清单版本 | 包数 | 清单里的 codeVersion |
| --- | --- | --- |
| 0.30.0 | 1020 | — |
| 0.31.0 | 1072 | — |
| **0.32.0** | 1300 | **2.48.2** |
| 0.33.0 / 0.34.0 | 0（空清单） | 官方没发布 |
| 0.35.0 | 1290 | 2.45.2 |
| **0.36.0** | **1323** | **2.54.2** ← 最新游戏版本 |
| 0.37.0 | 1318 | **0.37.0**（分支版本，不能当游戏版本） |

> **坑**：不能按“清单版本号最大”挑最新。0.37.0 比 0.36.0 大，但它的 `codeVersion`
> 是 `0.37.0`；用它启动会让 `CODE_VERSION(2.54.2) ≠ 0.37.0`，触发版本不一致。
> 必须按 **`codeVersion` 谁最大** 来挑，0.36.0 才是 2.54.2 的载体。

0.36.0 相比 0.32.0：**新增 28 个资源包**（`daqiao9` / `ft_daqiao9` / `ls_daqiao9` 等大乔9资源、
`axian5119`、`hero_hb119`、`jiangwei12`、`ui_fiveYearSpecialActivity`、`ui_legionWarCupAd_*`、
`pearl_yuling_1122~1126`、`mrt_panel`、`map_80040`…），另有 72 个包版本更新。

## 2. 实现

### 2.1 主站：检查 + 切换

- 入口：**Token 管理** 页头部，`批量操作` 右侧的「检查更新」按钮，左边显示当前游戏版本（如 `v2.54.2`）。
- 点击后并行请求「当前清单版本 + 后续 12 个小版本 + 1.0.0 / 2.0.0」，
  解析每份清单的 `codeVersion`，**取 codeVersion 最高的那份**。
- 弹窗展示：当前游戏版本 → 官方最新、资源清单版本变化、资源包数量、新增包列表
  （前 8 个带分类）、可展开看完整差异。
- 点「立即更新」后：
  1. 写入 `localStorage["xyzw:gameClientVersion"]`（清单版本，如 0.36.0）
  2. 写入 `localStorage["xyzw:gameVersion"]`（代码版本，如 2.54.2）
  3. `postMessage` 通知已打开的游戏 iframe，并自动刷新
- 首次使用会做一次迁移：老数据只有清单版本、没有代码版本时，统一重置成默认的一对
  （0.36.0 / 2.54.2），避免错配。

| 文件 | 作用 |
| --- | --- |
| `src/utils/gameVersion.js` | 纯逻辑：解析/比较、探测、清单解析（含 codeVersion）、包差异、结论 |
| `src/composables/useGameVersion.js` | 并发探测、按 codeVersion 选最新、持久化、通知 iframe |
| `src/views/TokenImport/TokenImport.vue` | 版本徽标 + 按钮 + 弹窗 |
| `test/gameVersion.test.js` | 9 项单测（含 0.36 vs 0.37 的选择、写死版本的守卫） |

### 2.2 游戏页：读取版本

- `public/game/xyzw-sound.js`（最先执行）：
  - 从**原生** localStorage 读 `xyzw:gameClientVersion` / `xyzw:gameVersion`
    （多开页会隔离存储，必须在隔离前读）；
  - 挂到 `window.__XYZW_CLIENT_VERSION__` / `window.__XYZW_GAME_VERSION__`；
  - 监听 `{ type: "xyzw:version", version, gameVersion }` 实时更新。
- `public/game/main.2a00e.js`：清单地址改用 `getClientVersion()`。
- `public/game/game-defines.a175e.js`：

```js
gt.CODE_VERSION = window.__XYZW_GAME_VERSION__ || '2.54.2'
gt.GAME_VERSION = gt.CODE_VERSION + '-wx'
```

单开、批量打开、Win7 本地包走同一套逻辑。

### 2.3 不需要后端代理

官方 manifest 返回 `Access-Control-Allow-Origin: *`，预检也放行，浏览器可直连。

## 3. 使用

1. 打开 **Token 管理**
2. 点 **检查更新**（并行探测，实测 0.3–2 秒）
3. 看到「当前 v2.48.2 → 官方最新 v2.54.2」「资源清单 0.32.0 → 0.36.0」「新增 28 个包」
4. 点 **立即更新** → 游戏 iframe 自动刷新

## 4. 排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 提示「官方资源清单暂时不可用」 | 网络到 `xxz-xyzw.hortorgames.com` 失败 | 检查网络/代理，点重试 |
| 更新后仍提示版本不一致 | 游戏页没重新加载 | 重开游戏标签/iframe，或 `Ctrl+F5` |
| 更新后白屏 | 新资源包加载失败 | 控制台看 404；确认能访问 `xxz-xyzw-res.hortorgames.com` |
| 想手动改版本 | — | 控制台执行 `localStorage.setItem("xyzw:gameClientVersion","0.36.0"); localStorage.setItem("xyzw:gameVersion","2.54.2")` 后重开游戏 |
| 多开账号版本不一致 | 存储按账号隔离 | 重新「批量打开游戏」 |

## 5. 维护提示

- 版本选择以清单里的 **`codeVersion`** 为准，不要按清单版本号排序；
- 探测范围是「当前清单版本 +12、以及 1.0.0 / 2.0.0」，官方跳到更高主版本时改
  `buildProbeVersions` 的 `majorCandidates`；
- `game-defines` 与 `main.2a00e.js` 只负责“读取注入值”，默认值（0.36.0 / 2.54.2）
  只是兜底，真正生效的是 localStorage。
