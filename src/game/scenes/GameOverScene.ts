import Phaser from 'phaser';
import { t } from '../i18n';
import { session } from '../session';
import { clearSave } from '../storage';
import { CSS, HEIGHT, WIDTH, textStyle, wrappedStyle } from '../theme';
import { Button } from '../ui/Button';
import { fadeTo } from '../ui/fx';

/** 家賃を半年払えず、実家に呼び戻された。キャラを作り直す */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(): void {
    this.cameras.main.fadeIn(600);
    this.cameras.main.setBackgroundColor(0x0c0818);
    this.add.text(WIDTH / 2, HEIGHT * 0.35, t('game_over.title'), textStyle(52, CSS.red, { align: 'center' })).setOrigin(0.5);
    this.add
      .text(WIDTH / 2, HEIGHT * 0.47, t('game_over.body', { name: session.player.genjiName }), wrappedStyle(28, CSS.sub, 600, { align: 'center', lineSpacing: 10 }))
      .setOrigin(0.5);
    new Button(this, WIDTH / 2, HEIGHT * 0.7, {
      width: 460,
      height: 110,
      label: t('game_over.restart'),
      onClick: () => {
        clearSave();
        session.setPlayer(null);
        fadeTo(this, 'Name');
      },
    });
  }
}
