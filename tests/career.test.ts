import { describe, expect, it } from 'vitest';
import { crossesMonth, dateOf, isClosedDay } from '../src/core/career/calendar';
import { endDay } from '../src/core/career/day';
import { normalizeName, validateName } from '../src/core/career/genjiName';
import { createPlayer, deserializePlayer, serializePlayer } from '../src/core/career/playerState';
import { addExp, expToNext } from '../src/core/career/progression';
import { applySelfCare, selfCareBlock } from '../src/core/career/selfCare';
import { useAdRefill, workBlock } from '../src/core/career/work';
import { byId } from '../src/core/data/gameData';
import { freshData } from './helpers';

describe('暦', () => {
  const cal = freshData().calendar;

  it('初日は 4 月 1 週目の月曜、6 日目が日曜（店休日）', () => {
    expect(dateOf(0, cal)).toEqual({ month: 4, week: 1, weekday: 0, monthIndex: 0 });
    expect(isClosedDay(6, cal)).toBe(true);
    expect(isClosedDay(5, cal)).toBe(false);
  });

  it('4 週で 1 か月。28 日目から 5 月', () => {
    expect(dateOf(27, cal).month).toBe(4);
    expect(dateOf(28, cal)).toMatchObject({ month: 5, week: 1, weekday: 0 });
    expect(crossesMonth(27, cal)).toBe(true);
    expect(crossesMonth(26, cal)).toBe(false);
  });

  it('12 月の次は 1 月', () => {
    expect(dateOf(28 * 9, cal).month).toBe(1);
  });
});

describe('1 日の終わり', () => {
  it('出勤した日は HP 全快・MP 6 割回復、酔いは半分抜ける', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    s.hp = 10;
    s.mp = 0;
    s.drunk = 30;
    s.workedToday = true;
    endDay(s, data);
    expect(s.hp).toBe(s.maxHp);
    expect(s.mp).toBe(60);
    expect(s.drunk).toBe(15);
    expect(s.day).toBe(1);
    expect(s.workedToday).toBe(false);
    expect(s.actionsLeft).toBe(data.player.actions_per_day);
  });

  it('休んだ日は MP も全快', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    s.mp = 0;
    endDay(s, data);
    expect(s.mp).toBe(s.maxMp);
  });

  it('二日酔いだと MP の戻りが落ちる', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    s.mp = 0;
    s.drunk = data.player.overnight.hangover_threshold;
    s.workedToday = true;
    const report = endDay(s, data);
    expect(report.hangover).toBe(true);
    expect(s.mp).toBe(30);
  });

  it('月末に家賃を払う', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    s.day = 27;
    s.money = 100000;
    const report = endDay(s, data);
    expect(report.settlement).toMatchObject({ rent: 95000, moneyAfter: 5000, inDebt: false });
    expect(s.money).toBe(5000);
  });

  it('払えなければ借金、6 か月続くと実家に呼び戻されてゲームオーバー', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    s.money = 0;
    const rent = byId(data.homes, s.homeId).rent;
    for (let month = 1; month <= 6; month++) {
      s.day = month * 28 - 1;
      const report = endDay(s, data);
      expect(report.settlement?.inDebt).toBe(true);
      expect(s.debtMonths).toBe(month);
      expect(report.gameOver).toBe(month === 6);
    }
    expect(s.money).toBe(-rent * 6);
  });

  it('借金を返し切った月は数え直し', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    s.money = -1;
    s.debtMonths = 3;
    s.day = 27;
    s.money = 200000;
    endDay(s, data);
    expect(s.debtMonths).toBe(0);
  });
});

describe('レベル', () => {
  it('必要経験値は成長率で増え、レベルアップで最大 HP / MP が伸びる', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    const need = expToNext(1, data.player.level_curve);
    expect(need).toBe(100);
    expect(expToNext(2, data.player.level_curve)).toBe(130);
    const gained = addExp(s, need + expToNext(2, data.player.level_curve) + 5, data.player);
    expect(gained).toBe(2);
    expect(s.level).toBe(3);
    expect(s.exp).toBe(5);
    expect(s.maxHp).toBe(110);
    expect(s.maxMp).toBe(110);
  });
});

describe('自分磨き', () => {
  it('お金と回数を使って能力と趣味が伸びる', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    const golf = byId(data.selfCare, 'golf_lesson');
    applySelfCare(s, golf);
    expect(s.money).toBe(data.player.initial.money - golf.cost);
    expect(s.intellect).toBe(data.player.initial.intellect + 2);
    expect(s.hobbies.golf).toBe(1);
    expect(s.actionsLeft).toBe(data.player.actions_per_day - 1);
  });

  it('できない理由を返す', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    expect(selfCareBlock(s, byId(data.selfCare, 'esthetic'))).toBe('level');
    s.money = 0;
    expect(selfCareBlock(s, byId(data.selfCare, 'gym_drop_in'))).toBe('money');
    s.actionsLeft = 0;
    expect(selfCareBlock(s, byId(data.selfCare, 'gym_drop_in'))).toBe('actions');
  });
});

describe('出勤と広告', () => {
  it('日曜・出勤済み・HP 0 は出勤できない', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    expect(workBlock(s, data)).toBeNull();
    s.workedToday = true;
    expect(workBlock(s, data)).toBe('worked');
    s.workedToday = false;
    s.day = 6;
    expect(workBlock(s, data)).toBe('closed');
    s.day = 7;
    s.hp = 0;
    expect(workBlock(s, data)).toBe('no_hp');
  });

  it('広告の MP 全回復は 1 日 3 回まで、満タンなら回数を使わない', () => {
    const data = freshData();
    const s = createPlayer(data, 'a', 1);
    expect(useAdRefill(s)).toBe(false);
    expect(s.adRefillsLeft).toBe(3);
    for (let i = 0; i < 3; i++) {
      s.mp = 0;
      expect(useAdRefill(s)).toBe(true);
    }
    s.mp = 0;
    expect(useAdRefill(s)).toBe(false);
  });
});

describe('源氏名', () => {
  const ng = ['死ね', 'fuck'];
  it('空・長すぎ・NG ワードを弾き、被りは許す', () => {
    expect(validateName('  ', 10, ng)).toBe('empty');
    expect(validateName('あいうえおかきくけこさ', 10, ng)).toBe('too_long');
    expect(validateName('ＦＵＣＫ', 10, ng)).toBe('ng_word');
    expect(validateName('ゆい', 10, ng)).toBeNull();
  });

  it('全角英数と空白を揃える', () => {
    expect(normalizeName('  Ｒｉｎａ   ちゃん ')).toBe('Rina ちゃん');
  });
});

describe('セーブ', () => {
  it('往復で同じ、壊れたデータと古い版は null', () => {
    const data = freshData();
    const s = createPlayer(data, 'ゆい', 5);
    expect(deserializePlayer(serializePlayer(s))).toEqual(s);
    expect(deserializePlayer('{broken')).toBeNull();
    expect(deserializePlayer(JSON.stringify({ ...s, version: 0 }))).toBeNull();
  });
});
