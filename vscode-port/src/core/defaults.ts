import type { DynamicTimetableSettings } from './types';
import { DEFAULT_TIMESTAMP_FORMAT, isValidTimestampFormat } from './stamps';

/** package.json の contributes.configuration の default と一致させること(テストで検証)。 */
export const DEFAULT_SETTINGS: DynamicTimetableSettings = {
  showEstimate: false,
  showStartTime: false,
  showEstimateInTaskName: false,
  showStartTimeInTaskName: true,
  showBufferTime: true,
  showProgressBar: true,
  intervalTime: 1,
  taskEstimateDelimiter: ';',
  startTimeDelimiter: '@',
  headerNames: ['Tasks', 'Estimate', 'Start', 'End'],
  dateDelimiter: '',
  enableOverdueNotice: true,
  showCompletedTasks: true,
  applyBackgroundColorByCategory: true,
  showCategoryNamesInTask: false,
  categoryColors: [],
  categoryTransparency: 0.3,
  showRemainingTime: true,
  customUrlScheme: '',
  showUntilRegex: '',
  enableTimestamps: true,
  timestampFormat: DEFAULT_TIMESTAMP_FORMAT,
  durationFormat: 'hm',
};

const HEX = /^#?[0-9a-fA-F]{6}$/;

/** 設定値の検証・補正。不正値は既定値に戻す(ユーザーの手書き JSON 対策)。 */
export const sanitizeSettings = (raw: Record<string, unknown>): DynamicTimetableSettings => {
  const d = DEFAULT_SETTINGS;
  const bool = (k: keyof DynamicTimetableSettings) =>
    typeof raw[k] === 'boolean' ? (raw[k] as boolean) : (d[k] as boolean);
  const str = (k: keyof DynamicTimetableSettings, allowEmpty: boolean) => {
    const v = raw[k];
    return typeof v === 'string' && (allowEmpty || v.length > 0) ? v : (d[k] as string);
  };
  const num = (k: keyof DynamicTimetableSettings, min: number, max: number) => {
    const v = raw[k];
    return typeof v === 'number' && isFinite(v) && v >= min && v <= max ? v : (d[k] as number);
  };

  const names = raw.headerNames;
  const headerNames =
    Array.isArray(names) && names.length >= 4 && names.every((n) => typeof n === 'string')
      ? (names as string[]).slice(0, 4)
      : [...d.headerNames];

  const colors = Array.isArray(raw.categoryColors)
    ? (raw.categoryColors as unknown[]).filter(
        (c): c is { category: string; color: string } =>
          !!c &&
          typeof (c as any).category === 'string' &&
          (c as any).category.length > 0 &&
          typeof (c as any).color === 'string' &&
          HEX.test((c as any).color)
      )
    : [];

  return {
    showEstimate: bool('showEstimate'),
    showStartTime: bool('showStartTime'),
    showEstimateInTaskName: bool('showEstimateInTaskName'),
    showStartTimeInTaskName: bool('showStartTimeInTaskName'),
    showBufferTime: bool('showBufferTime'),
    showProgressBar: bool('showProgressBar'),
    intervalTime: num('intervalTime', 0.2, 3600),
    taskEstimateDelimiter: str('taskEstimateDelimiter', false).slice(0, 1) || d.taskEstimateDelimiter,
    startTimeDelimiter: str('startTimeDelimiter', false).slice(0, 1) || d.startTimeDelimiter,
    headerNames,
    dateDelimiter: str('dateDelimiter', true),
    enableOverdueNotice: bool('enableOverdueNotice'),
    showCompletedTasks: bool('showCompletedTasks'),
    applyBackgroundColorByCategory: bool('applyBackgroundColorByCategory'),
    showCategoryNamesInTask: bool('showCategoryNamesInTask'),
    categoryColors: colors,
    categoryTransparency: num('categoryTransparency', 0, 1),
    showRemainingTime: bool('showRemainingTime'),
    customUrlScheme: str('customUrlScheme', true),
    showUntilRegex: str('showUntilRegex', true),
    enableTimestamps: bool('enableTimestamps'),
    timestampFormat: isValidTimestampFormat(raw.timestampFormat) ? raw.timestampFormat : d.timestampFormat,
    durationFormat: raw.durationFormat === 'minutes' || raw.durationFormat === 'hm' ? raw.durationFormat : d.durationFormat,
  };
};
