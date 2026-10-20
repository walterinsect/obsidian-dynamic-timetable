import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../out/core/settingsMerge.js');
const { validateTemplates } = require('../out/core/templates.js');
const { sanitizeSettings } = require('../out/core/defaults.js');

describe('mergeColorMap', () => {
  test('map entries are added; array wins on same category', () => {
    const r = M.mergeColorMap([{ category: 'work', color: '#111111' }], { work: '#222222', life: '#333333' });
    assert.deepEqual(r, [{ category: 'life', color: '#333333' }, { category: 'work', color: '#111111' }]);
  });
  test('garbage tolerated; result still goes through sanitizeSettings', () => {
    assert.deepEqual(M.mergeColorMap(undefined, null), []);
    assert.deepEqual(M.mergeColorMap('x', [1]), []);
    const r = sanitizeSettings({ categoryColors: M.mergeColorMap([], { a: '#12345', b: 'ff0000', c: 5 }) }).categoryColors;
    assert.deepEqual(r, [{ category: 'b', color: 'ff0000' }]);
  });
});

describe('mergeTemplateMap', () => {
  test('map entries append after the array; same name in the array wins', () => {
    const r = M.mergeTemplateMap([{ name: 'a', body: 'A' }], { a: 'X', b: '- [ ] b ; 5' });
    assert.deepEqual(r, [{ name: 'a', body: 'A' }, { name: 'b', body: '- [ ] b ; 5' }]);
    const v = validateTemplates(r); assert.deepEqual(v.problems, []); assert.deepEqual(v.templates.map((t) => t.name), ['a', 'b']);
  });
  test('only a map → usable; empty map leaves the original untouched; invalid array is still reported', () => {
    assert.deepEqual(validateTemplates(M.mergeTemplateMap(undefined, { x: '- [ ] x ; 1' })).templates.length, 1);
    assert.equal(M.mergeTemplateMap(undefined, {}), undefined);
    assert.equal(validateTemplates(M.mergeTemplateMap('oops', { x: 'y' })).problems.length, 1);
  });
  test('non-string map values are rejected by validation, not thrown', () => {
    const v = validateTemplates(M.mergeTemplateMap([], { bad: 5, ok: '- [ ] ok ; 1' }));
    assert.deepEqual(v.templates.map((t) => t.name), ['ok']); assert.equal(v.problems.length, 1);
  });
});
