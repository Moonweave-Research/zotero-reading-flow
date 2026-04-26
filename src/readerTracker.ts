import { DataStore } from './dataStore';
import { Logger } from './Logger';

export class ReaderTracker {
  private dataStore: DataStore;
  private notifierId: string | null = null;
  private saveTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private active = false;
  private generation = 0;
  private static readonly MAX_REASONABLE_PAGE_COUNT = 100000;

  constructor(dataStore: DataStore) {
    this.dataStore = dataStore;
  }

  public register() {
    this.generation += 1;
    this.active = true;
    this.notifierId = Zotero.Notifier.registerObserver(this, ['file'], 'ReadingFlowTracker');
    Logger.log('ReaderTracker registered, notifierId=' + this.notifierId);
  }

  public unregister() {
    this.active = false;
    this.generation += 1;
    if (this.notifierId) {
      Zotero.Notifier.unregisterObserver(this.notifierId);
      this.notifierId = null;
    }
    for (const timeout of this.saveTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.saveTimeouts.clear();
  }

  public notify(action: string, type: string, ids: number[] | number) {
    Logger.log('notify: action=' + action + ' type=' + type + ' ids=' + JSON.stringify(ids));
    if (!this.active || this.isZoteroShuttingDown()) return;
    if (type !== 'file' || action !== 'pageChange') return;
    const attachmentIds = Array.isArray(ids) ? ids : [ids];
    for (const attachmentId of attachmentIds) {
      this.handlePageChange(attachmentId);
    }
  }

  private handlePageChange(attachmentId: number) {
    Logger.log('handlePageChange: attachmentId=' + attachmentId);

    const readers = Zotero.Reader._readers as any[];
    Logger.log('_readers count=' + (readers?.length ?? 'null'));

    const reader = readers?.find((r: any) => this.toPositiveInt(r?.itemID) === attachmentId);
    Logger.log('reader found=' + !!reader + ' type=' + reader?._type);

    const item = Zotero.Items.get(attachmentId) as any;
    if (!item) return;
    const parentId = item.parentID;
    if (!parentId) return;

    let progress = 0;
    let pdfNumPages = 0;
    if (reader?._type === 'pdf' || item.isPDFAttachment?.()) {
      const pageIndex = this.getCurrentPageIndex(reader, item) ?? 0;
      pdfNumPages = this.getPDFPageCount(reader, item);
      Logger.log('pdf pageIndex=' + pageIndex + ' numPages=' + pdfNumPages);
      if (pdfNumPages > 0) {
        progress = Math.min(pageIndex + 1, pdfNumPages) / pdfNumPages;
      } else {
        Logger.log('pdf page count unavailable; skipping synthetic page number fallback');
        progress = 0;
      }
    } else if (reader?._type === 'epub' || reader?._type === 'snapshot') {
      const savedPosition = item.getAttachmentLastPageIndex?.();
      progress =
        typeof savedPosition === 'number'
          ? savedPosition
          : reader?._state?.scrollYPercent || 0;
    }

    progress = this.normalizeProgress(progress);
    Logger.log('progress=' + progress);

    if (progress === 0) {
      Logger.log('progress=0, skipping save');
      return;
    }

    const isPdfWithPages = (reader?._type === 'pdf' || item.isPDFAttachment?.()) && pdfNumPages > 0;
    const lastPage = isPdfWithPages ? this.getLastPage(reader, item, pdfNumPages) : null;
    const pageCount = isPdfWithPages ? pdfNumPages : null;
    this.debounceSave(parentId, String(attachmentId), progress, lastPage, pageCount);
  }

  private debounceSave(
    parentId: number,
    attachmentId: string,
    progress: number,
    lastPage: number | null,
    pageCount: number | null
  ) {
    const key = `${parentId}:${attachmentId}`;
    const existingTimeout = this.saveTimeouts.get(key);
    if (existingTimeout) clearTimeout(existingTimeout);
    const generation = this.generation;
    const timeout = setTimeout(async () => {
      this.saveTimeouts.delete(key);
      if (this.shouldSkipSave(generation)) {
        Logger.log('save skipped: tracker inactive or Zotero shutting down');
        return;
      }
      try {
        Logger.log('saving progress=' + progress + ' for parent=' + parentId);
        const parentItem = await Zotero.Items.getAsync(parentId);
        if (this.shouldSkipSave(generation)) {
          Logger.log('save skipped after getAsync: tracker inactive or Zotero shutting down');
          return;
        }
        if (parentItem) {
          const current = this.dataStore.getData(parentItem).p?.[attachmentId];
          const nextProgress = typeof current === 'number' ? Math.max(current, progress) : progress;
          if (nextProgress !== progress) {
            Logger.log(`save adjusted to preserve max progress current=${current} attempted=${progress}`);
          }
          await this.dataStore.updateData(parentItem, {
            p: { [attachmentId]: nextProgress },
            pageCount: pageCount ? { [attachmentId]: pageCount } : undefined,
            lastAttachmentId: attachmentId,
            lastPage,
            lastReadAt: Date.now()
          });
          if (this.shouldSkipSave(generation)) {
            Logger.log('post-save refresh skipped: tracker inactive or Zotero shutting down');
            return;
          }
          Zotero.ItemTreeManager.refreshColumns?.();
          Zotero.Notifier.trigger('refresh', 'item', [parentId]);
          Logger.log('save complete');
        }
      } catch (e) {
        Logger.error('save failed', e);
      }
    }, 5000);
    this.saveTimeouts.set(key, timeout);
  }

  private isZoteroShuttingDown(): boolean {
    const startup = (globalThis as any).Services?.startup;
    return Boolean(startup?.shuttingDown);
  }

  private shouldSkipSave(generation: number): boolean {
    return !this.active || generation !== this.generation || this.isZoteroShuttingDown();
  }

  private normalizeProgress(progress: number): number {
    if (!Number.isFinite(progress)) return 0;
    if (progress <= 0) return 0;
    // Values above 1 are legacy/fallback page numbers and are rendered as pages.
    return progress > 1 ? Math.round(progress) : Math.min(1, progress);
  }

  private getLastPage(reader: any, item: any, maxPage?: number): number | null {
    const pageIndex = this.getCurrentPageIndex(reader, item);
    if (typeof pageIndex !== 'number' || !Number.isFinite(pageIndex)) return null;
    const page = pageIndex + 1;
    if (!maxPage || maxPage <= 0) {
      return page;
    }
    return Math.min(page, maxPage);
  }

  private getCurrentPageIndex(reader: any, item: any): number | null {
    const livePageIndex = reader?._state?.pageIndex ?? reader?._internalReader?._state?.pageIndex;
    if (typeof livePageIndex === 'number' && Number.isFinite(livePageIndex) && livePageIndex >= 0) {
      return livePageIndex;
    }

    const savedPageIndex = item.getAttachmentLastPageIndex?.();
    if (typeof savedPageIndex === 'number' && Number.isFinite(savedPageIndex) && savedPageIndex >= 0) {
      return savedPageIndex;
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
      Logger.warn(`PDF page count mismatch: metadata=${itemPageCount}, reader=${normalizedReaderPageCount}; using reader`);
      return normalizedReaderPageCount;
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
