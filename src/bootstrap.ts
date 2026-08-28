import { DataStore } from './dataStore';
import { ReaderTracker } from './readerTracker';
import { ColumnManager } from './columnManager';
import { StyleManager } from './styleManager';
import { NotifierManager } from './notifierManager';
import { Logger } from './Logger';
import { ReadingFlowMenuManager } from './menuManager';
import { DashboardManager } from './dashboardManager';
import {
  calculateActivityDayDetail,
  calculateStatisticsSnapshot,
  selectStatisticsPapers,
  type HistoryRange,
  type StatisticsDataset,
  type StatisticsPaper
} from './statistics';
import type {
  ActivityDayDetailCacheLifecycleToken,
  ActivityDayDetailResult,
  DashboardBridge,
  DashboardStatusFilter
} from './dashboard';
import {
  createStatisticsScopeAdapter,
  type StatisticsScopeAdapter
} from './statisticsScope';
import { ResumeReader } from './resumeReader';
import { SidebarSearchManager } from './sidebarSearchManager';
import {
  clearLegacyReadingFlowPreferenceAliases,
  setNewItemStatusPreference
} from './preferences';

const DASHBOARD_CHROME_URI = 'chrome://readingflow/content/';

export function runWhenUIReady(
  runtime: any,
  task: () => void | Promise<void>
): Promise<void> {
  const ready = runtime?.uiReadyPromise;
  const gate = ready && typeof ready.then === 'function' ? Promise.resolve(ready) : Promise.resolve();
  return gate
    .then(() => waitForMountedMainItemTree(runtime))
    .then(() => task());
}

function waitForMountedMainItemTree(runtime: any): Promise<void> {
  const currentView = () => runtime?.getActiveZoteroPane?.()?.itemsView;
  const view = currentView();
  // Zotero can resolve uiReadyPromise before the item tree's VirtualizedTable ref mounts.
  if (!view || view.tree) return Promise.resolve();

  const schedule = runtime?.getMainWindow?.()?.setTimeout;
  if (typeof schedule !== 'function') return Promise.resolve();

  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      const candidate = currentView();
      if (!candidate || candidate.tree) {
        resolve();
        return;
      }
      attempts += 1;
      if (attempts >= 100) {
        reject(new Error('Zotero main item tree did not finish mounting'));
        return;
      }
      schedule.call(runtime.getMainWindow(), check, 50);
    };
    schedule.call(runtime.getMainWindow(), check, 50);
  });
}

export class Bootstrap {
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
    clearLegacyReadingFlowPreferenceAliases();
    const sidebarSearchManager = new SidebarSearchManager();
    (Zotero as any).ReadingFlowPreferences = {
      setNewItemStatus: (value: string) => setNewItemStatusPreference(value),
      createSidebarSearch: () => sidebarSearchManager.create(),
      removeSidebarSearch: () => sidebarSearchManager.remove(),
      refreshSidebarSearchStatus: () => sidebarSearchManager.status()
    };
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

    void runWhenUIReady(Zotero, async () => {
      if (!this.started || !this.dataStore) return;
      try {
        await sidebarSearchManager.migrateTrackedSearches();
      } catch (error) {
        Logger.warn(`ReadingFlow: sidebar search migration skipped: ${String(error)}`);
      }
      this.columnManager = new ColumnManager(this.dataStore);
      await this.columnManager.register();
      Logger.log('columnManager OK');
    }).catch((e) => Logger.error('columnManager FAIL', e));

    try {
      this.notifierManager = new NotifierManager(this.dataStore!);
      this.notifierManager.register();
      Logger.log('notifierManager OK');
    } catch (e) { Logger.error('notifierManager FAIL', e); }

