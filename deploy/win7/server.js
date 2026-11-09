/*
 * XYZW Web Helper - Win7 便携运行服务器
 *
 * 目标：在一台非常干净的 Windows 7 上，不装任何软件，解压即用。
 * 依赖：只依赖 Node.js 12.22.12（最后一个官方支持 Win7 的版本），零 npm 依赖。
 *
 * 功能：
 *   1. 托管 ./web 下的前端构建产物（dist）
 *   2. SPA 路由回退（/tokens、/admin/xxx 刷新不 404）
 *   3. /api/* 反向代理（与仓库根目录 worker.js 的规则一致）
 *   4. 端口占用、目录缺失时给出中文提示
 *
 * 用法：
 *   node\node.exe server.js                 # 127.0.0.1:8080
 *   node\node.exe server.js --port 80       # 换端口
 *   node\node.exe server.js --host 0.0.0.0  # 允许局域网访问
 *   node\node.exe server.js --root D:\web   # 指定静态目录
 */
"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// ---------------------------------------------------------------- 基础参数
function readArg(name, fallback) {
  const index = process.argv.indexOf("--" + name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

const PORT = Number(readArg("port", process.env.PORT || 8080));
const HOST = readArg("host", process.env.HOST || "127.0.0.1");
const ROOT_ARG = readArg("root", "");
const ROOT = ROOT_ARG
  ? path.resolve(process.cwd(), ROOT_ARG)
  : path.join(__dirname, "web");
const PID_FILE = path.join(__dirname, "server.pid");
const VERSION = "2.1.0";

// ---------------------------------------------------------------- MIME
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".bin": "application/octet-stream",
  ".jsc": "application/javascript; charset=utf-8",
};

function mimeOf(file) {
  return MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
}

// ---------------------------------------------------------------- 代理规则
// 与仓库根目录 worker.js 保持一致；注意按前缀长度从长到短匹配
const PROXIES = [
  {
    prefix: "/api/hortor-ucenter",
    target: "https://comb-platform.hortorgames.com",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 12; ALN-AL80 Build/HUAWEIALN-AL80; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/114.0.5735.196 Mobile Safari/537.36",
      Accept: "application/json",
      Host: "ucenter-app-server.hortorgames.com",
      "Content-Type": "application/json; charset=utf-8",
    },
  },
  {
    prefix: "/api/weixin-long",
    target: "https://long.open.weixin.qq.com",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 7.0; Mi-4c Build/NRD90M; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.49 Mobile MQQBrowser/6.2 TBS/043632 Safari/537.36 MicroMessenger/6.6.1.1220(0x26060135) NetType/WIFI Language/zh_CN",
      Accept: "*/*",
      Referer: "https://open.weixin.qq.com/",
    },
  },
  {
    prefix: "/api/weixin",
    target: "https://open.weixin.qq.com",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 7.0; Mi-4c Build/NRD90M; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.49 Mobile MQQBrowser/6.2 TBS/043632 Safari/537.36 MicroMessenger/6.6.1.1220(0x26060135) NetType/WIFI Language/zh_CN",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      Referer: "https://open.weixin.qq.com/",
    },
  },
  {
    prefix: "/api/hortor",
    target: "https://comb-platform.hortorgames.com",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 12; 23117RK66C Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/95.0.4638.74 Mobile Safari/537.36",
      Accept: "*/*",
      Host: "comb-platform.hortorgames.com",
      Connection: "keep-alive",
      "Content-Type": "text/plain; charset=utf-8",
      Origin: "https://open.weixin.qq.com",
      Referer: "https://open.weixin.qq.com/",
    },
  },
].sort(function (a, b) {
  return b.prefix.length - a.prefix.length;
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With",
};

const HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
];

function pickForwardHeaders(req, overrides) {
  const headers = {};
  Object.keys(req.headers).forEach(function (name) {
    if (HOP_HEADERS.indexOf(name) !== -1) return;
    if (name === "host") return;
    headers[name] = req.headers[name];
  });
  Object.keys(overrides || {}).forEach(function (name) {
    headers[name] = overrides[name];
  });
  return headers;
}

function copyResponseHeaders(source) {
  const headers = {};
  Object.keys(source).forEach(function (name) {
    if (HOP_HEADERS.indexOf(name.toLowerCase()) !== -1) return;
    headers[name] = source[name];
  });
  Object.keys(CORS_HEADERS).forEach(function (name) {
    headers[name] = CORS_HEADERS[name];
  });
  return headers;
}

