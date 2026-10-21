import { detectEol, findCurrentTaskLine } from './taskOps';
import { formatTimestamp, stampSuffix } from './stamps';
import type { DynamicTimetableSettings } from './types';

type TplSettings = Pick<
  DynamicTimetableSettings,
  | 'taskEstimateDelimiter' | 'startTimeDelimiter' | 'dateDelimiter' | 'showStartTimeInTaskName'
  | 'showEstimateInTaskName' | 'showCategoryNamesInTask' | 'showUntilRegex' | 'enableTimestamps' | 'timestampFormat'
>;

// ---------------------------------------------------------------- 定義の検証

export interface TaskTemplate {
  name: string;
  /** 挿入するタスク行(VS Code スニペット構文)。空行は除去済み。 */
  body: string[];
}

export const MAX_TEMPLATES = 50;
export const MAX_BODY_LINES = 20;
export const MAX_LINE_LENGTH = 300;
export const MAX_NAME_LENGTH = 60;

/** ユーザー設定 taskTemplates の検証。不正な項目は捨てて、理由を problems に返す。 */
export const validateTemplates = (raw: unknown): { templates: TaskTemplate[]; problems: string[] } => {
  const templates: TaskTemplate[] = [];
  const problems: string[] = [];
  if (raw === undefined || raw === null) return { templates, problems };
  if (!Array.isArray(raw)) return { templates, problems: ['taskTemplates must be an array'] };

  const seen = new Set<string>();
  let overflowReported = false;
  raw.forEach((item, i) => {
    const label = `#${i + 1}`;
    if (templates.length >= MAX_TEMPLATES) {
      if (!overflowReported) problems.push(`more than ${MAX_TEMPLATES} templates; the rest are ignored`);
      overflowReported = true;
      return;
    }
    if (!item || typeof item !== 'object') return void problems.push(`${label}: not an object`);
    const { name: rawName, body: rawBody } = item as { name?: unknown; body?: unknown };
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    if (!name) return void problems.push(`${label}: missing "name"`);
    if (name.length > MAX_NAME_LENGTH) return void problems.push(`"${name.slice(0, 20)}…": name too long`);
    if (seen.has(name)) return void problems.push(`"${name}": duplicate name`);

    let lines: string[];
    if (typeof rawBody === 'string') lines = rawBody.split(/\r?\n/);
    else if (Array.isArray(rawBody) && rawBody.every((l) => typeof l === 'string')) lines = (rawBody as string[]).flatMap((l) => l.split(/\r?\n/));
    else return void problems.push(`"${name}": "body" must be a string or an array of strings`);

    lines = lines.map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '');
    if (lines.length === 0) return void problems.push(`"${name}": empty body`);
    if (lines.length > MAX_BODY_LINES) return void problems.push(`"${name}": more than ${MAX_BODY_LINES} lines`);
    if (lines.some((l) => l.length > MAX_LINE_LENGTH)) return void problems.push(`"${name}": a line exceeds ${MAX_LINE_LENGTH} characters`);

    seen.add(name);
    templates.push({ name, body: lines });
  });
  return { templates, problems };
};

export const sanitizeTemplates = (raw: unknown): TaskTemplate[] => validateTemplates(raw).templates;

/** 1 始まりの番号 or 名前。 */
export interface TemplateRef {
  name?: string;
  index?: number;
}

/** コマンド引数 → 参照。"break" / 2 / { template: "break" | 2 } を受け付ける。 */
export const parseTemplateRef = (arg: unknown): TemplateRef | undefined => {
  if (typeof arg === 'string') return arg.trim() ? { name: arg.trim() } : undefined;
  if (typeof arg === 'number') return Number.isInteger(arg) && arg >= 1 ? { index: arg } : undefined;
  if (arg && typeof arg === 'object') {
    const o = arg as Record<string, unknown>;
    return parseTemplateRef(o.template ?? o.name ?? o.index);
  }
  return undefined;
};

export const findTemplate = (templates: TaskTemplate[], ref: TemplateRef): TaskTemplate | undefined =>
  ref.name !== undefined ? templates.find((t) => t.name === ref.name) : ref.index !== undefined ? templates[ref.index - 1] : undefined;

// ---------------------------------------------------------------- 本文の準備

