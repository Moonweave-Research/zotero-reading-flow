import test from 'node:test';
import assert from 'node:assert/strict';
import { DataStore } from '../src/dataStore';
import { NotifierManager } from '../src/notifierManager';

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('item modify notifications expose externally updated Reading Flow data', () => {
  let extra = 'ReadingFlow: {"v":1,"p":{},"s":"to-read"}';
  const item = {
    id: 42,
    getField(fieldName: string) {
      assert.equal(fieldName, 'extra');
      return extra;
    }
  };
  const store = new DataStore();
  const notifier = new NotifierManager(store);

  assert.equal(store.getData(item).s, 'to-read');
  extra = 'ReadingFlow: {"v":1,"p":{},"s":"read"}';

  notifier.notify('modify', 'item', [item.id]);

  assert.equal(store.getData(item).s, 'read');
});

test('item modify notifications preserve reset protection for pending reader saves', async () => {
  let extra = 'ReadingFlow: {"v":1,"p":{"10":0.5},"s":"reading"}';
  const item = {
    id: 43,
    getField() {
      return extra;
    },
    setField(_fieldName: string, value: string) {
      extra = value;
    },
    async saveTx() {}
  };
  const store = new DataStore();
  const notifier = new NotifierManager(store);

  await store.resetProgress(item);
  const resetAt = store.getResetTimestamp(item.id);
  assert.equal(typeof resetAt, 'number');

  notifier.notify('modify', 'item', [item.id]);

  assert.equal(store.getResetTimestamp(item.id), resetAt);
});

test('new-item default is opt-in and applies only to editable untracked regular items', async () => {
  const calls: Array<[number, string]> = [];
  const items = new Map<number, any>([
    [50, { id: 50, dateAdded: 2000, isRegularItem: () => true, isEditable: () => true }],
    [51, { id: 51, dateAdded: 2000, isRegularItem: () => true, isEditable: () => false }],
    [52, { id: 52, dateAdded: 2000, isRegularItem: () => false, isEditable: () => true }],
    [53, { id: 53, dateAdded: 2000, isRegularItem: () => true, isEditable: () => true }]
  ]);
  const prefReads: Array<[string, boolean | undefined]> = [];
  (globalThis as any).Zotero = {
    Prefs: {
      get: (name: string, global?: boolean) => {
        prefReads.push([name, global]);
        if (!global) return undefined;
        return name.endsWith('ActivatedAt') ? '1000' : 'to-read';
      }
    },
    Items: { getAsync: async (id: number) => items.get(id) }
  };
  const store = {
    hasReadingFlowNamespace: (item: any) => item.id === 53,
    initializeStatusIfUnowned: async (item: any, status: string) => {
      calls.push([item.id, status]);
      return true;
    },
    invalidateCache() {},
    clearCache() {}
  };
  const notifier = new NotifierManager(store as any);

  notifier.notify('add', 'item', [50, 51, 52, 53]);
  await flushAsyncWork();

  assert.deepEqual(calls, [[50, 'to-read']]);
  assert.deepEqual(prefReads, [
    ['extensions.readingflow.newItemStatus', true],
    ['extensions.readingflow.newItemStatusActivatedAt', true]
  ]);
});

test('Unassigned new-item default performs no writes', async () => {
  let writes = 0;
  (globalThis as any).Zotero = {
    Prefs: { get: () => 'unassigned' },
    Items: { getAsync: async () => ({ id: 60, dateAdded: 2000, isRegularItem: () => true, isEditable: () => true }) }
  };
  const store = {
    hasReadingFlowNamespace: () => false,
    initializeStatusIfUnowned: async () => { writes += 1; return true; },
    invalidateCache() {},
    clearCache() {}
  };
  const notifier = new NotifierManager(store as any);

  notifier.notify('add', 'item', [60]);
  await flushAsyncWork();

  assert.equal(writes, 0);
});

test('one failed new-item default does not prevent later eligible papers from being initialized', async () => {
  const calls: number[] = [];
  const items = new Map<number, any>([
    [70, { id: 70, dateAdded: 2000, isRegularItem: () => true, isEditable: () => true }],
    [71, { id: 71, dateAdded: 2000, isRegularItem: () => true, isEditable: () => true }]
  ]);
  (globalThis as any).Zotero = {
    Prefs: { get: (name: string) => name.endsWith('ActivatedAt') ? '1000' : 'to-read' },
    Items: { getAsync: async (id: number) => items.get(id) }
  };
  const store = {
    hasReadingFlowNamespace: () => false,
    async initializeStatusIfUnowned(item: any) {
      calls.push(item.id);
      if (item.id === 70) throw new Error('first save failed');
      return true;
    },
    invalidateCache() {},
    clearCache() {}
  };
  const notifier = new NotifierManager(store as any);

  notifier.notify('add', 'item', [70, 71]);
  await flushAsyncWork();

  assert.deepEqual(calls, [70, 71]);
});

