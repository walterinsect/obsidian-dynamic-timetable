import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../out/core/duration.js');
const { TaskParser } = require('../out/core/TaskParser.js');
const Ops = require('../out/core/taskOps.js');
const St = require('../out/core/statistics.js');
const H = require('../out/core/highlight.js');
const { DEFAULT_SETTINGS } = require('../out/core/defaults.js');

const S = (o = {}) => ({ ...DEFAULT_SETTINGS, ...o });
const mk = (o) => TaskParser.fromSettings(S(o));
const today = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
const FM = '---\nstartTime: 09:00:00\n---\n';
const lines = (c) => c.split(/\r?\n/);

describe('formatDuration', () => {
  test('minutes only, whole hours, hours+minutes with zero padding', () => {
    const f = D.formatDuration;
    assert.deepEqual([0, 1, 45, 59].map(f), ['0m', '1m', '45m', '59m']);
    assert.deepEqual([60, 120, 600].map(f), ['1h', '2h', '10h']);
    assert.deepEqual([61, 65, 69, 70, 140, 605].map(f), ['1h01m', '1h05m', '1h09m', '1h10m', '2h20m', '10h05m']);
  });
  test('rounds to whole minutes; bad input is 0m', () => {
    assert.equal(D.formatDuration(59.6), '1h');
    assert.equal(D.formatDuration(-3), '0m');
    assert.equal(D.formatDuration(NaN), '0m');
  });
  test('formatVariance: sign, zero, hours', () => {
    assert.deepEqual([20, -15, 0, 0.2, 65, -125].map(D.formatVariance), ['+20m', '-15m', '±0m', '±0m', '+1h05m', '-2h05m']);
  });
});

describe('parseDuration / round trip', () => {
  test('accepted notations', () => {
    const p = D.parseDuration;
    assert.deepEqual(['90', '5.5', '45m', '2h', '2h20m', '2h 20m', '1.5h', '0m', ' 2h20m '].map(p), [90, 5.5, 45, 120, 140, 140, 90, 0, 140]);
  });
  test('rejected notations', () => {
    for (const bad of ['', 'abc', 'h', 'm', '2x', '20m2h', '1h2', '-5']) assert.equal(D.parseDuration(bad), null, bad);
  });
  test('formatDuration → parseDuration is lossless for whole minutes', () => {
    for (let m = 0; m <= 1500; m += 7) assert.equal(D.parseDuration(D.formatDuration(m)), m);
  });
});

describe('TaskParser reads the new notations', () => {
  test('estimate column accepts 2h20m, 45m, 2h, 90 and keeps decimals', () => {
    const t = mk().filterAndParseTasks(FM + '- [ ] a ; 2h20m\n- [ ] b ; 45m\n- [ ] c ; 2h\n- [ ] d ; 90\n- [ ] e ; 5.5');
    assert.deepEqual(t.map((x) => x.estimate), ['140', '45', '120', '90', '5.5']);
    assert.deepEqual(t.map((x) => x.originalTaskName), ['a', 'b', 'c', 'd', 'e']);
  });
  test('(est …) is read into plannedMinutes and never leaks into the name / categories / start', () => {
    const t = mk().filterAndParseTasks(FM + '- [x] job ; 2h20m (est 2h) @ 2026-10-21 09:12 #w (@created: 2026-10-21 09:00)')[0];
    assert.equal(t.estimate, '140'); assert.equal(t.plannedMinutes, 120);
    assert.equal(t.originalTaskName, 'job'); assert.deepEqual(t.categories, ['w']);
    assert.equal(t.startTime.getHours(), 9); assert.equal(t.startTime.getMinutes(), 12);
    assert.equal(t.isCompleted, true);
  });
  test('legacy completed lines (no est) still parse; plannedMinutes is null', () => {
    const t = mk().filterAndParseTasks(FM + '- [x] job ; 25 @ 09:00 #w')[0];
    assert.equal(t.estimate, '25'); assert.ok(t.plannedMinutes == null);
  });
  test('"; 30 minutes" style text after a plain number is still just 30', () => {
    assert.equal(mk().filterAndParseTasks(FM + '- [ ] a ; 30 minutes')[0].estimate, '30');
  });
  test('custom delimiter works with the new notation', () => {
    const t = mk({ taskEstimateDelimiter: '|' }).filterAndParseTasks(FM + '- [x] a | 1h05m (est 1h) @ 09:00')[0];
    assert.equal(t.estimate, '65'); assert.equal(t.plannedMinutes, 60);
  });
});

