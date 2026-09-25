import Phaser from 'phaser';
import { applyShift } from '../../core/career/shift';
import { byId } from '../../core/data/gameData';
import { sfx } from '../audio/sfx';
import { t, yen } from '../i18n';
import { session } from '../session';
import { CSS, HEIGHT, WIDTH, drawBackdrop, drawPanel, textStyle, titleStyle, wrappedStyle } from '../theme';
import { Button } from '../ui/Button';
import { fadeTo } from '../ui/fx';

/** 出勤の締め。集客と接客の結果を主人公へ反映して、数字を順に見せる */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(): void {
    const street = session.lastStreet;
    if (!street) throw new Error('集客の結果が無い');
    const report = applyShift(session.player, session.data, street, session.lastService);
    session.lastShift = report;
    session.lastStreet = null;
    session.lastService = null;
    session.save();

    this.cameras.main.fadeIn(300, 255, 227, 240);
    drawBackdrop(this);
    this.time.delayedCall(250, () => sfx.play('shop_settle'));
    if (report.levelsGained > 0) this.time.delayedCall(1100, () => sfx.play('level_up'));
    const titleStroke = report.outcome === 'goal' ? CSS.titleStroke : report.outcome === 'late' ? CSS.accent : '#9b6bff';
    this.add.text(WIDTH / 2, 120, t(`result.title.${report.outcome}`), titleStyle(56, titleStroke)).setOrigin(0.5);

    const g = this.add.graphics();
    drawPanel(g, 28, 206, WIDTH - 56, 768);

    const rows: [string, string, string][] = [
      [t('result.sales'), yen(report.sales), CSS.money],
      [t('result.earned'), yen(report.earned), CSS.money],
      [t('result.exp'), t('result.exp_value', { exp: report.exp }), CSS.good],
      [t('result.kills'), t('result.kills_value', { n: report.kills }), CSS.text],
      [t('result.stage'), t('result.stage_value', { before: report.stageBefore, after: report.stageAfter }), CSS.text],
    ];
    if (report.levelsGained > 0) rows.push([t('result.level_up'), t('result.level_value', { level: report.levelAfter }), CSS.money]);
    if (report.outcome === 'late') rows.push([t('result.late_note'), '', CSS.bad]);
    if (report.rival) {
      const name = t(byId(session.data.rivals, report.rival.id).name_key);
      rows.push([
        t('result.rival', { name }),
        t(report.rival.won ? 'result.rival_won' : 'result.rival_lost', { target: yen(report.rival.target) }),
        report.rival.won ? CSS.money : CSS.bad,
      ]);
    }

    rows.forEach(([label, value, color], i) => {
      const y = 260 + i * 72;
      const l = this.add.text(70, y, label, textStyle(30, CSS.sub)).setAlpha(0);
      const v = this.add.text(WIDTH - 70, y, value, textStyle(34, color)).setOrigin(1, 0).setAlpha(0);
      this.tweens.add({ targets: [l, v], alpha: 1, x: '+=0', delay: 200 + i * 140, duration: 250 });
    });

    const guestTop = 260 + rows.length * 72 + 20;
    report.guests.forEach((guest, i) => {
      const type = byId(session.data.customers, guest.typeId);
      const line = t(guest.left ? 'result.guest_left' : 'result.guest', { name: t(type.name_key), sales: yen(guest.sales) });
      this.add.text(70, guestTop + i * 46, line, textStyle(24, guest.left ? CSS.dim : CSS.text));
    });
    if (report.guests.length === 0 && report.outcome !== 'down') {
      this.add.text(70, guestTop, t('result.no_guests'), textStyle(24, CSS.dim));
    }
    if (report.outcome === 'down') this.add.text(70, guestTop, t('result.down_note'), wrappedStyle(24, CSS.dim, WIDTH - 140));

    new Button(this, WIDTH / 2, HEIGHT - 170, { width: WIDTH - 120, height: 110, label: t('result.go_home'), fontSize: 38, onClick: () => fadeTo(this, 'Home') });
  }
}
