/**
 * JSON の形の検査。知らないキー・足りないキー・型違いをすべてエラーにする
 * （TokyoSurvivor の MissingMemberHandling.Error と同じ役目。綴り間違いをテストで落とす）。
 */
export type Shape =
  | 'number'
  | 'string'
  | 'boolean'
  | { array: Shape }
  | { record: Shape }
  | { optional: Shape }
  | { [key: string]: Shape };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function checkShape(value: unknown, shape: Shape, path: string, errors: string[]): void {
  if (shape === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) errors.push(`${path}: 数値ではない`);
    return;
  }
  if (shape === 'string') {
    if (typeof value !== 'string') errors.push(`${path}: 文字列ではない`);
    return;
  }
  if (shape === 'boolean') {
    if (typeof value !== 'boolean') errors.push(`${path}: 真偽値ではない`);
    return;
  }
  if ('array' in shape && Object.keys(shape).length === 1) {
    if (!Array.isArray(value)) {
      errors.push(`${path}: 配列ではない`);
      return;
    }
    value.forEach((item, i) => checkShape(item, shape.array as Shape, `${path}[${i}]`, errors));
    return;
  }
  if ('record' in shape && Object.keys(shape).length === 1) {
    if (!isPlainObject(value)) {
      errors.push(`${path}: オブジェクトではない`);
      return;
    }
    for (const [key, item] of Object.entries(value)) checkShape(item, shape.record as Shape, `${path}.${key}`, errors);
    return;
  }
  if (!isPlainObject(value)) {
    errors.push(`${path}: オブジェクトではない`);
    return;
  }
  const fields = shape as Record<string, Shape>;
  for (const [key, fieldShape] of Object.entries(fields)) {
    const optional = typeof fieldShape === 'object' && 'optional' in fieldShape && Object.keys(fieldShape).length === 1;
    if (!(key in value)) {
      if (!optional) errors.push(`${path}.${key}: キーが無い`);
      continue;
    }
    checkShape(value[key], optional ? (fieldShape as { optional: Shape }).optional : fieldShape, `${path}.${key}`, errors);
  }
  for (const key of Object.keys(value)) {
    if (!(key in fields)) errors.push(`${path}.${key}: 知らないキー（綴り間違い？）`);
  }
}
