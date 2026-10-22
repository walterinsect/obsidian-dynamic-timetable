import { Task, TaskParser } from './TaskParser';
import type { DynamicTimetableSettings } from './types';
import { DURATION_PATTERN, estNote, formatDuration, stripEstNotes } from './duration';
import { DEFAULT_TIMESTAMP_FORMAT, extractStamps, formatTimestamp, stampSuffix } from './stamps';

type OpSettings = Pick<
  DynamicTimetableSettings,
  | 'taskEstimateDelimiter'
  | 'startTimeDelimiter'
  | 'dateDelimiter'
  | 'showStartTimeInTaskName'
  | 'showEstimateInTaskName'
  | 'showCategoryNamesInTask'
  | 'showUntilRegex'
  | 'enableTimestamps'
  | 'timestampFormat'
> & Partial<Pick<DynamicTimetableSettings, 'durationFormat'>>;

const pad2 = (n: number) => String(n).padStart(2, '0');

export const formatHHMM = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const formatHHMMSS = (d: Date) => `${formatHHMM(d)}:${pad2(d.getSeconds())}`;

export const detectEol = (content: string) => (content.includes('\r\n') ? '\r\n' : '\n');

/** 先頭の front matter(`---` ... `---`)。CRLF 対応。ファイル先頭にあるものだけを対象にする。 */
const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?=\r?\n|$)/;

/** YAML front matter の startTime を now に更新(無ければ追加、front matter が無ければ先頭に作る)。 */
export const updateStartTimeInYAML = (content: string, now: Date): string => {
  const eol = detectEol(content);
  const value = formatHHMMSS(now);
  const m = content.match(FRONT_MATTER);
  if (!m) return `---${eol}startTime: ${value}${eol}---${eol}${content}`;

  const block = m[1];
  const startRe = /^startTime:[ \t]*\d{2}:\d{2}:\d{2}[ \t]*$/m;
  const newBlock = startRe.test(block)
    ? block.replace(startRe, `startTime: ${value}`)
    : `${block}${eol}startTime: ${value}`;
  return `---${eol}${newBlock}${eol}---` + content.slice(m[0].length);
};

/** YAML の startTime からの経過分(切り捨て)。startTime が無ければ 0。未来なら日付またぎとして +24h。 */
export const getElapsedMinutes = (
  content: string,
  parser: TaskParser,
  nowMs: number
): number => {
  const start = parser.getYamlStartTime(content);
  if (!start) return 0;
  let minutes = (nowMs - start.getTime()) / 60000;
  if (minutes < 0) minutes += 24 * 60;
  return Math.max(0, Math.floor(minutes));
};

const TASK_LINE = /^(\s*)([-+*])\s*\[ \]\s*/;

/**
 * タスク行を「その場」で書き換える。見積り(; 30)と開始時刻(@ 09:00)の部分だけを置き換え、
 * タグ・リンク・本文など他の文字は元の位置のまま残す(タグを行末へ移さない)。
 *  - est: 見積り部分の置換テキスト
 *  - start: 開始時刻部分の置換テキスト。undefined なら既存の開始時刻を取り除く。
 *    文字列で、既存の開始時刻が無いときは見積りの直後に挿入する。
 */
const rewriteInPlace = (
  rest: string,
  o: { sep: string; startDelim: string; est: string; start?: string }
): string => {
  const estRe = new RegExp(`\\${o.sep}\\s*${DURATION_PATTERN}`);
  const startRe = new RegExp(`\\${o.startDelim}\\s*(?:\\d{4}-\\d{2}-\\d{2}[T ]\\s*)?\\d{1,2}:?\\d{2}`);
  const e = estRe.exec(rest);
  let s = startRe.exec(rest);
  if (e && s && s.index < e.index + e[0].length && s.index + s[0].length > e.index) s = null; // 重なりは無視
  const edits: { from: number; to: number; text: string }[] = [];
  if (e) edits.push({ from: e.index, to: e.index + e[0].length, text: o.est + (s || o.start === undefined ? '' : ` ${o.startDelim} ${o.start}`) });
  if (s) {
    if (o.start === undefined) {
      const lead = /[ \t]*$/.exec(rest.slice(0, s.index))![0].length;
      edits.push({ from: s.index - lead, to: s.index + s[0].length, text: '' });
    } else edits.push({ from: s.index, to: s.index + s[0].length, text: `${o.startDelim} ${o.start}` });
  }
  let out = rest;
  for (const ed of edits.sort((a, b) => b.from - a.from)) out = out.slice(0, ed.from) + ed.text + out.slice(ed.to);
  return out;
};

export interface ApplyResult {
  content: string;
  /** 書き換えた(完了にした)タスク */
  completed: Task | null;
  /** 完了後に先頭になる未完了タスク(customUrl 用) */
  next: Task | null;
  elapsedMinutes: number;
  /** 中断時に追加した残りタスクの見積り(分) */
  remainingMinutes?: number;
}

export interface CurrentTaskLine {
  parser: TaskParser;
  /** content を改行で分割した行(CR は含まない) */
  lines: string[];
  /** 現在のタスク(最初の未完了・見積りあり)の行番号 */
  index: number;
  task: Task;
}

