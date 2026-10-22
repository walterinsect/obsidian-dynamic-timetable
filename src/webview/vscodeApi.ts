import type { TaskDTO } from '../core/serialize';
import type { ViewSettings } from '../core/timetable';

/** Webview → Extension Host */
export type ToHost =
  | { type: 'ready' }
  | { type: 'complete' }
  | { type: 'interrupt' }
  | { type: 'refresh' }
  | { type: 'notify'; kind: 'overdue' | 'lateStart'; active: boolean };

/** Extension Host → Webview */
export type ToWebview = {
  type: 'update';
  tasks: TaskDTO[];
  settings: ViewSettings;
  /** カテゴリ→背景色。ホストが一度だけ決め、全ビューで共有する。 */
  colors: Record<string, string>;
  warnings?: string[];
};

declare function acquireVsCodeApi(): { postMessage(m: ToHost): void };

/** VS Code 外(静的プレビュー)では null。 */
export const vscodeApi: { postMessage(m: ToHost): void } | null =
  typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

export const post = (m: ToHost) => {
  if (vscodeApi) vscodeApi.postMessage(m);
  else console.debug('[preview] postMessage', m);
};
