import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Ops = require('../out/core/taskOps.js');
const { TaskParser } = require('../out/core/TaskParser.js');

const S = {
  taskEstimateDelimiter: ';', startTimeDelimiter: '@', dateDelimiter: '',
  showStartTimeInTaskName: true, showEstimateInTaskName: false,
  showCategoryNamesInTask: false, showUntilRegex: '',
};
// パーサは「今日」の日付に時刻を当てるため、テストの時刻も今日基準にする(固定日付だと実行日・TZ で壊れる)
const at = (h, m, s = 0) => { const d = new Date(); d.setHours(h, m, s, 123); return d; };
const yaml = (t = '09:00:00') => `---\nstartTime: ${t}\n---\n`;
const lines = (c) => c.split(/\r?\n/);

describe('updateStartTimeInYAML', () => {
  const now = at(9, 30, 5);
  test('replaces existing startTime', () =>
    assert.equal(Ops.updateStartTimeInYAML(yaml() + '- [ ] A ; 5', now), yaml('09:30:05') + '- [ ] A ; 5'));
  test('adds startTime to front matter lacking it', () =>
    assert.equal(Ops.updateStartTimeInYAML('---\ntitle: x\n---\nbody', now), '---\ntitle: x\nstartTime: 09:30:05\n---\nbody'));
  test('creates front matter when absent', () =>
    assert.equal(Ops.updateStartTimeInYAML('- [ ] A ; 5', now), '---\nstartTime: 09:30:05\n---\n- [ ] A ; 5'));
  test('REGRESSION: "---" separators in body are NOT treated as front matter', () => {
    const body = '- [ ] A ; 10\n---\n- [ ] B ; 10\n---\n';
    const out = Ops.updateStartTimeInYAML(body, now);
    assert.ok(out.endsWith(body));
    assert.equal(lines(out).slice(0, 3).join('|'), '---|startTime: 09:30:05|---');
  });
  test('REGRESSION: CRLF front matter is recognised and EOL preserved', () => {
    const c = '---\r\nstartTime: 09:00:00\r\n---\r\n- [ ] A ; 5\r\n';
    const out = Ops.updateStartTimeInYAML(c, now);
    assert.equal(out, '---\r\nstartTime: 09:30:05\r\n---\r\n- [ ] A ; 5\r\n');
    assert.equal((out.match(/startTime/g) || []).length, 1);
  });
  test('idempotent shape: second update keeps one front matter', () => {
    const o2 = Ops.updateStartTimeInYAML(Ops.updateStartTimeInYAML('- [ ] A ; 5', now), at(10, 0));
    assert.equal((o2.match(/---/g) || []).length, 2);
  });
});

describe('getElapsedMinutes', () => {
  const p = TaskParser.fromSettings(S);
  const run = (c, h, m) => Ops.getElapsedMinutes(c, p, at(h, m).getTime());
  test('floors minutes', () => assert.equal(Ops.getElapsedMinutes(yaml(), p, at(9, 12, 59).getTime()), 12));
  test('no startTime → 0', () => assert.equal(run('- [ ] A ; 5', 10, 0), 0));
  test('start in future → treated as previous day (+24h)', () => assert.equal(run(yaml('23:00:00'), 0, 30), 90));
});

