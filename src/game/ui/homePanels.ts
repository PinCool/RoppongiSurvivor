import type Phaser from 'phaser';
import { regularLevel } from '../../core/career/book';
import { dateOf, daysPerMonth } from '../../core/career/calendar';
import { claimAllBonus, claimMission, missionViews } from '../../core/career/missions';
import { PLAYER_ID, standings } from '../../core/career/ranking';
import { byId } from '../../core/data/gameData';
import type { MissionReward } from '../../core/data/types';
import { sfx } from '../audio/sfx';
import { t, yen } from '../i18n';
import { session } from '../session';
import { idleFrame } from '../sprites';
import { COLOR, CSS, HEIGHT, WIDTH, drawRibbon, textStyle, titleStyle } from '../theme';
import { Button } from './Button';
import { banner, modal } from './fx';

/**
 * ホームから開くパネル（デイリーミッション・お客さん図鑑・店内ランキング）。
 * どれも「全画面のモーダル + 見出しのリボン + とじる」の同じ器。
 */

const PANEL_TOP = 60;

function frame(scene: Phaser.Scene, title: string, onClose: () => void): Phaser.GameObjects.Container {
  const root = modal(scene, HEIGHT - 120);
  const ribbon = scene.add.graphics();
  drawRibbon(ribbon, WIDTH / 2, PANEL_TOP + 20, 420, 72);
  root.add(ribbon);
  root.add(scene.add.text(WIDTH / 2, PANEL_TOP + 18, title, titleStyle(32, '#e0508b')).setOrigin(0.5));
  root.add(
    new Button(scene, WIDTH / 2, HEIGHT - 130, {
      width: 320,
      height: 88,
      label: t('common.close'),
      variant: 'quiet',
      sfx: 'ui_cancel',
      onClick: () => {
        root.destroy();
        onClose();
      },
    }),
  );
  return root;
}

export function rewardLabel(reward: MissionReward): string {
  return reward.kind === 'money' ? yen(reward.amount) : t(`mission.reward.${reward.kind}`, { n: reward.amount });
}

// ---------- デイリーミッション ----------

export function openMissions(scene: Phaser.Scene, onChange: () => void): void {
  const root = frame(scene, t('mission.title'), onChange);
  const body = scene.add.container(0, 0);
  root.add(body);
  const render = () => {
    body.removeAll(true);
    const p = session.player;
    const views = missionViews(p, session.data);
    views.forEach((v, i) => {
      const y = PANEL_TOP + 110 + i * 190;
      const g = scene.add.graphics();
      g.fillStyle(COLOR.surfaceAlt, 1);
      g.fillRoundedRect(48, y, WIDTH - 96, 170, 26);
      body.add(g);
      body.add(scene.add.text(76, y + 22, t(`mission.kind.${v.kind}`, { target: v.kind === 'shift_sales' ? yen(v.target) : v.target }), textStyle(26, CSS.text)));
      // 進みのゲージ
      const bw = WIDTH - 360;
      const ratio = v.progress / v.target;
      g.fillStyle(COLOR.gaugeTrack, 1);
      g.fillRoundedRect(76, y + 76, bw, 26, 13);
      g.fillStyle(v.done ? COLOR.exp : COLOR.hp, 1);
      g.fillRoundedRect(76, y + 76, Math.max(26, bw * ratio), 26, 13);
      const progress = v.kind === 'shift_sales' ? `${yen(v.progress)} / ${yen(v.target)}` : `${v.progress} / ${v.target}`;
      body.add(scene.add.text(76 + bw / 2, y + 89, progress, textStyle(18, '#ffffff', { stroke: CSS.text, strokeThickness: 4 })).setOrigin(0.5));
      body.add(scene.add.text(76, y + 118, t('mission.reward', { reward: rewardLabel(v.reward) }), textStyle(22, CSS.money)));
      const button = new Button(scene, WIDTH - 150, y + 100, {
        width: 170,
        height: 76,
        label: v.claimed ? t('mission.claimed') : t('mission.claim'),
        variant: v.claimed ? 'quiet' : 'primary',
        fontSize: 24,
        sfx: 'activity_clear',
        onClick: () => {
          const reward = claimMission(p, session.data, v.id);
          if (!reward) return;
          session.save();
          banner(scene, t('mission.got', { reward: rewardLabel(reward) }), CSS.titleStroke, HEIGHT * 0.2);
          render();
          onChange();
        },
      });
      button.setEnabled(v.done && !v.claimed);
      body.add(button);
    });
    // 全部クリアの追加報酬
    const y = PANEL_TOP + 110 + views.length * 190 + 10;
    const allClaimed = p.missions.allClaimed;
    const ready = views.length > 0 && views.every((v) => v.claimed);
    body.add(scene.add.text(WIDTH / 2, y + 16, t('mission.all_bonus', { reward: rewardLabel(session.data.missions.complete_all_reward) }), textStyle(24, CSS.sub)).setOrigin(0.5));
    const all = new Button(scene, WIDTH / 2, y + 90, {
      width: 420,
      height: 84,
      label: allClaimed ? t('mission.claimed') : t('mission.claim_all'),
      variant: allClaimed ? 'quiet' : 'yellow',
      sfx: 'activity_clear',
      onClick: () => {
        const reward = claimAllBonus(p, session.data);
        if (!reward) return;
        session.save();
        banner(scene, t('mission.got', { reward: rewardLabel(reward) }), CSS.accent, HEIGHT * 0.2);
        render();
        onChange();
      },
    });
    all.setEnabled(ready && !allClaimed);
    body.add(all);
  };
  render();
}

