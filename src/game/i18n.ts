import ja from '../i18n/ja.json';

type Params = Record<string, string | number>;
const table: Record<string, string> = ja;

/**
 * 文言はすべてここを通す（ソースに直書きしない）。{name} を params で差し込む。
 * 無いキーは ⟦key⟧ と出して目立たせる（i18n.test.ts がソース中のキーの欠けを落とす）。
 */
export function t(key: string, params: Params = {}): string {
  const template = table[key];
  if (template === undefined) {
    console.warn(`[i18n] missing key: ${key}`);
    return `⟦${key}⟧`;
  }
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (name in params ? String(params[name]) : `{${name}}`));
}

export function hasKey(key: string): boolean {
  return key in table;
}

export function yen(value: number): string {
  return t('format.yen', { value: Math.floor(value).toLocaleString('ja-JP') });
}
