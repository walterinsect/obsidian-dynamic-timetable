/** タスクの集計(ステータスバー用)。vscode に依存しない。 */
export interface ProgressSummary {
  /** 認識されているタスク数 */
  total: number;
  /** 完了済みのタスク数 */
  done: number;
  /** 完了率(%・四捨五入した整数)。タスクが無いときは null */
  percent: number | null;
}

export const summarizeTasks = (tasks: ReadonlyArray<{ isCompleted: boolean }>): ProgressSummary => {
  const total = tasks.length;
  const done = tasks.filter((t) => t.isCompleted).length;
  return { total, done, percent: total === 0 ? null : Math.round((done / total) * 100) };
};

export const formatProgressText = (s: ProgressSummary): string =>
  s.percent === null ? '$(checklist) No tasks' : `$(checklist) ${s.done}/${s.total} (${s.percent}%)`;

export const formatProgressTooltip = (s: ProgressSummary, file?: string): string => {
  const head = 'Dynamic Timetable: task progress';
  const body = s.percent === null ? 'No tasks recognized' : `Tasks: ${s.total} · Completed: ${s.done} · Not completed: ${s.total - s.done} · Completion: ${s.percent}%`;
  return [head, body, file ? `File: ${file}` : undefined, 'Click to show the timetable'].filter(Boolean).join('\n');
};
