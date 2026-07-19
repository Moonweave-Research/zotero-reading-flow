import { DataStore } from './dataStore';
import { formatRelativeDate, getDisplayProgress, inferStatus, ReadingStatus } from './flowData';
import { Logger } from './Logger';

const PLUGIN_ID = 'readingflow@moon.com';
const PROGRESS_KEY = 'readingFlowProgress';
const STATUS_KEY = 'readingFlowStatus';
const LAST_READ_KEY = 'readingFlowLastRead';

const STATUS_LABELS: Record<ReadingStatus, string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  skimmed: 'Skimmed',
  read: 'Read',
  important: 'Important'
};

const STATUS_COLORS: Record<ReadingStatus, string> = {
  'to-read': '#6b7280',
  reading: '#2563eb',
  skimmed: '#7c3aed',
  read: '#16a34a',
  important: '#dc2626'
};

const BASE_CELL_STYLE = [
  'display:flex',
  'align-items:center',
  'width:100%',
  'max-width:100%',
  'min-width:0',
  'height:100%',
  'padding:0 6px',
  'box-sizing:border-box',
  'overflow:hidden'
].join(';');

const PROGRESS_CELL_STYLE = [
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'position:relative',
  'width:100%',
  'max-width:100%',
  'min-width:0',
  'height:100%',
  'padding:0',
  'box-sizing:border-box',
  'overflow:hidden'
].join(';');

export class ColumnManager {
  private dataStore: DataStore;
  private registeredDataKeys: string[] = [];
  private readonly dataKeys = [PROGRESS_KEY, STATUS_KEY, LAST_READ_KEY];
  private static readonly ITEMS_VIEW_RETRY_COUNT = 120;
  private static readonly ITEMS_VIEW_RETRY_MS = 250;

  constructor(dataStore: DataStore) {
    this.dataStore = dataStore;
  }