test('new-item default skips historical sync items and any occupied namespace', async () => {
  const initialized: number[] = [];
  const items = new Map<number, any>([
    [80, { id: 80, dateAdded: 999, isRegularItem: () => true, isEditable: () => true }],
    [81, { id: 81, dateAdded: 2000, isRegularItem: () => true, isEditable: () => true }],
    [82, { id: 82, dateAdded: 2000, isRegularItem: () => true, isEditable: () => true }]
  ]);
  (globalThis as any).Zotero = {
    Prefs: { get: (name: string) => name.endsWith('ActivatedAt') ? '1000' : 'to-read' },
    Items: { getAsync: async (id: number) => items.get(id) }
  };
  const store = {
    hasReadingFlowNamespace: (item: any) => item.id === 81,
    async initializeStatusIfUnowned(item: any) { initialized.push(item.id); return true; },
    invalidateCache() {},
    clearCache() {}
  };

  await new NotifierManager(store as any).notify('add', 'item', [80, 81, 82]);
  assert.deepEqual(initialized, [82]);
});

test('an async item lookup failure does not prevent later new items', async () => {
  const initialized: number[] = [];
  (globalThis as any).Zotero = {
    Prefs: { get: (name: string) => name.endsWith('ActivatedAt') ? '1000' : 'to-read' },
    Items: {
      async getAsync(id: number) {
        if (id === 90) throw new Error('lookup failed');
        return { id, dateAdded: 2000, isRegularItem: () => true, isEditable: () => true };
      }
    }
  };
  const store = {
    hasReadingFlowNamespace: () => false,
    async initializeStatusIfUnowned(item: any) { initialized.push(item.id); return true; },
    invalidateCache() {},
    clearCache() {}
  };

  await new NotifierManager(store as any).notify('add', 'item', [90, 91]);
  assert.deepEqual(initialized, [91]);
});

test('a large add notification loads all items in one Zotero lookup and initializes them sequentially', async () => {
  const ids = Array.from({ length: 1000 }, (_, index) => index + 1000);
  const lookups: unknown[] = [];
  let activeWrites = 0;
  let maxActiveWrites = 0;
  let writes = 0;
  (globalThis as any).Zotero = {
    Prefs: { get: (name: string) => name.endsWith('ActivatedAt') ? '1000' : 'to-read' },
    Items: {
      async getAsync(requestedIDs: number[]) {
        lookups.push(requestedIDs);
        return requestedIDs.map((id) => ({
          id,
          dateAdded: 2000,
          isRegularItem: () => true,
          isEditable: () => true
        }));
      }
    }
  };
  const store = {
    hasReadingFlowNamespace: () => false,
    async initializeStatusIfUnowned() {
      activeWrites += 1;
      maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
      await Promise.resolve();
      writes += 1;
      activeWrites -= 1;
      return true;
    },
    invalidateCache() {},
    clearCache() {}
  };

  await new NotifierManager(store as any).notify('add', 'item', ids);

  assert.deepEqual(lookups, [ids]);
  assert.equal(writes, 1000);
  assert.equal(maxActiveWrites, 1);
});

test('registration replaces a Zotero-truncated numeric activation time with a string timestamp', () => {
  const writes: unknown[][] = [];
  const clears: unknown[][] = [];
  const originalNow = Date.now;
  Date.now = () => 1_787_841_234_567;
  (globalThis as any).Zotero = {
    Prefs: {
      get: (name: string) => name.endsWith('ActivatedAt') ? 1_134_649_864 : 'to-read',
      set: (...args: unknown[]) => writes.push(args),
      clear: (...args: unknown[]) => clears.push(args)
    },
    Notifier: { registerObserver: () => 'observer-id' }
  };

  try {
    new NotifierManager({} as any).register();
  } finally {
    Date.now = originalNow;
  }

  assert.deepEqual(writes, [[
    'extensions.readingflow.newItemStatusActivatedAt',
    '1787841234000',
    true
  ]]);
  assert.deepEqual(clears, [[
    'extensions.readingflow.newItemStatusActivatedAt',
    true
  ]]);
});
