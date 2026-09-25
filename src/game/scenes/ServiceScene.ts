import Phaser from 'phaser';
import { effectiveStats } from '../../core/career/stats';
import { byId } from '../../core/data/gameData';
import { VIBES, type Vibe } from '../../core/data/types';
import { ServiceSession, type BonusTag } from '../../core/service/serviceSession';
import { sfx } from '../audio/sfx';
import { t, yen } from '../i18n';
import { session } from '../session';
import { animKey, hasClip, idleFrame } from '../sprites';
import { BUTTON, COLOR, CSS, HEIGHT, WIDTH, drawPanel, textStyle, titleStyle, wrappedStyle, type ButtonVariant } from '../theme';
import { Button } from '../ui/Button';
import { banner, fadeTo, floatText } from '../ui/fx';
import { Gauge } from '../ui/Gauge';

const BUBBLE_Y = 470;
const ACTION_TOP = 700;

/**
 * 接客パート。上にお客、下に主人公。
 * お客の心境 → ノリの 3 択 → リアクション（セリフは残したまま）→ 下にドリンク一覧。
 */
export class ServiceScene extends Phaser.Scene {
  private _session!: ServiceSession;
  private _guestSprite!: Phaser.GameObjects.Sprite;
  private _guestName!: Phaser.GameObjects.Text;
  private _counter!: Phaser.GameObjects.Text;
  private _bubble!: Phaser.GameObjects.Text;
  private _tags!: Phaser.GameObjects.Container;
  private _actions!: Phaser.GameObjects.Container;
  private _mp!: Gauge;
  private _sales!: Phaser.GameObjects.Text;

  constructor() {
    super('Service');
  }

  create(): void {
    const street = session.lastStreet;
    if (!street) throw new Error('集客の結果が無い');
    const p = session.player;
    this._session = new ServiceSession(
      session.data,
      // 能力値は期間つき・月額の効き目込み
      { mp: street.mp, ...effectiveStats(p, session.data), hobbies: p.hobbies },
      street.companions,
      p.seed ^ 0x5bd1e995,
    );

    this.cameras.main.fadeIn(300, 255, 227, 240);
    this.drawClub();
    this._guestSprite = this.add.sprite(WIDTH / 2, 380, 'bandman').setOrigin(0.5, 1).setScale(1.9);
    this._guestName = this.add.text(30, 30, '', titleStyle(30));
    this._counter = this.add.text(WIDTH - 30, 34, '', titleStyle(24, '#9b6bff')).setOrigin(1, 0);
    this.drawBubble();
    this._tags = this.add.container(0, 0);
    this._actions = this.add.container(0, 0);
    this.drawFooter();
    this.startGuest();
  }

  private drawClub(): void {
    const g = this.add.graphics();
    // 壁（ピンクのストライプ）
    g.fillStyle(0xffd6e8, 1);
    g.fillRect(0, 0, WIDTH, ACTION_TOP);
    g.fillStyle(0xffc4dd, 1);
    for (let x = 0; x < WIDTH; x += 60) g.fillRect(x, 0, 30, ACTION_TOP);
    // 奥のソファ（ラベンダー）とシャンデリア（金の粒）
    g.fillStyle(0xb99cf0, 1);
    g.fillRoundedRect(60, 250, WIDTH - 120, 150, 50);
    g.fillStyle(0xcdb6ff, 1);
    g.fillRoundedRect(40, 320, WIDTH - 80, 90, 40);
    for (let i = 0; i < 7; i++) {
      g.fillStyle(0xffffff, 0.8);
      g.fillCircle(80 + i * 95, 120, 14);
      g.fillStyle(0xffd45c, 1);
      g.fillCircle(80 + i * 95, 120, 8);
    }
    // 下半分は床（クリーム）
    g.fillStyle(0xfff4e6, 1);
    g.fillRect(0, ACTION_TOP - 40, WIDTH, HEIGHT - ACTION_TOP + 40);
  }