// ---------- お客さん図鑑 ----------

export function openBook(scene: Phaser.Scene): void {
  const data = session.data;
  const p = session.player;
  const met = data.customers.filter((c) => (p.book[c.id]?.visits ?? 0) > 0).length;
  const root = frame(scene, t('book.title', { met, total: data.customers.length }), () => undefined);
  data.customers.forEach((c, i) => {
    const y = PANEL_TOP + 100 + i * 176;
    const entry = p.book[c.id];
    const known = (entry?.visits ?? 0) > 0;
    const g = scene.add.graphics();
    g.fillStyle(COLOR.surfaceAlt, 1);
    g.fillRoundedRect(48, y, WIDTH - 96, 160, 26);
    root.add(g);
    const face = scene.add.sprite(120, y + 150, c.visual_id, idleFrame(c.visual_id)).setOrigin(0.5, 1).setScale(0.95);
    // 会ったことが無いお客は影だけ
    if (!known) face.setTint(0x5a3a5e).setAlpha(0.35);
    root.add(face);
    root.add(scene.add.text(196, y + 18, known ? t('book.name', { name: t(c.name_key), rank: c.rank }) : t('book.unknown'), textStyle(28, known ? CSS.text : CSS.dim)));
    if (!known) {
      root.add(scene.add.text(196, y + 66, t('book.unknown_hint', { stage: c.min_stage }), textStyle(22, CSS.dim)));
      return;
    }
    const level = regularLevel(entry!.visits, data.regulars);
    root.add(scene.add.text(196, y + 60, t('book.regular', { level, visits: entry!.visits }), textStyle(22, CSS.customer)));
    root.add(scene.add.text(196, y + 92, t('book.likes', { stat: t(`stat.${c.preference}`), hobby: t(`hobby.${c.hobby}`) }), textStyle(22, CSS.good)));
    root.add(scene.add.text(196, y + 122, t('book.best', { best: yen(entry!.bestSales), total: yen(entry!.totalSales) }), textStyle(20, CSS.money)));
  });
  sfx.play('talk_open');
}

// ---------- 店内ランキング ----------

export function openRanking(scene: Phaser.Scene): void {
  const data = session.data;
  const p = session.player;
  const d = dateOf(p.day, data.calendar);
  const daysLeft = daysPerMonth(data.calendar) - (p.day % daysPerMonth(data.calendar));
  const root = frame(scene, t('ranking.title', { month: d.month }), () => undefined);
  const rows = standings(p, data);
  rows.forEach((row, i) => {
    const y = PANEL_TOP + 100 + i * 112;
    const me = row.id === PLAYER_ID;
    const g = scene.add.graphics();
    g.fillStyle(me ? 0xffe0ef : COLOR.surfaceAlt, 1);
    g.fillRoundedRect(48, y, WIDTH - 96, 96, 26);
    if (me) {
      g.lineStyle(4, COLOR.ribbon, 1);
      g.strokeRoundedRect(48, y, WIDTH - 96, 96, 26);
    }
    root.add(g);
    const medal = row.rank <= 3 ? ['#ffb400', '#a9b4c2', '#d9895b'][row.rank - 1]! : CSS.sub;
    root.add(scene.add.text(100, y + 48, String(row.rank), titleStyle(40, medal)).setOrigin(0.5));
    const name = me ? p.genjiName : t(byId(data.ranking.npcs, row.id).name_key);
    root.add(scene.add.text(150, y + 48, name, textStyle(28, me ? CSS.money : CSS.text)).setOrigin(0, 0.5));
    root.add(scene.add.text(WIDTH - 76, y + 48, yen(row.sales), textStyle(28, CSS.text)).setOrigin(1, 0.5));
  });
  const y = PANEL_TOP + 100 + rows.length * 112 + 16;
  root.add(scene.add.text(WIDTH / 2, y, t('ranking.days_left', { days: daysLeft }), textStyle(24, CSS.sub)).setOrigin(0.5));
  const rewards = data.ranking.rewards.map((r) => t('ranking.reward_line', { rank: r.rank, money: yen(r.money) })).join('   ');
  root.add(scene.add.text(WIDTH / 2, y + 40, rewards, textStyle(22, CSS.money)).setOrigin(0.5));
  root.add(scene.add.text(WIDTH / 2, y + 76, t('ranking.note'), textStyle(18, CSS.dim)).setOrigin(0.5));
  sfx.play('talk_open');
}
