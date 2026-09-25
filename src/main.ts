import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { GameOverScene } from './game/scenes/GameOverScene';
import { HomeScene } from './game/scenes/HomeScene';
import { NameScene } from './game/scenes/NameScene';
import { ResultScene } from './game/scenes/ResultScene';
import { ServiceScene } from './game/scenes/ServiceScene';
import { StreetScene } from './game/scenes/StreetScene';
import { session } from './game/session';
import { COLOR, HEIGHT, WIDTH } from './game/theme';

// 書体を読み終わってから起動する（Canvas の文字は後から書体が来ても描き直されない）。読めなくても 3 秒で諦めて起動
await Promise.race([
  Promise.all([document.fonts.load('800 32px "M PLUS Rounded 1c"'), document.fonts.load('500 32px "M PLUS Rounded 1c"')]),
  new Promise((resolve) => setTimeout(resolve, 3000)),
]).catch(() => undefined);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: COLOR.bgTop,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 },
  render: { antialias: true, pixelArt: false },
  scene: [BootScene, NameScene, HomeScene, StreetScene, ServiceScene, ResultScene, GameOverScene],
});

// 開発時だけ、撮影スクリプト（tools/shot.mjs）やコンソールから状態を触れるようにする
if (import.meta.env.DEV) {
  (window as unknown as { __rs: unknown }).__rs = { game, session };
}
