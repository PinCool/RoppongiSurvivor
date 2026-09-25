import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import buildingArt from '../src/game/generated/buildings.json';
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

/** TokyoSurvivor の旧 buildingart 世代（種類 19〜57）の建物。使わない（2026-09-25「マップが昔のアセット使っているので削除」） */
const OLD_BUILDINGS = [
  'land_host_club_tower', 'land_mob_apartment_a', 'land_mob_apartment_b', 'land_mob_office_a', 'land_mob_tower_a', 'land_mob_tower_b',
  'land_karaoke_tower', 'land_izakaya_tower', 'land_pink_apartment', 'land_tile_apartment', 'land_cafe_almond', 'land_live_house',
  'land_rock_cafe', 'land_bar_building', 'land_capsule_hotel', 'land_game_center', 'land_disco_club', 'land_roi_building',
  'land_ramen_corner', 'land_office_small', 'land_pachinko_hall', 'land_discount_store', 'land_conveni_corner', 'land_glass_tower',
  'land_hills_tower', 'land_tower_red', 'land_drugstore_corner', 'land_police_box', 'land_bank_corner', 'land_yakitori_stand',
];

describe('建物の絵', () => {
  it('データの建物はすべて絵がある', () => {
    const keys = buildingArt.map((a) => a.key);
    for (const b of freshData().buildings) expect(keys, b.id).toContain(b.visual_id);
  });

  it('旧世代の建物は絵にもファイルにもデータにも無い', () => {
    const files = readdirSync(join(ROOT, 'public/assets/buildings')).map((f) => f.replace(/\.webp$/, ''));
    const used = freshData().buildings.map((b) => b.visual_id);
    for (const name of OLD_BUILDINGS) {
      expect(files).not.toContain(name);
      expect(buildingArt.map((a) => a.key)).not.toContain(name);
      expect(used).not.toContain(name);
    }
  });
});
