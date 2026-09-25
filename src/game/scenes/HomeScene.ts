import Phaser from 'phaser';
import { dateOf } from '../../core/career/calendar';
import { endDay, type DayReport } from '../../core/career/day';
import { claimLoginBonus, type LoginReward } from '../../core/career/loginBonus';
import { expToNext } from '../../core/career/progression';
import { rankLetter, totalRankScore } from '../../core/career/rank';
import { applyRealtimeRecovery } from '../../core/career/recovery';
import { activeRival } from '../../core/career/rival';
import { applySelfCare, cancelSubscription, daysLeft, selfCareBlock } from '../../core/career/selfCare';
import { bonusStat, effectiveStat } from '../../core/career/stats';
import { useAdRefill, workBlock } from '../../core/career/work';
import { byId } from '../../core/data/gameData';
import { STAT_IDS, type SelfCareData, type StatId } from '../../core/data/types';
import { sfx } from '../audio/sfx';
import { t, yen } from '../i18n';
import { session, todayKey } from '../session';
import { COLOR, CSS, HEIGHT, WIDTH, textStyle, wrappedStyle } from '../theme';
import { Button } from '../ui/Button';
import { banner, fadeTo, modal } from '../ui/fx';
import { Gauge } from '../ui/Gauge';

const ROOM_TOP = 96;
/** 実時間の回復を見に行く間隔 */
const RECOVERY_POLL_MS = 1000;

/**
 * ホーム画面＝自宅。部屋の絵の上で主人公がくつろぎ、下に能力と行動のボタン。
 * 1 日: 自分磨き（回数制限）→ 出勤 → 帰宅したら寝る（翌日へ・月末は家賃と月額）。
 * 開いている間も HP / MP は実時間で戻る。その日初めて開いたらログインボーナス。
 */
export class HomeScene extends Phaser.Scene {
  private _dateText!: Phaser.GameObjects.Text;
  private _moneyText!: Phaser.GameObjects.Text;
  private _rankText!: Phaser.GameObjects.Text;
  private _nameText!: Phaser.GameObjects.Text;
  private _statsText!: Phaser.GameObjects.Text;
  private _rivalText!: Phaser.GameObjects.Text;
  private _soundText!: Phaser.GameObjects.Text;
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
    this.pollRecovery();
    this.time.addEvent({ delay: RECOVERY_POLL_MS, loop: true, callback: () => this.pollRecovery() });
    this.refresh();

