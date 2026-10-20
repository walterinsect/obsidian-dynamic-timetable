import * as vscode from 'vscode';
import { TaskTemplate, findTemplate, parseTemplateRef } from '../core/templates';
import { readOptions } from './settings';
import { VscodeDocumentPort } from './document';
import type { TimetableService } from './TimetableService';

/** 定型タスクの挿入コマンド。 */
export class TemplateCommands {
  constructor(private service: TimetableService) {}

  /**
   * @param arg 省略 → QuickPick / "name" / 番号(1 始まり) / { template: "name" | 番号 }
   * キーバインドの args からも呼べる。
   */
  async insert(arg?: unknown): Promise<void> {
    const doc = this.service.target.document;
    if (!doc) return void vscode.window.showWarningMessage('Dynamic Timetable: no target Markdown file.');

    const { taskTemplates, templateProblems, autoSave } = readOptions();
    if (templateProblems.length) {
      void vscode.window.showWarningMessage(`Dynamic Timetable: ignored invalid task template(s): ${templateProblems.join('; ')}`);
    }
    if (taskTemplates.length === 0) {
      const pick = await vscode.window.showInformationMessage('Dynamic Timetable: no task templates are defined.', 'Open Settings');
      if (pick === 'Open Settings') await vscode.commands.executeCommand('workbench.action.openSettings', 'dynamicTimetable.taskTemplates');
      return;
    }

    const template = await this.choose(taskTemplates, arg);
    if (!template) return;

    const port = new VscodeDocumentPort(doc, autoSave);
    const editor = vscode.window.visibleTextEditors.find((e) => e.document === doc);
    if (editor) {
      // 対象ファイルのエディタが見えている: スニペットとして挿入(タブ停止・変数が使える)
      const { offset, text } = this.service.manager.planTemplate(port, template, 'snippet');
      const shown = await vscode.window.showTextDocument(doc, { viewColumn: editor.viewColumn, preserveFocus: false });
      const ok = await shown.insertSnippet(new vscode.SnippetString(text), doc.positionAt(offset));
      if (!ok) vscode.window.showErrorMessage('Dynamic Timetable: failed to insert the template.');
    } else {
      // エディタが見えない(別タブ・サイドバーのみ等): 既定値で展開して文書に直接挿入
      await this.service.manager.insertTemplate(port, template);
    }
  }

  private async choose(templates: TaskTemplate[], arg: unknown): Promise<TaskTemplate | undefined> {
    const ref = parseTemplateRef(arg);
    if (ref) {
      const found = findTemplate(templates, ref);
      if (!found) {
        const what = ref.name !== undefined ? `Template "${ref.name}" is not defined.` : `Template slot ${ref.index} is not defined.`;
        void vscode.window.showWarningMessage(`Dynamic Timetable: ${what}`);
      }
      return found;
    }
    const picked = await vscode.window.showQuickPick(
      templates.map((t) => ({ label: t.name, description: t.body[0], detail: t.body.length > 1 ? `+${t.body.length - 1} more line(s)` : undefined, template: t })),
      { placeHolder: 'Insert a task template after the current task', matchOnDescription: true }
    );
    return picked?.template;
  }
}
