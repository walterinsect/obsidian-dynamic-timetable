/**
 * 所要時間の読み書き(vscode 非依存)。
 *  - 読み取り: `90` / `5.5`(分)、`45m`、`2h`、`2h20m`、`1.5h`
 *  - 書き込み: `45m` / `2h` / `2h20m` / `1h05m`(時間があるときは分を 2 桁にゼロ埋め)
 *  - 完了行の見積り注記: ` (est 2h)`
 */
const NUM = '\\d+(?:\\.\\d+)?';
/** 正規表現に埋め込める所要時間の表記(長い形を先に)。キャプチャグループは含まない。 */
export const DURATION_PATTERN = `(?:${NUM}h[ \\t]*${NUM}m|${NUM}h|${NUM}m|${NUM})`;

const DURATION_FULL = new RegExp(`^(?:(${NUM})h)?[ \\t]*(?:(${NUM})m)?$`);

/** 表記 → 分。読めなければ null。裸の数値は従来どおり分。 */
export const parseDuration = (text: string): number | null => {
  const s = text.trim();
  if (new RegExp(`^${NUM}$`).test(s)) return parseFloat(s);
  const m = DURATION_FULL.exec(s);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  return (m[1] !== undefined ? parseFloat(m[1]) * 60 : 0) + (m[2] !== undefined ? parseFloat(m[2]) : 0);
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 分 → 表記。分は四捨五入した整数で扱う。0 分は "0m"。 */
export const formatDuration = (minutes: number): string => {
  const total = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h${pad2(m)}m`;
};

/** 見積りと実績の差(実績 − 見積り)。+20m / -15m / ±0m。 */
export const formatVariance = (minutes: number): string => {
  const r = Math.round(minutes);
  if (r === 0) return '±0m';
  return `${r > 0 ? '+' : '-'}${formatDuration(Math.abs(r))}`;
};

// ------------------------------------------------------------ 見積り注記 (est …)

const EST_NOTE_RE = new RegExp(`[ \\t]*\\(est[ \\t]+(${DURATION_PATTERN})[ \\t]*\\)`, 'g');

/** 行内の `(est …)` の位置(先頭の空白は含めず `(` から `)` まで)と、その分数。 */
export const findEstNotes = (line: string): { start: number; end: number; minutes: number }[] => {
  const out: { start: number; end: number; minutes: number }[] = [];
  const re = new RegExp(EST_NOTE_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const minutes = parseDuration(m[1]);
    if (minutes === null) continue;
    const lead = /^[ \t]*/.exec(m[0])![0].length;
    out.push({ start: m.index + lead, end: m.index + m[0].length, minutes });
  }
  return out;
};

/** 先頭の `(est …)` の分数。無ければ null。 */
export const extractPlannedMinutes = (line: string): number | null => findEstNotes(line)[0]?.minutes ?? null;

export const stripEstNotes = (line: string): string => (line.includes('(est') ? line.replace(EST_NOTE_RE, '') : line);

export const estNote = (minutes: number, hm: boolean): string => ` (est ${hm ? formatDuration(minutes) : String(Math.round(minutes))})`;
