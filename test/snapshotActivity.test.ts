import test from 'node:test';
import assert from 'node:assert/strict';
import { DataStore } from '../src/dataStore';
import { ReaderTracker } from '../src/readerTracker';
import { getLastActivityAt, resolveReadingStatus } from '../src/flowData';
import { calculateStatisticsSnapshot } from '../src/statistics';

test('opening a snapshot derives automatic Reading without inventing PDF progress', async () => {
  const original = (globalThis as any).Zotero;
  let extra = 'Custom: keep', saves = 0, refreshes = 0;
  const parent = { id: 20, getField: () => extra, setField: (_: string, value: string) => { extra = value; },
    saveTx: async () => { saves++; } };
  const attachment = { id: 10, parentID: 20, isPDFAttachment: () => false };
  const reader = { itemID: 10, _type: 'snapshot', _initPromise: Promise.resolve() };
  let onToolbar!: (event: any) => void;
  const store = new DataStore(), tracker = new ReaderTracker(store);
  (globalThis as any).Zotero = {
    Reader: { _readers: [reader], registerEventListener: (_: string, listener: any) => { onToolbar = listener; }, unregisterEventListener() {} },
    Items: { get: () => attachment, getAsync: async () => parent },
    Notifier: { registerObserver: () => 'snapshot', unregisterObserver() {}, trigger: () => { refreshes++; } },
    ItemTreeManager: { refreshColumns() {} }
  };
  try {
    tracker.register();
    onToolbar({ reader });
    onToolbar({ reader });
    await new Promise(resolve => setImmediate(resolve));
    await tracker.flushPending();
    const data = store.getData(parent);
    assert.equal(resolveReadingStatus(data).status, 'reading');
    assert.equal(data.s, null);
    assert.equal(data.v, 6);
    assert.ok(data.snapshotOpenedAt! > 0);
    assert.equal(saves, 1);
    assert.equal(refreshes, 1);
    assert.deepEqual(data.p, {});
    assert.equal(data.lastPage, null);
    assert.equal(getLastActivityAt(data), null);
    assert.equal(data.history, undefined);
    assert.equal(data.readingStartedAt, undefined);
    assert.ok(extra.startsWith('Custom: keep\n'));
  } finally { tracker.unregister(); (globalThis as any).Zotero = original; }
});

function memoryItem(initial: any = null) {
  let extra = initial ? `Custom: keep\nReadingFlow: ${JSON.stringify(initial)}` : 'Custom: keep';
  return { id: 21, getField: () => extra, setField: (_: string, value: string) => { extra = value; }, saveTx: async () => {} };
}

for (const manual of ['to-read', 'reading', 'skimmed', 'read'] as const) {
  test(`snapshot opening preserves manual ${manual}, bookmarks, PDF history and explicit start`, async () => {
    const store = new DataStore(), item = memoryItem();
    await store.setStatus(item, 'reading', 100);
    await store.setStatus(item, manual, 200);
    await store.setImportant(item, true, 250);
    await store.setReadingBookmark(item, { attachmentKey: 'AAAABBBB', page: 3, pageCount: 10, at: 260 });
    await store.recordProgress(item, { attachmentId: 'key:AAAABBBB', progress: .8, lastPage: 8, pageCount: 10, at: 300 });
    const before = store.getData(item);
    assert.equal(await store.recordSnapshotOpening(item, 400), true);
    const after = new DataStore().getData(item);
    assert.equal(resolveReadingStatus(after).status, manual);
    assert.equal(after.snapshotOpenedAt, 400);
    for (const field of ['p', 'pageCount', 'bookmark', 'readingStartedAt', 'lastAttachmentId', 'lastPage', 'lastReadAt', 'history', 'important'] as const) {
      assert.deepEqual(after[field], before[field], field);
    }
    await store.clearManualStatus(item);
    await store.resetProgress(item);
    await store.setReadingBookmark(item, null);
    assert.equal(resolveReadingStatus(store.getData(item)).status, 'reading');
    assert.equal(store.getData(item).snapshotOpenedAt, 400);
    assert.equal(store.getData(item).v, 6);
    assert.ok(item.getField().startsWith('Custom: keep\n'));
  });
}

test('snapshot-only items remain tracked through manual edits without inflating PDF statistics', async () => {
  const item = memoryItem(), store = new DataStore();
  await store.recordSnapshotOpening(item, 100);
  await store.setStatus(item, 'to-read', 200);
  await store.clearManualStatus(item);
  const reloaded = new DataStore();
  assert.equal(reloaded.hasReadingFlowData(item), true);
  assert.equal(resolveReadingStatus(reloaded.getData(item)).status, 'reading');
  const stats = calculateStatisticsSnapshot([{ id: item.id, title: 'Snapshot', flowData: reloaded.getData(item), tracked: true }]);
  assert.equal(stats.statusCounts.reading, 1);
  assert.equal(stats.read, 0);
  assert.equal(stats.knownRemainingPages, 0);
  assert.equal(stats.history.lifetime.activeDays, 0);
  assert.equal(stats.history.recentProgress.length, 0);
});

test('snapshot timestamps never move backwards and mixed queued PDF/status edits retain v6', async () => {
  const item = memoryItem(), store = new DataStore();
  await Promise.all([
    store.recordSnapshotOpening(item, 500), store.recordSnapshotOpening(item, 400),
    store.recordProgress(item, { attachmentId: 'key:AAAABBBB', progress: .6, pageCount: 10, lastPage: 6, at: 600 }),
    store.setStatus(item, 'reading', 700)
  ]);
  assert.equal(store.getData(item).snapshotOpenedAt, 500);
  assert.equal(store.getData(item).readingStartedAt, 700);
  assert.equal(store.getData(item).v, 6);
  assert.equal(store.getData(item).lastPage, 6);
  assert.equal(await store.recordSnapshotOpening(item, 800), true);
  assert.equal(await store.recordSnapshotOpening(item, 800), false);
});

