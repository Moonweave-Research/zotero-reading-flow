import { DataStore } from './dataStore';
import { formatRelativeDate, getDisplayProgress, inferStatus, ReadingStatus } from './flowData';
import { Logger } from './Logger';

const PLUGIN_ID = 'readingflow@moon.com';
const PROGRESS_KEY = 'readingFlowProgress';
const STATUS_KEY = 'readingFlowStatus';
const LAST_READ_KEY = 'readingFlowLastRead';
const COMPOSITE_KEY = 'readingFlowDisplay';
export const READING_FLOW_DISPLAY_PREF = 'extensions.readingflow.displayDensity';
export type ReadingFlowDisplayDensity = 'compact' | 'icons';

type CompositeValue = {
  status: ReadingStatus;
  progress: number | null;
  lastReadAt: number | null;
  itemID?: number;
};

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
const STATUS_SYMBOLS: Record<ReadingStatus, string> = {
  'to-read': '📙', reading: '📖', skimmed: '📘', read: '📗', important: '⭐'
};
const BASE_CELL_STYLE = 'display:flex;align-items:center;width:100%;max-width:100%;min-width:0;height:100%;padding:0 6px;box-sizing:border-box;overflow:hidden;';

export function sortReadingFlowValues(left: Partial<CompositeValue>, right: Partial<CompositeValue>): number {
  const leftRead = Number.isFinite(left.lastReadAt) && (left.lastReadAt as number) > 0 ? left.lastReadAt as number : null;
  const rightRead = Number.isFinite(right.lastReadAt) && (right.lastReadAt as number) > 0 ? right.lastReadAt as number : null;
  if (leftRead === null && rightRead !== null) return 1;
  if (leftRead !== null && rightRead === null) return -1;
  if (leftRead !== rightRead) return (rightRead ?? 0) - (leftRead ?? 0);
  return (left.itemID ?? 0) - (right.itemID ?? 0);
}

function decodeComposite(value: unknown): CompositeValue {
  if (typeof value === 'object' && value !== null) return value as CompositeValue;
  try {
    const encoded = String(value);
    return JSON.parse(encoded.includes('|') ? encoded.slice(encoded.indexOf('|') + 1) : encoded) as CompositeValue;
  } catch { return { status: 'to-read', progress: null, lastReadAt: null }; }
}

function nativeSortKey(value: CompositeValue): string {
  const timestamp = Number.isFinite(value.lastReadAt) && (value.lastReadAt as number) > 0 ? value.lastReadAt as number : null;
  const itemID = Math.max(0, Math.min(9999999999, Math.round(value.itemID ?? 0)));
  // Zotero's public sortReverse:true order is descending on first click. Keep recent timestamps
  // and read items greater than never-read rows; invert only the tie-breaker so
  // equal recency remains deterministic with the lower item ID first.
  const descendingTie = 9999999999 - itemID;
  return `${String(Math.round(timestamp ?? 0)).padStart(13, '0')}:${String(descendingTie).padStart(10, '0')}`;
}

function progressText(progress: number | null): string {
  if (progress === null || !Number.isFinite(progress) || progress <= 0) return 'no progress recorded';
  return progress > 1 ? `page ${Math.round(progress)}` : `${Math.round(progress * 100)}% read`;
}

function accessibleText(value: CompositeValue): string {
  if (value.status === 'to-read' && progressText(value.progress) === 'no progress recorded' && !value.lastReadAt) {
    return 'To Read, not started, never read';
  }
  const lastRead = value.lastReadAt && value.lastReadAt > 0
    ? `last read ${formatRelativeDate(value.lastReadAt)}`
    : 'never read';
  return `${STATUS_LABELS[value.status] ?? STATUS_LABELS['to-read']}, ${progressText(value.progress)}, ${lastRead}`;
}

export class ColumnManager {
  private readonly dataStore: DataStore;
  private registered = false;
  private registeredDataKeys: string[] = [];
  private readonly dataKeys = [PROGRESS_KEY, STATUS_KEY, LAST_READ_KEY];

  constructor(dataStore: DataStore) { this.dataStore = dataStore; }

