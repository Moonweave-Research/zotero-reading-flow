export type StatisticsScope = 'current-view' | 'entire-library';

export interface ScopeItem {
  id: number | string;
  parentID?: number | string | null;
  deleted?: boolean;
  _deleted?: boolean;
  isRegularItem?: () => boolean;
  isDeleted?: () => boolean;
  getField?: (field: string) => string | null;
}

export interface StatisticsScopeRuntime {
  getActiveZoteroPane?: () => {
    getSelectedLibraryID?: () => number;
    getSortedItems?: () => Array<ScopeItem | number | string>;
    itemsView?: {
      getSortedItems?: () => Array<ScopeItem | number | string>;
    };
  } | null;
  Items?: {
    get?: (id: number | string) => ScopeItem | null;
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
        return filterRegularParentItems(resolveItems(source, runtime));
      }

      if (scope === 'entire-library') {
        const libraryID = pane.getSelectedLibraryID?.();
        if (!isPositiveInteger(libraryID) || typeof runtime.Items?.getAll !== 'function') {
          return [];
        }
        const source = await runtime.Items.getAll(libraryID, true, false, false);
        return filterRegularParentItems(resolveItems(source, runtime));
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
