import type { DayReport } from '../core/career/day';
import type { PlayerState } from '../core/career/playerState';
import type { ShiftReport } from '../core/career/shift';
import { loadGameData } from '../core/data/gameData';
import type { GameData } from '../core/data/types';
import type { ServiceResult } from '../core/service/serviceSession';
import type { StreetOutcome } from '../core/street/streetSim';
import { writeSave } from './storage';

/**
 * シーンをまたいで持つ状態。Phaser のシーンは作り直されるので、ここに置いてシーンは読むだけにする。
 * ページを開き直すと消える（永続するのは player だけで、storage.ts が保存する）。
 */
class Session {
  readonly data: GameData = loadGameData();
  private _player: PlayerState | null = null;
  lastStreet: StreetOutcome | null = null;
  /** 接客が無かった出勤（途中帰宅・お客ゼロ）では null */
  lastService: ServiceResult | null = null;
  lastShift: ShiftReport | null = null;
  /** 寝て起きた直後だけ入る。自宅がお知らせを出したら消す */
  pendingDayReport: DayReport | null = null;

  get player(): PlayerState {
    if (!this._player) throw new Error('player がまだ無い');
    return this._player;
  }

  get hasPlayer(): boolean {
    return this._player !== null;
  }

  setPlayer(state: PlayerState | null): void {
    this._player = state;
    if (state) this.save();
  }

  save(): void {
    if (this._player) writeSave(this._player);
  }
}

export const session = new Session();
