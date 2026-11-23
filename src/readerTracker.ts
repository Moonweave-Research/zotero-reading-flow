import { activePDFView, activePDFApplication } from './pdfView';
import { DataStore } from './dataStore';
import { Logger } from './Logger';
import { keyedAttachmentReference } from './flowData';
import { getGlobalPreference, READING_FLOW_PREFS } from './preferences';

interface DefaultAdvance {
  parentID: number;
  committed: boolean;
}

interface PendingReaderSave {
  defaultAdvance?: DefaultAdvance;
  timeout: ReturnType<typeof setTimeout>;
  run: (allowDuringShutdown?: boolean) => Promise<void>;
}

interface ReaderCloseObservation {
  preference: typeof READING_FLOW_PREFS.autoComplete | typeof READING_FLOW_PREFS.autoCompleteSnapshot;
  parentID: number;
  itemID: number;
  attachmentKey: string;
  at: number;
  otherTabIDs: Array<string | undefined>;
  defaultSaves: PendingReaderSave[];
  tabRetained?: Promise<boolean>;
}

interface SnapshotWindow {
  viewing?: { reader: any; since: number };
  leftTabs: Set<string>;
  closingReader?: object;
  movingTabs: Set<string>;
  restore: () => void;
}

export class ReaderTracker {
  private dataStore: DataStore;
  private notifierId: string | null = null;
  private readerOpenListener?: (event: any) => void;
  private openedReaders = new WeakSet<object>();
  private readyReaders = new WeakSet<object>();
  private viewStateCleanups = new WeakMap<object, () => void>();
  private readerCloseHooks = new Map<string, { tab: any; restore: () => void }>();
  private closeObservations = new Map<string, ReaderCloseObservation | null>();
  private snapshotWindows = new Map<Window, SnapshotWindow>();
  private selectedSnapshotReaders = new WeakSet<object>();
  private selectedPDFReaders = new WeakSet<object>();
  private restoredReaderItems = new Map<number, number>();
  private newReaderTabs = new Set<string>();
  private pendingSaves = new Map<string, PendingReaderSave>();
  private inFlightSaves = new Set<PendingReaderSave>();
  private flushPromise: Promise<void> | null = null;
  private active = false;
  private generation = 0;
  private static readonly SNAPSHOT_MIN_VIEW_MS = 15_000;
  private static readonly SNAPSHOT_END_MARGIN_PX = 1;
  private static readonly MAX_REASONABLE_PAGE_COUNT = 100000;

  constructor(dataStore: DataStore) {
    this.dataStore = dataStore;
  }

  public register(restoringSession = false) {
    this.generation += 1;
    this.active = true;
    this.notifierId = (Zotero.Notifier as any).registerObserver(this, ['file', 'tab'], 'ReadingFlowTracker', 50);
    const api = (Zotero as any).Reader;
    const generation = this.generation;
    this.openedReaders = new WeakSet<object>();
    this.readyReaders = new WeakSet<object>();
    this.selectedSnapshotReaders = new WeakSet<object>();
    this.selectedPDFReaders = new WeakSet<object>();
    this.restoredReaderItems.clear();
    this.newReaderTabs.clear();
    if (restoringSession) {
      // Zotero loads the selected reader in each saved pane without user input.
      // Unselected restored tabs are loaded later, when the user switches to them.
      const remember = (id: number) => {
        if (Number.isInteger(id)) this.restoredReaderItems.set(id, (this.restoredReaderItems.get(id) ?? 0) + 1);
      };
      for (const win of (Zotero as any).Session?.state?.windows ?? []) {
        if (win.type === 'reader') remember(win.itemID);
        for (const tab of win.tabs ?? []) {
          if (tab.type === 'reader' && tab.selected) remember(tab.data?.itemID);
        }
      }
    }
    if (api?.registerEventListener) {
      this.readerOpenListener = ({ reader }: any) => {
        void this.trackOpenedReader(reader, generation).catch(error => Logger.error('reader-open tracking failed', error));
      };
      api.registerEventListener('renderToolbar', this.readerOpenListener, 'readingflow@moon.com');
    }
    for (const win of (Zotero as any).getMainWindows?.() ?? []) this.trackSnapshotWindow(win);
    Logger.log('ReaderTracker registered, notifierId=' + this.notifierId);
  }

