import * as vscode from 'vscode';
import { COLOR_KEYS, ColorKey, HighlightRange, resolveHexColor, withAlpha } from '../core/highlight';
import { readOptions } from './settings';
import type { TimetableService } from './TimetableService';

const MAX_TAG_TYPES = 60;

/**
 * Timetable が認識したタスク行の、タグ・見積り・開始時刻・打刻に薄い背景色を付け、
 * 完了行を薄く表示する(TextEditorDecorationType)。
 *  - タグの色: Timetable / Statistics と同じカテゴリ色(透明度は highlightOpacity)
 *  - 他の色: workbench.colorCustomizations(dynamicTimetable.*Background)か、設定 highlightColors
 */
export class Highlighter implements vscode.Disposable {
  private types = new Map<string, vscode.TextEditorDecorationType>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private seq = 0;

  constructor(private service: TimetableService) {}

  schedule(delay = 150): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh().catch(() => this.clearAll()), delay);
  }

  /** 設定(色・不透明度)が変わったら、装飾タイプを作り直す。 */
  reset(): void {
    this.clearAll();
    for (const t of this.types.values()) t.dispose();
    this.types.clear();
  }

  async refresh(): Promise<void> {
    const seq = ++this.seq;
    const { highlight } = readOptions();
    if (!highlight.enabled) return this.clearAll();
    const data = await this.service.highlightData();
    if (seq !== this.seq) return; // より新しい更新が走っている
    if (!data) return this.clearAll();

    // 種類(装飾タイプ)ごとの範囲
    const groups = new Map<string, { make: () => vscode.DecorationRenderOptions; ranges: vscode.Range[] }>();
    const add = (key: string, make: () => vscode.DecorationRenderOptions, r: HighlightRange) => {
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { make, ranges: [] }));
      g.ranges.push(new vscode.Range(r.line, r.start, r.line, r.end));
    };
    for (const r of data.ranges) {
      if (r.kind === 'tag') {
        const base = r.category !== undefined ? data.colors[r.category] : undefined;
        if (!base) continue;
        const color = withAlpha(base, highlight.opacity);
        add(`tag:${color}`, () => ({ backgroundColor: color, borderRadius: '3px' }), r);
      } else if (r.kind === 'completed') {
        if (highlight.completedOpacity < 1) add('completed', () => ({ opacity: String(highlight.completedOpacity) }), r);
      } else {
        const k = r.kind as ColorKey;
        const hex = highlight.colors[k];
        add(
          k,
          () => ({
            backgroundColor: hex ? resolveHexColor(hex, highlight.opacity) : new vscode.ThemeColor(`dynamicTimetable.${k}Background`),
            borderRadius: '3px',
          }),
          r
        );
      }
    }

    if (this.types.size > MAX_TAG_TYPES) this.reset();
    for (const [key, g] of groups) if (!this.types.has(key)) this.types.set(key, vscode.window.createTextEditorDecorationType(g.make()));

    for (const editor of vscode.window.visibleTextEditors) {
      const mine = editor.document === data.doc;
      for (const [key, type] of this.types) editor.setDecorations(type, mine ? groups.get(key)?.ranges ?? [] : []);
    }
  }

  private clearAll(): void {
    for (const editor of vscode.window.visibleTextEditors) for (const type of this.types.values()) editor.setDecorations(type, []);
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.seq++;
    this.reset();
  }
}
