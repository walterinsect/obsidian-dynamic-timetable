/**
 * VS Code の設定画面(GUI)で編集できるキー/値形式の設定を、既存の配列設定へ統合する。
 * 配列(settings.json 向け)とマップ(GUI 向け)の両方があるとき、同名は配列が優先。
 */
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export const mergeColorMap = (arr: unknown, map: unknown): unknown[] => {
  const base = Array.isArray(arr) ? arr : [];
  if (!isRecord(map)) return base;
  const taken = new Set(base.map((c) => (isRecord(c) && typeof c.category === 'string' ? c.category : '')));
  const fromMap = Object.entries(map)
    .filter(([category, color]) => category && !taken.has(category) && typeof color === 'string')
    .map(([category, color]) => ({ category, color }));
  return [...fromMap, ...base];
};

export const mergeTemplateMap = (arr: unknown, map: unknown): unknown => {
  if (!isRecord(map) || Object.keys(map).length === 0) return arr;
  if (arr !== undefined && arr !== null && !Array.isArray(arr)) return arr; // 不正な配列はそのまま検証に報告させる
  const base = Array.isArray(arr) ? arr : [];
  const taken = new Set(base.map((t) => (isRecord(t) && typeof t.name === 'string' ? t.name.trim() : '')));
  const fromMap = Object.entries(map)
    .filter(([name]) => !taken.has(name.trim()))
    .map(([name, body]) => ({ name, body }));
  return [...base, ...fromMap];
};
