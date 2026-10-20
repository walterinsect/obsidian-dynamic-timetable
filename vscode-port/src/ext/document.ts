import * as vscode from 'vscode';
import type { DocumentPort } from '../host/TaskManager';
import { minimalEdit } from '../core/minimalEdit';

/** vscode.TextDocument を DocumentPort として公開する。 */
export class VscodeDocumentPort implements DocumentPort {
  constructor(
    private doc: vscode.TextDocument,
    private autoSave: boolean
  ) {}

  getText(): string {
    return this.doc.getText();
  }

  async getMtimeMs(): Promise<number> {
    try {
      return (await vscode.workspace.fs.stat(this.doc.uri)).mtime;
    } catch {
      // 未保存(untitled)など stat できない場合は「今」を開始時刻とする
      return Date.now();
    }
  }

  async replaceAll(newText: string): Promise<void> {
    const oldText = this.doc.getText();
    const edit = minimalEdit(oldText, newText);
    if (!edit) return;

    // 変更範囲だけを置換(カーソル位置・折り畳み・スクロールを保つ)。1回の WorkspaceEdit → undo 1回。
    const range = new vscode.Range(this.doc.positionAt(edit.start), this.doc.positionAt(edit.end));
    const we = new vscode.WorkspaceEdit();
    we.replace(this.doc.uri, range, edit.text);
    const ok = await vscode.workspace.applyEdit(we);
    if (!ok) throw new Error('Failed to apply edit to the document.');

    if (this.autoSave && !this.doc.isUntitled && this.doc.isDirty) {
      await this.doc.save();
    }
  }
}
