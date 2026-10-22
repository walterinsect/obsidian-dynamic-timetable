import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../out/core/templates.js');
const { TaskManager } = require('../out/host/TaskManager.js');
const { DEFAULT_SETTINGS } = require('../out/core/defaults.js');
const { TaskParser } = require('../out/core/TaskParser.js');

const S = (o = {}) => ({ ...DEFAULT_SETTINGS, ...o });
const ON = S({ enableTimestamps: true });
const OFF = S({ enableTimestamps: false });
const DD = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const today = (h, m, s = 0) => { const d = new Date(); d.setHours(h, m, s, 0); return d; };
const yaml = '---\nstartTime: 09:00:00\n---\n';
const apply = (content, plan) => content.slice(0, plan.offset) + plan.text + content.slice(plan.offset);

describe('validateTemplates / sanitizeTemplates', () => {
  test('valid: string and array bodies, trimmed, blank lines dropped', () => {
    const { templates, problems } = T.validateTemplates([
      { name: ' break ', body: '- [ ] 休憩 ; 15 #life\n\n' },
      { name: 'review', body: ['- [ ] a ; 1', '', '- [ ] b ; 2   '] },
    ]);
    assert.deepEqual(problems, []);
    assert.deepEqual(templates, [{ name: 'break', body: ['- [ ] 休憩 ; 15 #life'] }, { name: 'review', body: ['- [ ] a ; 1', '- [ ] b ; 2'] }]);
  });
  test('multi-line strings inside an array are split into lines', () =>
    assert.deepEqual(T.sanitizeTemplates([{ name: 'x', body: ['- [ ] a ; 1\n- [ ] b ; 2'] }])[0].body, ['- [ ] a ; 1', '- [ ] b ; 2']));
  test('undefined / null → nothing, no problems', () => {
    assert.deepEqual(T.validateTemplates(undefined), { templates: [], problems: [] });
    assert.deepEqual(T.validateTemplates(null), { templates: [], problems: [] });
  });
  test('non-array → problem', () => assert.equal(T.validateTemplates({}).problems.length, 1));
  test('invalid entries are dropped with a reason', () => {
    const { templates, problems } = T.validateTemplates([
      null, 5, {}, { name: '', body: 'x' }, { name: 'nobody' }, { name: 'bad', body: 3 }, { name: 'bad2', body: [1] },
      { name: 'empty', body: ['  ', ''] }, { name: 'long', body: 'x'.repeat(301) }, { name: 'many', body: Array(21).fill('- [ ] a ; 1') },
      { name: 'n'.repeat(61), body: 'x' }, { name: 'ok', body: '- [ ] a ; 1' }, { name: 'ok', body: '- [ ] dup ; 1' },
    ]);
    assert.deepEqual(templates.map((t) => t.name), ['ok']);
    assert.equal(problems.length, 12);
    assert.ok(problems.some((p) => /duplicate/.test(p)));
  });
  test('more than 50 templates → rest ignored, reported once', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ name: `t${i}`, body: '- [ ] a ; 1' }));
    const { templates, problems } = T.validateTemplates(many);
    assert.equal(templates.length, 50); assert.equal(problems.length, 1);
  });
});

describe('parseTemplateRef / findTemplate', () => {
  const tpls = T.sanitizeTemplates([{ name: 'a', body: 'x' }, { name: 'b', body: 'y' }]);
  test('forms', () => {
    assert.deepEqual(T.parseTemplateRef('a'), { name: 'a' });
    assert.deepEqual(T.parseTemplateRef(2), { index: 2 });
    assert.deepEqual(T.parseTemplateRef({ template: 'b' }), { name: 'b' });
    assert.deepEqual(T.parseTemplateRef({ template: 1 }), { index: 1 });
    assert.deepEqual(T.parseTemplateRef({ name: 'a' }), { name: 'a' });
  });
  test('invalid → undefined', () => {
    for (const bad of [undefined, null, '', '  ', 0, -1, 1.5, {}, [], true, { template: '' }]) assert.equal(T.parseTemplateRef(bad), undefined, JSON.stringify(bad));
  });
  test('find by name (exact) / 1-based index / missing', () => {
    assert.equal(T.findTemplate(tpls, { name: 'b' }).body[0], 'y');
    assert.equal(T.findTemplate(tpls, { index: 1 }).name, 'a');
    assert.equal(T.findTemplate(tpls, { index: 3 }), undefined);
    assert.equal(T.findTemplate(tpls, { name: 'A' }), undefined);
  });
});

