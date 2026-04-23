import { DataStore } from './dataStore';
import { Logger } from './Logger';
import { ErrorHandler } from './ErrorHandler';

export class ReaderTracker {
  private dataStore: DataStore;
  private readerEventId: string | null = null;
  private saveTimeout: any = null;

  constructor(dataStore: DataStore) {
    this.dataStore = dataStore;
  }

  public register() {
    this.readerEventId = Zotero.Events.register('reader:page-change', this.handlePageChange.bind(this));
    Logger.log('ReaderTracker: Registered');
  }

  public unregister() {
    if (this.readerEventId) {
      Zotero.Events.unregister('reader:page-change', this.readerEventId);
      this.readerEventId = null;
    }
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    Logger.log('ReaderTracker: Unregistered');
  }

  private handlePageChange(event: any) {
    ErrorHandler.wrap(() => {
      const reader = event.reader;
      if (!reader || !reader.itemID) return;

      const attachmentId = reader.itemID.toString();
      const parentId = reader._item.parentID;
      if (!parentId) return;

      let progress = 0;
      
      if (reader.type === 'pdf') {
        const current = event.pageIndex + 1;
        const total = reader._state.pdf.numPages;
        progress = total > 0 ? current / total : 0;
      } else if (reader.type === 'epub') {
        progress = event.progress || 0; 
      }

      progress = Math.min(1.0, Math.max(0.0, progress));

      this.debounceSave(parentId, attachmentId, progress);
    }, 'ReaderTracker.handlePageChange')();
  }

  private debounceSave(parentId: number, attachmentId: string, progress: number) {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    
    this.saveTimeout = setTimeout(async () => {
      await ErrorHandler.wrapAsync(async () => {
        const parentItem = await Zotero.Items.getAsync(parentId);
        if (parentItem) {
          const updates: any = { p: {} };
          updates.p[attachmentId] = progress;
          await this.dataStore.updateData(parentItem, updates);
        }
      }, 'ReaderTracker.debounceSave');
    }, 5000); // 5 second debounce
  }
}