describe('Complete / Interrupt write the new format', () => {
  const run = (est, minutes, mode, o = {}) => Ops.applyTaskUpdate(FM + `- [ ] A ; ${est} #w\n- [ ] B ; 10`, S(o), today(9, minutes), mode);
  test('complete: actual in 2h20m form plus (est …) of the ORIGINAL estimate', () => {
    assert.equal(lines(run(120, 0, 'complete').content)[3].replace(/ @ .*/, ''), '- [x] A ; 0m (est 2h)'.replace(/^- \[x\] A/, '- [x] A'));
  });
  test('over / under / exact', () => {
    const at = (est, el) => { const c = Ops.applyTaskUpdate(FM + `- [ ] A ; ${est}`, S(), new Date(today(9, 0).getTime() + el * 60000), 'complete').content; return lines(c)[3].replace(/ @ .*/, ''); };
    assert.equal(at(120, 140), '- [x] A ; 2h20m (est 2h)');
    assert.equal(at(90, 65), '- [x] A ; 1h05m (est 1h30m)');
    assert.equal(at(30, 30), '- [x] A ; 30m (est 30m)');
  });
  test('estimate written as 2h in the source is understood and echoed correctly', () => {
    const c = Ops.applyTaskUpdate(FM + '- [ ] A ; 2h', S(), new Date(today(9, 0).getTime() + 100 * 60000), 'complete').content;
    assert.match(lines(c)[3], /^- \[x\] A ; 1h40m \(est 2h\) @ /);
  });
  test('interrupt: the done part has the elapsed time and NO (est …); the remainder keeps counting in plain minutes', () => {
    const c = Ops.applyTaskUpdate(FM + '- [ ] A ; 2h #w', S(), new Date(today(9, 0).getTime() + 45 * 60000), 'interrupt').content;
    const l = lines(c);
    assert.match(l[3], /^- \[x\] A ; 45m @ .* #w$/);
    assert.match(l[4], /^- \[ \] A ; 75 #w/);
  });
  test('durationFormat=minutes: old plain-minute style, still with (est …)', () => {
    const c = Ops.applyTaskUpdate(FM + '- [ ] A ; 120', S({ durationFormat: 'minutes' }), new Date(today(9, 0).getTime() + 140 * 60000), 'complete').content;
    assert.match(lines(c)[3], /^- \[x\] A ; 140 \(est 120\) @ /);
  });
  test('the written line round-trips: actual 140, planned 120, variance +20, name clean, next task found', () => {
    const r = Ops.applyTaskUpdate(FM + '- [ ] A ; 2h #w\n- [ ] B ; 10', S(), new Date(today(9, 0).getTime() + 140 * 60000), 'complete');
    const t = mk().filterAndParseTasks(r.content);
    assert.equal(t[0].estimate, '140'); assert.equal(t[0].plannedMinutes, 120); assert.equal(St.taskVariance(t[0]), 20);
    assert.equal(t[0].originalTaskName, 'A'); assert.equal(r.next.originalTaskName, 'B');
  });
  test('CRLF documents stay CRLF', () => {
    const c = Ops.applyTaskUpdate((FM + '- [ ] A ; 30\r\n').replace(/\n/g, '\r\n'), S(), today(9, 10), 'complete').content;
    assert.ok(!/(^|[^\r])\n/.test(c)); assert.match(c, /\[x\] A ; 10m \(est 30m\) @ /);
  });
  test('completing a line that already has a stamp keeps the stamp after the new format', () => {
    const c = Ops.applyTaskUpdate(FM + '- [ ] A ; 30 (@created: 2020-01-02 03:04)', S(), today(9, 10), 'complete').content;
    assert.match(lines(c)[3], /^- \[x\] A ; 10m \(est 30m\) @ .* \(@created: 2020-01-02 03:04\)$/);
  });
});

describe('variance in statistics', () => {
  const tasks = mk().filterAndParseTasks(FM + [
    '- [x] a ; 2h20m (est 2h) @ 09:00 #w', '- [x] b ; 50m (est 1h) @ 12:00 #w', '- [x] c ; 30m @ 13:00 #w', '- [x] d ; 10m (est 5m) @ 14:00 #p', '- [ ] e ; 1h #w',
  ].join('\n'));
  test('taskVariance: only completed tasks that carry (est …)', () => {
    assert.deepEqual(tasks.map(St.taskVariance), [20, -10, null, 5, null]);
  });
  test('per-category and total variance; null when no task carries an estimate', () => {
    const s = St.computeStatistics(tasks);
    const w = s.rows.find((r) => r.category === 'w'), p = s.rows.find((r) => r.category === 'p');
    assert.equal(w.variance, 10); assert.equal(p.variance, 5); assert.equal(s.totals.variance, 15);
    assert.equal(St.computeStatistics(mk().filterAndParseTasks(FM + '- [x] a ; 25 @ 09:00 #w')).totals.variance, null);
  });
  test('the actual/estimated totals are unchanged by (est …)', () => {
    const s = St.computeStatistics(tasks);
    assert.equal(s.rows.find((r) => r.category === 'w').actual, 140 + 50 + 30);
    assert.equal(s.rows.find((r) => r.category === 'w').estimated, 60);
  });
  test('formatMinutes uses the same zero-padded style', () => {
    assert.deepEqual([60, 65, 140].map(St.formatMinutes), ['1h', '1h05m', '2h20m']);
  });
});

describe('editor highlight covers (est …)', () => {
  test('both the estimate and the est note are painted as estimate; a note is not read as a tag/start', () => {
    const l = '- [x] a ; 2h20m (est 2h) @ 2026-10-21 09:12 #w';
    const r = H.computeHighlights(mk(), FM + l);
    const txt = r.map((x) => [x.kind, (FM + l).split('\n')[x.line].slice(x.start, x.end)]);
    assert.deepEqual(txt.filter((x) => x[0] === 'estimate').map((x) => x[1]).sort(), ['(est 2h)', '; 2h20m']);
    assert.deepEqual(txt.filter((x) => x[0] === 'start').map((x) => x[1]), ['@ 2026-10-21 09:12']);
    assert.deepEqual(txt.filter((x) => x[0] === 'tag').map((x) => x[1]), ['#w']);
  });
});
