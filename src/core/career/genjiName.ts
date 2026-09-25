export type NameError = 'empty' | 'too_long' | 'ng_word' | null;

/** 源氏名の前後の空白を落とし、NFKC で全角英数などを揃える */
export function normalizeName(raw: string): string {
  return raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

/** 源氏名の検査。他人との被りは許す。NG ワードは部分一致・大文字小文字を無視 */
export function validateName(raw: string, maxLength: number, ngWords: readonly string[]): NameError {
  const name = normalizeName(raw);
  if (name.length === 0) return 'empty';
  if ([...name].length > maxLength) return 'too_long';
  const folded = name.toLowerCase().replace(/\s/g, '');
  if (ngWords.some((word) => folded.includes(word.normalize('NFKC').toLowerCase()))) return 'ng_word';
  return null;
}