  public unregister() {
    this.active = false;
    this.generation += 1;
    if (this.notifierId) {
      Zotero.Notifier.unregisterObserver(this.notifierId);
      this.notifierId = null;
    }
    if (this.readerOpenListener) {
      (Zotero as any).Reader?.unregisterEventListener?.('renderToolbar', this.readerOpenListener);
      this.readerOpenListener = undefined;
    }
    for (const reader of (Zotero as any).Reader?._readers ?? []) {
      this.viewStateCleanups.get(reader)?.();
    }
    this.viewStateCleanups = new WeakMap();
    for (const hook of this.readerCloseHooks.values()) hook.restore();
    this.readerCloseHooks.clear();
    this.closeObservations.clear();
    for (const state of this.snapshotWindows.values()) state.restore();
    this.restoredReaderItems.clear();
    this.newReaderTabs.clear();
    for (const pending of this.pendingSaves.values()) {
      clearTimeout(pending.timeout);
    }
    this.pendingSaves.clear();
  }

  public async flushPending(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = (async () => {
      while (this.pendingSaves.size > 0 || this.inFlightSaves.size > 0) {
        const saves = new Set([
          ...this.pendingSaves.values(),
          ...this.inFlightSaves.values()
        ]);
        for (const save of saves) clearTimeout(save.timeout);
        await Promise.all([...saves].map((save) => save.run(true)));
      }
    })();
    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  public notify(
    action: string, type: string, ids: Array<number | string> | number | string,
    extraData: Record<string, { type?: string; itemID?: number }> = {}
  ) {
    Logger.log('notify: action=' + action + ' type=' + type + ' ids=' + JSON.stringify(ids));
    if (!this.active || this.isZoteroShuttingDown()) return;
    if (type === 'tab') {
      const tabIDs = Array.isArray(ids) ? ids : [ids];
      if (action === 'close') {
        this.handleClosedTabs(tabIDs);
        for (const id of tabIDs) {
          this.newReaderTabs.delete(String(id));
          for (const state of this.snapshotWindows.values()) state.leftTabs.delete(String(id));
        }
      } else if (action === 'add' && this.restoredReaderItems.size) {
        for (const id of tabIDs) {
          const tab = extraData[id];
          if (tab?.type === 'reader' && tab.itemID !== undefined && this.restoredReaderItems.has(tab.itemID)) {
            this.newReaderTabs.add(String(id));
          }
        }
      } else if (action === 'select') {
        for (const reader of (Zotero as any).Reader?._readers ?? []) {
          if (!tabIDs.includes(reader.tabID) || !this.readyReaders.has(reader)) continue;
          if (reader._type === 'snapshot' && !this.snapshotWindows.has(reader._window)) {
            this.scheduleSnapshotOpening(reader, true);
          } else if (reader._type === 'pdf') {
            this.trackReaderTabClose(reader);
            if (!this.snapshotWindows.has(reader._window) && reader.tabID === reader._window?.Zotero_Tabs?.selectedID) {
              this.selectPDF(reader);
            }
          }
        }
      }
      return;
    }
    if (type !== 'file' || action !== 'pageChange') return;
    const attachmentIds = Array.isArray(ids) ? ids : [ids];
    for (const attachmentId of attachmentIds) {
      if (typeof attachmentId !== 'number') continue;
      const readers: any[] = (Zotero as any).Reader?._readers ?? [];
      const matches = readers.filter(reader => this.toPositiveInt(reader?.itemID) === attachmentId);
      // Zotero's notifier identifies the attachment, not the PDF view or reader instance.
      if (matches.some(reader => this.viewStateCleanups.has(reader)) || matches.length > 1) continue;
      this.handlePageChange(attachmentId, matches[0]);
    }
  }

  private async trackOpenedReader(reader: any, generation: number) {
    if (!reader || !['pdf', 'snapshot'].includes(reader._type) || this.shouldSkipSave(generation) || this.openedReaders.has(reader)) return;
    this.openedReaders.add(reader);
    const snapshotWindow = reader.tabID ? this.trackSnapshotWindow(reader._window) : undefined;
    await reader._initPromise;
    await reader._internalReader?._primaryView?.initializedPromise;
    if (this.shouldSkipSave(generation) || !(Zotero as any).Reader?._readers?.includes(reader)) return;
    this.readyReaders.add(reader);
    const isNewTab = this.newReaderTabs.delete(reader.tabID);
    const restoreCount = isNewTab ? 0 : this.restoredReaderItems.get(reader.itemID) ?? 0;
    if (restoreCount === 1) this.restoredReaderItems.delete(reader.itemID);
    else if (restoreCount > 1) this.restoredReaderItems.set(reader.itemID, restoreCount - 1);
    const selectedTab = reader._window?.Zotero_Tabs?.selectedID;
    const foreground = !reader.tabID || selectedTab === reader.tabID;
    const reselected = snapshotWindow?.leftTabs.has(reader.tabID);
    const advanceDefault = foreground && (restoreCount === 0 || reselected === true);
    if (reader._type === 'snapshot') {
      this.scheduleSnapshotOpening(reader, advanceDefault);
      if (snapshotWindow) {
        this.trackReaderTabClose(reader);
        this.refreshSnapshotViewing(reader._window, snapshotWindow);
      }
      return;
    }
    this.trackReaderTabClose(reader);
    this.trackPDFViewState(reader, generation);
    if (advanceDefault) this.selectedPDFReaders.add(reader);
    this.handlePageChange(reader.itemID, reader);
  }

  private selectPDF(reader: any) {
    if (this.selectedPDFReaders.has(reader)) return;
    this.selectedPDFReaders.add(reader);
    this.handlePageChange(reader.itemID, reader);
  }

  private scheduleSnapshotOpening(reader: any, advanceDefault: boolean) {
    if (this.selectedSnapshotReaders.has(reader)) return;
    const attachment = Zotero.Items.get(reader.itemID);
    if (!attachment?.parentID) return;
    if (advanceDefault) this.selectedSnapshotReaders.add(reader);
    const advance = advanceDefault ? { parentID: attachment.parentID, committed: false } : undefined;
    const key = advanceDefault ? 'foreground-snapshot' : 'snapshot';
    this.scheduleSave(attachment.parentID, `${key}:${reader.itemID}`,
      (parent, at) => this.dataStore.recordSnapshotOpening(parent, at, true, {
        advanceDefault,
        onDefaultAdvanced: advance ? () => { advance.committed = true; } : undefined
      }), advance);
  }

  private trackPDFViewState(reader: any, generation: number) {
    const internal = reader._internalReader;
    const original = internal?._onChangeViewState;
    if (typeof original !== 'function') return;

    const readPageIndex = (view: any) => {
      const win = view?._iframeWindow;
      const page = (win?.wrappedJSObject ?? win)?.PDFViewerApplication?.pdfViewer?.currentPageNumber;
      return Number.isInteger(page) && page > 0 ? page - 1 : null;
    };
    let primaryPage = readPageIndex(internal._primaryView);
    let secondaryPage = readPageIndex(internal._secondaryView);

    const viewStateChanged = (state: any, primary: boolean) => {
      const result = original.call(internal, state, primary);
      const index = state?.pageIndex;
      const pageIndex = Number.isInteger(index) && index >= 0 ? index : null;
      const previous = primary ? primaryPage : secondaryPage;
      if (primary) primaryPage = pageIndex;
      else secondaryPage = pageIndex;
      // View state also changes on zoom, scroll within a page, and split teardown.
      if (!this.shouldSkipSave(generation) && pageIndex !== null && pageIndex !== previous
        && primary === (internal._lastViewPrimary !== false)
        && (Zotero as any).Reader?._readers?.includes(reader)) {
        try {
          this.handlePageChange(reader.itemID, reader, pageIndex);
        } catch (error) {
          Logger.error('PDF view-state tracking failed', error);
        }
      }
      return result;
    };

    try {
      internal._onChangeViewState = viewStateChanged;
    } catch (error) {
      Logger.warn('PDF view-state callback is unavailable; using Zotero page notifications');
      return;
    }
    if (internal._onChangeViewState === viewStateChanged) {
      this.viewStateCleanups.set(reader, () => {
        if (internal._onChangeViewState === viewStateChanged) internal._onChangeViewState = original;
      });
    }
  }

  public trackSnapshotWindow(win: Window): SnapshotWindow | undefined {
    const existing = this.snapshotWindows.get(win);
    if (existing) return existing;
    const tabs = (win as any)?.Zotero_Tabs;
    const property = tabs && Object.getOwnPropertyDescriptor(tabs, '_selectedID');
    if (!this.active || !property?.configurable || !property.writable) return undefined;

    const originalClose = tabs.close;
    if (typeof originalClose !== 'function') return undefined;
    let selected = property.value;
    let closingIDs: string[] = [];
    let clickedTabID: string | undefined;
    const close = function (this: any, ids?: string | string[]) {
      const previous = closingIDs;
      closingIDs = Array.isArray(ids) ? ids : [ids || selected];
      try {
        return originalClose.apply(this, arguments);
      } finally {
        closingIDs = previous;
      }
    };
    const onTabBarClose = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const click = event.type === 'click' && event.button === 0 && target?.closest?.('.tab-close');
      if (!click && !(event.type === 'auxclick' && event.button === 1)) return;
      const tabID = target?.closest?.('#tab-bar-container .tab[data-id]')?.getAttribute('data-id');
      if (!tabID) return;
      clickedTabID = tabID;
      void Promise.resolve().then(() => { if (clickedTabID === tabID) clickedTabID = undefined; });
    };
    const get = () => selected;
    const set = (next: string) => {
      if (next === selected) return;
      const previous = selected;
      try {
        if (tabs._getTab?.(previous)?.tab?.type?.startsWith('reader')) state.leftTabs.add(previous);
        const viewing = state.viewing;
        state.closingReader = undefined;
        // Zotero switches selection synchronously before the selected tab's
        // onClose callback, including for the tab bar's prebound close action.
        if (viewing && viewing.reader.tabID === previous && !state.movingTabs.has(previous)
          && (closingIDs.includes(previous) || clickedTabID === previous)
          && getGlobalPreference(READING_FLOW_PREFS.autoCompleteSnapshot) === true
          && win.document.hasFocus() && win.performance.now() - viewing.since >= ReaderTracker.SNAPSHOT_MIN_VIEW_MS
          && this.snapshotAtEnd(viewing.reader)) {
          const candidate = viewing.reader;
          state.closingReader = candidate;
          void Promise.resolve().then(() => {
            if (state.closingReader === candidate) state.closingReader = undefined;
          });
        }
      } catch (error) {
        Logger.warn('ReadingFlow: could not inspect snapshot selection: ' + String(error));
      }
      selected = next;
      state.viewing = undefined;
      try {
        const reader = this.selectedReader(win);
        if (reader?._type === 'snapshot') this.scheduleSnapshotOpening(reader, true);
        else if (reader?._type === 'pdf') this.selectPDF(reader);
        refresh();
      } catch (error) {
        Logger.warn('ReadingFlow: could not update snapshot selection: ' + String(error));
      }
    };
    const refresh = () => this.refreshSnapshotViewing(win, state);
    const onDeactivate = () => { state.viewing = undefined; };
    const moveHooks = tabs.tabHooks?.moveToNewWindow;
    const originalMove = moveHooks?.reader;
    const move = async function (this: any, tab: { id: string }, ...args: unknown[]) {
      state.movingTabs.add(tab.id);
      try {
        return await originalMove.call(this, tab, ...args);
      } finally {
        state.movingTabs.delete(tab.id);
      }
    };
    const restore = () => {
      if (Object.getOwnPropertyDescriptor(tabs, '_selectedID')?.set === set) {
        Object.defineProperty(tabs, '_selectedID', { ...property, value: selected });
      }
      if (tabs.close === close) tabs.close = originalClose;
      if (moveHooks?.reader === move) moveHooks.reader = originalMove;
      win.removeEventListener('click', onTabBarClose, true);
      win.removeEventListener('auxclick', onTabBarClose, true);
      win.removeEventListener('activate', refresh);
      win.removeEventListener('deactivate', onDeactivate);
      win.removeEventListener('unload', restore);
      this.snapshotWindows.delete(win);
    };
    const state: SnapshotWindow = { leftTabs: new Set(), movingTabs: new Set(), restore };
    Object.defineProperty(tabs, '_selectedID', { configurable: true, enumerable: property.enumerable, get, set });
    tabs.close = close;
    if (typeof originalMove === 'function') moveHooks.reader = move;
    this.snapshotWindows.set(win, state);
    // The React tab bar binds its original close callback before plugin startup.
    win.addEventListener('click', onTabBarClose, true);
    win.addEventListener('auxclick', onTabBarClose, true);
    win.addEventListener('activate', refresh);
    win.addEventListener('deactivate', onDeactivate);
    win.addEventListener('unload', restore);
    return state;
  }

