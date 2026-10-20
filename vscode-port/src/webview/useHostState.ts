import { useEffect, useState } from 'react';
import type { Task } from '../core/TaskParser';
import { TaskDTO, fromDTO } from '../core/serialize';
import { DEFAULT_VIEW_SETTINGS, ViewSettings } from '../core/timetable';
import { post, ToWebview } from './vscodeApi';

export interface HostState {
  tasks: Task[];
  settings: ViewSettings;
  colors: Record<string, string>;
  warnings: string[];
}

/** ホストからの update を受け取り、Date を復元して返す。マウント時に ready を送る。 */
export const useHostState = (): HostState => {
  const [state, setState] = useState<HostState>({
    tasks: [], settings: DEFAULT_VIEW_SETTINGS, colors: {}, warnings: [],
  });

  useEffect(() => {
    const onMsg = (e: MessageEvent<ToWebview>) => {
      if (e.data?.type !== 'update') return;
      setState({
        tasks: e.data.tasks.map((t: TaskDTO) => fromDTO(t)),
        settings: { ...DEFAULT_VIEW_SETTINGS, ...e.data.settings },
        colors: e.data.colors ?? {},
        warnings: e.data.warnings ?? [],
      });
    };
    window.addEventListener('message', onMsg);
    post({ type: 'ready' });
    return () => window.removeEventListener('message', onMsg);
  }, []);

  return state;
};