describe('prepareBody (Created stamp)', () => {
  const t = { name: 'x', body: ['- [ ] a ; 5 #w', '  - [ ] b ; 3', 'note line', '- [x] done ; 1', '- [ ] c ; 2 (@created: KEEP)'] };
  const now = new Date(2026, 9, 21, 9, 12);
  test('OFF: body untouched', () => assert.deepEqual(T.prepareBody(t, OFF, now), t.body));
  test('DEFAULT settings = ON: stamps with date-time default format', () => assert.match(T.prepareBody(t, DEFAULT_SETTINGS, now)[0], /\(@created: \d{4}-\d{2}-\d{2} 09:12\)$/));
  test('ON: stamps unchecked task lines only, never double-stamps', () => {
    assert.deepEqual(T.prepareBody(t, ON, now), [
      '- [ ] a ; 5 #w (@created: 2026-10-21 09:12)', '  - [ ] b ; 3 (@created: 2026-10-21 09:12)', 'note line', '- [x] done ; 1', '- [ ] c ; 2 (@created: KEEP)']);
  });
  test('ON: custom format', () =>
    assert.equal(T.prepareBody({ name: 'x', body: ['- [ ] a ; 5'] }, S({ enableTimestamps: true, timestampFormat: 'HH:mm' }), now)[0], '- [ ] a ; 5 (@created: 09:12)'));
  test('does not mutate the template', () => { const before = JSON.stringify(t); T.prepareBody(t, ON, now); assert.equal(JSON.stringify(t), before); });
});

describe('expandSnippet', () => {
  const now = new Date(2026, 0, 5, 7, 3, 9);
  const E = (s) => T.expandSnippet(s, now);
  test('placeholders → defaults, tabstops → empty', () => {
    assert.equal(E('- [ ] ${1:タスク} ; ${2:30} #work'), '- [ ] タスク ; 30 #work');
    assert.equal(E('a$1b${2}c$0'), 'abc');
  });
  test('nested placeholder', () => assert.equal(E('${1:a ${2:b}}!'), 'a b!'));
  test('choice → first', () => assert.equal(E('${1|15,30,60|} min'), '15 min'));
  test('CURRENT_* variables (zero padded, 24h)', () => {
    assert.equal(E('$CURRENT_YEAR-$CURRENT_MONTH-$CURRENT_DATE $CURRENT_HOUR:$CURRENT_MINUTE:$CURRENT_SECOND'), '2026-01-05 07:03:09');
    assert.equal(E('${CURRENT_YEAR_SHORT}'), '26');
  });
  test('unknown variable → its name (like VS Code); default used when given', () => {
    assert.equal(E('$FOO'), 'FOO'); assert.equal(E('${FOO}'), 'FOO'); assert.equal(E('${FOO:bar}'), 'bar');
    assert.equal(E('${CURRENT_YEAR:ignored}'), '2026');
  });
  test('escapes', () => {
    assert.equal(E('\\$1'), '$1'); assert.equal(E('a\\}b'), 'a}b'); assert.equal(E('\\\\'), '\\'); assert.equal(E('\\n'), '\\n');
    assert.equal(E('${1:a\\}b}'), 'a}b');
  });
  test('stray $ is literal', () => { assert.equal(E('cost $ 5'), 'cost $ 5'); assert.equal(E('end$'), 'end$'); assert.equal(E('$-'), '$-'); });
  test('variable transform is ignored (value only)', () => assert.equal(E('${CURRENT_YEAR/(.*)/x/}'), '2026'));
  test('malformed input terminates without hanging', () => {
    assert.equal(E('${1:abc'), 'abc');
    assert.equal(typeof E('${'), 'string'); assert.equal(typeof E('${1|a,b'), 'string'); assert.equal(typeof E('${FOO/'), 'string');
  });
  test('text without $ or backslash is returned unchanged (Japanese, #, @, brackets)', () => {
    const s = '- [ ] 資料作成 ; 40 @ 10:00 #仕事 [[リンク]] (@created: 2026-10-21 09:12)';
    assert.equal(E(s), s);
  });
});

