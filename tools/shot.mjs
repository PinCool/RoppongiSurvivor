// 画面の流れを通しで撮る確認用スクリプト（開発サーバに繋ぐ）。
//   npm run dev -- --port 5199 & node tools/shot.mjs [出力先]
// スマホ相当（390x844 @2x・タッチ）で、名前入力 → 自宅 → 集客 → 遭遇 → 接客 → リザルト を撮る。
// 集客は window.__rs からシミュレーションを早送りして、お客やお店の前へ瞬間移動する。
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'screenshots';
const URL = process.env.RS_URL ?? 'http://localhost:5199/';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`shot ${name}`);
};
/** ゲームの論理座標 (720x1280) をクリック */
const tap = async (x, y) => {
  const r = await page.evaluate(() => document.querySelector('canvas').getBoundingClientRect().toJSON());
  await page.mouse.click(r.left + (x * r.width) / 720, r.top + (y * r.height) / 1280);
};
const activeScene = () => page.evaluate(() => window.__rs.game.scene.getScenes(true).map((s) => s.scene.key).join(','));
const waitScene = async (key) => {
  for (let i = 0; i < 60; i++) {
    if ((await activeScene()) === key) return;
    await wait(100);
  }
  throw new Error(`scene ${key} にならない（いま ${await activeScene()}）\n${errors.join("\n")}`);
};
/** 集客のシミュレーションを seconds 秒ぶん進める（遭遇は skip しない） */
const fastForward = (seconds) =>
  page.evaluate((sec) => {
    const sim = window.__rs.game.scene.getScene('Street')._sim;
    const end = sim.time + sec;
    while (sim.time < end && !sim.paused) sim.tick({ move: { x: 0, y: 0 } });
    return sim.time;
  }, seconds);
const companions = () => page.evaluate(() => window.__rs.game.scene.getScene('Street')._sim.companions.length);
const teleport = (target) =>
  page.evaluate((what) => {
    const sim = window.__rs.game.scene.getScene('Street')._sim;
    const pos = what === 'goal' ? sim.goal : sim.customers.find((c) => c.state === 'wandering')?.pos;
    if (!pos) return false;
    sim.player.pos.x = pos.x;
    sim.player.pos.y = pos.y;
    sim.enemies.length = 0;
    return true;
  }, target);

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await wait(1200);
await shot('01_name');

await page.fill('input', 'ゆい');
await page.keyboard.press('Enter');
await waitScene('Home');
// 展開を毎回そろえる
await page.evaluate(() => { window.__rs.session.player.seed = 20260925; });
await wait(900);
await shot('02_login_bonus');
await tap(360, 760); // 受け取る
await wait(500);
await shot('02_home');

await tap(360, 1080);
await waitScene('Street');
await page.keyboard.down('ArrowRight');
await wait(2500);
await page.keyboard.up('ArrowRight');
await fastForward(25);
await wait(300);
await shot('03_street');

await fastForward(40);
await teleport('customer');
await wait(600);
await shot('04_encounter');
// 1 つ目の選択肢（同伴）を実際にタップして、効いたか確かめる
await tap(360, 1280 / 2 + 40 - 450 + 430);
await wait(400);
console.log(`companions after tap: ${await companions()}`);
if ((await companions()) !== 1) throw new Error(`同伴のボタンが効いていない\n${errors.join('\n')}`);

await fastForward(30);
if (await teleport('customer')) {
  await wait(500); // 選択肢は出てから 350ms は押し始めを受け付けない（誤タップ対策）
  await tap(360, 1280 / 2 + 40 - 450 + 430);
  await wait(300);
}
await fastForward(40);
await wait(200);
await shot('05_goal');
await teleport('goal');
await wait(300);
await shot('06_arrive');
await waitScene('Service');
await wait(700);
await shot('07_service');

await tap(360, 790);
await wait(900);
await shot('08_drinks');
await tap(190, 720);
await wait(700);
await shot('09_ordered');

for (let i = 0; i < 4 && (await activeScene()) === 'Service'; i++) {
  const next = await page.evaluate(() => {
    const s = window.__rs.game.scene.getScene('Service')._session;
    if (s.phase === 'vibe') s.chooseVibe('fun');
    s.nextGuest();
    return s.phase;
  });
  if (next === 'done') {
    await page.evaluate(() => window.__rs.game.scene.getScene('Service').finish());
  }
}
await waitScene('Result');
await wait(1500);
await shot('10_result');

await tap(360, 1110);
await waitScene('Home');
await wait(900);
await shot('11_home_after');

// 自分磨き（下段左のボタン）
await tap(131, 1216);
await wait(500);
await shot('12_self_care');
await tap(580, 296); // 1 行目の「やる」（行の上端 240 + 56）
await wait(700);
await shot('13_self_care_done');
await tap(360, 1150); // とじる
await wait(400);

// 月末まで飛ばして寝る → 家賃のお知らせ
await page.evaluate(() => { window.__rs.session.player.day = 27; });
await tap(360, 1216); // 寝る
await waitScene('Home');
await wait(1200);
await shot('14_rent');
await tap(360, 820); // OK
await wait(500);

// ライバル戦: ステージを関門へ飛ばして出勤
await page.evaluate(() => {
  const p = window.__rs.session.player;
  p.stageLevel = 10;
  p.hp = p.maxHp;
  p.mp = p.maxMp;
  window.__rs.game.scene.getScene('Home').scene.restart();
});
await wait(900);
await shot('15_home_rival');
await tap(360, 1080);
await waitScene('Street');
await wait(1200);
await shot('16_rival_street');
for (let i = 0; i < 1200; i++) {
  const stolen = await page.evaluate(() => {
    const sim = window.__rs.game.scene.getScene('Street')._sim;
    if (sim.pendingEncounter) sim.resolveEncounter('skip');
    sim.player.hp = sim.player.maxHp; // 撮影のため倒れないようにする
    for (let k = 0; k < 10; k++) sim.tick({ move: { x: 0, y: 0 } });
    return sim.rival.steals;
  });
  if (stolen > 0) break;
}
await wait(400);
await shot('17_rival_stole');

await browser.close();
if (errors.length) {
  console.error('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
