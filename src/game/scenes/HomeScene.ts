import Phaser from 'phaser';
import { dateOf } from '../../core/career/calendar';
import { endDay, type DayReport } from '../../core/career/day';
import { expToNext } from '../../core/career/progression';
import { rankLetter, totalRankScore } from '../../core/career/rank';
import { applySelfCare, selfCareBlock } from '../../core/career/selfCare';
import { useAdRefill, workBlock } from '../../core/career/work';
import { STAT_IDS, type SelfCareData, type StatId } from '../../core/data/types';
import { t, yen } from '../i18n';
import { session } from '../session';
import { COLOR, CSS, HEIGHT, WIDTH, textStyle, wrappedStyle } from '../theme';
import { Button } from '../ui/Button';
import { banner, fadeTo, modal } from '../ui/fx';
import { Gauge } from '../ui/Gauge';

const ROOM_TOP = 96;

/**
 * ホーム画面＝自宅。部屋の絵の上で主人公がくつろぎ、下に能力と行動のボタン。
 * 1 日: 自分磨き（回数制限）→ 出勤 → 帰宅したら寝る（翌日へ・月末は家賃）。
 */
export class HomeScene extends Phaser.Scene {
  private _dateText!: Phaser.GameObjects.Text;
  private _moneyText!: Phaser.GameObjects.Text;
  private _rankText!: Phaser.GameObjects.Text;
  private _nameText!: Phaser.GameObjects.Text;
  private _statsText!: Phaser.GameObjects.Text;
  private _hp!: Gauge;
  private _mp!: Gauge;
  private _drunk!: Gauge;
  private _exp!: Gauge;
  private _work!: Button;
  private _care!: Button;
  private _sleep!: Button;
  private _ad!: Button;

  constructor() {
    super('Home');
  }

