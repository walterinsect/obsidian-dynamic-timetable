import type { Task } from '../core/TaskParser';
import { ViewSettings, computeCategoryColors } from '../core/timetable';

/**
 * カテゴリ色の単一の情報源。Timetable と Statistics は別 Webview なので、
 * 色(自動割り当ては乱数)をホストで一度だけ決めて両方に送る。
 */
export class CategoryColors {
  private current: Record<string, string> = {};

  update(tasks: Task[], settings: Pick<ViewSettings, 'categoryColors' | 'categoryTransparency'>): Record<string, string> {
    this.current = computeCategoryColors(tasks, settings, this.current);
    return { ...this.current };
  }
}