  private drawBubble(): void {
    const g = this.add.graphics();
    drawPanel(g, 30, BUBBLE_Y - 76, WIDTH - 60, 162, 36);
    g.fillStyle(COLOR.frame, 1);
    g.fillTriangle(WIDTH / 2 - 24, BUBBLE_Y - 72, WIDTH / 2 + 24, BUBBLE_Y - 72, WIDTH / 2, BUBBLE_Y - 102);
    g.fillStyle(COLOR.surface, 1);
    g.fillTriangle(WIDTH / 2 - 16, BUBBLE_Y - 68, WIDTH / 2 + 16, BUBBLE_Y - 68, WIDTH / 2, BUBBLE_Y - 92);
    this._bubble = this.add
      .text(WIDTH / 2, BUBBLE_Y + 5, '', wrappedStyle(28, CSS.text, WIDTH - 120, { align: 'center', lineSpacing: 6 }))
      .setOrigin(0.5);
  }

  private drawFooter(): void {
    const g = this.add.graphics();
    drawPanel(g, 10, HEIGHT - 126, WIDTH - 20, 116, 28);
    const me = this.add.sprite(80, HEIGHT - 16, 'player', idleFrame('player')).setOrigin(0.5, 1).setScale(0.75);
    me.play(animKey('player', 'idle'));
    this.add.text(150, HEIGHT - 104, session.player.genjiName, textStyle(24, CSS.text));
    this._mp = new Gauge(this, 150, HEIGHT - 66, 300, 28, t('stat.mp'), COLOR.mp);
    this.add.text(WIDTH - 36, HEIGHT - 104, t('service.sales'), textStyle(22, CSS.sub)).setOrigin(1, 0);
    this._sales = this.add.text(WIDTH - 36, HEIGHT - 70, '', textStyle(34, CSS.money)).setOrigin(1, 0);
    this.refreshFooter();
  }

  private refreshFooter(): void {
    this._mp.set(this._session.mp, session.player.maxMp);
    this._sales.setText(yen(this._session.totalSales));
  }

  private say(text: string): void {
    this._bubble.setText(text).setScale(0.9);
    this.tweens.add({ targets: this._bubble, scale: 1, duration: 160, ease: 'Back.Out' });
  }

  // ---------- 流れ ----------

  private startGuest(): void {
    const guest = this._session.current;
    if (!guest) {
      this.finish();
      return;
    }
    const type = byId(session.data.customers, guest.typeId);
    this._guestSprite.setTexture(guest.visualId, idleFrame(guest.visualId)).setAlpha(0).setX(WIDTH / 2 + 60);
    if (hasClip(guest.visualId, 'idle')) this._guestSprite.play(animKey(guest.visualId, 'idle'));
    this.tweens.add({ targets: this._guestSprite, alpha: 1, x: WIDTH / 2, duration: 300, ease: 'Cubic.Out' });
    this._guestName.setText(t('service.guest_name', { name: t(type.name_key), rank: type.rank }));
    this._counter.setText(t('service.counter', { n: this._session.guestIndex + 1, total: this._session.guests.length }));
    this._tags.removeAll(true);
    this.say(t(guest.moodLineKey));
    this.showVibeChoices();
  }

  private showVibeChoices(): void {
    this._actions.removeAll(true);
    this._actions.add(this.add.text(WIDTH / 2, ACTION_TOP, t('service.vibe_prompt'), titleStyle(30)).setOrigin(0.5));
    const variants: Record<Vibe, ButtonVariant> = { wild: 'primary', fun: 'yellow', calm: 'secondary' };
    VIBES.forEach((vibe, i) => {
      this._actions.add(
        new Button(this, WIDTH / 2, ACTION_TOP + 90 + i * 124, {
          width: WIDTH - 100,
          height: 108,
          label: t(`service.vibe.${vibe}`),
          variant: variants[vibe],
          fontSize: 36,
          sfx: null,
          onClick: () => this.chooseVibe(vibe),
        }),
      );
    });
  }

  private chooseVibe(vibe: Vibe): void {
    const result = this._session.chooseVibe(vibe);
    this.say(t(result.reactionKey, { name: session.player.genjiName }));
    sfx.play(result.matched ? 'activity_clear' : 'recruit_fail');
    if (result.matched) this.cameras.main.flash(150, 255, 180, 210, false);
    else this.tweens.add({ targets: this._guestSprite, x: WIDTH / 2 + 10, duration: 50, yoyo: true, repeat: 3 });
    this.showTags(this._session.bonusTags());
    this.showDrinks();
  }

