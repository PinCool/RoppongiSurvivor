#!/usr/bin/env python3
"""TokyoSurvivor (Unity) の絵を、このプロジェクト用のスプライトシートへ焼き直す。

一度きりの取り込み用。元の絵は 1 コマ 400px 前後あり、LINE 内ブラウザには重いので
セルの高さ CELL_H に縮め、クリップごとに横一列のシートへ並べる。
出力: public/assets/sprites/<name>.png と src/game/generated/sprite_sheets.json（全キャラのセル寸法とクリップ表）

使いかた: python3 tools/import_tokyo_art.py [TokyoSurvivor のパス]
"""
import json
import sys
from pathlib import Path

from PIL import Image

SRC_ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else Path.home() / "TokyoSurvivor")
CHAR_DIR = SRC_ROOT / "Assets/_Project/Art/Sprites/Characters"
HOME_DIR = SRC_ROOT / "Assets/_Project/Resources/UI/Title/HomeBedroom"
OUT = Path(__file__).resolve().parent.parent / "public/assets"
CELL_H = 150

# 出力名 -> (元フォルダ, [(クリップ名, 元のクリップ接頭辞)])
CHARACTERS = {
    "player": ("Night", [("idle", "idle_front"), ("run_side", "run_side"), ("run_front", "run_front"), ("run_back", "run_back")]),
    "salaryman": ("Salaryman", [("walk", "walk_side")]),
    "sweats": ("Sweats", [("walk", "walk_side")]),
    "bandman": ("Bandman", [("idle", "idle_front"), ("walk", "walk_side")]),
    "host": ("Host", [("idle", "idle_front"), ("walk", "walk_side")]),
    "tora": ("Tora", [("idle", "idle_front"), ("walk", "walk_side")]),
    "punch": ("Punch", [("idle", "idle_front"), ("walk", "walk_side")]),
    "catch": ("Catch", [("idle", "idle_front"), ("walk", "walk_side")]),
    # ライバル（キャバ嬢）。自機と同じ走りのクリップを持つ
    "crystal": ("Crystal", [("idle", "idle_front"), ("run_side", "run_side"), ("run_front", "run_front"), ("run_back", "run_back")]),
}

# TokyoSurvivor で使われなくなった古い絵。取り込まない（2026-09-25 ユーザー指示「昔のアセットが紛れ込んでいるから完全削除」）
RETIRED = {"Hood", "Regent"}


def frames(folder: Path, prefix: str) -> list[Path]:
    found = sorted(p for p in folder.glob(f"{prefix}-*.png"))
    if not found:
        raise SystemExit(f"no frames: {folder}/{prefix}-*.png")
    return found


def bake_character(name: str, folder_name: str, clips: list[tuple[str, str]]) -> dict:
    folder = CHAR_DIR / folder_name
    loaded = {clip: [Image.open(p).convert("RGBA") for p in frames(folder, prefix)] for clip, prefix in clips}
    # 全クリップ共通のセル: 元の最大寸法を CELL_H に合わせて縮める（足元をセルの下端に揃える）
    max_w = max(im.width for ims in loaded.values() for im in ims)
    max_h = max(im.height for ims in loaded.values() for im in ims)
    scale = CELL_H / max_h
    cell_w = int(round(max_w * scale))
    total = sum(len(ims) for ims in loaded.values())
    sheet = Image.new("RGBA", (cell_w * total, CELL_H), (0, 0, 0, 0))
    table = {}
    index = 0
    for clip, ims in loaded.items():
        table[clip] = {"start": index, "count": len(ims)}
        for im in ims:
            w, h = max(1, round(im.width * scale)), max(1, round(im.height * scale))
            small = im.resize((w, h), Image.LANCZOS)
            x = index * cell_w + (cell_w - w) // 2
            sheet.paste(small, (x, CELL_H - h), small)
            index += 1
    sheet.save(OUT / "sprites" / f"{name}.png", optimize=True)
    print(f"{name}: {total} frames, cell {cell_w}x{CELL_H}")
    return {"frame_width": cell_w, "frame_height": CELL_H, "clips": table}


def chroma_key(im: Image.Image) -> Image.Image:
    """緑抜きの素材を透過にする。緑の強さ（g - max(r, b)）で α を落とし、縁の緑かぶりも削る。"""
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            green = g - max(r, b)
            if green <= 20:
                continue
            alpha = max(0.0, min(1.0, 1.0 - (green - 20) / 70.0))
            px[x, y] = (r, max(r, b), b, int(a * alpha))
    return im


def bake_home() -> None:
    # 部屋は横長 1672x941。縦画面の上半分に置くので、キャラが入る右寄りを正方形に近く切り出す
    bg = Image.open(HOME_DIR / "background.png").convert("RGB")
    body = chroma_key(Image.open(HOME_DIR / "character_body.png").convert("RGBA"))
    anim = json.loads((HOME_DIR / "animation.json").read_text())
    room = bg.copy()
    body_scaled = body.resize((anim["character_width"], anim["character_height"]), Image.LANCZOS)
    room.paste(body_scaled, (anim["character_left"], anim["character_top"]), body_scaled)
    crop = room.crop((640, 0, 1600, 941))
    crop = crop.resize((720, round(941 * 720 / 960)), Image.LANCZOS)
    crop.save(OUT / "home" / "room.jpg", quality=85, optimize=True)
    logo = Image.open(HOME_DIR / "roppongi_survivor_logo.png").convert("RGBA")
    logo = logo.resize((680, round(logo.height * 680 / logo.width)), Image.LANCZOS)
    logo.save(OUT / "home" / "logo.png", optimize=True)
    print("home: room.jpg, logo.png")


def remove_stale_sheets(keep: set[str]) -> None:
    """表から消したキャラのシートを消す（古い絵が public/ に残らないように）"""
    for png in (OUT / "sprites").glob("*.png"):
        if png.stem not in keep:
            png.unlink()
            print(f"removed stale sheet: {png.name}")


if __name__ == "__main__":
    retired = RETIRED & {folder for folder, _ in CHARACTERS.values()}
    if retired:
        raise SystemExit(f"retired art in CHARACTERS: {sorted(retired)}")
    remove_stale_sheets(set(CHARACTERS))
    sheets = {name: bake_character(name, folder, clips) for name, (folder, clips) in CHARACTERS.items()}
    generated = Path(__file__).resolve().parent.parent / "src/game/generated"
    generated.mkdir(parents=True, exist_ok=True)
    (generated / "sprite_sheets.json").write_text(json.dumps(sheets, indent=2) + "\n")
    bake_home()