  private selectedReader(win: Window): any {
    const readers: any[] = (Zotero as any).Reader?._readers ?? [];
    const selected = (win as any).Zotero_Tabs.selectedID;
    return readers.find(reader => reader._window === win && reader.tabID === selected && this.readyReaders.has(reader));
  }

  private refreshSnapshotViewing(win: Window, state: SnapshotWindow) {
    const reader = win.document.hasFocus() && this.selectedReader(win);
    if (!reader || !this.selectedSnapshotReaders.has(reader)) state.viewing = undefined;
    else if (state.viewing?.reader !== reader) state.viewing = { reader, since: win.performance.now() };
  }

  private snapshotAtEnd(reader: any): boolean {
    const internal = reader._internalReader;
    const view = internal && ('_lastView' in internal ? internal._lastView
      : internal._lastViewPrimary === false ? internal._secondaryView : internal._primaryView);
    if (view?.initialized === false) return false;
    const doc: Document | undefined = view?._iframeDocument;
    const scroll = doc?.scrollingElement;
    if (!doc || !scroll) return false;
    const { scrollHeight, clientHeight, scrollTop } = scroll;
    const atEnd = Number.isFinite(scrollHeight) && Number.isFinite(clientHeight) && Number.isFinite(scrollTop)
      && clientHeight > 0 && scrollHeight >= clientHeight && scrollTop >= 0
      && scrollHeight - clientHeight - scrollTop <= ReaderTracker.SNAPSHOT_END_MARGIN_PX;
    if (!atEnd || scrollHeight > clientHeight) return atEnd;
    return !this.hasUnfinishedScrollRegion(doc, clientHeight, scroll.clientWidth);
  }

