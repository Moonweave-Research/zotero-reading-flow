import { DataStore } from './dataStore';
import { ReaderTracker } from './readerTracker';
import { ColumnManager } from './columnManager';
import { StyleManager } from './styleManager';
import { NotifierManager } from './notifierManager';
import { Logger } from './Logger';
import { ReadingFlowMenuManager } from './menuManager';
import { DashboardManager } from './dashboardManager';
import {
  calculateStatisticsSnapshot,
  type HistoryRange,
  type StatisticsDataset
} from './statistics';
import type { DashboardBridge, DashboardStatusFilter } from './dashboard';
import { createStatisticsScopeAdapter } from './statisticsScope';
import { ResumeReader } from './resumeReader';

const DASHBOARD_CHROME_URI = 'chrome://readingflow/content/';

class Bootstrap {
  public dataStore?: DataStore;
  private readerTracker?: ReaderTracker;
  private columnManager?: ColumnManager;
  private styleManager: StyleManager;
  private notifierManager?: NotifierManager;
  private menuManager?: ReadingFlowMenuManager;
  private dashboardManager?: DashboardManager;
  private preferencePaneID: string | null = null;
  private started = false;
  private rootURI: string | null = null;
  private dashboardChromeHandle: { destruct?: () => void } | null = null;

  constructor() {
    this.styleManager = new StyleManager();
  }

  install() {}

  async startup({ id, version, rootURI }: { id: string; version: string; rootURI: string }) {
    await Zotero.initializationPromise;
    this.rootURI = rootURI;
    this.started = true;
    Logger.log('startup begin');

    try {
      this.dataStore = new DataStore();
      Logger.log('dataStore OK');
    } catch (e) { Logger.error('dataStore FAIL', e); return; }

    try {
      this.registerPreferencePane(id, rootURI);
    } catch (e) { Logger.error('preferencePane FAIL', e); }

    try {
      this.dashboardChromeHandle = this.registerDashboardChrome(rootURI);
      const win = Zotero.getMainWindow();
      this.styleManager.injectCSS(win.document);
      this.styleManager.injectLocale(win, rootURI);
      Logger.log('CSS OK');
    } catch (e) { Logger.error('CSS FAIL', e); }

    try {
      this.readerTracker = new ReaderTracker(this.dataStore!);
      this.readerTracker.register();
      Logger.log('readerTracker OK');
    } catch (e) { Logger.error('readerTracker FAIL', e); }

    try {
      this.columnManager = new ColumnManager(this.dataStore!);
      await this.columnManager.register();
      Logger.log('columnManager OK');
    } catch (e) { Logger.error('columnManager FAIL', e); }

    try {
      this.notifierManager = new NotifierManager(this.dataStore!);
      this.notifierManager.register();
      Logger.log('notifierManager OK');
    } catch (e) { Logger.error('notifierManager FAIL', e); }

    try {
      const scopeAdapter = createStatisticsScopeAdapter();
      const dataStore = this.dataStore!;
      const resumeReader = new ResumeReader(dataStore);
      const dashboardBridge: DashboardBridge = {
          async getSnapshot(
            scope,
            historyRange: HistoryRange = '7d',
            statusFilter: DashboardStatusFilter = 'all',
            dataset: StatisticsDataset = 'tracked'
          ) {
            const items = await scopeAdapter.getItems(scope);
            return calculateStatisticsSnapshot(items.map((item) => ({
              id: item.id,
              title: item.getField?.('title') ?? undefined,
              tracked: dataStore.hasReadingFlowData(item),
              flowData: dataStore.getData(item)
            })), {
              dataset,
              historyRange,
              statusFilter: statusFilter === 'all' ? undefined : statusFilter
            });
          },
          async focusItem(id) {
            const itemID = typeof id === 'number' ? id : Number(id);
            if (!Number.isInteger(itemID) || itemID <= 0) return false;

            const pane = Zotero.getActiveZoteroPane?.();
            if (!pane?.selectItem) return false;
            const selected = await pane.selectItem(itemID);
            if (selected) Zotero.getMainWindow()?.focus?.();
            return Boolean(selected);
          },
          async resumeItem(id) {
            return resumeDashboardItem(id, resumeReader);
          }
      };
      if (this.dashboardChromeHandle) {
        this.dashboardManager = new DashboardManager(
          Zotero.getMainWindow(),
          DASHBOARD_CHROME_URI,
          dashboardBridge
        );
      }
      this.menuManager = new ReadingFlowMenuManager(this.dataStore!, this.dashboardManager);
      this.menuManager.register();
      Logger.log('menuManager OK');
    } catch (e) { Logger.error('menuManager FAIL', e); }

    Logger.log('startup complete');
  }