  public async register() {
    this.initializeDisplayDensity();
    if (this.registered) return;
    const manager = (globalThis as any).Zotero.ItemTreeManager;
    const progressKey = await manager.registerColumn({
      dataKey: PROGRESS_KEY, label: 'Progress', pluginID: PLUGIN_ID, enabledTreeIDs: ['main'], defaultIn: ['default'],
      zoteroPersist: ['width', 'hidden', 'sortDirection'],
      dataProvider: (item: any) => {
        try { return item?.isRegularItem?.() ? String(getDisplayProgress(this.dataStore.getData(item)) || '') : ''; }
        catch (e) { Logger.error('column dataProvider failed', e); return ''; }
      },
      renderCell: (_index: number, data: string, column: any, _first: boolean, doc: Document) => this.renderDetailedProgress(data, column, doc)
    });
    const statusKey = await manager.registerColumn({
      dataKey: STATUS_KEY, label: 'Status', pluginID: PLUGIN_ID, enabledTreeIDs: ['main'], defaultIn: ['default'],
      zoteroPersist: ['width', 'hidden', 'sortDirection'],
      dataProvider: (item: any) => { try { return item?.isRegularItem?.() ? inferStatus(this.dataStore.getData(item)) : ''; } catch (e) { Logger.error('status dataProvider failed', e); return ''; } },
      renderCell: (_index: number, data: string, column: any, _first: boolean, doc: Document) => this.renderStatus(data, column, doc)
    });
    const lastReadKey = await manager.registerColumn({
      dataKey: LAST_READ_KEY, label: 'Last Read', pluginID: PLUGIN_ID, enabledTreeIDs: ['main'], defaultIn: ['default'],
      zoteroPersist: ['width', 'hidden', 'sortDirection'],
      dataProvider: (item: any) => { try { return item?.isRegularItem?.() ? String(this.dataStore.getData(item).lastReadAt || '') : ''; } catch (e) { Logger.error('last read dataProvider failed', e); return ''; } },
      renderCell: (_index: number, data: string, column: any, _first: boolean, doc: Document) => this.renderLastRead(data, column, doc)
    });
    const compositeKey = await manager.registerColumn({
      dataKey: COMPOSITE_KEY, label: 'Reading Flow', pluginID: PLUGIN_ID, enabledTreeIDs: ['main'],
      zoteroPersist: ['width', 'hidden', 'sortDirection'],
      dataProvider: (item: any) => {
        try {
          const data: any = item?.isRegularItem?.() ? this.dataStore.getData(item) : {};
          const value = { status: inferStatus(data), progress: getDisplayProgress(data) || null, lastReadAt: data.lastReadAt || null, itemID: item?.id || 0 };
          return `${nativeSortKey(value)}|${JSON.stringify(value)}`;
        } catch (e) {
          Logger.error('composite dataProvider failed', e);
          const fallback = { status: 'to-read' as ReadingStatus, progress: null, lastReadAt: null, itemID: 0 };
          return `${nativeSortKey(fallback)}|${JSON.stringify(fallback)}`;
        }
      },
      sortReverse: true,
      renderCell: (_index: number, data: string, column: any, _first: boolean, doc: Document) => this.renderComposite(data, column, doc)
    });
    this.registeredDataKeys = [progressKey, statusKey, lastReadKey, compositeKey].filter(Boolean);
    this.registered = true;
    (globalThis as any).Zotero.ReadingFlowColumnManager = this;
  }

  public getDisplayDensity(): ReadingFlowDisplayDensity {
    const value = (globalThis as any).Zotero?.Prefs?.get?.(READING_FLOW_DISPLAY_PREF);
    return value === 'icons' ? 'icons' : 'compact';
  }

  public setDisplayDensity(value: ReadingFlowDisplayDensity): string | undefined {
    if (value !== 'compact' && value !== 'icons') return undefined;
    (globalThis as any).Zotero.Prefs.set(READING_FLOW_DISPLAY_PREF, value);
    const manager = (globalThis as any).Zotero.ItemTreeManager;
    if (typeof manager?.refreshColumns === 'function') {
      try {
        const result = manager.refreshColumns();
        if (result && typeof result.then === 'function') {
          result.catch(() => this.showRefreshGuidance());
        }
        return undefined;
      } catch {
        return this.showRefreshGuidance();
      }
    }
    return this.showRefreshGuidance();
  }

  private showRefreshGuidance(): string {
    const guidance = 'Reading Flow density saved. Restart or refresh Zotero to see it.';
    const mainWindow = (globalThis as any).Zotero?.getMainWindow?.();
    const message = (globalThis as any).document?.getElementById?.('readingflow-pref-density-message')
      ?? mainWindow?.document?.getElementById?.('readingflow-pref-density-message');
    if (message) message.textContent = guidance;
    return guidance;
  }

  public async ensureColumnsVisibleOnFirstRun() { /* Native chooser owns visibility; deliberately no-op. */ }
  public unregister() { /* Columns live for Zotero's public manager lifecycle; never unregister user layout. */ }

  private initializeDisplayDensity() {
    const prefs = (globalThis as any).Zotero?.Prefs;
    if (!prefs || prefs.get(READING_FLOW_DISPLAY_PREF) !== undefined) return;
    prefs.set(READING_FLOW_DISPLAY_PREF, 'compact');
  }

