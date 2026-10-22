import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('../out/core/progress.js');
const { TaskParser } = require('../out/core/TaskParser.js');
const { DEFAULT_SETTINGS } = require('../out/core/defaults.js');

const parse = (body, o = {}) => TaskParser.fromSettings({ ...DEFAULT_SETTINGS, ...o }).filterAndParseTasks('---\nstartTime: 09:00:00\n---\n' + body);
const sum = (body, o) => P.summarizeTasks(parse(body, o));

describe('summarizeTasks', () => {
  test('counts total, done and rounds the percentage', () => {
    assert.deepEqual(sum('- [x] a ; 5\n- [ ] b ; 5\n- [ ] c ; 5'), { total: 3, done: 1, percent: 33 });
    assert.deepEqual(sum('- [x] a ; 5\n- [x] b ; 5\n- [ ] c ; 5'), { total: 3, done: 2, percent: 67 });
  });
  test('all done = 100, none done = 0', () => {
    assert.equal(sum('- [x] a ; 5\n- [x] b ; 5').percent, 100);
    assert.equal(sum('- [ ] a ; 5').percent, 0);
  });
  test('no tasks → percent null (not 0%) and a "No tasks" label', () => {
    const s = sum('just text');
    assert.deepEqual(s, { total: 0, done: 0, percent: null });
    assert.equal(P.formatProgressText(s), '$(checklist) No tasks');
  });
  test('same range as the timetable: *, + bullets and indented tasks count; plain text does not', () => {
    assert.equal(sum('* [x] a ; 5\n+ [ ] b ; 5\n  - [ ] c ; 5\n- not a task').total, 3);
  });
  test('showUntilRegex stops counting, exactly like the timetable', () => {
    const s = sum('- [x] a ; 5\n- [ ] b ; 5\n## Memo\n- [ ] c ; 5', { showUntilRegex: '^## Memo' });
    assert.equal(s.total, 2);
  });
  test('timestamps / start times on completed lines do not affect counting', () => {
    assert.deepEqual(sum('- [x] a ; 25 @ 2026-10-21 09:12 #w (@created: 2026-10-21 09:12) (@done: 2026-10-21 09:37)\n- [ ] b ; 5'), { total: 2, done: 1, percent: 50 });
  });
  test('formatting', () => {
    assert.equal(P.formatProgressText({ total: 8, done: 3, percent: 38 }), '$(checklist) 3/8 (38%)');
    const t = P.formatProgressTooltip({ total: 8, done: 3, percent: 38 }, 'plan.md');
    assert.match(t, /Tasks: 8 · Completed: 3 · Completion: 38%/); assert.match(t, /File: plan\.md/);
  });
});