/**
 * パーサが「現在のタスク」とみなしたタスク(最初の未完了・見積りあり)の行を探す。
 * 原題・見積りが一致する最初の未完了行を返す。見つからなければ null。
 */
export const findCurrentTaskLine = (content: string, settings: OpSettings): CurrentTaskLine | null => {
  const parser = TaskParser.fromSettings(settings as DynamicTimetableSettings);
  const task = parser.filterAndParseTasks(content).find((t) => !t.isCompleted);
  if (!task || !task.estimate) return null;
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex((l) => {
    if (!TASK_LINE.test(l)) return false;
    if (parser.parseEstimate(l) !== task.estimate) return false;
    return parser.parseTaskName(l.trim()).originalTaskName === task.originalTaskName;
  });
  return index < 0 ? null : { parser, lines, index, task };
};

/**
 * 先頭の未完了タスク(見積りがあるもの)を完了にし、YAML の startTime を now に更新する。
 * mode='interrupt' なら残り時間ぶんの未完了タスクを直後に追加する。
 * 書き換え対象が見つからなければ content は変更しない(startTime も触らない)。
 *
 * 打刻(settings.enableTimestamps): Interrupt の残りタスクに (@created: now) を付ける。
 * 完了行には打刻を追加しない((@done) は記録しない)。
 *
 * 完了行の書式: `; <実績> (est <元の見積り>) @ <実績開始>`(Complete のみ。例: `; 2h20m (est 2h)`)。完了行の既存の刻印(旧版の @done を含む)は保持し、
 * 無効時も失わない。
 */
export const applyTaskUpdate = (
  content: string,
  settings: OpSettings,
  now: Date,
  mode: 'complete' | 'interrupt'
): ApplyResult => {
  const unchanged: ApplyResult = { content, completed: null, next: null, elapsedMinutes: 0 };
  const found = findCurrentTaskLine(content, settings);
  if (!found) return unchanged;
  const { parser, lines, index: idx, task: current } = found;

  const elapsed = getElapsedMinutes(content, parser, now.getTime());
  const eol = detectEol(content);
  const delim = settings.taskEstimateDelimiter;
  const startDelim = settings.startTimeDelimiter;
  const stampNow = settings.enableTimestamps ? formatTimestamp(now, settings.timestampFormat) : undefined;

  const line = lines[idx];
  const existing = extractStamps(line);
  const [prefix, indent, bullet] = line.match(TASK_LINE)!;
  // 打刻と見積り注記を除いた本文。タグなどはここに元の位置のまま残る
  const rest = stripEstNotes(existing.text).slice(prefix.length);
  const actualStart = new Date(now.getTime() - elapsed * 60000);
  const startText = settings.enableTimestamps ? formatTimestamp(actualStart, DEFAULT_TIMESTAMP_FORMAT) : formatHHMM(actualStart);

  // 所要時間は 2h20m 形式(設定で分表記に戻せる)。Complete のときだけ元の見積りを (est …) で残す。
  // Interrupt は完了ではなく分割なので、実績側に見積りは付けない(残りは次のタスクが引き受ける)。
  const hm = settings.durationFormat !== 'minutes';
  const elapsedText = hm ? formatDuration(elapsed) : String(elapsed);
  const plannedMinutes = parseFloat(current.estimate!);
  const noteText = mode === 'complete' && Number.isFinite(plannedMinutes) ? estNote(plannedMinutes, hm) : '';
  lines[idx] =
    `${indent}${bullet} [x] ` +
    rewriteInPlace(rest, { sep: delim, startDelim, est: `${delim} ${elapsedText}${noteText}`, start: startText }) +
    stampSuffix({ created: existing.created, done: existing.done });

  let remainingMinutes: number | undefined;
  if (mode === 'interrupt') {
    const remaining = Math.max(0, Math.ceil(parseFloat(current.estimate!) - elapsed));
    if (remaining > 0) {
      remainingMinutes = remaining;
      // 残りは新しいタスク: Created は元の値ではなく中断した時刻
      const remainder = rewriteInPlace(rest, { sep: delim, startDelim, est: `${delim} ${remaining}` });
      lines.splice(idx + 1, 0, `${indent}${bullet} [ ] ${remainder}` + stampSuffix({ created: stampNow }));
    }
  }

  const updated = updateStartTimeInYAML(lines.join(eol), now);
  const next = parser.filterAndParseTasks(updated).find((t) => !t.isCompleted) ?? null;
  return { content: updated, completed: current, next, elapsedMinutes: elapsed, remainingMinutes };
};

/** customUrlScheme のプレースホルダ展開。{{minutes}} {{seconds}} {{taskName}}(全出現を置換) */
export const buildCustomUrl = (template: string, task: Pick<Task, 'task' | 'estimate'>): string | null => {
  if (!template || !task.estimate) return null;
  const minutes = Math.ceil(parseFloat(task.estimate));
  return template
    .replace(/\{\{minutes\}\}/g, String(minutes))
    .replace(/\{\{seconds\}\}/g, String(minutes * 60))
    .replace(/\{\{taskName\}\}/g, encodeURIComponent(task.task));
};
