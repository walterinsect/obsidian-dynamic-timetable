/**
 * 打刻: タスク行末尾の `(@created: 値)` / `(@done: 値)`。
 * 値は書式化済みの文字列をそのまま保持する(再書式化しない)。
 */
export const DEFAULT_TIMESTAMP_FORMAT = 'YYYY-MM-DD HH:mm';

const STAMP_RE = /[ \t]*\(@(created|done):[ \t]*([^)\r\n]*?)[ \t]*\)/g;

export interface Stamps {
  created?: string;
  done?: string;
}

/** 行内の刻印の位置(先頭の空白は含めず `(` から `)` まで)。エディタのハイライト用。 */
export const findStamps = (line: string): { kind: 'created' | 'done'; start: number; end: number }[] => {
  const out: { kind: 'created' | 'done'; start: number; end: number }[] = [];
  const re = new RegExp(STAMP_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const lead = /^[ \t]*/.exec(m[0])![0].length;
    out.push({ kind: m[1] as 'created' | 'done', start: m.index + lead, end: m.index + m[0].length });
  }
  return out;
};

/** 行から刻印を取り除いた文字列と、取り出した値(同種が複数あれば先頭を採用)。 */
export const extractStamps = (line: string): Stamps & { text: string } => {
  const found: Stamps = {};
  const text = line
    .replace(STAMP_RE, (_m, kind: 'created' | 'done', value: string) => {
      if (found[kind] === undefined) found[kind] = value;
      return '';
    })
    .replace(/[ \t]+$/, '');
  return { ...found, text };
};

/** 刻印だけを取り除く(パーサ用)。刻印が無ければ入力をそのまま返す。 */
export const stripStamps = (line: string): string =>
  line.includes('(@') ? extractStamps(line).text : line;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** YYYY MM DD HH mm ss だけをトークンとして置換する簡易書式。他の文字はそのまま。 */
export const formatTimestamp = (d: Date, format: string = DEFAULT_TIMESTAMP_FORMAT): string =>
  format.replace(/YYYY|MM|DD|HH|mm|ss/g, (t) => {
    switch (t) {
      case 'YYYY': return pad(d.getFullYear(), 4);
      case 'MM': return pad(d.getMonth() + 1);
      case 'DD': return pad(d.getDate());
      case 'HH': return pad(d.getHours());
      case 'mm': return pad(d.getMinutes());
      default: return pad(d.getSeconds());
    }
  });

/** 書式として有効か(刻印の閉じ括弧・改行を壊さず、トークンを1つ以上含む)。 */
export const isValidTimestampFormat = (f: unknown): f is string =>
  typeof f === 'string' &&
  f.length > 0 &&
  f.length <= 40 &&
  !/[)\r\n]/.test(f) &&
  /YYYY|MM|DD|HH|mm|ss/.test(f);

/** 行末に付ける文字列(先頭に空白付き)。値が無い種類は出さない。 */
export const stampSuffix = (s: Stamps): string =>
  (s.created ? ` (@created: ${s.created})` : '') + (s.done ? ` (@done: ${s.done})` : '');
