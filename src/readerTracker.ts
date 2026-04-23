import { DataStore } from './dataStore';
import { Logger } from './Logger';

export class ReaderTracker {
  private dataStore: DataStore;
  private notifierId: string | null = null;
  private saveTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private active = false;
  private generation = 0;

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

    const reader = readers?.find(r => r.itemID === attachmentId);
    Logger.log('reader found=' + !!reader + ' type=' + reader?._type);

    const item = Zotero.Items.get(attachmentId) as any;
    if (!item) return;
    const parentId = item.parentID;
    if (!parentId) return;

    let progress = 0;
    if (reader?._type === 'pdf' || item.isPDFAttachment?.()) {
      const savedPageIndex = item.getAttachmentLastPageIndex?.();
      const pageIndex =
        typeof savedPageIndex === 'number'
          ? savedPageIndex
          : reader?._state?.pageIndex ?? reader?._internalReader?._state?.pageIndex ?? 0;
      const numPages = this.getPDFPageCount(reader);
      Logger.log('pdf pageIndex=' + pageIndex + ' numPages=' + numPages);
      if (numPages > 0) {
        progress = (pageIndex + 1) / numPages;
      } else {
        // Keep a visible fallback instead of leaving the custom column blank.
        progress = pageIndex + 1;
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

    const lastPage = progress > 1 ? progress : this.getLastPage(reader, item);
    this.debounceSave(parentId, String(attachmentId), progress, lastPage);
  }

  private debounceSave(parentId: number, attachmentId: string, progress: number, lastPage: number | null) {
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

  private getLastPage(reader: any, item: any): number | null {
    const savedPageIndex = item.getAttachmentLastPageIndex?.();
    const pageIndex =
      typeof savedPageIndex === 'number'
        ? savedPageIndex
        : reader?._state?.pageIndex ?? reader?._internalReader?._state?.pageIndex;
    return typeof pageIndex === 'number' && Number.isFinite(pageIndex) ? pageIndex + 1 : null;
  }

  private getPDFPageCount(reader: any): number {
    const primaryWindow =
      reader?._internalReader?._primaryView?._iframeWindow?.wrappedJSObject
      ?? reader?._internalReader?._primaryView?._iframeWindow;
    const readerWindow = reader?._iframeWindow?.wrappedJSObject ?? reader?._iframeWindow;
    const app = primaryWindow?.PDFViewerApplication ?? readerWindow?.PDFViewerApplication;
    return (
      app?.pdfDocument?.numPages
      ?? app?.pdfViewer?.pagesCount
      ?? app?.pdfViewer?._pages?.length
      ?? app?.pagesCount
      ?? 0
    );
  }
}
