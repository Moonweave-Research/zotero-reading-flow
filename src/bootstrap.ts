import { DataStore } from './dataStore';
import { ReaderTracker } from './readerTracker';
import { ColumnManager } from './columnManager';
import { StyleManager } from './styleManager';
import { NotifierManager } from './notifierManager';
import { PopoverManager } from './popoverManager';
import { Logger } from './Logger';
import { ReadingFlowMenuManager } from './menuManager';

class Bootstrap {
  public dataStore?: DataStore;
  private readerTracker?: ReaderTracker;
  private columnManager?: ColumnManager;
  private styleManager: StyleManager;
  private notifierManager?: NotifierManager;
  private popoverManager?: PopoverManager;
  private menuManager?: ReadingFlowMenuManager;
  private popoverRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private preferencePaneID: string | null = null;
  private started = false;

  constructor() {
    this.styleManager = new StyleManager();
  }

  install() {}

  async startup({ id, version, rootURI }: { id: string; version: string; rootURI: string }) {
    await Zotero.initializationPromise;
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
      const win = Zotero.getMainWindow();
      this.styleManager.injectCSS(win.document);
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
      this.menuManager = new ReadingFlowMenuManager(this.dataStore!);
      this.menuManager.register();
      Logger.log('menuManager OK');
    } catch (e) { Logger.error('menuManager FAIL', e); }

    try {
      this.popoverManager = new PopoverManager();
      this.registerPopoverWhenReady();
    } catch (e) { Logger.error('popoverManager FAIL', e); }

    Logger.log('startup complete');
  }

  shutdown(reason?: number) {
    this.started = false;
    this.dataStore?.close();
    this.clearPopoverRetry();
    this.readerTracker?.unregister();
    this.notifierManager?.unregister();
    this.popoverManager?.unregister();
    if (!this.isAppShutdown(reason)) {
      this.columnManager?.unregister();
      this.menuManager?.unregister();
      this.unregisterPreferencePane();
    }
    this.styleManager.unregister();
  }

  uninstall() {}

  onMainWindowLoad({ window }: { window: Window }) {
    if (!this.started) return;
    try {
      this.styleManager.injectCSS(window.document);
      this.registerPopoverWhenReady();
    } catch (e) {
      Logger.error('onMainWindowLoad failed', e);
    }
  }

  onMainWindowUnload() {
    this.clearPopoverRetry();
    this.popoverManager?.unregister();
  }

  private registerPopoverWhenReady() {
    if (!this.started || !this.popoverManager) return;

    const pane = Zotero.getActiveZoteroPane();
    if (pane?.itemsView?.contentElement) {
      this.clearPopoverRetry();
      this.popoverManager.register();
      Logger.log('popoverManager OK');
      return;
    }

    if (!this.popoverRetryTimer) {
      const win = Zotero.getMainWindow();
      this.popoverRetryTimer = win.setTimeout(() => {
        this.popoverRetryTimer = null;
        this.registerPopoverWhenReady();
      }, 1000);
    }
  }

  private clearPopoverRetry() {
    if (!this.popoverRetryTimer) return;
    clearTimeout(this.popoverRetryTimer);
    this.popoverRetryTimer = null;
  }

  private registerPreferencePane(pluginID: string, rootURI: string) {
    if (!Zotero.PreferencePanes?.register) return;
    this.preferencePaneID = Zotero.PreferencePanes.register({
      pluginID,
      src: `${rootURI}prefs.xhtml`
    }) ?? null;
    Logger.log('preferencePane OK');
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

const BOOTSTRAP = new Bootstrap();

export function install() { BOOTSTRAP.install(); }
export async function startup(data: any, reason: any) { await BOOTSTRAP.startup(data); }
export function shutdown(data: any, reason: any) { BOOTSTRAP.shutdown(reason); }
export function uninstall() { BOOTSTRAP.uninstall(); }
export function onMainWindowLoad(data: any) { BOOTSTRAP.onMainWindowLoad(data); }
export function onMainWindowUnload(data: any) { BOOTSTRAP.onMainWindowUnload(); }