  private hasUnfinishedScrollRegion(doc: Document, height: number, width: number): boolean {
    const win = doc.defaultView;
    if (!win || !doc.body) return false;
    return Array.from(doc.body.querySelectorAll('*')).some(element => {
      if (!element.clientHeight
        || element.scrollHeight - element.clientHeight - element.scrollTop <= ReaderTracker.SNAPSHOT_END_MARGIN_PX) return false;
      const style = win.getComputedStyle(element);
      if (!['auto', 'scroll', 'overlay'].includes(style.overflowY) || style.visibility !== 'visible') return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.bottom > 0 && rect.top < height && rect.right > 0 && rect.left < width;
    });
  }

  private trackReaderTabClose(reader: any) {
    const id = reader.tabID;
    if (typeof id !== 'string') return;
    const tabs = reader._window?.Zotero_Tabs;
    const tab = tabs?._getTab?.(id)?.tab;
    const original = tab?.onClose;
    if (typeof original !== 'function') return;
    const existing = this.readerCloseHooks.get(id);
    if (existing?.tab === tab) return;
    existing?.restore();

    const tracker = this;
    const onClose = function (this: any, ...args: unknown[]) {
      try {
        restore();
        tracker.readerCloseHooks.delete(id);
        // Capture before Zotero removes the viewer. A DB transaction may delay
        // the close notification until after its document has gone away.
        // Tab moves change the reader's owner before disposing of the old tab.
        if (tracker.active && reader.tabID === id) {
          const state = tracker.snapshotWindows.get(reader._window);
          const observation = reader._type === 'snapshot'
            ? state?.closingReader === reader && !tracker.isZoteroShuttingDown()
              && getGlobalPreference(READING_FLOW_PREFS.autoCompleteSnapshot) === true
              ? tracker.captureReaderClose(reader, READING_FLOW_PREFS.autoCompleteSnapshot) : null
            : tracker.capturePDFClose(reader);
          if (state && state.closingReader === reader) state.closingReader = undefined;
          if (observation) {
            // Memory unload recreates the tab synchronously with the same ID.
            observation.tabRetained = Promise.resolve()
              .then(() => Boolean(tabs._getTab(id)?.tab))
              .catch(() => true);
          }
          tracker.closeObservations.set(id, observation);
        }
      } catch (error) {
        Logger.warn('ReadingFlow: could not capture reader tab closure: ' + String(error));
      }
      return original.apply(this, args);
    };
    const restore = () => {
      try {
        if (tab.onClose === onClose) tab.onClose = original;
      } catch {
        // The owning window can already be gone during shutdown.
      }
    };
    try {
      tab.onClose = onClose;
      if (tab.onClose === onClose) this.readerCloseHooks.set(id, { tab, restore });
    } catch (error) {
      Logger.warn('ReadingFlow: reader tab close callback is unavailable: ' + String(error));
    }
  }

