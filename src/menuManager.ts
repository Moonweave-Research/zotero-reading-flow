import { DataStore } from './dataStore';
import { ReadingStatus } from './flowData';
import { getReadingQueueState, ReadingQueueState } from './readingQueue';
import { Logger } from './Logger';
import { ResumeReader } from './resumeReader';

const PLUGIN_ID = 'readingflow@moon.com';
const MENU_ID = 'readingflow-library-item-menu';
type QueueKey = keyof ReadingQueueState;

export class ReadingFlowMenuManager {
  private registeredMenuID: string | false | null = null;
  private resumeReader: ResumeReader;

  constructor(private dataStore: DataStore) {
    this.resumeReader = new ResumeReader(dataStore);
  }

  public register() {
    if (!Zotero.MenuManager?.registerMenu || this.registeredMenuID) return;

    this.registeredMenuID = Zotero.MenuManager.registerMenu({
      menuID: MENU_ID,
      pluginID: PLUGIN_ID,
      target: 'main/library/item',
      menus: [
        {
          menuType: 'submenu',
          l10nID: 'reading-flow-menu',
          onShowing: async (_event: Event, context: any) => {
            context.setEnabled(await this.canShowSubmenu());
          },
          menus: [
            {
              menuType: 'menuitem',
              l10nID: 'reading-flow-resume-reading',
              onShowing: async (_event: Event, context: any) => {
                const selected = this.getSelectedItems();
                const canResume = selected.length === 1 && await this.resumeReader.canResume(selected[0]);
                context.setEnabled(canResume);
              },
              onCommand: () => this.resumeSelectedItem()
            },
            {
              menuType: 'separator'
            },
            this.queueMenu('continueReading', 'reading-flow-queue-continue'),
            this.queueMenu('nearlyDone', 'reading-flow-queue-nearly-done'),
            this.queueMenu('staleReading', 'reading-flow-queue-stale'),
            {
              menuType: 'separator'
            },
            this.statusMenu('to-read', 'reading-flow-status-to-read'),
            this.statusMenu('reading', 'reading-flow-status-reading'),
            this.statusMenu('skimmed', 'reading-flow-status-skimmed'),
            this.statusMenu('read', 'reading-flow-status-read'),
            this.statusMenu('important', 'reading-flow-status-important'),
            {
              menuType: 'menuitem',
              l10nID: 'reading-flow-reset-progress',
              onCommand: () => this.updateSelectedItems((item) => this.dataStore.resetProgress(item))
            }
          ]
        }
      ]
    });
  }

  public unregister() {
    if (this.registeredMenuID && Zotero.MenuManager?.unregisterMenu) {
      Zotero.MenuManager.unregisterMenu(this.registeredMenuID);
    }
    this.registeredMenuID = null;
  }

  private statusMenu(status: ReadingStatus, l10nID: string) {
    return {
      menuType: 'menuitem',
      l10nID,
      onCommand: () => this.updateSelectedItems((item) => this.dataStore.setStatus(item, status))
    };
  }

  private queueMenu(queue: QueueKey, l10nID: string) {
    return {
      menuType: 'menuitem',
      l10nID,
      onShowing: (_event: Event, context: any) => {
        context.setChecked?.(this.selectedRegularItemsMatchQueue(queue));
      },
      onCommand: () => this.logQueueSelection(queue)
    };
  }

  private async resumeSelectedItem() {
    const selected = this.getSelectedItems();
    if (selected.length !== 1) return;

    const item = selected[0];
    try {
      await this.resumeReader.resume(item);
    } catch (e) {
      Logger.error(`resume reading failed for item ${item?.id}`, e);
    }
  }

  private selectedRegularItemsMatchQueue(queue: QueueKey): boolean {
    const items = this.getSelectedRegularItems();
    if (!items.length) return false;

    return items.some((item) => {
      const state = this.getQueueStateForItem(item);
      return state?.[queue] ?? false;
    });
  }

  private logQueueSelection(queue: QueueKey) {
    const itemIds = this.getSelectedRegularItems()
      .filter((item) => this.getQueueStateForItem(item)?.[queue] ?? false)
      .map((item) => item.id);

    Logger.log(`Reading queue ${queue}: ${itemIds.join(', ') || 'none'}`);
  }

  private getQueueStateForItem(item: any): ReadingQueueState | null {
    try {
      return getReadingQueueState(this.dataStore.getData(item));
    } catch (e) {
      Logger.warn(`failed to read queue state for item ${item?.id}: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  private async canShowSubmenu(): Promise<boolean> {
    if (this.getSelectedRegularItems().length > 0) return true;

    const selected = this.getSelectedItems();
    return selected.length === 1 && await this.resumeReader.canResume(selected[0]);
  }

  private async updateSelectedItems(update: (item: any) => Promise<void>) {
    const items = this.getSelectedRegularItems();
    if (!items.length) return;

    for (const item of items) {
      try {
        await update(item);
      } catch (e) {
        Logger.error(`menu update failed for item ${item?.id}`, e);
      }
    }
    Zotero.ItemTreeManager.refreshColumns?.();
    Zotero.Notifier.trigger('refresh', 'item', items.map((item: any) => item.id));
  }

  private getSelectedItems(): any[] {
    const pane = Zotero.getActiveZoteroPane?.();
    return pane?.getSelectedItems?.() ?? pane?.itemsView?.getSelectedItems?.() ?? [];
  }

  private getSelectedRegularItems(): any[] {
    return this.getSelectedItems().filter((item: any) => item?.isRegularItem?.());
  }
}
