import type Phaser from 'phaser';

/** 画面の論理解像度（縦画面）。Scale.FIT で端末に合わせる */
export const WIDTH = 720;
export const HEIGHT = 1280;

/**
 * 書体。丸ゴシックの M PLUS Rounded 1c（index.html で読み込み、main.ts が読み終わるのを待ってから起動する）。
 * 端末に無くても同じ見た目になるように、端末の書体には頼らない。
 */
export const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", sans-serif';

/**
 * UI の色（可愛いソシャゲ風。2026-09-25 ユーザー指示「可愛いソシャゲのような色」）。
 * パステルのピンク・ラベンダー・ミント・クリーム。白い丸角パネルに太めのパステルの縁、ぷっくりしたボタン。
 * 色は「何のための色か」で引く。ボタンの色は Button の variant で選ぶ（呼び側で色を渡さない）。
 */
export const COLOR = {
  /** 画面の地（上下のグラデーション） */
  bgTop: 0xffe3f0,
  bgBottom: 0xe6dcff,
  /** 地に散らす水玉 */
  bgDot: 0xffffff,
  /** パネル・カード */
  surface: 0xffffff,
  /** パネルの中の一段沈んだ面（リストの行など） */
  surfaceAlt: 0xfff4f9,
  /** パネルの縁 */
  frame: 0xffb8d6,
  /** パネルの見出しの帯 */
  ribbon: 0xff7eb3,
  /** 暗い幕（モーダルの後ろ） */
  scrim: 0x3a1f47,
  gaugeTrack: 0xf3e6f0,
  hp: 0xff6f91,
  mp: 0x6fa8ff,
  drunk: 0xffb347,
  exp: 0x5fd6a4,
} as const;

/** ぷっくりボタンの色。face = 面、shade = 下の段と字の縁取り */
export const BUTTON = {
  primary: { face: 0xff6fa8, shade: 0xe0508b, text: '#ffffff', stroke: '#d14781' },
  secondary: { face: 0x8ec5ff, shade: 0x5f9fe6, text: '#ffffff', stroke: '#4f8fd6' },
  mint: { face: 0x6ed8b0, shade: 0x3fb98c, text: '#ffffff', stroke: '#35a57c' },
  yellow: { face: 0xffd45c, shade: 0xe8b12e, text: '#ffffff', stroke: '#d49b1c' },
  quiet: { face: 0xffffff, shade: 0xe9d6e6, text: '#8a5a86', stroke: '#ffffff' },
  disabled: { face: 0xe6dfe6, shade: 0xcfc4cf, text: '#ffffff', stroke: '#bdb1bd' },
} as const;
export type ButtonVariant = Exclude<keyof typeof BUTTON, 'disabled'>;

export const CSS = {
  /** 本文（こげ茶がかった紫。真っ黒は使わない） */
  text: '#5a3a5e',
  sub: '#9a7a98',
  dim: '#c4aec2',
  /** 見出しの白い字と、その縁取り */
  title: '#ffffff',
  titleStroke: '#ff6fa8',
  /** お金・強調 */
  money: '#ff5c93',
  good: '#2fb383',
  bad: '#ff5b6e',
  accent: '#ff9b2f',
  /** 集客の上に出す字（ダメージの数字など）と、その縁取り */
  onWorld: '#ffffff',
  onWorldStroke: '#5a3a5e',
  customer: '#ff4f8b',
  rival: '#9b6bff',
} as const;

/** ゲームの中（集客の街・接客のお店）の印の色。UI とは分ける */
export const WORLD = {
  customer: 0xff4f8b,
  goal: 0xffc233,
  rival: 0x9b6bff,
  shot: 0xff8fb8,
  shotCore: 0xffffff,
  gem: 0x5ee3ff,
  gemBig: 0xffc233,
  edge: 0xff8fb8,
} as const;

export function textStyle(size: number, color: string = CSS.text, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', ...extra };
}

/** 見出しの字（白＋ピンクの縁取り） */
export function titleStyle(size: number, stroke: string = CSS.titleStroke, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle {
  return textStyle(size, CSS.title, { stroke, strokeThickness: Math.max(6, Math.round(size / 5)), ...extra });
}

/** 行頭に来てはいけない文字（禁則）。前の行にぶら下げる */
const NO_LINE_START = new Set([...'、。，．！？!?）」』】〕ー～…・ぁぃぅぇぉっゃゅょァィゥェォッャュョ']); // i18n-ignore: 文言ではなく禁則の文字表
let measureCtx: CanvasRenderingContext2D | null = null;

/**
 * 日本語を 1 文字単位で折り返す。Phaser の wordWrap は空白で切るので、空白の無い日本語が 1 行のままはみ出す。
 * 改行（\n）はそのまま守る。
 */
export function wrapJapanese(text: string, width: number, fontSize: number): string[] {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  const ctx = measureCtx;
  if (!ctx) return text.split('\n');
  ctx.font = `bold ${fontSize}px ${FONT}`;
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const ch of paragraph) {
      if (line !== '' && ctx.measureText(line + ch).width > width && !NO_LINE_START.has(ch)) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** 折り返し幅つきの文字スタイル（日本語向け） */
export function wrappedStyle(size: number, color: string, width: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle {
  return textStyle(size, color, {
    ...extra,
    wordWrap: { callback: (text: string) => wrapJapanese(text, width, size) },
  });
}

/** 白い丸角パネル（太めのパステルの縁） */
export function drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, radius = 32, fill: number = COLOR.surface): void {
  g.fillStyle(COLOR.frame, 1);
  g.fillRoundedRect(x, y, w, h, radius);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(x + 6, y + 6, w - 12, h - 12, Math.max(4, radius - 6));
}

/** パネルの上辺に乗る見出しの帯（リボン）。文字は呼び側で titleStyle で置く */
export function drawRibbon(g: Phaser.GameObjects.Graphics, cx: number, cy: number, w: number, h = 64): void {
  g.fillStyle(0xe0508b, 1);
  g.fillRoundedRect(cx - w / 2, cy - h / 2 + 6, w, h, h / 2);
  g.fillStyle(COLOR.ribbon, 1);
  g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
  g.fillStyle(0xffffff, 0.3);
  g.fillRoundedRect(cx - w / 2 + 14, cy - h / 2 + 6, w - 28, h * 0.32, h * 0.16);
}

/** 画面の地（ピンク → ラベンダーのグラデーションに白い水玉） */
export function drawBackdrop(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillGradientStyle(COLOR.bgTop, COLOR.bgTop, COLOR.bgBottom, COLOR.bgBottom, 1);
  g.fillRect(0, 0, WIDTH, HEIGHT);
  g.fillStyle(COLOR.bgDot, 0.45);
  for (let y = 20; y < HEIGHT; y += 64) {
    for (let x = (y / 64) % 2 === 0 ? 20 : 52; x < WIDTH; x += 64) g.fillCircle(x, y, 5);
  }
  return g;
}
