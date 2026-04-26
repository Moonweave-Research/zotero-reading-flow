import { DataStore } from './dataStore';
import { FlowData } from './flowData';
import { Logger } from './Logger';

type ZoteroItem = {
  id: number;
  parentID?: number | null;
  isPDFAttachment?: () => boolean;
  isRegularItem?: () => boolean;
  getBestAttachment?: () => Promise<ZoteroItem | null | undefined> | ZoteroItem | null | undefined;
};

type ReaderLocation = { pageIndex: number } | undefined;

type ResumeTarget = {
  attachment: ZoteroItem;
  lastPage: number | null;
  totalPages: number | null;
};

export type ResumeDisplayTarget = {
  canResume: boolean;
  attachmentId?: number;
  lastPage?: number | null;
  totalPages?: number | null;
  l10nArgs?: string;
  fallbackLabel: string;
};

export class ResumeReader {
  private static readonly MAX_REASONABLE_PAGE_COUNT = 100000;

  constructor(private readonly dataStore: DataStore) {}

  public async canResume(item: ZoteroItem): Promise<boolean> {
    const target = await this.getResumeDisplayTarget(item);
    return target.canResume;
  }

  public async getResumeDisplayTarget(item: ZoteroItem): Promise<ResumeDisplayTarget> {
    const target = await this.resolveTargetSafely(item);
    if (!target) {
      return { canResume: false, fallbackLabel: 'Resume Reading' };
    }

    const canResume = this.isPositiveInteger(target.lastPage);
    const lastPage = canResume ? target.lastPage : null;
    const totalPages = canResume ? target.totalPages : null;
    const fallbackLabel = this.getFallbackLabel(lastPage, totalPages);
    const l10nArgs = this.getL10nArgs(lastPage, totalPages);

    return {
      canResume,
      attachmentId: target.attachment.id,
      lastPage: target.lastPage,
      totalPages,
      l10nArgs,
      fallbackLabel
    };
  }

  public async resume(item: ZoteroItem): Promise<boolean> {
    const target = await this.resolveTargetSafely(item);
    if (!target) return false;

    const location = this.getLocation(target.lastPage);
    return this.openAttachment(target.attachment.id, location);
  }

  private async resolveTargetSafely(item: ZoteroItem): Promise<ResumeTarget | null> {
    try {
      return await this.resolveTarget(item);
    } catch (error) {
      Logger.warn(`ResumeReader: failed to resolve target: ${this.getErrorMessage(error)}`);
      return null;
    }
  }

  private async resolveTarget(item: ZoteroItem): Promise<ResumeTarget | null> {
    if (this.isPdfAttachment(item)) {
      const parentData = this.getParentData(item);
      return {
        attachment: item,
        lastPage: this.getAttachmentLastPage(item),
        totalPages: this.getAttachmentPageCount(item, parentData)
      };
    }

    if (!item.isRegularItem?.()) return null;

    const data = this.dataStore.getData(item);
    return this.resolveParentTarget(item, data);
  }

  private async resolveParentTarget(item: ZoteroItem, data: FlowData): Promise<ResumeTarget | null> {
    const trackedAttachment = this.getTrackedAttachment(data.lastAttachmentId, item.id);
    if (trackedAttachment) {
      return {
        attachment: trackedAttachment,
        lastPage: data.lastPage,
        totalPages: this.getAttachmentPageCount(trackedAttachment, data)
      };
    }

    const bestAttachment = await item.getBestAttachment?.();
    if (!bestAttachment || !this.isPdfAttachment(bestAttachment)) return null;
    return {
      attachment: bestAttachment,
      lastPage: null,
      totalPages: this.getAttachmentPageCount(bestAttachment, data)
    };
  }

  private getTrackedAttachment(lastAttachmentId: string | null, parentId: number): ZoteroItem | null {
    const id = this.parsePositiveId(lastAttachmentId);
    if (!id) return null;

    try {
      const item = (globalThis as any).Zotero?.Items?.get?.(id);
      return this.isPdfAttachment(item) && this.idsEqual(item.parentID, parentId) ? item : null;
    } catch (error) {
      Logger.warn(`ResumeReader: failed to resolve tracked attachment ${id}`);
      return null;
    }
  }

  private getAttachmentLastPage(attachment: ZoteroItem): number | null {
    const parentID = this.parsePositiveNumber(attachment.parentID);
    if (!parentID) {
      return null;
    }

    try {
      const parent = (globalThis as any).Zotero?.Items?.get?.(parentID);
      if (!parent?.isRegularItem?.()) return null;

      const data = this.dataStore.getData(parent);
      return this.idsEqual(data.lastAttachmentId, attachment.id) ? data.lastPage : null;
    } catch (error) {
      Logger.warn(`ResumeReader: failed to resolve parent item ${parentID}: ${this.getErrorMessage(error)}`);
      return null;
    }
  }

  private getAttachmentPageCount(attachment: ZoteroItem, parentData?: FlowData): number | null {
    const attachmentId = this.parsePositiveNumber(attachment.id);
    if (!attachmentId) return null;

    const cachedPageCount = this.normalizePageCount(
      this.parsePositiveCount(parentData?.pageCount?.[String(attachmentId)])
    );
    const metadataPageCount = this.normalizePageCount(
      this.readAttachmentPageCountFromMetadata(attachment)
    );
    const stablePageCount = cachedPageCount ?? metadataPageCount;
    const liveReaderPageCount = this.getAttachmentPageCountFromReader(attachment);

    if (liveReaderPageCount && stablePageCount && Math.abs(liveReaderPageCount - stablePageCount) > 1) {
      Logger.warn(`ResumeReader: PDF page count mismatch: stable=${stablePageCount}, reader=${liveReaderPageCount}; using stable count`);
      return stablePageCount;
    }

    return liveReaderPageCount ?? stablePageCount;
  }

