import { DataStore } from './dataStore';

export class NotifierManager {
  private dataStore: DataStore;
  private notifierId: string | null = null;

  constructor(dataStore: DataStore) {
    this.dataStore = dataStore;
  }

  public register() {
    this.notifierId = Zotero.Notifier.registerObserver(this, ['item'], 'ReadingFlow');
  }

  public unregister() {
    if (this.notifierId) {
      Zotero.Notifier.unregisterObserver(this.notifierId);
    }
  }

  public notify(action: string, type: string, ids: number[]) {
    if (type === 'item' && (action === 'modify' || action === 'trash' || action === 'delete')) {
      ids.forEach(id => this.dataStore.clearCache(id));
    }
  }
}