  private capturePDFClose(reader: any): ReaderCloseObservation | null {
    if (reader?._type !== 'pdf' || !this.readyReaders.has(reader) || this.isZoteroShuttingDown()
      || getGlobalPreference(READING_FLOW_PREFS.autoComplete) !== true) return null;
    // Only the live, focused PDF page at close can trigger automatic Read.
    const app = activePDFApplication(reader);
    const page = app?.pdfViewer?.currentPageNumber, count = app?.pdfDocument?.numPages;
    if (!Number.isInteger(page) || !Number.isInteger(count) || count <= 0
      || count > ReaderTracker.MAX_REASONABLE_PAGE_COUNT || page !== count) return null;
    return this.captureReaderClose(reader, READING_FLOW_PREFS.autoComplete);
  }

  private captureReaderClose(reader: any, preference: ReaderCloseObservation['preference']): ReaderCloseObservation | null {
    try {
      const attachment = Zotero.Items.get(reader.itemID) as any;
      if (!attachment?.parentID || !keyedAttachmentReference(attachment.key)
        || (preference === READING_FLOW_PREFS.autoCompleteSnapshot && attachment.deleted)) return null;
      const parent = Zotero.Items.get(attachment.parentID) as any;
      if (!parent || parent.deleted || !this.dataStore.canEdit(parent)) return null;
      this.dataStore.invalidateCache(parent.id);
      const closingData = this.dataStore.getData(parent);
      if (closingData.availability) return null;
      const defaultSaves = closingData.defaultToRead
        ? [...this.pendingSaves.values(), ...this.inFlightSaves]
          .filter(save => save.defaultAdvance?.parentID === parent.id)
        : [];
      if (closingData.s !== null && !defaultSaves.length) return null;

      const readers: any[] = (Zotero as any).Reader?._readers ?? [];
      const otherTabIDs = readers.filter(other => other !== reader && !other._isTabClosed
        && (Zotero.Items.get(other.itemID) as any)?.parentID === attachment.parentID).map(other => other.tabID);
      if (preference === READING_FLOW_PREFS.autoCompleteSnapshot) {
        for (const tabID of this.openReaderTabIDs(parent.id)) {
          if (tabID !== reader.tabID && !otherTabIDs.includes(tabID)) otherTabIDs.push(tabID);
        }
      }
      return { preference, parentID: parent.id, itemID: reader.itemID, attachmentKey: attachment.key,
        at: Date.now(), otherTabIDs, defaultSaves };
    } catch (error) {
      Logger.warn('ReadingFlow: could not record the closing reader: ' + String(error));
      return null;
    }
  }

