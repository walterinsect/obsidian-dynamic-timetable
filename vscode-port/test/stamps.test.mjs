import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const St = require('../out/core/stamps.js');
const Ops = require('../out/core/taskOps.js');
const { TaskParser } = require('../out/core/TaskParser.js');
const { DEFAULT_SETTINGS, sanitizeSettings } = require('../out/core/defaults.js');

const S = (o = {}) => ({ ...DEFAULT_SETTINGS, ...o });
const ON = S({ enableTimestamps: true });
const OFF = S({ enableTimestamps: false });
const D = ymd0(new Date());
function ymd0(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const today = (h, m, s = 0) => { const d = new Date(); d.setHours(h, m, s, 0); return d; };
const lines = (c) => c.split(/\r?\n/);
const yaml = (t = '09:00:00') => `---\nstartTime: ${t}\n---\n`;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('formatTimestamp', () => {
  const d = new Date(2026, 0, 5, 7, 3, 9);
  test('default format', () => assert.equal(St.formatTimestamp(d), '2026-01-05 07:03'));
  test('all tokens, literal text kept', () => assert.equal(St.formatTimestamp(d, 'YYYY/MM/DD HH:mm:ss [x]'), '2026/01/05 07:03:09 [x]'));
  test('time only', () => assert.equal(St.formatTimestamp(d, 'HH:mm'), '07:03'));
  test('valid / invalid formats', () => {
    assert.ok(St.isValidTimestampFormat('YYYY-MM-DD HH:mm'));
    for (const bad of ['', 'abc', 'HH:mm)', 'HH:mm\nss', 5, null, 'Y'.repeat(41) + 'HH']) assert.ok(!St.isValidTimestampFormat(bad), String(bad));
  });
});

describe('extractStamps / stripStamps / stampSuffix', () => {
  test('extracts created and done, removes them from text', () => {
    const r = St.extractStamps('- [x] a ; 5 #w (@created: 2026-10-21 09:00) (@done: 2026-10-21 09:25)');
    assert.deepEqual(r, { created: '2026-10-21 09:00', done: '2026-10-21 09:25', text: '- [x] a ; 5 #w' });
  });
  test('no stamps → same text', () => assert.deepEqual(St.extractStamps('- [ ] a ; 5'), { text: '- [ ] a ; 5' }));
  test('first of duplicates wins; all are removed', () => {
    const r = St.extractStamps('- [ ] a (@created: A) (@created: B)');
    assert.equal(r.created, 'A'); assert.equal(r.text, '- [ ] a');
  });
  test('stamp in the middle of the line', () => assert.equal(St.stripStamps('- [ ] a (@created: X) ; 5 #w'), '- [ ] a ; 5 #w'));
  test('unrelated parentheses / @ are untouched', () => {
    const l = '- [ ] call (urgent) @ 10:00 (@home) ; 5';
    assert.equal(St.stripStamps(l), l);
  });
  test('stampSuffix order and omission', () => {
    assert.equal(St.stampSuffix({}), '');
    assert.equal(St.stampSuffix({ created: 'C' }), ' (@created: C)');
    assert.equal(St.stampSuffix({ done: 'D', created: 'C' }), ' (@created: C) (@done: D)');
  });
});

describe('parser ignores stamps', () => {
  const mk = (o = {}) => TaskParser.fromSettings(S(o));
  const L = '- [ ] task ; 30 #w (@created: 2026-10-21 09:12)';
  test('name, estimate, categories are clean', () => {
    const t = mk().filterAndParseTasks(yaml() + L)[0];
    assert.equal(t.task, 'task'); assert.equal(t.originalTaskName, 'task');
    assert.equal(t.estimate, '30'); assert.deepEqual(t.categories, ['w']);
  });
  test('stamp time is NOT mistaken for an explicit start time', () => {
    const t = mk().filterAndParseTasks(yaml() + '- [ ] task ; 30 (@created: 2026-10-21 09:12)')[0];
    assert.equal(t.originalStartTime, false);
  });
  test('REGRESSION: startTimeDelimiter ":" does not read the stamp as a start time', () => {
    const t = mk({ startTimeDelimiter: ':' }).filterAndParseTasks(yaml() + '- [ ] task ; 30 (@created: 2026-10-21 09:12)')[0];
    assert.equal(t.originalStartTime, false);
    assert.equal(t.task, 'task');
  });
  test('REGRESSION: estimateDelimiter ":" does not read the stamp as an estimate', () => {
    const t = mk({ taskEstimateDelimiter: ':' }).filterAndParseTasks(yaml() + '- [ ] task : 30 (@created: 2026-10-21 09:12)')[0];
    assert.equal(t.estimate, '30');
  });
  test('completed line with both stamps and explicit start', () => {
    const t = mk().filterAndParseTasks('- [x] task ; 25 @ 09:00 #w (@created: 2026-10-21 09:00) (@done: 2026-10-21 09:25)')[0];
    assert.equal(t.task, 'task @09:00'); assert.equal(t.originalStartTime, true);
    assert.equal(t.isCompleted, true); assert.equal(t.estimate, '25');
  });
});

describe('date-included actual start "@ YYYY-MM-DD HH:mm"', () => {
  const mk = (o = {}) => TaskParser.fromSettings(S(o));
  const L = '- [x] task ; 25 @ 2026-10-21 09:12 #w (@done: 2026-10-21 09:37)';
  test('REGRESSION: read as 09:12 on that date, NOT as 20:26', () => {
    const p = mk();
    const d = p.parseStartTime(L, 0);
    assert.equal(d.getFullYear(), 2026); assert.equal(d.getMonth(), 9); assert.equal(d.getDate(), 21);
    assert.equal(d.getHours(), 9); assert.equal(d.getMinutes(), 12);
  });
  test('single-digit hour and ISO "T" form still work; legacy forms unchanged', () => {
    const p = mk();
    assert.equal(p.parseStartTime('- [ ] a ; 5 @ 2026-10-21 9:05', 0).getHours(), 9);
    assert.equal(p.parseStartTime('- [ ] a ; 5 @ 2026-10-21T09:12', 0).getMinutes(), 12);
    assert.equal(p.parseStartTime('- [ ] a ; 5 @ 09:12', 0).getHours(), 9);
    assert.equal(p.parseStartTime('- [ ] a ; 5 @ 0912', 0).getMinutes(), 12);
  });
  test('start does not leak into the task name / categories / estimate', () => {
    const t = mk({ showStartTimeInTaskName: false }).filterAndParseTasks(L)[0];
    assert.equal(t.originalTaskName, 'task'); assert.equal(t.task, 'task');
    assert.equal(t.estimate, '25'); assert.deepEqual(t.categories, ['w']);
    assert.equal(t.originalStartTime, true);
  });
  test('Complete writes it and the result round-trips through the parser', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] A ; 30 #w\n- [ ] B ; 10', ON, today(9, 37), 'complete');
    assert.match(lines(r.content)[3], new RegExp('^- \\[x\\] A ; 37 @ ' + D + ' 09:00 #w'));
    const t = TaskParser.fromSettings(ON).filterAndParseTasks(r.content)[0];
    assert.equal(t.originalTaskName, 'A'); assert.equal(t.startTime.getHours(), 9); assert.equal(t.startTime.getMinutes(), 0);
  });
  test('custom timestampFormat does not change the start format (always parseable)', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] A ; 30', S({ enableTimestamps: true, timestampFormat: 'HH:mm' }), today(9, 37), 'complete');
    assert.match(lines(r.content)[3], new RegExp('^- \\[x\\] A ; 37 @ ' + D + ' 09:00 \\(@done: 09:37\\)$'));
  });
});

