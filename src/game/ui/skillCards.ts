import Phaser from 'phaser';
import type { SkillData, SkillKind } from '../../core/data/types';
import { sfx } from '../audio/sfx';
import { t } from '../i18n';
import { COLOR, CSS, HEIGHT, WIDTH, drawPanel, drawRibbon, textStyle, titleStyle, wrappedStyle } from '../theme';
import { modal, pinToScreen } from './fx';
import { TapGuard } from './tapGuard';

/**
 * レベルアップのスキル 3 択（アーチャー伝説 2 のような軽い札）。横に 3 枚、タップ 1 回で決まる。
 * アイコンは買ったパックの絵を公開リポジトリに置けないので、色の丸と記号をコードで描く。
 */
const BADGE: Record<SkillKind, number> = {
  multishot: 0xff6fa8,
  diagonal: 0xff8fb8,
  rear: 0xb98cff,
  power: 0xff7a59,
  rapid: 0xffb347,
  pierce: 0x6fa8ff,
  speed: 0x4fd1c5,
  max_hp: 0xff5b6e,
  heal: 0x5fd6a4,
  magnet: 0x8e7dff,
  orbit: 0xff4f8b,
};

/** 出てから押し始めを受け付けない時間（粒を拾いに動かしていた指で押さないように） */
const ARM_MS = 450;

export function openSkillCards(scene: Phaser.Scene, offer: readonly SkillData[], levels: Record<string, number>, onPick: (id: string) => void): void {
  const root = modal(scene, 620, HEIGHT / 2);
  const top = HEIGHT / 2 - 310;
  const ribbon = scene.add.graphics();
  drawRibbon(ribbon, WIDTH / 2, top + 10, 460, 76);
  root.add(ribbon);
  root.add(scene.add.text(WIDTH / 2, top + 8, t('skill.title'), titleStyle(34, '#e0508b')).setOrigin(0.5));
  root.add(scene.add.text(WIDTH / 2, top + 74, t('skill.hint'), textStyle(22, CSS.sub)).setOrigin(0.5));

  const cardW = 200;
  const cardH = 440;
  const gap = 12;
  const x0 = WIDTH / 2 - (cardW * offer.length + gap * (offer.length - 1)) / 2;
  let picked = false;
  offer.forEach((skill, i) => {
    const level = levels[skill.id] ?? 0;
    const card = scene.add.container(x0 + i * (cardW + gap) + cardW / 2, top + 110 + cardH / 2);
    const g = scene.add.graphics();
    drawPanel(g, -cardW / 2, -cardH / 2, cardW, cardH, 28);
    card.add(g);
    // アイコン: 色の丸 ＋ 記号
    const badge = scene.add.graphics();
    const color = BADGE[skill.kind];
    badge.fillStyle(Phaser.Display.Color.ValueToColor(color).darken(18).color, 1);
    badge.fillCircle(0, -cardH / 2 + 96, 62);
    badge.fillStyle(color, 1);
    badge.fillCircle(0, -cardH / 2 + 90, 62);
    badge.fillStyle(0xffffff, 0.3);
    badge.fillEllipse(-14, -cardH / 2 + 60, 60, 26);
    card.add(badge);
    card.add(scene.add.text(0, -cardH / 2 + 90, t(`skill.${skill.id}.icon`), titleStyle(skillIconSize(skill.id), '#00000033')).setOrigin(0.5));
    card.add(scene.add.text(0, -cardH / 2 + 182, t(`skill.${skill.id}.name`), textStyle(26, CSS.text, { align: 'center' })).setOrigin(0.5));
    card.add(
      scene.add
        .text(0, -cardH / 2 + 250, t(`skill.${skill.id}.desc`, { value: skillValueLabel(skill) }), wrappedStyle(20, CSS.sub, cardW - 30, { align: 'center', lineSpacing: 4 }))
        .setOrigin(0.5, 0),
    );
    // レベルの目盛り（NEW か ●●○）
    const pips = skill.max_level > 5
      ? t('skill.repeatable')
      : level === 0
        ? t('skill.new')
        : Array.from({ length: skill.max_level }, (_, k) => (k <= level ? '●' : '○')).join(''); // i18n-ignore: 目盛りの記号
    card.add(scene.add.text(0, cardH / 2 - 40, pips, titleStyle(24, level === 0 && skill.max_level <= 5 ? '#ff4f6e' : '#ff9b2f')).setOrigin(0.5));

    card.setSize(cardW, cardH).setInteractive({ useHandCursor: true });
    const guard = new TapGuard(scene.time.now, ARM_MS);
    card.on('pointerdown', () => {
      guard.down(scene.time.now);
      if (guard.pressed) scene.tweens.add({ targets: card, scale: 0.96, duration: 60, yoyo: true });
    });
    card.on('pointerout', () => guard.cancel());
    card.on('pointerup', () => {
      if (!guard.up() || picked) return;
      picked = true;
      sfx.play('ui_confirm');
      scene.tweens.add({
        targets: card,
        scale: 1.12,
        duration: 140,
        yoyo: true,
        onComplete: () => {
          root.destroy();
          onPick(skill.id);
        },
      });
    });
    // 1 枚ずつ跳ねて出てくる
    card.setScale(0.6).setAlpha(0);
    scene.tweens.add({ targets: card, scale: 1, alpha: 1, delay: 90 * i, duration: 260, ease: 'Back.Out' });
    root.add(card);
  });
  pinToScreen(root);
  void COLOR;
}

/** 記号の字の大きさ（字数が多いものは小さく） */
function skillIconSize(id: string): number {
  return [...t(`skill.${id}.icon`)].length >= 3 ? 34 : 44;
}

/** 説明文に差し込む数字（割合は % に直す） */
function skillValueLabel(skill: SkillData): string {
  switch (skill.kind) {
    case 'power':
    case 'speed':
    case 'magnet':
    case 'heal':
      return `${Math.round(skill.value * 100)}`;
    case 'rapid':
      return `${Math.round((1 - skill.value) * 100)}`;
    default:
      return `${skill.value}`;
  }
}