  private handleClosedTabs(ids: Array<number | string>) {
    const readers: any[] = (Zotero as any).Reader?._readers ?? [];
    for (const id of ids) {
      if (typeof id !== 'string') continue;
      let observation = this.closeObservations.get(id);
      this.closeObservations.delete(id);
      if (observation === undefined && !this.readerCloseHooks.has(id)) {
        try {
          observation = this.capturePDFClose(readers.find(reader => reader.tabID === id));
        } catch (error) {
          Logger.warn('ReadingFlow: could not inspect the closing PDF reader: ' + String(error));
        }
      }
      if (!observation || observation.otherTabIDs.some(other => other === undefined || !ids.includes(other))) continue;
      const { preference, parentID, itemID, attachmentKey, at, defaultSaves, tabRetained } = observation;
      const generation = this.generation;
      const isCurrent = () => generation === this.generation && this.active
        && getGlobalPreference(preference) === true && !this.isZoteroShuttingDown();
      this.scheduleSave(parentID, `complete:${itemID}`, async (parent) => {
        if (await tabRetained || !isCurrent()) return false;
        if (defaultSaves.length) {
          await Promise.all(defaultSaves.map(save => save.run()));
          if (!defaultSaves.some(save => save.defaultAdvance?.committed)) return false;
        }
        const completionStillApplies = () => isCurrent()
          && (preference !== READING_FLOW_PREFS.autoCompleteSnapshot
            || this.canCompleteSnapshot(parentID, itemID, attachmentKey));
        return this.dataStore.recordAutomaticRead(parent, { attachmentKey, at }, completionStillApplies);
      });
    }
  }

  private openReaderTabIDs(parentID: number): string[] {
    const windows = new Set<Window>([...this.snapshotWindows.keys(), ...((Zotero as any).getMainWindows?.() ?? [])]);
    const ids: string[] = [];
    for (const win of windows) {
      for (const tab of (win as any)?.Zotero_Tabs?._tabs ?? []) {
        const itemID = tab.data?.itemID;
        if ((tab.type === 'reader' || tab.type === 'reader-unloaded' || tab.type === 'reader-loading')
          && Number.isInteger(itemID) && Zotero.Items.get(itemID)?.parentID === parentID) ids.push(tab.id);
      }
    }
    return ids;
  }

  private canCompleteSnapshot(parentID: number, itemID: number, attachmentKey: string): boolean {
    const attachment = Zotero.Items.get(itemID) as any;
    if (!attachment || attachment.deleted || attachment.parentID !== parentID || attachment.key !== attachmentKey) return false;
    const readers: any[] = (Zotero as any).Reader?._readers ?? [];
    return !this.openReaderTabIDs(parentID).length
      && !readers.some(reader => !reader._isTabClosed && Zotero.Items.get(reader.itemID)?.parentID === parentID);
  }

