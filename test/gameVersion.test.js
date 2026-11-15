import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildManifestUrl,
  buildProbeVersions,
  buildUpdateSummary,
  compareVersions,
  DEFAULT_GAME_CLIENT_VERSION,
  DEFAULT_GAME_CODE_VERSION,
  describeBundle,
  diffBundles,
  normalizeVersion,
  parseManifest,
  parseVersion,
  pickLatestVersion,
} from "../src/utils/gameVersion.js";

function manifestOf(bundles, extra = {}) {
  return parseManifest({ body: { bundleVers: bundles, ...extra } });
}

test("版本号解析与比较", () => {
  assert.equal(normalizeVersion(" 0.37.0 "), "0.37.0");
  assert.equal(normalizeVersion("0.37"), "");
  assert.equal(normalizeVersion("v0.37.0"), "");
  assert.equal(normalizeVersion(null), "");

  assert.deepEqual(parseVersion("2.54.2"), { major: 2, minor: 54, patch: 2 });
  assert.equal(parseVersion("abc"), null);

  assert.ok(compareVersions("2.54.2", "2.48.2") > 0);
  assert.ok(compareVersions("2.54.2", "2.54.2") === 0);
  assert.ok(compareVersions("0.37.0", "2.54.2") < 0);
  assert.ok(compareVersions("2.54.2", "2.54.10") < 0);
});

test("探测列表覆盖后续小版本与下一大版本", () => {
  const list = buildProbeVersions("0.36.0", { minorSpan: 3 });
  assert.deepEqual(list, ["0.37.0", "0.38.0", "0.39.0", "1.0.0", "2.0.0"]);
  assert.ok(!list.includes("0.36.0"));
});

test("清单地址带版本与平台参数", () => {
  assert.equal(
    buildManifestUrl("0.36.0"),
    "https://xxz-xyzw.hortorgames.com/login/manifest?platform=hortor&version=0.36.0-android",
  );
  assert.ok(buildManifestUrl("bad").includes(DEFAULT_GAME_CLIENT_VERSION));
});

test("清单解析：字符串/对象/空响应，并取出 codeVersion", () => {
  const fromString = parseManifest({
    body: {
      bundleVers: JSON.stringify({
        game: "abc",
        launcher: "def",
        codeVersion: "2.54.2",
      }),
    },
  });
  assert.equal(fromString.ok, true);
  assert.equal(fromString.bundleCount, 3);
  assert.equal(fromString.codeVersion, "2.54.2");

  const withMeta = parseManifest({
    body: {
      bundleVers: { game: "abc", COMMIT_ID: "xyz" },
      dataVers: "da6870e190",
    },
  });
  assert.equal(withMeta.commitId, "xyz");
  assert.equal(withMeta.dataVers, "da6870e190");
  assert.equal(withMeta.codeVersion, "");

  assert.equal(parseManifest({ body: {} }).ok, false);
  assert.equal(parseManifest({ body: { bundleVers: "not-json" } }).ok, false);
  assert.equal(parseManifest(null).ok, false);
  assert.equal(parseManifest({ body: { bundleVers: {} } }).ok, false);
});

test("挑选最新版本：按 codeVersion，而不是客户端版本号", () => {
  // 实测：0.36.0 的 codeVersion 是 2.54.2，0.37.0 反而是 0.37.0
  const results = [
    {
      version: "0.32.0",
      manifest: manifestOf({ game: "a", codeVersion: "2.48.2" }),
    },
    { version: "0.33.0", manifest: parseManifest({ body: {} }) },
    {
      version: "0.35.0",
      manifest: manifestOf({ game: "b", codeVersion: "2.45.2" }),
    },
    {
      version: "0.36.0",
      manifest: manifestOf({ game: "c", codeVersion: "2.54.2" }),
    },
    {
      version: "0.37.0",
      manifest: manifestOf({ game: "d", codeVersion: "0.37.0" }),
    },
    { version: "0.38.0", manifest: null },
  ];
  const latest = pickLatestVersion(results);
  assert.equal(latest.version, "0.36.0");
  assert.equal(latest.manifest.codeVersion, "2.54.2");

  assert.equal(pickLatestVersion([]), null);
  assert.equal(
    pickLatestVersion([{ version: "0.38.0", manifest: null }]),
    null,
  );

  // 全都没有 codeVersion 时退回按客户端版本挑
  const noCode = pickLatestVersion([
    { version: "0.35.0", manifest: manifestOf({ game: "x" }) },
    { version: "0.36.0", manifest: manifestOf({ game: "y" }) },
  ]);
  assert.equal(noCode.version, "0.36.0");
});

test("资源包差异统计", () => {
  const diff = diffBundles(
    { game: "old", ui_fguiBin: "1", onlyOld: "x" },
    { game: "new", ui_fguiBin: "2", ui_fiveYearSpecialActivity: "3" },
  );
  assert.deepEqual(diff.added, ["ui_fiveYearSpecialActivity"]);
  assert.deepEqual(diff.changed, ["game", "ui_fguiBin"]);
  assert.deepEqual(diff.removed, ["onlyOld"]);
  assert.equal(diff.addedCount, 1);
  assert.equal(diff.changedCount, 2);
  assert.equal(diff.removedCount, 1);
});

