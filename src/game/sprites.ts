import type Phaser from 'phaser';
import sheets from './generated/sprite_sheets.json';

/**
 * キャラの絵（tools/import_tokyo_art.py が焼いたシート）の読み込みとアニメ登録。
 * アニメのキーは "<visual_id>:<clip>"。
 */
type SheetMeta = { frame_width: number; frame_height: number; clips: Record<string, { start: number; count: number }> };
const SHEETS: Record<string, SheetMeta> = sheets;

export const FPS = { idle: 6, walk: 10, run: 12 } as const;

export function preloadSprites(scene: Phaser.Scene): void {
  for (const [id, meta] of Object.entries(SHEETS)) {
    scene.load.spritesheet(id, `assets/sprites/${id}.png`, { frameWidth: meta.frame_width, frameHeight: meta.frame_height });
  }
}

export function registerAnimations(scene: Phaser.Scene): void {
  for (const [id, meta] of Object.entries(SHEETS)) {
    for (const [clip, range] of Object.entries(meta.clips)) {
      const key = animKey(id, clip);
      if (scene.anims.exists(key)) continue;
      const rate = clip.startsWith('run') ? FPS.run : clip.startsWith('walk') ? FPS.walk : FPS.idle;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(id, { start: range.start, end: range.start + range.count - 1 }),
        frameRate: rate,
        repeat: -1,
      });
    }
  }
}

export function animKey(visualId: string, clip: string): string {
  return `${visualId}:${clip}`;
}

export function hasClip(visualId: string, clip: string): boolean {
  return SHEETS[visualId]?.clips[clip] !== undefined;
}

/** 立ち絵の先頭コマ（アイコン用） */
export function idleFrame(visualId: string): number {
  const meta = SHEETS[visualId];
  return (meta?.clips.idle ?? meta?.clips.walk)?.start ?? 0;
}
