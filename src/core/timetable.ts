import type { Task } from './TaskParser';
import type { DynamicTimetableSettings } from './types';
import {
  convertHexToHSLA,
  getHSLAColorForCategory,
  getRandomHSLAColor,
} from './ColorUtils';

/** Webview が必要とする設定のサブセット */
export type ViewSettings = Pick<
  DynamicTimetableSettings,
  | 'showEstimate'
  | 'showStartTime'
  | 'showBufferTime'
  | 'showProgressBar'
  | 'showCompletedTasks'
  | 'showRemainingTime'
  | 'applyBackgroundColorByCategory'
  | 'headerNames'
  | 'categoryColors'
  | 'categoryTransparency'
  | 'intervalTime'
  | 'enableOverdueNotice'
>;

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  showEstimate: true,
  showStartTime: true,
  showBufferTime: true,
  showProgressBar: true,
  showCompletedTasks: true,
  showRemainingTime: false,
  applyBackgroundColorByCategory: true,
  headerNames: ['Tasks', 'Estimate', 'Start', 'End'],
  categoryColors: [],
  categoryTransparency: 0.3,
  intervalTime: 1,
  enableOverdueNotice: true,
};

export const formatDateToTime = (date: Date): string =>
  `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}`;

export const formatToHHMMSS = (seconds: number): string => {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

/** 元実装は負値で "-1h-5min" のようになるため、符号を先頭にまとめる */
export const formatBufferTime = (minutes: number | null): string => {
  if (minutes === null) return '0h0min';
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(minutes);
  return `${sign}${Math.floor(abs / 60)}h${abs % 60}min`;
};

export const calculateBufferTime = (
  prevEnd: Date | null,
  start: Date | null,
  index: number
): number | null => {
  if (index === 0) return 0;
  if (prevEnd && start) {
    return Math.ceil((start.getTime() - prevEnd.getTime()) / 60000);
  }
  return null;
};

export const getBufferClass = (o: {
  task: Task;
  bufferTime: number | null;
  isCurrent: boolean;
  estimateMs: number;
  durationMs: number;
}): '' | 'on-time' | 'late' => {
  const { task, bufferTime, isCurrent, estimateMs, durationMs } = o;
  const remaining = estimateMs - durationMs;
  if (
    (task.originalStartTime &&
      bufferTime !== null &&
      bufferTime >= 0 &&
      !task.isCompleted) ||
    (remaining >= 0 && isCurrent)
  ) {
    return 'on-time';
  }
  if (
    (bufferTime !== null && bufferTime < 0 && !task.isCompleted) ||
    (remaining < 0 && isCurrent)
  ) {
    return 'late';
  }
  return '';
};

/** hsla(...) の alpha を差し替える。hsla 以外の文字列はそのまま返す。 */
export const setAlpha = (color: string, alpha: number): string =>
  color.replace(/^(hsla\([^)]*),\s*[^,)]+\)\s*$/, `$1, ${alpha})`);

/** 完了済み行の背景を薄くする(元実装: alpha を 0.05 に置換) */
export const fadeColor = (hsla: string): string => setAlpha(hsla, 0.05);

/**
 * カテゴリ→背景色。設定色があればそれを、既存色があれば alpha のみ更新、
 * なければ既存色相から最も離れた色相をランダムに割り当てる。
 */
export const computeCategoryColors = (
  tasks: Task[],
  settings: Pick<ViewSettings, 'categoryColors' | 'categoryTransparency'>,
  previous: Record<string, string> = {}
): Record<string, string> => {
  const next: Record<string, string> = { ...previous };
  Object.keys(next).forEach((c) => {
    if (!tasks.some((t) => t.categories.includes(c))) delete next[c];
  });
  const hues: number[] = [];
  const alpha = settings.categoryTransparency;

  tasks.forEach((task) =>
    task.categories.forEach((category) => {
      const configured = settings.categoryColors?.find(
        (c) => c.category === category
      )?.color;
      let color: string;
      if (configured) color = convertHexToHSLA(configured, alpha);
      else if (!next[category]) color = getRandomHSLAColor(alpha, hues);
      else color = getHSLAColorForCategory(category, alpha, next);

      const m = color.match(/hsla\((\d+),/);
      if (m) hues.push(parseInt(m[1], 10));
      next[category] = color;
    })
  );
  return next;
};

export interface RowModel {
  key: string;
  kind: 'task' | 'buffer';
  task?: Task;
  bufferTime: number | null;
  isCurrent: boolean;
}

/** 表示行(タスク行+バッファ行)を組み立てる。元 TimetableViewComponent の flatMap 相当。 */
export const buildRows = (
  tasks: Task[],
  settings: Pick<ViewSettings, 'showCompletedTasks' | 'showBufferTime'>,
  now: Date = new Date()
): RowModel[] => {
  const firstUncompleted = tasks.find((t) => !t.isCompleted);
  const visible = settings.showCompletedTasks
    ? tasks
    : tasks.filter((t) => !t.isCompleted);

  return visible.flatMap((task, index, all) => {
    const prev = all[index - 1];
    const bufferTime = calculateBufferTime(
      prev?.endTime || now,
      task.startTime,
      index
    );
    const rows: RowModel[] = [];
    if (
      bufferTime &&
      settings.showBufferTime &&
      task !== firstUncompleted &&
      !task.isCompleted
    ) {
      rows.push({ key: `buffer-${index}`, kind: 'buffer', bufferTime, isCurrent: false });
    }
    rows.push({
      key: `task-${index}`,
      kind: 'task',
      task,
      bufferTime,
      isCurrent: task === firstUncompleted,
    });
    return rows;
  });
};

/** 開始時刻が遅れそうなタスクがあるか(元実装の警告 Notice 条件) */
export const hasLateStart = (tasks: Task[], rows: RowModel[]): boolean =>
  rows.some(
    (r) =>
      r.kind === 'task' &&
      r.task!.originalStartTime &&
      r.bufferTime !== null &&
      r.bufferTime < 0 &&
      !r.task!.isCompleted
  );

/** 現在タスクの経過・見積(ms)。日付またぎ(開始が未来)は経過 0 とする。 */
export const computeProgress = (
  tasks: Task[],
  now: Date = new Date()
): { durationMs: number; estimateMs: number } => {
  const cur = tasks.find((t) => !t.isCompleted);
  if (!cur || !cur.startTime || !cur.estimate) {
    return { durationMs: 0, estimateMs: 0 };
  }
  return {
    durationMs: Math.max(0, now.getTime() - cur.startTime.getTime()),
    estimateMs: parseFloat(cur.estimate) * 60000,
  };
};
