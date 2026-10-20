import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildRows, computeProgress, hasLateStart } from '../../core/timetable';
import { ButtonContainer } from '../components/ButtonContainer';
import { ProgressBar } from '../components/ProgressBar';
import { BufferTimeRow } from '../components/BufferTimeRow';
import { TaskRow } from '../components/TaskRow';
import { post } from '../vscodeApi';
import { useHostState } from '../useHostState';

export const App = () => {
  const { tasks, settings, colors, warnings } = useHostState();
  const [now, setNow] = useState(() => new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLTableRowElement>(null);

  // 経過時間の更新
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), Math.max(0.2, settings.intervalTime) * 1000);
    return () => clearInterval(id);
  }, [settings.intervalTime]);

  const rows = useMemo(() => buildRows(tasks, settings, now), [tasks, settings, now]);
  const { durationMs, estimateMs } = useMemo(() => computeProgress(tasks, now), [tasks, now]);
  const allCompleted = tasks.length > 0 && tasks.every((t) => t.isCompleted);
  const lateStart = useMemo(() => hasLateStart(tasks, rows), [tasks, rows]);

  // 「開始が遅れそう」警告はホストへ(変化時のみ)
  useEffect(() => {
    post({ type: 'notify', kind: 'lateStart', active: lateStart });
  }, [lateStart]);

  // 現在タスクへスクロール(タスク列が変わった時)
  const currentKey = tasks.find((t) => !t.isCompleted)?.originalTaskName;
  useEffect(() => {
    const c = containerRef.current, r = currentRef.current;
    if (c && r) c.scrollTo({ top: r.offsetTop - c.offsetHeight / 5, behavior: 'smooth' });
  }, [currentKey]);

  return (
    <div ref={containerRef} className="Timetable dt-content">
      {warnings.length > 0 && (
        <div className="dt-warning" role="alert">{warnings.join(' / ')}</div>
      )}
      {settings.showProgressBar && (
        <ProgressBar duration={durationMs} estimate={estimateMs} enableOverdueNotice={settings.enableOverdueNotice} />
      )}
      <ButtonContainer />
      {tasks.length === 0 ? (
        <p className="dt-empty">No tasks found. Add lines like <code>- [ ] Task ; 30</code> to a Markdown file.</p>
      ) : (
        <table className="dt-table">
          <thead>
            <tr>
              <th>{settings.headerNames[0]}</th>
              {settings.showEstimate && <th>{settings.headerNames[1]}</th>}
              {settings.showStartTime && <th>{settings.headerNames[2]}</th>}
              <th>{settings.headerNames[3]}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) =>
              r.kind === 'buffer' ? (
                <BufferTimeRow key={r.key} bufferTime={r.bufferTime} />
              ) : (
                <TaskRow
                  key={r.key}
                  task={r.task!}
                  settings={settings}
                  bufferTime={r.bufferTime}
                  isCurrent={r.isCurrent}
                  rowRef={r.isCurrent ? currentRef : undefined}
                  categoryColors={colors}
                  allTasksCompleted={allCompleted}
                  durationMs={durationMs}
                  estimateMs={estimateMs}
                />
              )
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};
