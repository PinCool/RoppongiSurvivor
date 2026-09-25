/**
 * 効果音を「鳴らすか・どの波形・どのピッチ」で決める（Phaser に依存しない。tests/voicePolicy.test.ts）。
 * TokyoSurvivor の SfxVoicePolicy と同じ決まり:
 * - 同じ音は min_interval_seconds 以内なら鳴らさない（大量ヒットでも 1 発。落とした分を足して大きくはしない）
 * - 同時に鳴っている数が max_voices なら鳴らさない
 * - 波形は直前と別の番号、ピッチは幅の中で一様
 */
export interface SfxDef {
  id: string;
  clips: string[];
  volume: number;
  pitch_min: number;
  pitch_max: number;
  max_voices: number;
  min_interval_seconds: number;
}

export interface PlayDecision {
  clip: string;
  volume: number;
  rate: number;
}

export class VoicePolicy {
  private readonly _defs = new Map<string, SfxDef>();
  private readonly _lastPlayed = new Map<string, number>();
  private readonly _lastClip = new Map<string, number>();
  /** id -> 鳴り終わる時刻の列 */
  private readonly _voices = new Map<string, number[]>();

  constructor(defs: SfxDef[], private readonly _random: () => number = Math.random) {
    for (const def of defs) this._defs.set(def.id, def);
  }

  has(id: string): boolean {
    return this._defs.has(id);
  }

  /** now と、鳴らしたときの長さ（秒）から決める。鳴らさないなら null */
  decide(id: string, now: number, durationOf: (clip: string) => number): PlayDecision | null {
    const def = this._defs.get(id);
    if (!def || def.clips.length === 0) return null;
    const last = this._lastPlayed.get(id);
    if (last !== undefined && now - last < def.min_interval_seconds) return null;
    const voices = (this._voices.get(id) ?? []).filter((end) => end > now);
    if (voices.length >= def.max_voices) {
      this._voices.set(id, voices);
      return null;
    }

    let index = Math.floor(this._random() * def.clips.length);
    const previous = this._lastClip.get(id);
    if (def.clips.length > 1 && index === previous) index = (index + 1) % def.clips.length;
    const clip = def.clips[index] as string;
    const rate = def.pitch_min + (def.pitch_max - def.pitch_min) * this._random();

    this._lastPlayed.set(id, now);
    this._lastClip.set(id, index);
    voices.push(now + durationOf(clip) / rate);
    this._voices.set(id, voices);
    return { clip, volume: def.volume, rate };
  }
}
