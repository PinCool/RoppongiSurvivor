import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VIBES, STAT_IDS } from '../src/core/data/types';
import ja from '../src/i18n/ja.json';
import { freshData } from './helpers';

const table: Record<string, string> = ja;
const ROOT = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : [];
  });
}

function missing(keys: string[]): string[] {
  return keys.filter((key) => !(key in table));
}

describe('i18n のキー', () => {
  it('ソース中の t("...") はすべて存在する', () => {
    const keys = new Set<string>();
    for (const file of sources(join(ROOT, 'src/game'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([a-z0-9_.]+)'/g)) keys.add(m[1]!);
    }
    expect(keys.size).toBeGreaterThan(50);
    expect(missing([...keys])).toEqual([]);
  });

  it('データの name_key はすべて存在する', () => {
    const data = freshData();
    const keys = [
      ...data.enemies.map((e) => e.name_key),
      ...data.customers.map((c) => c.name_key),
      ...data.drinks.map((d) => d.name_key),
      ...data.hobbies.map((h) => h.name_key),
      ...data.selfCare.map((s) => s.name_key),
      ...data.homes.map((h) => h.name_key),
      ...data.rivals.map((r) => r.name_key),
    ];
    expect(missing(keys)).toEqual([]);
  });

  it('組み立てて引くキー（テンプレートリテラル）もすべて存在する', () => {
    const data = freshData();
    const keys: string[] = [];
    for (const vibe of VIBES) {
      keys.push(`service.vibe.${vibe}`, `service.reaction.match.${vibe}`, `service.reaction.miss.${vibe}`);
      for (let i = 1; i <= data.service.mood_lines_per_mood; i++) keys.push(`service.mood.${vibe}.${i}`);
    }
    for (const kind of ['order_ok', 'over_wallet', 'declined', 'guest_left']) keys.push(`service.line.${kind}.1`, `service.line.${kind}.2`);
    for (const tag of ['vibe_match', 'vibe_miss', 'preference_match', 'preference_miss', 'hobby']) keys.push(`service.tag.${tag}`);
    for (const stat of [...STAT_IDS, 'hp', 'mp', 'drunk', 'exp']) keys.push(`stat.${stat}`);
    for (const hobby of data.hobbies) keys.push(`hobby.${hobby.id}`);
    for (let d = 0; d < 7; d++) keys.push(`weekday.${d}`);
    for (const e of ['empty', 'too_long', 'ng_word']) keys.push(`name.error.${e}`);
    for (const b of ['closed', 'worked', 'no_hp', 'game_over']) keys.push(`home.work_block.${b}`);
    for (const b of ['money', 'actions', 'level']) keys.push(`self_care.block.${b}`);
    for (const c of ['companion', 'exp', 'heal', 'skip']) keys.push(`street.choice.${c}`);
    for (const o of ['goal', 'late', 'down']) keys.push(`street.outcome.${o}`, `result.title.${o}`);
    expect(missing(keys)).toEqual([]);
  });

  it('{param} の書式が壊れていない', () => {
    const broken = Object.entries(table).filter(([, v]) => (v.match(/\{/g)?.length ?? 0) !== (v.match(/\}/g)?.length ?? 0));
    expect(broken).toEqual([]);
  });
});
