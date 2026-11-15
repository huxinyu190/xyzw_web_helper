XYZW Web Helper - Windows 便携运行包（Win7 / Win10+ 通用）
=========================================================

这个文件夹不需要安装任何软件（不用装 Node、不用装 Git、不用 npm install），
解压后双击 run.vbs 就能用。

最简单的用法
------------
双击 run.vbs
  -> 后台启动本地服务，并自动打开浏览器
  -> 用完双击 stop.bat 关闭

想看到日志/服务窗口，就双击 start.bat（关闭窗口即停止）。

目录说明
--------
node\            便携版 Node.js（不要删除；Win7 包里是 12，Win10+ 包里是 22）
web\             前端页面（构建产物）
server.js         本地服务（静态页面 + /api 代理，零 npm 依赖）
run.vbs           一键启动：后台运行 + 自动开浏览器（推荐）
start.bat         启动并保留控制台窗口（仅本机访问）
start-lan.bat     启动（允许同一局域网的手机/其他电脑访问）
stop.bat          停止后台运行的服务
open.bat          只打开浏览器（服务已启动时用）
start-hidden.vbs  无窗口后台启动（可放进“启动”文件夹实现开机自启）

首次运行
--------
1. 解压到一个简单路径，例如 C:\xyzw 或 D:\xyzw（不要放在桌面、不要用中文路径）；
2. 双击 run.vbs；
3. 浏览器自动打开后即可使用；没自动打开就手动访问 http://127.0.0.1:8080/。

浏览器要求
----------
Win10/11：Edge / Chrome / Firefox 任意较新版本。
Win7：Chrome 109 或 Firefox 115 ESR（IE 打不开，会白屏）。

关闭
----
双击 stop.bat；如果用的是 start.bat，直接关窗口或按 Ctrl+C。

换端口 / 局域网
--------------
换端口：命令行执行  node\node.exe server.js --port 8081
局域网：双击 start-lan.bat，其他设备访问 http://本机IP:8080/

更新
----
替换 web\ 里的文件即可，node\ 与 server.js 一般不用动；
如果新版压缩包里的 server.js 也变了，请一并覆盖。

详细说明见仓库 docs/deploy-win7.md
