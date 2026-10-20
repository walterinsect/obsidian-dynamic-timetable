import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { TaskParser } = require('../out/core/TaskParser.js');
const { toDTO, fromDTO } = require('../out/core/serialize.js');
const T = require('../out/core/timetable.js');

const parser = new TaskParser(';', '@', '', true, false, false, '');
const parse = (c) => parser.filterAndParseTasks(c);
const hdr = '---\nstartTime: 09:00:00\n---\n';

describe('serialize', () => {
  test('roundtrip through JSON (like postMessage) restores Dates', () => {
    const tasks = parse(hdr + '- [ ] A ; 30 #w\n- [ ] B ; 10 @ 12:00');
    const wire = JSON.parse(JSON.stringify(tasks.map(toDTO)));
    assert.equal(typeof wire[0].startTime, 'string');
    const back = wire.map(fromDTO);
    back.forEach((b, i) => {
      assert.ok(b.startTime instanceof Date);
      assert.equal(b.startTime.getTime(), tasks[i].startTime.getTime());
      assert.equal(b.endTime.getTime(), tasks[i].endTime.getTime());
      assert.deepEqual(b.categories, tasks[i].categories);
    });
  });
  test('null and invalid dates become null', () => {
    const t = fromDTO({ ...toDTO(parse(hdr + '- [ ] A ; 5')[0]), startTime: null, endTime: 'garbage' });
    assert.equal(t.startTime, null);
    assert.equal(t.endTime, null);
  });
});

describe('formatters', () => {
  test('formatDateToTime', () => assert.equal(T.formatDateToTime(new Date(2026, 0, 1, 7, 5)), '07:05'));
  test('formatToHHMMSS', () => {
    assert.equal(T.formatToHHMMSS(0), '00:00:00');
    assert.equal(T.formatToHHMMSS(3725), '01:02:05');
    assert.equal(T.formatToHHMMSS(59.9), '00:00:59');
  });
  test('formatBufferTime incl. negatives', () => {
    assert.equal(T.formatBufferTime(null), '0h0min');
    assert.equal(T.formatBufferTime(75), '1h15min');
    assert.equal(T.formatBufferTime(-75), '-1h15min');
    assert.equal(T.formatBufferTime(-5), '-0h5min');
  });
});

describe('buffer time & classes', () => {
  const d = (h, m) => new Date(2026, 0, 1, h, m);
  test('calculateBufferTime', () => {
    assert.equal(T.calculateBufferTime(d(9, 0), d(9, 30), 1), 30);
    assert.equal(T.calculateBufferTime(d(9, 30), d(9, 0), 1), -30);
    assert.equal(T.calculateBufferTime(null, d(9, 0), 1), null);
    assert.equal(T.calculateBufferTime(d(9, 0), d(9, 30), 0), 0);
  });
  const base = { originalStartTime: true, isCompleted: false };
  test('on-time / late by buffer', () => {
    const f = (bufferTime) => T.getBufferClass({ task: base, bufferTime, isCurrent: false, estimateMs: 0, durationMs: 0 });
    assert.equal(f(10), 'on-time');
    assert.equal(f(-1), 'late');
    assert.equal(f(null), '');
  });
  test('current task: by remaining time', () => {
    const f = (durationMs) => T.getBufferClass({ task: { ...base, originalStartTime: false }, bufferTime: 0, isCurrent: true, estimateMs: 60000, durationMs });
    assert.equal(f(30000), 'on-time');
    assert.equal(f(90000), 'late');
  });
  test('completed task gets no class', () =>
    assert.equal(T.getBufferClass({ task: { ...base, isCompleted: true }, bufferTime: -5, isCurrent: false, estimateMs: 0, durationMs: 0 }), ''));
});

