import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);

// Webview コンポーネントを一時ディレクトリにバンドルし、react-dom/server で描画して中身を確認する。
let R;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dt-render-'));
  const entry = join(dir, 'entry.tsx');
  writeFileSync(entry, `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { TaskRow } from '${process.cwd()}/src/webview/components/TaskRow';
    import { computeStatistics } from '${process.cwd()}/src/core/statistics';
    export { React, renderToStaticMarkup, TaskRow, computeStatistics };
  `);
  const out = join(dir, 'out.cjs');
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile: out, jsx: 'transform', logLevel: 'silent', nodePaths: [join(process.cwd(), 'node_modules')] });
  R = require(out);
});

const task = (o = {}) => ({ originalTaskName: 'A', task: 'A', startTime: null, endTime: null, estimate: '140', isCompleted: true, originalStartTime: true, categories: [], plannedMinutes: 120, ...o });
const settings = { showEstimate: true, showStartTime: true, showBufferTime: true, showProgressBar: true, showCompletedTasks: true, showRemainingTime: false, applyBackgroundColorByCategory: false, headerNames: ['T', 'E', 'S', 'N'], categoryColors: [], categoryTransparency: 0.3, intervalTime: 0, enableOverdueNotice: false };
const row = (t) => R.renderToStaticMarkup(R.React.createElement('table', null, R.React.createElement('tbody', null,
  R.React.createElement(R.TaskRow, { task: t, settings, bufferTime: null, isCurrent: false, categoryColors: {}, allTasksCompleted: false, durationMs: 0, estimateMs: 0 }))));

describe('Timetable row (completed)', () => {
  test('actual is shown as 2h20m with an over-budget variance badge and an explanatory tooltip', () => {
    const html = row(task());
    assert.match(html, />2h20m</);
    assert.match(html, /dt-variance dt-variance-over">\+20m</);
    assert.match(html, /title="Estimated 2h, actual 2h20m \(\+20m\)"/);
  });
  test('under budget uses the "under" class and a minus sign', () => {
    const html = row(task({ estimate: '50', plannedMinutes: 60 }));
    assert.match(html, /dt-variance dt-variance-under">-10m</);
  });
  test('exact = ±0m with no color class', () => {
    assert.match(row(task({ estimate: '60', plannedMinutes: 60 })), /dt-variance ">±0m</);
  });
  test('legacy completed row (no est) shows the formatted time and NO badge', () => {
    const html = row(task({ estimate: '25', plannedMinutes: null }));
    assert.match(html, />25m</); assert.ok(!html.includes('dt-variance'));
  });
  test('an uncompleted row is untouched: raw estimate, no badge', () => {
    const html = row(task({ isCompleted: false, estimate: '90', plannedMinutes: null }));
    assert.match(html, />90</); assert.ok(!html.includes('dt-variance'));
  });
});
