XYZW Web Helper - Windows 7 便携运行包
======================================

这个文件夹不需要安装任何软件，双击 start.bat 即可运行。

目录说明
--------
node\            便携版 Node.js 12（不要删除）
web\             前端页面（构建产物）
server.js         本地服务（静态页面 + /api 代理）
start.bat         启动（仅本机访问）
start-lan.bat     启动（允许局域网访问）
stop.bat          停止后台运行的服务
open.bat          打开浏览器
start-hidden.vbs  无窗口后台启动（可放进“启动”文件夹实现开机自启）

首次运行
--------
1. 双击 start.bat，看到“本机访问: http://127.0.0.1:8080/”表示成功；
2. 双击 open.bat，或用浏览器打开 http://127.0.0.1:8080/ ；
3. 浏览器必须是 Chrome 109 或 Firefox 115 ESR（IE 打不开）。

关闭
----
在前面的黑窗口按 Ctrl+C，或双击 stop.bat。

更新
----
只替换 web\ 里的文件即可，node\ 和 server.js 不用动。

详细说明见仓库里的 docs/deploy-win7.md
