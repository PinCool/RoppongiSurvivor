import Phaser from 'phaser';
import { nextSeed } from '../../core/career/playerState';
import { spendAdRefill } from '../../core/career/work';
import { byId } from '../../core/data/gameData';
import { StreetSim, type ChoiceOption, type CustomerInstance, type RecruitChoice, type StreetEvent } from '../../core/street/streetSim';
import type { Vec2 } from '../../core/vec';
import { DEPTH, characterDepth } from '../depth';
import { t } from '../i18n';
import { session } from '../session';
import { animKey, hasClip, idleFrame } from '../sprites';
import { COLOR, CSS, HEIGHT, WIDTH, textStyle } from '../theme';
import { Button } from '../ui/Button';
import { banner, fadeTo, floatText, modal, pinToScreen } from '../ui/fx';
import { Gauge } from '../ui/Gauge';
import { VirtualStick } from '../ui/VirtualStick';

const CHARACTER_SCALE = 0.72;
const TILE = 512;
/** ダメージ数字を同時に出す上限（連射で画面が数字で埋まらないように） */
const MAX_DAMAGE_NUMBERS = 24;

/**
 * 集客パートの描画。StreetSim を毎フレーム進め、その状態を写すだけ。
 * 敵・お客は uid ごとにスプライトを持ち、シミュレーションから消えたら破棄する。
 */
export class StreetScene extends Phaser.Scene {
  private _sim!: StreetSim;
  private _stick!: VirtualStick;
  private _ground!: Phaser.GameObjects.TileSprite;
  private _player!: Phaser.GameObjects.Sprite;
  private _shots!: Phaser.GameObjects.Graphics;
  private _markers!: Phaser.GameObjects.Graphics;
  private _arrows!: Phaser.GameObjects.Graphics;
  private _goal: Phaser.GameObjects.Container | null = null;
  private readonly _enemies = new Map<number, Phaser.GameObjects.Sprite>();
  private readonly _customers = new Map<number, Phaser.GameObjects.Sprite>();
  private _timer!: Phaser.GameObjects.Text;
  private _hp!: Gauge;
  private _mp!: Gauge;
  private _level!: Phaser.GameObjects.Text;
  private _expBar!: Phaser.GameObjects.Graphics;
  private _companionSlots!: Phaser.GameObjects.Graphics;
  private _encounter: Phaser.GameObjects.Container | null = null;
  private _finishing = false;
  private _damageNumbers = 0;

  constructor() {
    super('Street');
  }

  create(): void {
    const p = session.player;
    this._finishing = false;
    this._damageNumbers = 0;
    this._encounter = null;
    this._goal = null;
    this._enemies.clear();
    this._customers.clear();
    this._sim = new StreetSim(session.data, {
      stageLevel: p.stageLevel,
      hp: p.hp,
      maxHp: p.maxHp,
      mp: p.mp,
      maxMp: p.maxMp,
      seed: nextSeed(p),
    });
    session.save();

    this.cameras.main.fadeIn(300);
    this.makeGroundTexture();
    this._ground = this.add.tileSprite(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 'street-ground').setScrollFactor(0).setDepth(DEPTH.ground);
    this.drawWorldEdge();
    this._markers = this.add.graphics().setDepth(DEPTH.footMarks);
    this._arrows = this.add.graphics().setDepth(DEPTH.offscreenArrows);
    this._shots = this.add.graphics().setDepth(DEPTH.shots);
    this._player = this.add.sprite(0, 0, 'player').setOrigin(0.5, 0.92).setScale(CHARACTER_SCALE);
    this._player.play(animKey('player', 'idle'));
    this.cameras.main.startFollow(this._player, true, 0.15, 0.15);
    this.cameras.main.setRoundPixels(true);
    this._stick = new VirtualStick(this);
    this.drawHud();
    banner(this, t('street.start', { stage: p.stageLevel }), CSS.pinkSoft);
  }

  override update(_time: number, deltaMs: number): void {
    const sim = this._sim;
    sim.update(deltaMs / 1000, { move: this._stick.vector });
    for (const event of sim.drainEvents()) this.onEvent(event);
    this.syncPlayer();
    this.syncEnemies();
    this.syncCustomers();
    this.drawShotsAndGems();
    this.drawOffscreenMarkers();
    this.updateHud();
    this._ground.setTilePosition(this.cameras.main.scrollX, this.cameras.main.scrollY);

    if (sim.pendingEncounter && !this._encounter) this.openEncounter(sim.pendingEncounter);
    if (sim.outcome && !this._finishing) this.finish();
  }

  // ---------- 背景 ----------

