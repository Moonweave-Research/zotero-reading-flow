import { DataStore } from './dataStore';
import {
  DisplayReadingStatus,
  ReadingStatus,
  ReadingStatusSource,
  formatActivityTimestamp,
  getLastActivityAt,
  formatPDFPosition,
  formatReadingBookmark,
  resolveDisplayProgress,
  resolveReadingStatus
} from './flowData';
import { Logger } from './Logger';
import {
  getGlobalPreference,
  READING_FLOW_PREFS,
  setGlobalPreference
} from './preferences';

const PLUGIN_ID = 'readingflow@moon.com';
const PROGRESS_KEY = 'readingFlowProgress';
const STATUS_KEY = 'readingFlowStatus';
const LAST_READ_KEY = 'readingFlowLastRead';
const COMPOSITE_KEY = 'readingFlowDisplay';
export const READING_FLOW_DISPLAY_PREF = READING_FLOW_PREFS.displayDensity;
export type ReadingFlowDisplayDensity = 'compact' | 'icons';

type CompositeValue = {
  status: DisplayReadingStatus;
  source: ReadingStatusSource;
  important?: boolean;
  progress: number | null;
  lastReadAt: number | null;
  positionText?: string;
  maximumText?: string;
  bookmarkText?: string;
  itemID?: number;
};

const STATUS_LABELS: Record<DisplayReadingStatus, string> = {
  unavailable: 'Record unavailable',
  unassigned: 'Unassigned',
  'to-read': 'To Read',
  reading: 'Reading',
  skimmed: 'Skimmed',
  read: 'Read'
};
const STATUS_COLORS: Record<ReadingStatus, string> = {
  'to-read': '#6b7280',
  reading: '#2563eb',
  skimmed: '#7c3aed',
  read: '#16a34a'
};
const STATUS_SYMBOLS: Record<ReadingStatus, string> = {
  'to-read': '📙', reading: '📖', skimmed: '📘', read: '📗'
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
  } catch { return { status: 'unassigned', source: 'unassigned', progress: null, lastReadAt: null }; }
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
  if (progress === null || !Number.isFinite(progress) || progress <= 0) return 'no saved PDF position';
  return progress > 1 ? `page ${Math.round(progress)}` : `${Math.round(progress * 100)}% PDF position`;
}

