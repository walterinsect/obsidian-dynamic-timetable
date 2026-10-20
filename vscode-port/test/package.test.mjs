import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const { DEFAULT_SETTINGS, sanitizeSettings } = require('../out/core/defaults.js');
const extSrc = readFileSync('src/extension.ts', 'utf8');
const providerSrc = readFileSync('src/ext/TimetableProvider.ts', 'utf8');
const sections = pkg.contributes.configuration;
const props = Object.assign({}, ...sections.map((x) => x.properties));

describe('package.json consistency', () => {
  test('every setting default equals DEFAULT_SETTINGS', () => {
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      assert.ok(props[`dynamicTimetable.${k}`], `missing contributes for ${k}`);
      assert.deepEqual(props[`dynamicTimetable.${k}`].default, v, k);
    }
  });
  test('no contributed setting is unknown to the code', () => {
    const known = new Set([...Object.keys(DEFAULT_SETTINGS), 'autoSaveAfterUpdate', 'targetLanguages', 'taskTemplates', 'taskTemplateMap', 'categoryColorMap']);
    for (const key of Object.keys(props)) assert.ok(known.has(key.replace('dynamicTimetable.', '')), key);
  });
  test('contributed defaults survive sanitizeSettings unchanged (schema ⊂ validator)', () => {
    const raw = {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) raw[k] = props[`dynamicTimetable.${k}`].default;
    assert.deepEqual(sanitizeSettings(raw), DEFAULT_SETTINGS);
  });
  test('every contributed command is registered in extension.ts, and vice versa', () => {
    const contributed = pkg.contributes.commands.map((c) => c.command).sort();
    // registerCommand('…') と、スロット用に並べた ID リテラルの両方を拾う
    const registered = [...new Set([...extSrc.matchAll(/'(dynamicTimetable\.[A-Za-z0-9]+)'/g)].map((m) => m[1]))].sort();
    assert.deepEqual(registered, contributed);
  });
  test('contributed view ids == provider viewTypes (both views)', () => {
    const ids = pkg.contributes.views.dynamicTimetable.map((v) => v.id).sort();
    const src = providerSrc + readFileSync('src/ext/StatisticsProvider.ts', 'utf8');
    const types = [...src.matchAll(/viewType = '([^']+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(types, ids);
    assert.equal(pkg.contributes.viewsContainers.activitybar[0].id, 'dynamicTimetable');
  });
  test('every bundle a provider loads is built by esbuild and shipped in the vsix', () => {
    const esb = readFileSync('esbuild.config.mjs', 'utf8');
    const ign = readFileSync('.vscodeignore', 'utf8');
    for (const f of ['src/ext/TimetableProvider.ts', 'src/ext/StatisticsProvider.ts']) {
      const js = readFileSync(f, 'utf8').match(/'(\w+\.js)'/)[1];
      assert.ok(esb.includes(js.replace('.js', ':')), `${js} not built`);
      assert.ok(ign.includes(`!dist/${js}`), `${js} not packaged`);
    }
    for (const a of ['webview.css', 'codicon.css', 'codicon.ttf']) assert.ok(ign.includes(`!dist/${a}`), a);
  });
  test('customUrlScheme is user-level only (a cloned repo cannot make the extension launch URLs)', () => {
    assert.equal(props['dynamicTimetable.customUrlScheme'].scope, 'application');
  });
  test('manifest basics', () => {
    assert.equal(pkg.main, './dist/extension.js');
    assert.match(pkg.engines.vscode, /^\^1\.\d+\.\d+$/);
    assert.equal(pkg.license, 'MIT');
  });
  test('engine floor is not newer than @types/vscode', () => {
    const types = JSON.parse(readFileSync('node_modules/@types/vscode/package.json', 'utf8')).version;
    const floor = pkg.engines.vscode.replace('^', '');
    const cmp = (a, b) => a.split('.').map(Number).reduce((r, x, i) => r || x - Number(b.split('.')[i]), 0);
    assert.ok(cmp(floor, types) <= 0, `${floor} > ${types}`);
  });
  test('LICENSE keeps the original copyright notice', () => {
    const l = readFileSync('LICENSE.md', 'utf8');
    assert.match(l, /Copyright \(c\) 2023 L7Cy/);
  });

  test('template slots 1-5 are contributed with titles', () => {
    for (let n = 1; n <= 5; n++) {
      const c = pkg.contributes.commands.find((x) => x.command === `dynamicTimetable.insertTaskTemplate${n}`);
      assert.ok(c, `slot ${n}`); assert.match(c.title, new RegExp(`Template ${n}$`));
    }
  });
  test('no default keybindings are shipped (user binds them)', () => assert.equal(pkg.contributes.keybindings, undefined));
  test('taskTemplates schema: default [], objects need name+body; timestamps default ON', () => {
    const t = props['dynamicTimetable.taskTemplates'];
    assert.deepEqual(t.default, []); assert.deepEqual(t.items.required, ['name', 'body']);
    assert.equal(props['dynamicTimetable.enableTimestamps'].default, true);
  });
  test('schema default for timestampFormat passes the runtime validator', () => {
    const { isValidTimestampFormat } = require('../out/core/stamps.js');
    assert.ok(isValidTimestampFormat(props['dynamicTimetable.timestampFormat'].default));
  });

  test('settings UI: grouped into titled sections with unique, sequential order; every setting has a description', () => {
    assert.ok(Array.isArray(sections) && sections.length >= 5);
    for (const sec of sections) assert.ok(sec.title && sec.properties && Object.keys(sec.properties).length, sec.title);
    const orders = Object.values(props).map((p) => p.order);
    assert.deepEqual([...orders].sort((a, b) => a - b), orders.map((_, i) => i));
    for (const [k, v] of Object.entries(props)) assert.ok(v.description || v.markdownDescription, k);
  });
  test('settings UI: GUI-editable key/value settings exist for the object-array settings', () => {
    for (const k of ['categoryColorMap', 'taskTemplateMap']) {
      const p = props[`dynamicTimetable.${k}`];
      assert.equal(p.type, 'object'); assert.equal(p.additionalProperties.type, 'string'); assert.deepEqual(p.default, {});
    }
  });
  test('Open Settings command is contributed', () => {
    assert.ok(pkg.contributes.commands.some((c) => c.command === 'dynamicTimetable.openSettings'));
    assert.match(extSrc, /@ext:walterinsect\.dynamic-timetable/);
  });
});