  private renderComposite(data: string, column: any, doc: Document): HTMLElement {
    const value = decodeComposite(data);
    const cell = doc.createElement('span');
    cell.className = `cell ${column.className || ''}`.trim();
    cell.style.cssText = `${BASE_CELL_STYLE}justify-content:flex-start;gap:5px;`;
    const fullText = accessibleText(value);
    cell.setAttribute('aria-label', fullText);
    cell.title = fullText;
    const icon = doc.createElement('span');
    icon.textContent = STATUS_SYMBOLS[value.status] ?? STATUS_SYMBOLS['to-read'];
    icon.setAttribute('aria-hidden', 'true');
    cell.appendChild(icon);
    if (this.getDisplayDensity() === 'compact') {
      const microProgress = doc.createElement('span');
      const numericProgress = value.progress !== null && Number.isFinite(value.progress) && value.progress > 0 && value.progress <= 1;
      const percent = numericProgress ? Math.round(value.progress as number * 100) : 0;
      microProgress.className = 'reading-flow-micro-progress';
      microProgress.setAttribute('aria-hidden', 'true');
      microProgress.setAttribute('data-progress', numericProgress ? String(percent) : 'none');
      microProgress.textContent = numericProgress ? '' : '—';
      microProgress.style.cssText = numericProgress
        ? `display:block;width:24px;height:4px;background:linear-gradient(to right,currentColor ${percent}%,rgba(127,127,127,.25) ${percent}%);border-radius:2px;flex:0 0 24px;`
        : 'display:flex;align-items:center;justify-content:center;width:24px;height:8px;color:currentColor;opacity:.55;font-size:9px;line-height:1;flex:0 0 24px;';
      cell.appendChild(microProgress);
      const details = doc.createElement('span');
      const progress = progressText(value.progress);
      const notStarted = value.status === 'to-read' && progress === 'no progress recorded' && !value.lastReadAt;
      const visualProgress = progress === 'no progress recorded' ? 'No progress recorded' : progress;
      details.textContent = notStarted
        ? 'Not started'
        : `${visualProgress} · ${value.lastReadAt ? formatRelativeDate(value.lastReadAt) : 'never read'}`;
      details.setAttribute('aria-hidden', 'true');
      details.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;';
      cell.appendChild(details);
    }
    return cell;
  }

  private renderStatus(data: string, column: any, doc: Document): HTMLElement {
    const cell = doc.createElement('span');
    cell.className = `cell ${column.className || ''}`.trim();
    cell.style.cssText = `${BASE_CELL_STYLE};justify-content:center;`;
    if (!data || !(data in STATUS_LABELS)) return cell;

    const status = data as ReadingStatus;
    const badge = doc.createElement('span');
    badge.textContent = STATUS_LABELS[status];
    badge.title = STATUS_LABELS[status];
    badge.style.cssText = [
      'display:inline-flex', 'align-items:center', 'justify-content:center', 'max-width:100%',
      'height:18px', 'padding:0 6px', 'border-radius:9px', 'box-sizing:border-box',
      'font-size:10px', 'line-height:1', 'white-space:nowrap', 'overflow:hidden',
      'text-overflow:ellipsis', `color:${STATUS_COLORS[status]}`, `background:${STATUS_COLORS[status]}1a`
    ].join(';');
    cell.appendChild(badge);
    return cell;
  }

  private renderLastRead(data: string, column: any, doc: Document): HTMLElement {
    const cell = doc.createElement('span');
    cell.className = `cell ${column.className || ''}`.trim();
    cell.style.cssText = `${BASE_CELL_STYLE};justify-content:center;font-size:11px;color:var(--fill-secondary, #666);text-overflow:ellipsis;white-space:nowrap;`;
    const timestamp = Number(data);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return cell;
    cell.textContent = formatRelativeDate(timestamp);
    cell.title = new Date(timestamp).toLocaleString();
    return cell;
  }
  private renderDetailedProgress(data: string, column: any, doc: Document): HTMLElement {
    const cell = doc.createElement('span');
    cell.className = `cell ${column.className || ''}`.trim();
    cell.style.cssText = 'display:flex;align-items:center;justify-content:center;position:relative;width:100%;max-width:100%;min-width:0;height:100%;padding:0;box-sizing:border-box;overflow:hidden;';
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
    trackRow.style.cssText = 'display:flex;align-items:center;width:100%;min-width:0;height:6px;gap:6px;';
    const label = doc.createElement('span');
    label.textContent = `${percent}%`;
    label.title = `${percent}% read`;
    label.style.cssText = 'z-index:1;color:var(--fill-secondary, #666);font-size:10px;line-height:1;';
    label.style.whiteSpace = 'nowrap';
    label.style.flex = '0 0 auto';
    const track = doc.createElement('div');
    track.style.cssText = 'flex:1;min-width:0;width:100%;height:6px;background:rgba(0,0,0,0.1);border-radius:3px;overflow:hidden;';
    const bar = doc.createElement('div');
    const completedColor = ((globalThis as any).Zotero?.Prefs?.get?.('extensions.readingflow.color-completed') as string) || '#4caf50';
    const readingColor = ((globalThis as any).Zotero?.Prefs?.get?.('extensions.readingflow.color-reading') as string) || '#2196f3';
    bar.style.cssText = `width:${percent}%;height:100%;background:${value >= 0.99 ? completedColor : readingColor};`;
    track.appendChild(bar); trackRow.appendChild(track); trackRow.appendChild(label); cell.appendChild(trackRow);
    return cell;
  }
}
