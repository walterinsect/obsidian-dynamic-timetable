import { Task, TaskParser } from '../core/TaskParser';
import { ApplyResult, applyTaskUpdate, updateStartTimeInYAML } from '../core/taskOps';
import type { DynamicTimetableSettings } from '../core/types';
import { InsertMode, TaskTemplate, buildInsertion, prepareBody } from '../core/templates';

/** vscode.TextDocument を隠すための最小インターフェース。テストでは偽物を差す。 */
export interface DocumentPort {
  getText(): string;
  getMtimeMs(): Promise<number>;
  /** 全文を newText にする。実装側で最小差分にすること。 */
  replaceAll(newText: string): Promise<void>;
}

export class TaskManager {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private getSettings: () => DynamicTimetableSettings,
    private clock: () => Date = () => new Date()
  ) {}

  /** 連打しても「読む→書く」が重ならないよう直列化する(同じタスクを二重に完了しない)。 */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** YAML に startTime が無ければファイルの更新時刻を開始時刻として扱う(表示・完了で一貫させる)。 */
  private async withFallbackStart(port: DocumentPort, parser: TaskParser): Promise<string> {
    const content = port.getText();
    if (parser.getYamlStartTime(content)) return content;
    return updateStartTimeInYAML(content, new Date(await port.getMtimeMs()));
  }

  async loadTasks(port: DocumentPort): Promise<{ tasks: Task[]; warnings: string[] }> {
    const parser = TaskParser.fromSettings(this.getSettings());
    const content = await this.withFallbackStart(port, parser);
    return { tasks: parser.filterAndParseTasks(content), warnings: parser.warnings };
  }

  complete(port: DocumentPort): Promise<ApplyResult> {
    return this.serial(() => this.apply(port, 'complete'));
  }

  interrupt(port: DocumentPort): Promise<ApplyResult> {
    return this.serial(() => this.apply(port, 'interrupt'));
  }

  private async apply(port: DocumentPort, mode: 'complete' | 'interrupt'): Promise<ApplyResult> {
    const settings = this.getSettings();
    const parser = TaskParser.fromSettings(settings);
    const content = await this.withFallbackStart(port, parser);
    const result = applyTaskUpdate(content, settings, this.clock(), mode);
    // 書き換え対象が無いときは何も書かない(startTime も触らない)
    if (result.completed) await port.replaceAll(result.content);
    return result;
  }

  /** テンプレートの挿入内容(位置とテキスト)を作る。ドキュメントは書き換えない。 */
  planTemplate(port: DocumentPort, template: TaskTemplate, mode: InsertMode) {
    const settings = this.getSettings();
    const now = this.clock();
    return buildInsertion(port.getText(), settings, prepareBody(template, settings, now), mode, now);
  }

  /** スニペットを既定値で展開して文書に直接挿入する(エディタが見えないとき用)。 */
  insertTemplate(port: DocumentPort, template: TaskTemplate): Promise<{ offset: number }> {
    return this.serial(async () => {
      const content = port.getText();
      const { offset, text } = this.planTemplate(port, template, 'plain');
      await port.replaceAll(content.slice(0, offset) + text + content.slice(offset));
      return { offset };
    });
  }
}