  private handlePageChange(attachmentId: number, sourceReader?: any, observedPageIndex?: number) {
    Logger.log('handlePageChange: attachmentId=' + attachmentId);

    const zotero = (globalThis as any).Zotero;
    const readers = zotero?.Reader?._readers;
    if (!Array.isArray(readers)) {
      Logger.warn('ReaderTracker: reader registry is unavailable; skipping page-change tracking');
      return;
    }
    Logger.log('_readers count=' + readers.length);

    const reader = sourceReader ?? readers.find((r: any) => this.toPositiveInt(r?.itemID) === attachmentId);
    Logger.log('reader found=' + !!reader + ' type=' + reader?._type);

    const item = zotero?.Items?.get?.(attachmentId) as any;
    if (!item) return;
    const parentId = item.parentID;
    if (!parentId) return;

    let progress = 0;
    let pdfNumPages = 0;
    let pageIndex: number | null = null;
    if (reader?._type === 'pdf' || item.isPDFAttachment?.()) {
      pageIndex = observedPageIndex ?? this.getCurrentPageIndex(reader, item);
      if (pageIndex === null) return;
      pdfNumPages = this.getPDFPageCount(reader, item);
      Logger.log('pdf pageIndex=' + pageIndex + ' numPages=' + pdfNumPages);
      if (pdfNumPages > 0) {
        progress = Math.min(pageIndex + 1, pdfNumPages) / pdfNumPages;
      } else {
        Logger.log('pdf page count unavailable; skipping synthetic page number fallback');
        progress = 0;
      }
    }

    progress = this.normalizeProgress(progress);
    Logger.log('progress=' + progress);

    if (progress === 0) {
      Logger.log('progress=0, skipping save');
      return;
    }

    const isPdfWithPages = (reader?._type === 'pdf' || item.isPDFAttachment?.()) && pdfNumPages > 0;
    const lastPage = isPdfWithPages && pageIndex !== null ? Math.min(pageIndex + 1, pdfNumPages) : null;
    const pageCount = isPdfWithPages ? pdfNumPages : null;
    const reference = keyedAttachmentReference(item.key) ?? String(attachmentId);
    const advanceDefault = this.selectedPDFReaders.has(reader);
    this.debounceSave(parentId, reference, progress, lastPage, pageCount, advanceDefault);
  }

  private debounceSave(
    parentId: number,
    attachmentId: string,
    progress: number,
    lastPage: number | null,
    pageCount: number | null,
    advanceDefault: boolean
  ) {
    const key = `${parentId}:${attachmentId}`;
    const advance = this.pendingSaves.get(key)?.defaultAdvance
      ?? (advanceDefault ? { parentID: parentId, committed: false } : undefined);
    this.scheduleSave(parentId, attachmentId, (parent, at) => this.dataStore.recordProgressUnlessResetAfter(
      parent, { attachmentId, progress, pageCount, lastPage, at }, at, {
        allowDuringShutdown: true,
        ...(advance ? { advanceDefault: true, onDefaultAdvanced: () => { advance.committed = true; } } : {})
      }
    ), advance);
  }

  private scheduleSave(
    parentId: number, attachmentId: string, persist: (parent: any, at: number) => Promise<boolean>,
    defaultAdvance?: DefaultAdvance
  ) {
    const key = `${parentId}:${attachmentId}`;
    const existing = this.pendingSaves.get(key);
    if (existing) {
      clearTimeout(existing.timeout);
      this.pendingSaves.delete(key);
    }
    const generation = this.generation;
    const scheduledAt = Date.now();
    let allowShutdown = false;
    let operation: Promise<void> | null = null;
    let save: PendingReaderSave;
    const run = async (allowDuringShutdown = false) => {
      if (allowDuringShutdown) allowShutdown = true;
      if (operation) return operation;
      operation = (async () => {
        if (this.pendingSaves.get(key) === save) this.pendingSaves.delete(key);
        this.inFlightSaves.add(save);
        try {
          if (this.shouldSkipSave(generation, allowShutdown)) {
            Logger.log('save skipped: tracker inactive or Zotero shutting down');
            return;
          }
          Logger.log('saving reader activity for parent=' + parentId);
          const parentItem = await Zotero.Items.getAsync(parentId);
          if (this.shouldSkipSave(generation, allowShutdown)) {
            Logger.log('save skipped after getAsync: tracker inactive or Zotero shutting down');
            return;
          }
          if (parentItem) {
            const saved = await persist(parentItem, scheduledAt);
            if (this.shouldSkipSave(generation, allowShutdown)) {
              Logger.log('post-save refresh skipped: tracker inactive or Zotero shutting down');
              return;
            }
            if (!saved) {
              Logger.log(`save skipped: parent=${parentId} progress was not persisted`);
              return;
            }
            Zotero.ItemTreeManager.refreshColumns?.();
            Zotero.Notifier.trigger('refresh', 'item', [parentId]);
            Logger.log('save complete');
          }
        } catch (e) {
          Logger.error('save failed', e);
        } finally {
          this.inFlightSaves.delete(save);
        }
      })();
      return operation;
    };
    const timeout = setTimeout(run, 5000);
    save = { timeout, run, defaultAdvance };
    this.pendingSaves.set(key, save);
  }

