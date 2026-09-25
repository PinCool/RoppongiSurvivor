#!/usr/bin/env python3
"""TokyoSurvivor の効果音を、このプロジェクト用に取り込む（m4a に変換）。

**出力は gitignore 済み（public/assets/audio/）。リポジトリには絶対に commit しない。**
素材は Case Portman Audio のパック（ロイヤリティフリーだが「元の音声ファイルを単体でダウンロードできる形で置く」のは禁止）で、
このリポジトリは public のため。ゲームに組み込んで配信するのはライセンスの範囲内。

出力: public/assets/audio/sfx/<clip>.m4a と public/assets/audio/sfx.json（音量・ピッチ・同時発音の定義）
使いかた: python3 tools/import_tokyo_sfx.py [TokyoSurvivor のパス]
"""
import json
import subprocess
import sys
from pathlib import Path

SRC_ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else Path.home() / "TokyoSurvivor")
AUDIO = SRC_ROOT / "Assets/_Project/Resources/Audio"
OUT = Path(__file__).resolve().parent.parent / "public/assets/audio"
MAX_CLIPS = 3  # 差し替え候補は 3 本まで（ダウンロード量を抑える）

# このゲームで使う音。TokyoSurvivor の sfx.json の id をそのまま使う
WANTED = [
    "ui_select", "ui_confirm", "ui_cancel", "ui_error", "title_press",
    "hit_penlight", "pickup_exp", "pickup_item", "player_hurt", "level_up",
    "goal_open", "boss_arrival", "run_clear", "run_late", "run_defeat",
    "talk_open", "recruit_join", "recruit_fail",
    "shop_request_ok", "shop_request_fail", "shop_settle", "activity_clear",
]


def main() -> None:
    catalog = {s["id"]: s for s in json.loads((AUDIO / "sfx.json").read_text())["sfx"]}
    missing = [i for i in WANTED if i not in catalog]
    if missing:
        raise SystemExit(f"TokyoSurvivor の sfx.json に無い: {missing}")
    (OUT / "sfx").mkdir(parents=True, exist_ok=True)
    out = []
    for sid in WANTED:
        entry = catalog[sid]
        clips = entry["clips"][:MAX_CLIPS]
        for clip in clips:
            src = AUDIO / "Sfx" / f"{clip}.wav"
            dst = OUT / "sfx" / f"{clip}.m4a"
            if not dst.exists():
                subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "96000", str(src), str(dst)], check=True)
        out.append({
            "id": sid,
            "clips": clips,
            "volume": entry["volume"],
            "pitch_min": entry["pitch_min"],
            "pitch_max": entry["pitch_max"],
            "max_voices": entry["max_voices"],
            "min_interval_seconds": entry["min_interval_seconds"],
        })
    (OUT / "sfx.json").write_text(json.dumps({"sfx": out}, indent=2) + "\n")
    total = sum(f.stat().st_size for f in (OUT / "sfx").glob("*.m4a"))
    print(f"{len(out)} sounds, {sum(len(s['clips']) for s in out)} clips, {total / 1024:.0f} KB")


if __name__ == "__main__":
    main()
