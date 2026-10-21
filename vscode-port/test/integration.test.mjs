import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createVscode } = require('./helpers/vscodeMock.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, '0');
const hms = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const minutesAgo = (m) => new Date(Date.now() - m * 60000);

let env, ext, ctx, fresh = false;
// load(): 新しい vscode モック環境を作る。直後の boot() はその環境を再利用する(ドキュメントを同じ環境で作るため)
const load = () => {
  fresh = true;
  env = createVscode();
  const origLoad = Module._load;
  Module._load = function (req, ...rest) { return req === 'vscode' ? env.vscode : origLoad.call(this, req, ...rest); };
  try {
    delete require.cache[require.resolve('../dist/extension.js')];
    ext = require('../dist/extension.js');
  } finally { Module._load = origLoad; }
};
const boot = (doc, config = {}) => {
  if (!fresh) load();
  fresh = false;
  Object.assign(env.state.config, config);
  if (doc) { const ed = env.makeEditor(doc); env.state.activeTextEditor = ed; env.state.visibleTextEditors = [ed]; }
  ctx = { extensionUri: env.vscode.Uri.file('/ext'), subscriptions: [] };
  ext.activate(ctx);
  const { p, opts } = env.state.providers.get('dynamicTimetable.timetable');
  const v = env.makeView();
  p.resolveWebviewView(v.view);
  const sp = env.state.providers.get('dynamicTimetable.statistics');
  const openStats = () => { const sv = env.makeView(); sp.p.resolveWebviewView(sv.view); return sv; };
  return { provider: p, opts, openStats, ...v };
};
const lastUpdate = (posted) => [...posted].reverse().find((m) => m.type === 'update');

describe('extension integration (bundled dist/extension.js on a vscode mock)', () => {
  test('activate registers both view providers (retainContext) and 14 commands', () => {
    const { opts } = boot(undefined);
    assert.equal(opts.webviewOptions.retainContextWhenHidden, true);
    assert.equal(env.state.providers.get('dynamicTimetable.statistics').opts.webviewOptions.retainContextWhenHidden, true);
    assert.deepEqual([...env.state.commands.keys()].sort(), [
      'dynamicTimetable.complete', 'dynamicTimetable.interrupt', 'dynamicTimetable.pinFile',
      'dynamicTimetable.refresh', 'dynamicTimetable.show', 'dynamicTimetable.showStatistics',
      'dynamicTimetable.unpinFile', 'dynamicTimetable.insertTaskTemplate', 'dynamicTimetable.openSettings',
      ...[1, 2, 3, 4, 5].map((n) => `dynamicTimetable.insertTaskTemplate${n}`)].sort());
  });

  test('webview html is set with strict CSP and localResourceRoots', () => {
    load(); const doc = env.makeDoc('- [ ] A ; 5');
    const { view } = boot(doc);
    assert.match(view.webview.html, /default-src 'none'/);
    assert.doesNotMatch(view.webview.html, /unsafe-/);
    assert.equal(view.webview.options.enableScripts, true);
    assert.equal(view.webview.options.localResourceRoots.length, 1);
  });

  test('ready → update with tasks as ISO strings + view settings', async () => {
    load(); const doc = env.makeDoc(`---\nstartTime: ${hms(minutesAgo(10))}\n---\n- [ ] A ; 30 #w\n- [ ] B ; 10`);
    const { handlers, posted } = boot(doc);
    await handlers.msg({ type: 'ready' });
    const u = lastUpdate(posted);
    assert.equal(u.tasks.length, 2);
    assert.equal(typeof u.tasks[0].startTime, 'string');
    assert.ok(!isNaN(Date.parse(u.tasks[0].endTime)));
    assert.deepEqual(u.tasks[0].categories, ['w']);
    assert.equal(u.settings.showProgressBar, true);
    assert.equal('customUrlScheme' in u.settings, false, 'host-only settings must not leak to the webview');
  });

  test('no target document → friendly warning, no tasks', async () => {
    const { handlers, posted } = boot(undefined);
    await handlers.msg({ type: 'ready' });
    const u = lastUpdate(posted);
    assert.deepEqual(u.tasks, []);
    assert.match(u.warnings[0], /No Markdown file/);
  });

  test('non-markdown active editor is ignored', async () => {
    load(); const doc = env.makeDoc('- [ ] A ; 5', { lang: 'typescript' });
    const { handlers, posted } = boot(doc);
    await handlers.msg({ type: 'ready' });
    assert.deepEqual(lastUpdate(posted).tasks, []);
  });

  test('complete: minimal edit applied once, file saved, view refreshed', async () => {
    load(); const doc = env.makeDoc(`# Plan\n\n---\nstartTime: ${hms(minutesAgo(20))}\n---\n- [ ] A ; 30 #w\n- [ ] B ; 10\n`);
    // front matter is not at the file start here -> parser still uses startTime line; ops creates one at top
    const { handlers, posted } = boot(doc);
    await handlers.msg({ type: 'ready' });
    const before = posted.length;
    await handlers.msg({ type: 'complete' });
    assert.equal(env.state.applyEdits, 1);
    assert.equal(env.state.saves, 1);
    assert.equal(doc.isDirty, false);
    assert.match(doc.text, /- \[x\] A ; 20 @ \d{4}-\d\d-\d\d \d\d:\d\d #w \(@done: /);
    assert.match(doc.text, /- \[ \] B ; 10/);
    assert.ok(posted.length > before, 'refreshed after complete');
    assert.equal(lastUpdate(posted).tasks[0].isCompleted, true);
  });

  test('autoSaveAfterUpdate=false → left dirty, not saved', async () => {
    load(); const doc = env.makeDoc(`---\nstartTime: ${hms(minutesAgo(5))}\n---\n- [ ] A ; 30`);
    const { handlers } = boot(doc, { autoSaveAfterUpdate: false });
    await handlers.msg({ type: 'complete' });
    assert.equal(env.state.saves, 0); assert.equal(doc.isDirty, true);
  });

  test('untitled documents are never auto-saved (would open a dialog)', async () => {
    load(); const doc = env.makeDoc(`---\nstartTime: ${hms(minutesAgo(5))}\n---\n- [ ] A ; 30`, { untitled: true });
    const { handlers } = boot(doc);
    await handlers.msg({ type: 'complete' });
    assert.equal(env.state.saves, 0);
  });

  test('interrupt splits the task', async () => {
    load(); const doc = env.makeDoc(`---\nstartTime: ${hms(minutesAgo(15))}\n---\n- [ ] Deep ; 60`);
    const { handlers } = boot(doc);
    await handlers.msg({ type: 'interrupt' });
    assert.match(doc.text, /- \[x\] Deep ; 15 @ \d{4}-\d\d-\d\d \d\d:\d\d \(@done: [^)]+\)\n- \[ \] Deep ; 45 \(@created: /);
  });

  test('complete with nothing to do → info message, document untouched', async () => {
    load(); const doc = env.makeDoc('# nothing here');
    const { handlers } = boot(doc);
    await handlers.msg({ type: 'complete' });
    assert.equal(doc.text, '# nothing here');
    assert.ok(env.state.messages.some((m) => /no uncompleted task/.test(m.text)));
  });

  test('customUrlScheme opens the NEXT task url on complete', async () => {
    load(); const doc = env.makeDoc(`---\nstartTime: ${hms(minutesAgo(5))}\n---\n- [ ] A ; 30\n- [ ] Next up ; 25`);
    const { handlers } = boot(doc, { customUrlScheme: 'timer://start?m={{minutes}}&n={{taskName}}' });
    await handlers.msg({ type: 'complete' });
    assert.deepEqual(env.state.external, ['timer://start?m=25&n=Next%20up']);
  });

  test('no customUrlScheme → nothing opened', async () => {
    load(); const doc = env.makeDoc(`---\nstartTime: ${hms(minutesAgo(5))}\n---\n- [ ] A ; 30\n- [ ] B ; 5`);
    const { handlers } = boot(doc);
    await handlers.msg({ type: 'complete' });
    assert.deepEqual(env.state.external, []);
  });

  test('typing in the target doc triggers a debounced refresh (burst → one update)', async () => {
    load(); const doc = env.makeDoc('- [ ] A ; 5');
    const { handlers, posted } = boot(doc);
    await handlers.msg({ type: 'ready' }); const n = posted.length;
    for (let i = 0; i < 5; i++) env.state.emit.changeDoc.fire({ document: doc, contentChanges: [{}] });
    env.state.emit.changeDoc.fire({ document: env.makeDoc('other'), contentChanges: [{}] }); // 別ファイルは無視
    await sleep(400);
    assert.equal(posted.length - n, 1);
  });

  test('configuration change refreshes with new settings', async () => {
    load(); const doc = env.makeDoc('- [ ] A ; 5');
    const { handlers, posted } = boot(doc);
    await handlers.msg({ type: 'ready' });
    env.state.config.showEstimate = true;
    env.state.emit.changeConfig.fire({ affectsConfiguration: (s) => s === 'dynamicTimetable' });
    await sleep(100);
    assert.equal(lastUpdate(posted).settings.showEstimate, true);
  });

  test('invalid user setting is sanitized (bad regex → warning, not crash)', async () => {
    load(); const doc = env.makeDoc('- [ ] A ; 5');
    const { handlers, posted } = boot(doc, { dateDelimiter: '[', intervalTime: -3, taskEstimateDelimiter: '' });
    await handlers.msg({ type: 'ready' });
    const u = lastUpdate(posted);
    assert.equal(u.tasks.length, 1);
    assert.match(u.warnings[0], /dateDelimiter/);
    assert.equal(u.settings.intervalTime, 1);
  });

  test('notify: overdue shows once per transition; "Complete task" action completes', async () => {
    load(); const doc = env.makeDoc(`---\nstartTime: ${hms(minutesAgo(40))}\n---\n- [ ] A ; 30`);
    const { handlers } = boot(doc);
    env.state.answers['Dynamic Timetable: Are you finished?'] = 'Complete task';
    await handlers.msg({ type: 'notify', kind: 'overdue', active: true });
    await handlers.msg({ type: 'notify', kind: 'overdue', active: true });  // 重複は無視
    assert.equal(env.state.messages.filter((m) => /finished/.test(m.text)).length, 1);
    assert.match(doc.text, /- \[x\] A ; 40/);
    await handlers.msg({ type: 'notify', kind: 'overdue', active: false });
    await handlers.msg({ type: 'notify', kind: 'overdue', active: true });  // 遷移後は再度表示
    assert.equal(env.state.messages.filter((m) => /finished/.test(m.text)).length, 2);
  });

  test('notify: lateStart warns once', async () => {
    load(); const { handlers } = boot(env.makeDoc('- [ ] A ; 5'));
    await handlers.msg({ type: 'notify', kind: 'lateStart', active: true });
    await handlers.msg({ type: 'notify', kind: 'lateStart', active: true });
    assert.equal(env.state.messages.filter((m) => m.kind === 'warn' && /start later/.test(m.text)).length, 1);
  });

  test('pin keeps the file when another editor becomes active; unpin releases it', async () => {
    load(); const a = env.makeDoc('- [ ] A ; 5'); const b = env.makeDoc('- [ ] B ; 5');
    const { handlers, posted } = boot(a);
    await env.state.commands.get('dynamicTimetable.pinFile')();
    env.state.emit.activeEditor.fire({ document: b });
    await handlers.msg({ type: 'ready' });
    assert.equal(lastUpdate(posted).tasks[0].originalTaskName, 'A');
    env.state.activeTextEditor = { document: b };
    await env.state.commands.get('dynamicTimetable.unpinFile')();
    await handlers.msg({ type: 'ready' });
    assert.equal(lastUpdate(posted).tasks[0].originalTaskName, 'B');
  });

  test('switching active markdown editor follows it; focusing a non-markdown one keeps the last target', async () => {
    load(); const a = env.makeDoc('- [ ] A ; 5'); const b = env.makeDoc('- [ ] B ; 5'); const ts = env.makeDoc('x', { lang: 'typescript' });
    const { handlers, posted } = boot(a);
    env.state.emit.activeEditor.fire({ document: b }); env.state.emit.activeEditor.fire({ document: ts });
    await handlers.msg({ type: 'ready' });
    assert.equal(lastUpdate(posted).tasks[0].originalTaskName, 'B');
  });

  test('closing the target document clears it', async () => {
    load(); const a = env.makeDoc('- [ ] A ; 5');
    const { handlers, posted } = boot(a);
    env.state.emit.closeDoc.fire(a);
    await handlers.msg({ type: 'ready' });
    assert.deepEqual(lastUpdate(posted).tasks, []);
  });

  test('a failing edit surfaces an error message instead of throwing into VS Code', async () => {
    load(); const doc = env.makeDoc(`---\nstartTime: ${hms(minutesAgo(5))}\n---\n- [ ] A ; 30`);
    const { handlers } = boot(doc);
    env.vscode.workspace.applyEdit = async () => false;
    await handlers.msg({ type: 'complete' });
    assert.ok(env.state.messages.some((m) => m.kind === 'error' && /Failed to apply edit/.test(m.text)));
  });

  // ---------------- Statistics ----------------
  test('statistics view: html uses statistics.js + shared css, strict CSP', () => {
    load(); const { openStats } = boot(env.makeDoc('- [ ] A ; 5 #w'));
    const sv = openStats();
    assert.match(sv.view.webview.html, /statistics\.js/);
    assert.match(sv.view.webview.html, /webview\.css/);
    assert.doesNotMatch(sv.view.webview.html, /unsafe-/);
    assert.doesNotMatch(sv.view.webview.html, /timetable\.js/);
  });

  test('statistics: ready → update with tasks, categories and colors', async () => {
    load(); const doc = env.makeDoc(`---\nstartTime: ${hms(minutesAgo(5))}\n---\n- [x] A ; 20 #w\n- [ ] B ; 30 #w #p`);
    const { openStats } = boot(doc);
    const sv = openStats();
    await sv.handlers.msg({ type: 'ready' });
    const u = lastUpdate(sv.posted);
    assert.equal(u.tasks.length, 2);
    assert.deepEqual(Object.keys(u.colors).sort(), ['p', 'w']);
    assert.match(u.colors.w, /^hsla\(/);
  });

  test('Timetable and Statistics receive IDENTICAL category colors (host is the single source)', async () => {
    load(); const doc = env.makeDoc('- [ ] A ; 5 #a #b #c #d');
    const { handlers, posted, openStats } = boot(doc);
    const sv = openStats();
    await handlers.msg({ type: 'ready' });
    await sv.handlers.msg({ type: 'ready' });
    await handlers.msg({ type: 'refresh' });
    assert.deepEqual(lastUpdate(posted).colors, lastUpdate(sv.posted).colors);
    assert.equal(Object.keys(lastUpdate(posted).colors).length, 4);
  });

  test('configured category color reaches both views', async () => {
    load(); const doc = env.makeDoc('- [ ] A ; 5 #work');
    const { handlers, posted, openStats } = boot(doc, { categoryColors: [{ category: 'work', color: '#ff0000' }] });
    const sv = openStats();
    await handlers.msg({ type: 'ready' }); await sv.handlers.msg({ type: 'ready' });
    assert.equal(lastUpdate(posted).colors.work, 'hsla(0, 100%, 50%, 0.3)');
    assert.equal(lastUpdate(sv.posted).colors.work, 'hsla(0, 100%, 50%, 0.3)');
  });

  test('editing the document refreshes BOTH views', async () => {
    load(); const doc = env.makeDoc('- [ ] A ; 5 #w');
    const { handlers, posted, openStats } = boot(doc);
    const sv = openStats();
    await handlers.msg({ type: 'ready' }); await sv.handlers.msg({ type: 'ready' });
    const n1 = posted.length, n2 = sv.posted.length;
    env.state.emit.changeDoc.fire({ document: doc, contentChanges: [{}] });
    await sleep(400);
    assert.equal(posted.length - n1, 1); assert.equal(sv.posted.length - n2, 1);
  });

  test('Complete in Timetable is reflected in Statistics (actual vs remaining)', async () => {
    load(); const doc = env.makeDoc(`---\nstartTime: ${hms(minutesAgo(10))}\n---\n- [ ] A ; 30 #w\n- [ ] B ; 15 #w`);
    const { handlers, openStats } = boot(doc);
    const sv = openStats();
    await sv.handlers.msg({ type: 'ready' });
    await handlers.msg({ type: 'complete' });
    env.state.emit.changeDoc.fire({ document: doc, contentChanges: [{}] }); // 実 VS Code では applyEdit が発火する
    await sleep(400);
    const u = lastUpdate(sv.posted);
    assert.deepEqual(u.tasks.map((t) => t.isCompleted), [true, false]);
    assert.equal(u.tasks[0].estimate, '10');
  });

  test('statistics: no target → friendly warning, no colors', async () => {
    const { openStats } = boot(undefined);
    const sv = openStats();
    await sv.handlers.msg({ type: 'ready' });
    const u = lastUpdate(sv.posted);
    assert.deepEqual(u.tasks, []); assert.deepEqual(u.colors, {});
    assert.match(u.warnings[0], /No Markdown file/);
  });

  test('statistics view ignores Timetable-only messages (complete/notify do nothing)', async () => {
    load(); const doc = env.makeDoc(`---\nstartTime: ${hms(minutesAgo(5))}\n---\n- [ ] A ; 30`);
    const { openStats } = boot(doc);
    const sv = openStats();
    await sv.handlers.msg({ type: 'complete' });
    await sv.handlers.msg({ type: 'notify', kind: 'overdue', active: true });
    assert.equal(doc.text.includes('[x]'), false);
    assert.equal(env.state.messages.length, 0);
  });

  test('showStatistics command focuses the statistics view', async () => {
    boot(undefined);
    await env.state.commands.get('dynamicTimetable.showStatistics')();
    assert.equal(env.state.executed, 'dynamicTimetable.statistics.focus');
  });

  // ---------------- Templates ----------------
  const TPLS = [
    { name: 'break', body: '- [ ] 休憩 ; 15 #life' },
    { name: 'review', body: ['- [ ] ${1:対象}レビュー ; ${2:30} #work', '- [ ] 指摘対応 ; 20 #work'] },
    { name: 'plain2', body: '- [ ] 確認 ; 5' },
  ];
  const planDoc = () => `---\nstartTime: ${hms(minutesAgo(5))}\n---\n- [ ] 現在 ; 30\n- [ ] 次 ; 10\n`;
  const cmd = (id) => env.state.commands.get(id);

  test('no templates defined → info message; "Open Settings" opens the setting', async () => {
    load(); const doc = env.makeDoc(planDoc()); boot(doc);
    env.state.answers['Dynamic Timetable: no task templates are defined.'] = 'Open Settings';
    await cmd('dynamicTimetable.insertTaskTemplate')();
    assert.equal(doc.text, planDoc().replace(/startTime: .*/, `startTime: ${doc.text.match(/startTime: (.*)/)[1]}`));
    assert.equal(env.state.executed, 'workbench.action.openSettings');
    assert.deepEqual(env.state.executedArgs, ['dynamicTimetable.taskTemplates']);
  });

  test('QuickPick lists templates; pick inserts the snippet (editor visible; cursor in front matter → after the current task)', async () => {
    load(); const doc = env.makeDoc(planDoc()); boot(doc, { taskTemplates: TPLS, enableTimestamps: false });
    env.state.quickPickPick = 'review';
    await cmd('dynamicTimetable.insertTaskTemplate')();
    const q = env.state.quickPicks[0].items;
    assert.deepEqual(q.map((i) => i.label), ['break', 'review', 'plain2']);
    assert.equal(q[1].description, '- [ ] ${1:対象}レビュー ; ${2:30} #work');
    assert.equal(q[1].detail, '+1 more line(s)');
    // スニペットは展開せずそのまま VS Code に渡す(タブ停止を生かす)
    assert.equal(env.state.snippets.length, 1);
    assert.equal(env.state.snippets[0].value, '\n- [ ] ${1:対象}レビュー ; ${2:30} #work\n- [ ] 指摘対応 ; 20 #work');
    // 挿入位置は「現在」の行末
    const before = planDoc().replace(/startTime: .*/, `startTime: ${doc.text.match(/startTime: (.*)/)[1]}`);
    const cut = before.indexOf('- [ ] 現在 ; 30') + '- [ ] 現在 ; 30'.length;
    assert.equal(env.state.snippets[0].offset, cut);
    assert.ok(doc.text.indexOf('レビュー') > doc.text.indexOf('現在') && doc.text.indexOf('レビュー') < doc.text.indexOf('- [ ] 次'));
  });

  test('CURSOR: inserts after the line the cursor is on, not after the current task', async () => {
    load(); const doc = env.makeDoc(planDoc()); boot(doc, { taskTemplates: TPLS, enableTimestamps: false });
    const lineOf = (t) => doc.text.split('\n').findIndex((l) => l.startsWith(t));
    env.state.cursor = { line: lineOf('- [ ] 次'), character: 3 }; // 「次」の行の途中
    await cmd('dynamicTimetable.insertTaskTemplate')('break');
    assert.equal(env.state.snippets[0].value, '\n- [ ] 休憩 ; 15 #life');
    const l = doc.text.split('\n');
    assert.deepEqual(l.slice(l.findIndex((x) => x.startsWith('- [ ] 現在'))).slice(0, 4), ['- [ ] 現在 ; 30', '- [ ] 次 ; 10', '- [ ] 休憩 ; 15 #life', '']);
  });

  test('CURSOR: on a blank line the template goes exactly there (no extra newline)', async () => {
    load(); const doc = env.makeDoc(planDoc() + '\n');
    boot(doc, { taskTemplates: TPLS, enableTimestamps: false });
    env.state.cursor = { line: doc.text.split('\n').length - 1, character: 0 };
    await cmd('dynamicTimetable.insertTaskTemplate')('break');
    assert.equal(env.state.snippets[0].value, '- [ ] 休憩 ; 15 #life');
    assert.ok(doc.text.endsWith('- [ ] 次 ; 10\n\n- [ ] 休憩 ; 15 #life') || doc.text.endsWith('- [ ] 次 ; 10\n- [ ] 休憩 ; 15 #life'), JSON.stringify(doc.text.slice(-40)));
  });

  test('CURSOR inside the front matter is ignored → falls back to after the current task', async () => {
    load(); const doc = env.makeDoc(planDoc()); boot(doc, { taskTemplates: TPLS, enableTimestamps: false });
    env.state.cursor = { line: 1, character: 2 };
    await cmd('dynamicTimetable.insertTaskTemplate')('break');
    const l = doc.text.split('\n');
    assert.equal(l[0], '---'); assert.match(l[1], /^startTime: /);
    assert.deepEqual(l.slice(3, 6), ['- [ ] 現在 ; 30', '- [ ] 休憩 ; 15 #life', '- [ ] 次 ; 10']);
  });

  test('editor is focused for tab stops: showTextDocument(viewColumn, preserveFocus:false)', async () => {
    load(); const doc = env.makeDoc(planDoc()); boot(doc, { taskTemplates: TPLS });
    await cmd('dynamicTimetable.insertTaskTemplate')('break');
    assert.equal(env.state.shown.length, 1);
    assert.deepEqual(env.state.shown[0].opts, { viewColumn: 1, preserveFocus: false });
  });

  test('picker cancelled → nothing happens', async () => {
    load(); const doc = env.makeDoc(planDoc()); boot(doc, { taskTemplates: TPLS });
    const t = doc.text; env.state.quickPickPick = undefined;
    await cmd('dynamicTimetable.insertTaskTemplate')();
    assert.equal(doc.text, t); assert.equal(env.state.snippets.length, 0);
  });

  test('keybinding-style args: by name, { template: name }, { template: number }, number', async () => {
    load(); const doc = env.makeDoc(planDoc()); boot(doc, { taskTemplates: TPLS });
    for (const arg of ['break', { template: 'break' }, { template: 1 }, 1]) {
      env.state.snippets.length = 0;
      await cmd('dynamicTimetable.insertTaskTemplate')(arg);
      assert.equal(env.state.snippets.length, 1, JSON.stringify(arg));
      assert.match(env.state.snippets[0].value, /休憩 ; 15 #life/, JSON.stringify(arg));
    }
    assert.equal(env.state.quickPicks.length, 0, 'no picker when an argument names the template');
  });

  test('slot commands insert the Nth template', async () => {
    load(); const doc = env.makeDoc(planDoc()); boot(doc, { taskTemplates: TPLS });
    await cmd('dynamicTimetable.insertTaskTemplate3')();
    assert.match(env.state.snippets.at(-1).value, /確認 ; 5/);
    await cmd('dynamicTimetable.insertTaskTemplate1')();
    assert.match(env.state.snippets.at(-1).value, /休憩 ; 15/);
  });

  test('unknown name / undefined slot → warning, no insertion', async () => {
    load(); const doc = env.makeDoc(planDoc()); boot(doc, { taskTemplates: TPLS });
    await cmd('dynamicTimetable.insertTaskTemplate')('nope');
    await cmd('dynamicTimetable.insertTaskTemplate5')();
    assert.equal(env.state.snippets.length, 0);
    assert.ok(env.state.messages.some((m) => /Template "nope" is not defined/.test(m.text)));
    assert.ok(env.state.messages.some((m) => /slot 5 is not defined/.test(m.text)));
  });

  test('unrecognised argument (e.g. a Uri from a menu) falls back to the picker', async () => {
    load(); const doc = env.makeDoc(planDoc()); boot(doc, { taskTemplates: TPLS });
    env.state.quickPickPick = 'break';
    await cmd('dynamicTimetable.insertTaskTemplate')({ scheme: 'file', path: '/x' });
    assert.equal(env.state.quickPicks.length, 1); assert.equal(env.state.snippets.length, 1);
  });

  test('NO visible editor for the target → plain insertion with defaults, one edit, saved', async () => {
    load(); const doc = env.makeDoc(planDoc()); boot(doc, { taskTemplates: TPLS, enableTimestamps: false });
    env.state.visibleTextEditors = []; env.state.activeTextEditor = undefined;
    await cmd('dynamicTimetable.insertTaskTemplate')('review');
    assert.equal(env.state.snippets.length, 0);
    assert.equal(env.state.applyEdits, 1); assert.equal(env.state.saves, 1);
    assert.match(doc.text, /- \[ \] 現在 ; 30\n- \[ \] 対象レビュー ; 30 #work\n- \[ \] 指摘対応 ; 20 #work\n- \[ \] 次 ; 10/);
    assert.ok(!doc.text.includes('${'));
  });

  test('plain insertion with autoSaveAfterUpdate=false stays dirty', async () => {
    load(); const doc = env.makeDoc(planDoc()); boot(doc, { taskTemplates: TPLS, autoSaveAfterUpdate: false });
    env.state.visibleTextEditors = []; env.state.activeTextEditor = undefined;
    await cmd('dynamicTimetable.insertTaskTemplate')('break');
    assert.equal(env.state.saves, 0); assert.equal(doc.isDirty, true);
  });

  test('timestamps ON: inserted tasks get (@created: now); explicitly OFF: none; DEFAULT is ON', async () => {
    load(); const d1 = env.makeDoc(planDoc()); boot(d1, { taskTemplates: TPLS, enableTimestamps: true });
    await cmd('dynamicTimetable.insertTaskTemplate')('break');
    assert.match(env.state.snippets[0].value, /^\n- \[ \] 休憩 ; 15 #life \(@created: \d{4}-\d\d-\d\d \d\d:\d\d\)$/);
    load(); const d2 = env.makeDoc(planDoc()); boot(d2, { taskTemplates: TPLS, enableTimestamps: false });
    await cmd('dynamicTimetable.insertTaskTemplate')('break');
    assert.equal(env.state.snippets[0].value, '\n- [ ] 休憩 ; 15 #life');
    load(); const d3 = env.makeDoc(planDoc()); boot(d3, { taskTemplates: TPLS });
    await cmd('dynamicTimetable.insertTaskTemplate')('break');
    assert.match(env.state.snippets[0].value, /\(@created: \d{4}-\d\d-\d\d \d\d:\d\d\)$/);
  });

  test('timestamp format setting is honoured (and an invalid one falls back)', async () => {
    load(); const d = env.makeDoc(planDoc()); boot(d, { taskTemplates: TPLS, enableTimestamps: true, timestampFormat: 'HH:mm' });
    await cmd('dynamicTimetable.insertTaskTemplate')('break');
    assert.match(env.state.snippets[0].value, /\(@created: \d\d:\d\d\)$/);
    load(); const d2 = env.makeDoc(planDoc()); boot(d2, { taskTemplates: TPLS, enableTimestamps: true, timestampFormat: 'bad)' });
    await cmd('dynamicTimetable.insertTaskTemplate')('break');
    assert.match(env.state.snippets[0].value, /\(@created: \d{4}-\d\d-\d\d \d\d:\d\d\)$/);
  });

  test('GUI key/value setting taskTemplateMap works as a template source (and array wins on same name)', async () => {
    load(); const doc = env.makeDoc(planDoc());
    boot(doc, { taskTemplates: [], taskTemplateMap: { 会議: '- [ ] 会議 ; 30 #mtg' }, enableTimestamps: false });
    await cmd('dynamicTimetable.insertTaskTemplate')('会議');
    assert.equal(env.state.snippets[0].value, '\n- [ ] 会議 ; 30 #mtg');
    load(); const d2 = env.makeDoc(planDoc());
    boot(d2, { taskTemplates: [{ name: '会議', body: '- [ ] ARRAY ; 1' }], taskTemplateMap: { 会議: '- [ ] MAP ; 2' }, enableTimestamps: false });
    await cmd('dynamicTimetable.insertTaskTemplate')('会議');
    assert.match(env.state.snippets[0].value, /ARRAY/);
  });

  test('GUI key/value setting categoryColorMap reaches the view', async () => {
    load(); const doc = env.makeDoc(`---\nstartTime: ${hms(minutesAgo(1))}\n---\n- [ ] A ; 30 #work`);
    const { handlers, posted } = boot(doc, { categoryColorMap: { work: '#ff0000' } });
    await handlers.msg({ type: 'ready' });
    assert.ok(JSON.stringify(lastUpdate(posted)).toLowerCase().includes('ff0000'));
  });

  test('Open Settings command opens the settings UI filtered to this extension', async () => {
    load(); boot(env.makeDoc(planDoc()));
    await cmd('dynamicTimetable.openSettings')();
    assert.equal(env.state.executed, 'workbench.action.openSettings');
    assert.deepEqual(env.state.executedArgs, ['@ext:walterinsect.dynamic-timetable']);
  });

  test('invalid templates are reported but valid ones still work', async () => {
    load(); const doc = env.makeDoc(planDoc()); boot(doc, { taskTemplates: [{ name: 'bad' }, ...TPLS] });
    await cmd('dynamicTimetable.insertTaskTemplate')('break');
    assert.ok(env.state.messages.some((m) => m.kind === 'warn' && /ignored invalid task template/.test(m.text) && /bad/.test(m.text)));
    assert.equal(env.state.snippets.length, 1);
  });

  test('no target document → warning', async () => {
    boot(undefined, { taskTemplates: TPLS });
    await cmd('dynamicTimetable.insertTaskTemplate')('break');
    assert.ok(env.state.messages.some((m) => /no target Markdown file/.test(m.text)));
  });

  test('insertSnippet returning false → error message', async () => {
    load(); const doc = env.makeDoc(planDoc()); boot(doc, { taskTemplates: TPLS });
    env.state.insertSnippetResult = false;
    await cmd('dynamicTimetable.insertTaskTemplate')('break');
    assert.ok(env.state.messages.some((m) => m.kind === 'error' && /failed to insert/.test(m.text)));
  });

  // ---------------- Timestamps (Complete / Interrupt through the view) ----------------
  test('Complete: DEFAULT settings write date-time start + (@done: …); explicit OFF writes time-only, no stamps', async () => {
    load(); const on = env.makeDoc(`---\nstartTime: ${hms(minutesAgo(10))}\n---\n- [ ] A ; 30 #w`);
    const a = boot(on);
    await a.handlers.msg({ type: 'complete' });
    assert.match(on.text, /- \[x\] A ; 10 @ \d{4}-\d\d-\d\d \d\d:\d\d #w \(@done: \d{4}-\d\d-\d\d \d\d:\d\d\)/);
    load(); const off = env.makeDoc(`---\nstartTime: ${hms(minutesAgo(10))}\n---\n- [ ] A ; 30 #w`);
    const b = boot(off, { enableTimestamps: false });
    await b.handlers.msg({ type: 'complete' });
    assert.ok(!off.text.includes('(@'));
    assert.match(off.text, /- \[x\] A ; 10 @ \d\d:\d\d #w$/m);
  });

  test('Interrupt: done line has Done, remaining task has Created (interrupt time)', async () => {
    load(); const doc = env.makeDoc(`---\nstartTime: ${hms(minutesAgo(15))}\n---\n- [ ] Deep ; 60 #w (@created: 2020-01-02 03:04)`);
    const { handlers } = boot(doc, { enableTimestamps: true });
    await handlers.msg({ type: 'interrupt' });
    const l = doc.text.split('\n');
    assert.match(l[3], /^- \[x\] Deep ; 15 @ \d{4}-\d\d-\d\d \d\d:\d\d #w \(@created: 2020-01-02 03:04\) \(@done: \d{4}-\d\d-\d\d \d\d:\d\d\)$/);
    assert.match(l[4], /^- \[ \] Deep ; 45 #w \(@created: \d{4}-\d\d-\d\d \d\d:\d\d\)$/);
    assert.ok(!l[4].includes('2020-01-02'), 'remaining task must NOT inherit the original Created');
  });

  test('stamps never leak into the webview: names are clean, categories intact', async () => {
    load(); const doc = env.makeDoc(`---\nstartTime: ${hms(minutesAgo(1))}\n---\n- [ ] A ; 30 #w (@created: 2026-10-21 09:00)`);
    const { handlers, posted } = boot(doc);
    await handlers.msg({ type: 'ready' });
    const t = lastUpdate(posted).tasks[0];
    assert.equal(t.task, 'A'); assert.deepEqual(t.categories, ['w']);
  });
});
