import * as vscode from 'vscode';
import { TaskManager } from '../host/TaskManager';
import { CategoryColors } from '../host/CategoryColors';
import { toDTO } from '../core/serialize';
import { readOptions, readSettings, toViewSettings } from './settings';
import { VscodeDocumentPort } from './document';
import type { TargetTracker } from './target';
import type { ToWebview } from '../webview/vscodeApi';

/** 全ビューで共有する状態(対象ドキュメント・色・パース結果の生成)。 */
export class TimetableService {
  private colors = new CategoryColors();

  constructor(
    readonly manager: TaskManager,
    readonly target: TargetTracker
  ) {}

  port(): VscodeDocumentPort | undefined {
    const doc = this.target.document;
    return doc ? new VscodeDocumentPort(doc, readOptions().autoSave) : undefined;
  }

  /** Webview に送る現在の状態。対象が無いときは案内メッセージ付きの空状態。 */
  async snapshot(): Promise<ToWebview> {
    const settings = readSettings();
    const view = toViewSettings(settings);
    const port = this.port();
    if (!port) {
      return {
        type: 'update', tasks: [], settings: view, colors: {},
        warnings: ['No Markdown file is active. Open a Markdown file to show its timetable.'],
      };
    }
    const { tasks, warnings } = await this.manager.loadTasks(port);
    return {
      type: 'update',
      tasks: tasks.map(toDTO),
      settings: view,
      colors: this.colors.update(tasks, settings),
      warnings,
    };
  }
}
