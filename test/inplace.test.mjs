import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Ops = require('../out/core/taskOps.js');
const { TaskParser } = require('../out/core/TaskParser.js');
const { DEFAULT_SETTINGS } = require('../out/core/defaults.js');

const S = (o = {}) => ({ ...DEFAULT_SETTINGS, enableTimestamps: false, ...o });
const FM = '---\nstartTime: 09:00:00\n---\n';
const T0 = new Date(); T0.setHours(9, 0, 0, 0);
const at = (min) => new Date(T0.getTime() + min * 60000);
const lines = (c) => c.split(/\r?\n/);
const complete = (line, el = 25, o) => lines(Ops.applyTaskUpdate(FM + line, S(o), at(el), 'complete').content)[3];
const interrupt = (line, el = 25, o) => lines(Ops.applyTaskUpdate(FM + line, S(o), at(el), 'interrupt').content).slice(3, 5);

describe('tags are NOT moved: the line is rewritten in place', () => {
  test('tag right after the checkbox stays there (the reported case)', () => {
    assert.equal(complete('- [ ] #work title ; 30'), '- [x] #work title ; 25m (est 30m) @ 09:00');
  });
  test('several tags at the head', () => {
    assert.equal(complete('- [ ] #a #b title ; 30'), '- [x] #a #b title ; 25m (est 30m) @ 09:00');
  });
  test('tags in the head AND at the end each keep their place', () => {
    assert.equal(complete('- [ ] #a title ; 30 #z'), '- [x] #a title ; 25m (est 30m) @ 09:00 #z');
  });
  test('tag between the estimate and an existing start time; the start is replaced where it was', () => {
    assert.equal(complete('- [ ] #a title ; 30 #z @ 08:00 #y'), '- [x] #a title ; 25m (est 30m) #z @ 09:00 #y');
  });
  test('tag in the middle of the title', () => {
    assert.equal(complete('- [ ] fix #bug in parser ; 30'), '- [x] fix #bug in parser ; 25m (est 30m) @ 09:00');
  });
  test('start before the estimate keeps its order', () => {
    assert.equal(complete('- [ ] #a title @ 08:00 ; 30'), '- [x] #a title @ 09:00 ; 25m (est 30m)');
  });
  test('tags that used to be duplicated or reordered are untouched (no copy at the end)', () => {
    const l = complete('- [ ] #work title ; 30');
    assert.equal((l.match(/#work/g) || []).length, 1);
  });
  test('links, indentation, other bullets', () => {
    assert.equal(complete('  * [ ] #a See [[Note|n]] and [x](u) ; 30'), '  * [x] #a See [[Note|n]] and [x](u) ; 25m (est 30m) @ 09:00');
  });
  test('the old trailing-tag style is unchanged', () => {
    assert.equal(complete('- [ ] title ; 30 #work'), '- [x] title ; 25m (est 30m) @ 09:00 #work');
  });
  test('Japanese text and tags', () => {
    assert.equal(complete('- [ ] #仕事 資料作成 ; 30'), '- [x] #仕事 資料作成 ; 25m (est 30m) @ 09:00');
  });
  test('custom delimiters', () => {
    assert.equal(complete('- [ ] #a title | 30', 25, { taskEstimateDelimiter: '|', startTimeDelimiter: '$' }), '- [x] #a title | 25m (est 30m) $ 09:00');
  });
  test('stamps stay at the very end, after the tags', () => {
    const l = complete('- [ ] #a title ; 30 #z (@created: 2020-01-02 03:04)');
    assert.equal(l, '- [x] #a title ; 25m (est 30m) @ 09:00 #z (@created: 2020-01-02 03:04)');
  });
  test('CRLF stays CRLF', () => {
    const c = Ops.applyTaskUpdate((FM + '- [ ] #a title ; 30\n').replace(/\n/g, '\r\n'), S(), at(10), 'complete').content;
    assert.ok(!/(^|[^\r])\n/.test(c)); assert.match(c, /- \[x\] #a title ; 10m \(est 30m\) @ 09:00\r\n/);
  });
  test('a hand-written (est …) on the open line is not duplicated', () => {
    assert.equal(complete('- [ ] #a title ; 30 (est 1h)'), '- [x] #a title ; 25m (est 30m) @ 09:00');
  });
});

describe('Interrupt keeps tags in place on both lines', () => {
  test('head tag stays on the done part and on the remainder', () => {
    assert.deepEqual(interrupt('- [ ] #work title ; 60'), ['- [x] #work title ; 25m @ 09:00', '- [ ] #work title ; 35']);
  });
  test('an explicit start is dropped from the remainder without leaving stray spaces', () => {
    assert.deepEqual(interrupt('- [ ] #a title ; 60 @ 08:00 #z'), ['- [x] #a title ; 25m @ 09:00 #z', '- [ ] #a title ; 35 #z']);
  });
  test('the remainder gets Created = interrupt time when timestamps are on', () => {
    const c = Ops.applyTaskUpdate(FM + '- [ ] #a title ; 60 #z', S({ enableTimestamps: true }), at(25), 'interrupt').content;
    assert.match(lines(c)[4], /^- \[ \] #a title ; 35 #z \(@created: \d{4}-\d\d-\d\d \d\d:\d\d\)$/);
  });
});

describe('the rewritten document is still understood', () => {
  test('re-parses: names clean (tags are categories), actual / planned read back, next task found', () => {
    const r = Ops.applyTaskUpdate(FM + '- [ ] #work title ; 2h\n- [ ] #life next ; 10', S(), at(140), 'complete');
    const t = TaskParser.fromSettings(S()).filterAndParseTasks(r.content);
    assert.equal(t[0].isCompleted, true); assert.equal(t[0].estimate, '140'); assert.equal(t[0].plannedMinutes, 120);
    assert.deepEqual(t[0].categories, ['work']); assert.equal(t[0].originalTaskName, 'title');
    assert.equal(r.next.originalTaskName, 'next');
  });
  test('completing every task in a row never duplicates tags', () => {
    let c = FM + '- [ ] #a x ; 30\n- [ ] #b y ; 30\n- [ ] #c z ; 30';
    for (let i = 0; i < 3; i++) c = Ops.applyTaskUpdate(c, S(), at(10 + i), 'complete').content;
    for (const [i, tag] of ['#a', '#b', '#c'].entries()) assert.equal((lines(c)[3 + i].match(new RegExp(tag, 'g')) || []).length, 1, lines(c)[3 + i]);
  });
});

describe('head tags (`- [ ] #tag title`) in the parser', () => {
  const parse = (l, o) => TaskParser.fromSettings(S(o)).filterAndParseTasks(FM + l)[0];
  test('originalTaskName never contains the tag; the tag is a category', () => {
    const t = parse('- [ ] #work #deep title ; 30');
    assert.equal(t.originalTaskName, 'title'); assert.deepEqual(t.categories, ['work', 'deep']);
  });
  test('display name hides head tags when showCategoryNamesInTask=false, keeps them when true', () => {
    assert.equal(parse('- [ ] #work title ; 30', { showCategoryNamesInTask: false }).task, 'title');
    assert.equal(parse('- [ ] #work title ; 30', { showCategoryNamesInTask: true }).task, '#work title');
  });
  test('tags in the middle / at the end behave as before', () => {
    assert.equal(parse('- [ ] fix #bug now ; 30 #z', { showCategoryNamesInTask: false }).task, 'fix now');
    assert.equal(parse('- [ ] title ; 30 #z').originalTaskName, 'title');
  });
});