  public async register() {
    const progressKey = await Zotero.ItemTreeManager.registerColumn({
      dataKey: PROGRESS_KEY,
      label: 'Progress',
      pluginID: PLUGIN_ID,
      enabledTreeIDs: ['main'],
      zoteroPersist: ['width', 'hidden', 'sortDirection'],
      dataProvider: (item: any, _dataKey: string): string => {
        try {
          if (!item?.isRegularItem?.()) return '';
          const flowData = this.dataStore.getData(item);
          const progress = getDisplayProgress(flowData);
          return progress > 0 ? String(progress) : '';
        } catch (e) {
          Logger.error('column dataProvider failed', e);
          return '';
        }
      },
      renderCell: (index: number, data: string, column: any, isFirstColumn: boolean, doc: Document): HTMLElement => {
        const cell = doc.createElement('span');
        cell.className = `cell ${column.className || ''}`.trim();
        cell.style.cssText = `${PROGRESS_CELL_STYLE};font-size:11px;`;

        const value = parseFloat(data);
        if (!data || isNaN(value) || value === 0) return cell;

        if (value > 1) {
          cell.textContent = `p. ${Math.round(value)}`;
          cell.title = `Last read page ${Math.round(value)}`;
          cell.style.justifyContent = 'center';
          cell.style.padding = '0 6px';
          return cell;
        }

        const percent = Math.max(1, Math.min(100, Math.round(value * 100)));
        const trackRow = doc.createElement('span');
        trackRow.style.cssText = [
          'display:flex',
          'align-items:center',
          'width:100%',
          'min-width:0',
          'height:6px',
          'gap:6px'
        ].join(';');

        const label = doc.createElement('span');
        label.textContent = `${percent}%`;
        label.title = `${percent}% read`;
        label.style.cssText = [
          'z-index:1',
          'color:var(--fill-secondary, #666)',
          'font-size:10px',
          'line-height:1'
        ].join(';');
        label.style.whiteSpace = 'nowrap';
        label.style.flex = '0 0 auto';

        const track = doc.createElement('div');
        track.style.cssText = [
          'flex:1',
          'min-width:0',
          'width:100%',
          'height:6px',
          'background:rgba(0,0,0,0.1)',
          'border-radius:3px',
          'overflow:hidden'
        ].join(';');

        const bar = doc.createElement('div');
        const completedColor = (Zotero.Prefs.get('extensions.readingflow.color-completed') as string) || '#4caf50';
        const readingColor = (Zotero.Prefs.get('extensions.readingflow.color-reading') as string) || '#2196f3';
        bar.style.cssText = `width:${percent}%;height:100%;background:${value >= 0.99 ? completedColor : readingColor};`;

        track.appendChild(bar);
        trackRow.appendChild(track);
        trackRow.appendChild(label);
        cell.appendChild(trackRow);
        return cell;
      }
    });

    const statusKey = await Zotero.ItemTreeManager.registerColumn({
      dataKey: STATUS_KEY,
      label: 'Status',
      pluginID: PLUGIN_ID,
      enabledTreeIDs: ['main'],
      zoteroPersist: ['width', 'hidden', 'sortDirection'],
      dataProvider: (item: any): string => {
        try {
          if (!item?.isRegularItem?.()) return '';
          return inferStatus(this.dataStore.getData(item));
        } catch (e) {
          Logger.error('status dataProvider failed', e);
          return '';
        }
      },
      renderCell: (_index: number, data: string, column: any, _isFirstColumn: boolean, doc: Document): HTMLElement => {
        const cell = doc.createElement('span');
        cell.className = `cell ${column.className || ''}`.trim();
        cell.style.cssText = `${BASE_CELL_STYLE};justify-content:center;`;
        if (!data || !(data in STATUS_LABELS)) return cell;

        const status = data as ReadingStatus;
        const badge = doc.createElement('span');
        badge.textContent = STATUS_LABELS[status];
        badge.title = STATUS_LABELS[status];
        badge.style.cssText = [
          'display:inline-flex',
          'align-items:center',
          'justify-content:center',
          'max-width:100%',
          'height:18px',
          'padding:0 6px',
          'border-radius:9px',
          'box-sizing:border-box',
          'font-size:10px',
          'line-height:1',
          'white-space:nowrap',
          'overflow:hidden',
          'text-overflow:ellipsis',
          `color:${STATUS_COLORS[status]}`,
          `background:${STATUS_COLORS[status]}1a`
        ].join(';');
        cell.appendChild(badge);
        return cell;
      }
    });

    const lastReadKey = await Zotero.ItemTreeManager.registerColumn({
      dataKey: LAST_READ_KEY,
      label: 'Last Read',
      pluginID: PLUGIN_ID,
      enabledTreeIDs: ['main'],
      zoteroPersist: ['width', 'hidden', 'sortDirection'],
      dataProvider: (item: any): string => {
        try {
          if (!item?.isRegularItem?.()) return '';
          const data = this.dataStore.getData(item);
          return data.lastReadAt ? String(data.lastReadAt) : '';
        } catch (e) {
          Logger.error('last read dataProvider failed', e);
          return '';
        }
      },
      renderCell: (_index: number, data: string, column: any, _isFirstColumn: boolean, doc: Document): HTMLElement => {
        const cell = doc.createElement('span');
        cell.className = `cell ${column.className || ''}`.trim();
        cell.style.cssText = `${BASE_CELL_STYLE};justify-content:center;font-size:11px;color:var(--fill-secondary, #666);text-overflow:ellipsis;white-space:nowrap;`;
        const timestamp = Number(data);
        if (!Number.isFinite(timestamp) || timestamp <= 0) return cell;
        const label = formatRelativeDate(timestamp);
        cell.textContent = label;
        cell.title = new Date(timestamp).toLocaleString();
        return cell;
      }
    });

    if (!progressKey) Logger.warn('registerColumn returned null for Progress — column will not appear');
    if (!statusKey) Logger.warn('registerColumn returned null for Status — column will not appear');
    if (!lastReadKey) Logger.warn('registerColumn returned null for Last Read — column will not appear');

    this.registeredDataKeys = [progressKey, statusKey, lastReadKey].filter(Boolean);
    void this.ensureColumnsVisibleOnFirstRun();
  }

  public async ensureColumnsVisibleOnFirstRun() {
    await this.showColumnsOnFirstRun(this.dataKeys);
  }

