import React, { useEffect } from 'react';
import { post } from '../vscodeApi';

type Props = { duration: number; estimate: number; enableOverdueNotice: boolean };

export const ProgressBar = ({ duration, estimate, enableOverdueNotice }: Props) => {
  const width = estimate > 0 ? Math.min((duration / estimate) * 100, 100) : 0;
  const isOverdue = estimate > 0 && width === 100;

  // 元実装の Notice('Are you finished?') はホスト側の通知に委譲する。変化時のみ送る。
  useEffect(() => {
    if (!enableOverdueNotice) return;
    post({ type: 'notify', kind: 'overdue', active: isOverdue });
  }, [isOverdue, enableOverdueNotice]);

  return (
    <div className="dt-progress-bar-container" role="progressbar" aria-valuenow={Math.round(width)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={`dt-progress-bar ${isOverdue ? 'dt-progress-bar-overdue' : ''}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
};
