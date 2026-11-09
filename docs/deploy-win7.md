# 在干净的 Windows 7 上部署 XYZW Web Helper

> 适用场景：手上只有仓库地址 `https://github.com/huxinyu190/xyzw_web_helper.git`，  
> 目标机器是一台**非常干净、几乎没装任何软件**的 Windows 7，希望把项目跑起来。

---

## 0. 先看结论（30 秒版）

这个项目是 **Vue 3 + Vite 5** 的前端应用，**不能在 Windows 7 上直接 `pnpm install && pnpm build`**：

- Vite 5 要求 Node.js **18 或 20+**；
- Node.js 从 **14 开始就不再官方支持 Windows 7**（14 起要求 Win8.1+）；
- Windows 7 上最后能官方运行的 Node 是 **12.22.12**，它跑不动 Vite 5。

所以正确做法&#x662F;**「构建」和「运行」分开**：

```
一台较新的电脑（Win10/11、Mac、Linux 都行）   →   构建出 dist
                    ↓  打包
        一个「解压即用」的运行包（含 Node 12）
                    ↓  U 盘 / 网盘
              Windows 7 解压 → 双击 start.bat → 浏览器打开
```

Windows 7 上**不需要安装 Node、不需要 pnpm、不需要数据库、不需要 Python**，  
只需要一个能解压 ZIP 的资源管理器和一款现代浏览器。

