import { getSelectedLibraryID } from './selectedLibrary';

export type StatisticsScope = 'current-view' | 'entire-library';

export interface ScopeItem {
  id: number | string;
  parentID?: number | string | null;
  deleted?: boolean;
  _deleted?: boolean;
  isRegularItem?: () => boolean;
  isDeleted?: () => boolean;
  getField?: (field: string) => string | null;
  getTags?: () => Array<{ tag: string; type?: number }>;
}

export interface StatisticsScopeRuntime {
  getActiveZoteroPane?: () => {
    getSelectedLibraryIDs?: () => number[];
    getSelectedLibraryID?: () => number;
    getSortedItems?: () => Array<ScopeItem | number | string>;
    itemsView?: {
      getSortedItems?: () => Array<ScopeItem | number | string>;
    };
  } | null;
  Items?: {
    get?: (id: number | string) => ScopeItem | null;
    loadDataTypes?: (items: ScopeItem[], types: string[]) => Promise<void>;
    getAll?: (
      libraryID: number,
      onlyTopLevel?: boolean,
      includeDeleted?: boolean,
      asIDs?: boolean
    ) => Promise<Array<ScopeItem | number | string>> | Array<ScopeItem | number | string>;
  };
}

export interface StatisticsScopeAdapter {
  getItems(scope: StatisticsScope): Promise<ScopeItem[]>;
}

export function createStatisticsScopeAdapter(
  runtime: StatisticsScopeRuntime = (globalThis as any).Zotero
): StatisticsScopeAdapter {
  return {
    async getItems(scope: StatisticsScope): Promise<ScopeItem[]> {
      const pane = runtime.getActiveZoteroPane?.();
      if (!pane) return [];

      if (scope === 'current-view') {
        const source = pane.getSortedItems?.() ?? pane.itemsView?.getSortedItems?.() ?? [];
        const items = filterRegularParentItems(resolveItems(source, runtime));
        await runtime.Items?.loadDataTypes?.(items, ['tags']);
        return items;
      }

      if (scope === 'entire-library') {
        const libraryID = getSelectedLibraryID(pane);
        if (!isPositiveInteger(libraryID) || typeof runtime.Items?.getAll !== 'function') {
          return [];
        }
        const source = await runtime.Items.getAll(libraryID, true, false, false);
        const items = filterRegularParentItems(resolveItems(source, runtime));
        await runtime.Items?.loadDataTypes?.(items, ['tags']);
        return items;
      }

      throw new Error(`Unsupported statistics scope: ${scope}`);
    }
  };
}

export function filterRegularParentItems(items: readonly ScopeItem[]): ScopeItem[] {
  const result: ScopeItem[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (!isRegularParentItem(item)) continue;
    const key = String(item.id);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function resolveItems(
  source: readonly (ScopeItem | number | string)[],
  runtime: StatisticsScopeRuntime
): ScopeItem[] {
  return source
    .map((entry) => {
      if (typeof entry === 'number' || typeof entry === 'string') {
        return runtime.Items?.get?.(entry) ?? null;
      }
      return entry;
    })
    .filter((item): item is ScopeItem => Boolean(item));
}

function isRegularParentItem(item: ScopeItem): boolean {
  if (!item || typeof item.isRegularItem !== 'function' || !item.isRegularItem()) return false;
  if (item.deleted === true || item._deleted === true || item.isDeleted?.() === true) return false;

  const parentID = item.parentID;
  return parentID === undefined || parentID === null || Number(parentID) === 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
