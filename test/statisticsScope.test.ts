import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStatisticsScopeAdapter,
  ScopeItem,
  StatisticsScopeRuntime
} from '../src/statisticsScope';

function regular(id: number, updates: Partial<ScopeItem> = {}): ScopeItem {
  return {
    id,
    isRegularItem() {
      return true;
    },
    ...updates
  };
}

function attachment(id: number, parentID: number): ScopeItem {
  return {
    id,
    parentID,
    isRegularItem() {
      return false;
    }
  };
}

function runtime(
  pane: any,
  items: Record<string, ScopeItem> = {}
): StatisticsScopeRuntime {
  return {
    getActiveZoteroPane() {
      return pane;
    },
    Items: {
      get(id) {
        return items[String(id)] ?? null;
      },
      async getAll() {
        return Object.values(items);
      }
    }
  };
}

test('current view uses the visible sorted items and returns only live top-level regular parents', async () => {
  const visible = [
    regular(1),
    attachment(2, 1),
    regular(3, { parentID: 1 }),
    regular(4, { deleted: true }),
    regular(1)
  ];
  const adapter = createStatisticsScopeAdapter(runtime({
    getSortedItems() {
      return visible;
    }
  }));

  const items = await adapter.getItems('current-view');

  assert.deepEqual(items.map((item) => item.id), [1]);
});

test('current view can use the item-tree adapter without falling back to selection', async () => {
  const selected = regular(99);
  const adapter = createStatisticsScopeAdapter(runtime({
    getSelectedItems() {
      return [selected];
    },
    itemsView: {
      getSortedItems() {
        return [regular(5)];
      }
    }
  }));

  const items = await adapter.getItems('current-view');

  assert.deepEqual(items.map((item) => item.id), [5]);
});

test('entire library requests top-level non-deleted items for the selected library', async () => {
  let getAllArgs: unknown[] = [];
  const source = [regular(10), attachment(11, 10), regular(12, { deleted: true })];
  const adapter = createStatisticsScopeAdapter({
    getActiveZoteroPane() {
      return {
        getSelectedLibraryID() {
          return 7;
        }
      };
    },
    Items: {
      async getAll(...args: any[]) {
        getAllArgs = args;
        return source;
      }
    }
  });

  const items = await adapter.getItems('entire-library');

  assert.deepEqual(getAllArgs, [7, true, false, false]);
  assert.deepEqual(items.map((item) => item.id), [10]);
});

test('entire library uses Zotero 10 selected-library IDs when the singular API is unavailable', async () => {
  const calls: unknown[][] = [];
  const adapter = createStatisticsScopeAdapter({
    getActiveZoteroPane: () => ({
      getSelectedLibraryIDs: () => [7]
    }),
    Items: {
      async getAll(...args: unknown[]) {
        calls.push(args);
        return [];
      }
    }
  });

  assert.deepEqual(await adapter.getItems('entire-library'), []);
  assert.deepEqual(calls, [[7, true, false, false]]);
});

test('entire library resolves item IDs and fails closed without a selected library', async () => {
  let getAllCalls = 0;
  const adapter = createStatisticsScopeAdapter({
    getActiveZoteroPane() {
      return {
        getSelectedLibraryID() {
          return 0;
        }
      };
    },
    Items: {
      getAll() {
        getAllCalls += 1;
        return [1];
      },
      get() {
        return regular(1);
      }
    }
  });

  assert.deepEqual(await adapter.getItems('entire-library'), []);
  assert.equal(getAllCalls, 0);
});
