import type { HistoryRange, StatisticsDataset, StatisticsSnapshot } from './statistics';
import type { DashboardStatusFilter } from './dashboard';
import type { StatisticsScope } from './statisticsScope';

const DASHBOARD_WINDOW_NAME = 'reading-flow-dashboard';
const DASHBOARD_WINDOW_FEATURES = 'chrome,dialog=no,resizable,centerscreen,width=900,height=650';

type DashboardWindow = Window & { closed?: boolean };
type DashboardWindowController = { refresh?: () => Promise<void> | void };
type ZoteroMainWindow = Window & {
  openDialog(url?: string, target?: string, features?: string, ...args: any[]): Window | null;
};

export interface DashboardDataSource {
  getSnapshot(
    scope: StatisticsScope,
    historyRange?: HistoryRange,
    statusFilter?: DashboardStatusFilter,
    dataset?: StatisticsDataset
  ): Promise<StatisticsSnapshot>;
}

export class DashboardManager {
  private dashboardWindow: DashboardWindow | null = null;

  constructor(
    private readonly mainWindow: Window,
    private readonly rootURI: string,
    private readonly dataSource?: DashboardDataSource
  ) {}

  public open(): DashboardWindow {
    if (this.dashboardWindow && !this.dashboardWindow.closed) {
      const dashboardWindow = this.dashboardWindow;
      dashboardWindow.focus();
      const schedule = (this.mainWindow as any).setTimeout ?? (globalThis as any).setTimeout;
      if (typeof schedule === 'function') {
        schedule.call(this.mainWindow, () => {
          if (!dashboardWindow.closed) dashboardWindow.focus();
        }, 100);
      }
      return dashboardWindow;
    }

    const openDialog = (this.mainWindow as ZoteroMainWindow).openDialog;
    if (typeof openDialog !== 'function') {
      throw new Error('Zotero main window does not expose openDialog');
    }
    const args: any[] = [
      `${this.rootURI}dashboard.xhtml`,
      DASHBOARD_WINDOW_NAME,
      DASHBOARD_WINDOW_FEATURES
    ];
    if (this.dataSource) args.push(this.dataSource);
    const dashboardWindow = openDialog.call(this.mainWindow, ...args) as DashboardWindow | null;
    if (!dashboardWindow) {
      throw new Error('Zotero did not open the Reading Flow dashboard window');
    }

    this.dashboardWindow = dashboardWindow;
    dashboardWindow.addEventListener('unload', () => {
      if (this.dashboardWindow === dashboardWindow) {
        this.dashboardWindow = null;
      }
    }, { once: true });
    return dashboardWindow;
  }

  public close() {
    const dashboardWindow = this.dashboardWindow;
    this.dashboardWindow = null;
    if (dashboardWindow && !dashboardWindow.closed) {
      dashboardWindow.close();
    }
  }

  public refresh() {
    const dashboardWindow = this.dashboardWindow as (
      DashboardWindow & { readingFlowDashboard?: DashboardWindowController }
    ) | null;
    if (!dashboardWindow || dashboardWindow.closed) return;
    void dashboardWindow.readingFlowDashboard?.refresh?.();
  }
}
