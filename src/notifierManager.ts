import { DataStore } from './dataStore';
import { ReadingStatus } from './flowData';
import { Logger } from './Logger';
import {
  getGlobalPreference,
  getNewItemStatusActivationTimestamp,
  READING_FLOW_PREFS,
  setNewItemStatusActivationPreference
} from './preferences';

const VALID_DEFAULT_STATUSES = new Set<ReadingStatus>([
  'to-read', 'reading', 'skimmed', 'read', 'important'
]);

export class NotifierManager {
  private dataStore: DataStore;
  private notifierId: string | null = null;

  constructor(dataStore: DataStore) {
    this.dataStore = dataStore;
  }

  public register() {
    if (this.notifierId) return;
    const configured = getGlobalPreference(READING_FLOW_PREFS.newItemStatus);
    const activatedAt = getNewItemStatusActivationTimestamp();
    if (VALID_DEFAULT_STATUSES.has(configured as ReadingStatus)
      && activatedAt === null) {
      setNewItemStatusActivationPreference(Math.floor(Date.now() / 1000) * 1000);
    }
    this.notifierId = Zotero.Notifier.registerObserver(this, ['item'], 'ReadingFlow');
  }

  public unregister() {
    if (this.notifierId) {
      Zotero.Notifier.unregisterObserver(this.notifierId);
      this.notifierId = null;
    }
  }

  public notify(action: string, type: string, ids: number[] | number): void | Promise<void> {
    const itemIDs = Array.isArray(ids) ? ids : [ids];
    if (type === 'item' && action === 'add') {
      return this.applyNewItemDefault(itemIDs).catch((error) => {
        Logger.error('ReadingFlow: failed to apply the new-item status default', error);
      });
    }
    if (type === 'item' && action === 'modify') {
      itemIDs.forEach(id => this.dataStore.invalidateCache(id));
      return;
    }
    if (type === 'item' && (action === 'trash' || action === 'delete')) {
      itemIDs.forEach(id => this.dataStore.clearCache(id));
    }
  }

  private async applyNewItemDefault(ids: number[]) {
    const configured = getGlobalPreference(READING_FLOW_PREFS.newItemStatus);
    if (!VALID_DEFAULT_STATUSES.has(configured as ReadingStatus)) return;
    const activationTimestamp = getNewItemStatusActivationTimestamp();
    if (activationTimestamp === null) return;
    const status = configured as ReadingStatus;
    const items = await this.loadAddedItems(ids);

    for (const item of items) {
      try {
        if (!item?.isRegularItem?.() || item.isEditable?.() === false) continue;
        if (item.deleted === true || item.parentID) continue;
        const dateAdded = this.getDateAddedTimestamp(item);
        if (dateAdded === null || dateAdded < activationTimestamp) continue;
        if (this.dataStore.hasReadingFlowNamespace(item)) continue;
        await this.dataStore.initializeStatusIfUnowned(item, status);
      } catch (error) {
        Logger.error(`ReadingFlow: failed to apply the new-item status default to item ${item?.id}`, error);
      }
    }
  }

  private async loadAddedItems(ids: number[]): Promise<any[]> {
    const uniqueIDs = [...new Set(ids)];
    const getAsync = Zotero.Items?.getAsync;
    if (typeof getAsync !== 'function' || uniqueIDs.length === 0) return [];
    try {
      const items = await getAsync.call(Zotero.Items, uniqueIDs);
      if (!Array.isArray(items)) throw new Error('bulk item lookup returned a non-array result');
      return items;
    } catch (error) {
      Logger.warn(`ReadingFlow: bulk new-item lookup failed; retrying individually: ${String(error)}`);
      const items: any[] = [];
      for (const id of uniqueIDs) {
        try {
          const item = await getAsync.call(Zotero.Items, id);
          if (item) items.push(item);
        } catch (itemError) {
          Logger.error(`ReadingFlow: failed to load new item ${id}`, itemError);
        }
      }
      return items;
    }
  }

  private getDateAddedTimestamp(item: any): number | null {
    const raw = item.dateAdded ?? item.getField?.('dateAdded');
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const sqlDate = raw.includes(' ') && !/[zZ]|[+-]\d\d:?\d\d$/.test(raw)
      ? `${raw.replace(' ', 'T')}Z`
      : raw;
    const parsed = Date.parse(sqlDate);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
