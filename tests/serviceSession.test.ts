import { describe, expect, it } from 'vitest';
import type { GameData } from '../src/core/data/types';
import { ServiceSession, type ServicePlayer } from '../src/core/service/serviceSession';
import { freshData } from './helpers';

const PLAYER: ServicePlayer = { mp: 200, beauty: 10, intellect: 10, sense: 10, hobbies: {} };

function session(data: GameData, player: Partial<ServicePlayer> = {}, wallet = 50000, typeId = 'bandman', seed = 9) {
  return new ServiceSession(data, { ...PLAYER, ...player }, [{ typeId, wallet }], seed);
}

describe('接客パート', () => {
  it('ノリが合えば成功率 +、外せば −', () => {
    const data = freshData();
    const s1 = session(data);
    const mood = s1.current!.mood;
    const r1 = s1.chooseVibe(mood);
    expect(r1.matched).toBe(true);
    expect(r1.reactionKey).toBe(`service.reaction.match.${mood}`);
    const drink = data.drinks[0]!;
    const hit = s1.successChance(drink);

    const s2 = session(data);
    const wrong = (['wild', 'fun', 'calm'] as const).find((v) => v !== s2.current!.mood)!;
    expect(s2.chooseVibe(wrong).matched).toBe(false);
    const miss = s2.successChance(drink);
    expect(hit - miss).toBeCloseTo(data.service.vibe_match_bonus + data.service.vibe_miss_penalty, 5);
  });

  it('好みの能力と趣味を満たすとボーナス、足りないとペナルティ', () => {
    const data = freshData();
    const bandman = data.customers.find((c) => c.id === 'bandman')!;
    const weak = session(data, { sense: bandman.preference_min - 1 });
    weak.chooseVibe(weak.current!.mood);
    expect(weak.bonusTags().map((t) => t.kind)).toEqual(['vibe_match', 'preference_miss']);

    const strong = session(data, { sense: bandman.preference_min, hobbies: { music: bandman.hobby_level } });
    strong.chooseVibe(strong.current!.mood);
    expect(strong.bonusTags().map((t) => t.kind)).toEqual(['vibe_match', 'preference_match', 'hobby']);
    // 上限・下限に張り付かない成功率のドリンクで差を測る
    const drink = data.drinks.find((d) => d.id === 'champagne')!;
    expect(strong.successChance(drink) - weak.successChance(drink)).toBeCloseTo(
      data.service.preference_bonus + data.service.preference_penalty + data.service.hobby_bonus,
      5,
    );
  });

  it('成功率は min〜max に収まる', () => {
    const data = freshData();
    data.drinks[0]!.base_success = 1;
    const s = session(data, { sense: 99, hobbies: { music: 9 } });
    s.chooseVibe(s.current!.mood);
    expect(s.successChance(data.drinks[0]!)).toBe(data.service.max_success);
  });

  it('財布を超える額は必ず断られる（MP は払う）', () => {
    const data = freshData();
    const s = session(data, {}, 5000);
    s.chooseVibe(s.current!.mood);
    const r = s.order('wine_bottle');
    expect(r.success).toBe(false);
    expect(r.failReason).toBe('over_wallet');
    expect(s.mp).toBe(PLAYER.mp - data.drinks.find((d) => d.id === 'wine_bottle')!.mp_cost);
  });

  it('成功すると売上が立ち、財布が減り、酔う', () => {
    const data = freshData();
    data.service.min_success = 0.99;
    data.service.max_success = 1;
    const s = session(data, {}, 5000);
    s.chooseVibe(s.current!.mood);
    const r = s.order('cast_drink');
    expect(r.success).toBe(true);
    expect(s.totalSales).toBe(1000);
    expect(s.current!.wallet).toBe(4000);
    expect(s.result().drunkGained).toBe(data.drinks[0]!.drunk);
  });

  it('失敗が patience 回でお客は帰る', () => {
    const data = freshData();
    const s = session(data, {}, 100);
    s.chooseVibe(s.current!.mood);
    for (let i = 1; i <= data.service.patience; i++) {
      const r = s.order('cast_drink');
      expect(r.guestLeft).toBe(i === data.service.patience);
    }
    expect(s.phase).toBe('left');
    expect(s.result().guests[0]!.left).toBe(true);
    expect(() => s.order('cast_drink')).toThrow();
  });

  it('MP が足りないドリンクは選べない', () => {
    const data = freshData();
    const s = session(data, { mp: 10 });
    s.chooseVibe(s.current!.mood);
    const options = s.drinkOptions();
    expect(options.find((o) => o.drink.id === 'cast_drink')!.block).toBeNull();
    expect(options.find((o) => o.drink.id === 'champagne')!.block).toBe('mp');
    expect(() => s.order('champagne')).toThrow();
  });

  it('順に接客して最後で done。お客ゼロなら最初から done', () => {
    const data = freshData();
    const s = new ServiceSession(data, PLAYER, [{ typeId: 'bandman', wallet: 1 }, { typeId: 'office_manager', wallet: 1 }], 1);
    expect(s.guestIndex).toBe(0);
    s.nextGuest();
    expect(s.phase).toBe('vibe');
    expect(s.current!.typeId).toBe('office_manager');
    s.nextGuest();
    expect(s.phase).toBe('done');
    expect(s.current).toBeNull();
    expect(new ServiceSession(data, PLAYER, [], 1).phase).toBe('done');
  });

  it('お客のセリフのキーは mood_lines_per_mood の範囲', () => {
    const data = freshData();
    for (let seed = 0; seed < 50; seed++) {
      const s = session(data, {}, 1, 'it_ceo', seed);
      const g = s.current!;
      const n = Number(g.moodLineKey.split('.').pop());
      expect(g.moodLineKey.startsWith(`service.mood.${g.mood}.`)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(data.service.mood_lines_per_mood);
    }
  });
});
