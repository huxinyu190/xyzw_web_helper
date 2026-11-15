import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildManifestUrl,
  buildProbeVersions,
  buildUpdateSummary,
  compareVersions,
  DEFAULT_GAME_CLIENT_VERSION,
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

  assert.deepEqual(parseVersion("0.37.2"), { major: 0, minor: 37, patch: 2 });
  assert.equal(parseVersion("abc"), null);

  assert.ok(compareVersions("0.37.0", "0.36.0") > 0);
  assert.ok(compareVersions("0.37.0", "0.37.0") === 0);
  assert.ok(compareVersions("1.0.0", "0.99.9") > 0);
  assert.ok(compareVersions("0.32.0", "0.32.10") < 0);
});

test("探测列表覆盖后续小版本与下一大版本", () => {
  const list = buildProbeVersions("0.32.0", { minorSpan: 3 });
  assert.deepEqual(list, ["0.33.0", "0.34.0", "0.35.0", "1.0.0", "2.0.0"]);
  assert.ok(!list.includes("0.32.0"));

  const from037 = buildProbeVersions("0.37.0", { minorSpan: 2 });
  assert.deepEqual(from037, ["0.38.0", "0.39.0", "1.0.0", "2.0.0"]);
});

test("清单地址带版本与平台参数", () => {
  assert.equal(
    buildManifestUrl("0.37.0"),
    "https://xxz-xyzw.hortorgames.com/login/manifest?platform=hortor&version=0.37.0-android",
  );
  // 非法版本回退到默认值
  assert.ok(buildManifestUrl("bad").includes(DEFAULT_GAME_CLIENT_VERSION));
});

test("清单解析：字符串/对象/空响应", () => {
  const fromString = parseManifest({
    body: { bundleVers: JSON.stringify({ game: "abc", launcher: "def" }) },
  });
  assert.equal(fromString.ok, true);
  assert.equal(fromString.bundleCount, 2);
  assert.equal(fromString.game, "abc");

  const withMeta = parseManifest({
    body: {
      bundleVers: { game: "abc", COMMIT_ID: "xyz" },
      dataVers: "da6870e190",
    },
  });
  assert.equal(withMeta.commitId, "xyz");
  assert.equal(withMeta.dataVers, "da6870e190");

  assert.equal(parseManifest({ body: {} }).ok, false);
  assert.equal(parseManifest({ body: { bundleVers: "not-json" } }).ok, false);
  assert.equal(parseManifest(null).ok, false);
  assert.equal(parseManifest({ body: { bundleVers: {} } }).ok, false);
});

test("挑选最高有效版本，忽略空清单", () => {
  const results = [
    { version: "0.32.0", manifest: manifestOf({ game: "a" }) },
    { version: "0.33.0", manifest: parseManifest({ body: {} }) },
    { version: "0.36.0", manifest: manifestOf({ game: "b" }) },
    { version: "0.37.0", manifest: manifestOf({ game: "c" }) },
    { version: "0.35.0", manifest: null },
  ];
  const latest = pickLatestVersion(results);
  assert.equal(latest.version, "0.37.0");
  assert.equal(latest.manifest.game, "c");

  assert.equal(pickLatestVersion([]), null);
  assert.equal(
    pickLatestVersion([{ version: "0.38.0", manifest: null }]),
    null,
  );
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

test("更新结论：版本升了、同版本内容变了、当前版本失效", () => {
  const currentManifest = manifestOf({ game: "old", config: "c1" });
  const latestManifest = manifestOf(
    { game: "new", config: "c2", ui_fiveYearSpecialActivity: "x" },
    { dataVers: "dv1" },
  );

  const upgraded = buildUpdateSummary({
    current: "0.32.0",
    currentManifest,
    latest: { version: "0.37.0", manifest: latestManifest },
  });
  assert.equal(upgraded.hasUpdate, true);
  assert.equal(upgraded.latestVersion, "0.37.0");
  assert.equal(upgraded.bundles.addedCount, 1);
  assert.equal(upgraded.latestBundleCount, 3);
  assert.equal(upgraded.dataVers, "dv1");

  // 版本号没变，但资源包变了 → 也算有更新
  const sameVersion = buildUpdateSummary({
    current: "0.37.0",
    currentManifest,
    latest: { version: "0.37.0", manifest: latestManifest },
  });
  assert.equal(sameVersion.hasUpdate, true);

  // 完全一致 → 无需更新
  const upToDate = buildUpdateSummary({
    current: "0.37.0",
    currentManifest: latestManifest,
    latest: { version: "0.37.0", manifest: latestManifest },
  });
  assert.equal(upToDate.hasUpdate, false);
  assert.equal(upToDate.currentInvalid, false);

  // 当前版本已下线
  const invalid = buildUpdateSummary({
    current: "0.32.0",
    currentManifest: parseManifest({ body: {} }),
    latest: { version: "0.37.0", manifest: latestManifest },
  });
  assert.equal(invalid.currentInvalid, true);
  // 失效版本必须允许切回可用版本
  assert.equal(invalid.hasUpdate, true);

  // 一个有效清单都没有
  const none = buildUpdateSummary({
    current: "0.32.0",
    currentManifest: null,
    latest: null,
  });
  assert.equal(none.latestVersion, "");
  assert.equal(none.hasUpdate, false);
});

test("资源包名转成可读分类", () => {
  assert.equal(describeBundle("ui_fiveYearSpecialActivity"), "周年活动");
  assert.equal(describeBundle("ui_legionWarCupAd_summer"), "军团战/联赛广告位");
  assert.equal(describeBundle("ui_springFestival24"), "节日活动");
  assert.equal(describeBundle("pearl_yuling_1125"), "鱼灵/珍珠");
  assert.equal(describeBundle("ui_fguiBin"), "界面资源");
  assert.equal(describeBundle("map_80040"), "地图资源");
  assert.equal(describeBundle("somethingElse"), "其它资源");
});

test("游戏页使用可配置版本请求清单，而不是写死 0.32.0", () => {
  const source = fs.readFileSync(
    new URL("../public/game/main.2a00e.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /__XYZW_CLIENT_VERSION__/);
  assert.match(source, /xyzw:gameClientVersion/);
  assert.doesNotMatch(source, /version=0\.32\.0-android/);

  const bridge = fs.readFileSync(
    new URL("../public/game/xyzw-sound.js", import.meta.url),
    "utf8",
  );
  assert.match(bridge, /__XYZW_CLIENT_VERSION__/);
  assert.match(bridge, /xyzw:version/);
});