> 如果连"较新的电脑"也没有：用仓库里自带的 GitHub Actions 工作流，  
> 让 GitHub 帮你构建并打包，直接下载现成的运行包（见 [路线 A](#路线-agithub-帮你构建最省事)）。

---

## 1. 兼容性前提（务必先确认）

### 1.1 系统

| 项目   | 要求                                     | 检查方法                                      |
| ---- | -------------------------------------- | ----------------------------------------- |
| 系统版本 | Windows 7 **SP1**（32 位或 64 位都可以）       | 右键「计算机」→ 属性 → 查看「系统类型」和是否有 Service Pack 1 |
| 内存   | ≥ 2 GB（建议 4 GB）                        | 同上                                        |
| 磁盘   | ≥ 500 MB 空闲                            | 运行包约 40–90 MB（Node 12 占大头）                |
| 系统补丁 | 建议装 **KB2999226**（Universal C Runtime） | 若启动 Node 报「缺少 api-ms-win-crt-*.dll」，就是缺它  |

> **最常见的坑**：干净 Win7 缺 UCRT，Node 12 一启动就报 `api-ms-win-crt-runtime-l1-1-0.dll 缺失`。  
> 解决：装 `vc_redist.x64.exe`（微软 VC++ 2015-2022 运行库）或 KB2999226，离线安装包可从别的机器拷过来。

### 1.2 浏览器（这条比 Node 还重要）

项目是 Vue 3 + ES Module，**IE / IE11 完全打不开**（白屏）。必须是：

| 浏览器         | 可用版本               | 说明                                |
| ----------- | ------------------ | --------------------------------- |
| Firefox ESR | **115 ESR**        | 官方仍提供 Win7 安装包，最省事，**推荐**         |
| Chrome      | **109.0.5414.120** | 官方最后一个支持 Win7 的版本（110 起要求 Win10+） |
| Edge        | 109                | 同上，Win7 最后版本                      |
| IE 8/11     | ❌                  | 不支持，页面白屏                          |

Firefox 115 ESR 官方下载（任选其一，拷到 Win7 安装）：

```
64 位：https://ftp.mozilla.org/pub/firefox/releases/115.0esr/win64/zh-CN/Firefox%20Setup%20115.0esr.exe
32 位：https://ftp.mozilla.org/pub/firefox/releases/115.0esr/win32/zh-CN/Firefox%20Setup%20115.0esr.exe
```

### 1.3 为什么不能"在 Win7 上装个 Node 直接构建"

| Node 版本      | Win7 支持       | 能否构建本项目               |
| ------------ | ------------- | --------------------- |
| 12.22.12     | ✅ 最后官方支持      | ❌ Vite 5 不支持 Node 12  |
| 14.21.3      | ⚠️ 非官方，部分机器可跑 | ❌ Vite 5 要求 Node ≥ 18 |
| 16 / 18 / 20 | ❌ 要求 Win8.1+  | —                     |

结论：**只在 Win7 上"运行"，不要在上面"构建"**。构建放在别的机器或 GitHub Actions 上做一次即可。

---

## 2. 运行包里有什么

仓库里已经准备好 Win7 运行所需的文件，位于 `deploy/win7/`：

| 文件                 | 作用                                                      |
| ------------------ | ------------------------------------------------------- |
| `server.js`        | 本地服务器：托管页面 + SPA 路由回退 + `/api/*` 代理，**零 npm 依赖**        |
| `package.json`     | 只用来声明 `type: commonjs`，让 Node 以 CommonJS 运行 `server.js` |
| `start.bat`        | 启动（仅本机访问 `127.0.0.1:8080`）                              |
| `start-lan.bat`    | 启动（监听 `0.0.0.0`，允许局域网其它设备访问）                            |
| `stop.bat`         | 停止后台运行的服务（读 `server.pid`）                               |
| `open.bat`         | 用默认浏览器打开 `http://127.0.0.1:8080/`                       |
| `start-hidden.vbs` | 无窗口后台启动，可放进「启动」文件夹做开机自启                                 |
| `README.txt`       | 给最终用户看的简短说明                                             |

组装完成后的目录长这样（**这就是要拷到 Win7 的东西**）：

```
xyzw-win7\
├─ node\                  ← 便携版 Node.js 12.22.12（node.exe 等，解压后直接放进来）
├─ web\                   ← 前端构建产物（dist 里的全部文件）
├─ server.js
├─ package.json
├─ start.bat
├─ start-lan.bat
├─ stop.bat
├─ open.bat
├─ start-hidden.vbs
└─ README.txt
```

---

## 路线 A：GitHub 帮你构建（最省事）

适合：没有开发环境、也不想在别的电脑装 Node。

仓库已自带工作流 `.github/workflows/build-win7-package.yml`，它会：

1. 在 GitHub 的 Windows 机器上 `pnpm install && pnpm build`；
2. 自动下载 Node 12.22.12 便携版放进 `node\`；
3. 把 `dist` 放进 `web\`，连同 `server.js`、`*.bat` 一起打成 `xyzw-win7-x64.zip` / `xyzw-win7-x86.zip`。

### A-0 直接下载已发布的运行包（首选，不需要登录）

仓库发布过 Release 之后，直接下载附件即可，**不需要 GitHub 账号**：

1. 打开 <https://github.com/huxinyu190/xyzw_web_helper/releases/latest>
2. 下载 `xyzw-win7-x64.zip`（64 位系统）或 `xyzw-win7-x86.zip`（32 位系统）
3. 解压一次就是完整目录（直接包含 `node\`、`web\`、`start.bat`），
   跳到 [第 3 节](#3-在-windows-7-上部署一步一步) 即可

> 这里下载的是**最终运行包**，不用再构建、不用装 Node。
> 只有在拿不到 Release、或者想自己出包时，才需要看下面的 A-1 ~ A-3 / 路线 B。

### A-1 触发构建

1. 浏览器打开你的仓库：`https://github.com/huxinyu190/xyzw_web_helper`
2. 点顶部 **Actions**
3. 首次使用如果是 fork 的仓库，会看到提示 → 点 **I understand my workflows, go ahead and enable them**
4. 左侧点 **构建 Win7 便携包** → 右侧 **Run workflow** → 分支选 `main` → 绿色 **Run workflow**
5. 等 3–6 分钟，列表里出现绿色 ✅

也可以直接推送代码触发（工作流已配置 `push` 到 `main` 且改动涉及 `src/`、`public/`、`deploy/win7/` 时自动跑）。

### A-2 下载运行包

1. 点进这次成功的运行记录
2. 页面**最下方** Artifacts 区域
3. 下载 `xyzw-win7-x64`（64 位系统）或 `xyzw-win7-x86`（32 位系统）
4. 下载得到的是一个 zip，里面还有一个 `xyzw-win7.zip`，再解压一次就是最终目录

> GitHub 的 Artifacts 下载**需要登录 GitHub 账号**。如果 Win7 上没有浏览器能登录 GitHub，  
> 就在别的设备上下载好，再用 U 盘 / 网盘拷过去。

### A-3 如果 Actions 用不了

- 仓库 Settings → Actions → General → 确认 **Allow all actions** 已开启；
- 公司/校园网可能屏蔽 `nodejs.org`，工作流下载 Node 会失败，改走路线 B。

---

## 路线 B：自己构建一次（最可控）

适合：你手边有一台 Win10/11 或 Mac，愿意装一次 Node。

### B-1 准备构建机

1. 安装 **Node.js 20 LTS**：<https://nodejs.org/zh-cn/download>
2. 安装 **Git**（或直接下载仓库 ZIP，可跳过 Git）

验证：

```bash
node -v     # 应输出 v20.x 或 v18.x
npm -v
```

### B-2 拉代码并构建

键盘按win+R，输入cmd，回车。下面的代码一行一行的复制过去回车（复制一行过去回车，重复）

```bash
git clone https://github.com/huxinyu190/xyzw_web_helper.git
cd xyzw_web_helper

# 启用 pnpm（Node 16.10+ 自带 corepack）
corepack enable
pnpm install
pnpm build
```

> 不想用 pnpm 也可以：`npm install` + `npm run build`（会生成 package-lock.json，不影响产物）。

构建成功的标志：

```
✓ built in 30s
[copy-worker] worker.js copied to dist/_worker.js
```

此时项目根目录会出现 `dist\`，约 16 MB，里面有 `index.html`、`assets\`、`game\` 等。

### B-3 下载 Node 12 便携版（给 Win7 用）

按目标机器位数二选一：

```
64 位：https://nodejs.org/dist/v12.22.12/node-v12.22.12-win-x64.zip
32 位：https://nodejs.org/dist/v12.22.12/node-v12.22.12-win-x86.zip
```

解压后得到 `node-v12.22.12-win-x64\`，里面有 `node.exe`、`npm.cmd` 等。

### B-4 组装运行包

1. 新建文件夹 `xyzw-win7`
2. 把 `node-v12.22.12-win-x64\` 里的**内容**（不是文件夹本身）复制到 `xyzw-win7\node\`
3. 把 `dist\` 里的**内容**复制到 `xyzw-win7\web\`
4. 把仓库 `deploy\win7\` 下的 `server.js`、`package.json`、`*.bat`、`*.vbs`、`README.txt` 复制到 `xyzw-win7\`

最终结构应与 [第 2 节](#2-运行包里有什么) 一致。检查两个关键文件：

```
xyzw-win7\node\node.exe      ← 必须存在
xyzw-win7\web\index.html     ← 必须存在
```

1. 右键 `xyzw-win7` → 发送到 → 压缩(zipped)文件夹，得到 `xyzw-win7.zip`

> 可选自检：在构建机上执行  
> `xyzw-win7\node\node.exe xyzw-win7\server.js --port 8080`  
> 然后用浏览器打开 `http://127.0.0.1:8080/`，能进首页说明包是好的。

---

## 3. 在 Windows 7 上部署（一步一步）

### 3.1 拷贝

把 `xyzw-win7.zip` 通过 U 盘、共享文件夹或网盘拷到 Win7。

> 建议放在 **`C:\` 根目录**，路径不要有中文、空格和特殊符号，例如：  
> ✅ `C:\xyzw-win7`  
> ❌ `C:\Users\张三\桌面\新建文件夹 (2)\xyzw-win7`

### 3.2 解压

1. 右键 `xyzw-win7.zip`
2. 选择 \*\*解压到 xyzw-win7\*\*（Win7 自带 ZIP 支持，不需要装 WinRAR）
3. 确认 `C:\xyzw-win7\node\node.exe` 和 `C:\xyzw-win7\web\index.html` 都在

### 3.3 首次启动

1. 进入 `C:\xyzw-win7`
2. 双击 **`start.bat`**
3. 会弹出一个黑色命令行窗口，出现类似内容就是成功：

```
  XYZW Web Helper v2.1.0
  静态目录: C:\xyzw-win7\web
  监听地址: 127.0.0.1:8080
  本机访问: http://127.0.0.1:8080/

  关闭服务: 按 Ctrl+C，或双击 stop.bat
```

> **这个黑窗口不要关**，关了服务就停了。可以最小化。  
> 如果弹出「Windows 防火墙」提示，选 **允许访问**（仅本机使用其实不影响）。

### 3.4 打开页面

双击 **`open.bat`**，或在浏览器地址栏输入：

```
http://127.0.0.1:8080/
```

> 必须用 Firefox 115 ESR 或 Chrome 109。用 IE 打开会白屏。  
> 把该地址加入书签，以后直接用。

### 3.5 首次使用自检清单

按顺序点一遍，全部正常说明部署成功：

- [ ] 首页能打开，没有白屏
- [ ] 顶部导航可点：首页 / 游戏功能 / Token管理 / 批量日常 / 主线推关 / 消息测试
- [ ] 进入 **Token管理**，用「手动输入 Base64」导入一个 Token（不依赖网络接口）
- [ ] 进入 **游戏功能**，身份牌能显示角色信息、图鉴微星
- [ ] 点 **金鱼活动** Tab，切换节日/档位，数值会变
- [ ] 点「打开游戏」，游戏能加载（`/game/index.html`）
- [ ] 点「批量打开游戏」，多开 iframe 能加载
- [ ] 右上角主题切换正常

### 3.6 关闭服务

- 在黑窗口按 `Ctrl + C`，或
- 双击 **`stop.bat`**（按 `server.pid` 精确结束进程，不会误杀其它 node）

---

## 4. 日常使用

### 4.1 让其它设备访问（局域网）

1. 双击 **`start-lan.bat`**（监听 `0.0.0.0:8080`）
2. 查本机 IP：`Win+R` → `cmd` → `ipconfig` → 看「IPv4 地址」，例如 `192.168.1.20`
3. 其它设备浏览器访问 `http://192.168.1.20:8080/`
4. 若访问不了，用**管理员**身份运行 cmd 放行端口：

```bat
netsh advfirewall firewall add rule name="XYZW 8080" dir=in action=allow protocol=TCP localport=8080
```

> 注意：局域网模式下同一网段的人都能打开这个页面（页面里存着你的游戏 Token 的话有风险）。  
> 只在家用/可信网络使用，用完关掉。

### 4.2 开机自启

1. `Win+R` → 输入 `shell:startup` → 回车，打开「启动」文件夹
2. 右键 `C:\xyzw-win7\start-hidden.vbs` → 创建快捷方式 → 把快捷方式放进「启动」文件夹
3. 下次开机自动在后台启动（无窗口），日志写到 `C:\xyzw-win7\server.log`
4. 想取消：删掉那个快捷方式

> 有些安全软件会拦截 `.vbs`。被拦就用 `start.bat` 的快捷方式代替（会有黑窗口）。

### 4.3 换端口

端口被占用时（比如 8080 被别的软件占了），编辑 `start.bat`，把最后一行改成：

```bat
"node\node.exe" server.js --port 8081
```

然后访问 `http://127.0.0.1:8081/`，`open.bat` 里的地址也要一起改。

### 4.4 更新到新版本

只需要替换 `web\`：

1. 在构建机重新 `git pull` + `pnpm build`
2. 把新的 `dist\` 内容覆盖到 `C:\xyzw-win7\web\`（先删旧的 `assets\` 再复制，避免残留）
3. Win7 上 `stop.bat` → `start.bat`
4. 浏览器 `Ctrl + F5` 强刷

`node\`、`server.js`、`*.bat` 一般不用动。

### 4.5 备份与迁移

- **程序本身**：整个 `C:\xyzw-win7` 文件夹拷走即可，换机器解压就能用
- **你的数据（Token、角色、设置）**：存在**浏览器**里（IndexedDB / localStorage），  
  不在程序文件夹里。换浏览器或清除站点数据会丢，需要重新导入 Token
- 重装系统前，先在各浏览器里确认站点数据不被清空，或准备好 Token 原文

---

## 5. 为什么不需要装后端 / 数据库

| 功能                                        | 依赖          | 说明                        |
| ----------------------------------------- | ----------- | ------------------------- |
| Token 管理、角色信息、日常任务、游戏功能、金鱼活动              | 纯前端         | 数据存浏览器，游戏通信直连 WebSocket   |
| 手动导入 Token（Base64）                        | 无           | 完全离线可用                    |
| 手机号登录 / 微信扫码 / URL 导入 Token               | `/api/*` 代理 | `server.js` 已内置代理，转发到官方接口 |
| `render-backend/`（Node + Supabase + 定时任务） | 云端部署        | 与本地运行无关，本地不需要             |

代理规则和仓库根目录的 `worker.js` 完全一致：

| 本地路径                    | 转发到                                                                  |
| ----------------------- | -------------------------------------------------------------------- |
| `/api/hortor-ucenter/*` | `https://comb-platform.hortorgames.com`（Host 改写为 ucenter-app-server） |
| `/api/hortor/*`         | `https://comb-platform.hortorgames.com`                              |
| `/api/weixin/*`         | `https://open.weixin.qq.com`                                         |
| `/api/weixin-long/*`    | `https://long.open.weixin.qq.com`                                    |
| `/api/proxy?url=...`    | 任意 http/https 地址（给 URL 导入 Token 用）                                   |

> 如果所在网络访问不了这些官方域名，只有"手机号/微信登录"会失败，  
> 手动导入 Token 和其它功能不受影响。

---

## 6. 故障排查

| 现象                                       | 原因                                              | 解决                                                                            |                            |
| ---------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------- |
| 双击 `start.bat` 一闪而过                      | 目录不对 / 缺 Node / 缺 web                           | 打开 cmd，执行 `cd /d C:\xyzw-win7` 再运行 `start.bat`，看报错原文                          |                            |
| 提示 `node\node.exe not found`             | Node 文件夹层级放错                                    | 应是 `C:\xyzw-win7\node\node.exe`，不是 `...\node\node-v12.22.12-win-x64\node.exe` |                            |
| 提示 `web\index.html not found`            | dist 复制层级放错                                     | 应是 `C:\xyzw-win7\web\index.html`，不是 `...\web\dist\index.html`                 |                            |
| 报错缺少 `api-ms-win-crt-runtime-l1-1-0.dll` | 干净 Win7 缺 UCRT                                  | 安装 KB2999226 或 `vc_redist.x64.exe`（32 位系统装 x86 版）                             |                            |
| 黑窗口报 `端口 8080 已被占用`                      | 端口冲突                                            | 换端口 `--port 8081`，或 \`netstat -ano                                            | findstr :8080\` 找到 PID 后结束 |
| 浏览器打开是空白页                                | 用了 IE / 版本太老                                    | 换 Firefox 115 ESR 或 Chrome 109                                                |                            |
| 页面能开但刷新 404                              | 用了别的静态服务器                                       | 必须用本包的 `server.js`（它做了 SPA 回退）                                                |                            |
| 页面样式/脚本 404                              | `web\assets` 没复制全                               | 重新完整复制 `dist` 内容，别只复制 `index.html`                                            |                            |
| 进游戏白屏                                    | `/game/` 资源缺失或被拦截                               | 访问 `http://127.0.0.1:8080/game/index.html` 看是否 200；F12 看控制台                   |                            |
| 手机号/微信登录失败                               | 代理不通 / 外网被限 / 系统时间不对                            | 校正系统时间；确认能访问 `hortorgames.com`、`open.weixin.qq.com`                           |                            |
| 提示"连接已断开"                                | 游戏 WebSocket 被网络阻断                              | 换网络；确认防火墙未拦 443                                                               |                            |
| 杀毒软件报毒 / 删除 node.exe                     | 误报                                              | 把 `C:\xyzw-win7` 加入白名单后重新解压                                                   |                            |
| 关掉黑窗口后网页打不开                              | 服务随窗口退出                                         | 正常现象；需要后台运行就用 `start-hidden.vbs`                                              |                            |
| 打开很慢                                     | 机械硬盘 + 首次加载                                     | 第二次会走缓存；确认 `web\assets` 完整                                                    |                            |
| 启动时报 `Unexpected token '.'` 之类语法错误       | 系统里设过 `NODE_OPTIONS` 环境变量（例如指向某个新版 Node 的 shim） | `Win+R` → `cmd` → `set NODE_OPTIONS=` 后再启动，或到「系统属性 → 环境变量」里删掉该项               |                            |

---

## 7. 验证记录（本次实测）

写这份文档时，运行包已经在 **Node.js 12.22.12（Windows x64 正式版）** 下实测通过：


| 测试项 | 结果 |
| --- | --- |
| `node.exe -v` | `v12.22.12` |
| `/`（首页） | 200 |
| `/tokens`、`/admin/game-features`（SPA 刷新） | 200（回退 `index.html`） |
| `/game/index.html`、`/game/xyzw-sound.js` | 200 |
| `/assets/index-*.js` | 200，`application/javascript` |
| 不存在的静态文件 | 404 |
| `Range: bytes=0-9` 请求图片 | 206 Partial Content |
| `/api/proxy?url=...` GET / POST / OPTIONS | 转发成功、请求体完整、204 |

> 说明：`server.js` 只用 Node 内置模块（`http`/`https`/`fs`/`path`/`url`），
> 没有任何 npm 依赖，所以只要 Node 能启动，服务就能跑。

---

## 8. 安全提醒

1. **只监听 `127.0.0.1`**（默认）。不要在没有防护的情况下用 `--host 0.0.0.0` 暴露到公网。
2. 页面里的 **Token 等同于游戏账号凭证**，别在公用电脑上导入；用完清除站点数据。
3. 本项目是第三方工具，使用风险自负；请遵守游戏用户协议。
4. Win7 本身已停止安全更新，建议这台机器只用于该工具、不浏览陌生网站。
5. `dist/_worker.js` 是给 Cloudflare Pages 用的，本地 `server.js` 不读取它，留着无害。

---

## 9. 附录

### 9.1 运行参数

```bat
node\node.exe server.js                     :: 默认 127.0.0.1:8080
node\node.exe server.js --port 8081         :: 换端口
node\node.exe server.js --host 0.0.0.0      :: 允许局域网
node\node.exe server.js --root D:\web       :: 指定别的静态目录
```

也支持环境变量 `PORT`、`HOST`。

### 9.2 最短验证命令（Win7 cmd）

```bat
cd /d C:\xyzw-win7
node\node.exe -v
node\node.exe --check server.js
```

第一条应输出 `v12.22.12`，第二条无输出即语法正常。

### 9.3 在构建机上验证运行包

运行包里的 `node\node.exe` 是 **Windows 二进制**，只能在 Windows 上直接执行。
如果你的构建机是 Windows（Win10/11），建议拷走之前先验一遍：

```bat
cd /d D:\xyzw-win7
node\node.exe -v
node\node.exe server.js --port 8080
```

然后浏览器打开 `http://127.0.0.1:8080/`，能进首页、能进 `/tokens` 就说明包是完整的。

构建机是 macOS / Linux 时，用系统自带的 Node 验证同一份 `web` 目录即可
（`server.js` 逻辑与平台无关）：

```bash
node xyzw-win7/server.js --port 8080
curl -I http://127.0.0.1:8080/
curl -I http://127.0.0.1:8080/tokens      # 应返回 200（SPA 回退）
```

### 9.4 目录与端口速查

| 项 | 值 |
| --- | --- |
| 默认地址 | `http://127.0.0.1:8080/` |
| 静态根目录 | `.\web` |
| 代理前缀 | `/api/hortor`、`/api/hortor-ucenter`、`/api/weixin`、`/api/weixin-long`、`/api/proxy` |
| 进程号文件 | `.\server.pid` |
| 后台日志 | `.\server.log`（仅 `start-hidden.vbs` 模式下生成） |

### 9.5 相关文件

- 运行包源文件：`deploy/win7/`
- 自动构建工作流：`.github/workflows/build-win7-package.yml`
- 云端部署（Cloudflare Pages）说明：`README.md` 的「部署代理服务」章节
- 原 `worker.js` 代理规则：仓库根目录

### 9.6 发布新版本（维护者）

```bash
# 在仓库里打标签并推送，release.yml 会自动构建并创建 Release
git tag v2.1.0
git push mine v2.1.0
```

- 发布页：<https://github.com/huxinyu190/xyzw_web_helper/releases>
- 工作流：`.github/workflows/release.yml`（复用构建工作流，用自带 token 上传附件）
- 想重发同一个版本：删掉旧标签重推即可

```bash
git tag -d v2.1.0
git push mine :refs/tags/v2.1.0
git tag v2.1.0
git push mine v2.1.0
```
