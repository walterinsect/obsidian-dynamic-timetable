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
  /** 完了・中断・テンプレート作成時に (@created/@done) を記録する */
  enableTimestamps: boolean;
  /** 打刻の書式(YYYY MM DD HH mm ss) */
  timestampFormat: string;
}
