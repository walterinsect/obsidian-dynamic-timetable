import { toDTO } from '../core/serialize';
import { TaskParser } from '../core/TaskParser';
import { DEFAULT_VIEW_SETTINGS, computeCategoryColors } from '../core/timetable';
import type { ToWebview } from './vscodeApi';

/** VS Code 外の静的プレビュー用サンプル(日付をまたいでも壊れないよう明示開始は ISO で書く) */
export const buildSampleMessage = (): ToWebview => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  const off = (min: number) => new Date(now.getTime() + min * 60000);
  const iso = (min: number) => {
    const d = off(min);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const start = off(-12); // 現在タスクは12分前に開始
  const md = [
    '---',
    `startTime: ${pad(start.getHours())}:${pad(start.getMinutes())}:00`,
    '---',
    `- [x] 朝のメールチェック ; 10 @ ${iso(-70)} #inbox`,
    `- [x] 朝会 ; 15 @ ${iso(-60)} #meeting`,
    '- [ ] [[設計レビュー]] の準備 ; 30 #work',
    `- [ ] 昼休み ; 45 @ ${iso(120)} #life`,
    '- [ ] 実装: Webview 化 ; 90 #work #deep',
    `- [ ] 1on1 ; 20 @ ${iso(15)} #meeting`,
    '- [ ] 日報 ; 1.5 #inbox',
  ].join('\n');
  const parser = new TaskParser(';', '@', '', true, false, false, '');
  const tasks = parser.filterAndParseTasks(md);
  const settings = { ...DEFAULT_VIEW_SETTINGS, categoryColors: [{ category: 'work', color: '#4a90d9' }] };
  return {
    type: 'update',
    tasks: tasks.map(toDTO),
    settings,
    colors: computeCategoryColors(tasks, settings),
  };
};
