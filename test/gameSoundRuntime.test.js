import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const SOURCE = fs.readFileSync(
  new URL("../public/game/xyzw-sound.js", import.meta.url),
  "utf8",
);

class NativeStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }

  get length() {
    return this.values.size;
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }

  clear() {
    this.values.clear();
  }
}

function createRuntime(initial = {}) {
  const storage = new NativeStorage(initial);
  const listeners = { window: {}, document: {} };
  const intervals = new Map();
  const calls = {
    play: 0,
    playEffect: 0,
    playMusic: 0,
    musicVolume: [],
    effectsVolume: [],
    vibrate: 0,
    setFrameRate: [],
    animationInterval: [],
  };

  const audioEngine = {
    play() {
      calls.play += 1;
      return 1;
    },
    playEffect() {
      calls.playEffect += 1;
      return 2;
    },
    playMusic() {
      calls.playMusic += 1;
    },
    stopAllEffects() {},
    setMusicVolume(value) {
      calls.musicVolume.push(value);
    },
    setEffectsVolume(value) {
      calls.effectsVolume.push(value);
    },
  };

  const director = {
    setAnimationInterval(value) {
      calls.animationInterval.push(value);
    },
  };

  const game = {
    config: { frameRate: 30 },
    setFrameRate(value) {
      calls.setFrameRate.push(value);
    },
  };

  const device = {};

  const media = { muted: false, volume: 1, played: 0 };
  function HTMLMediaElement() {}
  HTMLMediaElement.prototype.play = function play() {
    media.played += 1;
    return Promise.resolve();
  };

  const navigatorRef = {
    vibrate() {
      calls.vibrate += 1;
      return true;
    },
  };

  const documentRef = {
    querySelectorAll(selector) {
      return selector === "audio,video" ? [media] : [];
    },
    addEventListener(type, handler) {
      (listeners.document[type] ||= []).push(handler);
    },
  };

  const windowRef = {
    localStorage: storage,
    navigator: navigatorRef,
    document: documentRef,
    HTMLMediaElement,
    Storage: { prototype: NativeStorage.prototype },
    cc: { audioEngine, director, game, Device: device },
    addEventListener(type, handler) {
      (listeners.window[type] ||= []).push(handler);
    },
  };
  windowRef.window = windowRef;

  const sandbox = {
    window: windowRef,
    document: documentRef,
    navigator: navigatorRef,
    localStorage: storage,
    HTMLMediaElement,
    Storage: { prototype: NativeStorage.prototype },
    setInterval(fn, delay) {
      intervals.set(delay, fn);
      return intervals.size;
    },
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);

  return {
    storage,
    calls,
    media,
    game,
    director,
    listeners,
    window: windowRef,
    emit(type, payload) {
      for (const handler of listeners.window[type] || []) handler(payload);
    },
  };
}

test("默认开启：不拦截播放、不静音、不改帧率上限", () => {
  const runtime = createRuntime();
  assert.equal(runtime.window.__xyzwApplySound(), true);
  runtime.window.cc.audioEngine.playEffect("click", false, 1);
  assert.equal(runtime.calls.playEffect, 1);
  assert.equal(runtime.calls.musicVolume.at(-1), 1);
  assert.equal(runtime.calls.effectsVolume.at(-1), 1);
  assert.equal(runtime.media.muted, false);
  assert.equal(runtime.window.navigator.vibrate(), true);
  assert.equal(runtime.calls.vibrate, 1);
});

test("关闭开关：音乐、音效、震动、点击音效全部关掉", () => {
  const runtime = createRuntime({ "xyzw:gameSound": "false" });
  assert.equal(runtime.window.__xyzwApplySound(), false);

  // 播放入口被拦截：点击音效即使显式传音量也发不出声
  assert.equal(runtime.calls.playEffect, 0);
  assert.equal(runtime.calls.play, 0);
  assert.equal(runtime.calls.playMusic, 0);
  assert.equal(runtime.window.cc.audioEngine.playEffect("click", false, 1), -1);

  // 音量归零、媒体静音、震动被拦
  assert.equal(runtime.calls.musicVolume.at(-1), 0);
  assert.equal(runtime.calls.effectsVolume.at(-1), 0);
  assert.equal(runtime.media.muted, true);
  assert.equal(runtime.media.volume, 0);
  assert.equal(runtime.window.navigator.vibrate(200), false);
  assert.equal(runtime.calls.vibrate, 0);
});

test("重新打开：播放与震动恢复", () => {
  const runtime = createRuntime({ "xyzw:gameSound": "false" });
  runtime.window.__xyzwApplySound();
  runtime.storage.setItem("xyzw:gameSound", "true");
  assert.equal(runtime.window.__xyzwApplySound(), true);
  runtime.window.cc.audioEngine.playEffect("click", false, 1);
  assert.equal(runtime.calls.playEffect, 1);
  assert.equal(runtime.window.navigator.vibrate(200), true);
});

test("父页面 postMessage 立即生效（批量打开页使用）", () => {
  const runtime = createRuntime();
  runtime.emit("message", { data: { type: "xyzw:sound", enabled: false } });
  assert.equal(runtime.calls.effectsVolume.at(-1), 0);
  assert.equal(runtime.window.cc.audioEngine.playEffect("click"), -1);

  runtime.emit("message", { data: { type: "xyzw:sound", enabled: true } });
  assert.equal(runtime.calls.effectsVolume.at(-1), 1);
});

test("默认锁定 60 帧、阻止降帧省电", () => {
  const runtime = createRuntime();
  assert.equal(runtime.game.config.frameRate, 60);
  assert.equal(runtime.calls.setFrameRate.at(-1), 60);

  // 游戏进入省电模式试图降到 30 帧 → 被抬回 60
  runtime.game.setFrameRate(30);
  assert.equal(runtime.calls.setFrameRate.at(-1), 60);

  runtime.director.setAnimationInterval(1 / 30);
  assert.equal(runtime.calls.animationInterval.at(-1).toFixed(4), "0.0167");

  // 更高帧率不被压低
  runtime.game.setFrameRate(120);
  assert.equal(runtime.calls.setFrameRate.at(-1), 120);
});

test("写 xyzw:gamePerf=auto 可恢复游戏自身的省电/帧率设置", () => {
  const runtime = createRuntime({ "xyzw:gamePerf": "auto" });
  runtime.window.__xyzwApplyPerformance();
  assert.equal(runtime.game.config.frameRate, 30);
  assert.deepEqual(runtime.calls.setFrameRate, []);
});
