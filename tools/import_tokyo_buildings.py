#!/usr/bin/env python3
"""TokyoSurvivor の建物の絵（Image2.5 で描き直した今の画風・夜のパステルのシティポップ）を、集客の街用に取り込む。

**旧 buildingart の世代（TokyoSurvivor の種類 19〜57）は使わない**（2026-09-25 ユーザー指示「マップが昔のアセット使っているので削除」）。
取り込むのは IsoTownView の種類 58〜81（Image2.5 の新作）だけ。

絵ごとの値は TokyoSurvivor からの転記:
  pivot = 足元の菱形の中心の正規化座標（左下原点。IsoTownView.Kinds）
  scale = 絵の倍率（同上。PPU 256 を割って大きく出す）
  size  = 足元の寸法 w × d（ワールド単位。IsoTownLayout.KindSizes）
出力:
  public/assets/buildings/<name>.webp
  src/game/generated/buildings.json   … 絵の寸法・pivot・「元の 1 ワールド単位が縮めた絵で何 px か」
  src/data/buildings.json             … 遊びの足元（街の単位 = ワールド単位 × UNITS）。無ければ作る（数値は後から手で直してよい）
使いかた: python3 tools/import_tokyo_buildings.py [TokyoSurvivor のパス]
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageEnhance

SRC_ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else Path.home() / "TokyoSurvivor")
SRC = SRC_ROOT / "Assets/_Project/Resources/Map/IsoTown"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/assets/buildings"
WIDTH = 420
PPU = 256.0
# TokyoSurvivor の IsoMapPalette.BuildingTint / BuildingSaturation（壁の紫を弱める）。実行時に掛けると
# 建物ごとに描画のパスが増えるので、取り込むときに絵へ焼き込む
BUILDING_TINT = (235, 255, 242)
BUILDING_SATURATION = 0.85
UNITS = 45  # 街の単位 / TokyoSurvivor のワールド単位
LOT = 206   # street.json の city.lot_size（これに収まらない絵は区画まるごとのランドマーク）
BLOCK_INNER = 460 - 24  # 区画の内側（pitch − 道幅 × 2）から余白を引いた、ランドマークの上限

# (名前, pivot x, pivot y, scale, w, d)  —— TokyoSurvivor IsoTownView.Kinds / IsoTownLayout.KindSizes の 58〜81
KINDS = [
    ("land_neon_discount_store", 0.51236979, 0.20410156, 3.00, 5.807344, 7.252035),
    ("land_red_observation_tower", 0.50195312, 0.13053385, 3.00, 5.270155, 5.203864),
    ("land_grand_nightclub", 0.51334635, 0.25927734, 1.80, 3.400742, 6.851202),
    ("land_neon_convenience", 0.50781250, 0.23535156, 1.60, 3.774182, 5.294462),
    ("land_coral_karaoke", 0.51025391, 0.10807292, 1.70, 1.906426, 3.662592),
    ("land_cobalt_arcade", 0.49967448, 0.21972656, 1.70, 3.474767, 4.423284),
    ("land_jade_dining", 0.53662109, 0.14290365, 1.70, 3.653201, 4.489023),
    ("land_violet_hotel", 0.50537109, 0.13932292, 1.70, 3.756505, 4.291807),
    ("land_pink_fashion", 0.50683594, 0.14713542, 1.70, 3.061551, 5.522062),
    ("land_mob_office_gray", 0.52978516, 0.12337240, 1.70, 3.493549, 3.859809),
    ("land_mob_apartment_beige", 0.50097656, 0.17708333, 1.70, 3.108508, 4.366937),
    ("land_mob_zakkyo_signs", 0.51123047, 0.12532552, 1.70, 2.263294, 2.648336),
    ("land_mob_slim_tower", 0.52978516, 0.11946615, 1.70, 2.263294, 3.117899),
    ("land_mob_shophouse", 0.51074219, 0.21582031, 1.70, 3.418419, 4.310589),
    ("land_mob_corner_shop", 0.50651042, 0.22363281, 1.70, 4.019460, 4.057025),
    ("land_neon_pachinko", 0.50097656, 0.18652344, 1.70, 2.601380, 4.733196),
    ("land_ramen_corner_shop", 0.50000000, 0.20996094, 1.60, 2.810749, 3.341080),
    ("land_police_box_night", 0.51139323, 0.21875000, 1.50, 2.676510, 3.480291),
    ("land_drugstore_night", 0.50553385, 0.24267578, 1.60, 4.039347, 4.242641),
    ("land_host_tower", 0.51611328, 0.12402344, 1.70, 2.122425, 2.901900),
    ("land_live_house_night", 0.51953125, 0.24218750, 1.60, 3.897926, 4.711099),
    ("land_izakaya_night", 0.51708984, 0.12337240, 1.70, 2.911291, 2.958248),
    ("land_corner_cafe", 0.50520833, 0.20751953, 1.60, 2.457196, 4.755293),
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    names = {k[0] for k in KINDS}
    for old in OUT.glob("*.webp"):
        if old.stem not in names:
            old.unlink()
            print(f"removed old building: {old.name}")
    art = []
    kinds = []
    for name, px, py, scale, w, d in KINDS:
        im = Image.open(SRC / f"{name}.png").convert("RGBA")
        h = round(im.height * WIDTH / im.width)
        small = im.resize((WIDTH, h), Image.LANCZOS)
        alpha = small.getchannel("A")
        rgb = ImageEnhance.Color(small.convert("RGB")).enhance(BUILDING_SATURATION)
        r, g, b = rgb.split()
        tinted = Image.merge("RGB", tuple(ch.point(lambda v, k=k: v * k / 255) for ch, k in zip((r, g, b), BUILDING_TINT)))
        tinted.putalpha(alpha)
        tinted.save(OUT / f"{name}.webp", "WEBP", quality=88, method=6)
        art.append({
            "key": name,
            "width": WIDTH,
            "height": h,
            "pivot_x": px,
            "pivot_y": py,
            # 表示の倍率 = 街の単位 / 縮めた絵の px。元の絵では 1 ワールド単位 = PPU / scale px、縮めた絵ではさらに WIDTH / 元の幅 倍
            "display_scale": UNITS / (PPU / scale * WIDTH / im.width),
        })
        # 向き: 絵の床の菱形は、左の辺が TokyoSurvivor の d、右の辺が w（絵を実測して確かめた。左右の落差の比 ≒ d / w）。
        # こちらの写しでは左の辺が地面の x、右の辺が y なので、x の幅 = d、y の奥行き = w
        fw, fd = round(d * UNITS), round(w * UNITS)
        landmark = max(fw, fd) > LOT
        if landmark and max(fw, fd) > BLOCK_INNER:
            print(f"skip (too big for a block): {name}")
            continue
        kinds.append({"id": name.removeprefix("land_"), "visual_id": name, "width": fw, "depth": fd, "landmark": landmark})
    gen = ROOT / "src/game/generated"
    gen.mkdir(parents=True, exist_ok=True)
    (gen / "buildings.json").write_text(json.dumps(art, indent=2) + "\n")
    data = ROOT / "src/data/buildings.json"
    data.write_text(json.dumps({"buildings": kinds}, indent=2) + "\n")
    total = sum(f.stat().st_size for f in OUT.glob("*.webp"))
    print(f"{len(art)} buildings ({sum(k['landmark'] for k in kinds)} landmarks), {total / 1024:.0f} KB")


if __name__ == "__main__":
    main()