function accessibleText(value: CompositeValue): string {
  if (value.status === 'unavailable') return 'Reading Flow record unavailable';
  if (value.status === 'to-read' && value.positionText === 'No last viewed position' && !value.lastReadAt) {
    return `To Read, manual status, No last viewed position, no PDF activity recorded${value.important ? ', Important' : ''}`;
  }
  const lastRead = value.lastReadAt && value.lastReadAt > 0
    ? `last PDF activity ${formatActivityTimestamp(value.lastReadAt)}`
    : value.positionText === 'No last viewed position' || !value.positionText ? 'no PDF activity recorded' : 'PDF activity date unknown';
  const source = value.source === 'manual' ? 'manual status' : value.source === 'automatic' ? 'PDF activity based status' : 'no status assigned';
  return `${STATUS_LABELS[value.status] ?? STATUS_LABELS['to-read']}, ${source}, ${value.positionText ?? progressText(value.progress)}, ${value.maximumText ?? ""}, ${lastRead}${value.important ? ', Important' : ''}`;
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
      dataKey: PROGRESS_KEY, label: 'Bookmark / Last Viewed', pluginID: PLUGIN_ID, enabledTreeIDs: ['main'], defaultIn: ['default'],
      zoteroPersist: ['width', 'hidden', 'sortDirection'],
      dataProvider: (item: any) => {
        try {
          if (!item?.isRegularItem?.()) return '';
          const data = this.dataStore.getData(item);
          return `${resolveDisplayProgress(data).presentationProgress ?? 0}|${formatPDFPosition(data)}|${formatReadingBookmark(data)}`;
        }
        catch (e) { Logger.error('column dataProvider failed', e); return '0|Reading Flow record unavailable|'; }
      },
      renderCell: (_index: number, data: string, column: any, _first: boolean, doc: Document) => this.renderDetailedProgress(data, column, doc)
    });
    const statusKey = await manager.registerColumn({
      dataKey: STATUS_KEY, label: 'Status', pluginID: PLUGIN_ID, enabledTreeIDs: ['main'], defaultIn: ['default'],
      zoteroPersist: ['width', 'hidden', 'sortDirection'],
      dataProvider: (item: any) => {
        try {
          if (!item?.isRegularItem?.()) return '';
          const data = this.dataStore.getData(item);
          const resolved = resolveReadingStatus(data);
          return resolved.status === 'unassigned' && !data.important ? resolved.status : `${resolved.status}|${resolved.source}${data.important ? '|important' : ''}`;
        } catch (e) { Logger.error('status dataProvider failed', e); return 'unavailable|unavailable'; }
      },
      renderCell: (_index: number, data: string, column: any, _first: boolean, doc: Document) => this.renderStatus(data, column, doc)
    });
    const lastReadKey = await manager.registerColumn({
      dataKey: LAST_READ_KEY, label: 'Last PDF Activity', pluginID: PLUGIN_ID, enabledTreeIDs: ['main'], defaultIn: ['default'],
      zoteroPersist: ['width', 'hidden', 'sortDirection'],
      dataProvider: (item: any) => { try { if (!item?.isRegularItem?.()) return ''; const data = this.dataStore.getData(item); return data.availability ? 'unavailable' : String(getLastActivityAt(data) || ''); } catch (e) { Logger.error('last read dataProvider failed', e); return 'unavailable'; } },
      renderCell: (_index: number, data: string, column: any, _first: boolean, doc: Document) => this.renderLastRead(data, column, doc)
    });
    const compositeKey = await manager.registerColumn({
      dataKey: COMPOSITE_KEY, label: 'Reading Flow', pluginID: PLUGIN_ID, enabledTreeIDs: ['main'],
      zoteroPersist: ['width', 'hidden', 'sortDirection'],
      dataProvider: (item: any) => {
        const itemID = item?.id || 0;
        if (!item?.isRegularItem?.()) {
          const value = { status: 'unassigned' as const, source: 'unassigned' as const, progress: null, lastReadAt: null, itemID };
          return `${nativeSortKey(value)}|${JSON.stringify(value)}`;
        }
        try {
          const data: any = this.dataStore.getData(item);
          const resolved = resolveReadingStatus(data);
          const position = resolveDisplayProgress(data);
          const value = { important: data.important === true, status: resolved.status, source: resolved.source, progress: position.pageCount !== null ? position.presentationProgress : null, lastReadAt: getLastActivityAt(data), positionText: formatPDFPosition(data), bookmarkText: formatReadingBookmark(data), maximumText: formatReadingBookmark(data), itemID };
          return `${nativeSortKey(value)}|${JSON.stringify(value)}`;
        } catch (e) {
          Logger.error('composite dataProvider failed', e);
          const fallback = { status: 'unavailable' as const, source: 'unavailable' as const, progress: null, lastReadAt: null, itemID };
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
    const value = getGlobalPreference(READING_FLOW_DISPLAY_PREF);
    return value === 'icons' ? 'icons' : 'compact';
  }

  public setDisplayDensity(value: ReadingFlowDisplayDensity): string | undefined {
    if (value !== 'compact' && value !== 'icons') return undefined;
    setGlobalPreference(READING_FLOW_DISPLAY_PREF, value);
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
    if (getGlobalPreference(READING_FLOW_DISPLAY_PREF) !== undefined) return;
    setGlobalPreference(READING_FLOW_DISPLAY_PREF, 'compact');
  }

  private renderComposite(data: string, column: any, doc: Document): HTMLElement {
    const value = decodeComposite(data);
    const cell = doc.createElement('span');
    cell.className = `cell ${column.className || ''}`.trim();
    cell.style.cssText = `${BASE_CELL_STYLE}justify-content:flex-start;gap:5px;`;
    const fullText = accessibleText(value);
    cell.setAttribute('aria-label', fullText);
    cell.title = fullText;
    if (value.status === 'unavailable') { cell.textContent = '—'; return cell; }
    if (value.status === 'unassigned' && !value.important) return cell;
    const icon = doc.createElement('span');
    icon.textContent = `${value.status === 'unassigned' ? '' : STATUS_SYMBOLS[value.status]}${value.important ? ' ⭐' : ''}`;
    icon.setAttribute('aria-hidden', 'true');
    cell.appendChild(icon);
    if (this.getDisplayDensity() === 'compact') {
      const details = doc.createElement('span');
      const progress = progressText(value.progress);
      const notStarted = (value.status === 'to-read' || value.status === 'unassigned') && value.positionText === 'No last viewed position' && !value.lastReadAt;
      const visualProgress = value.bookmarkText && value.bookmarkText !== 'No reading bookmark'
        ? `${value.bookmarkText} · ${value.positionText}` : value.positionText ?? progress;
      details.textContent = notStarted
        ? 'No PDF activity recorded'
        : `${visualProgress} · ${value.lastReadAt ? formatActivityTimestamp(value.lastReadAt) : value.positionText === 'No last viewed position' ? 'No PDF activity recorded' : 'PDF activity date unknown'}`;
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
    const [statusValue, source, important] = data.split('|');
    if (!statusValue || !(statusValue in STATUS_LABELS)) return cell;
    if (statusValue === 'unassigned' && !important) {
      cell.setAttribute('aria-label', 'No reading status assigned');
      cell.title = 'No reading status assigned';
      return cell;
    }

    if (statusValue === 'unavailable') { cell.textContent = '—'; cell.title = 'Reading Flow record unavailable'; cell.setAttribute('aria-label', cell.title); return cell; }
    const status = statusValue as ReadingStatus;
    const badge = doc.createElement('span');
    badge.textContent = `${STATUS_LABELS[statusValue as DisplayReadingStatus]}${important ? ' ⭐' : ''}`;
    const sourceLabel = source === 'manual' ? 'manual status' : source === 'automatic' ? 'PDF activity based status' : '';
    badge.title = sourceLabel ? `${STATUS_LABELS[statusValue as DisplayReadingStatus]} — ${sourceLabel}` : STATUS_LABELS[statusValue as DisplayReadingStatus];
    if (important) badge.title += ', Important';
    cell.title = badge.title;
    cell.setAttribute('aria-label', badge.title);
    badge.style.cssText = [
      'display:inline-flex', 'align-items:center', 'justify-content:center', 'max-width:100%',
      'height:18px', 'padding:0 6px', 'border-radius:9px', 'box-sizing:border-box',
      'font-size:10px', 'line-height:1', 'white-space:nowrap', 'overflow:hidden',
      'text-overflow:ellipsis', `color:${STATUS_COLORS[status] ?? '#6b7280'}`, `background:${STATUS_COLORS[status] ?? '#6b7280'}1a`
    ].join(';');
    cell.appendChild(badge);
    return cell;
  }

  private renderLastRead(data: string, column: any, doc: Document): HTMLElement {
    const cell = doc.createElement('span');
    cell.className = `cell ${column.className || ''}`.trim();
    cell.style.cssText = `${BASE_CELL_STYLE};display:block;align-content:center;font-size:11px;color:var(--fill-secondary, #666);text-overflow:ellipsis;white-space:nowrap;`;
    cell.title = data === 'unavailable' ? 'Reading Flow record unavailable' : 'No PDF activity timestamp recorded';
    cell.setAttribute('aria-label', cell.title);
    const timestamp = Number(data);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return cell;
    cell.textContent = formatActivityTimestamp(timestamp);
    cell.title = `Last PDF activity: ${formatActivityTimestamp(timestamp)}`;
    cell.setAttribute('aria-label', cell.title);
    return cell;
  }
  private renderDetailedProgress(data: string, column: any, doc: Document): HTMLElement {
    const cell = doc.createElement('span');
    cell.className = `cell ${column.className || ''}`.trim();
    cell.style.cssText = 'display:flex;align-items:center;justify-content:center;position:relative;width:100%;max-width:100%;min-width:0;height:100%;padding:0;box-sizing:border-box;overflow:hidden;';
    if (!data) return cell;
    const [, position, maximum] = data.split('|');
    cell.textContent = maximum?.startsWith('Reading bookmark:') ? `${maximum} · ${position}` : position ?? 'Saved PDF position unknown';
    cell.title = cell.textContent;
    cell.setAttribute('aria-label', cell.title);
    cell.style.padding = '0 6px';
    return cell;
  }
}
