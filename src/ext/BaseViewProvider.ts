import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { renderWebviewHtml } from '../host/html';
import type { TimetableService } from './TimetableService';
import type { ToHost } from '../webview/vscodeApi';

/** Timetable / Statistics 共通の Webview ビュー処理。 */
export abstract class BaseViewProvider implements vscode.WebviewViewProvider {
  protected view?: vscode.WebviewView;
  private timer?: NodeJS.Timeout;

  /** @param script dist/ 配下のバンドル名(例: 'timetable.js') */
  constructor(
    protected ctx: vscode.ExtensionContext,
    protected service: TimetableService,
    private script: string
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const dist = vscode.Uri.joinPath(this.ctx.extensionUri, 'dist');
    view.webview.options = { enableScripts: true, localResourceRoots: [dist] };
    view.webview.html = this.html(view.webview, dist);

    view.webview.onDidReceiveMessage((m: ToHost) => this.dispatch(m));
    view.onDidChangeVisibility(() => view.visible && void this.refresh());
    view.onDidDispose(() => {
      this.view = undefined;
      this.onDispose();
    });
  }

  protected onDispose(): void {}

  private html(webview: vscode.Webview, dist: vscode.Uri): string {
    const u = (f: string) => webview.asWebviewUri(vscode.Uri.joinPath(dist, f)).toString();
    return renderWebviewHtml({
      cspSource: webview.cspSource,
      nonce: crypto.randomBytes(16).toString('hex'),
      scriptUri: u(this.script),
      styleUris: [u('codicon.css'), u('webview.css')],
    });
  }

  private async dispatch(m: ToHost): Promise<void> {
    try {
      if (m.type === 'ready' || m.type === 'refresh') return await this.refresh();
      await this.onMessage(m);
    } catch (e) {
      vscode.window.showErrorMessage(`Dynamic Timetable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** ready / refresh 以外のメッセージ */
  protected async onMessage(_m: ToHost): Promise<void> {}

  /** 変更イベントの連続発火をまとめる */
  scheduleRefresh(delayMs = 150): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh().catch(() => undefined), delayMs);
  }

  async refresh(): Promise<void> {
    if (!this.view) return;
    void this.view.webview.postMessage(await this.service.snapshot());
  }
}
