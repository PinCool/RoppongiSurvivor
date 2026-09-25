import { deserializePlayer, serializePlayer, type PlayerState } from '../core/career/playerState';

const KEY = 'roppongi-survivor.save';

/** localStorage は使えない環境（プライベートブラウズ等）があるので、読み書きとも失敗を握りつぶす */
export function loadSave(): PlayerState | null {
  try {
    const json = window.localStorage.getItem(KEY);
    return json ? deserializePlayer(json) : null;
  } catch {
    return null;
  }
}

export function writeSave(state: PlayerState): void {
  try {
    window.localStorage.setItem(KEY, serializePlayer(state));
  } catch {
    // 保存できなくても遊べるようにする
  }
}

export function clearSave(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // noop
  }
}
