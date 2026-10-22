export interface TextEdit {
  start: number; // old 内の開始オフセット(UTF-16)
  end: number; // old 内の終了オフセット(排他)
  text: string; // 置換後の文字列
}

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/**
 * old → new を作る最小の単一置換。全文置換だとカーソル位置や折り畳みが飛ぶため、
 * 変更範囲だけを置換する。サロゲートペアは分割しない。
 */
export const minimalEdit = (oldText: string, newText: string): TextEdit | null => {
  if (oldText === newText) return null;
  const max = Math.min(oldText.length, newText.length);
  let p = 0;
  while (p < max && oldText.charCodeAt(p) === newText.charCodeAt(p)) p++;
  if (p > 0 && isHigh(oldText.charCodeAt(p - 1))) p--;

  let s = 0;
  while (
    s < max - p &&
    oldText.charCodeAt(oldText.length - 1 - s) === newText.charCodeAt(newText.length - 1 - s)
  ) s++;
  if (s > 0 && isLow(oldText.charCodeAt(oldText.length - s))) s--;

  return { start: p, end: oldText.length - s, text: newText.slice(p, newText.length - s) };
};

export const applyEdit = (text: string, e: TextEdit | null): string =>
  e ? text.slice(0, e.start) + e.text + text.slice(e.end) : text;
