import { DataStore } from './dataStore';
import { FlowData } from './flowData';
import { Logger } from './Logger';

type ZoteroItem = {
  id: number;
  parentID?: number | null;
  isPDFAttachment?: () => boolean;
  getBestAttachment?: () => Promise<ZoteroItem | null | undefined> | ZoteroItem | null | undefined;
};

type ReaderLocation = { pageIndex: number } | undefined;

type ResumeTarget = {
  attachment: ZoteroItem;
  lastPage: number | null;
};

export class ResumeReader {
  constructor(private readonly dataStore: DataStore) {}

  public async canResume(item: ZoteroItem): Promise<boolean> {
    const target = await this.resolveTarget(item);
    return Boolean(target);
  }

  public async resume(item: ZoteroItem): Promise<boolean> {
    const target = await this.resolveTarget(item);
    if (!target) return false;

    const location = this.getLocation(target.lastPage);
    return this.openAttachment(target.attachment.id, location);
  }

  private async resolveTarget(item: ZoteroItem): Promise<ResumeTarget | null> {
    if (this.isPdfAttachment(item)) {
      return {
        attachment: item,
        lastPage: this.getAttachmentLastPage(item)
      };
    }

    const data = this.dataStore.getData(item);
    const attachment = await this.resolveParentAttachment(item, data);
    if (!attachment) return null;

    return {
      attachment,
      lastPage: data.lastPage
    };
  }

  private async resolveParentAttachment(item: ZoteroItem, data: FlowData): Promise<ZoteroItem | null> {
    const trackedAttachment = this.getTrackedAttachment(data.lastAttachmentId);
    if (trackedAttachment) return trackedAttachment;

    const bestAttachment = await item.getBestAttachment?.();
    return this.isPdfAttachment(bestAttachment) ? bestAttachment : null;
  }

  private getTrackedAttachment(lastAttachmentId: string | null): ZoteroItem | null {
    const id = this.parsePositiveId(lastAttachmentId);
    if (!id) return null;

    try {
      const item = (globalThis as any).Zotero?.Items?.get?.(id);
      return this.isPdfAttachment(item) ? item : null;
    } catch (error) {
      Logger.warn(`ResumeReader: failed to resolve tracked attachment ${id}`);
      return null;
    }
  }

  private getAttachmentLastPage(attachment: ZoteroItem): number | null {
    const parentID = this.parsePositiveNumber(attachment.parentID);
    if (!parentID) {
      return this.dataStore.getData(attachment).lastPage;
    }

    try {
      const parent = (globalThis as any).Zotero?.Items?.get?.(parentID);
      return parent ? this.dataStore.getData(parent).lastPage : null;
    } catch (error) {
      Logger.warn(`ResumeReader: failed to resolve parent item ${parentID}`);
      return null;
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
      Logger.error(`ResumeReader: failed to open attachment ${attachmentId}`, error);
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

    const pane = zotero?.getActiveZoteroPane?.() ?? (globalThis as any).ZoteroPane;
    const openPDF = pane?.openPDF;
    if (typeof openPDF === 'function') {
      await openPDF.call(pane, attachmentId, location);
      return;
    }

    throw new Error('No Zotero PDF opener is available');
  }

  private getLocation(lastPage: number | null): ReaderLocation {
    return typeof lastPage === 'number' && Number.isFinite(lastPage) && lastPage > 0
      ? { pageIndex: lastPage - 1 }
      : undefined;
  }

  private isPdfAttachment(item: ZoteroItem | null | undefined): item is ZoteroItem {
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
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  }
}
