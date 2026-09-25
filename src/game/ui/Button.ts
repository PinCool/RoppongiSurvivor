import Phaser from 'phaser';
import { sfx, type SfxId } from '../audio/sfx';
import { BUTTON, textStyle, type ButtonVariant } from '../theme';
import { TapGuard } from './tapGuard';

export interface ButtonOptions {
  width: number;
  height: number;
  label: string;
  /** 2 行目の小さい字（MP の消費など） */
  sub?: string;
  /** 色の種類（既定は primary = ピンク）。色そのものは theme.ts の BUTTON が持つ */
  variant?: ButtonVariant;
  fontSize?: number;
  /** 押したときの音（既定は決定音。null で鳴らさない）。押せない状態で押すとエラー音 */
  sfx?: SfxId | null;
  /** 出てからこの時間（ms）に押し始めたタップは受け付けない。急に出る選択肢で誤タップを防ぐ */
  armMs?: number;
  onClick: () => void;
}

/** 下の段の厚み */
const DEPTH = 8;

/**
 * ぷっくりした丸角ボタン（下に濃い色の段・上に白いツヤ・字は白に色の縁取り）。
 * 押すと面が段の高さまで沈む。押せない状態では灰色になり、sub に理由を出せる。
 * 反応するのは「このボタンの上で押して、上で離した」ときだけ（TapGuard）。
 */
export class Button extends Phaser.GameObjects.Container {
  private readonly _bg: Phaser.GameObjects.Graphics;
  private readonly _face: Phaser.GameObjects.Container;
  private readonly _label: Phaser.GameObjects.Text;
  private readonly _sub: Phaser.GameObjects.Text | null;
  private readonly _opts: ButtonOptions;
  private _enabled = true;
  private _pressed = false;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: ButtonOptions) {
    super(scene, x, y);
    this._opts = opts;
    this._bg = scene.add.graphics();
    const size = opts.fontSize ?? 30;
    this._label = scene.add.text(0, 0, opts.label, textStyle(size, '#ffffff', { align: 'center' })).setOrigin(0.5);
    this._sub =
      opts.sub !== undefined ? scene.add.text(0, size * 0.55, opts.sub, textStyle(Math.round(size * 0.58), '#ffffff', { align: 'center' })).setOrigin(0.5) : null;
    this._face = scene.add.container(0, 0, this._sub ? [this._label, this._sub] : [this._label]);
    this.add([this._bg, this._face]);
    this.setSize(opts.width, opts.height + DEPTH);
    this.setInteractive({ useHandCursor: true });

    const guard = new TapGuard(scene.time.now, opts.armMs ?? 0);
    this.on('pointerdown', () => {
      guard.down(scene.time.now);
      if (this._enabled && guard.pressed) this.setPressed(true);
    });
    this.on('pointerout', () => {
      guard.cancel();
      this.setPressed(false);
    });
    this.on('pointerup', () => {
      this.setPressed(false);
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

  private setPressed(pressed: boolean): void {
    if (this._pressed === pressed) return;
    this._pressed = pressed;
    this.draw();
  }

  /** 2 行目が空なら 1 行目を真ん中へ。押している間は面ごと沈める */
  private layoutText(): void {
    const size = this._opts.fontSize ?? 30;
    const hasSub = this._sub !== null && this._sub.text.trim() !== '';
    this._label.setY(hasSub ? -size * 0.32 : 0);
    this._face.setY(this._pressed ? DEPTH / 2 : -DEPTH / 2);
  }

  private draw(): void {
    const { width: w, height: h } = this._opts;
    const colors = this._enabled ? BUTTON[this._opts.variant ?? 'primary'] : BUTTON.disabled;
    const r = Math.min(h / 2, 30);
    const lift = this._pressed ? 0 : DEPTH;
    const top = -h / 2 - DEPTH / 2 + (DEPTH - lift);
    const g = this._bg;
    g.clear();
    // 下の段
    g.fillStyle(colors.shade, 1);
    g.fillRoundedRect(-w / 2, -h / 2 + DEPTH / 2, w, h, r);
    // 面
    g.fillStyle(colors.face, 1);
    g.fillRoundedRect(-w / 2, top, w, h, r);
    // 上のツヤ
    g.fillStyle(0xffffff, 0.28);
    g.fillRoundedRect(-w / 2 + 14, top + 7, w - 28, h * 0.3, Math.min(h * 0.15, 14));
    const stroke = { stroke: colors.stroke, strokeThickness: colors === BUTTON.quiet ? 0 : 6 };
    this._label.setStyle({ color: colors.text, ...stroke });
    this._sub?.setStyle({ color: colors.text, stroke: colors.stroke, strokeThickness: colors === BUTTON.quiet ? 0 : 4 });
    this.layoutText();
  }
}