  private getAttachmentPageCountFromReader(attachment: ZoteroItem): number | null {
    const attachmentId = this.parsePositiveNumber(attachment.id);
    if (!attachmentId) return null;

    const readers = (globalThis as any).Zotero?.Reader?._readers;
    if (!Array.isArray(readers)) {
      return null;
    }

    const reader = readers.find((entry: any) => this.parsePositiveNumber(entry?.itemID) === attachmentId);
    if (!reader) {
      return null;
    }

    return this.readPdfPageCountFromReader(reader, attachment);
  }

  private readPdfPageCountFromReader(reader: any, attachment: ZoteroItem): number | null {
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

    return this.normalizePageCount(this.parsePositiveCount(
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
      ?? this.readAttachmentPageCountFromMetadata(attachment)
    ));
  }

  private getParentData(item: ZoteroItem): FlowData | undefined {
    const parentId = this.parsePositiveNumber(item.parentID);
    if (!parentId) return undefined;

    try {
      const parent = (globalThis as any).Zotero?.Items?.get?.(parentId);
      if (!parent?.isRegularItem?.()) return undefined;
      return this.dataStore.getData(parent);
    } catch (error) {
      Logger.warn(`ResumeReader: failed to resolve parent item data for attachment ${item.id}: ${this.getErrorMessage(error)}`);
      return undefined;
    }
  }

  private async openAttachment(attachmentId: number, location: ReaderLocation): Promise<boolean> {
    if (!location) {
      return this.openWithoutLocation(attachmentId);
    }

    try {
      await this.callOpen(attachmentId, location);
      return true;
    } catch (error) {
      Logger.warn(`ResumeReader: opening ${attachmentId} at saved page failed; retrying without location`);
      return this.openWithoutLocation(attachmentId);
    }
  }

  private async openWithoutLocation(attachmentId: number): Promise<boolean> {
    try {
      await this.callOpen(attachmentId, undefined);
      return true;
    } catch (error) {
      Logger.warn(`ResumeReader: failed to open attachment ${attachmentId}: ${this.getErrorMessage(error)}`);
      return false;
    }
  }

  private async callOpen(attachmentId: number, location: ReaderLocation): Promise<void> {
    const zotero = (globalThis as any).Zotero;
    const readerOpen = zotero?.Reader?.open;
    if (typeof readerOpen === 'function') {
      await readerOpen.call(zotero.Reader, attachmentId, location);
      return;
    }

    throw new Error('Zotero.Reader.open is not available');
  }

  private getLocation(lastPage: number | null): ReaderLocation {
    return typeof lastPage === 'number' && Number.isFinite(lastPage) && lastPage > 0
      ? { pageIndex: lastPage - 1 }
      : undefined;
  }

  private getFallbackLabel(lastPage: number | null, totalPages: number | null): string {
    if (!lastPage) return 'Resume Reading';
    if (totalPages) return `Resume at Page ${lastPage} / ${totalPages}`;
    return `Resume at Page ${lastPage}`;
  }

  private getL10nArgs(lastPage: number | null, totalPages: number | null): string | undefined {
    if (!lastPage) return undefined;

    if (totalPages) {
      return JSON.stringify({ mode: 'page-total', page: lastPage, total: totalPages });
    }

    return JSON.stringify({ mode: 'page', page: lastPage });
  }

  private isPdfAttachment(item: ZoteroItem | null | undefined): boolean {
    return Boolean(item?.id && item.isPDFAttachment?.());
  }

  private parsePositiveId(value: string | null): number | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const parsed = Number.parseInt(trimmed, 10);
    return String(parsed) === trimmed && parsed > 0 ? parsed : null;
  }

  private parsePositiveNumber(value: unknown): number | null {
    return this.parsePositiveInteger(value);
  }

  private readAttachmentPageCountFromMetadata(attachment: ZoteroItem): number | null {
    const getField = (attachment as any)?.getField;
    if (typeof getField !== 'function') return null;

    return this.parsePositiveCount(
      getField.call(attachment, 'numPages')
      ?? getField.call(attachment, 'pages')
      ?? getField.call(attachment, 'numPagesRaw')
      ?? getField.call(attachment, 'pageCount')
    );
  }

  private normalizePageCount(value: number | null): number | null {
    if (!value) return null;
    return value <= ResumeReader.MAX_REASONABLE_PAGE_COUNT ? value : null;
  }

  private parsePositiveCount(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.trunc(value);
    }

    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    const match = value.match(/\d+/);
    if (!match) return null;

    const parsed = Number.parseInt(match[0], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private idsEqual(left: unknown, right: unknown): boolean {
    const leftId = this.parsePositiveInteger(left);
    const rightId = this.parsePositiveInteger(right);
    return leftId !== null && rightId !== null && leftId === rightId;
  }

  private parsePositiveInteger(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isInteger(value) && value > 0 ? value : null;
    }
    if (typeof value !== 'string' || !value.trim()) return null;

    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 && String(parsed) === value.trim() ? parsed : null;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private isPositiveInteger(value: number | null): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
  }
}
