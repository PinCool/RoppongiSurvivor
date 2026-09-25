import Phaser from 'phaser';
import { sfx, type SfxId } from '../audio/sfx';
import { COLOR, CSS, textStyle } from '../theme';
import { TapGuard } from './tapGuard';

export interface ButtonOptions {
  width: number;
  height: number;
  label: string;
  /** 2 行目の小さい字（MP の消費など） */
  sub?: string;
  fill?: number;
  textColor?: string;
  fontSize?: number;
  /** 押したときの音（既定は決定音。null で鳴らさない）。押せない状態で押すとエラー音 */
  sfx?: SfxId | null;
  /** 出てからこの時間（ms）に押し始めたタップは受け付けない。急に出る選択肢で誤タップを防ぐ */
  armMs?: number;
  onClick: () => void;
}

/**
 * 角丸の押しボタン。押せない状態では灰色になり、sub に理由を出せる。
 * 反応するのは「このボタンの上で押して、上で離した」ときだけ（TapGuard）。
 */
export class Button extends Phaser.GameObjects.Container {
  private readonly _bg: Phaser.GameObjects.Graphics;
  private readonly _label: Phaser.GameObjects.Text;
  private readonly _sub: Phaser.GameObjects.Text | null;
  private readonly _opts: ButtonOptions;
  private _enabled = true;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: ButtonOptions) {
    super(scene, x, y);
    this._opts = opts;
    this._bg = scene.add.graphics();
    const size = opts.fontSize ?? 30;
    const hasSub = opts.sub !== undefined;
    this._label = scene.add
      .text(0, hasSub ? -size * 0.35 : 0, opts.label, textStyle(size, opts.textColor ?? CSS.text, { align: 'center' }))
      .setOrigin(0.5);
    this._sub = hasSub
      ? scene.add
          .text(0, size * 0.55, opts.sub ?? '', textStyle(Math.round(size * 0.6), opts.textColor ?? CSS.text, { align: 'center' }))
          .setOrigin(0.5)
          .setAlpha(0.8)
      : null;
    this.add(this._bg);
    this.add(this._label);
    if (this._sub) this.add(this._sub);
    this.setSize(opts.width, opts.height);
    this.setInteractive({ useHandCursor: true });
    const guard = new TapGuard(scene.time.now, opts.armMs ?? 0);
    this.on('pointerdown', () => {
      guard.down(scene.time.now);
      if (!this._enabled || !guard.pressed) return;
      scene.tweens.add({ targets: this, scale: 0.95, duration: 60, yoyo: true });
    });
    this.on('pointerout', () => guard.cancel());
    this.on('pointerup', () => {
      if (!guard.up()) return;
      if (!this._enabled) {
        sfx.play('ui_error');
        return;
      }
      if (opts.sfx !== null) sfx.play(opts.sfx ?? 'ui_confirm');
      opts.onClick();
    });
    this.draw();
    this.layoutText();
    scene.add.existing(this);
  }

  setEnabled(enabled: boolean): this {
    this._enabled = enabled;
    this.draw();
    return this;
  }

  setLabel(label: string, sub?: string): this {
    this._label.setText(label);
    if (this._sub && sub !== undefined) this._sub.setText(sub);
    this.layoutText();
    return this;
  }

  /** 2 行目が空なら 1 行目を真ん中へ */
  private layoutText(): void {
    const size = this._opts.fontSize ?? 30;
    const hasSub = this._sub !== null && this._sub.text.trim() !== '';
    this._label.setY(hasSub ? -size * 0.35 : 0);
  }

  private draw(): void {
    const { width: w, height: h } = this._opts;
    const fill = this._enabled ? (this._opts.fill ?? COLOR.pink) : COLOR.gray;
    const g = this._bg;
    g.clear();
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 22);
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 22);
    g.lineStyle(3, 0xffffff, this._enabled ? 0.55 : 0.2);
    g.strokeRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 19);
    this._label.setAlpha(this._enabled ? 1 : 0.6);
    this._sub?.setAlpha(this._enabled ? 0.8 : 0.55);
  }
}
