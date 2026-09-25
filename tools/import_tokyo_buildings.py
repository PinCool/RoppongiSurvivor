#!/usr/bin/env python3
"""TokyoSurvivor の建物の絵（アイソメ・夜のパステルのシティポップ）を、集客の街用に縮めて取り込む。

絵は床の菱形の手前の角が画像の下端中央に来て、菱形の幅が画像の幅いっぱい（TokyoSurvivor の作り）。
置くときは「手前の角に下端中央を合わせ、菱形の幅に合わせて縮める」だけで床に乗る。
出力: public/assets/buildings/<name>.webp と src/game/generated/buildings.json（名前と寸法）
使いかた: python3 tools/import_tokyo_buildings.py [TokyoSurvivor のパス]
"""
import json
import sys
from pathlib import Path

from PIL import Image

SRC_ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else Path.home() / "TokyoSurvivor")
SRC = SRC_ROOT / "Assets/_Project/Resources/Map/IsoTown"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/assets/buildings"
WIDTH = 420  # 画面では 300px 前後で描く。高解像度の端末でも粗くならない幅

# 夜の街に並べる建物（_glow の発光マスクは使わない。ぼかし・発光は入れない決まり）
NAMES = [
    "land_host_club_tower", "land_pink_fashion", "land_mob_apartment_a", "land_mob_apartment_b",
    "land_mob_apartment_beige", "land_mob_office_a", "land_mob_tower_a", "land_mob_tower_b",
    "land_mob_shophouse", "land_mob_corner_shop", "land_neon_convenience", "land_karaoke_tower",
    "land_izakaya_tower", "land_violet_hotel", "land_pink_apartment", "land_tile_apartment",
    "land_cafe_almond", "land_live_house", "land_rock_cafe", "land_bar_building",
    "land_capsule_hotel", "land_game_center", "land_ramen_corner_shop", "land_disco_club",
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.webp"):
        if old.stem not in NAMES:
            old.unlink()
    manifest = []
    for name in NAMES:
        im = Image.open(SRC / f"{name}.png").convert("RGBA")
        h = round(im.height * WIDTH / im.width)
        small = im.resize((WIDTH, h), Image.LANCZOS)
        small.save(OUT / f"{name}.webp", "WEBP", quality=88, method=6)
        manifest.append({"key": name, "width": WIDTH, "height": h})
    gen = ROOT / "src/game/generated"
    gen.mkdir(parents=True, exist_ok=True)
    (gen / "buildings.json").write_text(json.dumps(manifest, indent=2) + "\n")
    total = sum(f.stat().st_size for f in OUT.glob("*.webp"))
    print(f"{len(manifest)} buildings, {total / 1024:.0f} KB")


if __name__ == "__main__":
    main()
