import { useLocalStorage } from "@vueuse/core";

/**
 * 进入游戏后的声音开关
 *
 * 关闭时不只是静音：音乐、音效、震动、点击音效会一起关掉
 * （public/game/xyzw-sound.js 会拦截 cc.audioEngine 的播放与震动接口）。
 *
 * 默认 true（有声音）。另外游戏默认锁定 60 帧、不进入省电模式，
 * 与这个开关无关，始终生效。
 */
export const gameSoundEnabled = useLocalStorage("xyzw:gameSound", true);

/** 把当前开关状态推给已打开的游戏 iframe */
export function broadcastGameSound() {
  try {
    const payload = {
      type: "xyzw:sound",
      enabled: Boolean(gameSoundEnabled.value),
    };
    document.querySelectorAll("iframe").forEach((frame) => {
      frame.contentWindow?.postMessage(payload, window.location.origin);
    });
  } catch {
    // ignore
  }
}

export function setGameSound(value) {
  gameSoundEnabled.value = Boolean(value);
  // storage 事件在 iframe 内会触发；这里再补一次 postMessage，确保立即生效
  broadcastGameSound();
}
