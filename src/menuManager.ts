import { DataStore } from './dataStore';
import { ReadingStatus } from './flowData';
import { getReadingQueueState, ReadingQueueState } from './readingQueue';
import { Logger } from './Logger';
import { ResumeReader } from './resumeReader';

const PLUGIN_ID = 'readingflow@moon.com';
const MENU_ID = 'readingflow-library-item-menu';
type QueueKey = keyof ReadingQueueState;

const MENU_LABELS = {
  menu: 'Reading Flow',
  resumeReading: 'Resume Reading',
  queueContinue: 'Continue Reading',
  queueNearlyDone: 'Nearly Done',
  queueStale: 'Stale Reading',
  statusToRead: 'Mark as To Read',
  statusReading: 'Mark as Reading',
  statusSkimmed: 'Mark as Skimmed',
  statusRead: 'Mark as Read',
  statusImportant: 'Mark as Important',
  resetProgress: 'Reset Reading Progress'
} as const;

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
          label: MENU_LABELS.menu,
          onShowing: async (_event: Event, context: any) => {
            context?.setEnabled?.(await this.canShowSubmenu(context));
            context?.setVisible?.(true);
          },
          menus: [
            {
              menuType: 'menuitem',
              l10nID: 'reading-flow-resume-reading',
              label: MENU_LABELS.resumeReading,
              onShowing: async (_event: Event, context: any) => {
                const selected = this.getSelectedItems(context);
                const displayTarget = selected.length === 1
                  ? await this.resumeReader.getResumeDisplayTarget(selected[0])
                  : { canResume: false, fallbackLabel: MENU_LABELS.resumeReading };
                context.setL10nArgs?.(displayTarget.l10nArgs ?? '{}');
                context.menuElem?.setAttribute?.('label', displayTarget.fallbackLabel);
                context.setEnabled(displayTarget.canResume);
              },
              onCommand: (_event: Event, context: any) => this.resumeSelectedItem(context)
            },
            {
              menuType: 'separator'
            },
            this.queueMenu('continueReading', 'reading-flow-queue-continue', MENU_LABELS.queueContinue),
            this.queueMenu('nearlyDone', 'reading-flow-queue-nearly-done', MENU_LABELS.queueNearlyDone),
            this.queueMenu('staleReading', 'reading-flow-queue-stale', MENU_LABELS.queueStale),
            {
              menuType: 'separator'
            },
            this.statusMenu('to-read', 'reading-flow-status-to-read', MENU_LABELS.statusToRead),
            this.statusMenu('reading', 'reading-flow-status-reading', MENU_LABELS.statusReading),
            this.statusMenu('skimmed', 'reading-flow-status-skimmed', MENU_LABELS.statusSkimmed),
            this.statusMenu('read', 'reading-flow-status-read', MENU_LABELS.statusRead),
            this.statusMenu('important', 'reading-flow-status-important', MENU_LABELS.statusImportant),
            {
              menuType: 'menuitem',
              l10nID: 'reading-flow-reset-progress',
              label: MENU_LABELS.resetProgress,
              onCommand: (_event: Event, context: any) => this.updateSelectedItems(
                (item) => this.dataStore.resetProgress(item),
                context
              )
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

  private statusMenu(status: ReadingStatus, l10nID: string, label: string) {
    return {
      menuType: 'menuitem',
      l10nID,
      label,
      onCommand: (_event: Event, context: any) => this.updateSelectedItems(
        (item) => this.dataStore.setStatus(item, status),
        context
      )
    };
  }

  private queueMenu(queue: QueueKey, l10nID: string, label: string) {
    return {
      menuType: 'menuitem',
      l10nID,
      label,
      onShowing: (_event: Event, context: any) => {
        context.setChecked?.(this.selectedRegularItemsMatchQueue(queue, context));
      },
      onCommand: (_event: Event, context: any) => this.logQueueSelection(queue, context)
    };
  }

  private async resumeSelectedItem(context?: any) {
    const selected = this.getSelectedItems(context);
    if (selected.length !== 1) return;

    const item = selected[0];
    try {
      await this.resumeReader.resume(item);
    } catch (e) {
      Logger.error(`resume reading failed for item ${item?.id}`, e);
    }
  }

  private selectedRegularItemsMatchQueue(queue: QueueKey, context?: any): boolean {
    const items = this.getSelectedRegularItems(context);
    if (!items.length) return false;

    const states = items.map((item) => this.getQueueStateForItem(item));
    return states.some((state) => state?.[queue] ?? false);
  }

  private logQueueSelection(queue: QueueKey, context?: any) {
    const itemIds = this.getSelectedRegularItems(context)
      .filter((item) => this.getQueueStateForItem(item)?.[queue] ?? false)
      .map((item) => item.id);

    Logger.log(`Reading queue ${queue}: ${itemIds.join(', ') || 'none'}`);
  }

  private getQueueStateForItem(item: any): ReadingQueueState | null {
    const targetItem = this.normalizeItem(item);
    if (!targetItem) return null;

    try {
      return getReadingQueueState(this.dataStore.getData(targetItem));
    } catch (e) {
      Logger.warn(`failed to read queue state for item ${targetItem?.id}: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  private async canShowSubmenu(context?: any): Promise<boolean> {
    if (this.getSelectedRegularItems(context).length > 0) return true;

    const selected = this.getSelectedItems(context);
    return selected.length === 1 && await this.resumeReader.canResume(selected[0]);
  }

  private getSelectedItems(context?: any): any[] {
    const contextItems = Array.isArray(context?.items) ? context.items : [];
    const normalizedContextItems = contextItems
      .map((item: any) => this.normalizeItem(item))
      .filter((item: any) => item);

    if (normalizedContextItems.length) {
      return normalizedContextItems;
    }

    const pane = Zotero.getActiveZoteroPane?.();
    return pane?.getSelectedItems?.() ?? pane?.itemsView?.getSelectedItems?.() ?? [];
  }

  private getSelectedRegularItems(context?: any): any[] {
    return this.getSelectedItems(context).filter((item: any) => this.normalizeItem(item)?.isRegularItem?.());
  }

  private normalizeItem(item: any): any {
    if (!item) return null;

    if (typeof item.id === 'number') {
      return Zotero.Items.get(item.id) ?? item;
    }

    return item;
  }

  private async updateSelectedItems(update: (item: any) => Promise<void>, context?: any) {
    const items = this.getSelectedRegularItems(context);
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
}
