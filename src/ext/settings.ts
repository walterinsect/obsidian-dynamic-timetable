import * as vscode from 'vscode';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../core/defaults';
import type { DynamicTimetableSettings } from '../core/types';
import type { ViewSettings } from '../core/timetable';
import { HighlightOptions, sanitizeHighlightOptions } from '../core/highlight';
import { mergeColorMap, mergeTemplateMap } from '../core/settingsMerge';
import { TaskTemplate, validateTemplates } from '../core/templates';

export const SECTION = 'dynamicTimetable';

export const readSettings = (): DynamicTimetableSettings => {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const raw: Record<string, unknown> = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) raw[k] = cfg.get(k);
  raw.categoryColors = mergeColorMap(raw.categoryColors, cfg.get<unknown>('categoryColorMap'));
  return sanitizeSettings(raw);
};

export interface ExtensionOptions {
  autoSave: boolean;
  showProgressInStatusBar: boolean;
  highlight: HighlightOptions;
  targetLanguages: string[];
  taskTemplates: TaskTemplate[];
  /** 無視した不正なテンプレートの理由(利用時に警告する) */
  templateProblems: string[];
}

export const readOptions = (): ExtensionOptions => {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const langs = cfg.get<unknown>('targetLanguages');
  const { templates, problems } = validateTemplates(
    mergeTemplateMap(cfg.get<unknown>('taskTemplates'), cfg.get<unknown>('taskTemplateMap'))
  );
  return {
    taskTemplates: templates,
    templateProblems: problems,
    autoSave: cfg.get<boolean>('autoSaveAfterUpdate', true) !== false,
    showProgressInStatusBar: cfg.get<boolean>('showProgressInStatusBar', true) !== false,
    highlight: sanitizeHighlightOptions({
      enabled: cfg.get<unknown>('enableHighlight'),
      opacity: cfg.get<unknown>('highlightOpacity'),
      colors: cfg.get<unknown>('highlightColors'),
      completedOpacity: cfg.get<unknown>('completedTaskOpacity'),
    }),
    targetLanguages:
      Array.isArray(langs) && langs.every((l) => typeof l === 'string' && l) && langs.length
        ? (langs as string[])
        : ['markdown'],
  };
};

export const toViewSettings = (s: DynamicTimetableSettings): ViewSettings => ({
  showEstimate: s.showEstimate,
  showStartTime: s.showStartTime,
  showBufferTime: s.showBufferTime,
  showProgressBar: s.showProgressBar,
  showCompletedTasks: s.showCompletedTasks,
  showRemainingTime: s.showRemainingTime,
  applyBackgroundColorByCategory: s.applyBackgroundColorByCategory,
  headerNames: s.headerNames,
  categoryColors: s.categoryColors,
  categoryTransparency: s.categoryTransparency,
  intervalTime: s.intervalTime,
  enableOverdueNotice: s.enableOverdueNotice,
});
