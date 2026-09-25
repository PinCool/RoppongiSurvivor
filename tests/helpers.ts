import { loadGameData } from '../src/core/data/gameData';
import type { GameData } from '../src/core/data/types';

/** 同梱データの複製（テストで書き換えても他のテストに漏れない） */
export function freshData(): GameData {
  return structuredClone(loadGameData());
}
