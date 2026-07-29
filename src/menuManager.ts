import { DataStore } from './dataStore';
import { ReadingStatus } from './flowData';
import { Logger } from './Logger';
import { ResumeReader } from './resumeReader';
import { DashboardManager } from './dashboardManager';

const PLUGIN_ID = 'readingflow@moon.com';
const CONTEXT_MENU_ID = 'readingflow-library-item-menu';
const GLOBAL_MENU_ID = 'readingflow-tools-menu';

const MENU_LABELS = {
  menu: 'Reading Flow',
  resumeReading: 'Resume Reading',
  statusToRead: 'Mark as To Read',
  statusReading: 'Mark as Reading',
  statusSkimmed: 'Mark as Skimmed',
  statusRead: 'Mark as Read',
  statusImportant: 'Mark as Important',
  resetProgress: 'Reset Reading Progress',
  viewStatistics: 'View Current View Statistics',
  readingStatistics: 'Reading Statistics'
} as const;

export class ReadingFlowMenuManager {
  private registeredMenuIDs: string[] = [];
  private resumeReader: ResumeReader;

  constructor(
    private dataStore: DataStore,
    private dashboardManager?: DashboardManager
  ) {
    this.resumeReader = new ResumeReader(dataStore);
  }

  public register() {
    if (!Zotero.MenuManager?.registerMenu || this.registeredMenuIDs.length) return;

    const dashboardContextMenu = this.dashboardManager
      ? [{
          menuType: 'menuitem',
          l10nID: 'reading-flow-view-statistics',
          label: MENU_LABELS.viewStatistics,
          onCommand: () => this.openDashboard()
        }, {
          menuType: 'separator'
        }]
      : [];

    const contextMenuID = Zotero.MenuManager.registerMenu({
      menuID: CONTEXT_MENU_ID,
      pluginID: PLUGIN_ID,
      target: 'main/library/item',
      menus: [
        {
          menuType: 'submenu',
          l10nID: 'reading-flow-menu',
          label: MENU_LABELS.menu,
          onShowing: async (_event: Event, context: any) => {
            context?.setEnabled?.(
              Boolean(this.dashboardManager) || await this.canShowSubmenu(context)
            );
            context?.setVisible?.(true);
          },
          menus: [
            ...dashboardContextMenu,
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
                this.setMenuItemLabel(context, displayTarget.fallbackLabel);
                context.setEnabled(displayTarget.canResume);
              },
              onCommand: (_event: Event, context: any) => this.resumeSelectedItem(context)
            },
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
    const globalMenuID = this.dashboardManager
      ? Zotero.MenuManager.registerMenu({
          menuID: GLOBAL_MENU_ID,
          pluginID: PLUGIN_ID,
          target: 'main/menubar/tools',
          menus: [
            {
              menuType: 'menuitem',
              l10nID: 'reading-flow-reading-statistics',
              label: MENU_LABELS.readingStatistics,
              onCommand: () => this.openDashboard()
            }
          ]
        })
      : null;

    const registered = [contextMenuID, globalMenuID]
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const expectedCount = this.dashboardManager ? 2 : 1;
    if (registered.length !== expectedCount) {
      for (const id of registered) Zotero.MenuManager.unregisterMenu?.(id);
      throw new Error(this.dashboardManager
        ? 'Reading Flow could not register both dashboard menu entry points'
        : 'Reading Flow could not register its context menu');
    }
    this.registeredMenuIDs = registered;
  }

  public unregister() {
    if (Zotero.MenuManager?.unregisterMenu) {
      for (const id of this.registeredMenuIDs) {
        Zotero.MenuManager.unregisterMenu(id);
      }
    }
    this.registeredMenuIDs = [];
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

  private openDashboard() {
    try {
      this.dashboardManager?.open();
    } catch (e) {
      Logger.error('open dashboard failed', e);
    }
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

  private setMenuItemLabel(context: any, label: string) {
    context?.setLabel?.(label);
    if (!context?.menuElem) {
      return;
    }

    context.menuElem.label = label;
    context.menuElem.setAttribute?.('label', label);
    if ('textContent' in context.menuElem) {
      context.menuElem.textContent = label;
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
