/**
 * エディタ上のハイライト(vscode 非依存)。
 * Timetable が認識するタスク行(TaskParser.scanTaskLines)の中の、
 * タグ・見積り・開始時刻・打刻の範囲を計算する。
 */
import type { TaskParser } from './TaskParser';
import { findStamps } from './stamps';

export type HighlightKind = 'tag' | 'estimate' | 'start' | 'created' | 'done' | 'completed';

export interface HighlightRange {
  kind: HighlightKind;
  line: number;
  /** 行内の開始位置(UTF-16)。end は含まない */
  start: number;
  end: number;
  /** kind === 'tag' のときのカテゴリ名 */
  category?: string;
}

const TAG_RE = /\s#([^\s!#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]+)/gu;

export const computeHighlights = (parser: TaskParser, content: string): HighlightRange[] => {
  const { separator, startTimeDelimiter } = parser.delimiters;
  const estimateRe = new RegExp(`\\${separator}\\s*\\d+(?:\\.\\d+)?`);
  const startRe = new RegExp(`\\${startTimeDelimiter}\\s*(?:\\d{4}-\\d{2}-\\d{2}[T ]\\s*)?\\d{1,2}:?\\d{2}`);
  const out: HighlightRange[] = [];

  for (const { index, text, isCompleted } of parser.scanTaskLines(content)) {
    // 刻印は先に位置を取り、同じ長さの空白に置き換えてから他を探す(刻印内の # や @ を拾わない・位置がずれない)
    let masked = text;
    for (const st of findStamps(text)) {
      out.push({ kind: st.kind, line: index, start: st.start, end: st.end });
      masked = masked.slice(0, st.start) + ' '.repeat(st.end - st.start) + masked.slice(st.end);
    }
    const est = estimateRe.exec(masked);
    if (est) out.push({ kind: 'estimate', line: index, start: est.index, end: est.index + est[0].length });
    const start = startRe.exec(masked);
    if (start) out.push({ kind: 'start', line: index, start: start.index, end: start.index + start[0].length });
    const tagRe = new RegExp(TAG_RE.source, 'gu');
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(masked)) !== null) {
      out.push({ kind: 'tag', line: index, start: m.index + 1, end: m.index + m[0].length, category: m[1] });
    }
    if (isCompleted) {
      const lead = /^\s*/.exec(text)![0].length;
      if (text.length > lead) out.push({ kind: 'completed', line: index, start: lead, end: text.length });
    }
  }
  return out.sort((a, b) => a.line - b.line || a.start - b.start);
};

// ------------------------------------------------------------ 設定・色

export type ColorKey = 'estimate' | 'start' | 'created' | 'done';
export const COLOR_KEYS: ColorKey[] = ['estimate', 'start', 'created', 'done'];

export interface HighlightOptions {
  enabled: boolean;
  /** 背景の不透明度(0〜1)。タグの色と、アルファ無しで指定した色に使う */
  opacity: number;
  /** ユーザー指定の色(#RRGGBB / #RRGGBBAA)。未指定のキーはテーマ色 */
  colors: Partial<Record<ColorKey, string>>;
  /** 完了行の不透明度(1 = 薄くしない) */
  completedOpacity: number;
}

export const DEFAULT_HIGHLIGHT: HighlightOptions = { enabled: true, opacity: 0.2, colors: {}, completedOpacity: 0.55 };

const HEX = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const clamp = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

export const sanitizeHighlightOptions = (raw: {
  enabled?: unknown;
  opacity?: unknown;
  colors?: unknown;
  completedOpacity?: unknown;
}): HighlightOptions => {
  const colors: Partial<Record<ColorKey, string>> = {};
  if (raw.colors && typeof raw.colors === 'object' && !Array.isArray(raw.colors)) {
    for (const k of COLOR_KEYS) {
      const v = (raw.colors as Record<string, unknown>)[k];
      if (typeof v === 'string' && HEX.test(v.trim())) colors[k] = v.trim();
    }
  }
  return {
    enabled: raw.enabled !== false,
    opacity: clamp(raw.opacity, 0, 1, DEFAULT_HIGHLIGHT.opacity),
    colors,
    completedOpacity: clamp(raw.completedOpacity, 0.1, 1, DEFAULT_HIGHLIGHT.completedOpacity),
  };
};

/** #RRGGBB はアルファを opacity から補い、#RRGGBBAA はそのまま使う。 */
export const resolveHexColor = (hex: string, opacity: number): string => {
  if (hex.length === 9) return hex.toLowerCase();
  const a = Math.round(Math.min(1, Math.max(0, opacity)) * 255);
  return hex.toLowerCase() + a.toString(16).padStart(2, '0');
};

/** カテゴリ色(hsla(h, s%, l%, a))のアルファだけを差し替える。他の形式はそのまま返す。 */
export const withAlpha = (color: string, alpha: number): string =>
  color.replace(/^(hsla\([^)]*?),\s*[\d.]+\s*\)$/, `$1, ${alpha})`);
