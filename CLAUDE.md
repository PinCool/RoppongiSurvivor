# RoppongiSurvivor — 開発ガイド

上京した主人公が六本木の夜の街で No.1 を目指す**夜職育成シミュレーション**。LINE ミニアプリ（HTML5）向け。
Steam 版（`~/TokyoSurvivor`、Unity）を縦画面・フル 2D・基本無料に作り直したもの。企画の要約と実装の対応は `Docs/Design.md`。

TypeScript 7 / **Phaser 4** / Vite 8 / Vitest 5。論理解像度 **720x1280（縦）**、`Scale.FIT`。

## 絶対ルール

1. **ゲームロジックは `src/core/` に書く。** Phaser・`window`・`document`・`localStorage`・`Math.random`・`Date.now` は使わない
   （`tests/architecture.test.ts` がソースを読んで見張る）。乱数は `Rng`、時刻は外から渡す
2. **依存は `game → core` の一方向。** core から game を import しない
3. **バランス数値をソースに直書きしない。** `src/data/*.json` に置き、型は `core/data/types.ts`、検査は `core/data/validate.ts`
4. **ユーザー向けの文言をソースに直書きしない。** `src/i18n/ja.json` のキーを `t()` で引く
   （`src/game/` に日本語の文字列があるとテストが落ちる。例外は開発者向けの `new Error(...)` と、行末に `// i18n-ignore: 理由` を書いた行だけ）
5. **作業の最後に `npm run check`（型 + テスト）を通す。** 見た目を触ったら `tools/shot.mjs` で撮って自分の目で確かめる
6. **ロジックを書いたらテストも書く。** 難易度を変えたら `tests/balance.test.ts` が通るか見る（落ちたら意図した変化か確かめてから閾値を直す）

## レイヤ構成

```
src/
├─ core/            純粋 TS。ゲームロジック全部（Node の Vitest でそのまま回る）
│  ├─ data/         JSON の型・形の検査（知らないキー＝綴り間違いも落とす）・読み込み
│  ├─ career/       主人公の状態・暦・1 日の終わり（回復・家賃）・レベル・自分磨き・ランク・源氏名・出勤の精算
│  ├─ street/       集客パート（ヴァンサバ風）。固定タイムステップ 1/60
│  └─ service/      接客パート（ノリの 3 択 → ドリンクのおねだり）
├─ game/            Phaser。core を見て描くだけ
│  ├─ scenes/       Boot → Name → Home ⇄ Street → Service → Result → Home（GameOver）
│  ├─ ui/           Button / Gauge / VirtualStick / fx（告知・モーダル・遷移）
│  └─ generated/    tools/ が書き出す生成物（手で書かない）
├─ data/            バランス数値の JSON（AI が編集してよい）
└─ i18n/ja.json     文言
public/assets/      絵（tools/import_tokyo_art.py が TokyoSurvivor から焼いたもの）
tests/              Vitest（core のテスト・規約の見張り・難易度のボット）
tools/              import_tokyo_art.py（絵の取り込み）/ shot.mjs（通しの撮影）
```

## 新しいデータ種別を足すとき

1. `core/data/types.ts` に型、2. `core/data/validate.ts` の `SHAPES` に形と意味の検査、
3. `src/data/*.json`、4. `core/data/gameData.ts` で束ねる、5. `tests/gameData.test.ts` にテスト。
名前を持つものは `name_key` で ja.json を引く（`tests/i18n.test.ts` が欠けを落とす）。

## 検証ループ

```bash
npm run check                         # 型 + テスト（1〜数秒）
npm run dev                           # http://localhost:5173（スマホ実機は同じ LAN から --host の URL）
npx vite --port 5199 &                # 撮影用のサーバ
node tools/shot.mjs <出力先>           # 名前入力 → 自宅 → 集客 → 遭遇 → 接客 → リザルト → 自分磨き → 家賃 を撮る
npm run build                         # dist/ に静的ファイル（LINE ミニアプリ / LIFF に置く物）
```

**外部からの確認は GitHub Pages**: https://create-riki.github.io/RoppongiSurvivor/ —— main に push すると
`.github/workflows/pages.yml` が `npm run check` を通してから公開する（テストが落ちたら公開されない）。
リポジトリは private でも**公開されたサイトは URL を知っていれば誰でも見られる**。

**開発サーバでは `window.__rs = { game, session }` が生えている**（`src/main.ts`。本番ビルドには入らない）。
`__rs.game.scene.getScene('Street')._sim` でシミュレーションを早送り・瞬間移動できる（shot.mjs が使っている）。

## Phaser 4 で踏んだこと

- **コンテナの子は、描画は親の scrollFactor に従うが、当たり判定は子自身の scrollFactor で計算される。**
  カメラが動く画面（集客）でモーダルのボタンが押せなかった → 中身を足し終えてから `pinToScreen(root)`（`ui/fx.ts`）
- **白フラッシュは `setTint(0xffffff).setTintMode(Phaser.TintModes.FILL)`**（v3 の `setTintFill` は廃止）。戻すときは
  `clearTint().setTintMode(MULTIPLY)` —— モードを戻さないと白で塗られたままになる
- **`wordWrap` は空白で切るので日本語が折り返されない** → `wrappedStyle()`（`theme.ts`。1 文字ずつ測る・行頭禁則あり）
- **遷移の連打で `scene.start` が二重に積まれ、リザルトの精算が 2 回走った** → `fadeTo` は暗転中の 2 度目を無視する
- **キャラの depth は足元の y をそのまま使うので、ワールドの y は負にもなる。** 地面を -10 にしていて、スタート地点より
  上へ行ったキャラが地面の裏に隠れて消えた（2026-09-25 ユーザー報告「キャラクターが見えない」）→ 層はすべて `game/depth.ts` の
  `DEPTH` で持ち、`tests/depth.test.ts` がワールドの端から端まで順番を見張る。**depth に生の数字を書かない**
- 名前入力は Phaser の DOM 要素ではなく素の `<input>` を重ねる（スマホの IME をそのまま使うため。`NameScene`）

## 使わないもの（いまのところ）

物理エンジン（当たりは core の円判定）/ 状態管理ライブラリ / UI フレームワーク。入れたくなったら `Docs/Design.md` に理由を書いてから。
