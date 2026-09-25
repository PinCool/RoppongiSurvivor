import Phaser from 'phaser';
import { COLOR, CSS, textStyle } from '../theme';

/** 横長のゲージ（HP / MP / 酔い度）。左に名札、中に「現在 / 最大」 */
export class Gauge extends Phaser.GameObjects.Container {
  private readonly _bar: Phaser.GameObjects.Graphics;
  private readonly _value: Phaser.GameObjects.Text;
  private readonly _w: number;
  private readonly _h: number;
  private readonly _color: number;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number, label: string, color: number) {
    super(scene, x, y);
    this._w = width;
    this._h = height;
    this._color = color;
    const name = scene.add.text(0, height / 2, label, textStyle(Math.round(height * 0.8), CSS.sub)).setOrigin(0, 0.5);
    this._bar = scene.add.graphics();
    this._bar.x = name.width + 10;
    this._value = scene.add
      .text(name.width + 10 + (width - name.width - 10) / 2, height / 2, '', textStyle(Math.round(height * 0.72), CSS.text, { stroke: CSS.dark, strokeThickness: 4 }))
      .setOrigin(0.5);
    this.add([name, this._bar, this._value]);
    scene.add.existing(this);
  }

  set(current: number, max: number, showMax = true): this {
    const w = this._w - this._bar.x;
    const ratio = max > 0 ? Phaser.Math.Clamp(current / max, 0, 1) : 0;
    const g = this._bar;
    g.clear();
    g.fillStyle(COLOR.nightDeep, 0.9);
    g.fillRoundedRect(0, 0, w, this._h, this._h / 2);
    if (ratio > 0) {
      g.fillStyle(this._color, 1);
      g.fillRoundedRect(0, 0, Math.max(this._h, w * ratio), this._h, this._h / 2);
    }
    g.lineStyle(2, 0xffffff, 0.35);
    g.strokeRoundedRect(0, 0, w, this._h, this._h / 2);
    this._value.setText(showMax ? `${Math.ceil(current)} / ${max}` : `${Math.ceil(current)}`);
    return this;
  }
}