test("更新结论：按游戏版本(codeVersion)判定，并带上资源清单版本", () => {
  const currentManifest = manifestOf({
    game: "old",
    config: "c1",
    codeVersion: "2.48.2",
  });
  const latestManifest = manifestOf(
    {
      game: "new",
      config: "c2",
      codeVersion: "2.54.2",
      ui_fiveYearSpecialActivity: "x",
    },
    { dataVers: "dv1" },
  );

  const upgraded = buildUpdateSummary({
    currentCodeVersion: "2.48.2",
    currentClientVersion: "0.32.0",
    currentManifest,
    latest: { version: "0.36.0", manifest: latestManifest },
  });
  assert.equal(upgraded.hasUpdate, true);
  assert.equal(upgraded.codeChanged, true);
  assert.equal(upgraded.currentVersion, "2.48.2");
  assert.equal(upgraded.latestVersion, "2.54.2");
  assert.equal(upgraded.currentClientVersion, "0.32.0");
  assert.equal(upgraded.latestClientVersion, "0.36.0");
  assert.equal(upgraded.bundles.addedCount, 1);
  assert.equal(upgraded.latestBundleCount, 4);
  assert.equal(upgraded.dataVers, "dv1");

  // 版本号一致、资源完全一致 → 无需更新
  const upToDate = buildUpdateSummary({
    currentCodeVersion: "2.54.2",
    currentClientVersion: "0.36.0",
    currentManifest: latestManifest,
    latest: { version: "0.36.0", manifest: latestManifest },
  });
  assert.equal(upToDate.hasUpdate, false);
  assert.equal(upToDate.currentInvalid, false);

  // 同版本但资源包变了 → 也算更新
  const contentOnly = buildUpdateSummary({
    currentCodeVersion: "2.54.2",
    currentClientVersion: "0.36.0",
    currentManifest,
    latest: { version: "0.36.0", manifest: latestManifest },
  });
  assert.equal(contentOnly.hasUpdate, true);
  assert.equal(contentOnly.codeChanged, false);

  // 当前清单失效（版本被下线）→ 必须允许切换
  const invalid = buildUpdateSummary({
    currentCodeVersion: "1.89.8",
    currentClientVersion: "0.31.0",
    currentManifest: parseManifest({ body: {} }),
    latest: { version: "0.36.0", manifest: latestManifest },
  });
  assert.equal(invalid.currentInvalid, true);
  assert.equal(invalid.hasUpdate, true);

  // 一个有效清单都没有
  const none = buildUpdateSummary({
    currentCodeVersion: "1.89.8",
    currentClientVersion: "0.32.0",
    currentManifest: null,
    latest: null,
  });
  assert.equal(none.latestVersion, "");
  assert.equal(none.hasUpdate, false);
});

test("默认版本与资源包分类", () => {
  assert.equal(DEFAULT_GAME_CLIENT_VERSION, "0.36.0");
  assert.equal(DEFAULT_GAME_CODE_VERSION, "2.54.2");

  assert.equal(describeBundle("ui_fiveYearSpecialActivity"), "周年活动");
  assert.equal(describeBundle("ui_legionWarCupAd_summer"), "军团战/联赛广告位");
  assert.equal(describeBundle("ui_springFestival24"), "节日活动");
  assert.equal(describeBundle("pearl_yuling_1125"), "鱼灵/珍珠");
  assert.equal(describeBundle("ui_fguiBin"), "界面资源");
  assert.equal(describeBundle("map_80040"), "地图资源");
  assert.equal(describeBundle("somethingElse"), "其它资源");
});

test("游戏页使用注入的版本，而不是写死旧版本", () => {
  const main = fs.readFileSync(
    new URL("../public/game/main.2a00e.js", import.meta.url),
    "utf8",
  );
  assert.match(main, /__XYZW_CLIENT_VERSION__/);
  assert.match(main, /xyzw:gameClientVersion/);
  assert.doesNotMatch(main, /version=0\.32\.0-android/);

  const bridge = fs.readFileSync(
    new URL("../public/game/xyzw-sound.js", import.meta.url),
    "utf8",
  );
  assert.match(bridge, /__XYZW_CLIENT_VERSION__/);
  assert.match(bridge, /__XYZW_GAME_VERSION__/);
  assert.match(bridge, /xyzw:gameVersion/);
  assert.match(bridge, /xyzw:version/);

  const defines = fs.readFileSync(
    new URL("../public/game/game-defines.a175e.js", import.meta.url),
    "utf8",
  );
  assert.match(defines, /__XYZW_GAME_VERSION__/);
  assert.doesNotMatch(defines, /GAME_VERSION = '1\.89\.8-wx'/);
  assert.doesNotMatch(defines, /CODE_VERSION = '1\.89\.8'/);
});