test('snapshot writes reject invalid times and preserve unsupported, malformed and read-only records', async () => {
  for (const at of [0, -1, NaN, Infinity]) {
    const item = memoryItem();
    assert.equal(await new DataStore().recordSnapshotOpening(item, at), false);
    assert.equal(item.getField(), 'Custom: keep');
  }
  for (const payload of [{ v: 99, important: false }, { v: 6, important: false, snapshotOpenedAt: '100' },
    { v: 6, important: false, snapshotOpenedAt: null }, { v: 5, important: false, snapshotOpenedAt: 100 }]) {
    const item = memoryItem(payload), original = item.getField(), store = new DataStore();
    assert.equal(await store.recordSnapshotOpening(item, 900), false);
    assert.equal(store.getData(item).availability, 'unavailable');
    assert.equal(item.getField(), original);
  }
  const readonly = Object.assign(memoryItem(), { isEditable: () => false });
  assert.equal(await new DataStore().recordSnapshotOpening(readonly, 100), false);
  assert.equal(readonly.getField(), 'Custom: keep');
});

for (const scenario of ['closed-before-init', 'disabled-before-init', 'epub', 'standalone', 'closed-after-init', 'shutdown'] as const) {
  test(`snapshot reader lifecycle: ${scenario}`, async () => {
    const original = (globalThis as any).Zotero, originalServices = (globalThis as any).Services;
    let init!: () => void;
    const item = memoryItem(), store = new DataStore(), tracker = new ReaderTracker(store);
    const reader = { itemID: 10, _type: scenario === 'epub' ? 'epub' : 'snapshot',
      _initPromise: new Promise<void>(resolve => { init = resolve; }) };
    const readers = [reader]; let onToolbar!: (event: any) => void;
    (globalThis as any).Services = { startup: { shuttingDown: false } };
    (globalThis as any).Zotero = {
      Reader: { _readers: readers, registerEventListener: (_: string, listener: any) => { onToolbar = listener; }, unregisterEventListener() {} },
      Items: { get: () => ({ parentID: scenario === 'standalone' ? null : item.id }), getAsync: async () => item },
      Notifier: { registerObserver: () => 'snapshot', unregisterObserver() {}, trigger() {} }, ItemTreeManager: { refreshColumns() {} }
    };
    try {
      tracker.register(); onToolbar({ reader });
      if (scenario === 'closed-before-init') readers.splice(0);
      if (scenario === 'disabled-before-init') tracker.unregister();
      init(); await new Promise(resolve => setImmediate(resolve));
      if (scenario === 'closed-after-init') readers.splice(0);
      if (scenario === 'shutdown') (globalThis as any).Services.startup.shuttingDown = true;
      await tracker.flushPending();
      const recorded = scenario === 'closed-after-init' || scenario === 'shutdown';
      assert.equal(resolveReadingStatus(store.getData(item)).status, recorded ? 'reading' : 'unassigned');
      assert.equal(store.getData(item).s, null);
    } finally { tracker.unregister(); (globalThis as any).Zotero = original; (globalThis as any).Services = originalServices; }
  });
}

for (const activation of ['foreground', 'background', 'restore', 'restored-not-yet-selected'] as const) {
  test(`only foreground snapshot activity advances the default (${activation})`, async () => {
    const old = (globalThis as any).Zotero;
    const parent = memoryItem();
    const store = new DataStore(), tracker = new ReaderTracker(store);
    const data = { itemID: 10 };
    const tabs = { selectedID: activation === 'background' ? 'library' : 'snapshot', _getTab: () => ({ tab: { data } }) };
    const reader = { itemID: 10, tabID: 'snapshot', _type: 'snapshot', _window: { Zotero_Tabs: tabs }, _initPromise: Promise.resolve() };
    let toolbar!: (event: any) => void;
    (globalThis as any).Zotero = {
      Session: { state: { windows: [{ type: 'pane', tabs: [
        { type: 'reader', selected: activation === 'restore', data }
      ] }] } },
      Reader: { _readers: [reader], registerEventListener(_: string, fn: typeof toolbar) { toolbar = fn; }, unregisterEventListener() {} },
      Items: { get: () => ({ parentID: parent.id }), getAsync: async () => parent },
      Notifier: { registerObserver: () => 'tracker', unregisterObserver() {}, trigger() {} },
      ItemTreeManager: { refreshColumns() {} }
    };
    try {
      await store.initializeStatusIfUnowned(parent, 'to-read');
      tracker.register(activation.startsWith('restore'));
      toolbar({ reader });
      await new Promise(resolve => setImmediate(resolve));
      await tracker.flushPending();
      const autoAdvance = activation !== 'background' && activation !== 'restore';
      const loaded = store.getData(parent);
      assert.ok(loaded.snapshotOpenedAt);
      assert.equal(resolveReadingStatus(loaded).status, autoAdvance ? 'reading' : 'to-read');
      if (!autoAdvance) {
        tabs.selectedID = 'snapshot';
        tracker.notify('select', 'tab', ['snapshot']);
        await tracker.flushPending();
        assert.equal(resolveReadingStatus(store.getData(parent)).status, 'reading');
      }
    } finally { tracker.unregister(); (globalThis as any).Zotero = old; }
  });
}
