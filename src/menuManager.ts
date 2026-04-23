import { DataStore } from './dataStore';
import { ReadingStatus } from './flowData';
import { Logger } from './Logger';

const PLUGIN_ID = 'readingflow@moon.com';
const MENU_ID = 'readingflow-library-item-menu';

export class ReadingFlowMenuManager {
  private registeredMenuID: string | false | null = null;

  constructor(private dataStore: DataStore) {}

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
          onShowing: (_event: Event, context: any) => {
            context.setEnabled(this.getSelectedRegularItems().length > 0);
          },
          menus: [
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

  private getSelectedRegularItems(): any[] {
    const pane = Zotero.getActiveZoteroPane?.();
    const items = pane?.getSelectedItems?.() ?? pane?.itemsView?.getSelectedItems?.() ?? [];
    return items.filter((item: any) => item?.isRegularItem?.());
  }
}
