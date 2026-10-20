import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const DD = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const require = createRequire(import.meta.url);
const { DEFAULT_SETTINGS, sanitizeSettings } = require('../out/core/defaults.js');
const { minimalEdit, applyEdit } = require('../out/core/minimalEdit.js');
const { TaskManager } = require('../out/host/TaskManager.js');
const { renderWebviewHtml } = require('../out/host/html.js');

/** 偽 DocumentPort: 書き込み回数と履歴を記録する */
const fakePort = (text, mtime = (() => { const d = new Date(); d.setHours(9, 0, 0, 0); return d.getTime(); })()) => {
  const p = { text, writes: 0, history: [], getText: () => p.text, getMtimeMs: async () => mtime,
    replaceAll: async (t) => { await new Promise((r) => setTimeout(r, 5)); p.text = t; p.writes++; p.history.push(t); } };
  return p;
};
const S = () => ({ ...DEFAULT_SETTINGS, showStartTimeInTaskName: true });
const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; }; // 今日基準(固定日付だと実行日・TZ で壊れる)

describe('sanitizeSettings', () => {
  test('empty input → defaults', () => assert.deepEqual(sanitizeSettings({}), DEFAULT_SETTINGS));
  test('valid values pass through', () => {
    const r = sanitizeSettings({ showEstimate: true, intervalTime: 5, taskEstimateDelimiter: '|', categoryTransparency: 0.5 });
    assert.equal(r.showEstimate, true); assert.equal(r.intervalTime, 5);
    assert.equal(r.taskEstimateDelimiter, '|'); assert.equal(r.categoryTransparency, 0.5);
  });
  test('wrong types / out-of-range fall back to defaults', () => {
    const r = sanitizeSettings({ showEstimate: 'yes', intervalTime: -1, categoryTransparency: 7, taskEstimateDelimiter: '', headerNames: ['a'] });
    assert.equal(r.showEstimate, DEFAULT_SETTINGS.showEstimate);
    assert.equal(r.intervalTime, 1); assert.equal(r.categoryTransparency, 0.3);
    assert.equal(r.taskEstimateDelimiter, ';'); assert.deepEqual(r.headerNames, DEFAULT_SETTINGS.headerNames);
  });
  test('NaN / Infinity rejected', () => {
    assert.equal(sanitizeSettings({ intervalTime: NaN }).intervalTime, 1);
    assert.equal(sanitizeSettings({ intervalTime: Infinity }).intervalTime, 1);
  });
  test('delimiters are cut to 1 char', () => assert.equal(sanitizeSettings({ taskEstimateDelimiter: ';;;' }).taskEstimateDelimiter, ';'));
  test('categoryColors: invalid entries dropped', () => {
    const r = sanitizeSettings({ categoryColors: [{ category: 'a', color: '#ff0000' }, { category: 'b', color: 'red' }, { category: '', color: '#000000' }, null, 5] });
    assert.deepEqual(r.categoryColors, [{ category: 'a', color: '#ff0000' }]);
  });
});

describe('minimalEdit', () => {
  test('identical → null', () => assert.equal(minimalEdit('abc', 'abc'), null));
  test('single changed line only', () => {
    const o = 'a\nb\nc\nd', n = 'a\nB!\nc\nd';
    const e = minimalEdit(o, n);
    assert.equal(applyEdit(o, e), n);
    assert.ok(e.end - e.start <= 1 && e.text.length <= 2, JSON.stringify(e));
  });
  test('pure insertion / deletion', () => {
    assert.equal(applyEdit('ab', minimalEdit('ab', 'aXb')), 'aXb');
    assert.equal(applyEdit('aXb', minimalEdit('aXb', 'ab')), 'ab');
  });
  test('does not split surrogate pairs', () => {
    const o = 'x😀y', n = 'x😁y'; // 同じ high surrogate, 異なる low surrogate
    const e = minimalEdit(o, n);
    assert.equal(applyEdit(o, e), n);
    assert.equal(e.start, 1); assert.equal(e.end, 3);
  });
  test('property: apply(old, edit(old,new)) === new for random strings', () => {
    const alpha = ['a', 'b', '\n', ' ', '日', '本', '😀', '😁', '-', '[', 'x'];
    let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const gen = () => Array.from({ length: Math.floor(rnd() * 14) }, () => alpha[Math.floor(rnd() * alpha.length)]).join('');
    for (let i = 0; i < 3000; i++) {
      const o = gen(), n = rnd() < 0.5 ? gen() : o.slice(0, 3) + gen() + o.slice(-3);
      assert.equal(applyEdit(o, minimalEdit(o, n)), n, JSON.stringify([o, n]));
    }
  });
});

