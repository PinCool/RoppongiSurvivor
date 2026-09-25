import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : [];
  });
}

/** コメントを落とす（行番号は保つ。文字列の中の // は考えない簡易版。ソースの書き方で困らない範囲） */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ''))
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('Core は描画・ブラウザから独立している', () => {
  const forbidden: [RegExp, string][] = [
    [/from ['"]phaser['"]/, 'Phaser を import している'],
    [/\bwindow\./, 'window に触っている'],
    [/\bdocument\./, 'document に触っている'],
    [/\blocalStorage\b/, 'localStorage に触っている'],
    [/Math\.random\(/, 'Math.random を使っている（Rng を使う）'],
    [/Date\.now\(/, 'Date.now を使っている（時刻は外から渡す）'],
    [/from ['"]\.\.\/(\.\.\/)?game\//, 'Game 層を import している（依存は Game → Core の一方向）'],
  ];

  for (const file of sources(join(ROOT, 'src/core'))) {
    it(relative(ROOT, file), () => {
      const code = stripComments(readFileSync(file, 'utf8'));
      const problems = forbidden.filter(([pattern]) => pattern.test(code)).map(([, message]) => message);
      expect(problems).toEqual([]);
    });
  }
});

describe('Game 層にユーザー向けの文言を直書きしない', () => {
  const japanese = /[぀-ヿ㐀-鿿！-｠]/;
  for (const file of sources(join(ROOT, 'src/game'))) {
    it(relative(ROOT, file), () => {
      const raw = readFileSync(file, 'utf8');
      const rawLines = raw.split('\n');
      const lines = stripComments(raw).split('\n');
      const offenders = lines
        .map((line, i) => ({ line: line.trim(), no: i + 1 }))
        // 開発者向けの例外メッセージと、行末に「i18n-ignore」と書いた行（禁則の文字表など文言でないもの）は対象外
        .filter(({ line, no }) => japanese.test(line) && !/new Error\(/.test(line) && !rawLines[no - 1]!.includes('i18n-ignore'))
        .map(({ line, no }) => `${no}: ${line}`);
      expect(offenders).toEqual([]);
    });
  }
});
