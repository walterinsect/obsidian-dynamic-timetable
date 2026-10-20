// 結合テスト用の最小 vscode モック(extension が実際に使う API だけ)
class Emitter { constructor(){this.l=[];this.event=(f)=>{this.l.push(f);return {dispose:()=>{this.l=this.l.filter(x=>x!==f);}};};} fire(v){[...this.l].forEach(f=>f(v));} dispose(){this.l=[];} }
class Position { constructor(offset){this.offset=offset;} }
class Range { constructor(s,e){this.start=s;this.end=e;} }
const Uri = {
  file: (p) => ({ scheme: 'file', path: p, toString() { return 'file://' + p; } }),
  parse: (s) => ({ raw: s, toString() { return s; } }),
  joinPath: (b, ...parts) => Uri.file([b.path, ...parts].join('/')),
};
class SnippetString { constructor(v = '') { this.value = v; } }
class WorkspaceEdit { constructor(){this.ops=[];} replace(uri,range,text){this.ops.push({uri,range,text});} }

function createVscode() {
  const state = {
    config: {}, messages: [], answers: {}, external: [], commands: new Map(), providers: new Map(),
    saves: 0, applyEdits: 0, snippets: [], shown: [], quickPicks: [], quickPickPick: undefined, executedArgs: [], insertSnippetResult: true,
    emit: { activeEditor: new Emitter(), changeDoc: new Emitter(), changeConfig: new Emitter(), closeDoc: new Emitter() },
    activeTextEditor: undefined, visibleTextEditors: [],
  };
  const msg = (kind) => async (text, ...items) => { state.messages.push({ kind, text }); return state.answers[text] ?? undefined; };
  const vscode = {
    Uri, Range, Position, WorkspaceEdit, SnippetString, EventEmitter: Emitter, StatusBarAlignment: { Left: 1 },
    window: {
      get activeTextEditor() { return state.activeTextEditor; },
      get visibleTextEditors() { return state.visibleTextEditors; },
      onDidChangeActiveTextEditor: state.emit.activeEditor.event,
      showQuickPick: async (items, opts) => { state.quickPicks.push({ items, opts }); return items.find((i) => i.label === state.quickPickPick); },
      showTextDocument: async (doc, opts) => { state.shown.push({ doc, opts }); return state.visibleTextEditors.find((e) => e.document === doc); },
      showInformationMessage: msg('info'), showWarningMessage: msg('warn'), showErrorMessage: msg('error'),
      createStatusBarItem: () => ({ show() { this.shown = true; }, hide() { this.shown = false; }, dispose() {} }),
      registerWebviewViewProvider: (type, p, opts) => { state.providers.set(type, { p, opts }); return { dispose() {} }; },
    },
    workspace: {
      getConfiguration: () => ({ get: (k, d) => (k in state.config ? state.config[k] : d) }),
      onDidChangeTextDocument: state.emit.changeDoc.event,
      onDidChangeConfiguration: state.emit.changeConfig.event,
      onDidCloseTextDocument: state.emit.closeDoc.event,
      asRelativePath: (u) => u.path,
      fs: { stat: async (u) => { if (u.noStat) throw new Error('nope'); return { mtime: u.mtime ?? Date.now() }; } },
      applyEdit: async (we) => {
        state.applyEdits++;
        for (const { uri, range, text } of we.ops) {
          const d = uri.doc; d.text = d.text.slice(0, range.start.offset) + text + d.text.slice(range.end.offset); d.isDirty = true; d.version++;
        }
        return true;
      },
    },
    commands: {
      registerCommand: (id, fn) => { state.commands.set(id, fn); return { dispose() {} }; },
      executeCommand: async (id, ...a) => (state.commands.has(id) ? state.commands.get(id)(...a) : (state.executed = id, state.executedArgs = a)),
    },
    env: { openExternal: async (u) => { state.external.push(u.toString()); return true; } },
  };
  const makeDoc = (text, { lang = 'markdown', mtime, untitled = false } = {}) => {
    const d = { text, version: 1, languageId: lang, isUntitled: untitled, isDirty: false, isClosed: false,
      getText: () => d.text, positionAt: (o) => new Position(o),
      save: async () => { state.saves++; d.isDirty = false; return true; } };
    d.uri = Uri.file('/ws/' + (untitled ? 'Untitled-1' : 'today.md')); d.uri.doc = d; d.uri.mtime = mtime;
    return d;
  };
  // insertSnippet は受け取ったスニペット文字列をそのまま文書に入れる(タブ停止の展開は VS Code 側の機能なのでモックしない)
  const makeEditor = (doc) => ({ document: doc, viewColumn: 1,
    insertSnippet: async (snip, pos) => {
      state.snippets.push({ value: snip.value, offset: pos.offset });
      if (!state.insertSnippetResult) return false;
      doc.text = doc.text.slice(0, pos.offset) + snip.value + doc.text.slice(pos.offset); doc.isDirty = true; return true;
    } });
  const makeView = () => {
    const posted = []; const handlers = {};
    const view = { visible: true,
      webview: { options: null, html: '', cspSource: 'vscode-resource:', asWebviewUri: (u) => u, onDidReceiveMessage: (f) => (handlers.msg = f), postMessage: async (m) => { posted.push(m); return true; } },
      onDidChangeVisibility: (f) => (handlers.vis = f), onDidDispose: (f) => (handlers.dispose = f) };
    return { view, posted, handlers };
  };
  return { vscode, state, makeDoc, makeView, makeEditor };
}
module.exports = { createVscode };
