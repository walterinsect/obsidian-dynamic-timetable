import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../out/core/templates.js');
const { DEFAULT_SETTINGS } = require('../out/core/defaults.js');

const now = new Date(2026, 9, 21, 9, 12);
const doc = '---\nstartTime: 09:00:00\n---\n- [ ] A ; 30\n  - [ ] B ; 10\n\nnote\n- [ ] C ; 5\n';
const lines = ['- [ ] x ; 5'];
const apply = (c, ins) => c.slice(0, ins.offset) + ins.text + c.slice(ins.offset);
const build = (c, cursor, mode = 'plain', body = lines) => T.buildInsertion(c, DEFAULT_SETTINGS, body, mode, now, cursor);

describe('planInsertion with a cursor', () => {
  test('no cursor → unchanged behavior (after the current task)', () => {
    assert.equal(apply(doc, build(doc, undefined)).split('\n')[4], '- [ ] x ; 5');
  });
  test('cursor on a later task line → inserted after THAT line', () => {
    const r = apply(doc, build(doc, { line: 7, character: 4 })).split('\n');
    assert.deepEqual(r.slice(7, 9), ['- [ ] C ; 5', '- [ ] x ; 5']);
  });
  test('cursor on an indented task: new lines take that indent (plain mode)', () => {
    const r = apply(doc, build(doc, { line: 4, character: 0 })).split('\n');
    assert.deepEqual(r.slice(4, 6), ['  - [ ] B ; 10', '  - [ ] x ; 5']);
  });
  test('cursor on a non-task line (note) → after it', () => {
    const r = apply(doc, build(doc, { line: 6, character: 2 })).split('\n');
    assert.deepEqual(r.slice(6, 8), ['note', '- [ ] x ; 5']);
  });
  test('cursor on a blank line → inserted in place, no extra newline (inline)', () => {
    const ins = build(doc, { line: 5, character: 0 });
    assert.equal(ins.plan.inline, true);
    assert.equal(apply(doc, ins).split('\n').slice(4, 7).join('|'), '  - [ ] B ; 10|- [ ] x ; 5|note');
  });
  test('multi-line template on a whitespace-only line keeps later lines indented to that line', () => {
    const c = '- [ ] A ; 5\n    \n';
    const r = apply(c, build(c, { line: 1, character: 4 }, 'plain', ['- [ ] a ; 1', '- [ ] b ; 2'])).split('\n');
    assert.deepEqual(r.slice(1, 3), ['    - [ ] a ; 1', '    - [ ] b ; 2']);
  });
  test('snippet mode: non-inline text starts with a newline, inline has none', () => {
    assert.equal(build(doc, { line: 7, character: 0 }, 'snippet').text, '\n- [ ] x ; 5');
    assert.equal(build(doc, { line: 5, character: 0 }, 'snippet').text, '- [ ] x ; 5');
  });
  test('cursor inside front matter (incl. the --- lines) is ignored', () => {
    for (const line of [0, 1, 2]) assert.equal(apply(doc, build(doc, { line, character: 1 })).split('\n')[4], '- [ ] x ; 5', String(line));
  });
  test('cursor past EOF / invalid → falls back; CRLF documents keep CRLF', () => {
    assert.equal(apply(doc, build(doc, { line: 999, character: 0 })).split('\n')[4], '- [ ] x ; 5');
    assert.equal(apply(doc, build(doc, { line: -1, character: 0 })).split('\n')[4], '- [ ] x ; 5');
    const crlf = doc.replace(/\n/g, '\r\n');
    const out = apply(crlf, build(crlf, { line: 7, character: 0 }));
    assert.ok(!/(^|[^\r])\n/.test(out));
    assert.deepEqual(out.split('\r\n').slice(7, 9), ['- [ ] C ; 5', '- [ ] x ; 5']);
  });
  test('cursor on the last line without trailing newline → appended after it', () => {
    const c = '- [ ] A ; 5\n- [ ] B ; 5';
    assert.equal(apply(c, build(c, { line: 1, character: 2 })), '- [ ] A ; 5\n- [ ] B ; 5\n- [ ] x ; 5');
  });
});
