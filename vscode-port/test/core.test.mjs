import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { TaskParser } = require('../out/core/TaskParser.js');
const {
  convertHexToHSLA,
  getHSLAColorForCategory,
  getRandomHSLAColor,
} = require('../out/core/ColorUtils.js');

const mk = (o = {}) =>
  new TaskParser(
    o.sep ?? ';', o.at ?? '@', o.date ?? '',
    o.showStart ?? true, o.showEst ?? false, o.showCat ?? false,
    o.until ?? ''
  );
const hm = (d) => d && `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
const ymd = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

describe('parseEstimate', () => {
  const p = mk();
  test('basic', () => assert.equal(p.parseEstimate('- [ ] A ; 30'), '30'));
  test('no spaces', () => assert.equal(p.parseEstimate('- [ ] A;30'), '30'));
  test('missing', () => assert.equal(p.parseEstimate('- [ ] A'), null));
  test('custom separator "|"', () =>
    assert.equal(mk({ sep: '|' }).parseEstimate('- [ ] A | 45'), '45'));
  test('estimate before start time', () =>
    assert.equal(p.parseEstimate('- [ ] A ; 20 @ 14:30'), '20'));
});

describe('parseStartTime', () => {
  const p = mk();
  test('HH:MM', () => assert.equal(hm(p.parseStartTime('- [ ] A ; 10 @ 14:30', 0)), '14:30'));
  test('HHMM', () => assert.equal(hm(p.parseStartTime('- [ ] A ; 10 @ 1430', 0)), '14:30'));
  test('H:MM', () => assert.equal(hm(p.parseStartTime('- [ ] A @ 9:05 ; 10', 0)), '9:05'));
  test('ISO datetime', () => {
    const d = p.parseStartTime('- [ ] A ; 10 @ 2023-04-16T14:30', 0);
    assert.equal(ymd(d), '2023-3-16');
    assert.equal(hm(d), '14:30');
  });
  test('none', () => assert.equal(p.parseStartTime('- [ ] A ; 10', 0), null));
  test('nextDay offset', () => {
    const today = p.parseStartTime('- [ ] A @ 10:00', 0);
    const tmr = p.parseStartTime('- [ ] A @ 10:00', 1);
    assert.equal(Math.round((tmr - today) / 86400000), 1);
  });
});

describe('parseTaskName', () => {
  test('strips checkbox/estimate, keeps start time by default', () => {
    const r = mk().parseTaskName('- [ ] Write report ; 30 @ 14:30');
    assert.equal(r.taskName, 'Write report @14:30');
    assert.equal(r.originalTaskName, 'Write report');
  });
  test('showStartTimeInTaskName=false', () => {
    const r = mk({ showStart: false }).parseTaskName('- [ ] Write ; 30 @ 14:30');
    assert.equal(r.taskName, 'Write');
  });
  test('showEstimateInTaskName=true', () => {
    const r = mk({ showEst: true }).parseTaskName('- [ ] Write ; 30');
    assert.match(r.taskName, /;\s*30/);
  });
  test('wiki link with alias', () =>
    assert.equal(mk().parseTaskName('- [ ] See [[Note|Alias]] ; 5').taskName, 'See Alias'));
  test('wiki link plain', () =>
    assert.equal(mk().parseTaskName('- [ ] See [[Note]] ; 5').taskName, 'See Note'));
  test('markdown link', () =>
    assert.equal(mk().parseTaskName('- [ ] See [site](http://x.y) ; 5').taskName, 'See site'));
  test('category hidden by default', () => {
    const r = mk().parseTaskName('- [ ] Code ; 25 #work');
    assert.equal(r.taskName, 'Code');
    assert.equal(r.originalTaskName, 'Code');
  });
  test('category shown when enabled', () =>
    assert.match(mk({ showCat: true }).parseTaskName('- [ ] Code ; 25 #work').taskName, /#work/));
  test('japanese task name + tag', () => {
    const r = mk().parseTaskName('- [ ] 資料作成 ; 40 #仕事');
    assert.equal(r.taskName, '資料作成');
  });
  test('+ and * bullets, [x]', () => {
    assert.equal(mk().parseTaskName('+ [x] A ; 1').taskName, 'A');
    assert.equal(mk().parseTaskName('* [ ] B ; 1').taskName, 'B');
  });
});

describe('filterAndParseTasks', () => {
  test('ignores non-task lines & tasks without estimate', () => {
    const t = mk().filterAndParseTasks('# H\ntext\n- [ ] noest\n- [ ] A ; 10\n- item');
    assert.equal(t.length, 1);
    assert.equal(t[0].task, 'A');
  });

  test('chains end times from yaml startTime', () => {
    const c = '---\nstartTime: 09:00:00\n---\n- [ ] A ; 30\n- [ ] B ; 15\n- [ ] C ; 45';
    const t = mk().filterAndParseTasks(c);
    assert.deepEqual(t.map((x) => hm(x.startTime)), ['9:00', '9:30', '9:45']);
    assert.deepEqual(t.map((x) => hm(x.endTime)), ['9:30', '9:45', '10:30']);
  });

  test('completed tasks flagged; yaml start applies to first UNcompleted', () => {
    const c = '---\nstartTime: 10:00:00\n---\n- [x] Done ; 20 @ 09:00\n- [ ] Now ; 30\n- [ ] Next ; 10';
    const t = mk().filterAndParseTasks(c);
    assert.equal(t[0].isCompleted, true);
    assert.equal(hm(t[0].startTime), '9:00');
    assert.equal(hm(t[1].startTime), '10:00');
    assert.equal(hm(t[2].startTime), '10:30');
  });

  test('originalStartTime true only for explicit @', () => {
    const c = '---\nstartTime: 09:00:00\n---\n- [ ] A ; 30\n- [ ] B ; 10 @ 12:00\n- [ ] C ; 5';
    const t = mk().filterAndParseTasks(c);
    assert.deepEqual(t.map((x) => x.originalStartTime), [false, true, false]);
    assert.equal(hm(t[1].startTime), '12:00');
    assert.equal(hm(t[2].startTime), '12:10');
  });

  test('first uncompleted task with explicit @ is overridden by yaml startTime', () => {
    const c = '---\nstartTime: 09:00:00\n---\n- [ ] A ; 30 @ 15:00';
    const t = mk().filterAndParseTasks(c);
    assert.equal(hm(t[0].startTime), '9:00');
    assert.equal(t[0].originalStartTime, true);
  });

  test('no yaml: first startTime is null (host must fill it)', () => {
    const t = mk().filterAndParseTasks('- [ ] A ; 30\n- [ ] B ; 10');
    assert.equal(t[0].startTime, null);
    assert.equal(t[0].endTime, null);
    assert.equal(t[1].startTime, null);
  });

  test('categories collected (multiple)', () => {
    const t = mk().filterAndParseTasks('- [ ] A ; 10 #work #deep');
    assert.deepEqual(t[0].categories, ['work', 'deep']);
  });

  test('dateDelimiter advances day after first uncompleted', () => {
    const c = '---\nstartTime: 09:00:00\n---\n- [ ] A ; 30\n---\n- [ ] B ; 10 @ 08:00';
    const t = mk({ date: '^---$' }).filterAndParseTasks(c);
    assert.equal(t.length, 2);
    const diffDays = Math.round((t[1].startTime - t[0].startTime) / 86400000);
    assert.equal(diffDays, 1);
    assert.equal(hm(t[1].startTime), '8:00');
  });

  test('YAML front matter "---" does not shift days', () => {
    const c = '---\nstartTime: 09:00:00\n---\n- [ ] A ; 30 @ 10:00';
    const t = mk({ date: '^---$' }).filterAndParseTasks(c);
    assert.equal(ymd(t[0].startTime), ymd(new Date()));
  });

  test('showUntilRegex stops parsing', () => {
    const c = '- [ ] A ; 10\n- [ ] B ; 10\n## Later\n- [ ] C ; 10';
    const t = mk({ until: '^## Later' }).filterAndParseTasks(c);
    assert.deepEqual(t.map((x) => x.task), ['A', 'B']);
  });

  test('indented (nested) tasks are parsed (lines are trimmed)', () => {
    const t = mk().filterAndParseTasks('  - [ ] A ; 10');
    assert.equal(t.length, 1);
  });

  test('CRLF line endings', () => {
    const t = mk().filterAndParseTasks('---\r\nstartTime: 09:00:00\r\n---\r\n- [ ] A ; 30\r\n- [ ] B ; 10\r\n');
    assert.equal(t.length, 2);
    assert.equal(hm(t[1].startTime), '9:30');
  });
});

describe('getYamlStartTime', () => {
  const p = mk();
  test('parses', () => {
    const d = p.getYamlStartTime('---\nstartTime: 08:15:42\n---');
    assert.equal(hm(d), '8:15');
    assert.equal(d.getSeconds(), 42);
  });
  test('absent', () => assert.equal(p.getYamlStartTime('x'), null));
});

describe('getCategoryPerformance', () => {
  test('sums actual (completed) vs estimated (pending) per category', () => {
    const p = mk();
    const t = p.filterAndParseTasks(
      '- [x] A ; 20 #w\n- [ ] B ; 30 #w\n- [ ] C ; 10 #p #w\n- [ ] D ; 5'
    );
    const perf = p.getCategoryPerformance(t);
    assert.deepEqual(perf.w, { actualTime: 20, estimatedTime: 40 });
    assert.deepEqual(perf.p, { actualTime: 0, estimatedTime: 10 });
    assert.equal(Object.keys(perf).length, 2);
  });
});

describe('ColorUtils', () => {
  test('hex → hsla primaries', () => {
    assert.equal(convertHexToHSLA('#ff0000', 0.3), 'hsla(0, 100%, 50%, 0.3)');
    assert.equal(convertHexToHSLA('#00ff00', 1), 'hsla(120, 100%, 50%, 1)');
    assert.equal(convertHexToHSLA('#0000ff', 1), 'hsla(240, 100%, 50%, 1)');
  });
  test('hex → hsla gray / white / black', () => {
    assert.equal(convertHexToHSLA('#808080', 1), 'hsla(0, 0%, 50%, 1)');
    assert.equal(convertHexToHSLA('#ffffff', 1), 'hsla(0, 0%, 100%, 1)');
    assert.equal(convertHexToHSLA('#000000', 1), 'hsla(0, 0%, 0%, 1)');
  });
  test('hex without # ', () =>
    assert.equal(convertHexToHSLA('ff0000', 1), 'hsla(0, 100%, 50%, 1)'));
  test('getHSLAColorForCategory swaps alpha', () =>
    assert.equal(
      getHSLAColorForCategory('a', 0.5, { a: 'hsla(10, 80%, 80%, 0.3)' }),
      'hsla(10, 80%, 80%, 0.5)'
    ));
  test('random hue: format and first call', () =>
    assert.match(getRandomHSLAColor(0.3), /^hsla\(\d+, 80%, 80%, 0.3\)$/));
  test('random hue: maximizes distance from existing', () => {
    const h = Number(getRandomHSLAColor(1, [0]).match(/hsla\((\d+)/)[1]);
    assert.equal(h, 180);
  });
  test('random hue: avoids existing hues', () => {
    const existing = [0, 120, 240];
    for (let i = 0; i < 20; i++) {
      const h = Number(getRandomHSLAColor(1, existing).match(/hsla\((\d+)/)[1]);
      assert.ok(!existing.includes(h));
    }
  });
});

describe('issue 1: decimal estimates', () => {
  test('parseEstimate keeps decimals', () => {
    assert.equal(mk().parseEstimate('- [ ] A ; 1.5'), '1.5');
    assert.equal(mk().parseEstimate('- [ ] A ; 30'), '30');
  });
  test('task name has no leftover fragment', () => {
    assert.equal(mk().parseTaskName('- [ ] A ; 1.5').taskName, 'A');
    assert.equal(mk().parseTaskName('- [ ] A ; 1.5 @ 10:00').originalTaskName, 'A');
  });
  test('end time honours fractional minutes (1.5 min = 90 s)', () => {
    const t = mk().filterAndParseTasks('---\nstartTime: 09:00:00\n---\n- [ ] A ; 1.5\n- [ ] B ; 10');
    assert.equal(t[0].endTime - t[0].startTime, 90000);
    assert.equal(t[1].startTime.getTime(), t[0].endTime.getTime());
  });
  test('category performance sums decimals', () => {
    const p = mk();
    const t = p.filterAndParseTasks('- [x] A ; 1.5 #w\n- [x] B ; 2.5 #w\n- [ ] C ; 0.5 #w');
    assert.deepEqual(p.getCategoryPerformance(t).w, { actualTime: 4, estimatedTime: 0.5 });
  });
});

describe('issue 2: invalid regex settings', () => {
  test('invalid dateDelimiter does not throw; warning recorded', () => {
    let p;
    assert.doesNotThrow(() => { p = mk({ date: '[' }); });
    assert.equal(p.warnings.length, 1);
    assert.match(p.warnings[0], /dateDelimiter/);
    assert.equal(p.filterAndParseTasks('- [ ] A ; 10').length, 1);
  });
  test('invalid showUntilRegex does not throw; never matches', () => {
    let p;
    assert.doesNotThrow(() => { p = mk({ until: '(' }); });
    assert.match(p.warnings[0], /showUntilRegex/);
    assert.equal(p.filterAndParseTasks('- [ ] A ; 10\n- [ ] B ; 10').length, 2);
  });
  test('valid settings produce no warnings', () => {
    assert.deepEqual(mk({ date: '^---$', until: '^## ' }).warnings, []);
  });
});

describe('issue 3: start times must not inherit current seconds/ms', () => {
  test('explicit @HH:MM has 0 seconds and 0 ms', () => {
    const d = mk().parseStartTime('- [ ] A @ 11:00', 0);
    assert.equal(d.getSeconds(), 0);
    assert.equal(d.getMilliseconds(), 0);
  });
  test('yaml startTime has 0 ms', () => {
    assert.equal(mk().getYamlStartTime('---\nstartTime: 09:00:07\n---').getMilliseconds(), 0);
  });
  test('gap between chained and explicit times is exact', () => {
    const t = mk().filterAndParseTasks('---\nstartTime: 09:00:00\n---\n- [ ] A ; 30\n- [ ] B ; 10 @ 11:00');
    assert.equal(t[1].startTime - t[0].endTime, 90 * 60000);
  });
});