    const report = session.pendingDayReport;
    session.pendingDayReport = null;
    const login = session.player.gameOver ? null : claimLoginBonus(session.player, session.data, todayKey());
    if (login) session.save();
    if (session.player.gameOver) this.time.delayedCall(350, () => fadeTo(this, 'GameOver'));
    else if (report) this.time.delayedCall(350, () => this.showDayReport(report, login));
    else if (login) this.time.delayedCall(350, () => this.showLoginBonus(login));
  }

  /** 実時間の回復を進める。変わったときだけ保存して描き直す */
  private pollRecovery(): void {
    const gained = applyRealtimeRecovery(session.player, session.data, Date.now());
    if (gained.hp + gained.mp + gained.drunk > 0) {
      session.save();
      this.refresh();
    }
  }

  private drawTopBar(): void {
    const g = this.add.graphics();
    g.fillStyle(COLOR.nightDeep, 1);
    g.fillRect(0, 0, WIDTH, ROOM_TOP);
    g.fillStyle(COLOR.pink, 1);
    g.fillRect(0, ROOM_TOP - 4, WIDTH, 4);
    this._dateText = this.add.text(24, 20, '', textStyle(30, CSS.text));
    this._moneyText = this.add.text(WIDTH - 24, 16, '', textStyle(30, CSS.gold)).setOrigin(1, 0);
    this._rankText = this.add.text(24, 58, '', textStyle(20, CSS.pinkSoft));
    this._soundText = this.add
      .text(WIDTH - 24, 58, '', textStyle(20, CSS.sub))
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        sfx.toggleMute();
        sfx.play('ui_select');
        this.refresh();
      });
  }

  private drawNamePlate(): void {
    const plate = this.add.graphics();
    plate.fillStyle(COLOR.nightDeep, 0.75);
    plate.fillRoundedRect(16, ROOM_TOP + 16, 330, 64, 20);
    this._nameText = this.add.text(36, ROOM_TOP + 48, '', textStyle(28, CSS.text)).setOrigin(0, 0.5);
    // 関門のステージだけ、ライバルの札を右上に出す
    this._rivalText = this.add
      .text(WIDTH - 24, ROOM_TOP + 30, '', wrappedStyle(22, CSS.text, 330, { backgroundColor: '#5b2a86', padding: { x: 14, y: 10 }, align: 'center' }))
      .setOrigin(1, 0);
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
    this._statsText = this.add.text(462, top + 22, '', textStyle(24, CSS.text, { lineSpacing: 12 }));
  }

  private drawActions(): void {
    const y = HEIGHT - 200;
    this._work = new Button(this, WIDTH / 2, y, {
      width: WIDTH - 48,
      height: 116,
      label: t('home.work'),
      sub: '',
      fontSize: 44,
      sfx: 'title_press',
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
      sfx: 'pickup_item',
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
    this._soundText.setText(t(sfx.muted ? 'home.sound_off' : 'home.sound_on')).setVisible(sfx.available);
    this._nameText.setText(t('home.name_plate', { name: p.genjiName, level: p.level }));
    this._hp.set(p.hp, p.maxHp);
    this._mp.set(p.mp, p.maxMp);
    this._drunk.set(p.drunk, 100);
    this._exp.set(p.exp, expToNext(p.level, data.player.level_curve));
    this._statsText.setText([...STAT_IDS.map((stat) => this.statLine(stat)), t('home.stage', { stage: p.stageLevel })].join('\n'));

    const rival = activeRival(p, data);
    this._rivalText
      .setText(rival ? t('home.rival_notice', { name: t(rival.name_key), target: yen(rival.sales_target) }) : '')
      .setVisible(rival !== null);

    const block = workBlock(p, data);
    const workSub = block ? t(`home.work_block.${block}`) : rival ? t('home.work_sub_rival', { name: t(rival.name_key) }) : t('home.work_sub');
    this._work.setEnabled(block === null).setLabel(t('home.work'), workSub);
    this._care.setEnabled(p.actionsLeft > 0).setLabel(t('home.self_care'), t('home.actions_left', { n: p.actionsLeft }));
    this._sleep.setLabel(t('home.sleep'), p.workedToday ? t('home.sleep_sub_worked') : t('home.sleep_sub_rest'));
    this._ad.setEnabled(p.adRefillsLeft > 0 && p.mp < p.maxMp).setLabel(t('home.ad_refill'), t('home.ad_left', { n: p.adRefillsLeft }));
  }

  /** 「美貌 13 (+3)」。上乗せ（期間つき・月額）があれば括弧で出す */
  private statLine(stat: StatId): string {
    const p = session.player;
    const bonus = bonusStat(p, session.data, stat);
    const params = { name: t(`stat.${stat}`), value: effectiveStat(p, session.data, stat), bonus };
    return bonus > 0 ? t('home.stat_line_bonus', params) : t('home.stat_line', params);
  }

  private sleep(): void {
    const report = endDay(session.player, session.data);
    session.save();
    session.pendingDayReport = report;
    fadeTo(this, 'Home');
  }

  private showDayReport(report: DayReport, login: LoginReward | null): void {
    const lines: string[] = [t('day.morning')];
    if (report.hangover) lines.push(t('day.hangover'));
    for (const e of report.expired) {
      const name = t(byId(session.data.selfCare, e.itemId).name_key);
      lines.push(e.rebound > 0 ? t('day.expired_rebound', { name, rebound: e.rebound }) : t('day.expired', { name }));
    }
    if (report.settlement) {
      const s = report.settlement;
      lines.push(s.fees > 0 ? t('day.rent_and_fees', { rent: yen(s.rent), fees: yen(s.fees) }) : t('day.rent_paid', { rent: yen(s.rent) }));
      if (s.inDebt) lines.push(t('day.in_debt', { months: s.debtMonths, limit: session.data.calendar.debt_game_over_months }));
    }
    const next = () => login && this.showLoginBonus(login);
    if (lines.length === 1) {
      banner(this, lines[0] as string, CSS.pinkSoft);
      if (login) this.time.delayedCall(900, next);
      return;
    }
    const root = modal(this, 520);
    root.add(this.add.text(WIDTH / 2, HEIGHT / 2 - 90, lines.join('\n'), wrappedStyle(26, CSS.text, 600, { align: 'center', lineSpacing: 12 })).setOrigin(0.5));
    root.add(new Button(this, WIDTH / 2, HEIGHT / 2 + 180, { width: 300, height: 90, label: t('common.ok'), onClick: () => { root.destroy(); next(); } }));
  }

  private showLoginBonus(reward: LoginReward): void {
    sfx.play('activity_clear');
    const root = modal(this, 440);
    root.add(this.add.text(WIDTH / 2, HEIGHT / 2 - 140, t('login.title', { streak: reward.streak }), textStyle(36, CSS.gold)).setOrigin(0.5));
    const body = reward.kind === 'money' ? t('login.money', { amount: yen(reward.amount) }) : t(`login.${reward.kind}`);
    root.add(this.add.text(WIDTH / 2, HEIGHT / 2 - 30, body, wrappedStyle(34, CSS.text, 600, { align: 'center' })).setOrigin(0.5));
    root.add(new Button(this, WIDTH / 2, HEIGHT / 2 + 120, { width: 300, height: 90, label: t('login.receive'), onClick: () => { root.destroy(); this.refresh(); } }));
  }

  private openSelfCare(): void {
    const root = modal(this, HEIGHT - 120);
    const top = 60;
    const title = this.add.text(WIDTH / 2, top + 50, '', textStyle(32, CSS.text)).setOrigin(0.5);
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
        sfx: 'ui_select',
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
      items.forEach((item, i) => list.add(this.selfCareRow(item, top + 180 + i * 122, render)));
    };
    render();

    root.add(new Button(this, WIDTH / 2, HEIGHT - 130, {
      width: 320,
      height: 90,
      label: t('common.close'),
      fill: COLOR.panelLight,
      sfx: 'ui_cancel',
      onClick: () => {
        root.destroy();
        this.refresh();
      },
    }));
  }

  /** 自分磨きの 1 行。名前・効き目・種類（期間 / 月額）・値段と、やる / 解約のボタン */
  private selfCareRow(item: SelfCareData, y: number, onDone: () => void): Phaser.GameObjects.Container {
    const p = session.player;
    const row = this.add.container(0, y);
    const bg = this.add.graphics();
    bg.fillStyle(COLOR.nightDeep, 0.7);
    bg.fillRoundedRect(48, 0, WIDTH - 96, 112, 18);
    row.add(bg);
    row.add(this.add.text(70, 12, t(item.name_key), textStyle(26, CSS.text)));
    const effects = [
      ...Object.entries(item.gains).map(([stat, v]) => t('self_care.gain', { name: t(`stat.${stat}`), value: v })),
      ...Object.entries(item.hobbies).map(([hobby, v]) => t('self_care.gain', { name: t(`hobby.${hobby}`), value: v })),
    ];
    row.add(this.add.text(70, 48, effects.join('  '), textStyle(20, CSS.mint)));
    row.add(this.add.text(70, 78, `${yen(item.cost)}  ${this.kindLabel(item)}`, textStyle(20, CSS.gold)));

    const subscribed = item.kind === 'subscription' && p.subscriptions.includes(item.id);
    if (subscribed) {
      row.add(new Button(this, WIDTH - 140, 56, {
        width: 150,
        height: 76,
        label: t('self_care.cancel'),
        sub: t('self_care.subscribed'),
        fontSize: 24,
        fill: COLOR.panelLight,
        sfx: 'ui_cancel',
        onClick: () => {
          cancelSubscription(p, item.id);
          session.save();
          onDone();
        },
      }));
      return row;
    }
    const block = selfCareBlock(p, item);
    const button = new Button(this, WIDTH - 140, 56, {
      width: 150,
      height: 76,
      label: t('self_care.do'),
      sub: block ? t(`self_care.block.${block}`, { level: item.min_level }) : '',
      fontSize: 24,
      sfx: 'pickup_item',
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

  private kindLabel(item: SelfCareData): string {
    const p = session.player;
    if (item.kind === 'timed') {
      const left = daysLeft(p, item.id);
      const days = item.duration_days ?? 0;
      const label = left > 0 ? t('self_care.kind_timed_active', { days, left }) : t('self_care.kind_timed', { days });
      return item.rebound ? `${label} ${t('self_care.rebound_note', { rebound: item.rebound })}` : label;
    }
    if (item.kind === 'subscription') return t('self_care.kind_subscription', { fee: yen(item.monthly_fee ?? 0) });
    return '';
  }
}
