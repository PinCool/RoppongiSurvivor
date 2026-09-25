/**
 * ボタンが「ちゃんとタップされた」かの判定（Phaser に依存しない。tests/tapGuard.test.ts）。
 *
 * 押したのがこのボタンの上で、離したのもこのボタンの上のときだけ反応する。
 * 別の場所で押してドラッグしてきた指が上で離れても反応しない —— 集客でお客へ向かってスティックを
 * 動かしている最中に選択肢が出て、離した指で選択肢を押してしまっていた（2026-09-25 ユーザー報告）。
 * さらに、出た直後 armMs の間に押し始めたタップも受け付けない（出た瞬間に画面を触り直した指を拾わない）。
 */
export class TapGuard {
  private _pressedAt: number | null = null;

  constructor(
    private readonly _createdAt: number,
    private readonly _armMs: number,
  ) {}

  /** このボタンの上で押された */
  down(now: number): void {
    this._pressedAt = now - this._createdAt >= this._armMs ? now : null;
  }

  /** このボタンの上で離された。反応してよければ true */
  up(): boolean {
    const ok = this._pressedAt !== null;
    this._pressedAt = null;
    return ok;
  }

  /** 押したまま外へ出た・別の場所で離された */
  cancel(): void {
    this._pressedAt = null;
  }

  get pressed(): boolean {
    return this._pressedAt !== null;
  }
}
