/*
 * XYZW 游戏运行时补丁（在游戏页面内运行，早于游戏 runtime）
 *
 * 1) 声音开关：读取 localStorage["xyzw:gameSound"]
 *      "false" / "0" → 关闭（音乐、音效、震动、点击音效全部关掉）
 *      其余（含未设置）→ 保持开启
 *    主站切换开关会写该键 + postMessage，双通道即时生效。
 *
 * 2) 性能默认值：永不进入省电模式、锁定 60 帧。
 *    游戏自身若调用 setFrameRate(30) / setAnimationInterval(1/30) 降帧，
 *    这里会把值抬回 60，等价于“自动进入省电模式 = 永不”。
 *
 * 静音不只是调音量：游戏播点击音效时会显式传音量，所以直接拦截
 * cc.audioEngine 的播放方法，保证关闭后一个声音都出不来。
 */
(function () {
  "use strict";

  var SOUND_KEY = "xyzw:gameSound";
  var PERF_KEY = "xyzw:gamePerf";

  var engine = null;
  var mediaPatched = false;
  var forced = null;
  var lastEnabled = null;
  var perfPatched = false;

  // 多开页会在本脚本之后安装 storage bridge，把 localStorage 变成按账号隔离的代理。
  // 这里先抓住原生实现，保证仍能读到主站写入的全局开关。
  var rawStorage = null;
  var nativeGetItem = null;
  try {
    rawStorage = window.localStorage;
    nativeGetItem = window.Storage && window.Storage.prototype.getItem;
  } catch (error) {
    // ignore
  }

  function readStored(key) {
    try {
      if (nativeGetItem && rawStorage) {
        return nativeGetItem.call(rawStorage, key);
      }
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function isEnabled() {
    if (forced !== null) return forced;
    var value = readStored(SOUND_KEY);
    if (value === null) return true;
    return value !== "false" && value !== "0";
  }

  /** 性能档位：默认 high（60 帧、不省电）；写 "auto" 可恢复游戏自身设置 */
  function isHighPerformance() {
    var value = readStored(PERF_KEY);
    return value !== "auto" && value !== "0" && value !== "false";
  }

  function findCocos() {
    var candidates = [window.cc, window.CC, window.cocos];
    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = candidates[i];
      if (candidate && (candidate.audioEngine || candidate.game)) {
        return candidate;
      }
    }
    try {
      var keys = Object.keys(window);
      for (var k = 0; k < keys.length && k < 600; k += 1) {
        var value = window[keys[k]];
        if (value && typeof value === "object" && value.audioEngine) {
          return value;
        }
      }
    } catch (error) {
      // ignore
    }
    return null;
  }

  function findEngine() {
    if (engine && engine.__xyzwPatched) return engine;
    var cocos = findCocos();
    if (!cocos) return null;
    engine = cocos.audioEngine || null;
    patchAudioEngine(engine);
    patchVibration(cocos);
    return engine;
  }

  var AUDIO_METHODS = [
    "play",
    "play2d",
    "playEffect",
    "playMusic",
    "playEffectAsync",
  ];

  /**
   * 关闭时直接拦截播放调用：游戏播点击音效会显式传音量，
   * 只改 setEffectsVolume 挡不住，必须在入口拦。
   */
  function patchAudioEngine(audioEngine) {
    if (!audioEngine || audioEngine.__xyzwPatched) return audioEngine;
    audioEngine.__xyzwPatched = true;
    for (var i = 0; i < AUDIO_METHODS.length; i += 1) {
      (function (name) {
        var original = audioEngine[name];
        if (typeof original !== "function") return;
        audioEngine[name] = function () {
          if (!isEnabled()) return -1;
          return original.apply(audioEngine, arguments);
        };
      })(AUDIO_METHODS[i]);
    }
    return audioEngine;
  }

  function patchVibration(cocos) {
    try {
      var navigatorRef = window.navigator;
      if (
        navigatorRef &&
        typeof navigatorRef.vibrate === "function" &&
        !navigatorRef.__xyzwPatched
      ) {
        navigatorRef.__xyzwPatched = true;
        var originalVibrate = navigatorRef.vibrate;
        navigatorRef.vibrate = function () {
          if (!isEnabled()) return false;
          return originalVibrate.apply(navigatorRef, arguments);
        };
      }
    } catch (error) {
      // ignore
    }

    try {
      var device = cocos && cocos.Device;
      if (!device || device.__xyzwPatched) return;
      device.__xyzwPatched = true;
      ["vibrate", "vibrateShort", "vibrateLong"].forEach(function (name) {
        var original = device[name];
        if (typeof original !== "function") return;
        device[name] = function () {
          if (!isEnabled()) return;
          return original.apply(device, arguments);
        };
      });
    } catch (error) {
      // ignore
    }
  }

  function applyMedia(enabled) {
    try {
      var nodes = document.querySelectorAll("audio,video");
      for (var i = 0; i < nodes.length; i += 1) {
        var node = nodes[i];
        if (node.muted !== !enabled) node.muted = !enabled;
        try {
          node.volume = enabled ? 1 : 0;
        } catch (error) {
          // ignore
        }
      }
    } catch (error) {
      // ignore
    }
  }

  function apply() {
    var enabled = isEnabled();
    var audioEngine = findEngine();

    if (audioEngine) {
      try {
        if (typeof audioEngine.setMusicVolume === "function") {
          audioEngine.setMusicVolume(enabled ? 1 : 0);
        }
      } catch (error) {
        // ignore
      }
      try {
        if (typeof audioEngine.setEffectsVolume === "function") {
          audioEngine.setEffectsVolume(enabled ? 1 : 0);
        }
      } catch (error) {
        // ignore
      }
      // 从开启切到关闭时，把正在播的音效立刻停掉
      if (lastEnabled === true && !enabled) {
        try {
          if (typeof audioEngine.stopAllEffects === "function") {
            audioEngine.stopAllEffects();
          }
        } catch (error) {
          // ignore
        }
      }
    }

    applyMedia(enabled);
    lastEnabled = enabled;
    return enabled;
  }

  /**
   * 永不省电 + 60 帧：
   * 游戏若用 setFrameRate(30) / setAnimationInterval(1/30) 进入省电，
   * 这里把调用抬回 60，并周期性重申，避免被游戏覆盖。
   */
  function applyPerformance() {
    if (!isHighPerformance()) return;
    var cocos = findCocos();
    if (!cocos) return;

    try {
      var game = cocos.game;
      if (game) {
        if (!game.__xyzwFpsPatched) {
          game.__xyzwFpsPatched = true;
          var originalSetFrameRate = game.setFrameRate;
          if (typeof originalSetFrameRate === "function") {
            game.setFrameRate = function (fps) {
              var target = Number(fps);
              return originalSetFrameRate.call(
                this,
                Number.isFinite(target) && target > 60 ? target : 60,
              );
            };
          }
        }
        if (typeof game.setFrameRate === "function") game.setFrameRate(60);
        if (game.config) game.config.frameRate = 60;
      }
    } catch (error) {
      // ignore
    }

    try {
      var director = cocos.director;
      if (director) {
        if (!director.__xyzwAnimPatched) {
          director.__xyzwAnimPatched = true;
          var originalSetInterval = director.setAnimationInterval;
          if (typeof originalSetInterval === "function") {
            director.setAnimationInterval = function (interval) {
              var value = Number(interval);
              if (!Number.isFinite(value) || value <= 0) {
                return originalSetInterval.call(this, interval);
              }
              return originalSetInterval.call(this, Math.min(value, 1 / 60));
            };
          }
        }
        if (!perfPatched) {
          perfPatched = true;
          if (typeof director.setAnimationInterval === "function") {
            director.setAnimationInterval(1 / 60);
          }
        }
      }
    } catch (error) {
      // ignore
    }
  }

  // 所有 <audio>/<video> 的 play() 都按当前开关静音
  if (!mediaPatched && window.HTMLMediaElement) {
    mediaPatched = true;
    var originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!isEnabled()) {
        try {
          this.muted = true;
          this.volume = 0;
        } catch (error) {
          // ignore
        }
      }
      return originalPlay.apply(this, arguments);
    };
  }

  window.__xyzwApplySound = apply;
  window.__xyzwApplyPerformance = applyPerformance;

  window.addEventListener("storage", function (event) {
    if (!event || !event.key || event.key === SOUND_KEY) apply();
  });

  window.addEventListener("message", function (event) {
    if (!event) return;
    if (event.data === "xyzw:sound-changed") {
      apply();
      return;
    }
    if (event.data && event.data.type === "xyzw:sound") {
      forced = Boolean(event.data.enabled);
      apply();
    }
  });

  document.addEventListener("visibilitychange", function () {
    apply();
    applyPerformance();
  });

  apply();
  applyPerformance();
  setInterval(apply, 1000);
  setInterval(applyPerformance, 3000);
})();
