import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sheets from '../src/game/generated/sprite_sheets.json';
import { freshData } from './helpers';

const ROOT = join(__dirname, '..');
/** TokyoSurvivor で使われなくなった古い絵。二度と入れない（2026-09-25 ユーザー指示「昔のアセットが紛れ込んでいるから完全削除」） */
const RETIRED = ['hood', 'regent'];

describe('キャラの絵', () => {
  it('データが指す絵はすべてシートがある', () => {
    const data = freshData();
    const ids = [
      ...data.enemies.map((e) => e.visual_id),
      ...data.customers.map((c) => c.visual_id),
      ...data.rivals.map((r) => r.visual_id),
      'player',
    ];
    for (const id of ids) {
      expect(Object.keys(sheets), id).toContain(id);
      expect(existsSync(join(ROOT, 'public/assets/sprites', `${id}.png`)), id).toBe(true);
    }
  });

  it('引退した古い絵はシート表にもファイルにもデータにも無い', () => {
    const files = readdirSync(join(ROOT, 'public/assets/sprites')).map((f) => f.replace(/\.png$/, ''));
    const data = freshData();
    const used = [...data.enemies.map((e) => e.visual_id), ...data.customers.map((c) => c.visual_id), ...data.rivals.map((r) => r.visual_id)];
    for (const id of RETIRED) {
      expect(Object.keys(sheets)).not.toContain(id);
      expect(files).not.toContain(id);
      expect(used).not.toContain(id);
    }
  });

  it('シート表とファイルが食い違っていない（取り込みの消し忘れ・足し忘れ）', () => {
    const files = readdirSync(join(ROOT, 'public/assets/sprites')).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, ''));
    expect(files.sort()).toEqual(Object.keys(sheets).sort());
  });

  it('同じ絵を 2 つの役に使わない（色違いで数を増やさない。2026-09-25 ユーザー指示「色味がダサすぎる AI っぽい」）', () => {
    const data = freshData();
    const used = [...data.enemies.map((e) => e.visual_id), ...data.customers.map((c) => c.visual_id), ...data.rivals.map((r) => r.visual_id), 'player'];
    const dupes = used.filter((id, i) => used.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it('ライバルは自機と同じ走りのクリップを持つ（集客で走り回るため）', () => {
    const table = sheets as Record<string, { clips: Record<string, unknown> }>;
    for (const r of freshData().rivals) {
      for (const clip of ['idle', 'run_side', 'run_front', 'run_back']) expect(table[r.visual_id]!.clips, `${r.id}:${clip}`).toHaveProperty(clip);
    }
  });
});
