import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const H = require('../out/core/highlight.js');
const { TaskParser } = require('../out/core/TaskParser.js');
const { DEFAULT_SETTINGS } = require('../out/core/defaults.js');

const mk = (o = {}) => TaskParser.fromSettings({ ...DEFAULT_SETTINGS, ...o });
const FM = '---\nstartTime: 09:00:00\n---\n';
const hl = (body, o) => H.computeHighlights(mk(o), FM + body);
const texts = (body, o) => {
  const lines = (FM + body).split('\n');
  return hl(body, o).map((r) => [r.kind, lines[r.line].slice(r.start, r.end)]);
};

describe('computeHighlights', () => {
  test('tag / estimate / start / stamps are located exactly', () => {
    const t = texts('- [ ] a ; 30 @ 09:15 #work #life (@created: 2026-10-21 09:00)');
    assert.deepEqual(t.map((x) => x[1]), ['; 30', '@ 09:15', '#work', '#life', '(@created: 2026-10-21 09:00)']);
    assert.deepEqual(t.map((x) => x[0]), ['estimate', 'start', 'tag', 'tag', 'created']);
  });
  test('completed line: date-time start, Created, line dimmed from the bullet to the end; a legacy (@done) is NOT highlighted', () => {
    const l = '  - [x] a ; 25 @ 2026-10-21 09:12 #w (@created: 2026-10-21 09:00) (@done: 2026-10-21 09:37)';
    const t = texts(l);
    assert.deepEqual(t.find((x) => x[0] === 'start')[1], '@ 2026-10-21 09:12');
    assert.equal(t.find((x) => x[0] === 'done'), undefined);
    assert.deepEqual(t.find((x) => x[0] === 'created')[1], '(@created: 2026-10-21 09:00)');
    assert.deepEqual(t.find((x) => x[0] === 'completed')[1], l.trimStart());
  });
  test('category names are reported on tag ranges', () => {
    assert.deepEqual(hl('- [ ] a ; 5 #work #日本語').filter((r) => r.kind === 'tag').map((r) => r.category), ['work', '日本語']);
  });
  test('only recognized tasks: no estimate, plain text, headings and text after showUntilRegex are ignored', () => {
    const body = '- [ ] no estimate #w\ntext #w ; 5\n- [ ] ok ; 5 #w\n## Memo\n- [ ] after ; 5 #w';
    const r = hl(body, { showUntilRegex: '^## Memo' });
    assert.deepEqual([...new Set(r.map((x) => x.line))], [FM.split('\n').length - 1 + 2]);
  });
  test('"#" and "@" inside a stamp are not read as a tag / start; positions are not shifted', () => {
    const l = '- [ ] a ; 5 (@created: #x @ 09:00) #real';
    const t = texts(l);
    assert.deepEqual(t.filter((x) => x[0] === 'tag').map((x) => x[1]), ['#real']);
    assert.equal(t.filter((x) => x[0] === 'start').length, 0);
    assert.equal(t.find((x) => x[0] === 'created')[1], '(@created: #x @ 09:00)');
  });
  test('custom delimiters', () => {
    const t = texts('- [ ] a | 30 $ 09:15 #w', { taskEstimateDelimiter: '|', startTimeDelimiter: '$' });
    assert.deepEqual(t.map((x) => x[1]).slice(0, 3), ['| 30', '$ 09:15', '#w']);
  });
  test('CRLF documents: ranges never include the \\r and line numbers are right', () => {
    const doc = (FM + '- [x] a ; 5 #w (@done: X)\n- [ ] b ; 5 #w\n').replace(/\n/g, '\r\n');
    const r = H.computeHighlights(mk(), doc);
    const lines = doc.split('\n');
    for (const x of r) assert.ok(!lines[x.line].slice(x.start, x.end).includes('\r'));
    assert.deepEqual([...new Set(r.map((x) => x.line))], [3, 4]);
  });
  test('REGRESSION GUARD: the lines highlighted are exactly the tasks filterAndParseTasks returns', () => {
    const docs = [
      '- [ ] a ; 5\n- [x] b ; 5\n* [ ] c ; 5\n+ [x] d ; 5\n  - [ ] e ; 5\n- [ ] no est\n- [X] upper ; 5\n-[ ] nospace ; 5',
      '- [ ] a ; 5\n---\n- [ ] b ; 5\n## Memo\n- [ ] c ; 5',
      '- [ ] a ; 5.5 @ 09:00\n- [ ] b ; x\n- [x] c ;5 (@done: 1)',
    ];
    for (const body of docs) for (const o of [{}, { showUntilRegex: '^## Memo' }, { dateDelimiter: '^---$' }]) {
      const p = mk(o);
      const expected = p.filterAndParseTasks(FM + body).length;
      assert.equal(p.scanTaskLines(FM + body).length, expected, JSON.stringify([body, o]));
    }
  });
  test('empty / no tasks → no ranges', () => {
    assert.deepEqual(H.computeHighlights(mk(), ''), []);
    assert.deepEqual(hl('just text'), []);
  });
});

describe('options and colors', () => {
  test('sanitizeHighlightOptions: defaults, clamping, invalid colors dropped', () => {
    assert.deepEqual(H.sanitizeHighlightOptions({}), { enabled: true, opacity: 0.2, colors: {}, completedOpacity: 0.55 });
    const o = H.sanitizeHighlightOptions({ enabled: false, opacity: 5, completedOpacity: 0, colors: { estimate: '#112233', created: 'red', done: '#000000', start: '#11223344', bogus: '#000000' } });
    assert.equal(o.enabled, false); assert.equal(o.opacity, 1); assert.equal(o.completedOpacity, 0.1);
    assert.deepEqual(o.colors, { estimate: '#112233', start: '#11223344' });
    assert.equal(H.sanitizeHighlightOptions({ opacity: 'x', colors: [1] }).opacity, 0.2);
  });
  test('resolveHexColor: alpha from opacity for #RRGGBB, kept for #RRGGBBAA', () => {
    assert.equal(H.resolveHexColor('#AABBCC', 0.2), '#aabbcc33');
    assert.equal(H.resolveHexColor('#AABBCC', 1), '#aabbccff');
    assert.equal(H.resolveHexColor('#aabbcc80', 0.2), '#aabbcc80');
  });
  test('withAlpha replaces only the alpha of hsla colors', () => {
    assert.equal(H.withAlpha('hsla(120, 50%, 40%, 0.3)', 0.2), 'hsla(120, 50%, 40%, 0.2)');
    assert.equal(H.withAlpha('rgb(1,2,3)', 0.2), 'rgb(1,2,3)');
  });
});