describe('applyTaskUpdate: complete', () => {
  const now = at(9, 25, 30); // elapsed 25 min
  test('marks first uncompleted done with elapsed + actual start; bumps startTime', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] Write ; 30 #w\n- [ ] Next ; 10', S, now, 'complete');
    assert.deepEqual(lines(r.content), ['---', 'startTime: 09:25:30', '---', '- [x] Write ; 25 @ 09:00 #w', '- [ ] Next ; 10', '']
      .slice(0, 5));
    assert.equal(r.elapsedMinutes, 25);
    assert.equal(r.next.task, 'Next');
  });
  test('skips already-completed lines', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [x] Old ; 5 @ 08:00\n- [ ] Cur ; 30', S, now, 'complete');
    assert.ok(r.content.includes('- [x] Old ; 5 @ 08:00'));
    assert.ok(r.content.includes('- [x] Cur ; 25 @ 09:00'));
  });
  test('REGRESSION: ISO start time on the task line', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] A ; 30 @ 2026-10-21T09:00', S, now, 'complete');
    assert.ok(r.content.includes('- [x] A ; 25 @ 09:00'), r.content);
  });
  test('REGRESSION: indented task keeps its indent', () => {
    const r = Ops.applyTaskUpdate(yaml() + '  - [ ] A ; 30', S, now, 'complete');
    assert.ok(r.content.includes('  - [x] A ; 25 @ 09:00'), r.content);
  });
  test('REGRESSION: * and + bullets', () => {
    assert.ok(Ops.applyTaskUpdate(yaml() + '* [ ] A ; 30', S, now, 'complete').content.includes('* [x] A ; 25'));
    assert.ok(Ops.applyTaskUpdate(yaml() + '+ [ ] A ; 30', S, now, 'complete').content.includes('+ [x] A ; 25'));
  });
  test('multiple tags, tag before start, links preserved', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] See [[Note]] ; 30 #w #deep', S, now, 'complete');
    assert.ok(r.content.includes('- [x] See [[Note]] ; 25 @ 09:00 #w #deep'), r.content);
  });
  test('Japanese names and tags', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] 資料作成 ; 30 #仕事', S, now, 'complete');
    assert.ok(r.content.includes('- [x] 資料作成 ; 25 @ 09:00 #仕事'), r.content);
  });
  test('result re-parses as completed and chain continues', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] A ; 30\n- [ ] B ; 10', S, now, 'complete');
    const t = new TaskParser(';', '@', '', true, false, false, '').filterAndParseTasks(r.content);
    assert.equal(t[0].isCompleted, true);
    assert.equal(t[1].isCompleted, false);
    assert.equal(t[1].startTime.getMinutes(), 25);
  });
  test('CRLF documents stay CRLF', () => {
    const c = '---\r\nstartTime: 09:00:00\r\n---\r\n- [ ] A ; 30\r\n';
    const r = Ops.applyTaskUpdate(c, S, now, 'complete');
    assert.ok(!/(^|[^\r])\n/.test(r.content), JSON.stringify(r.content));
    assert.ok(r.content.includes('- [x] A ; 25 @ 09:00\r\n'));
  });
  test('no uncompleted task → content untouched', () => {
    const c = yaml() + '- [x] A ; 5 @ 08:00';
    const r = Ops.applyTaskUpdate(c, S, now, 'complete');
    assert.equal(r.content, c);
    assert.equal(r.completed, null);
  });
  test('REGRESSION: no front matter + "---" separators does not corrupt body', () => {
    const c = '- [ ] A ; 10\n---\n- [ ] B ; 10\n---\n';
    const r = Ops.applyTaskUpdate(c, { ...S, dateDelimiter: '^---$' }, now, 'complete');
    assert.ok(r.content.endsWith('\n---\n- [ ] B ; 10\n---\n'), r.content);
    assert.equal(lines(r.content)[0], '---');
    assert.equal(lines(r.content)[1].startsWith('startTime: '), true);
  });
  test('custom estimate delimiter', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] A | 30', { ...S, taskEstimateDelimiter: '|' }, now, 'complete');
    assert.ok(r.content.includes('- [x] A | 25 @ 09:00'), r.content);
  });
});

describe('applyTaskUpdate: interrupt', () => {
  test('splits into done(elapsed) + remaining', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] Deep ; 60 #w\n- [ ] Next ; 5', S, at(9, 20), 'interrupt');
    const l = lines(r.content);
    assert.equal(l[3], '- [x] Deep ; 20 @ 09:00 #w');
    assert.equal(l[4], '- [ ] Deep ; 40 #w');
    assert.equal(l[5], '- [ ] Next ; 5');
    assert.equal(r.remainingMinutes, 40);
  });
  test('over-run → no remaining task added', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] A ; 10', S, at(9, 45), 'interrupt');
    assert.equal(r.remainingMinutes, undefined);
    assert.equal(lines(r.content).filter((x) => x.includes('[ ]')).length, 0);
  });
  test('decimal estimate rounds remaining up', () => {
    const r = Ops.applyTaskUpdate(yaml() + '- [ ] A ; 10.5', S, at(9, 5), 'interrupt');
    assert.equal(r.remainingMinutes, 6);
  });
});

describe('buildCustomUrl', () => {
  test('expands all placeholders, every occurrence', () =>
    assert.equal(Ops.buildCustomUrl('x://t?m={{minutes}}&s={{seconds}}&n={{taskName}}&m2={{minutes}}', { task: 'A B/日本', estimate: '25' }),
      `x://t?m=25&s=1500&n=${encodeURIComponent('A B/日本')}&m2=25`));
  test('rounds decimals up', () => assert.equal(Ops.buildCustomUrl('{{minutes}}', { task: 'a', estimate: '1.2' }), '2'));
  test('empty template / no estimate → null', () => {
    assert.equal(Ops.buildCustomUrl('', { task: 'a', estimate: '1' }), null);
    assert.equal(Ops.buildCustomUrl('x', { task: 'a', estimate: null }), null);
  });
});