    try {
      const scopeAdapter = createStatisticsScopeAdapter();
      const dataStore = this.dataStore!;
      const resumeReader = new ResumeReader(dataStore);
      const dashboardBridge = createDashboardBridge({ scopeAdapter, dataStore, resumeReader });
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

  async shutdown(reason?: number) {
    this.started = false;
    this.dashboardManager?.close();
    this.dashboardManager = undefined;
    this.rootURI = null;
    await this.readerTracker?.flushPending();
    this.readerTracker?.unregister();
    this.dataStore?.close();
    this.notifierManager?.unregister();
    if (!this.isAppShutdown(reason)) {
      this.columnManager?.unregister();
      this.menuManager?.unregister();
      this.unregisterPreferencePane();
    }
    this.styleManager.unregister();
    delete (Zotero as any).ReadingFlowPreferences;
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

  async onMainWindowUnload() {
    await this.readerTracker?.flushPending();
  }

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

interface DashboardBridgeDataStore {
  hasReadingFlowData(item: unknown): boolean;
  getData(item: unknown): StatisticsPaper['flowData'];
}

export interface DashboardBridgeDependencies {
  scopeAdapter: Pick<StatisticsScopeAdapter, 'getItems'>;
  dataStore: DashboardBridgeDataStore;
  resumeReader: DashboardResumeReader;
}

export interface ActivityDayDashboardBridge extends DashboardBridge {
  getActivityDayDetail(snapshotId: string, day: string): Promise<ActivityDayDetailResult>;
  beginActivityDayDetailCacheLifecycle(): ActivityDayDetailCacheLifecycleToken;
  discardActivityDayDetailCache(token?: ActivityDayDetailCacheLifecycleToken): void;
}

export function createDashboardBridge({
  scopeAdapter,
  dataStore,
  resumeReader
}: DashboardBridgeDependencies): ActivityDayDashboardBridge {
  let nextSnapshotID = 0;
  let latestRequestSequence = 0;
  let currentLifecycle: ActivityDayDetailCacheLifecycleToken | null =
    createActivityDayDetailCacheLifecycleToken();
  let activityDayCache: {
    snapshotId: string;
    papers: StatisticsPaper[];
    query: {
      scope: 'current-view' | 'entire-library';
      historyRange: HistoryRange;
      statusFilter: DashboardStatusFilter;
      dataset: StatisticsDataset;
    };
    activeDays: Set<string>;
  } | null = null;

  return {
    async getSnapshot(
      scope,
      historyRange: HistoryRange = '7d',
      statusFilter: DashboardStatusFilter = 'all',
      dataset: StatisticsDataset = 'tracked'
    ) {
      const requestSequence = ++latestRequestSequence;
      const requestLifecycle = currentLifecycle;
      const items = await scopeAdapter.getItems(scope);
      const papers = items.map((item) => ({
        id: item.id,
        title: item.getField?.('title') ?? undefined,
        tracked: dataStore.hasReadingFlowData(item),
        flowData: dataStore.getData(item)
      }));
      const snapshot = calculateStatisticsSnapshot(papers, {
        dataset,
        historyRange,
        statusFilter: statusFilter === 'all' ? undefined : statusFilter
      });
      const selectedPapers = selectStatisticsPapers(papers, {
        dataset,
        statusFilter: statusFilter === 'all' ? undefined : statusFilter
      });
      const snapshotId = `reading-flow-${Date.now().toString(36)}-${++nextSnapshotID}`;
      if (
        requestSequence === latestRequestSequence
        && requestLifecycle !== null
        && requestLifecycle === currentLifecycle
      ) {
        activityDayCache = {
          snapshotId,
          papers: selectedPapers,
          query: { scope, historyRange, statusFilter, dataset },
          activeDays: new Set(
            snapshot.history.days
              .filter((day) => day.activePapers > 0)
              .map((day) => day.day)
          )
        };
      }
      return { ...snapshot, snapshotId };
    },
    async getActivityDayDetail(snapshotId, day): Promise<ActivityDayDetailResult> {
      const cache = activityDayCache;
      if (!cache || cache.snapshotId !== snapshotId || !cache.activeDays.has(day)) {
        return { snapshotId, day, state: 'unavailable' };
      }
      return {
        snapshotId,
        day,
        state: 'available',
        papers: calculateActivityDayDetail(cache.papers, day)
      };
    },
    beginActivityDayDetailCacheLifecycle() {
      latestRequestSequence += 1;
      activityDayCache = null;
      currentLifecycle = createActivityDayDetailCacheLifecycleToken();
      return currentLifecycle;
    },
    discardActivityDayDetailCache(token) {
      if (!token || token !== currentLifecycle) return;
      latestRequestSequence += 1;
      activityDayCache = null;
      currentLifecycle = null;
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
}

function createActivityDayDetailCacheLifecycleToken(): ActivityDayDetailCacheLifecycleToken {
  return {} as ActivityDayDetailCacheLifecycleToken;
}

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
export async function shutdown(data: any, reason: any) { await BOOTSTRAP.shutdown(reason); }
export function uninstall() { BOOTSTRAP.uninstall(); }
export function onMainWindowLoad(data: any) { BOOTSTRAP.onMainWindowLoad(data); }
export async function onMainWindowUnload(data: any) { await BOOTSTRAP.onMainWindowUnload(); }
