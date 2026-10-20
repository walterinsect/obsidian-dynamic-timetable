import type { Task } from './TaskParser';

export interface CategoryPerformance {
  estimatedTime: number; // 未完了タスクの見積り合計(分)
  actualTime: number; // 完了タスクの所要合計(分)
}

/** カテゴリ別の実績/残り。カテゴリが複数付いたタスクは各カテゴリに計上する。 */
export const categoryPerformance = (tasks: Task[]): Record<string, CategoryPerformance> => {
  const out: Record<string, CategoryPerformance> = {};
  for (const task of tasks) {
    const estimate = parseFloat(task.estimate || '0') || 0;
    for (const category of task.categories) {
      const p = (out[category] ??= { estimatedTime: 0, actualTime: 0 });
      if (task.isCompleted) p.actualTime += estimate;
      else p.estimatedTime += estimate;
    }
  }
  return out;
};

export interface CategoryStat {
  category: string;
  actual: number;
  estimated: number;
  total: number;
}

export interface Statistics {
  rows: CategoryStat[]; // total 降順、同値はカテゴリ名順(表示を安定させる)
  max: number; // 棒の長さの基準(最大 total)
  totals: { actual: number; estimated: number };
  uncategorized: number; // カテゴリ無しタスク数(集計対象外)
}

export const computeStatistics = (tasks: Task[]): Statistics => {
  const perf = categoryPerformance(tasks);
  const rows = Object.entries(perf)
    .map(([category, p]) => ({
      category,
      actual: p.actualTime,
      estimated: p.estimatedTime,
      total: p.actualTime + p.estimatedTime,
    }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));

  return {
    rows,
    max: rows.reduce((m, r) => Math.max(m, r.total), 0),
    totals: {
      actual: rows.reduce((s, r) => s + r.actual, 0),
      estimated: rows.reduce((s, r) => s + r.estimated, 0),
    },
    uncategorized: tasks.filter((t) => t.categories.length === 0).length,
  };
};

/** 分 → "45m" / "1h30m" / "1.5m"(小数は1桁まで) */
export const formatMinutes = (minutes: number): string => {
  const m = Math.round(Math.max(0, minutes) * 10) / 10;
  const h = Math.floor(m / 60);
  const rem = Math.round((m - h * 60) * 10) / 10;
  return h > 0 ? `${h}h${rem}m` : `${rem}m`;
};

/** 棒の幅(%)。max が 0 なら 0。 */
export const barPercent = (value: number, max: number): number =>
  max > 0 ? Math.min(100, (value / max) * 100) : 0;
