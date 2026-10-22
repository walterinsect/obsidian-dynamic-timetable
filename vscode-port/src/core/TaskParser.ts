import type { DynamicTimetableSettings } from './types';
import { categoryPerformance } from './statistics';
import { stripAnnotations } from './stamps';
import { DURATION_PATTERN, extractPlannedMinutes, parseDuration } from './duration';

export interface Task {
  originalTaskName: string;
  task: string;
  startTime: Date | null;
  estimate: string | null;
  endTime: Date | null;
  isCompleted: boolean;
  originalStartTime: boolean;
  categories: string[];
  /** 完了行の見積り注記 `(est 2h)` の分数。無ければ null/未定義 */
  plannedMinutes?: number | null;
}

export class TaskParser {
  private dateDelimiter: RegExp;
  private showUntilRegex: RegExp;
  /** 設定の不備(不正な正規表現など)。ホスト側で通知に使う。 */
  public readonly warnings: string[] = [];

  constructor(
    private separator: string,
    private startTimeDelimiter: string,
    dateDelimiter: string,
    private showStartTimeInTaskName: boolean,
    private showEstimateInTaskName: boolean,
    private showCategoryNamesInTask: boolean,
    showUntilRegex: string
  ) {
    this.dateDelimiter = this.compileRegex('dateDelimiter', dateDelimiter);
    this.showUntilRegex = this.compileRegex('showUntilRegex', showUntilRegex);
  }

  private compileRegex(name: string, pattern: string): RegExp {
    const NEVER = /(?!x)x/;
    if (!pattern) return NEVER;
    try {
      return new RegExp(pattern);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.warnings.push(`${name}: invalid regular expression "${pattern}" (${reason})`);
      return NEVER;
    }
  }

  static fromSettings(settings: DynamicTimetableSettings): TaskParser {
    return new TaskParser(
      settings.taskEstimateDelimiter,
      settings.startTimeDelimiter,
      settings.dateDelimiter,
      settings.showStartTimeInTaskName,
      settings.showEstimateInTaskName,
      settings.showCategoryNamesInTask,
      settings.showUntilRegex
    );
  }

  public filterAndParseTasks(content: string): Task[] {
    let previousEndTime: Date | null = null;
    let firstUncompletedTaskFound = false;
    let nextDay = 0;
    let dateDelimiterFound = false;
    let stopParsing = false;

    const yamlStartTime = this.getYamlStartTime(content);
    const tasks = content
      .split('\n')
      .map((line) => line.trim())
      .reduce((acc: Task[], task) => {
        if (stopParsing) return acc;
        if (this.isDateDelimiterLine(task)) {
          if (firstUncompletedTaskFound) {
            dateDelimiterFound = true;
          }
          return acc;
        }
        if (this.showUntilRegex.test(task)) {
          stopParsing = true;
          return acc;
        }

        if (
          !task.startsWith('- [ ]') &&
          !task.startsWith('- [x]') &&
          !task.startsWith('+ [ ]') &&
          !task.startsWith('+ [x]') &&
          !task.startsWith('* [ ]') &&
          !task.startsWith('* [x]')
        ) {
          return acc;
        }

        const isCompleted =
          task.startsWith('- [x]') ||
          task.startsWith('+ [x]') ||
          task.startsWith('* [x]');
        const { taskName, originalTaskName } = this.parseTaskName(task);

        if (dateDelimiterFound) {
          nextDay++;
          dateDelimiterFound = false;
        }

        const estimate = this.parseEstimate(task);
        const categories = this.parseCategories(task);

        let startTime = this.parseStartTime(task, nextDay);
        const originalStartTime = Boolean(startTime);

        if (!isCompleted && !firstUncompletedTaskFound) {
          startTime = yamlStartTime;
          firstUncompletedTaskFound = true;
        } else if (!startTime && previousEndTime) {
          startTime = previousEndTime;
        }

        let endTime: Date | null = null;
        if (startTime && estimate) {
          endTime = new Date(startTime.getTime() + Number(estimate) * 60000);
          previousEndTime = endTime;
        }

        if (estimate) {
          acc.push({
            originalTaskName: originalTaskName,
            task: taskName,
            startTime: startTime,
            estimate: estimate,
            endTime: endTime,
            isCompleted: isCompleted,
            originalStartTime: originalStartTime,
            categories: categories,
            plannedMinutes: extractPlannedMinutes(task),
          });
        }

        return acc;
      }, []);

    return tasks;
  }

  /** 区切り文字(エディタのハイライトが同じ正規表現を組み立てるために公開) */
  public get delimiters(): { separator: string; startTimeDelimiter: string } {
    return { separator: this.separator, startTimeDelimiter: this.startTimeDelimiter };
  }

  /**
   * Timetable に載る(= filterAndParseTasks が返す)タスクの行を、文書内の行番号つきで返す。
   * 判定は filterAndParseTasks と同じ: 日付区切り行は飛ばし、showUntilRegex で打ち切り、
   * チェックボックス行で、見積りが読み取れるものだけ。
   */
  public scanTaskLines(content: string): { index: number; text: string; isCompleted: boolean }[] {
    const found: { index: number; text: string; isCompleted: boolean }[] = [];
    const rows = content.split('\n');
    for (let i = 0; i < rows.length; i++) {
      const text = rows[i].replace(/\r$/, '');
      const task = text.trim();
      if (this.isDateDelimiterLine(task)) continue;
      if (this.showUntilRegex.test(task)) break;
      if (!/^[-+*] \[[ x]\]/.test(task)) continue;
      if (this.parseEstimate(task) === null) continue;
      found.push({ index: i, text, isCompleted: /^[-+*] \[x\]/.test(task) });
    }
    return found;
  }

