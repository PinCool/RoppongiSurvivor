import Phaser from 'phaser';
import { nextSeed } from '../../core/career/playerState';
import { activeRival } from '../../core/career/rival';
import { spendAdRefill } from '../../core/career/work';
import { byId } from '../../core/data/gameData';
import type { Block, Building } from '../../core/street/city';
import { StreetSim, type ChoiceOption, type CustomerInstance, type RecruitChoice, type StreetEvent } from '../../core/street/streetSim';
import type { Vec2 } from '../../core/vec';
import { sfx } from '../audio/sfx';
import { DEPTH, characterDepth } from '../depth';
import buildingArt from '../generated/buildings.json';
import { t } from '../i18n';
import { stickToGround, toScreen, type IsoView } from '../iso';
import { session } from '../session';
import { animKey, hasClip, idleFrame } from '../sprites';
import { COLOR, CSS, HEIGHT, WIDTH, WORLD, drawPanel, textStyle, titleStyle, type ButtonVariant } from '../theme';
import { Button } from '../ui/Button';
import { banner, fadeTo, floatText, modal, pinToScreen } from '../ui/fx';
import { Gauge } from '../ui/Gauge';
import { VirtualStick } from '../ui/VirtualStick';

const CHARACTER_SCALE = 0.72;
/** ダメージ数字を同時に出す上限（連射で画面が数字で埋まらないように） */
const MAX_DAMAGE_NUMBERS = 24;
/** 遭遇の選択肢が出てから、押し始めを受け付けない時間（動かしていた指で誤って押さないように） */
const ENCOUNTER_ARM_MS = 350;
/** 地面を描き直す、カメラの移動量（画面 px） */
const GROUND_REDRAW_PX = 160;

/** 夜のパステルの街の床（TokyoSurvivor の夜のコンセプト fp_backstreet_night.png から実測） */
const FLOOR = {
  road: 0x5a62aa,
  sidewalk: 0xbe93f5,
  curb: 0xdcc8ff,
  plaza: 0xcfb2ff,
  line: 0xfff3a0,
  crosswalk: 0xe9e2ff,
  bush: 0x7fdcb4,
  bushDark: 0x4fb78f,
} as const;

type GroundRect = { x0: number; y0: number; x1: number; y1: number };

/**
 * 集客パートの描画。StreetSim を毎フレーム進め、その状態を斜め見下ろしに写して描くだけ。
 * 地面（x, y）→ 画面は iso.ts。敵・お客は uid ごとにスプライトを持ち、シミュレーションから消えたら破棄する。
 */
export class StreetScene extends Phaser.Scene {
  private _sim!: StreetSim;
  private _view!: IsoView;
  private _stick!: VirtualStick;
  private _ground!: Phaser.GameObjects.Graphics;
  private _groundCenter: Vec2 | null = null;
  private _player!: Phaser.GameObjects.Sprite;
  private _rival: Phaser.GameObjects.Sprite | null = null;
  private _shadows!: Phaser.GameObjects.Graphics;
  private _shots!: Phaser.GameObjects.Graphics;
  private _markers!: Phaser.GameObjects.Graphics;
  private _arrows!: Phaser.GameObjects.Graphics;
  private _goal: Phaser.GameObjects.Container | null = null;
  private readonly _buildingImages: { image: Phaser.GameObjects.Image; center: Vec2 }[] = [];
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
    this._rival = null;
    this._groundCenter = null;
    this._enemies.clear();
    this._customers.clear();
    this._buildingImages.length = 0;
    this._view = session.data.street.view;
    const rival = activeRival(p, session.data);
    this._sim = new StreetSim(session.data, {
      rival,
      stageLevel: p.stageLevel,
      hp: p.hp,
      maxHp: p.maxHp,
      mp: p.mp,
      maxMp: p.maxMp,
      seed: nextSeed(p),
    });
    session.save();