/** 通用转发（支持重定向跟随、gzip 透传、流式响应） */
function forward(req, res, targetUrl, headers, body, redirectsLeft) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (error) {
    return sendJson(res, 502, { error: "代理地址无效: " + targetUrl });
  }

  const client = parsed.protocol === "https:" ? https : http;
  const options = {
    method: req.method,
    headers: headers,
    timeout: 20000,
  };

  const upstream = client.request(parsed, options, function (response) {
    const status = response.statusCode || 502;
    const location = response.headers.location;

    if (
      status >= 300 &&
      status < 400 &&
      location &&
      redirectsLeft > 0 &&
      req.method !== "HEAD"
    ) {
      response.resume();
      const nextUrl = new URL(location, parsed).toString();
      const method =
        status === 303 ||
        ((status === 301 || status === 302) && req.method === "POST")
          ? "GET"
          : req.method;
      const nextHeaders = Object.assign({}, headers);
      if (method === "GET") delete nextHeaders["Content-Type"];
      return forward(
        { method: method, headers: nextHeaders },
        res,
        nextUrl,
        nextHeaders,
        method === "GET" ? null : body,
        redirectsLeft - 1,
      );
    }

    res.writeHead(status, copyResponseHeaders(response.headers));
    response.pipe(res);
  });

  upstream.on("timeout", function () {
    upstream.abort();
    if (!res.headersSent)
      sendJson(res, 504, { error: "上游接口超时（20 秒）" });
  });
  upstream.on("error", function (error) {
    if (res.headersSent) return res.end();
    sendJson(res, 502, {
      error:
        "代理请求失败: " + (error && error.message ? error.message : error),
    });
  });

  if (body && body.length) upstream.write(body);
  upstream.end();
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  res.writeHead(
    status,
    Object.assign(
      {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": body.length,
      },
      CORS_HEADERS,
    ),
  );
  res.end(body);
}

function handleProxy(req, res, targetBase, prefix, overrides, rawQuery) {
  const requestUrl = new URL(req.url, "http://localhost");
  const rest = requestUrl.pathname.slice(prefix.length) || "/";
  const target = targetBase.replace(/\/$/, "") + rest + (rawQuery || "");
  const headers = pickForwardHeaders(req, overrides);

  if (!headers["Content-Type"] && req.method !== "GET") {
    headers["Content-Type"] = "application/json; charset=utf-8";
  }

  const chunks = [];
  req.on("data", function (chunk) {
    chunks.push(chunk);
  });
  req.on("end", function () {
    forward(req, res, target, headers, Buffer.concat(chunks), 3);
  });
}

/** /api/proxy?url=... —— 给「通过 URL 导入 Token」用 */
function handleGenericProxy(req, res, urlObject) {
  const raw = urlObject.searchParams.get("url");
  if (!raw) return sendJson(res, 400, { error: "缺少 url 参数" });

  let target;
  try {
    target = new URL(raw);
  } catch (error) {
    return sendJson(res, 400, { error: "url 不是合法地址" });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return sendJson(res, 400, { error: "只允许 http/https 地址" });
  }

  const headers = {
    "User-Agent": req.headers["user-agent"] || "XYZW-Helper",
    Accept: "*/*",
  };

  if (req.method === "GET" || req.method === "HEAD") {
    return forward(req, res, target.toString(), headers, null, 3);
  }

  const chunks = [];
  req.on("data", function (chunk) {
    chunks.push(chunk);
  });
  req.on("end", function () {
    forward(req, res, target.toString(), headers, Buffer.concat(chunks), 3);
  });
}

// ---------------------------------------------------------------- 静态文件
function resolveStatic(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (error) {
    return null;
  }
  if (decoded.indexOf("\0") !== -1) return null;

  const normalized = path
    .normalize(decoded)
    .replace(/^([/\\])+/, "")
    .replace(/^(\.\.[/\\])+/, "");
  const file = path.join(ROOT, normalized);
  if (file !== ROOT && file.indexOf(ROOT + path.sep) !== 0) return null;
  return file;
}

function cacheControlFor(pathname) {
  if (pathname.indexOf("/assets/") === 0) {
    return "public, max-age=31536000, immutable";
  }
  return "no-cache";
}