  private isZoteroShuttingDown(): boolean {
    const startup = (globalThis as any).Services?.startup;
    return Boolean(startup?.shuttingDown);
  }

  private shouldSkipSave(generation: number, allowDuringShutdown = false): boolean {
    return !this.active
      || generation !== this.generation
      || (!allowDuringShutdown && this.isZoteroShuttingDown());
  }

  private normalizeProgress(progress: number): number {
    if (!Number.isFinite(progress)) return 0;
    if (progress <= 0) return 0;
    // Values above 1 are legacy/fallback page numbers and are rendered as pages.
    return progress > 1 ? Math.round(progress) : Math.min(1, progress);
  }

  private getCurrentPageIndex(reader: any, item: any): number | null {
    // PDFViewer updates its visible page before Zotero's asynchronous synced setting.
    const view = activePDFView(reader);
    const app = activePDFApplication(reader);
    const page = app?.pdfViewer?.currentPageNumber ?? app?.page;
    if (typeof page === 'number' && Number.isInteger(page) && page > 0) return page - 1;
    const visibleIndex = view?._state?.pageIndex;
    if (Number.isInteger(visibleIndex) && visibleIndex >= 0) return visibleIndex;
    if (reader?._internalReader?._lastView || typeof reader?._internalReader?._lastViewPrimary === 'boolean') return null;
    // Reader._state may still describe the initial opening location.
    const currentPageIndex = item.getAttachmentLastPageIndex?.();
    if (typeof currentPageIndex === 'number' && Number.isFinite(currentPageIndex) && currentPageIndex >= 0) {
      return currentPageIndex;
    }
    const readerPageIndex = reader?._state?.pageIndex ?? reader?._internalReader?._state?.pageIndex;
    if (typeof readerPageIndex === 'number' && Number.isFinite(readerPageIndex) && readerPageIndex >= 0) {
      return readerPageIndex;
    }

    return null;
  }

  private getPDFPageCount(reader: any, item: any): number {
    const primaryWindow =
      reader?._internalReader?._primaryView?._iframeWindow?.wrappedJSObject
      ?? reader?._internalReader?._primaryView?._iframeWindow
      ?? reader?._iframeWindow?.wrappedJSObject
      ?? reader?._iframeWindow;
    const readerWindow = reader?._internalReader?._iframeWindow?.wrappedJSObject
      ?? reader?._internalReader?._iframeWindow
      ?? reader?._iframeWindow?.wrappedJSObject
      ?? reader?._iframeWindow;
    const app = primaryWindow?.PDFViewerApplication ?? readerWindow?.PDFViewerApplication ?? reader?.PDFViewerApplication;
    const itemPageCount = this.toPositiveInt(
      item?.getField?.('numPages')
      ?? item?.getField?.('pages')
      ?? item?.getField?.('numPagesRaw')
      ?? item?.getField?.('pageCount')
    );
    const normalizedItemPageCount = itemPageCount > 0 && itemPageCount <= ReaderTracker.MAX_REASONABLE_PAGE_COUNT
      ? itemPageCount
      : undefined;
    const normalizedReaderPageCount = this.toPositiveInt(
      app?.pdfDocument?.numPages
      ?? app?.pdfViewer?.pagesCount
      ?? app?.pdfViewer?._pages?.length
      ?? app?.pagesCount
      ?? app?._pagesCount
      ?? app?._numPages
      ?? reader?._numPages
      ?? reader?._state?.numPages
      ?? reader?._internalReader?._state?.numPages
      ?? reader?._primaryView?._state?.numPages
    );

    if (!normalizedReaderPageCount) {
      return normalizedItemPageCount ?? 0;
    }

    if (normalizedReaderPageCount > ReaderTracker.MAX_REASONABLE_PAGE_COUNT) {
      return 0;
    }

    if (normalizedItemPageCount && normalizedItemPageCount !== normalizedReaderPageCount && Math.abs(normalizedReaderPageCount - normalizedItemPageCount) > 1) {
      Logger.warn(`PDF page count mismatch: metadata=${itemPageCount}, reader=${normalizedReaderPageCount}; using metadata`);
      return normalizedItemPageCount;
    }

    if (normalizedItemPageCount) {
      return normalizedItemPageCount;
    }

    return normalizedReaderPageCount;
  }

  private toPositiveInt(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.round(value);
    }

    if (typeof value !== 'string') {
      return 0;
    }

    const match = value.match(/\d+/);
    if (!match) return 0;

    const parsed = Number(match[0]);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  }
}