  /** 六本木の夜の路面（アスファルト・横断歩道・ネオンの点）を 1 枚焼いて敷き詰める */
  private makeGroundTexture(): void {
    if (this.textures.exists('street-ground')) return;
    const g = this.make.graphics({}, false);
    g.fillStyle(0x221a3f, 1);
    g.fillRect(0, 0, TILE, TILE);
    // 歩道のブロック
    g.fillStyle(0x2c2352, 1);
    g.fillRect(0, 0, TILE, 96);
    g.fillRect(0, 0, 96, TILE);
    g.lineStyle(2, 0x3b3068, 1);
    for (let i = 0; i < TILE; i += 32) {
      g.lineBetween(i, 0, i, 96);
      g.lineBetween(0, i, 96, i);
    }
    // 車道の中央線
    g.fillStyle(0xffd166, 0.35);
    for (let x = 120; x < TILE; x += 64) g.fillRect(x, 300, 32, 6);
    for (let y = 120; y < TILE; y += 64) g.fillRect(300, y, 6, 32);
    // 横断歩道
    g.fillStyle(0xffffff, 0.14);
    for (let i = 0; i < 6; i++) g.fillRect(110 + i * 22, 100, 12, 60);
    // ネオンの滲み
    const neon = [COLOR.pink, COLOR.cyan, COLOR.lavender, COLOR.gold];
    neon.forEach((color, i) => {
      g.fillStyle(color, 0.08);
      g.fillCircle(40 + i * 7, 60 + i * 120, 46);
      g.fillStyle(color, 0.7);
      g.fillCircle(40 + i * 7, 60 + i * 120, 4);
    });
    g.generateTexture('street-ground', TILE, TILE);
    g.destroy();
  }

  private drawWorldEdge(): void {
    const half = session.data.street.world_half_size;
    const g = this.add.graphics().setDepth(DEPTH.worldEdge);
    g.lineStyle(10, COLOR.pink, 0.6);
    g.strokeRect(-half, -half, half * 2, half * 2);
  }

  // ---------- 同期 ----------

  private syncPlayer(): void {
    const body = this._sim.player;
    this._player.setPosition(body.pos.x, body.pos.y);
    this._player.setDepth(characterDepth(body.pos.y));
    let clip = 'idle';
    if (body.moving) {
      const f = body.facing;
      clip = Math.abs(f.x) >= Math.abs(f.y) ? 'run_side' : f.y > 0 ? 'run_front' : 'run_back';
      if (Math.abs(f.x) > 0.2) this._player.setFlipX(f.x < 0);
    }
    const key = animKey('player', clip);
    if (this._player.anims.currentAnim?.key !== key) this._player.play(key);
    // 無敵時間は点滅
    this._player.setAlpha(body.invincible > 0 && Math.floor(body.invincible * 20) % 2 === 0 ? 0.4 : 1);
  }

  private syncEnemies(): void {
    const alive = new Set<number>();
    for (const enemy of this._sim.enemies) {
      alive.add(enemy.uid);
      let sprite = this._enemies.get(enemy.uid);
      if (!sprite) {
        sprite = this.add.sprite(enemy.pos.x, enemy.pos.y, enemy.visualId).setOrigin(0.5, 0.92).setScale(CHARACTER_SCALE * (enemy.radius / 20));
        sprite.play({ key: animKey(enemy.visualId, 'walk'), startFrame: Phaser.Math.Between(0, 5) });
        this._enemies.set(enemy.uid, sprite);
      }
      sprite.setPosition(enemy.pos.x, enemy.pos.y).setDepth(characterDepth(enemy.pos.y));
      sprite.setFlipX(enemy.pos.x > this._sim.player.pos.x);
    }
    for (const [uid, sprite] of this._enemies) {
      if (alive.has(uid)) continue;
      this._enemies.delete(uid);
      this.tweens.killTweensOf(sprite);
      sprite.destroy();
    }
  }

  private syncCustomers(): void {
    for (const customer of this._sim.customers) {
      let sprite = this._customers.get(customer.uid);
      if (customer.state !== 'wandering') {
        if (sprite) {
          this._customers.delete(customer.uid);
          this.tweens.add({ targets: sprite, alpha: 0, y: sprite.y - 40, duration: 400, onComplete: () => sprite?.destroy() });
        }
        continue;
      }
      if (!sprite) {
        sprite = this.add.sprite(customer.pos.x, customer.pos.y, customer.visualId).setOrigin(0.5, 0.92).setScale(CHARACTER_SCALE * 1.05);
        this._customers.set(customer.uid, sprite);
      }
      const walking = customer.wanderDir.x !== 0 || customer.wanderDir.y !== 0;
      const clip = walking || !hasClip(customer.visualId, 'idle') ? 'walk' : 'idle';
      const key = animKey(customer.visualId, clip);
      if (sprite.anims.currentAnim?.key !== key) sprite.play(key);
      if (walking) sprite.setFlipX(customer.wanderDir.x < 0);
      sprite.setPosition(customer.pos.x, customer.pos.y).setDepth(characterDepth(customer.pos.y));
    }
  }