describe('computeCategoryColors', () => {
  const tasks = parse('- [ ] A ; 5 #a\n- [ ] B ; 5 #b #c');
  const s = { categoryColors: [{ category: 'a', color: '#ff0000' }], categoryTransparency: 0.3 };
  test('configured color wins; others random distinct hues', () => {
    const c = T.computeCategoryColors(tasks, s);
    assert.equal(c.a, 'hsla(0, 100%, 50%, 0.3)');
    const hues = ['a', 'b', 'c'].map((k) => c[k].match(/hsla\((\d+)/)[1]);
    assert.equal(new Set(hues).size, 3);
  });
  test('stable across calls; alpha updates', () => {
    const c1 = T.computeCategoryColors(tasks, s);
    const c2 = T.computeCategoryColors(tasks, { ...s, categoryTransparency: 0.6 }, c1);
    assert.equal(c2.b, c1.b.replace('0.3)', '0.6)'));
  });
  test('unused categories are dropped', () => {
    const c1 = T.computeCategoryColors(tasks, s);
    const c2 = T.computeCategoryColors(parse('- [ ] A ; 5 #a'), s, c1);
    assert.deepEqual(Object.keys(c2), ['a']);
  });
  test('fadeColor', () => assert.equal(T.fadeColor('hsla(10, 80%, 80%, 0.3)'), 'hsla(10, 80%, 80%, 0.05)'));
});

describe('buildRows', () => {
  const tasks = parse(hdr + '- [x] Done ; 10 @ 08:00\n- [ ] Now ; 30\n- [ ] Later ; 10 @ 11:00\n- [ ] Tight ; 10 @ 11:05');
  test('buffer row inserted only before gapped, uncompleted, non-current tasks', () => {
    const rows = T.buildRows(tasks, { showCompletedTasks: true, showBufferTime: true }, new Date());
    // Done / Now(current: no buffer row) / [buffer 09:30→11:00] Later / [buffer 11:10→11:05] Tight
    assert.deepEqual(rows.map((r) => r.kind), ['task', 'task', 'buffer', 'task', 'buffer', 'task']);
    assert.deepEqual(rows.filter((r) => r.kind === 'buffer').map((r) => r.bufferTime), [90, -5]);
    assert.equal(rows.filter((r) => r.isCurrent).length, 1);
    assert.equal(rows.find((r) => r.isCurrent).task.task, 'Now');
  });
  test('showBufferTime=false hides buffer rows', () => {
    const rows = T.buildRows(tasks, { showCompletedTasks: true, showBufferTime: false });
    assert.ok(rows.every((r) => r.kind === 'task'));
  });
  test('showCompletedTasks=false hides done tasks', () => {
    const rows = T.buildRows(tasks, { showCompletedTasks: false, showBufferTime: true });
    assert.ok(rows.every((r) => !r.task || !r.task.isCompleted));
    assert.equal(rows.filter((r) => r.kind === 'task').length, 3);
  });
  test('hasLateStart detects overlap with an explicit start time', () => {
    const late = parse(hdr + '- [ ] A ; 60\n- [ ] B ; 10 @ 09:30');
    const rows = T.buildRows(late, { showCompletedTasks: true, showBufferTime: true });
    assert.equal(T.hasLateStart(late, rows), true);
    const ok = parse(hdr + '- [ ] A ; 10\n- [ ] B ; 10 @ 09:30');
    assert.equal(T.hasLateStart(ok, T.buildRows(ok, { showCompletedTasks: true, showBufferTime: true })), false);
  });
});

describe('computeProgress', () => {
  const tasks = parse(hdr + '- [ ] A ; 30');
  test('elapsed and estimate', () => {
    const now = new Date(tasks[0].startTime.getTime() + 10 * 60000);
    assert.deepEqual(T.computeProgress(tasks, now), { durationMs: 600000, estimateMs: 1800000 });
  });
  test('start in the future → elapsed 0', () => {
    const now = new Date(tasks[0].startTime.getTime() - 5000);
    assert.equal(T.computeProgress(tasks, now).durationMs, 0);
  });
  test('no current task / no start time → zeros', () => {
    assert.deepEqual(T.computeProgress(parse('- [x] A ; 5'), new Date()), { durationMs: 0, estimateMs: 0 });
    assert.deepEqual(T.computeProgress(parse('- [ ] A ; 5'), new Date()), { durationMs: 0, estimateMs: 0 });
  });
});
