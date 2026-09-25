import type Phaser from 'phaser';
import { VoicePolicy, type SfxDef } from './voicePolicy';

/**
 * 効果音の入口。どのシーンからも sfx.play('ui_confirm') で鳴らす。
 * 音の定義と波形は public/assets/audio/（gitignore。tools/import_tokyo_sfx.py が作る）にあり、
 * 無ければ（公開版・取り込み前）黙って何も鳴らさない。
 */
const CATALOG_KEY = 'sfx-catalog';
const MUTE_KEY = 'roppongi-survivor.muted';

export type SfxId =
  | 'ui_select' | 'ui_confirm' | 'ui_cancel' | 'ui_error' | 'title_press'
  | 'hit_penlight' | 'pickup_exp' | 'pickup_item' | 'player_hurt' | 'level_up'
  | 'goal_open' | 'boss_arrival' | 'run_clear' | 'run_late' | 'run_defeat'
  | 'talk_open' | 'recruit_join' | 'recruit_fail'
  | 'shop_request_ok' | 'shop_request_fail' | 'shop_settle' | 'activity_clear';

class Sfx {
  private _game: Phaser.Game | null = null;
  private _policy: VoicePolicy | null = null;
  private _muted = readMuted();

  /** Boot の preload で呼ぶ。定義が読めたら、同じ読み込みの中で波形も積む */
  preload(scene: Phaser.Scene): void {
    scene.load.json(CATALOG_KEY, 'assets/audio/sfx.json');
    scene.load.on(`filecomplete-json-${CATALOG_KEY}`, (_key: string, _type: string, data: { sfx: SfxDef[] }) => {
      for (const def of data.sfx) for (const clip of def.clips) scene.load.audio(`sfx:${clip}`, `assets/audio/sfx/${clip}.m4a`);
    });
  }

  /** Boot の create で呼ぶ */
  init(game: Phaser.Game): void {
    this._game = game;
    const data = game.cache.json.get(CATALOG_KEY) as { sfx: SfxDef[] } | undefined;
    this._policy = data ? new VoicePolicy(data.sfx.filter((def) => def.clips.every((clip) => game.cache.audio.exists(`sfx:${clip}`)))) : null;
  }

  get available(): boolean {
    return this._policy !== null;
  }

  get muted(): boolean {
    return this._muted;
  }

  toggleMute(): boolean {
    this._muted = !this._muted;
    try {
      window.localStorage.setItem(MUTE_KEY, this._muted ? '1' : '0');
    } catch {
      // 保存できなくても今回の起動では効く
    }
    return this._muted;
  }

  play(id: SfxId): void {
    const game = this._game;
    const policy = this._policy;
    if (!game || !policy || this._muted) return;
    const now = game.loop.time / 1000;
    const decision = policy.decide(id, now, (clip) => durationOf(game, clip));
    if (!decision) return;
    game.sound.play(`sfx:${decision.clip}`, { volume: decision.volume, rate: decision.rate });
  }
}

function durationOf(game: Phaser.Game, clip: string): number {
  const buffer = game.cache.audio.get(`sfx:${clip}`) as AudioBuffer | undefined;
  return buffer?.duration ?? 0.5;
}

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export const sfx = new Sfx();
