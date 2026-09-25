import { describe, expect, it } from 'vitest';
import buildings from '../src/data/buildings.json';
import calendar from '../src/data/calendar.json';
import customers from '../src/data/customers.json';
import drinks from '../src/data/drinks.json';
import enemies from '../src/data/enemies.json';
import hobbies from '../src/data/hobbies.json';
import homes from '../src/data/homes.json';
import loginBonus from '../src/data/login_bonus.json';
import ngWords from '../src/data/ng_words.json';
import player from '../src/data/player.json';
import rank from '../src/data/rank.json';
import recruit from '../src/data/recruit.json';
import rivals from '../src/data/rivals.json';
import selfCare from '../src/data/self_care.json';
import service from '../src/data/service.json';
import street from '../src/data/street.json';
import { createPlayer } from '../src/core/career/playerState';
import { rankLetter, totalRankScore } from '../src/core/career/rank';
import { loadGameData } from '../src/core/data/gameData';
import { GameDataError, validateGameData } from '../src/core/data/validate';

function rawData() {
  return structuredClone({
    player,
    street,
    enemies: enemies.enemies,
    customers: customers.customers,
    recruit,
    drinks: drinks.drinks,
    service,
    hobbies: hobbies.hobbies,
    selfCare: selfCare.items,
    rivals: rivals.rivals,
    loginBonus,
    buildings: buildings.buildings,
    homes: homes.homes,
    calendar,
    rank,
    ngWords: ngWords.words,
  }) as Record<string, any>;
}

function errorsOf(raw: Record<string, any>): string[] {
  try {
    validateGameData(raw as never);
    return [];
  } catch (e) {
    if (e instanceof GameDataError) return e.errors;
    throw e;
  }
}

describe('同梱のゲームデータ', () => {
  it('検査を通る', () => {
    expect(() => loadGameData()).not.toThrow();
  });

  it('総合ランクは D の 120 前後から始まる（企画書の「D ランク 120 とかから」）', () => {
    const data = loadGameData();
    const score = totalRankScore(createPlayer(data, 'テスト', 1), data);
    expect(score).toBe(120);
    expect(rankLetter(score, data)).toBe('D');
  });

  it('お客の出現は 1 分・1.5 分・2 分、ゴールは 2 分、制限 3 分（企画書のテンポ）', () => {
    const data = loadGameData();
    expect(data.street.customer_spawn_seconds).toEqual([60, 90, 120]);
    expect(data.street.goal_appear_seconds).toBe(120);
    expect(data.street.duration_seconds).toBeLessThanOrEqual(180);
    expect(data.street.max_companions).toBe(3);
  });

  it('駆け出しのバンドマンには 1 万円のシャンパンが限界（財布の上限が効く値になっている）', () => {
    const data = loadGameData();
    const bandman = data.customers.find((c) => c.id === 'bandman')!;
    const champagne = data.drinks.find((d) => d.id === 'champagne')!;
    expect(bandman.wallet_max).toBeLessThan(champagne.price);
  });
});

describe('検査が落とすもの', () => {
  it('キーの綴り間違い', () => {
    const raw = rawData();
    raw.drinks[0].prise = raw.drinks[0].price;
    delete raw.drinks[0].price;
    const errors = errorsOf(raw);
    expect(errors.some((e) => e.includes('prise') && e.includes('知らないキー'))).toBe(true);
    expect(errors.some((e) => e.includes('price') && e.includes('キーが無い'))).toBe(true);
  });

  it('型違い', () => {
    const raw = rawData();
    raw.street.duration_seconds = '180';
    expect(errorsOf(raw).some((e) => e.includes('street.duration_seconds'))).toBe(true);
  });

  it('id の重複', () => {
    const raw = rawData();
    raw.drinks[1].id = raw.drinks[0].id;
    expect(errorsOf(raw).some((e) => e.includes('id 重複'))).toBe(true);
  });

  it('存在しない趣味への参照', () => {
    const raw = rawData();
    raw.customers[0].hobby = 'curling';
    expect(errorsOf(raw).some((e) => e.includes('curling'))).toBe(true);
  });

  it('ゴールが制限時間より後', () => {
    const raw = rawData();
    raw.street.goal_appear_seconds = 999;
    expect(errorsOf(raw).length).toBeGreaterThan(0);
  });

  it('期間つきなのに期間が無い自分磨き', () => {
    const raw = rawData();
    const timed = raw.selfCare.find((i: any) => i.kind === 'timed');
    delete timed.duration_days;
    expect(errorsOf(raw).some((e) => e.includes('duration_days'))).toBe(true);
  });

  it('月額なのに月額が無い自分磨き', () => {
    const raw = rawData();
    const sub = raw.selfCare.find((i: any) => i.kind === 'subscription');
    delete sub.monthly_fee;
    expect(errorsOf(raw).some((e) => e.includes('monthly_fee'))).toBe(true);
  });

  it('同じステージに 2 人のライバル', () => {
    const raw = rawData();
    raw.rivals.push({ ...raw.rivals[0], id: 'twin' });
    expect(errorsOf(raw).some((e) => e.includes('同じステージに 2 人'))).toBe(true);
  });

  it('値段が昇順でないドリンク表', () => {
    const raw = rawData();
    raw.drinks.reverse();
    expect(errorsOf(raw).some((e) => e.includes('drinks.price'))).toBe(true);
  });
});