  private drawShotsAndGems(): void {
    const g = this._shots;
    g.clear();
    for (const gem of this._sim.gems) {
      const { x, y } = gem.pos;
      const r = gem.value >= 4 ? 11 : 8;
      g.fillStyle(gem.value >= 4 ? COLOR.gold : COLOR.cyan, 1);
      g.fillTriangle(x, y - r, x + r * 0.7, y, x - r * 0.7, y);
      g.fillTriangle(x, y + r, x + r * 0.7, y, x - r * 0.7, y);
    }
    for (const shot of this._sim.projectiles) {
      g.fillStyle(COLOR.pink, 0.35);
      g.fillCircle(shot.pos.x, shot.pos.y, shot.radius * 1.8);
      g.fillStyle(COLOR.pinkSoft, 1);
      g.fillCircle(shot.pos.x, shot.pos.y, shot.radius * 0.8);
    }
    // お客の足元のハートの輪（誰がお客さん候補か一目でわかるように）
    const m = this._markers;
    m.clear();
    const pulse = 1 + Math.sin(this.time.now / 200) * 0.12;
    for (const c of this._sim.customers) {
      if (c.state !== 'wandering') continue;
      m.lineStyle(4, COLOR.pink, 0.9);
      m.strokeEllipse(c.pos.x, c.pos.y, 90 * pulse, 36 * pulse);
      this.drawHeart(m, c.pos.x, c.pos.y - 130 - Math.sin(this.time.now / 250) * 6, 16);
    }
  }

  private drawHeart(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
    g.fillStyle(COLOR.pink, 1);
    g.fillCircle(x - size * 0.5, y, size * 0.6);
    g.fillCircle(x + size * 0.5, y, size * 0.6);
    g.fillTriangle(x - size * 1.08, y + size * 0.2, x + size * 1.08, y + size * 0.2, x, y + size * 1.3);
  }

  /** 画面外のお客（ピンク）とお店（金）の方向を、画面の縁の矢印で示す */
  private drawOffscreenMarkers(): void {
    const cam = this.cameras.main;
    const targets: { pos: Vec2; color: number }[] = this._sim.customers.filter((c) => c.state === 'wandering').map((c) => ({ pos: c.pos, color: COLOR.pink }));
    const goal = this._sim.goal;
    if (goal) targets.push({ pos: goal, color: COLOR.gold });
    const g = this._arrows;
    g.clear();
    const cx = cam.scrollX + WIDTH / 2;
    const cy = cam.scrollY + HEIGHT / 2;
    const margin = 40;
    for (const target of targets) {
      const dx = target.pos.x - cx;
      const dy = target.pos.y - cy;
      if (Math.abs(dx) < WIDTH / 2 - margin && Math.abs(dy) < HEIGHT / 2 - margin) continue;
      const k = Math.min((WIDTH / 2 - margin) / Math.abs(dx || 1e-6), (HEIGHT / 2 - margin - 60) / Math.abs(dy || 1e-6));
      const ax = cx + dx * k;
      const ay = cy + dy * k;
      const angle = Math.atan2(dy, dx);
      const s = 22;
      g.fillStyle(target.color, 0.95);
      g.fillTriangle(
        ax + Math.cos(angle) * s,
        ay + Math.sin(angle) * s,
        ax + Math.cos(angle + 2.5) * s,
        ay + Math.sin(angle + 2.5) * s,
        ax + Math.cos(angle - 2.5) * s,
        ay + Math.sin(angle - 2.5) * s,
      );
    }
  }

  private spawnGoal(pos: Vec2): void {
    const r = session.data.street.goal_radius;
    const glow = this.add.circle(0, 0, r + 20, COLOR.gold, 0.18);
    const ring = this.add.circle(0, 0, r, COLOR.gold, 0).setStrokeStyle(6, COLOR.gold, 1);
    const sign = this.add.graphics();
    sign.fillStyle(COLOR.pink, 1);
    sign.fillRoundedRect(-90, -170, 180, 70, 16);
    sign.lineStyle(4, COLOR.white, 0.9);
    sign.strokeRoundedRect(-90, -170, 180, 70, 16);
    const label = this.add.text(0, -135, t('street.goal_label'), textStyle(32, CSS.text)).setOrigin(0.5);
    this._goal = this.add.container(pos.x, pos.y, [glow, ring, sign, label]).setDepth(characterDepth(pos.y) - 1);
    this.tweens.add({ targets: glow, scale: 1.25, alpha: 0.05, duration: 700, yoyo: true, repeat: -1 });
  }