describe('TaskManager', () => {
  test('loadTasks: no startTime → file mtime is the start and the whole chain gets times', async () => {
    const tm = new TaskManager(S);
    const { tasks } = await tm.loadTasks(fakePort('- [ ] A ; 30\n- [ ] B ; 15'));
    assert.deepEqual(tasks.map((t) => [t.startTime.getHours(), t.startTime.getMinutes()]), [[9, 0], [9, 30]]);
    assert.equal(tasks[1].endTime.getMinutes(), 45);
  });
  test('loadTasks does not modify the document', async () => {
    const port = fakePort('- [ ] A ; 30');
    await new TaskManager(S).loadTasks(port);
    assert.equal(port.writes, 0); assert.equal(port.text, '- [ ] A ; 30');
  });
  test('loadTasks surfaces regex warnings', async () => {
    const tm = new TaskManager(() => ({ ...S(), dateDelimiter: '[' }));
    const r = await tm.loadTasks(fakePort('- [ ] A ; 30'));
    assert.equal(r.warnings.length, 1);
  });
  test('complete: ONE write, elapsed measured from mtime fallback when no YAML', async () => {
    const port = fakePort('- [ ] A ; 30');
    const r = await new TaskManager(S, () => at(9, 20)).complete(port);
    assert.equal(port.writes, 1);
    assert.equal(r.elapsedMinutes, 20);
    assert.ok(port.text.includes('- [x] A ; 20 @ ' + DD + ' 09:00'), port.text);
    assert.ok(port.text.startsWith('---\nstartTime: 09:20:00\n---\n'));
  });
  test('complete: nothing to do → no write', async () => {
    const port = fakePort('# notes only');
    const r = await new TaskManager(S, () => at(9, 20)).complete(port);
    assert.equal(r.completed, null); assert.equal(port.writes, 0); assert.equal(port.text, '# notes only');
  });
  test('rapid double-click completes two DIFFERENT tasks (serialized)', async () => {
    const port = fakePort('---\nstartTime: 09:00:00\n---\n- [ ] A ; 10\n- [ ] B ; 10\n- [ ] C ; 10');
    const tm = new TaskManager(S, () => at(9, 10));
    const [r1, r2] = await Promise.all([tm.complete(port), tm.complete(port)]);
    assert.equal(r1.completed.originalTaskName, 'A');
    assert.equal(r2.completed.originalTaskName, 'B');
    assert.equal(port.writes, 2);
    assert.ok(port.text.includes('- [ ] C ; 10'));
  });
  test('a failing write does not wedge the queue', async () => {
    const port = fakePort('- [ ] A ; 10\n- [ ] B ; 10');
    let fail = true; const orig = port.replaceAll;
    port.replaceAll = async (t) => { if (fail) { fail = false; throw new Error('boom'); } return orig(t); };
    const tm = new TaskManager(S, () => at(9, 5));
    await assert.rejects(tm.complete(port), /boom/);
    const r = await tm.complete(port);
    assert.equal(r.completed.originalTaskName, 'A');
  });
  test('interrupt: splits current task', async () => {
    const port = fakePort('---\nstartTime: 09:00:00\n---\n- [ ] Deep ; 60 #w');
    const r = await new TaskManager(S, () => at(9, 20)).interrupt(port);
    assert.equal(r.remainingMinutes, 40);
    assert.ok(port.text.includes('- [x] Deep ; 20 @ ' + DD + ' 09:00 #w (@done: ' + DD + ' 09:20)\n- [ ] Deep ; 40 #w (@created: ' + DD + ' 09:20)'), port.text);
  });
});

describe('renderWebviewHtml', () => {
  const html = renderWebviewHtml({ cspSource: 'https://x.vscode-cdn.net', nonce: 'N0NCE', scriptUri: 'https://x/a.js', styleUris: ['https://x/a.css'] });
  test('strict CSP: no unsafe-inline / unsafe-eval, default-src none', () => {
    const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
    assert.match(csp, /default-src 'none'/);
    assert.doesNotMatch(csp, /unsafe-/);
    assert.match(csp, /script-src 'nonce-N0NCE'/);
  });
  test('only the nonce-bearing external script is present (no inline script)', () => {
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    assert.equal(scripts.length, 1);
    assert.match(scripts[0], /nonce="N0NCE"/);
  });
  test('URIs are attribute-escaped', () => {
    const h = renderWebviewHtml({ cspSource: 'c', nonce: 'n', scriptUri: 'a"onload="x', styleUris: [] });
    assert.doesNotMatch(h, /src="a"onload/);
  });
});
