import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { VoicePolicy, type SfxDef } from '../src/game/audio/voicePolicy';

const def = (over: Partial<SfxDef> = {}): SfxDef => ({
  id: 'hit', clips: ['a', 'b', 'c'], volume: 0.7, pitch_min: 1, pitch_max: 1.2, max_voices: 2, min_interval_seconds: 0.05, ...over,
});
const len = () => 0.3;

describe('効果音の間引き', () => {
  it('同じ音は最短間隔より詰めて鳴らさない', () => {
    const p = new VoicePolicy([def()], () => 0.5);
    expect(p.decide('hit', 0, len)).not.toBeNull();
    expect(p.decide('hit', 0.01, len)).toBeNull();
    expect(p.decide('hit', 0.06, len)).not.toBeNull();
  });

  it('同時発音の上限を超えない。鳴り終われば空く', () => {
    const p = new VoicePolicy([def({ min_interval_seconds: 0 })], () => 0.5);
    expect(p.decide('hit', 0, len)).not.toBeNull();
    expect(p.decide('hit', 0.1, len)).not.toBeNull();
    expect(p.decide('hit', 0.2, len)).toBeNull();
    expect(p.decide('hit', 0.9, len)).not.toBeNull();
  });

  it('波形は直前と別、ピッチは幅の中', () => {
    const p = new VoicePolicy([def({ min_interval_seconds: 0, max_voices: 99 })], () => 0);
    const a = p.decide('hit', 0, len)!;
    const b = p.decide('hit', 1, len)!;
    expect(a.clip).not.toBe(b.clip);
    for (let i = 0; i < 20; i++) {
      const r = new VoicePolicy([def()], Math.random).decide('hit', 0, len)!.rate;
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(1.2);
    }
  });

  it('知らない音は鳴らさない', () => {
    expect(new VoicePolicy([def()]).decide('nope', 0, len)).toBeNull();
  });
});

describe('ライセンスの見張り', () => {
  it('音声ファイルはリポジトリに入れない（Case Portman は単体で落とせる形の公開が禁止。リポジトリは public）', () => {
    const tracked = execSync('git ls-files', { cwd: __dirname + '/..' }).toString().split('\n');
    expect(tracked.filter((f) => /\.(wav|mp3|m4a|ogg|aac|flac)$/i.test(f))).toEqual([]);
  });
});