    this.cameras.main.fadeIn(300, 255, 227, 240);
    this.cameras.main.setBackgroundColor(FLOOR.road);
    this._ground = this.add.graphics().setDepth(DEPTH.ground);
    this._shadows = this.add.graphics().setDepth(DEPTH.footMarks);
    this._markers = this.add.graphics().setDepth(DEPTH.footMarks + 1);
    this._arrows = this.add.graphics().setDepth(DEPTH.offscreenArrows);
    this._shots = this.add.graphics().setDepth(DEPTH.shots);
    this.placeBuildings();
    this._player = this.add.sprite(0, 0, 'player').setOrigin(0.5, 0.92).setScale(CHARACTER_SCALE);
    this._player.play(animKey('player', 'idle'));
    this.cameras.main.startFollow(this._player, true, 0.15, 0.15);
    this.cameras.main.setRoundPixels(true);
    this._stick = new VirtualStick(this);
    this.drawHud();
    if (rival) {
      this._rival = this.add.sprite(0, 0, rival.visual_id).setOrigin(0.5, 0.92).setScale(CHARACTER_SCALE);
      banner(this, t('street.rival_appeared', { name: t(rival.name_key) }), CSS.rival);
      sfx.play('boss_arrival');
    } else {
      banner(this, t('street.start', { stage: p.stageLevel }), CSS.titleStroke);
    }
  }

  override update(_time: number, deltaMs: number): void {
    const sim = this._sim;
    sim.update(deltaMs / 1000, { move: stickToGround(this._view, this._stick.vector) });
    for (const event of sim.drainEvents()) this.onEvent(event);
    this.syncPlayer();
    this.fadeOccluders();
    this.syncRival();
    this.syncEnemies();
    this.syncCustomers();
    this.drawShadows();
    this.drawShotsAndGems();
    this.drawOffscreenMarkers();
    this.updateHud();
    this.redrawGroundIfMoved();

    if (sim.pendingEncounter && !this._encounter) this.openEncounter(sim.pendingEncounter);
    if (sim.outcome && !this._finishing) this.finish();
  }

  private iso(p: Vec2): Vec2 {
    return toScreen(this._view, p);
  }

  // ---------- 街 ----------

  /** 建物の絵を置く。床の菱形の手前の角（x1, y1）に絵の下端中央を合わせ、菱形の幅に縮める */
  private placeBuildings(): void {
    for (const b of this._sim.city.buildings) {
      const art = buildingArt[b.artSeed % buildingArt.length]!;
      const front = this.iso({ x: b.x1, y: b.y1 });
      const width = (b.x1 - b.x0 + (b.y1 - b.y0)) * this._view.iso_x;
      const image = this.add
        .image(front.x, front.y, `building:${art.key}`)
        .setOrigin(0.5, 1)
        .setScale(width / art.width)
        .setDepth(this.buildingDepth(b));
      this._buildingImages.push({ image, center: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 } });
    }
  }

  /**
   * 自機が建物の裏に回ったら、手前の建物を半透明にする（背の高い建物に自機が隠れて見失わないように）。
   * 近くの建物だけ見る。透明度はなめらかに寄せる
   */
  private fadeOccluders(): void {
    const pos = this._sim.player.pos;
    const s = this.iso(pos);
    const depth = characterDepth(s.y);
    // 自機の体（足元から上へ 90px）のどこかが絵に重なっていれば隠れている
    const probes = [s.y - 20, s.y - 55, s.y - 90];
    for (const { image, center } of this._buildingImages) {
      const near = Math.abs(center.x - pos.x) < 700 && Math.abs(center.y - pos.y) < 700;
      let target = 1;
      if (near && image.depth > depth) {
        const bounds = image.getBounds();
        if (probes.some((py) => bounds.contains(s.x, py))) target = 0.4;
      }
      if (image.alpha !== target) image.setAlpha(Phaser.Math.Linear(image.alpha, target, 0.25));
      if (Math.abs(image.alpha - target) < 0.02) image.setAlpha(target);
    }
  }

  /** 建物の重なり順は床の中心の奥行き（手前の面の前にいるキャラは前、奥の面の後ろにいるキャラは後ろ） */
  private buildingDepth(b: Building): number {
    return characterDepth(this.iso({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }).y);
  }

  /** 地面はカメラの周りだけ描く（街全体の道の線や横断歩道を毎フレーム全部描くと重い） */
  private redrawGroundIfMoved(): void {
    const cam = this.cameras.main;
    const center = { x: cam.scrollX + WIDTH / 2, y: cam.scrollY + HEIGHT / 2 };
    if (this._groundCenter && Math.hypot(center.x - this._groundCenter.x, center.y - this._groundCenter.y) < GROUND_REDRAW_PX) return;
    this._groundCenter = center;
    const g = this._ground;
    g.clear();
    const city = this._sim.city;
    const reach = { w: WIDTH / 2 + 500, h: HEIGHT / 2 + 500 };
    const near = (p: Vec2) => {
      const s = this.iso(p);
      return Math.abs(s.x - center.x) < reach.w && Math.abs(s.y - center.y) < reach.h;
    };
    const half = city.half;
    this.fillQuad(g, { x0: -half, y0: -half, x1: half, y1: half }, FLOOR.road);
    for (const block of city.blocks) {
      if (near({ x: (block.x0 + block.x1) / 2, y: (block.y0 + block.y1) / 2 })) this.drawBlock(g, block);
    }
    this.drawRoadMarkings(g, near);
    g.lineStyle(10, WORLD.edge, 0.9);
    this.strokeQuad(g, { x0: -half, y0: -half, x1: half, y1: half });
  }

  private drawBlock(g: Phaser.GameObjects.Graphics, block: Block): void {
    // 縁石（少し大きい面）→ 歩道
    this.fillQuad(g, { x0: block.x0 - 8, y0: block.y0 - 8, x1: block.x1 + 8, y1: block.y1 + 8 }, FLOOR.curb);
    this.fillQuad(g, block, FLOOR.sidewalk);
    if (!block.plaza) return;
    // 広場: 一段明るい床と、丸い植え込み
    const inset = 40;
    this.fillQuad(g, { x0: block.x0 + inset, y0: block.y0 + inset, x1: block.x1 - inset, y1: block.y1 - inset }, FLOOR.plaza);
    const cx = (block.x0 + block.x1) / 2;
    const cy = (block.y0 + block.y1) / 2;
    const r = (block.x1 - block.x0) / 2 - 90;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const s = this.iso({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      g.fillStyle(FLOOR.bushDark, 1);
      g.fillEllipse(s.x, s.y + 6, 64, 38);
      g.fillStyle(FLOOR.bush, 1);
      g.fillEllipse(s.x, s.y, 60, 36);
      g.fillStyle(0xffffff, 0.35);
      g.fillEllipse(s.x - 10, s.y - 7, 22, 10);
    }
  }

  /** 道の中央の破線（レモン色）と、交差点の横断歩道 */
  private drawRoadMarkings(g: Phaser.GameObjects.Graphics, near: (p: Vec2) => boolean): void {
    const city = this._sim.city;
    const n = Math.ceil(city.half / city.pitch);
    const dash = 50;
    const gap = 50;
    const inCrossing = (v: number) => Math.abs(v - Math.round(v / city.pitch) * city.pitch) < city.roadHalf + 20;
    for (let k = -n; k <= n; k++) {
      const c = k * city.pitch;
      if (Math.abs(c) >= city.half) continue;
      for (let s = -city.half; s < city.half; s += dash + gap) {
        if (inCrossing(s) || inCrossing(s + dash)) continue;
        if (near({ x: c, y: s })) this.fillQuad(g, { x0: c - 5, y0: s, x1: c + 5, y1: s + dash }, FLOOR.line);
        if (near({ x: s, y: c })) this.fillQuad(g, { x0: s, y0: c - 5, x1: s + dash, y1: c + 5 }, FLOOR.line);
      }
      for (let m = -n; m <= n; m++) {
        const cross = { x: c, y: m * city.pitch };
        if (Math.abs(cross.y) < city.half && near(cross)) this.drawCrosswalks(g, cross);
      }
    }
  }

  private drawCrosswalks(g: Phaser.GameObjects.Graphics, c: Vec2): void {
    const rh = this._sim.city.roadHalf;
    const stripe = 22;
    const depth = 50;
    for (let s = -rh + 16; s < rh - 16; s += stripe * 2) {
      // 交差点の 4 辺の手前に、道を横切る白い縞
      this.fillQuad(g, { x0: c.x + s, y0: c.y - rh - depth, x1: c.x + s + stripe, y1: c.y - rh }, FLOOR.crosswalk, 0.75);
      this.fillQuad(g, { x0: c.x + s, y0: c.y + rh, x1: c.x + s + stripe, y1: c.y + rh + depth }, FLOOR.crosswalk, 0.75);
      this.fillQuad(g, { x0: c.x - rh - depth, y0: c.y + s, x1: c.x - rh, y1: c.y + s + stripe }, FLOOR.crosswalk, 0.75);
      this.fillQuad(g, { x0: c.x + rh, y0: c.y + s, x1: c.x + rh + depth, y1: c.y + s + stripe }, FLOOR.crosswalk, 0.75);
    }
  }

  /** 地面の矩形を画面の菱形として塗る */
  private fillQuad(g: Phaser.GameObjects.Graphics, r: GroundRect, color: number, alpha = 1): void {
    g.fillStyle(color, alpha);
    g.fillPoints(this.quad(r), true);
  }

  private strokeQuad(g: Phaser.GameObjects.Graphics, r: GroundRect): void {
    g.strokePoints(this.quad(r), true);
  }

  private quad(r: GroundRect): Phaser.Math.Vector2[] {
    return [
      { x: r.x0, y: r.y0 },
      { x: r.x1, y: r.y0 },
      { x: r.x1, y: r.y1 },
      { x: r.x0, y: r.y1 },
    ].map((p) => {
      const s = this.iso(p);
      return new Phaser.Math.Vector2(s.x, s.y);
    });
  }

  // ---------- 同期 ----------

  /** 地面の向き → 画面の向きで、走りのクリップと左右反転を選ぶ */
  private runClip(f: Vec2): { clip: string; flip: boolean | null } {
    const s = this.iso(f);
    const clip = Math.abs(s.x) >= Math.abs(s.y) ? 'run_side' : s.y > 0 ? 'run_front' : 'run_back';
    return { clip, flip: Math.abs(s.x) > 0.15 ? s.x < 0 : null };
  }

  private syncPlayer(): void {
    const body = this._sim.player;
    const s = this.iso(body.pos);
    this._player.setPosition(s.x, s.y).setDepth(characterDepth(s.y));
    let clip = 'idle';
    if (body.moving) {
      const run = this.runClip(body.facing);
      clip = run.clip;
      if (run.flip !== null) this._player.setFlipX(run.flip);
    }
    const key = animKey('player', clip);
    if (this._player.anims.currentAnim?.key !== key) this._player.play(key);
    // 無敵時間は点滅
    this._player.setAlpha(body.invincible > 0 && Math.floor(body.invincible * 20) % 2 === 0 ? 0.4 : 1);
  }

  /** ライバルは自機と同じ走りのクリップを持つ */
  private syncRival(): void {
    const body = this._sim.rival;
    const sprite = this._rival;
    if (!body || !sprite) return;
    const s = this.iso(body.pos);
    sprite.setPosition(s.x, s.y).setDepth(characterDepth(s.y));
    let clip = 'idle';
    if (body.moving) {
      const run = this.runClip(body.facing);
      clip = run.clip;
      if (run.flip !== null) sprite.setFlipX(run.flip);
    }
    const key = animKey(body.visualId, clip);
    if (sprite.anims.currentAnim?.key !== key) sprite.play(key);
  }

  private syncEnemies(): void {
    const alive = new Set<number>();
    const playerX = this.iso(this._sim.player.pos).x;
    for (const enemy of this._sim.enemies) {
      alive.add(enemy.uid);
      const s = this.iso(enemy.pos);
      let sprite = this._enemies.get(enemy.uid);
      if (!sprite) {
        sprite = this.add.sprite(s.x, s.y, enemy.visualId).setOrigin(0.5, 0.92).setScale(CHARACTER_SCALE * (enemy.radius / 20));
        sprite.play({ key: animKey(enemy.visualId, 'walk'), startFrame: Phaser.Math.Between(0, 5) });
        this._enemies.set(enemy.uid, sprite);
      }
      sprite.setPosition(s.x, s.y).setDepth(characterDepth(s.y));
      sprite.setFlipX(s.x > playerX);
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
      const s = this.iso(customer.pos);
      if (!sprite) {
        sprite = this.add.sprite(s.x, s.y, customer.visualId).setOrigin(0.5, 0.92).setScale(CHARACTER_SCALE * 1.05);
        this._customers.set(customer.uid, sprite);
      }
      const walking = customer.wanderDir.x !== 0 || customer.wanderDir.y !== 0;
      const clip = walking || !hasClip(customer.visualId, 'idle') ? 'walk' : 'idle';
      const key = animKey(customer.visualId, clip);
      if (sprite.anims.currentAnim?.key !== key) sprite.play(key);
      if (walking) sprite.setFlipX(this.iso(customer.wanderDir).x < 0);
      sprite.setPosition(s.x, s.y).setDepth(characterDepth(s.y));
    }
  }

  /** 足元の丸い影（床に落ちる影は 1 段のベタ。ぼかさない） */
  private drawShadows(): void {
    const g = this._shadows;
    g.clear();
    g.fillStyle(0x2e2a5c, 0.28);
    const put = (p: Vec2, r: number) => {
      const s = this.iso(p);
      g.fillEllipse(s.x, s.y, r * 2.4, r * 1.2);
    };
    put(this._sim.player.pos, 22);
    if (this._sim.rival) put(this._sim.rival.pos, 22);
    for (const e of this._sim.enemies) put(e.pos, e.radius);
    for (const c of this._sim.customers) if (c.state === 'wandering') put(c.pos, 22);
  }

  private drawShotsAndGems(): void {
    const g = this._shots;
    g.clear();
    for (const gem of this._sim.gems) {
      const { x, y } = this.iso(gem.pos);
      const r = gem.value >= 4 ? 11 : 8;
      g.fillStyle(gem.value >= 4 ? WORLD.gemBig : WORLD.gem, 1);
      g.fillTriangle(x, y - r, x + r * 0.7, y, x - r * 0.7, y);
      g.fillTriangle(x, y + r, x + r * 0.7, y, x - r * 0.7, y);
    }
    for (const shot of this._sim.projectiles) {
      // 弾は胸の高さに浮かせる
      const s = this.iso(shot.pos);
      g.fillStyle(WORLD.shot, 0.55);
      g.fillCircle(s.x, s.y - 50, shot.radius * 1.6);
      g.fillStyle(WORLD.shotCore, 1);
      g.fillCircle(s.x, s.y - 50, shot.radius * 0.8);
    }
    // お客の足元のハートの輪（誰がお客さん候補か一目でわかるように）
    const m = this._markers;
    m.clear();
    const pulse = 1 + Math.sin(this.time.now / 200) * 0.12;
    for (const c of this._sim.customers) {
      if (c.state !== 'wandering') continue;
      const s = this.iso(c.pos);
      m.lineStyle(5, WORLD.customer, 0.95);
      m.strokeEllipse(s.x, s.y, 96 * pulse, 50 * pulse);
      this.drawHeart(m, s.x, s.y - 130 - Math.sin(this.time.now / 250) * 6, 16);
    }
  }

  private drawHeart(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x - size * 0.5, y, size * 0.6 + 3);
    g.fillCircle(x + size * 0.5, y, size * 0.6 + 3);
    g.fillTriangle(x - size * 1.08 - 4, y + size * 0.2, x + size * 1.08 + 4, y + size * 0.2, x, y + size * 1.3 + 4);
    g.fillStyle(WORLD.customer, 1);
    g.fillCircle(x - size * 0.5, y, size * 0.6);
    g.fillCircle(x + size * 0.5, y, size * 0.6);
    g.fillTriangle(x - size * 1.08, y + size * 0.2, x + size * 1.08, y + size * 0.2, x, y + size * 1.3);
  }

  /** 画面外のお客（ピンク）とお店（金）とライバル（紫）の方向を、画面の縁の矢印で示す */
  private drawOffscreenMarkers(): void {
    const cam = this.cameras.main;
    const targets: { pos: Vec2; color: number }[] = this._sim.customers.filter((c) => c.state === 'wandering').map((c) => ({ pos: c.pos, color: WORLD.customer }));
    const goal = this._sim.goal;
    if (goal) targets.push({ pos: goal, color: WORLD.goal });
    if (this._sim.rival) targets.push({ pos: this._sim.rival.pos, color: WORLD.rival });
    const g = this._arrows;
    g.clear();
    const cx = cam.scrollX + WIDTH / 2;
    const cy = cam.scrollY + HEIGHT / 2;
    const margin = 44;
    for (const target of targets) {
      const s = this.iso(target.pos);
      const dx = s.x - cx;
      const dy = s.y - cy;
      if (Math.abs(dx) < WIDTH / 2 - margin && Math.abs(dy) < HEIGHT / 2 - margin) continue;
      const k = Math.min((WIDTH / 2 - margin) / Math.abs(dx || 1e-6), (HEIGHT / 2 - margin - 80) / Math.abs(dy || 1e-6));
      const ax = cx + dx * k;
      const ay = cy + dy * k;
      const angle = Math.atan2(dy, dx);
      const tri = (size: number, color: number) => {
        g.fillStyle(color, 1);
        g.fillTriangle(
          ax + Math.cos(angle) * size,
          ay + Math.sin(angle) * size,
          ax + Math.cos(angle + 2.4) * size,
          ay + Math.sin(angle + 2.4) * size,
          ax + Math.cos(angle - 2.4) * size,
          ay + Math.sin(angle - 2.4) * size,
        );
      };
      tri(30, 0xffffff);
      tri(22, target.color);
    }
  }

  private spawnGoal(pos: Vec2): void {
    const r = session.data.street.goal_radius;
    const s = this.iso(pos);
    const ring = this.add.ellipse(0, 0, r * 2, r * 2 * (this._view.iso_y / this._view.iso_x), WORLD.goal, 0.25).setStrokeStyle(6, WORLD.goal, 1);
    const sign = this.add.graphics();
    drawPanel(sign, -100, -190, 200, 84, 30);
    const label = this.add.text(0, -150, t('street.goal_label'), titleStyle(32)).setOrigin(0.5);
    this._goal = this.add.container(s.x, s.y, [ring, sign, label]).setDepth(characterDepth(s.y) - 1);
    this.tweens.add({ targets: ring, scale: 1.18, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.tweens.add({ targets: [sign, label], y: '-=10', duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
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
          const s = this.iso(event.pos);
          floatText(this, s.x, s.y - 90, String(event.damage), CSS.onWorld, 22);
          this.time.delayedCall(650, () => this._damageNumbers--);
        }
        sfx.play('hit_penlight');
        break;
      }
      case 'enemy_killed': {
        const s = this.iso(event.pos);
        const puff = this.add.circle(s.x, s.y - 30, 26, 0xffffff, 0.8).setDepth(characterDepth(s.y));
        this.tweens.add({ targets: puff, scale: 2, alpha: 0, duration: 250, onComplete: () => puff.destroy() });
        break;
      }
      case 'gem_collected':
        sfx.play('pickup_exp');
        break;
      case 'player_hurt':
        sfx.play('player_hurt');
        this.cameras.main.shake(120, 0.008);
        this.cameras.main.flash(120, 255, 120, 150, false);
        break;
      case 'street_level_up':
        sfx.play('level_up');
        banner(this, t('street.level_up', { level: event.level }), CSS.good, HEIGHT * 0.36);
        break;
      case 'customer_spawned':
        sfx.play('pickup_item');
        banner(this, t('street.customer_appeared'), CSS.customer);
        break;
      case 'goal_appeared':
        sfx.play('goal_open');
        this.spawnGoal(event.pos);
        banner(this, t('street.goal_appeared'), CSS.accent, HEIGHT * 0.2);
        break;
      case 'encounter':
        sfx.play('talk_open');
        break;
      case 'customer_stolen': {
        sfx.play('recruit_fail');
        const name = this._sim.rival ? t(byId(session.data.rivals, this._sim.rival.id).name_key) : '';
        banner(this, t('street.customer_stolen', { name }), CSS.rival);
        const s = this.iso(event.pos);
        floatText(this, s.x, s.y - 140, t('street.stolen_mark'), CSS.rival, 30);
        break;
      }
      default:
        break;
    }
  }

  // ---------- HUD ----------

  private drawHud(): void {
    const g = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud);
    drawPanel(g, 8, 8, WIDTH - 16, 160, 32);
    this._timer = this.add.text(WIDTH / 2, 46, '', titleStyle(46)).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.hud + 1);
    this._hp = new Gauge(this, 32, 88, 330, 28, t('stat.hp'), COLOR.hp).setScrollFactor(0).setDepth(DEPTH.hud + 1);
    this._mp = new Gauge(this, 32, 124, 330, 28, t('stat.mp'), COLOR.mp).setScrollFactor(0).setDepth(DEPTH.hud + 1);
    this._level = this.add.text(392, 86, '', textStyle(24, CSS.good)).setScrollFactor(0).setDepth(DEPTH.hud + 1);
    this._expBar = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud + 1);
    this._companionSlots = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud + 1);
    this.add.text(500, 46, t('street.companions'), textStyle(22, CSS.customer)).setOrigin(0, 0.5).setScrollFactor(0).setDepth(DEPTH.hud + 1);
  }

  private updateHud(): void {
    const sim = this._sim;
    const left = Math.ceil(sim.timeLeft);
    this._timer.setText(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    this._timer.setStroke(left <= 30 ? CSS.bad : CSS.titleStroke, 10);
    this._hp.set(sim.player.hp, sim.player.maxHp);
    this._mp.set(sim.player.mp, sim.player.maxMp);
    this._level.setText(t('street.level', { level: sim.streetLevel }));

    const next = sim.nextStreetLevelExp;
    const thresholds = session.data.street.street_level.exp_thresholds;
    const prev = sim.streetLevel >= 2 ? (thresholds[sim.streetLevel - 2] ?? 0) : 0;
    const ratio = next === null ? 1 : (sim.streetExp - prev) / (next - prev);
    const eb = this._expBar;
    eb.clear();
    eb.fillStyle(COLOR.gaugeTrack, 1);
    eb.fillRoundedRect(392, 128, 296, 18, 9);
    eb.fillStyle(COLOR.exp, 1);
    eb.fillRoundedRect(392, 128, Math.max(18, 296 * Phaser.Math.Clamp(ratio, 0, 1)), 18, 9);

    const slots = this._companionSlots;
    slots.clear();
    const max = session.data.street.max_companions;
    for (let i = 0; i < max; i++) {
      const x = 590 + i * 42;
      if (i < sim.companions.length) {
        this.drawHeart(slots, x, 38, 13);
      } else {
        slots.lineStyle(4, COLOR.frame, 1);
        slots.strokeCircle(x, 46, 15);
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
    root.add(this.add.text(WIDTH / 2, top + 290, t('street.encounter.title', { name: t(type.name_key), rank: type.rank }), titleStyle(32)).setOrigin(0.5));
    root.add(this.add.text(WIDTH / 2, top + 338, t('street.encounter.hint'), textStyle(22, CSS.sub)).setOrigin(0.5));

    const buttons = new Map<RecruitChoice, Button>();
    const choose = (choice: RecruitChoice) => {
      if (!this._sim.resolveEncounter(choice)) return;
      sfx.play(choice === 'companion' ? 'recruit_join' : choice === 'skip' ? 'ui_cancel' : 'pickup_item');
      if (choice === 'companion') banner(this, t('street.encounter.companion_done'), CSS.customer);
      if (choice === 'exp') banner(this, t('street.encounter.exp_done'), CSS.good);
      if (choice === 'heal') banner(this, t('street.encounter.heal_done'), CSS.titleStroke);
      root.destroy();
      this._encounter = null;
      this._stick.enabled = true;
    };
    const variants: Record<ChoiceOption['choice'], ButtonVariant> = { companion: 'primary', exp: 'mint', heal: 'secondary' };
    this._sim.choiceOptions().forEach((option, i) => {
      const button = new Button(this, WIDTH / 2, top + 430 + i * 118, {
        width: WIDTH - 120,
        height: 100,
        label: t(`street.choice.${option.choice}`),
        sub: '',
        variant: variants[option.choice],
        sfx: null,
        armMs: ENCOUNTER_ARM_MS,
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
      variant: 'yellow',
      fontSize: 24,
      sfx: 'pickup_item',
      armMs: ENCOUNTER_ARM_MS,
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
      variant: 'quiet',
      fontSize: 26,
      sfx: null,
      armMs: ENCOUNTER_ARM_MS,
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
    sfx.play(outcome.kind === 'goal' ? 'run_clear' : outcome.kind === 'late' ? 'run_late' : 'run_defeat');
    const stroke = outcome.kind === 'goal' ? CSS.titleStroke : outcome.kind === 'late' ? CSS.accent : CSS.rival;
    banner(this, t(`street.outcome.${outcome.kind}`), stroke, HEIGHT * 0.42);
    this.time.delayedCall(1500, () => {
      const toService = outcome.kind !== 'down' && outcome.companions.length > 0;
      fadeTo(this, toService ? 'Service' : 'Result');
    });
  }
}
