# 游戏版本检查与更新

> 解决「进入游戏后部分新活动参加不了」的问题。

## 1. 原因

游戏启动时会向官方 manifest 接口要一份资源清单，请求里带一个**客户端版本号**：

```
POST https://xxz-xyzw.hortorgames.com/login/manifest?platform=hortor&version=<版本>-android
```

服务端按版本返回不同的 `bundleVers`（资源包名 → 版本哈希）。项目里这个版本号原本写死在
`public/game/main.2a00e.js`：

```js
version=0.32.0-android
```

只要官方发布了新版本，0.32.0 拿到的清单里就没有新活动的资源包，游戏自然进不去。

实测（2026-11-15）官方各版本返回的清单：

| 客户端版本 | 资源包数量 | game 包哈希 | 说明 |
| --- | --- | --- | --- |
| 0.30.0 | 1020 | b5ae7 | 旧版 |
| 0.31.0 | 1072 | a7b03 | 旧版 |
| **0.32.0** | **1300** | **22c3b** | 项目原先写死的版本 |
| 0.33.0 / 0.34.0 | 0（空清单） | — | 官方没有发布这两个版本 |
| 0.35.0 | 1290 | 1ef8d | 可用 |
| 0.36.0 | 1323 | 03828 | 可用 |
| **0.37.0** | **1318** | **d8db3** | 当前最新 |

0.37.0 相比 0.32.0：**新增 18 个资源包**（`ui_fiveYearSpecialActivity`、`ui_legionWarCupAd_*`、
`pearl_yuling_1122~1126`、`jiangwei12`、`mrt_panel` 等），另有 31 个资源包版本更新。
新活动就是这些新增包。

> 注意：官方版本号不是连续发布的（0.33 / 0.34 根本不存在），所以不能简单 +1 探测，要往后扫一段。

## 2. 实现

### 2.1 主站：检查 + 切换

- 入口：**Token 管理** 页面头部，`批量操作` 右侧的「检查更新」按钮（旁边显示当前版本，如 `v0.32.0`）。
- 点击后并行请求「当前版本 + 后续 12 个小版本 + 1.0.0 / 2.0.0」的清单，取**有效版本里最高的那个**。
- 弹窗展示：当前版本 → 官方最新、资源包数量变化、新增包列表（前 8 个，带分类标签），
  可展开看完整差异。
- 点「立即更新」后：
  1. 把版本写入 `localStorage["xyzw:gameClientVersion"]`；
  2. 通过 `postMessage` 通知已打开的游戏 iframe；
  3. 自动刷新正在运行的游戏 iframe，新版本立即生效。

相关代码：

| 文件 | 作用 |
| --- | --- |
| `src/utils/gameVersion.js` | 纯逻辑：版本解析/比较、探测列表、清单解析、包差异、结论汇总 |
| `src/composables/useGameVersion.js` | 请求清单、并发探测、持久化、通知 iframe |
| `src/views/TokenImport/TokenImport.vue` | 按钮 + 弹窗 UI |
| `test/gameVersion.test.js` | 9 项单测（含「不能写死 0.32.0」的守卫） |

### 2.2 游戏页：读取版本

- `public/game/xyzw-sound.js`（在任何游戏脚本之前执行）：
  - 从**原生** localStorage 读取 `xyzw:gameClientVersion`（多开页会做存储隔离，必须在隔离前读）；
  - 挂到 `window.__XYZW_CLIENT_VERSION__`；
  - 监听 `{ type: "xyzw:version", version }` 消息，实时更新。
- `public/game/main.2a00e.js`：

```js
window.getClientVersion = function () {
  // window.__XYZW_CLIENT_VERSION__ → localStorage → 默认 0.32.0
};
const manifestUrl = `...&version=${window.getClientVersion()}-android`;
```

这样单开、批量打开、Win7 本地包都能用同一份版本设置。

### 2.3 为什么不需要后端代理

官方 manifest 接口返回 `Access-Control-Allow-Origin: *`，预检也放行，所以浏览器可以直连，
不需要走 `/api` 代理，部署到任何静态托管都能用。

## 3. 使用

1. 打开 **Token 管理**
2. 点 **检查更新**（等待 1–15 秒，实测并行探测约 0.3–2 秒）
3. 看到「当前使用 v0.32.0 → 官方最新 v0.37.0」和新增包列表
4. 点 **立即更新** → 游戏 iframe 自动刷新
5. 之后新开游戏都会用新版本

## 4. 排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 弹窗提示「官方资源清单暂时不可用」 | 网络到 `xxz-xyzw.hortorgames.com` 失败 | 检查网络/代理，点「重试」 |
| 一直显示「正在查询」超过 20 秒 | 网络慢或请求被拦截 | 稍等或重试；确认浏览器控制台无 CORS 报错 |
| 更新后活动还是进不去 | 游戏页没重新加载 | 关闭游戏标签/iframe 重新打开；或强刷 `Ctrl+F5` |
| 更新后游戏白屏 | 新版资源包加载失败 | 打开控制台看 404；确认能访问 `xxz-xyzw-res.hortorgames.com` |
| 想回到旧版本 | — | 控制台执行 `localStorage.setItem("xyzw:gameClientVersion","0.32.0")` 后重开游戏 |
| 多开账号版本不一致 | 多开按账号隔离存储 | 重新「批量打开游戏」，版本会在启动时重新读取 |

## 5. 版本被官方下线怎么办

如果当前版本在官方那里已经失效（返回空清单），弹窗会给出警告，并且**允许切回可用版本**
（即使版本号比当前低）。这是唯一会「降级」的场景。

## 6. 维护提示

- 官方一次只保留最近几个版本的清单，太久不更新会彻底拿不到清单；
- 探测范围是「当前小版本 +12、以及 1.0.0 / 2.0.0」。若将来官方跳到更高的主版本，
  改 `src/utils/gameVersion.js` 的 `buildProbeVersions` 里的 `majorCandidates` 即可；
- 游戏本体（`public/game` 的引擎与启动脚本）不在此更新范围内，那部分要靠重新打包运行包。
