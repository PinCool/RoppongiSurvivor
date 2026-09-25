import { describe, expect, it } from 'vitest';
import { TapGuard } from '../src/game/ui/tapGuard';

describe('ボタンのタップ判定', () => {
  it('上で押して上で離したら反応する', () => {
    const g = new TapGuard(0, 0);
    g.down(100);
    expect(g.up()).toBe(true);
  });

  it('別の場所で押してドラッグしてきた指が上で離れても反応しない（お客に向かって動かしていた指）', () => {
    const g = new TapGuard(0, 0);
    expect(g.up()).toBe(false);
  });

  it('押したまま外へ出たら取り消し', () => {
    const g = new TapGuard(0, 0);
    g.down(100);
    g.cancel();
    expect(g.up()).toBe(false);
  });

  it('出た直後の押し始めは受け付けない。時間が経てば受け付ける', () => {
    const g = new TapGuard(1000, 350);
    g.down(1200);
    expect(g.up()).toBe(false);
    g.down(1400);
    expect(g.up()).toBe(true);
  });

  it('1 回のタップで 1 回だけ', () => {
    const g = new TapGuard(0, 0);
    g.down(1);
    expect(g.up()).toBe(true);
    expect(g.up()).toBe(false);
  });
});