  private async showColumnsOnFirstRun(registeredKeys: string[]) {
    const INIT_PREF = 'extensions.readingflow.columnsInitialized';
    const INIT_PREF_LEGACY = 'extensions.zotero.extensions.readingflow.columnsInitialized';
    try {
      if (Zotero.Prefs.get(INIT_PREF) || Zotero.Prefs.get(INIT_PREF_LEGACY)) {
        return;
      }
      if (!registeredKeys.length) return;

      // itemsView is set asynchronously after ItemTree.init(); wait for it directly.
      const itemsView = await this.waitForItemsView();
      if (!itemsView) {
        Logger.warn('showColumnsOnFirstRun: itemsView not available');
        return;
      }

      await this.applyColumnVisibility(itemsView, registeredKeys);

      // 2. Rebuild the Columns object so the current session shows the columns.
      //    _resetColumns creates a new Columns instance that reads _columnPrefs,
      //    which now has hidden:false for our keys.
      if (typeof itemsView._resetColumns === 'function') {
        await itemsView._resetColumns();
      }
      await this.applyColumnVisibility(itemsView, registeredKeys);

      // 3. Force-write to treePrefs.json immediately (bypass 60s throttle)
      //    so the state is persisted even if the user quits quickly.
      if (typeof itemsView._writeColumnPrefsToFile === 'function') {
        await itemsView._writeColumnPrefsToFile(true);
      }

      Zotero.Prefs.set(INIT_PREF, true);
      Logger.log('columns shown by default (first run)');
    } catch (e) {
      Logger.error('showColumnsOnFirstRun failed', e);
    }
  }

  private async waitForItemsView() {
    for (let attempt = 0; attempt < ColumnManager.ITEMS_VIEW_RETRY_COUNT; attempt++) {
      const pane = (Zotero as any).getActiveZoteroPane?.();
      const itemsView = pane?.itemsView;
      if (itemsView && this.isMainItemsViewReady(itemsView)) {
        return pane.itemsView;
      }
      await this.delay(ColumnManager.ITEMS_VIEW_RETRY_MS);
    }
    return null;
  }

  private isMainItemsViewReady(itemsView: any) {
    return typeof itemsView.id === 'string' && itemsView.id.startsWith('item-tree-main-');
  }

  private async delay(ms: number) {
    await new Promise((resolve) => {
      const win = (Zotero as any).getMainWindow?.();
      const schedule = win?.setTimeout?.bind(win) ?? (globalThis as any).setTimeout;
      if (typeof schedule !== 'function') {
        resolve(undefined);
        return;
      }
      schedule(resolve, ms);
    });
  }

  private getTreeColumnKeys(dataKey: string): string[] {
    const keys = new Set<string>();
    keys.add(dataKey);

    if (!dataKey.includes('-')) {
      keys.add(`${PLUGIN_ID}-${dataKey}`);
    } else if (!dataKey.startsWith(`${PLUGIN_ID}-`)) {
      keys.add(`${PLUGIN_ID}-${dataKey}`);
    }

    for (const key of Array.from(keys)) {
      try {
        if (typeof CSS !== "undefined" && CSS.escape) {
          const escaped = CSS.escape(key);
          if (escaped) {
            keys.add(escaped);
          }
        }
      } catch {
        // ignore escape failures and keep plain key fallback
      }
    }

    return Array.from(keys);
  }

  private async applyColumnVisibility(itemsView: any, registeredKeys: string[]) {
    if (!itemsView._columnPrefs) itemsView._columnPrefs = {};
    for (const dataKey of registeredKeys) {
      const keys = this.getTreeColumnKeys(dataKey);
      if (!keys.length) continue;
      for (const columnKey of keys) {
        itemsView._columnPrefs[columnKey] = Object.assign(
          {},
          itemsView._columnPrefs[columnKey] || {},
          { hidden: false }
        );
      }
    }
  }

  public unregister() {
    for (const dataKey of this.registeredDataKeys) {
      Zotero.ItemTreeManager.unregisterColumn(dataKey);
    }
    this.registeredDataKeys = [];
  }
}
