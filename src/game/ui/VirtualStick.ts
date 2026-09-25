import Phaser from 'phaser';
import type { Vec2 } from '../../core/vec';
import { DEPTH } from '../depth';
import { WORLD } from '../theme';

/**
 * 画面のどこを触っても、そこを中心に出るスティック。キーボード（WASD / 矢印）も合成する。
 * 読むのは vector（長さ 0〜1）だけ。
 */
export class VirtualStick {
  private readonly _base: Phaser.GameObjects.Arc;
  private readonly _knob: Phaser.GameObjects.Arc;
  private readonly _radius = 90;
  private _pointerId: number | null = null;
  private _origin: Vec2 = { x: 0, y: 0 };
  private _touch: Vec2 = { x: 0, y: 0 };
  private readonly _keys: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key> | null;
  enabled = true;

  constructor(scene: Phaser.Scene) {
    this._base = scene.add.circle(0, 0, this._radius, 0xffffff, 0.25).setStrokeStyle(5, 0xffffff, 0.7).setScrollFactor(0).setDepth(DEPTH.hud + 50).setVisible(false);
    this._knob = scene.add.circle(0, 0, 38, WORLD.shot, 0.9).setScrollFactor(0).setDepth(DEPTH.hud + 51).setVisible(false);
    const kb = scene.input.keyboard;
    this._keys = kb
      ? (kb.addKeys({ up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D' }) as VirtualStick['_keys'])
      : null;

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (!this.enabled || this._pointerId !== null || over.length > 0) return;
      this._pointerId = p.id;
      this._origin = { x: p.x, y: p.y };
      this._touch = { x: 0, y: 0 };
      this._base.setPosition(p.x, p.y).setVisible(true);
      this._knob.setPosition(p.x, p.y).setVisible(true);
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this._pointerId) return;
      const dx = p.x - this._origin.x;
      const dy = p.y - this._origin.y;
      const len = Math.hypot(dx, dy);
      const k = len > this._radius ? this._radius / len : 1;
      this._knob.setPosition(this._origin.x + dx * k, this._origin.y + dy * k);
      // 少しの揺れは無視し、半径の 1 倍で最大速度
      this._touch = len < 8 ? { x: 0, y: 0 } : { x: (dx * k) / this._radius, y: (dy * k) / this._radius };
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== this._pointerId) return;
      this.release();
    };
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
  }

  release(): void {
    this._pointerId = null;
    this._touch = { x: 0, y: 0 };
    this._base.setVisible(false);
    this._knob.setVisible(false);
  }

  get vector(): Vec2 {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = this._touch.x;
    let y = this._touch.y;
    const k = this._keys;
    if (k) {
      if (k.left.isDown || k.a.isDown) x -= 1;
      if (k.right.isDown || k.d.isDown) x += 1;
      if (k.up.isDown || k.w.isDown) y -= 1;
      if (k.down.isDown || k.s.isDown) y += 1;
    }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }
}