  /** 「〇〇ボーナス発生！」の札を吹き出しの下に順に出す */
  private showTags(tags: BonusTag[]): void {
    this._tags.removeAll(true);
    let x = 40;
    tags.forEach((tag, i) => {
      const good = tag.kind === 'vibe_match' || tag.kind === 'preference_match' || tag.kind === 'hobby';
      const label =
        tag.kind === 'preference_match' || tag.kind === 'preference_miss'
          ? t(`service.tag.${tag.kind}`, { stat: t(`stat.${tag.stat}`) })
          : tag.kind === 'hobby'
            ? t('service.tag.hobby', { hobby: t(`hobby.${tag.hobbyId}`) })
            : t(`service.tag.${tag.kind}`);
      const colors = good ? BUTTON.mint : BUTTON.primary;
      const text = this.add.text(0, 0, label, textStyle(22, '#ffffff', { stroke: colors.stroke, strokeThickness: 4 })).setOrigin(0, 0.5);
      const w = text.width + 28;
      const bg = this.add.graphics();
      bg.fillStyle(colors.shade, 1);
      bg.fillRoundedRect(0, -16, w, 40, 20);
      bg.fillStyle(colors.face, 1);
      bg.fillRoundedRect(0, -20, w, 40, 20);
      text.setX(14);
      const chip = this.add.container(x, 610, [bg, text]).setAlpha(0).setScale(0.6);
      this._tags.add(chip);
      this.tweens.add({ targets: chip, alpha: 1, scale: 1, delay: 120 * i, duration: 220, ease: 'Back.Out' });
      x += w + 10;
    });
  }

  /** ドリンクは 2 列 × 3 段。名前と、値段 / 消費 MP を 2 行で */
  private showDrinks(): void {
    this._actions.removeAll(true);
    const options = this._session.drinkOptions();
    const colW = (WIDTH - 72) / 2;
    const rowH = 100;
    options.forEach((option, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const d = option.drink;
      const button = new Button(this, 30 + colW / 2 + col * (colW + 12), ACTION_TOP + 20 + row * (rowH + 10), {
        width: colW,
        height: rowH,
        label: t(d.name_key),
        sub: t('service.drink_sub', { price: yen(d.price), mp: d.mp_cost }),
        variant: 'secondary',
        fontSize: 28,
        sfx: null,
        onClick: () => this.order(d.id),
      });
      button.setEnabled(option.block === null);
      this._actions.add(button);
    });
    const rows = Math.ceil(options.length / 2);
    this._actions.add(
      new Button(this, WIDTH / 2, ACTION_TOP + 20 + rows * (rowH + 10) + 30, {
        width: 400,
        height: 76,
        label: this.nextLabel(),
        variant: 'quiet',
        fontSize: 28,
        onClick: () => this.nextGuest(),
      }),
    );
  }

  private nextLabel(): string {
    const last = this._session.guestIndex >= this._session.guests.length - 1;
    return t(last ? 'service.finish' : 'service.next_guest');
  }

  private order(drinkId: string): void {
    const result = this._session.order(drinkId);
    const drink = byId(session.data.drinks, drinkId);
    this.say(t(result.reactionKey, { drink: t(drink.name_key), name: session.player.genjiName }));
    sfx.play(result.guestLeft ? 'recruit_fail' : result.success ? 'shop_request_ok' : 'shop_request_fail');
    if (result.success) {
      floatText(this, WIDTH / 2, 300, `+${yen(result.price)}`, CSS.money, 44);
      if (result.price >= 30000) {
        banner(this, t('service.big_order', { drink: t(drink.name_key) }), CSS.accent, 220);
        this.cameras.main.flash(250, 255, 215, 100, false);
      }
    } else {
      this.cameras.main.shake(120, 0.006);
    }
    this.refreshFooter();
    if (result.guestLeft) {
      this.tweens.add({ targets: this._guestSprite, alpha: 0, x: WIDTH + 100, duration: 500, delay: 400 });
      this._actions.removeAll(true);
      this._actions.add(
        new Button(this, WIDTH / 2, ACTION_TOP + 200, {
          width: 420,
          height: 100,
          label: this.nextLabel(),
          variant: 'mint',
          onClick: () => this.nextGuest(),
        }),
      );
    } else {
      this.showDrinks();
    }
  }

  private nextGuest(): void {
    this._session.nextGuest();
    if (this._session.phase === 'done') this.finish();
    else this.startGuest();
  }

  private finish(): void {
    this._actions.removeAll(true);
    session.lastService = this._session.result();
    fadeTo(this, 'Result');
  }
}