function serveFile(req, res, file, pathname, statusOverride) {
  fs.stat(file, function (error, stat) {
    if (error || !stat.isFile()) return notFound(req, res);

    const headers = {
      "Content-Type": mimeOf(file),
      "Cache-Control": cacheControlFor(pathname),
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    };
    const range = req.headers.range;

    if (range && statusOverride !== 200) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
      if (match && (match[1] !== "" || match[2] !== "")) {
        let start;
        let end;
        if (match[1] === "") {
          const suffix = Number(match[2]);
          start = Math.max(0, stat.size - suffix);
          end = stat.size - 1;
        } else {
          start = Number(match[1]);
          end = match[2] === "" ? stat.size - 1 : Number(match[2]);
        }
        if (start <= end && start < stat.size) {
          end = Math.min(end, stat.size - 1);
          headers["Content-Range"] =
            "bytes " + start + "-" + end + "/" + stat.size;
          headers["Content-Length"] = end - start + 1;
          res.writeHead(206, headers);
          if (req.method === "HEAD") return res.end();
          return fs
            .createReadStream(file, { start: start, end: end })
            .pipe(res);
        }
        headers["Content-Range"] = "bytes */" + stat.size;
        res.writeHead(416, headers);
        return res.end();
      }
    }

    headers["Content-Length"] = stat.size;
    res.writeHead(statusOverride || 200, headers);
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function notFound(req, res) {
  const body = Buffer.from("404 Not Found", "utf8");
  res.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": body.length,
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

// ---------------------------------------------------------------- 请求入口
const server = http.createServer(function (req, res) {
  let urlObject;
  try {
    urlObject = new URL(req.url, "http://localhost");
  } catch (error) {
    return sendJson(res, 400, { error: "非法请求地址" });
  }

  const pathname = urlObject.pathname;

  if (req.method === "OPTIONS" && pathname.indexOf("/api/") === 0) {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  if (pathname === "/api/proxy") {
    return handleGenericProxy(req, res, urlObject);
  }

  for (let i = 0; i < PROXIES.length; i += 1) {
    const proxy = PROXIES[i];
    if (pathname.indexOf(proxy.prefix) === 0) {
      return handleProxy(
        req,
        res,
        proxy.target,
        proxy.prefix,
        proxy.headers,
        urlObject.search,
      );
    }
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, { error: "静态服务只支持 GET/HEAD" });
  }

  const file = resolveStatic(pathname);
  if (!file) return sendJson(res, 400, { error: "非法路径" });

  const hasExtension = path.extname(pathname) !== "";
  const target =
    pathname.slice(-1) === "/" ? path.join(file, "index.html") : file;

  fs.stat(target, function (error, stat) {
    if (!error && stat.isFile()) return serveFile(req, res, target, pathname);

    // 目录 → 目录下 index.html
    if (!error && stat.isDirectory()) {
      const indexFile = path.join(target, "index.html");
      return fs.stat(indexFile, function (indexError, indexStat) {
        if (!indexError && indexStat.isFile()) {
          return serveFile(req, res, indexFile, pathname);
        }
        notFound(req, res);
      });
    }

    // 无扩展名的路径 → SPA 路由，回退 index.html
    if (!hasExtension) {
      const fallback = path.join(ROOT, "index.html");
      return serveFile(req, res, fallback, "/", 200);
    }

    notFound(req, res);
  });
});

// ---------------------------------------------------------------- 启动
function fail(message) {
  console.error("");
  console.error("  [启动失败] " + message);
  console.error("");
  process.exit(1);
}

if (!fs.existsSync(ROOT)) {
  fail(
    "找不到前端目录：" +
      ROOT +
      "\n  请把构建产物 dist 里的文件复制到 web\\ 目录。",
  );
}
if (!fs.existsSync(path.join(ROOT, "index.html"))) {
  fail(
    "web\\index.html 不存在。\n  请把构建产物 dist 里的文件（含 index.html）复制到 web\\ 目录。",
  );
}

server.on("error", function (error) {
  if (error && error.code === "EADDRINUSE") {
    fail(
      "端口 " +
        PORT +
        " 已被占用。\n  换一个端口启动：node\\node.exe server.js --port 8081",
    );
  }
  if (error && error.code === "EACCES") {
    fail(
      "没有权限绑定端口 " +
        PORT +
        "。\n  改用 8080 以上端口，或以管理员身份运行。",
    );
  }
  fail((error && error.message) || String(error));
});

server.listen(PORT, HOST, function () {
  try {
    fs.writeFileSync(PID_FILE, String(process.pid));
  } catch (error) {
    /* 忽略：只影响 stop.bat */
  }

  const shown = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  console.log("");
  console.log("  XYZW Web Helper v" + VERSION);
  console.log("  静态目录: " + ROOT);
  console.log("  监听地址: " + HOST + ":" + PORT);
  console.log("  本机访问: http://" + shown + ":" + PORT + "/");
  if (HOST === "0.0.0.0") {
    console.log("  局域网:   http://<本机IP>:" + PORT + "/");
  }
  console.log("");
  console.log("  关闭服务: 按 Ctrl+C，或双击 stop.bat");
  console.log("");
});

function shutdown() {
  try {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  } catch (error) {
    /* ignore */
  }
  console.log("  服务已停止。");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