  shutdown(reason?: number) {
    this.started = false;
    this.dashboardManager?.close();
    this.dashboardManager = undefined;
    this.rootURI = null;
    this.dataStore?.close();
    this.readerTracker?.unregister();
    this.notifierManager?.unregister();
    if (!this.isAppShutdown(reason)) {
      this.columnManager?.unregister();
      this.menuManager?.unregister();
      this.unregisterPreferencePane();
    }
    this.styleManager.unregister();
    this.dashboardChromeHandle?.destruct?.();
    this.dashboardChromeHandle = null;
  }

  uninstall() {}

  onMainWindowLoad({ window }: { window: Window }) {
    if (!this.started) return;
    try {
      this.styleManager.injectCSS(window.document);
      if (this.rootURI) {
        this.styleManager.injectLocale(window, this.rootURI);
      }
      void this.columnManager?.ensureColumnsVisibleOnFirstRun();
    } catch (e) {
      Logger.error('onMainWindowLoad failed', e);
    }
  }

  onMainWindowUnload() {}

  private registerPreferencePane(pluginID: string, rootURI: string) {
    if (!Zotero.PreferencePanes?.register) return;
    this.preferencePaneID = Zotero.PreferencePanes.register({
      pluginID,
      src: `${rootURI}prefs.xhtml`
    }) ?? null;
    Logger.log('preferencePane OK');
  }

  private registerDashboardChrome(rootURI: string) {
    const services = (globalThis as any).Services;
    const cc = (globalThis as any).Cc;
    const ci = (globalThis as any).Ci;
    const components = (globalThis as any).Components;
    const addonManagerStartup = cc?.['@mozilla.org/addons/addon-manager-startup;1']
      ?.getService?.(ci?.amIAddonManagerStartup)
      ?? components?.classes?.['@mozilla.org/addons/addon-manager-startup;1']
        ?.getService?.(components.interfaces.amIAddonManagerStartup);
    if (!addonManagerStartup || !services?.io?.newURI) {
      throw new Error('Zotero chrome registration APIs are unavailable');
    }

    const manifestURI = services.io.newURI(`${rootURI}manifest.json`);
    return addonManagerStartup.registerChrome(manifestURI, [
      ['content', 'readingflow', rootURI]
    ]);
  }

  private unregisterPreferencePane() {
    if (!this.preferencePaneID || !Zotero.PreferencePanes?.unregister) return;
    Zotero.PreferencePanes.unregister(this.preferencePaneID);
    this.preferencePaneID = null;
  }

  private isAppShutdown(reason?: number) {
    return typeof reason === 'number'
      && typeof (globalThis as any).APP_SHUTDOWN === 'number'
      && reason === (globalThis as any).APP_SHUTDOWN;
  }
}

type DashboardResumeReader = Pick<ResumeReader, 'resume'>;

export async function resumeDashboardItem(
  id: number | string,
  resumeReader: DashboardResumeReader
): Promise<boolean> {
  const itemID = typeof id === 'number' ? id : Number(id);
  if (!Number.isInteger(itemID) || itemID <= 0) return false;

  const item = Zotero.Items?.get?.(itemID);
  if (!item || item.parentID || !item.isRegularItem?.()) return false;
  return resumeReader.resume(item);
}

const BOOTSTRAP = new Bootstrap();

export function install() { BOOTSTRAP.install(); }
export async function startup(data: any, reason: any) { await BOOTSTRAP.startup(data); }
export function shutdown(data: any, reason: any) { BOOTSTRAP.shutdown(reason); }
export function uninstall() { BOOTSTRAP.uninstall(); }
export function onMainWindowLoad(data: any) { BOOTSTRAP.onMainWindowLoad(data); }
export function onMainWindowUnload(data: any) { BOOTSTRAP.onMainWindowUnload(); }