  // ---------- イベント ----------

  private onEvent(event: StreetEvent): void {
    switch (event.type) {
      case 'enemy_hit': {
        const sprite = this._enemies.get(event.uid);
        if (sprite) {
          sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
          this.time.delayedCall(60, () => sprite.active && sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
        }
        if (this._damageNumbers < MAX_DAMAGE_NUMBERS) {
          this._damageNumbers++;
          floatText(this, event.pos.x, event.pos.y - 70, String(event.damage), CSS.text, 22);
          this.time.delayedCall(650, () => this._damageNumbers--);
        }
        break;
      }
      case 'enemy_killed': {
        const puff = this.add.circle(event.pos.x, event.pos.y - 30, 26, COLOR.pinkSoft, 0.7).setDepth(characterDepth(event.pos.y));
        this.tweens.add({ targets: puff, scale: 2, alpha: 0, duration: 250, onComplete: () => puff.destroy() });
        break;
      }
      case 'player_hurt':
        this.cameras.main.shake(120, 0.008);
        this.cameras.main.flash(120, 255, 60, 90, false);
        break;
      case 'street_level_up':
        banner(this, t('street.level_up', { level: event.level }), CSS.mint, HEIGHT * 0.36);
        break;
      case 'customer_spawned':
        banner(this, t('street.customer_appeared'), CSS.pink);
        break;
      case 'goal_appeared':
        this.spawnGoal(event.pos);
        banner(this, t('street.goal_appeared'), CSS.gold, HEIGHT * 0.2);
        break;
      default:
        break;
    }
  }

  // ---------- HUD ----------

  private drawHud(): void {
    const g = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud);
    g.fillStyle(COLOR.nightDeep, 0.72);
    g.fillRoundedRect(12, 12, WIDTH - 24, 150, 22);
    this._timer = this.add.text(WIDTH / 2, 44, '', textStyle(48, CSS.text, { stroke: CSS.dark, strokeThickness: 6 })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.hud + 1);
    this._hp = new Gauge(this, 32, 86, 330, 28, t('stat.hp'), COLOR.hp).setScrollFactor(0).setDepth(DEPTH.hud + 1);
    this._mp = new Gauge(this, 32, 122, 330, 28, t('stat.mp'), COLOR.mp).setScrollFactor(0).setDepth(DEPTH.hud + 1);
    this._level = this.add.text(392, 84, '', textStyle(24, CSS.mint)).setScrollFactor(0).setDepth(DEPTH.hud + 1);
    this._expBar = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud + 1);
    this._companionSlots = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud + 1);
    this.add.text(500, 44, t('street.companions'), textStyle(22, CSS.pinkSoft)).setOrigin(0, 0.5).setScrollFactor(0).setDepth(DEPTH.hud + 1);
  }

  private updateHud(): void {
    const sim = this._sim;
    const left = Math.ceil(sim.timeLeft);
    this._timer.setText(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    this._timer.setColor(left <= 30 ? CSS.red : CSS.text);
    this._hp.set(sim.player.hp, sim.player.maxHp);
    this._mp.set(sim.player.mp, sim.player.maxMp);
    this._level.setText(t('street.level', { level: sim.streetLevel }));

    const next = sim.nextStreetLevelExp;
    const thresholds = session.data.street.street_level.exp_thresholds;
    const prev = sim.streetLevel >= 2 ? (thresholds[sim.streetLevel - 2] ?? 0) : 0;
    const ratio = next === null ? 1 : (sim.streetExp - prev) / (next - prev);
    const eb = this._expBar;
    eb.clear();
    eb.fillStyle(COLOR.nightDeep, 1);
    eb.fillRoundedRect(392, 126, 296, 16, 8);
    eb.fillStyle(COLOR.mint, 1);
    eb.fillRoundedRect(392, 126, Math.max(16, 296 * Phaser.Math.Clamp(ratio, 0, 1)), 16, 8);

    const slots = this._companionSlots;
    slots.clear();
    const max = session.data.street.max_companions;
    for (let i = 0; i < max; i++) {
      const x = 580 + i * 44;
      if (i < sim.companions.length) {
        slots.fillStyle(COLOR.pink, 1);
        slots.fillCircle(x, 44, 16);
      } else {
        slots.lineStyle(3, COLOR.pinkSoft, 0.6);
        slots.strokeCircle(x, 44, 15);
      }
    }
  }

  // ---------- 遭遇の 3 択 ----------

  private openEncounter(customer: CustomerInstance): void {
    this._stick.release();
    this._stick.enabled = false;
    const type = byId(session.data.customers, customer.typeId);
    const root = modal(this, 900, HEIGHT / 2 + 40);
    this._encounter = root;
    const top = HEIGHT / 2 + 40 - 450;

    const portrait = this.add.sprite(WIDTH / 2, top + 250, customer.visualId, idleFrame(customer.visualId)).setScale(1.5).setOrigin(0.5, 1);
    if (hasClip(customer.visualId, 'idle')) portrait.play(animKey(customer.visualId, 'idle'));
    root.add(portrait);
    root.add(this.add.text(WIDTH / 2, top + 290, t('street.encounter.title', { name: t(type.name_key), rank: type.rank }), textStyle(34, CSS.pinkSoft)).setOrigin(0.5));
    root.add(this.add.text(WIDTH / 2, top + 336, t('street.encounter.hint'), textStyle(22, CSS.sub)).setOrigin(0.5));

    const buttons = new Map<RecruitChoice, Button>();
    const choose = (choice: RecruitChoice) => {
      if (!this._sim.resolveEncounter(choice)) return;
      if (choice === 'companion') banner(this, t('street.encounter.companion_done'), CSS.pink);
      if (choice === 'exp') banner(this, t('street.encounter.exp_done'), CSS.mint);
      if (choice === 'heal') banner(this, t('street.encounter.heal_done'), CSS.pinkSoft);
      root.destroy();
      this._encounter = null;
      this._stick.enabled = true;
    };
    const options = this._sim.choiceOptions();
    const fills: Record<ChoiceOption['choice'], number> = { companion: COLOR.pink, exp: COLOR.mint, heal: COLOR.lavender };
    options.forEach((option, i) => {
      const button = new Button(this, WIDTH / 2, top + 430 + i * 118, {
        width: WIDTH - 120,
        height: 104,
        label: t(`street.choice.${option.choice}`),
        sub: '',
        fill: fills[option.choice],
        textColor: option.choice === 'companion' ? CSS.text : CSS.dark,
        onClick: () => choose(option.choice),
      });
      buttons.set(option.choice, button);
      root.add(button);
    });
    const refresh = () => {
      for (const option of this._sim.choiceOptions()) {
        const sub = option.block === 'full' ? t('street.choice_block.full') : t('street.choice_cost', { mp: option.mpCost, have: Math.floor(this._sim.player.mp) });
        buttons.get(option.choice)?.setEnabled(option.block === null).setLabel(t(`street.choice.${option.choice}`), sub);
      }
    };
    refresh();

    const p = session.player;
    const ad = new Button(this, WIDTH / 2 - 150, top + 800, {
      width: 290,
      height: 84,
      label: t('street.ad_refill'),
      sub: t('home.ad_left', { n: p.adRefillsLeft }),
      fill: COLOR.cyan,
      textColor: CSS.dark,
      fontSize: 24,
      onClick: () => {
        if (!spendAdRefill(p)) return;
        this._sim.refillMp();
        session.save();
        ad.setLabel(t('street.ad_refill'), t('home.ad_left', { n: p.adRefillsLeft }));
        ad.setEnabled(p.adRefillsLeft > 0);
        refresh();
      },
    });
    ad.setEnabled(p.adRefillsLeft > 0 && this._sim.player.mp < this._sim.player.maxMp);
    root.add(ad);
    root.add(new Button(this, WIDTH / 2 + 150, top + 800, {
      width: 290,
      height: 84,
      label: t('street.choice.skip'),
      fill: COLOR.panelLight,
      fontSize: 26,
      onClick: () => choose('skip'),
    }));
    pinToScreen(root);
  }

  // ---------- 終わり ----------

  private finish(): void {
    const outcome = this._sim.outcome;
    if (!outcome) return;
    this._finishing = true;
    this._stick.release();
    this._stick.enabled = false;
    session.lastStreet = outcome;
    session.lastService = null;
    const color = outcome.kind === 'goal' ? CSS.gold : outcome.kind === 'late' ? CSS.pinkSoft : CSS.red;
    banner(this, t(`street.outcome.${outcome.kind}`), color, HEIGHT * 0.42);
    this.time.delayedCall(1500, () => {
      const toService = outcome.kind !== 'down' && outcome.companions.length > 0;
      fadeTo(this, toService ? 'Service' : 'Result');
    });
  }
}
