import Phaser from 'phaser';
import { normalizeName, validateName } from '../../core/career/genjiName';
import { createPlayer } from '../../core/career/playerState';
import { t } from '../i18n';
import { session } from '../session';
import { CSS, FONT, HEIGHT, WIDTH, drawBackdrop, textStyle } from '../theme';
import { Button } from '../ui/Button';
import { fadeTo } from '../ui/fx';

/**
 * 最初の 1 回だけ。「夜の街で働くための源氏名をつけてください」。
 * 入力欄は Phaser ではなく HTML の <input>（スマホのキーボード・IME をそのまま使うため）を画面に重ねる。
 */
export class NameScene extends Phaser.Scene {
  private _input: HTMLInputElement | null = null;

  constructor() {
    super('Name');
  }

  create(): void {
    this.cameras.main.fadeIn(300, 255, 227, 240);
    drawBackdrop(this);
    this.add.image(WIDTH / 2, 380, 'room').setAlpha(0.5).setScale(1.1);
    this.add.image(WIDTH / 2, 190, 'logo').setScale(0.9);
    this.add.text(WIDTH / 2, 560, t('name.prompt'), textStyle(34, CSS.text, { align: 'center' })).setOrigin(0.5);
    this.add.text(WIDTH / 2, 640, t('name.note', { max: session.data.player.genji_name_max_length }), textStyle(22, CSS.sub, { align: 'center' })).setOrigin(0.5);
    const error = this.add.text(WIDTH / 2, 800, '', textStyle(24, CSS.bad)).setOrigin(0.5);

    this._input = this.createInput();
    const submit = () => {
      const raw = this._input?.value ?? '';
      const problem = validateName(raw, session.data.player.genji_name_max_length, session.data.ngWords);
      if (problem) {
        error.setText(t(`name.error.${problem}`));
        this.tweens.add({ targets: error, x: WIDTH / 2 + 8, duration: 50, yoyo: true, repeat: 2 });
        return;
      }
      const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
      session.setPlayer(createPlayer(session.data, normalizeName(raw), seed));
      this.removeInput();
      fadeTo(this, 'Home');
    };
    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) submit();
    });
    new Button(this, WIDTH / 2, 920, { width: 420, height: 100, label: t('name.submit'), onClick: submit });
    this.add.text(WIDTH / 2, HEIGHT - 60, t('app.version'), textStyle(18, CSS.dim)).setOrigin(0.5);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.removeInput());
    this.scale.on(Phaser.Scale.Events.RESIZE, this.placeInput, this);
  }

  private createInput(): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = session.data.player.genji_name_max_length * 2;
    input.placeholder = t('name.placeholder');
    input.autocomplete = 'off';
    Object.assign(input.style, {
      position: 'absolute',
      boxSizing: 'border-box',
      border: '4px solid #ffb8d6',
      borderRadius: '999px',
      background: '#ffffff',
      color: '#5a3a5e',
      textAlign: 'center',
      fontFamily: FONT,
      fontWeight: 'bold',
      outline: 'none',
      zIndex: '10',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(input);
    this._input = input;
    this.placeInput();
    return input;
  }

  /** キャンバスの縮尺に合わせて、論理座標 (110, 680)〜(610, 770) に重ねる */
  private placeInput(): void {
    const input = this._input;
    if (!input) return;
    const rect = this.game.canvas.getBoundingClientRect();
    const k = rect.width / WIDTH;
    Object.assign(input.style, {
      left: `${rect.left + 110 * k}px`,
      top: `${rect.top + 690 * k}px`,
      width: `${500 * k}px`,
      height: `${84 * k}px`,
      fontSize: `${34 * k}px`,
    });
  }

  private removeInput(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.placeInput, this);
    this._input?.remove();
    this._input = null;
  }
}
