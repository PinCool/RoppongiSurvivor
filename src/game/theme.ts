import type Phaser from 'phaser';

/** 画面の論理解像度（縦画面）。Scale.FIT で端末に合わせる */
export const WIDTH = 720;
export const HEIGHT = 1280;

export const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Noto Sans JP", sans-serif';

/** フラットなパステル × 夜のネオン。数値で持つ色（Graphics 用）と文字列の色（Text 用）を並べる */
export const COLOR = {
  night: 0x1b1433,
  nightDeep: 0x120d24,
  panel: 0x2a2150,
  panelLight: 0x3a2f6b,
  pink: 0xff5fa2,
  pinkSoft: 0xffb3d1,
  cyan: 0x5ee3ff,
  gold: 0xffd166,
  mint: 0x7cf0c0,
  lavender: 0xb9a7ff,
  red: 0xff5a6e,
  white: 0xffffff,
  gray: 0x6f6790,
  hp: 0xff6f91,
  mp: 0x7a8cff,
  drunk: 0xffb45e,
} as const;

export const CSS = {
  text: '#ffffff',
  sub: '#c9c0ef',
  dim: '#8c83b3',
  pink: '#ff5fa2',
  pinkSoft: '#ffb3d1',
  gold: '#ffd166',
  cyan: '#5ee3ff',
  mint: '#7cf0c0',
  red: '#ff7a8a',
  lavender: '#c9b8ff',
  dark: '#1b1433',
} as const;

export function textStyle(size: number, color: string = CSS.text, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', ...extra };
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
