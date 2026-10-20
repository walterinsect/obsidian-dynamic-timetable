import { Task, TaskParser } from './TaskParser';
import type { DynamicTimetableSettings } from './types';
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
>;

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
const TAG_RE = /\s#([^\s!#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]+)/gu;

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
 * 打刻(settings.enableTimestamps): 完了行に (@done: now) を付け、Interrupt の残りタスクには
 * (@created: now) を付ける。完了行の既存の (@created: …) は保持する。無効時も既存の刻印は失わない。
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
  const [, indent, bullet] = line.match(TASK_LINE)!;
  const name = parser.parseTaskName(line.trim()).originalTaskName;
  const tags = [...existing.text.matchAll(TAG_RE)].map((m) => `#${m[1]}`).join(' ');
  const tagPart = tags ? ` ${tags}` : '';
  const actualStart = new Date(now.getTime() - elapsed * 60000);
  const startText = settings.enableTimestamps ? formatTimestamp(actualStart, DEFAULT_TIMESTAMP_FORMAT) : formatHHMM(actualStart);

  lines[idx] =
    `${indent}${bullet} [x] ${name} ${delim} ${elapsed} ${startDelim} ${startText}${tagPart}` +
    stampSuffix({ created: existing.created, done: stampNow ?? existing.done });

  let remainingMinutes: number | undefined;
  if (mode === 'interrupt') {
    const remaining = Math.max(0, Math.ceil(parseFloat(current.estimate!) - elapsed));
    if (remaining > 0) {
      remainingMinutes = remaining;
      // 残りは新しいタスク: Created は元の値ではなく中断した時刻
      lines.splice(idx + 1, 0, `${indent}${bullet} [ ] ${name} ${delim} ${remaining}${tagPart}` + stampSuffix({ created: stampNow }));
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
