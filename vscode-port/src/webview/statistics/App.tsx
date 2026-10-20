import React, { useMemo } from 'react';
import { barPercent, computeStatistics, formatMinutes } from '../../core/statistics';
import { setAlpha } from '../../core/timetable';
import { useHostState } from '../useHostState';

const FALLBACK = 'var(--vscode-charts-blue, #3794ff)';

export const App = () => {
  const { tasks, colors, warnings } = useHostState();
  const stats = useMemo(() => computeStatistics(tasks), [tasks]);

  return (
    <div className="st-root">
      {warnings.length > 0 && <div className="dt-warning" role="alert">{warnings.join(' / ')}</div>}

      <div className="st-legend" aria-hidden="true">
        <span><i className="st-swatch st-swatch-actual" /> Actual</span>
        <span><i className="st-swatch st-swatch-est" /> Estimated (remaining)</span>
      </div>

      {stats.rows.length === 0 ? (
        <p className="dt-empty">No categorized tasks. Add tags like <code>#work</code> to your tasks.</p>
      ) : (
        <div className="st-chart" role="list">
          {stats.rows.map((r) => {
            const base = colors[r.category];
            const solid = base ? setAlpha(base, 1) : FALLBACK;
            const faded = base ? setAlpha(base, 0.3) : FALLBACK;
            const label = `${r.category}: ${formatMinutes(r.actual)} done, ${formatMinutes(r.estimated)} remaining`;
            return (
              <div className="st-row" role="listitem" aria-label={label} title={label} key={r.category}>
                <div className="st-label">{r.category}</div>
                <div className="st-track">
                  <div className="st-bar" style={{ width: `${barPercent(r.total, stats.max)}%` }}>
                    {r.actual > 0 && <span className="st-seg" style={{ flexGrow: r.actual, background: solid }} />}
                    {r.estimated > 0 && (
                      <span className="st-seg st-seg-est" style={{ flexGrow: r.estimated, background: faded, borderColor: solid }} />
                    )}
                  </div>
                </div>
                <div className="st-value">{formatMinutes(r.actual)} / {formatMinutes(r.estimated)}</div>
              </div>
            );
          })}
        </div>
      )}

      {stats.rows.length > 0 && (
        <div className="st-total">
          Total: {formatMinutes(stats.totals.actual)} done · {formatMinutes(stats.totals.estimated)} remaining
          {stats.uncategorized > 0 && <> · {stats.uncategorized} uncategorized task{stats.uncategorized > 1 ? 's' : ''} not counted</>}
        </div>
      )}
    </div>
  );
};
