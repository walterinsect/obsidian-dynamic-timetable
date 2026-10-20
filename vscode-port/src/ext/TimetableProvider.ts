import * as vscode from 'vscode';
import { buildCustomUrl } from '../core/taskOps';
import { readSettings } from './settings';
import { BaseViewProvider } from './BaseViewProvider';
import type { ToHost } from '../webview/vscodeApi';

export class TimetableProvider extends BaseViewProvider {
  static readonly viewType = 'dynamicTimetable.timetable';
  private notified = new Map<string, boolean>();

  constructor(ctx: vscode.ExtensionContext, service: ConstructorParameters<typeof BaseViewProvider>[1]) {
    super(ctx, service, 'timetable.js');
  }

  protected onDispose(): void {
    this.notified.clear();
  }

  protected async onMessage(m: ToHost): Promise<void> {
    switch (m.type) {
      case 'complete': return this.complete();
      case 'interrupt': return this.interrupt();
      case 'notify': return this.notify(m.kind, m.active);
    }
  }

  async complete(): Promise<void> {
    const port = this.service.port();
    if (!port) return void vscode.window.showWarningMessage('Dynamic Timetable: no target Markdown file.');
    const r = await this.service.manager.complete(port);
    if (!r.completed) {
      vscode.window.showInformationMessage('Dynamic Timetable: no uncompleted task with an estimate found.');
    } else if (r.next) {
      const url = buildCustomUrl(readSettings().customUrlScheme, r.next);
      if (url) await vscode.env.openExternal(vscode.Uri.parse(url));
    }
    await this.refresh();
  }

  async interrupt(): Promise<void> {
    const port = this.service.port();
    if (!port) return void vscode.window.showWarningMessage('Dynamic Timetable: no target Markdown file.');
    const r = await this.service.manager.interrupt(port);
    if (!r.completed) vscode.window.showInformationMessage('Dynamic Timetable: no uncompleted task with an estimate found.');
    await this.refresh();
  }

  /** Webview からの通知。非アクティブ→アクティブに変わった時だけ一度表示する。 */
  private async notify(kind: 'overdue' | 'lateStart', active: boolean): Promise<void> {
    const was = this.notified.get(kind) ?? false;
    this.notified.set(kind, active);
    if (!active || was) return;
    if (kind === 'overdue') {
      const pick = await vscode.window.showInformationMessage('Dynamic Timetable: Are you finished?', 'Complete task');
      if (pick === 'Complete task') await this.complete();
    } else {
      void vscode.window.showWarningMessage('Dynamic Timetable: one or more tasks are likely to start later than scheduled.');
    }
  }
}
