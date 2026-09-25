import Phaser from 'phaser';
import { COLOR, HEIGHT, WIDTH, textStyle } from '../theme';

/** 画面中央に大きく出して消える告知（「お客さん出現！」など） */
export function banner(scene: Phaser.Scene, text: string, color: string, y = HEIGHT * 0.28): void {
  const label = scene.add
    .text(WIDTH / 2, y, text, textStyle(54, color, { stroke: '#1b1433', strokeThickness: 10, align: 'center' }))
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(1000)
    .setScale(0.4)
    .setAlpha(0);
  scene.tweens.chain({
    targets: label,
    tweens: [
      { scale: 1.08, alpha: 1, duration: 180, ease: 'Back.Out' },
      { scale: 1, duration: 120 },
      { alpha: 0, y: y - 40, delay: 1100, duration: 300, onComplete: () => label.destroy() },
    ],
  });
}

/** 画面全体を薄暗くして、その上にパネルを置く（モーダル）。戻り値の container を destroy すれば閉じる */
export function modal(scene: Phaser.Scene, panelHeight: number, panelY = HEIGHT / 2): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0).setScrollFactor(0).setDepth(2000);
  const dim = scene.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x000000, 0.6).setInteractive();
  const panel = scene.add.graphics();
  const w = WIDTH - 48;
  panel.fillStyle(COLOR.panel, 0.98);
  panel.fillRoundedRect(24, panelY - panelHeight / 2, w, panelHeight, 28);
  panel.lineStyle(4, COLOR.pinkSoft, 0.8);
  panel.strokeRoundedRect(24, panelY - panelHeight / 2, w, panelHeight, 28);
  root.add([dim, panel]);
  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: 150 });
  return root;
}

/**
 * コンテナの中身まで画面に固定する。Phaser はコンテナの子を「描く」ときは親の scrollFactor に従うが、
 * 「当たり判定」は子自身の scrollFactor で計算するので、カメラが動く画面（集客）ではボタンが押せなくなる。
 * 中身を足し終えてから呼ぶこと。
 */
export function pinToScreen(obj: Phaser.GameObjects.GameObject): void {
  const target = obj as Phaser.GameObjects.GameObject & { setScrollFactor?: (x: number, y?: number) => unknown };
  target.setScrollFactor?.(0, 0);
  if (obj instanceof Phaser.GameObjects.Container) obj.list.forEach(pinToScreen);
}

/** 数字などを浮かせて消す（ダメージ・売上） */
export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color: string, size = 26): void {
  const label = scene.add.text(x, y, text, textStyle(size, color, { stroke: '#1b1433', strokeThickness: 5 })).setOrigin(0.5).setDepth(800);
  scene.tweens.add({ targets: label, y: y - 50, alpha: 0, duration: 650, ease: 'Cubic.Out', onComplete: () => label.destroy() });
}

/** 暗転してシーンを移る。暗転中の 2 度目は無視する（連打で遷移が二重に積まれ、結果の精算が 2 回走るのを防ぐ） */
export function fadeTo(scene: Phaser.Scene, key: string, data?: object): void {
  const cam = scene.cameras.main;
  if (cam.fadeEffect.isRunning || scene.data.get('leaving')) return;
  scene.data.set('leaving', true);
  // DataManager はシーンを作り直しても残るので、抜けるときに戻す（自宅 → 自宅 のような同じシーンへの遷移がある）
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.data.remove('leaving'));
  cam.fadeOut(250, 27, 20, 51);
  cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => scene.scene.start(key, data));
}