  private isDateDelimiterLine(line: string): boolean {
    return this.dateDelimiter.test(line);
  }

  public parseTaskName(taskName: string): {
    taskName: string;
    originalTaskName: string;
  } {
    taskName = stripAnnotations(taskName);
    const taskNameRegex = /^[-+*]\s*\[\s*.\s*\]\s*/;
    const linkRegex = /\[\[([^\[\]]*\|)?([^\[\]]+)\]\]/g;
    const markdownLinkRegex = /\[([^\[\]]+)\]\(.+?\)/g;
    const estimateRegex = new RegExp(
      `\\${this.separator}\\s*${DURATION_PATTERN}\\s*`
    );
    const startTimeRegex = new RegExp(
      `\\${this.startTimeDelimiter}\\s*(?:\\d{4}-\\d{2}-\\d{2}[T ]\\s*)?(\\d{1,2}:?\\d{2})`
    );
    const categoryRegex = /\s#([^\s!#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]+)/gu;

    // タグは `- [ ] #tag title` のようにチェックボックス直後にも書かれる。接頭辞を外す前に取り除いて、
    // 直前の空白を失わないようにする(外した後だと `\s#` に一致せず、先頭のタグが名前に残る)
    let originalTaskName = taskName.replace(categoryRegex, '');
    originalTaskName = originalTaskName
      .replace(taskNameRegex, '')
      .replace(estimateRegex, '')
      .replace(startTimeRegex, '')
      .replace(categoryRegex, '')
      .trim();

    if (!this.showCategoryNamesInTask) taskName = taskName.replace(categoryRegex, '');
    taskName = taskName
      .replace(taskNameRegex, '')
      .trim()
      .replace(linkRegex, '$2')
      .replace(markdownLinkRegex, '$1')
      .trim();

    if (!this.showCategoryNamesInTask) {
      // 先頭のタグも消せるよう、接頭辞を外す前の文字列から取り除いてやり直す
      taskName = taskName.replace(categoryRegex, '').trim();
    }

    if (this.showStartTimeInTaskName) {
      taskName = taskName.replace(
        startTimeRegex,
        (match, p1) => `${this.startTimeDelimiter}${p1}`
      );
    } else {
      taskName = taskName.replace(startTimeRegex, '').trim();
    }

    if (!this.showEstimateInTaskName) {
      taskName = taskName.replace(estimateRegex, '').trim();
    }

    return { taskName, originalTaskName };
  }

  public parseStartTime(task: string, nextDay: number): Date | null {
    task = stripAnnotations(task);
    const timeRegex = new RegExp(
      `\\${this.startTimeDelimiter}\\s*(\\d{1,2}:?\\d{2})`
    );
    const dateTimeRegex = new RegExp(
      `\\${this.startTimeDelimiter}\\s*(\\d{4}-\\d{2}-\\d{2})[T ]\\s*(\\d{1,2}:\\d{2})`
    );

    const timeMatch = task.match(timeRegex);
    const dateTimeMatch = task.match(dateTimeRegex);

    if (dateTimeMatch) {
      const parsedDateTime = new Date(
        `${dateTimeMatch[1]}T${dateTimeMatch[2].padStart(5, '0')}`
      );
      if (!isNaN(parsedDateTime.getTime())) {
        return parsedDateTime;
      }
    } else if (timeMatch) {
      const currentTime = new Date();
      let hoursStr: string;
      let minutesStr: string;
      if (timeMatch[1].includes(':')) {
        [hoursStr, minutesStr] = timeMatch[1].split(':');
      } else {
        hoursStr = timeMatch[1].substring(0, 2);
        minutesStr = timeMatch[1].substring(2);
      }
      const hours = parseInt(hoursStr);
      const minutes = parseInt(minutesStr);
      const startDate = new Date(
        currentTime.setDate(currentTime.getDate() + nextDay)
      );
      startDate.setHours(hours, minutes, 0, 0);
      return startDate;
    }

    return null;
  }

  public parseEstimate(task: string): string | null {
    task = stripAnnotations(task);
    const regex = new RegExp(
      `\\${this.separator}\\s*(${DURATION_PATTERN})\\s*`
    );
    const match = task.match(regex);
    if (!match) return null;
    // 裸の数値は表記のまま(従来どおり)、2h20m 形式は分に換算した文字列
    if (/^\d+(?:\.\d+)?$/.test(match[1])) return match[1];
    const minutes = parseDuration(match[1]);
    return minutes === null ? null : String(minutes);
  }

  private parseCategories(taskName: string): string[] {
    taskName = stripAnnotations(taskName);
    const tagRegex = /\s#([^\s!#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]+)/gu;
    const categories = [];
    let match;
    while ((match = tagRegex.exec(taskName)) !== null) {
      categories.push(match[1]);
    }
    return categories;
  }

  public getYamlStartTime(content: string): Date | null {
    const match = content.match(/^startTime: (\d{2}:\d{2}:\d{2})/m);
    if (match) {
      const [hours, minutes, seconds] = match[1].split(':').map(Number);
      const date = new Date();
      date.setHours(hours, minutes, seconds, 0);
      return date;
    }
    return null;
  }

  public getCategoryPerformance(
    tasks: Task[]
  ): Record<string, { estimatedTime: number; actualTime: number }> {
    return categoryPerformance(tasks);
  }
}