describe('planInsertion / buildInsertion', () => {
  const B = ['- [ ] new ; 5'];
  const build = (c, o = {}, mode = 'plain', lines = B) => T.buildInsertion(c, S(o), lines, mode, today(9, 0));

  test('inserts right AFTER the current task line (not at the end of the list)', () => {
    const c = yaml + '- [x] done ; 5 @ 08:00\n- [ ] cur ; 30\n- [ ] later ; 10\n';
    const r = build(c);
    assert.equal(apply(c, r), yaml + '- [x] done ; 5 @ 08:00\n- [ ] cur ; 30\n- [ ] new ; 5\n- [ ] later ; 10\n');
    assert.equal(r.plan.anchorLine, 4);
  });
  test('skips an earlier completed task; current task = first uncompleted WITH estimate', () => {
    const c = '- [x] a ; 1\n- [ ] no estimate here\n- [ ] cur ; 30\n- [ ] z ; 1';
    assert.equal(apply(c, build(c)), '- [x] a ; 1\n- [ ] no estimate here\n- [ ] cur ; 30\n- [ ] new ; 5\n- [ ] z ; 1');
  });
  test('last line without trailing newline', () => {
    const c = '- [ ] cur ; 30';
    assert.equal(apply(c, build(c)), '- [ ] cur ; 30\n- [ ] new ; 5');
  });
  test('indented current task → new lines get the same indent (plain)', () => {
    const c = '  - [ ] cur ; 30\n  - [ ] b ; 1';
    assert.equal(apply(c, build(c)), '  - [ ] cur ; 30\n  - [ ] new ; 5\n  - [ ] b ; 1');
  });
  test('multi-line template stays together and in order', () => {
    const c = '- [ ] cur ; 30\n- [ ] z ; 1';
    assert.equal(apply(c, build(c, {}, 'plain', ['- [ ] a ; 1', '- [ ] b ; 2'])), '- [ ] cur ; 30\n- [ ] a ; 1\n- [ ] b ; 2\n- [ ] z ; 1');
  });
  test('CRLF document: inserted with CRLF, offset before the CR', () => {
    const c = '- [ ] cur ; 30\r\n- [ ] z ; 1\r\n';
    const out = apply(c, build(c));
    assert.equal(out, '- [ ] cur ; 30\r\n- [ ] new ; 5\r\n- [ ] z ; 1\r\n');
    assert.ok(!/(^|[^\r])\n/.test(out));
  });
  test('no current task (all done) → after the LAST checkbox line', () => {
    const c = '# Plan\n- [x] a ; 1\n- [x] b ; 2\n\nnotes\n';
    assert.equal(apply(c, build(c)), '# Plan\n- [x] a ; 1\n- [x] b ; 2\n- [ ] new ; 5\n\nnotes\n');
  });
  test('no tasks at all → appended at end of file (keeps trailing newline)', () => {
    assert.equal(apply('# Notes\n', build('# Notes\n')), '# Notes\n- [ ] new ; 5\n');
    assert.equal(apply('# Notes', build('# Notes')), '# Notes\n- [ ] new ; 5');
  });
  test('empty file', () => assert.equal(apply('', build('')), '- [ ] new ; 5'));
  test('front matter only', () => {
    const c = '---\nstartTime: 09:00:00\n---\n';
    assert.equal(apply(c, build(c)), c + '- [ ] new ; 5\n');
  });
  test('snippet mode: lines are passed through untouched with \\n; placeholders preserved', () => {
    const c = '  - [ ] cur ; 30\n';
    const r = build(c, {}, 'snippet', ['- [ ] ${1:name} ; ${2:30}', '- [ ] b ; 2']);
    assert.equal(r.text, '\n- [ ] ${1:name} ; ${2:30}\n- [ ] b ; 2');   // インデントは VS Code が基準行に合わせる
    assert.equal(c.slice(0, r.offset), '  - [ ] cur ; 30');
  });
  test('plain mode expands placeholders to defaults', () => {
    const c = '- [ ] cur ; 30';
    assert.equal(apply(c, build(c, {}, 'plain', ['- [ ] ${1:name} ; ${2:30} $CURRENT_HOUR:$CURRENT_MINUTE'])), '- [ ] cur ; 30\n- [ ] name ; 30 09:00');
  });
  test('the inserted text re-parses as a task right after the current one', () => {
    const c = yaml + '- [ ] cur ; 30\n- [ ] later ; 10';
    const out = apply(c, build(c, {}, 'plain', ['- [ ] ${1:出張準備} ; ${2:20} #trip']));
    const t = TaskParser.fromSettings(DEFAULT_SETTINGS).filterAndParseTasks(out);
    assert.deepEqual(t.map((x) => x.originalTaskName), ['cur', '出張準備', 'later']);
    assert.equal(t[1].estimate, '20'); assert.deepEqual(t[1].categories, ['trip']);
  });
});

