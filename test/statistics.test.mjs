import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { TaskParser } = require('../out/core/TaskParser.js');
const S = require('../out/core/statistics.js');
const T = require('../out/core/timetable.js');
const { CategoryColors } = require('../out/host/CategoryColors.js');

const parse = (c) => new TaskParser(';', '@', '', true, false, false, '').filterAndParseTasks(c);

describe('categoryPerformance / computeStatistics', () => {
  const tasks = parse('- [x] A ; 20 #w\n- [ ] B ; 30 #w\n- [ ] C ; 10 #p #w\n- [ ] D ; 5\n- [x] E ; 15 #p');
  test('actual = completed, estimated = remaining; multi-category counted in each', () => {
    const p = S.categoryPerformance(tasks);
    assert.deepEqual(p.w, { actualTime: 20, estimatedTime: 40 });
    assert.deepEqual(p.p, { actualTime: 15, estimatedTime: 10 });
  });
  test('rows sorted by total desc; totals, max, uncategorized', () => {
    const s = S.computeStatistics(tasks);
    assert.deepEqual(s.rows.map((r) => [r.category, r.actual, r.estimated, r.total]), [['w', 20, 40, 60], ['p', 15, 10, 25]]);
    assert.equal(s.max, 60);
    assert.deepEqual(s.totals, { actual: 35, estimated: 50, variance: null });
    assert.equal(s.uncategorized, 1);
  });
  test('ties are ordered by category name (stable display)', () => {
    const s = S.computeStatistics(parse('- [ ] a ; 10 #zeta\n- [ ] b ; 10 #alpha\n- [ ] c ; 10 #mid'));
    assert.deepEqual(s.rows.map((r) => r.category), ['alpha', 'mid', 'zeta']);
  });
  test('decimal estimates are summed as decimals', () => {
    const s = S.computeStatistics(parse('- [x] a ; 1.5 #w\n- [ ] b ; 0.25 #w'));
    assert.deepEqual(s.rows[0], { category: 'w', actual: 1.5, estimated: 0.25, total: 1.75, variance: null });
  });
  test('empty / no categories', () => {
    assert.deepEqual(S.computeStatistics([]), { rows: [], max: 0, totals: { actual: 0, estimated: 0, variance: null }, uncategorized: 0 });
    assert.equal(S.computeStatistics(parse('- [ ] a ; 5')).rows.length, 0);
  });
  test('TaskParser.getCategoryPerformance still delegates (back-compat)', () => {
    const p = new TaskParser(';', '@', '', true, false, false, '');
    assert.deepEqual(p.getCategoryPerformance(tasks), S.categoryPerformance(tasks));
  });
});

describe('formatMinutes / barPercent', () => {
  test('formats', () => {
    assert.equal(S.formatMinutes(0), '0m');
    assert.equal(S.formatMinutes(45), '45m');
    assert.equal(S.formatMinutes(60), '1h');
    assert.equal(S.formatMinutes(90), '1h30m');
    assert.equal(S.formatMinutes(1.5), '1.5m');
    assert.equal(S.formatMinutes(61.25), '1h01.3m');
    assert.equal(S.formatMinutes(-5), '0m');
  });
  test('barPercent', () => {
    assert.equal(S.barPercent(30, 60), 50);
    assert.equal(S.barPercent(5, 0), 0);
    assert.equal(S.barPercent(100, 60), 100);
  });
});

describe('setAlpha', () => {
  test('replaces alpha of hsla', () => {
    assert.equal(T.setAlpha('hsla(10, 80%, 80%, 0.3)', 1), 'hsla(10, 80%, 80%, 1)');
    assert.equal(T.setAlpha('hsla(10, 80%, 80%, 1)', 0.05), 'hsla(10, 80%, 80%, 0.05)');
  });
  test('non-hsla untouched', () => assert.equal(T.setAlpha('#ff0000', 0.5), '#ff0000'));
  test('fadeColor == setAlpha 0.05', () => assert.equal(T.fadeColor('hsla(1, 2%, 3%, 0.3)'), 'hsla(1, 2%, 3%, 0.05)'));
});

describe('CategoryColors (single source of truth for both views)', () => {
  const settings = { categoryColors: [{ category: 'a', color: '#ff0000' }], categoryTransparency: 0.3 };
  test('stable across calls so both views agree', () => {
    const cc = new CategoryColors();
    const tasks = parse('- [ ] x ; 5 #a #b #c');
    const first = cc.update(tasks, settings);
    for (let i = 0; i < 5; i++) assert.deepEqual(cc.update(tasks, settings), first);
    assert.equal(first.a, 'hsla(0, 100%, 50%, 0.3)');
  });
  test('returns a copy (callers cannot corrupt state)', () => {
    const cc = new CategoryColors();
    const m = cc.update(parse('- [ ] x ; 5 #b'), settings); m.b = 'tampered';
    assert.notEqual(cc.update(parse('- [ ] x ; 5 #b'), settings).b, 'tampered');
  });
  test('dropped categories disappear; new ones get distinct hues', () => {
    const cc = new CategoryColors();
    cc.update(parse('- [ ] x ; 5 #b #c'), settings);
    const m = cc.update(parse('- [ ] x ; 5 #b #d'), settings);
    assert.deepEqual(Object.keys(m).sort(), ['b', 'd']);
  });
});