  create(): void {
    this.cameras.main.fadeIn(300);
    this.cameras.main.setBackgroundColor(COLOR.night);
    const room = this.add.image(WIDTH / 2, ROOM_TOP, 'room').setOrigin(0.5, 0);
    // くつろいでいる感じを出す、ごく小さな呼吸
    this.tweens.add({ targets: room, scaleY: 1.006, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.drawTopBar();
    this.drawNamePlate();
    this.drawStatusPanel();
    this.drawActions();
    this.refresh();

    const report = session.pendingDayReport;
    session.pendingDayReport = null;
    if (session.player.gameOver) this.time.delayedCall(350, () => fadeTo(this, 'GameOver'));
    else if (report) this.time.delayedCall(350, () => this.showDayReport(report));
  }

  private drawTopBar(): void {
    const g = this.add.graphics();
    g.fillStyle(COLOR.nightDeep, 1);
    g.fillRect(0, 0, WIDTH, ROOM_TOP);
    g.fillStyle(COLOR.pink, 1);
    g.fillRect(0, ROOM_TOP - 4, WIDTH, 4);
    this._dateText = this.add.text(24, 20, '', textStyle(30, CSS.text));
    this._moneyText = this.add.text(WIDTH - 24, 20, '', textStyle(30, CSS.gold)).setOrigin(1, 0);
    this._rankText = this.add.text(24, 58, '', textStyle(20, CSS.pinkSoft));
  }

  private drawNamePlate(): void {
    const plate = this.add.graphics();
    plate.fillStyle(COLOR.nightDeep, 0.75);
    plate.fillRoundedRect(16, ROOM_TOP + 16, 330, 64, 20);
    this._nameText = this.add.text(36, ROOM_TOP + 48, '', textStyle(28, CSS.text)).setOrigin(0, 0.5);
  }

  private drawStatusPanel(): void {
    const top = ROOM_TOP + 706 - 70;
    const g = this.add.graphics();
    g.fillStyle(COLOR.panel, 0.94);
    g.fillRoundedRect(16, top, WIDTH - 32, 250, 26);
    const x = 40;
    this._hp = new Gauge(this, x, top + 22, 400, 30, t('stat.hp'), COLOR.hp);
    this._mp = new Gauge(this, x, top + 64, 400, 30, t('stat.mp'), COLOR.mp);
    this._drunk = new Gauge(this, x, top + 106, 400, 30, t('stat.drunk'), COLOR.drunk);
    this._exp = new Gauge(this, x, top + 148, 400, 30, t('stat.exp'), COLOR.mint);
    this._statsText = this.add.text(470, top + 22, '', textStyle(24, CSS.text, { lineSpacing: 12 }));
  }

  private drawActions(): void {
    const y = HEIGHT - 200;
    this._work = new Button(this, WIDTH / 2, y, {
      width: WIDTH - 48,
      height: 116,
      label: t('home.work'),
      sub: '',
      fontSize: 44,
      onClick: () => fadeTo(this, 'Street'),
    });
    const small = { width: 214, height: 96, fontSize: 26 };
    this._care = new Button(this, 24 + 107, y + 136, { ...small, label: t('home.self_care'), sub: '', fill: COLOR.lavender, textColor: CSS.dark, onClick: () => this.openSelfCare() });
    this._sleep = new Button(this, WIDTH / 2, y + 136, { ...small, label: t('home.sleep'), sub: '', fill: COLOR.panelLight, onClick: () => this.sleep() });
    this._ad = new Button(this, WIDTH - 24 - 107, y + 136, {
      ...small,
      label: t('home.ad_refill'),
      sub: '',
      fill: COLOR.cyan,
      textColor: CSS.dark,
      onClick: () => {
        if (useAdRefill(session.player)) {
          session.save();
          banner(this, t('home.ad_refilled'), CSS.cyan);
          this.refresh();
        }
      },
    });
  }

  private refresh(): void {
    const p = session.player;
    const data = session.data;
    const d = dateOf(p.day, data.calendar);
    this._dateText.setText(t('home.date', { month: d.month, week: d.week, weekday: t(`weekday.${d.weekday}`) }));
    this._moneyText.setText(yen(p.money)).setColor(p.money < 0 ? CSS.red : CSS.gold);
    const score = totalRankScore(p, data);
    this._rankText.setText(t('home.rank', { letter: rankLetter(score, data), score: score.toLocaleString('ja-JP') }));
    this._nameText.setText(t('home.name_plate', { name: p.genjiName, level: p.level }));
    this._hp.set(p.hp, p.maxHp);
    this._mp.set(p.mp, p.maxMp);
    this._drunk.set(p.drunk, 100);
    this._exp.set(p.exp, expToNext(p.level, data.player.level_curve));
    this._statsText.setText(
      [
        t('home.stat_line', { name: t('stat.beauty'), value: p.beauty }),
        t('home.stat_line', { name: t('stat.intellect'), value: p.intellect }),
        t('home.stat_line', { name: t('stat.sense'), value: p.sense }),
        t('home.stage', { stage: p.stageLevel }),
      ].join('\n'),
    );

    const block = workBlock(p, data);
    this._work.setEnabled(block === null).setLabel(t('home.work'), block ? t(`home.work_block.${block}`) : t('home.work_sub'));
    this._care.setEnabled(p.actionsLeft > 0).setLabel(t('home.self_care'), t('home.actions_left', { n: p.actionsLeft }));
    this._sleep.setLabel(t('home.sleep'), p.workedToday ? t('home.sleep_sub_worked') : t('home.sleep_sub_rest'));
    this._ad.setEnabled(p.adRefillsLeft > 0 && p.mp < p.maxMp).setLabel(t('home.ad_refill'), t('home.ad_left', { n: p.adRefillsLeft }));
  }

  private sleep(): void {
    const report = endDay(session.player, session.data);
    session.save();
    session.pendingDayReport = report;
    fadeTo(this, 'Home');
  }

  private showDayReport(report: DayReport): void {
    const lines: string[] = [t('day.morning')];
    if (report.hangover) lines.push(t('day.hangover'));
    if (report.settlement) {
      lines.push(t('day.rent_paid', { rent: yen(report.settlement.rent) }));
      if (report.settlement.inDebt) {
        lines.push(t('day.in_debt', { months: report.settlement.debtMonths, limit: session.data.calendar.debt_game_over_months }));
      }
    }
    if (lines.length === 1) {
      banner(this, lines[0] as string, CSS.pinkSoft);
      return;
    }
    const root = modal(this, 420);
    root.add(this.add.text(WIDTH / 2, HEIGHT / 2 - 90, lines.join('\n'), wrappedStyle(28, CSS.text, 600, { align: 'center', lineSpacing: 14 })).setOrigin(0.5));
    root.add(new Button(this, WIDTH / 2, HEIGHT / 2 + 130, { width: 300, height: 90, label: t('common.ok'), onClick: () => root.destroy() }));
  }

  private openSelfCare(): void {
    const root = modal(this, HEIGHT - 120);
    const top = 60;
    const title = this.add.text(WIDTH / 2, top + 50, '', textStyle(34, CSS.text)).setOrigin(0.5);
    root.add(title);
    const list = this.add.container(0, 0);
    root.add(list);
    let category: StatId = 'beauty';

    const tabs = STAT_IDS.map((stat, i) => {
      const button = new Button(this, 150 + i * 210, top + 120, {
        width: 190,
        height: 70,
        label: t(`stat.${stat}`),
        fontSize: 26,
        fill: COLOR.panelLight,
        onClick: () => {
          category = stat;
          render();
        },
      });
      root.add(button);
      return button;
    });

    const render = () => {
      const p = session.player;
      title.setText(t('self_care.title', { n: p.actionsLeft, money: yen(p.money) }));
      tabs.forEach((tab, i) => tab.setAlpha(STAT_IDS[i] === category ? 1 : 0.55));
      list.removeAll(true);
      const items = session.data.selfCare.filter((item) => item.category === category);
      items.forEach((item, i) => list.add(this.selfCareRow(item, top + 200 + i * 150, render)));
    };
    render();

    root.add(new Button(this, WIDTH / 2, HEIGHT - 130, {
      width: 320,
      height: 90,
      label: t('common.close'),
      fill: COLOR.panelLight,
      onClick: () => {
        root.destroy();
        this.refresh();
      },
    }));
  }

  private selfCareRow(item: SelfCareData, y: number, onDone: () => void): Phaser.GameObjects.Container {
    const p = session.player;
    const row = this.add.container(0, y);
    const bg = this.add.graphics();
    bg.fillStyle(COLOR.nightDeep, 0.7);
    bg.fillRoundedRect(48, 0, WIDTH - 96, 132, 20);
    row.add(bg);
    row.add(this.add.text(72, 18, t(item.name_key), textStyle(28, CSS.text)));
    const effects = [
      ...Object.entries(item.gains).map(([stat, v]) => t('self_care.gain', { name: t(`stat.${stat}`), value: v })),
      ...Object.entries(item.hobbies).map(([hobby, v]) => t('self_care.gain', { name: t(`hobby.${hobby}`), value: v })),
    ];
    row.add(this.add.text(72, 58, effects.join('  '), textStyle(22, CSS.mint)));
    row.add(this.add.text(72, 92, yen(item.cost), textStyle(22, CSS.gold)));
    const block = selfCareBlock(p, item);
    const button = new Button(this, WIDTH - 150, 66, {
      width: 170,
      height: 84,
      label: t('self_care.do'),
      sub: block ? t(`self_care.block.${block}`, { level: item.min_level }) : ' ',
      fontSize: 26,
      onClick: () => {
        applySelfCare(p, item);
        session.save();
        banner(this, t('self_care.done', { name: t(item.name_key) }), CSS.mint, HEIGHT * 0.18);
        onDone();
      },
    });
    button.setEnabled(block === null);
    row.add(button);
    return row;
  }
}
