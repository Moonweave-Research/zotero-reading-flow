import { activePDFView, activePDFApplication } from './pdfView';
import { DataStore } from './dataStore';
import { Logger } from './Logger';
import { keyedAttachmentReference } from './flowData';
import { getGlobalPreference, READING_FLOW_PREFS } from './preferences';

interface SnapshotAdvance {
  parentID: number;
  committed: boolean;
}

interface PendingReaderSave {
  snapshotAdvance?: SnapshotAdvance;
  timeout: ReturnType<typeof setTimeout>;
  run: (allowDuringShutdown?: boolean) => Promise<void>;
}

interface PDFCloseObservation {
  parentID: number;
  itemID: number;
  attachmentKey: string;
  at: number;
  otherTabIDs: Array<string | undefined>;
  snapshotSaves: PendingReaderSave[];
  tabRetained?: Promise<boolean>;
}

export class ReaderTracker {
  private dataStore: DataStore;
  private notifierId: string | null = null;
  private readerOpenListener?: (event: any) => void;
  private openedReaders = new WeakSet<object>();
  private readyReaders = new WeakSet<object>();
  private viewStateCleanups = new WeakMap<object, () => void>();
  private pdfCloseHooks = new Map<string, { tab: any; restore: () => void }>();
  private pdfCloseObservations = new Map<string, PDFCloseObservation | null>();
  private selectedSnapshotReaders = new WeakSet<object>();
  private restoredReaderItems = new Map<number, number>();
  private newReaderTabs = new Set<string>();
  private pendingSaves = new Map<string, PendingReaderSave>();
  private inFlightSaves = new Set<PendingReaderSave>();
  private flushPromise: Promise<void> | null = null;
  private active = false;
  private generation = 0;
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
    for (const hook of this.pdfCloseHooks.values()) hook.restore();
    this.pdfCloseHooks.clear();
    this.pdfCloseObservations.clear();
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
        for (const id of tabIDs) this.newReaderTabs.delete(String(id));
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
          if (reader._type === 'snapshot') this.scheduleSnapshotOpening(reader, true);
          else if (reader._type === 'pdf') this.trackPDFTabClose(reader);
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
    await reader._initPromise;
    await reader._internalReader?._primaryView?.initializedPromise;
    if (this.shouldSkipSave(generation) || !(Zotero as any).Reader?._readers?.includes(reader)) return;
    this.readyReaders.add(reader);
    const isNewTab = this.newReaderTabs.delete(reader.tabID);
    const restoreCount = isNewTab ? 0 : this.restoredReaderItems.get(reader.itemID) ?? 0;
    if (restoreCount === 1) this.restoredReaderItems.delete(reader.itemID);
    else if (restoreCount > 1) this.restoredReaderItems.set(reader.itemID, restoreCount - 1);
    if (reader._type === 'snapshot') {
      const selectedTab = reader._window?.Zotero_Tabs?.selectedID;
      const foreground = !reader.tabID || selectedTab === reader.tabID;
      this.scheduleSnapshotOpening(reader, foreground && restoreCount === 0);
      return;
    }
    this.trackPDFTabClose(reader);
    this.trackPDFViewState(reader, generation);
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

