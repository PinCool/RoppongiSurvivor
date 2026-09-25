import Phaser from 'phaser';
import { DEPTH } from '../depth';
import { COLOR, CSS, HEIGHT, WIDTH, drawPanel, textStyle, titleStyle } from '../theme';

/** 画面中央に大きく出して消える告知（「お客さん出現！」など） */
export function banner(scene: Phaser.Scene, text: string, color: string, y = HEIGHT * 0.28): void {
  // 字は白、縁取りに色を載せる（可愛いソシャゲの見出し）
  const label = scene.add
    .text(WIDTH / 2, y, text, titleStyle(52, color, { align: 'center', strokeThickness: 12 }))
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH.hud + 10)
    .setAlpha(0);
  // 長い告知は画面幅に収まるまで縮める
  const fit = Math.min(1, (WIDTH - 40) / label.width);
  label.setScale(0.4 * fit);
  scene.tweens.chain({
    targets: label,
    tweens: [
      { scale: 1.08 * fit, alpha: 1, duration: 180, ease: 'Back.Out' },
      { scale: fit, duration: 120 },
      { alpha: 0, y: y - 40, delay: 1100, duration: 300, onComplete: () => label.destroy() },
    ],
  });
}

/** 画面全体に幕を掛けて、その上に白いパネルを置く（モーダル）。戻り値の container を destroy すれば閉じる */
export function modal(scene: Phaser.Scene, panelHeight: number, panelY = HEIGHT / 2): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH.hud + 100);
  const dim = scene.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLOR.scrim, 0.55).setInteractive();
  const panel = scene.add.graphics();
  drawPanel(panel, 24, panelY - panelHeight / 2, WIDTH - 48, panelHeight);
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
  const label = scene.add.text(x, y, text, textStyle(size, color, { stroke: CSS.onWorldStroke, strokeThickness: 5 })).setOrigin(0.5).setDepth(DEPTH.shots + 1);
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