const UNCHECKED = /^\s*[-+*]\s*\[ \]/;
const CHECKBOX = /^\s*[-+*]\s*\[[ xX]\]/;

/** 打刻が有効なら、各未完了タスク行の末尾に (@created: now) を付ける(既にあれば付けない)。 */
export const prepareBody = (t: TaskTemplate, settings: Pick<TplSettings, 'enableTimestamps' | 'timestampFormat'>, now: Date): string[] => {
  if (!settings.enableTimestamps) return [...t.body];
  const stamp = stampSuffix({ created: formatTimestamp(now, settings.timestampFormat) });
  return t.body.map((l) => (UNCHECKED.test(l) && !l.includes('(@created:') ? l + stamp : l));
};

// ---------------------------------------------------------------- スニペット展開(エディタが見えないときのフォールバック)

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * VS Code スニペット構文を「既定値で」平文に展開する。
 * 対応: $n ${n} ${n:既定値}(入れ子可) ${n|a,b|}(先頭) $VAR ${VAR} ${VAR:既定値} と \$ \} \\ のエスケープ。
 * 変数は CURRENT_YEAR / _YEAR_SHORT / _MONTH / _DATE / _HOUR / _MINUTE / _SECOND。未知の変数は名前を出力(VS Code と同じ)。
 * ${VAR/regex/format/} の変換は未対応(変数の値だけ出力)。
 */
export const expandSnippet = (src: string, now: Date): string => {
  const vars: Record<string, string> = {
    CURRENT_YEAR: String(now.getFullYear()),
    CURRENT_YEAR_SHORT: pad(now.getFullYear() % 100),
    CURRENT_MONTH: pad(now.getMonth() + 1),
    CURRENT_DATE: pad(now.getDate()),
    CURRENT_HOUR: pad(now.getHours()),
    CURRENT_MINUTE: pad(now.getMinutes()),
    CURRENT_SECOND: pad(now.getSeconds()),
  };
  const variable = (name: string) => (name in vars ? vars[name] : name);
  let i = 0;

  const skipToBrace = () => {
    let depth = 1;
    while (i < src.length && depth > 0) {
      const c = src[i++];
      if (c === '\\') i++;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
    }
  };

  const parseSeq = (untilBrace: boolean): string => {
    let out = '';
    while (i < src.length) {
      const c = src[i];
      if (untilBrace && c === '}') return out;
      if (c === '\\') {
        const n = src[i + 1];
        if (n === '$' || n === '}' || n === '\\') { out += n; i += 2; } else { out += '\\'; i++; }
      } else if (c === '$') out += parseDollar();
      else { out += c; i++; }
    }
    return out;
  };

  const closeBrace = () => { if (src[i] === '}') i++; };

  const parseDollar = (): string => {
    const rest = src.slice(i + 1);
    let m: RegExpExecArray | null;
    if ((m = /^\d+/.exec(rest))) { i += 1 + m[0].length; return ''; }
    if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) { i += 1 + m[0].length; return variable(m[0]); }
    if (rest[0] !== '{') { i++; return '$'; }

    i += 2; // "${"
    const tail = () => src.slice(i);
    if ((m = /^\d+/.exec(tail()))) {
      i += m[0].length;
      if (src[i] === '}') { i++; return ''; }
      if (src[i] === ':') { i++; const v = parseSeq(true); closeBrace(); return v; }
      if (src[i] === '|') {
        i++;
        const end = src.indexOf('|}', i);
        if (end < 0) { i = src.length; return ''; }
        const first = src.slice(i, end).split(',')[0];
        i = end + 2;
        return first;
      }
      skipToBrace();
      return '';
    }
    if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(tail()))) {
      const name = m[0];
      i += name.length;
      if (src[i] === '}') { i++; return variable(name); }
      if (src[i] === ':') {
        i++;
        const def = parseSeq(true);
        closeBrace();
        return name in vars ? vars[name] : def !== '' ? def : name;
      }
      skipToBrace();
      return variable(name);
    }
    return '${'; // 壊れた構文はそのまま出す
  };

  return parseSeq(false);
};

// ---------------------------------------------------------------- 挿入位置