describe('applyTaskUpdate with timestamps', () => {
  test('feature OFF: no stamps are added and start is time-only', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] A ; 30 #w', OFF, today(9, 25), 'complete');
    assert.ok(!r.content.includes('(@'), r.content);
    assert.equal(lines(r.content)[3], '- [x] A ; 25 @ 09:00 #w');
  });
  test('complete: adds (@done: now), no Created on a hand-written task', () => {
    const now = today(9, 37);
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] A ; 30 #w', ON, now, 'complete');
    assert.equal(lines(r.content)[3], `- [x] A ; 37 @ ${D} 09:00 #w (@done: ${ymd(now)} 09:37)`);
  });
  test('complete: keeps an existing Created unchanged and adds Done after it', () => {
    const now = today(9, 37);
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] A ; 30 #w (@created: 2020-01-02 03:04)', ON, now, 'complete');
    assert.equal(lines(r.content)[3], `- [x] A ; 37 @ ${D} 09:00 #w (@created: 2020-01-02 03:04) (@done: ${ymd(now)} 09:37)`);
  });
  test('REGRESSION: stamp no longer ends up between the name and ";"', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] A ; 30 (@created: 2020-01-02 03:04)', ON, today(9, 10), 'complete');
    assert.match(lines(r.content)[3], new RegExp('^- \\[x\\] A ; 10 @ ' + D + ' 09:00 \\(@created: 2020-01-02 03:04\\) \\(@done: '));
  });
  test('complete with feature OFF still preserves an existing Created (no data loss) and adds no Done', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] A ; 30 (@created: 2020-01-02 03:04)', OFF, today(9, 10), 'complete');
    assert.equal(lines(r.content)[3], '- [x] A ; 10 @ 09:00 (@created: 2020-01-02 03:04)');
  });
  test('INTERRUPT: done line gets Done; remaining task gets Created = interrupt time (not the original)', () => {
    const now = today(9, 25);
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] Deep ; 60 #w (@created: 2020-01-02 03:04)\n- [ ] Next ; 5', ON, now, 'interrupt');
    const l = lines(r.content);
    assert.equal(l[3], `- [x] Deep ; 25 @ ${D} 09:00 #w (@created: 2020-01-02 03:04) (@done: ${ymd(now)} 09:25)`);
    assert.equal(l[4], `- [ ] Deep ; 35 #w (@created: ${ymd(now)} 09:25)`);
    assert.equal(l[5], '- [ ] Next ; 5');
  });
  test('interrupt with feature OFF: remaining task does not inherit the old Created', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] Deep ; 60 (@created: 2020-01-02 03:04)', OFF, today(9, 25), 'interrupt');
    assert.equal(lines(r.content)[4], '- [ ] Deep ; 35');
  });
  test('interrupt over-run: no remaining task, Done still recorded', () => {
    const now = today(10, 0);
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] A ; 10', ON, now, 'interrupt');
    assert.equal(r.remainingMinutes, undefined);
    assert.match(lines(r.content)[3], /\(@done: /);
    assert.equal(lines(r.content).filter((x) => x.includes('[ ]')).length, 0);
  });
  test('custom time format', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] A ; 30', S({ enableTimestamps: true, timestampFormat: 'HH:mm' }), today(9, 37), 'complete');
    assert.match(lines(r.content)[3], /\(@done: 09:37\)$/);
  });
  test('indent / bullet / CRLF preserved with stamps', () => {
    const c = '---\r\nstartTime: 09:00:00\r\n---\r\n  * [ ] A ; 30 #w\r\n';
    const r = Ops.applyTaskUpdate(c, ON, today(9, 10), 'complete');
    assert.ok(!/(^|[^\r])\n/.test(r.content));
    assert.match(lines(r.content)[3], new RegExp('^  \\* \\[x\\] A ; 10 @ ' + D + ' 09:00 #w \\(@done: '));
  });
  test('result re-parses: completed, name clean, next task found', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] A ; 30 #w\n- [ ] B ; 10', ON, today(9, 10), 'complete');
    const t = TaskParser.fromSettings(ON).filterAndParseTasks(r.content);
    assert.deepEqual(t.map((x) => [x.originalTaskName, x.isCompleted]), [['A', true], ['B', false]]);
    assert.equal(r.next.originalTaskName, 'B');
  });
  test('completing repeatedly never nests or duplicates stamps', () => {
    let c = yaml() + '- [ ] A ; 30 (@created: X1)\n- [ ] B ; 30 (@created: X2)\n- [ ] C ; 30';
    for (let i = 0; i < 3; i++) c = Ops.applyTaskUpdate(c, ON, today(9, 10 + i), 'complete').content;
    for (const l of lines(c).filter((x) => x.includes('[x]'))) {
      assert.equal((l.match(/\(@done:/g) || []).length, 1, l);
      assert.ok((l.match(/\(@created:/g) || []).length <= 1, l);
    }
  });
  test('REGRESSION: custom startTimeDelimiter is used when writing the actual start', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] A | 30', S({ taskEstimateDelimiter: '|', startTimeDelimiter: '$' }), today(9, 10), 'complete');
    assert.equal(lines(r.content)[3], `- [x] A | 10 $ ${D} 09:00 (@done: ${D} 09:10)`);
    const t = TaskParser.fromSettings(S({ taskEstimateDelimiter: '|', startTimeDelimiter: '$' })).filterAndParseTasks(r.content)[0];
    assert.equal(t.originalStartTime, true);
  });
});

describe('settings: enableTimestamps / timestampFormat', () => {
  test('defaults: ON, YYYY-MM-DD HH:mm', () => {
    assert.equal(DEFAULT_SETTINGS.enableTimestamps, true);
    assert.equal(DEFAULT_SETTINGS.timestampFormat, 'YYYY-MM-DD HH:mm');
  });
  test('sanitize: invalid format falls back, valid kept', () => {
    assert.equal(sanitizeSettings({ timestampFormat: 'bad)' }).timestampFormat, 'YYYY-MM-DD HH:mm');
    assert.equal(sanitizeSettings({ timestampFormat: 'HH:mm' }).timestampFormat, 'HH:mm');
    assert.equal(sanitizeSettings({ enableTimestamps: 'yes' }).enableTimestamps, true);
    assert.equal(sanitizeSettings({ enableTimestamps: true }).enableTimestamps, true);
  });
});
