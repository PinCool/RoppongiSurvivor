import Phaser from 'phaser';
import { session } from '../session';
import { preloadSprites, registerAnimations } from '../sprites';
import { loadSave } from '../storage';
import { COLOR, HEIGHT, WIDTH } from '../theme';

/** 素材を読み、セーブがあれば自宅へ、無ければ源氏名の入力へ */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const bar = this.add.rectangle(WIDTH / 2 - 200, HEIGHT / 2, 0, 12, COLOR.pink).setOrigin(0, 0.5);
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, 404, 16).setStrokeStyle(2, COLOR.pinkSoft);
    this.load.on('progress', (v: number) => bar.setSize(400 * v, 12));
    this.load.image('room', 'assets/home/room.jpg');
    this.load.image('logo', 'assets/home/logo.png');
    preloadSprites(this);
  }

  create(): void {
    registerAnimations(this);
    const saved = loadSave();
    if (saved && !saved.gameOver) {
      session.setPlayer(saved);
      this.scene.start('Home');
    } else {
      this.scene.start('Name');
    }
  }
}