  private trackPDFTabClose(reader: any) {
    const id = reader.tabID;
    if (typeof id !== 'string') return;
    const tabs = reader._window?.Zotero_Tabs;
    const tab = tabs?._getTab?.(id)?.tab;
    const original = tab?.onClose;
    if (typeof original !== 'function') return;
    const existing = this.pdfCloseHooks.get(id);
    if (existing?.tab === tab) return;
    existing?.restore();

    const tracker = this;
    const onClose = function (this: any, ...args: unknown[]) {
      try {
        restore();
        tracker.pdfCloseHooks.delete(id);
        // Capture before Zotero removes the viewer. A DB transaction may delay
        // the close notification until after its document has gone away.
        // Tab moves change the reader's owner before disposing of the old tab.
        if (tracker.active && reader.tabID === id) {
          const observation = tracker.capturePDFClose(reader);
          if (observation) {
            // Memory unload recreates the tab synchronously with the same ID.
            observation.tabRetained = Promise.resolve()
              .then(() => Boolean(tabs._getTab(id)?.tab))
              .catch(() => true);
          }
          tracker.pdfCloseObservations.set(id, observation);
        }
      } catch (error) {
        Logger.warn('ReadingFlow: could not capture PDF tab closure: ' + String(error));
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
      if (tab.onClose === onClose) this.pdfCloseHooks.set(id, { tab, restore });
    } catch (error) {
      Logger.warn('ReadingFlow: PDF tab close callback is unavailable: ' + String(error));
    }
  }

  private capturePDFClose(reader: any): PDFCloseObservation | null {
    if (!reader || reader._type !== 'pdf' || !this.readyReaders.has(reader)
      || this.isZoteroShuttingDown() || getGlobalPreference(READING_FLOW_PREFS.autoComplete) !== true) return null;
    try {
      const pdf = Zotero.Items.get(reader.itemID) as any;
      if (!pdf?.parentID || !keyedAttachmentReference(pdf.key)) return null;
      const parent = Zotero.Items.get(pdf.parentID) as any;
      if (!parent || parent.deleted || !this.dataStore.canEdit(parent)) return null;
      this.dataStore.invalidateCache(parent.id);
      const closingData = this.dataStore.getData(parent);
      if (closingData.availability) return null;
      const snapshotSaves = closingData.defaultToRead
        ? [...this.pendingSaves.values(), ...this.inFlightSaves]
          .filter(save => save.snapshotAdvance?.parentID === parent.id)
        : [];
      if (closingData.s !== null && !snapshotSaves.length) return null;

      // Only the live, focused PDF page at close can trigger automatic Read.
      const app = activePDFApplication(reader);
      const page = app?.pdfViewer?.currentPageNumber, count = app?.pdfDocument?.numPages;
      if (!Number.isInteger(page) || !Number.isInteger(count) || count <= 0
        || count > ReaderTracker.MAX_REASONABLE_PAGE_COUNT || page !== count) return null;
      const readers: any[] = (Zotero as any).Reader?._readers ?? [];
      const otherTabIDs = readers.filter(other => other !== reader && !other._isTabClosed
        && (Zotero.Items.get(other.itemID) as any)?.parentID === pdf.parentID).map(other => other.tabID);
      return { parentID: parent.id, itemID: reader.itemID, attachmentKey: pdf.key, at: Date.now(), otherTabIDs, snapshotSaves };
    } catch (error) {
      Logger.warn('ReadingFlow: could not inspect the closing PDF reader: ' + String(error));
      return null;
    }
  }

  private handleClosedTabs(ids: Array<number | string>) {
    const readers: any[] = (Zotero as any).Reader?._readers ?? [];
    for (const id of ids) {
      if (typeof id !== 'string') continue;
      let observation = this.pdfCloseObservations.get(id);
      this.pdfCloseObservations.delete(id);
      if (observation === undefined && !this.pdfCloseHooks.has(id)) {
        observation = this.capturePDFClose(readers.find(reader => reader.tabID === id));
      }
      if (!observation || observation.otherTabIDs.some(other => other === undefined || !ids.includes(other))) continue;
      const { parentID, itemID, attachmentKey, at, snapshotSaves, tabRetained } = observation;
      const generation = this.generation;
      const isCurrent = () => generation === this.generation && this.active
        && getGlobalPreference(READING_FLOW_PREFS.autoComplete) === true && !this.isZoteroShuttingDown();
      this.scheduleSave(parentID, `complete:${itemID}`, async (parent) => {
        if (await tabRetained || !isCurrent()) return false;
        if (snapshotSaves.length) {
          await Promise.all(snapshotSaves.map(save => save.run()));
          if (!snapshotSaves.some(save => save.snapshotAdvance?.committed)) return false;
        }
        return this.dataStore.recordAutomaticRead(parent, { attachmentKey, at }, isCurrent);
      });
    }
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
    this.debounceSave(parentId, reference, progress, lastPage, pageCount);
  }

  private debounceSave(
    parentId: number,
    attachmentId: string,
    progress: number,
    lastPage: number | null,
    pageCount: number | null
  ) {
    this.scheduleSave(parentId, attachmentId, (parent, at) => this.dataStore.recordProgressUnlessResetAfter(
      parent, { attachmentId, progress, pageCount, lastPage, at }, at, { allowDuringShutdown: true }
    ));
  }

  private scheduleSave(
    parentId: number, attachmentId: string, persist: (parent: any, at: number) => Promise<boolean>,
    snapshotAdvance?: SnapshotAdvance
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
    save = { timeout, run, snapshotAdvance };
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
