import React from 'react';
import type { Task } from '../../core/TaskParser';
import {
  ViewSettings,
  fadeColor,
  formatDateToTime,
  formatToHHMMSS,
  getBufferClass,
} from '../../core/timetable';

type Props = {
  task: Task;
  settings: ViewSettings;
  bufferTime: number | null;
  isCurrent: boolean;
  rowRef?: React.Ref<HTMLTableRowElement>;
  categoryColors: Record<string, string>;
  allTasksCompleted: boolean;
  durationMs: number;
  estimateMs: number;
};

export const TaskRow = ({
  task, settings, bufferTime, isCurrent, rowRef,
  categoryColors, allTasksCompleted, durationMs, estimateMs,
}: Props) => {
  const bufferClass = getBufferClass({ task, bufferTime, isCurrent, estimateMs, durationMs });
  const faded = task.isCompleted && !allTasksCompleted;
  const categoryClasses = task.categories.map((c) => `dt-category-${c}`).join(' ');

  const base = categoryColors[task.categories[0]] || '';
  const bg = faded && base ? fadeColor(base) : base;
  const style = settings.applyBackgroundColorByCategory && bg ? { backgroundColor: bg } : {};

  const showRemaining = settings.showRemainingTime && isCurrent;
  const remainingSeconds = Math.floor((estimateMs - durationMs) / 1000);

  return (
    <tr
      ref={rowRef}
      className={`dt-task-row ${bufferClass} ${faded ? 'dt-completed' : ''} ${categoryClasses}`}
      style={style}
    >
      <td>{task.task}</td>
      {settings.showEstimate && !showRemaining && (
        <td style={{ textAlign: 'center' }}>{task.estimate}</td>
      )}
      {settings.showStartTime && !showRemaining && (
        <td style={{ textAlign: 'center' }}>{task.startTime ? formatDateToTime(task.startTime) : ''}</td>
      )}
      {!showRemaining && (
        <td style={{ textAlign: 'center' }}>{task.endTime ? formatDateToTime(task.endTime) : ''}</td>
      )}
      {showRemaining && (
        <td colSpan={3} style={{ textAlign: 'center' }}>
          {remainingSeconds < 0 ? '-' : ''}
          {formatToHHMMSS(Math.abs(remainingSeconds))}
        </td>
      )}
    </tr>
  );
};
