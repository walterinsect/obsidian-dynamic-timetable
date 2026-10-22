import type { Task } from './TaskParser';

/** postMessage を通すと Date は文字列になるため、境界では ISO 文字列で扱う。 */
export interface TaskDTO extends Omit<Task, 'startTime' | 'endTime'> {
  startTime: string | null;
  endTime: string | null;
}

export const toDTO = (t: Task): TaskDTO => ({
  ...t,
  startTime: t.startTime ? t.startTime.toISOString() : null,
  endTime: t.endTime ? t.endTime.toISOString() : null,
});

const reviveDate = (v: string | null): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

export const fromDTO = (t: TaskDTO): Task => ({
  ...t,
  startTime: reviveDate(t.startTime),
  endTime: reviveDate(t.endTime),
});
