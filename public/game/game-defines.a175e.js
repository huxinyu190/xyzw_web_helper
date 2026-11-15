'use strict'
const gt =
  typeof globalThis === 'object' ? globalThis : typeof window === 'object' ? window : global
gt.PLATFORM = 'h5web'
gt.SUB_PLATFORM = ''
gt.ENV = 'Prod'
gt.APPID = 'wx0840558555a454ed'
gt.APPID = ''
gt.CDN = 'https://xxz-xyzw-res.hortorgames.com'
gt.SERVER = 'https://xxz-xyzw.hortorgames.com'
gt.GAME_NAME = '咸鱼之王'
gt.GAME_ID = 'xyzw_mix'
// 版本号由主站「检查更新」注入（见 public/game/xyzw-sound.js）。
// CODE_VERSION 必须与官方资源清单里的 codeVersion 一致，否则游戏会判定
// 「版本不一致」并强制重启，新活动也会被锁。
gt.CODE_VERSION =
  (typeof window === 'object' && window.__XYZW_GAME_VERSION__) || '2.54.2'
gt.GAME_VERSION = /-/.test(gt.CODE_VERSION) ? gt.CODE_VERSION : gt.CODE_VERSION + '-wx'
gt.COMMIT_ID = ''
gt.CONFIG_COMMIT_ID = ''
gt.RESOURCES_COMMIT_ID = ''
gt.DOWNLOAD_URL = ''
gt.CDNS = ['https://xxz-xyzw-res.hortorgames.com', 'https://xxz-xyzw-alires.hortorgames.com']
gt.VERSION_POSTFIX = ''
gt.BATTLE_OSS_URL = 'https://xxz-xyzw-service-battle.hortorgames.com'
