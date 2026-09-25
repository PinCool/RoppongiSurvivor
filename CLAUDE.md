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
6. **音声ファイル（wav / m4a / mp3 / ogg）を commit しない。** 効果音のライセンスが「単体でダウンロードできる形の公開」を禁じていて、
   リポジトリは public。`tools/import_tokyo_sfx.py` で手元の `public/assets/audio/`（gitignore）に作る（`Docs/Design.md` の「音」）
7. **ロジックを書いたらテストも書く。** 難易度を変えたら `tests/balance.test.ts` が通るか見る（落ちたら意図した変化か確かめてから閾値を直す）

## レイヤ構成

```
src/
├─ core/            純粋 TS。ゲームロジック全部（Node の Vitest でそのまま回る）。時刻・日付は Game が渡す
│  ├─ data/         JSON の型・形の検査（知らないキー＝綴り間違いも落とす）・読み込み
│  ├─ career/       主人公の状態（セーブ版 2）・暦・1 日の終わり（回復・家賃・月額・期間切れ）・レベル・自分磨き・能力値（stats）・
│  │                ランク・源氏名・出勤の精算・ライバル・実時間回復・ログインボーナス・
│  │                デイリーミッション（missions）・図鑑と常連（book）・店内ランキング（ranking）
│  ├─ street/       集客パート（ヴァンサバ風）。固定タイムステップ 1/60
│  └─ service/      接客パート（ノリの 3 択 → ドリンクのおねだり）
├─ game/            Phaser。core を見て描くだけ
│  ├─ scenes/       Boot → Name → Home ⇄ Street → Service → Result → Home（GameOver）
│  ├─ ui/           Button / Gauge / VirtualStick / fx（告知・モーダル・遷移）
│  ├─ audio/        効果音（sfx.play('id')）。間引きの決まりは voicePolicy.ts
│  └─ generated/    tools/ が書き出す生成物（手で書かない）
├─ data/            バランス数値の JSON（AI が編集してよい）
└─ i18n/ja.json     文言
public/assets/      絵（tools/import_tokyo_art.py が TokyoSurvivor から焼いたもの）
tests/              Vitest（core のテスト・規約の見張り・難易度のボット）
tools/              import_tokyo_art.py（絵）/ import_tokyo_sfx.py（効果音。出力は gitignore）/ shot.mjs（通しの撮影）
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

**外部からの確認は GitHub Pages**: https://pincool.github.io/RoppongiSurvivor/ —— main に push すると
`.github/workflows/pages.yml` が `npm run check` を通してから公開する（テストが落ちたら公開されない）。
リポジトリ（PinCool/RoppongiSurvivor）は **public**（組織が無料プランで、private では Pages が使えないため 2026-09-25 に公開した）。

**開発サーバでは `window.__rs = { game, session }` が生えている**（`src/main.ts`。本番ビルドには入らない）。
`__rs.game.scene.getScene('Street')._sim` でシミュレーションを早送り・瞬間移動できる（shot.mjs が使っている）。

## Phaser 4 で踏んだこと

- **コンテナの子は、描画は親の scrollFactor に従うが、当たり判定は子自身の scrollFactor で計算される。**
  カメラが動く画面（集客）でモーダルのボタンが押せなかった → 中身を足し終えてから `pinToScreen(root)`（`ui/fx.ts`）
- **白フラッシュは `setTint(0xffffff).setTintMode(Phaser.TintModes.FILL)`**（v3 の `setTintFill` は廃止）。戻すときは
  `clearTint().setTintMode(MULTIPLY)` —— モードを戻さないと白で塗られたままになる
- **ボタンは「上で押して上で離した」ときだけ反応する**（`ui/tapGuard.ts`）。Phaser の `pointerup` は別の場所で押した指が
  上で離れても来るので、集客でスティックを動かしていた指が、急に出た遭遇の選択肢を押していた（2026-09-25 ユーザー報告）。
  急に出るボタンには `armMs`（出てから押し始めを受け付けない時間）も付ける。撮影スクリプトもこの時間を待つこと
- **敵は画面の外の楕円から湧く**（斜め見下ろしでは地面の同じ距離でも縦と横で画面の距離が違う。`pointOffscreen`）
- **色違いを作らない。** 1 つの絵は 1 つの役だけ（ユーザー指示「色味がダサすぎる AI っぽい」。`tests/assets.test.ts`）
- **命中と撃破が同じティックに来る。** 命中の演出でシミュレーション側の敵を引くと、もう居なくて例外 → 毎フレームの更新が止まり
  タイマーが凍った（2026-09-25）。描画に要る値はスプライトを作るときに `setData` で覚えさせる
- **`wordWrap` は空白で切るので日本語が折り返されない** → `wrappedStyle()`（`theme.ts`。1 文字ずつ測る・行頭禁則あり）
- **遷移の連打で `scene.start` が二重に積まれ、リザルトの精算が 2 回走った** → `fadeTo` は暗転中の 2 度目を無視する
- **キャラの depth は足元の y をそのまま使うので、ワールドの y は負にもなる。** 地面を -10 にしていて、スタート地点より
  上へ行ったキャラが地面の裏に隠れて消えた（2026-09-25 ユーザー報告「キャラクターが見えない」）→ 層はすべて `game/depth.ts` の
  `DEPTH` で持ち、`tests/depth.test.ts` がワールドの端から端まで順番を見張る。**depth に生の数字を書かない**
- 名前入力は Phaser の DOM 要素ではなく素の `<input>` を重ねる（スマホの IME をそのまま使うため。`NameScene`）

## 見た目の決まり（2026-09-25）

- **UI は「可愛いソシャゲ」**（ユーザー指示。LINE ミニアプリ風の白い UI は同日に取り消し）: パステルのピンク・ラベンダー・ミント・
  クリーム、白い丸角パネルに太めのパステルの縁、ぷっくりボタン（下に濃い段・上に白いツヤ）、見出しは白い字＋色の縁取り、
  書体は M PLUS Rounded 1c（index.html で読み込み、main.ts が読み終わりを待ってから起動）。
  **色は theme.ts のトークンから引く。ボタンの色は `variant`（primary / secondary / mint / yellow / quiet）で選び、呼び側で色を渡さない。**
  Steam 版（TokyoSurvivor）の「ソシャゲっぽくしない」は Steam 版の決まりで、こちらには当てはめない
- **集客の街はアイソメ（斜め見下ろし）の架空の街**（「六本木の地形データは使わなくていい、遊びやすい街を」）。
  Core は地面の平面（x, y）で、画面への写しは `game/iso.ts`（係数は street.json の `view`。建物の絵の床の菱形 0.645 に合わせてある）。
  街は `core/street/city.ts` が種から作る（道の格子・2×2 の建物・広場）。建物は通れない壁で、敵とライバルは `nav.ts` の流れ場で回り込む。
  建物の絵は TokyoSurvivor の夜のパステルの街（`tools/import_tokyo_buildings.py`）。床の色は夜のコンセプト画から実測
- **スティックは画面の向きのまま**（上に倒せば画面の上へ）。地面の向きへは `stickToGround` で直す
- **自機が建物の裏に回ったら、手前の建物を半透明にする**（`StreetScene.fadeOccluders`）
- **建物の絵は TokyoSurvivor の今の世代（Image2.5・種類 58〜81）だけ**。旧 buildingart 世代は使わない（テストが見張る）。
  足元は `data/buildings.json`、絵の pivot と倍率は取り込みの生成物。絵の床の左の辺が地面の x（= TokyoSurvivor の d）
- **建物の隙間は「くっつく」か「min_alley 以上」だけ**（`city.ts` の closeSlivers / dropSlivers）。経路のマスは自機の大きさで判定。
  中途半端な隙間は「挟まって動けない」「自機だけ入れる安全地帯」の両方を生んだ

## 使わないもの（いまのところ）

物理エンジン（当たりは core の円判定）/ 状態管理ライブラリ / UI フレームワーク。入れたくなったら `Docs/Design.md` に理由を書いてから。