export interface InsertionPlan {
  /** content 内の挿入オフセット */
  offset: number;
  /** 挿入の基準にした行(現在のタスク行 or 最後のタスク行)。無ければ null(= 末尾に追加) */
  anchorLine: number | null;
  /** 基準行のインデント */
  indent: string;
  /** true: カーソルが空行(空白のみの行)にあり、その位置へ改行なしで挿入する */
  inline?: boolean;
}

/** エディタのカーソル位置(0 始まり)。 */
export interface CursorPosition {
  line: number;
  character: number;
}

/**
 * 挿入位置の決定:
 *  1. 現在のタスク(最初の未完了・見積りあり)の行末
 *  2. 現在のタスクが無ければ、最後のチェックボックス行の行末
 *  3. タスクが全く無ければ、ファイル末尾
 *
 * cursor を渡した場合はそちらを優先する(カーソル位置への挿入):
 *  - カーソル行が空行(空白のみ): その位置にそのまま挿入(inline)
 *  - それ以外: カーソル行の行末に改行して挿入(行の途中は割らない)
 */
export const planInsertion = (content: string, settings: TplSettings, cursor?: CursorPosition): InsertionPlan => {
  if (cursor && Number.isInteger(cursor.line) && cursor.line >= 0) {
    const rows = content.split('\n');
    // YAML front matter 内のカーソルは無視する(挿入すると壊れるため、従来どおり現在のタスクの次の行へ)
    let fmEnd = -1;
    if (rows[0].replace(/\r$/, '') === '---') {
      for (let i = 1; i < rows.length; i++) if (rows[i].replace(/\r$/, '') === '---') { fmEnd = i; break; }
    }
    if (cursor.line < rows.length && cursor.line > fmEnd) {
      const line = rows[cursor.line].replace(/\r$/, '');
      let start = 0;
      for (let i = 0; i < cursor.line; i++) start += rows[i].length + 1;
      const indent = /^[ \t]*/.exec(line)![0];
      if (line.trim() === '') {
        const col = Math.min(Math.max(cursor.character, 0), line.length);
        return { offset: start + col, anchorLine: cursor.line, indent, inline: true };
      }
      return { offset: start + line.length, anchorLine: cursor.line, indent };
    }
  }
  const current = findCurrentTaskLine(content, settings);
  let anchor: number | null = current ? current.index : null;
  const parts = content.split('\n');
  if (anchor === null) {
    for (let i = parts.length - 1; i >= 0; i--) if (CHECKBOX.test(parts[i])) { anchor = i; break; }
  }
  if (anchor === null) return { offset: content.length, anchorLine: null, indent: '' };

  let offset = 0;
  for (let i = 0; i < anchor; i++) offset += parts[i].length + 1;
  const line = parts[anchor];
  offset += line.endsWith('\r') ? line.length - 1 : line.length;
  return { offset, anchorLine: anchor, indent: /^[ \t]*/.exec(line)![0] };
};

export type InsertMode = 'snippet' | 'plain';

/**
 * 挿入するテキストと位置を作る。
 *  - snippet: VS Code の insertSnippet に渡す(改行は \n。インデントは VS Code が基準行に合わせる)
 *  - plain:   スニペットを既定値で展開し、基準行のインデントと文書の改行コードで組み立てる
 */
export const buildInsertion = (
  content: string,
  settings: TplSettings,
  lines: string[],
  mode: InsertMode,
  now: Date,
  cursor?: CursorPosition
): { offset: number; text: string; plan: InsertionPlan } => {
  const plan = planInsertion(content, settings, cursor);
  const eol = mode === 'plain' ? detectEol(content) : '\n';
  const body = mode === 'plain' ? lines.map((l) => expandSnippet(l, now)) : lines;

  let text: string;
  if (plan.inline) {
    text = (mode === 'plain' ? body.map((l, i) => (i === 0 ? l : plan.indent + l)) : body).join(eol);
  } else if (plan.anchorLine !== null) {
    text = eol + (mode === 'plain' ? body.map((l) => plan.indent + l) : body).join(eol);
  } else if (content === '') {
    text = body.join(eol);
  } else if (content.endsWith('\n')) {
    text = body.join(eol) + eol;
  } else {
    text = eol + body.join(eol);
  }
  return { offset: plan.offset, text, plan };
};
