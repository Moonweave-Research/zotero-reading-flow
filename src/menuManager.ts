import { ReadingFlowItemPaneManager } from './itemPaneManager';
import { DataStore } from './dataStore';
import { ReadingStatus } from './flowData';
import { Logger } from './Logger';
import { ResumeDisplayTarget, ResumeReader } from './resumeReader';
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
  statusAutomatic: 'Clear Manual Status (Use Automatic)',
  resetProgress: 'Reset tracked PDF positions',
  viewStatistics: 'View Current View Statistics',
  readingStatistics: 'Reading Statistics'
} as const;

export class ReadingFlowMenuManager {
  private registeredMenuIDs: string[] = [];
  private resumeReader: ResumeReader;
  private displayedTarget?: ResumeDisplayTarget;
  private targetSequence = 0;

  constructor(
    private dataStore: DataStore,
    private dashboardManager?: DashboardManager,
    private itemPaneManager?: ReadingFlowItemPaneManager
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
            ...(this.itemPaneManager ? [{
              menuType: 'menuitem', label: 'View Reading Flow', l10nID: 'reading-flow-view-pane',
              onShowing: (_event: Event, context: any) => {
                const selected = this.getSelectedItems(context);
                context.setEnabled(this.itemPaneManager?.canFocus(selected) ?? false);
              },
              onCommand: () => this.itemPaneManager?.focus()
            }] : []),
            ...dashboardContextMenu,
            {
              menuType: 'menuitem',
              l10nID: 'reading-flow-resume-reading',
              label: MENU_LABELS.resumeReading,
              onShowing: async (_event: Event, context: any) => {
                const sequence = ++this.targetSequence;
                const selected = this.getSelectedItems(context);
                const displayTarget = selected.length === 1
                  ? await this.resumeReader.getResumeDisplayTarget(selected[0])
                  : { action: 'none' as const, sourceId: 0, reason: 'Select one item.', canResume: false, fallbackLabel: 'PDF unavailable' };
                if (sequence !== this.targetSequence || this.getSelectedItems(context).length !== selected.length
                  || this.getSelectedItems(context)[0]?.id !== selected[0]?.id) return;
                this.displayedTarget = displayTarget;
                context.setL10nArgs?.(displayTarget.l10nArgs ?? '{}');
                context.menuElem?.removeAttribute?.('data-l10n-id');
                context.menuElem?.setAttribute?.('aria-label', `${displayTarget.fallbackLabel}. ${displayTarget.reason}`);
                context.menuElem?.setAttribute?.('tooltiptext', displayTarget.reason);
                this.setMenuItemLabel(context, displayTarget.fallbackLabel);
                context.setEnabled(displayTarget.action !== 'none');
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
            {
              menuType: 'menuitem',
              l10nID: 'reading-flow-status-automatic',
              onShowing: (_event: Event, context: any) => context.setEnabled(this.getMutationSelection(context).items.length > 0),
              label: MENU_LABELS.statusAutomatic,
              onCommand: (_event: Event, context: any) => this.updateSelectedItems(
                (item) => this.dataStore.clearManualStatus(item),
                context,
                (item) => this.getCurrentData(item).s === null
              )
            },
            {
              menuType: 'separator'
            },
            this.importanceMenu(true),
            this.importanceMenu(false),
            { menuType: 'separator' },
            {
              menuType: 'submenu',
              label: 'Advanced',
              l10nID: 'reading-flow-advanced',
              menus: [{
              menuType: 'menuitem',
              l10nID: 'reading-flow-reset-progress',
              onShowing: (_event: Event, context: any) => context.setEnabled(this.getMutationSelection(context).items.length > 0),
              label: MENU_LABELS.resetProgress,
              onCommand: (_event: Event, context: any) => this.confirmReset() && this.updateSelectedItems(
                (item) => this.dataStore.resetProgress(item),
                context,
                (item) => !this.hasResumeState(item)
              )
              }]
            },

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

  private importanceMenu(important: boolean) {
    return {
      menuType: 'menuitem',
      l10nID: important ? 'reading-flow-status-important' : 'reading-flow-clear-important',
      label: important ? 'Mark as Important' : 'Clear Important',
      onShowing: (_event: Event, context: any) => context.setEnabled(this.getMutationSelection(context).items.length > 0),
      onCommand: (_event: Event, context: any) => this.updateSelectedItems(
        item => this.dataStore.setImportant(item, important), context,
        item => Boolean(this.getCurrentData(item).important) === important
      )
    };
  }

  private statusMenu(status: ReadingStatus, l10nID: string, label: string) {
    return {
      menuType: 'menuitem',
      l10nID,
      label,
      onShowing: (_event: Event, context: any) => context.setEnabled(this.getMutationSelection(context).items.length > 0),
      onCommand: (_event: Event, context: any) => this.updateSelectedItems(
        (item) => this.dataStore.setStatus(item, status),
        context,
        (item) => this.getCurrentData(item).s === status
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
      const target = this.displayedTarget ?? await this.resumeReader.getResumeDisplayTarget(item);
      if (target.sourceId !== item.id) return;
      await this.resumeReader.executeTarget(target, () => {
        const current = this.getSelectedItems(context);
        return current.length === 1 && current[0].id === item.id;
      });
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
    if (this.getMutationSelection(context).items.length > 0) return true;

    const selected = this.getSelectedItems(context);
    return selected.length === 1 && (await this.resumeReader.getResumeDisplayTarget(selected[0])).action !== 'none';
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

  private getMutationSelection(context?: any): { items: any[]; skipped: number } {
    const byID = new Map<number, any>();
    const skipped = new Set<string>();
    for (const [index, selected] of this.getSelectedItems(context).entries()) {
      const normalized = this.normalizeItem(selected);
      const candidate = normalized?.isRegularItem?.()
        ? normalized
        : normalized?.isPDFAttachment?.() && typeof normalized.parentID === 'number'
          ? this.normalizeItem({ id: normalized.parentID })
          : null;
      if (!candidate?.isRegularItem?.()) {
        skipped.add(`unsupported:${normalized?.id ?? index}`);
        continue;
      }
      if (candidate.isEditable?.() === false) {
        skipped.add(`readonly:${candidate.id}`);
        continue;
      }
      if (candidate.deleted === true || candidate.parentID) {
        skipped.add(`ineligible:${candidate.id}`);
        continue;
      }
      byID.set(candidate.id, candidate);
    }
    return { items: [...byID.values()], skipped: skipped.size };
  }

  private normalizeItem(item: any): any {
    if (!item) return null;

    if (typeof item.id === 'number') {
      return Zotero.Items.get(item.id) ?? item;
    }

    return item;
  }

  private async updateSelectedItems(
    update: (item: any) => Promise<boolean>,
    context?: any,
    isNoOp?: (item: any) => boolean
  ) {
    const selection = this.getMutationSelection(context);
    const items = selection.items;
    if (!items.length) {
      if (selection.skipped > 0) this.showBatchSummary(0, 0, selection.skipped, 0);
      return;
    }
    if (items.length >= 100 && !this.confirmLargeBatch(items.length)) return;

    const changedIDs: number[] = [];
    let unchanged = 0;
    let skipped = selection.skipped;
    let failed = 0;
    for (const item of items) {
      try {
        if (isNoOp?.(item)) {
          unchanged += 1;
          continue;
        }
        if (await update(item)) changedIDs.push(item.id);
        else skipped += 1;
      } catch (e) {
        failed += 1;
        Logger.error(`menu update failed for item ${item?.id}`, e);
      }
    }
    if (changedIDs.length) {
      Zotero.ItemTreeManager.refreshColumns?.();
      Zotero.Notifier.trigger('refresh', 'item', changedIDs);
    }
    if (items.length + selection.skipped > 1 || skipped > 0 || failed > 0) {
      this.showBatchSummary(changedIDs.length, unchanged, skipped, failed);
    }
  }

  private hasResumeState(item: any): boolean {
    const data = this.getCurrentData(item);
    return Object.keys(data.p).length > 0
      || data.lastAttachmentId !== null
      || data.lastPage !== null;
  }

  private getCurrentData(item: any) {
    this.dataStore.invalidateCache(item.id);
    return this.dataStore.getData(item);
  }

  private confirmReset(): boolean {
    return (globalThis as any).Services?.prompt?.confirm?.(
      Zotero.getMainWindow?.() ?? null, 'Reset tracked PDF positions',
      'Clear current and maximum tracked PDF positions for the selected items? Manual status, importance, reading start date, last PDF activity, and history are preserved. This does not open a PDF at its first page.'
    ) === true;
  }

  private confirmLargeBatch(count: number): boolean {
    const prompt = (globalThis as any).Services?.prompt;
    if (typeof prompt?.confirm !== 'function') {
      Logger.warn('ReadingFlow: large batch cancelled because confirmation is unavailable');
      return false;
    }
    try {
      return prompt.confirm(
        Zotero.getMainWindow?.() ?? null,
        'Reading Flow',
        `Apply this change to ${count} papers? You can cancel now without changing anything.`
      );
    } catch (error) {
      Logger.warn(`ReadingFlow: large batch cancelled because confirmation failed: ${String(error)}`);
      return false;
    }
  }

  private showBatchSummary(changed: number, unchanged: number, skipped: number, failed: number) {
    try {
      if (!Zotero.ProgressWindow) return;
      const progressWindow = new Zotero.ProgressWindow({ closeOnClick: true });
      progressWindow.changeHeadline('Reading Flow update complete');
      progressWindow.addDescription(
        `${changed} changed · ${unchanged} not changed · ${skipped} skipped · ${failed} failed`
        + (skipped > 0 ? ' · Skipped items may be read-only, unsupported, incompatible, or concurrently changed.' : '')
      );
      progressWindow.show();
      progressWindow.startCloseTimer(5000);
    } catch (error) {
      Logger.warn(`ReadingFlow: could not show the bulk update summary: ${String(error)}`);
    }
  }
}
