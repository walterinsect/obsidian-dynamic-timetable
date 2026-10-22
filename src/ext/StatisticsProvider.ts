import * as vscode from 'vscode';
import { BaseViewProvider } from './BaseViewProvider';

export class StatisticsProvider extends BaseViewProvider {
  static readonly viewType = 'dynamicTimetable.statistics';

  constructor(ctx: vscode.ExtensionContext, service: ConstructorParameters<typeof BaseViewProvider>[1]) {
    super(ctx, service, 'statistics.js');
  }
}
