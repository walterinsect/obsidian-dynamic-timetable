export interface DynamicTimetableSettings {
  showEstimate: boolean;
  showStartTime: boolean;
  showEstimateInTaskName: boolean;
  showStartTimeInTaskName: boolean;
  showBufferTime: boolean;
  showProgressBar: boolean;
  intervalTime: number;
  taskEstimateDelimiter: string;
  startTimeDelimiter: string;
  headerNames: string[];
  dateDelimiter: string;
  enableOverdueNotice: boolean;
  showCompletedTasks: boolean;
  applyBackgroundColorByCategory: boolean;
  showCategoryNamesInTask: boolean;
  categoryColors: { category: string; color: string }[];
  categoryTransparency: number;
  showRemainingTime: boolean;
  customUrlScheme: string;
  showUntilRegex: string;
  /** テンプレート作成時と Interrupt の残りタスクに (@created) を記録する(@done は記録しない) */
  enableTimestamps: boolean;
  /** 打刻の書式(YYYY MM DD HH mm ss) */
  timestampFormat: string;
  /** 完了行の所要時間の書式: 'hm' = 2h20m / 'minutes' = 140 */
  durationFormat: 'hm' | 'minutes';
}
