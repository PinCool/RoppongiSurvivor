import buildings from '../../data/buildings.json';
import calendar from '../../data/calendar.json';
import customers from '../../data/customers.json';
import drinks from '../../data/drinks.json';
import enemies from '../../data/enemies.json';
import hobbies from '../../data/hobbies.json';
import homes from '../../data/homes.json';
import loginBonus from '../../data/login_bonus.json';
import missions from '../../data/missions.json';
import ngWords from '../../data/ng_words.json';
import player from '../../data/player.json';
import rank from '../../data/rank.json';
import ranking from '../../data/ranking.json';
import recruit from '../../data/recruit.json';
import regulars from '../../data/regulars.json';
import rivals from '../../data/rivals.json';
import selfCare from '../../data/self_care.json';
import service from '../../data/service.json';
import skills from '../../data/skills.json';
import street from '../../data/street.json';
import type { GameData } from './types';
import { validateGameData } from './validate';

/** 同梱の JSON を束ねて検査する。JSON の import はバンドラが解決するだけなので Core に置いてよい */
export function loadGameData(): GameData {
  return validateGameData({
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
    missions,
    skills,
    regulars,
    ranking,
    homes: homes.homes,
    calendar,
    rank,
    ngWords: ngWords.words,
  });
}

export function byId<T extends { id: string }>(items: readonly T[], id: string): T {
  const found = items.find((item) => item.id === id);
  if (!found) throw new Error(`id が見つからない: ${id}`);
  return found;
}