describe('TaskManager: templates', () => {
  const fakePort = (text) => { const p = { text, writes: 0, getText: () => p.text, getMtimeMs: async () => 0, replaceAll: async (t) => { await new Promise((r) => setTimeout(r, 3)); p.text = t; p.writes++; } }; return p; };
  const tpl = { name: 'n', body: ['- [ ] ${1:x} ; 5 #w'] };

  test('insertTemplate: ONE write, correct place, stamp when enabled', async () => {
    const port = fakePort(yaml + '- [ ] cur ; 30\n- [ ] z ; 1');
    const tm = new TaskManager(() => ON, () => new Date(2026, 9, 21, 9, 12));
    await tm.insertTemplate(port, tpl);
    assert.equal(port.writes, 1);
    assert.equal(port.text, yaml + '- [ ] cur ; 30\n- [ ] x ; 5 #w (@created: 2026-10-21 09:12)\n- [ ] z ; 1');
  });
  test('stamp OFF when disabled', async () => {
    const port = fakePort('- [ ] cur ; 30');
    await new TaskManager(() => OFF).insertTemplate(port, tpl);
    assert.equal(port.text, '- [ ] cur ; 30\n- [ ] x ; 5 #w');
  });
  test('planTemplate does not write', () => {
    const port = fakePort('- [ ] cur ; 30');
    new TaskManager(() => DEFAULT_SETTINGS).planTemplate(port, tpl, 'snippet');
    assert.equal(port.writes, 0);
  });
  test('rapid double insert + complete are serialized (no lost update)', async () => {
    const port = fakePort(yaml + '- [ ] cur ; 30');
    const tm = new TaskManager(() => DEFAULT_SETTINGS, () => today(9, 10));
    await Promise.all([tm.insertTemplate(port, tpl), tm.insertTemplate(port, tpl), tm.complete(port)]);
    assert.equal(port.writes, 3);
    assert.equal((port.text.match(/\] x ; 5 #w/g) || []).length, 2);
    assert.ok(port.text.includes('- [x] cur ; 10'));
  });
  test('insert → complete flow: new task becomes the NEXT task after Complete', async () => {
    const port = fakePort(yaml + '- [ ] cur ; 30\n- [ ] later ; 10');
    const tm = new TaskManager(() => ON, () => today(9, 10));
    await tm.insertTemplate(port, tpl);
    const r = await tm.complete(port);
    assert.equal(r.next.originalTaskName, 'x');
    assert.match(port.text, new RegExp('- \\[x\\] cur ; 10m \\(est 30m\\) @ ' + DD + ' 09:00$', 'm'));
    assert.match(port.text, /- \[ \] x ; 5 #w \(@created: /);
  });
});
