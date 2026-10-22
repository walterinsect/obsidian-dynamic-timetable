import * as vscode from 'vscode';

/**
 * 対象ドキュメントの追従。サイドバーにフォーカスがあると activeTextEditor が undefined になるため、
 * 「最後に有効だった対象エディタ」を保持する。ピン留め中は切り替えない。
 */
export class TargetTracker implements vscode.Disposable {
  private _doc: vscode.TextDocument | undefined;
  private _pinned = false;
  private emitter = new vscode.EventEmitter<void>();
  private subs: vscode.Disposable[] = [];
  readonly onDidChange = this.emitter.event;

  constructor(private languages: () => string[]) {
    this.subs.push(
      vscode.window.onDidChangeActiveTextEditor((e) => {
        if (e) this.consider(e.document);
      }),
      vscode.workspace.onDidCloseTextDocument((d) => {
        if (this._doc === d) {
          this._doc = undefined;
          this._pinned = false;
          this.emitter.fire();
        }
      })
    );
    const initial =
      vscode.window.activeTextEditor ??
      vscode.window.visibleTextEditors.find((e) => this.eligible(e.document));
    if (initial) this.consider(initial.document);
  }

  get document(): vscode.TextDocument | undefined {
    return this._doc;
  }
  get pinned(): boolean {
    return this._pinned;
  }

  private eligible(d: vscode.TextDocument): boolean {
    return !d.isClosed && this.languages().includes(d.languageId);
  }

  private consider(d: vscode.TextDocument) {
    if (this._pinned || !this.eligible(d) || this._doc === d) return;
    this._doc = d;
    this.emitter.fire();
  }

  pinCurrent(): boolean {
    if (!this._doc) return false;
    this._pinned = true;
    this.emitter.fire();
    return true;
  }

  unpin() {
    this._pinned = false;
    const e = vscode.window.activeTextEditor;
    if (e) this.consider(e.document);
    this.emitter.fire();
  }

  dispose() {
    this.subs.forEach((s) => s.dispose());
    this.emitter.dispose();
  }
}
