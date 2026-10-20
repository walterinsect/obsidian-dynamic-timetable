import * as vscode from 'vscode';
import { TaskManager } from './host/TaskManager';
import { TargetTracker } from './ext/target';
import { TimetableService } from './ext/TimetableService';
import { TimetableProvider } from './ext/TimetableProvider';
import { StatisticsProvider } from './ext/StatisticsProvider';
import { TemplateCommands } from './ext/TemplateCommands';
import { SECTION, readOptions, readSettings } from './ext/settings';

export function activate(ctx: vscode.ExtensionContext): void {
  const manager = new TaskManager(readSettings);
  const target = new TargetTracker(() => readOptions().targetLanguages);
  const service = new TimetableService(manager, target);
  const timetable = new TimetableProvider(ctx, service);
  const statistics = new StatisticsProvider(ctx, service);
  const templates = new TemplateCommands(service);
  const providers = [timetable, statistics];
  const refreshAll = (delay?: number) => providers.forEach((p) => p.scheduleRefresh(delay));

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  const updateStatus = () => {
    if (target.pinned && target.document) {
      status.text = `$(pin) ${vscode.workspace.asRelativePath(target.document.uri)}`;
      status.tooltip = 'Dynamic Timetable: pinned file (click to unpin)';
      status.command = 'dynamicTimetable.unpinFile';
      status.show();
    } else status.hide();
  };

  const webviewOptions = { webviewOptions: { retainContextWhenHidden: true } };
  ctx.subscriptions.push(
    target,
    status,
    vscode.window.registerWebviewViewProvider(TimetableProvider.viewType, timetable, webviewOptions),
    vscode.window.registerWebviewViewProvider(StatisticsProvider.viewType, statistics, webviewOptions),
    target.onDidChange(() => {
      updateStatus();
      refreshAll(0);
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (target.document && e.document === target.document && e.contentChanges.length) refreshAll();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION)) refreshAll(0);
    }),
    vscode.commands.registerCommand('dynamicTimetable.complete', () => timetable.complete()),
    vscode.commands.registerCommand('dynamicTimetable.interrupt', () => timetable.interrupt()),
    vscode.commands.registerCommand('dynamicTimetable.refresh', () => Promise.all(providers.map((p) => p.refresh()))),
    vscode.commands.registerCommand('dynamicTimetable.show', () =>
      vscode.commands.executeCommand(`${TimetableProvider.viewType}.focus`)
    ),
    vscode.commands.registerCommand('dynamicTimetable.showStatistics', () =>
      vscode.commands.executeCommand(`${StatisticsProvider.viewType}.focus`)
    ),
    vscode.commands.registerCommand('dynamicTimetable.openSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:walterinsect.dynamic-timetable')
    ),
    vscode.commands.registerCommand('dynamicTimetable.pinFile', () => {
      if (!target.pinCurrent()) vscode.window.showWarningMessage('Dynamic Timetable: no Markdown file to pin.');
    }),
    vscode.commands.registerCommand('dynamicTimetable.unpinFile', () => target.unpin()),
    vscode.commands.registerCommand('dynamicTimetable.insertTaskTemplate', (arg?: unknown) => templates.insert(arg)),
    // 固定スロット: 設定 taskTemplates の N 番目を挿入(キーを割り当てやすいよう静的に登録)
    ...[
      'dynamicTimetable.insertTaskTemplate1',
      'dynamicTimetable.insertTaskTemplate2',
      'dynamicTimetable.insertTaskTemplate3',
      'dynamicTimetable.insertTaskTemplate4',
      'dynamicTimetable.insertTaskTemplate5',
    ].map((id, i) => vscode.commands.registerCommand(id, () => templates.insert(i + 1)))
  );
  updateStatus();
}

export function deactivate(): void {}
