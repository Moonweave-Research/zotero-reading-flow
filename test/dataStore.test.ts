import test from 'node:test';
import assert from 'node:assert/strict';
import { DataStore } from '../src/dataStore';
import { FLOW_PREFIX, getLocalDayKey } from '../src/flowData';

function memoryItem(id: number, initialExtra = '') {
  let extra = initialExtra;
  let saves = 0;
  return {
    id,
    getField(fieldName: string) {
      assert.equal(fieldName, 'extra');
      return extra;
    },
    setField(fieldName: string, value: string) {
      assert.equal(fieldName, 'extra');
      extra = value;
    },
    async saveTx() {
      saves += 1;
    },
    getExtra() {
      return extra;
    },
    getSaveCount() {
      return saves;
    }
  };
}

function readFlowLine(extra: string) {
  const line = extra.split('\n').find((value) => value.startsWith(FLOW_PREFIX));
  assert.ok(line);
  return JSON.parse(line.slice(FLOW_PREFIX.length));
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function controlledSaveItem(id: number, initialExtra = '') {
  let extra = initialExtra;
  const saves: Array<ReturnType<typeof deferred<void>> & { attemptedExtra: string }> = [];
  return {
    id,
    getField(fieldName: string) {
      assert.equal(fieldName, 'extra');
      return extra;
    },
    setField(fieldName: string, value: string) {
      assert.equal(fieldName, 'extra');
      extra = value;
    },
    saveTx() {
      const gate = { ...deferred<void>(), attemptedExtra: extra };
      saves.push(gate);
      return gate.promise;
    },
    getExtra() {
      return extra;
    },
    setExtra(value: string) {
      extra = value;
    },
    saves
  };
}

async function waitForSaveCount(item: { saves: unknown[] }, count: number) {
  for (let attempt = 0; attempt < 20 && item.saves.length < count; attempt++) {
    await Promise.resolve();
  }
  assert.equal(item.saves.length, count);
}

test('hasReadingFlowData distinguishes valid metadata from defaults and malformed lines', () => {
  const store = new DataStore();

  assert.equal(store.hasReadingFlowData(memoryItem(10)), false);
  assert.equal(store.hasReadingFlowData(memoryItem(11, `${FLOW_PREFIX}{bad json`)), false);
  assert.equal(store.hasReadingFlowData(memoryItem(12, `${FLOW_PREFIX}{"p":{},"s":"to-read"}`)), false);
  assert.equal(store.hasReadingFlowData(memoryItem(13, `${FLOW_PREFIX}{"v":1,"p":{},"s":"to-read"}`)), true);
  assert.equal(store.hasReadingFlowData(memoryItem(14, `${FLOW_PREFIX}{"v":2,"p":{},"history":{"startedAt":1,"days":{}}}`)), true);
});

test('updateData does not keep optimistic cache state when saveTx fails', async () => {
  let extra = '';
  const item = {
    id: 1,
    getField(fieldName: string) {
      assert.equal(fieldName, 'extra');
      return extra;
    },
    setField(fieldName: string, value: string) {
      assert.equal(fieldName, 'extra');
      extra = value;
    },
    async saveTx() {
      throw new Error('save failed');
    }
  };
  const store = new DataStore();

  assert.equal(store.getData(item).s, null);
  await assert.rejects(store.setStatus(item, 'read'), /save failed/);

  assert.equal(store.getData(item).s, null);
  assert.equal(extra, '');
});

test('updateData retries a temporarily dirty item instead of losing the update', async () => {
  let extra = '';
  let dirtyChecks = 0;
  let saves = 0;
  const item = {
    id: 2,
    isDirty() {
      dirtyChecks += 1;
      return dirtyChecks === 1;
    },
    getField(fieldName: string) {
      assert.equal(fieldName, 'extra');
      return extra;
    },
    setField(fieldName: string, value: string) {
      assert.equal(fieldName, 'extra');
      extra = value;
    },
    async saveTx() {
      saves += 1;
    }
  };
  const store = new DataStore();

  assert.equal(await store.updateData(item, { s: 'reading' }), true);
  assert.equal(saves, 1);
  assert.equal(store.getData(item).s, 'reading');
});

test('recordProgress writes v2 history in one save and preserves unrelated Extra lines', async () => {
  const item = memoryItem(3, `Custom: keep\n${FLOW_PREFIX}{"v":1,"p":{},"s":null}`);
  const store = new DataStore();
  const at = Date.parse('2026-07-28T12:00:00Z');

  assert.equal(await store.recordProgress(item, {
    attachmentId: '10',
    progress: 0.5,
    pageCount: 10,
    lastPage: 5,
    at
  }), true);

  const saved = readFlowLine(item.getExtra());
  const day = saved.history.days[getLocalDayKey(at)];
  assert.equal(item.getSaveCount(), 1);
  assert.match(item.getExtra(), /Custom: keep/);
  assert.equal(saved.v, 2);
  assert.equal(saved.p['10'], 0.5);
  assert.equal(saved.history.startedAt, at);
  assert.deepEqual(day.progress, { '10': 0.5 });
  assert.equal(day.activity, true);
  assert.equal(day.status, 'reading');
  assert.equal(saved.history.activeDaysTotal, 1);
});

test('same-item attachment progress writes serialize and preserve their union', async () => {
  const item = controlledSaveItem(30);
  const store = new DataStore();

  const first = store.recordProgress(item, { attachmentId: '10', progress: 0.4, at: 100 });
  const second = store.recordProgress(item, { attachmentId: '11', progress: 0.7, at: 200 });

  await waitForSaveCount(item, 1);
  item.saves[0].resolve();
  await waitForSaveCount(item, 2);
  item.saves[1].resolve();
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.deepEqual(readFlowLine(item.getExtra()).p, { '10': 0.4, '11': 0.7 });
});

test('same-item progress and status writes serialize and preserve their union', async () => {
  const item = controlledSaveItem(31);
  const store = new DataStore();

  const progress = store.recordProgress(item, { attachmentId: '10', progress: 0.4, at: 100 });
  const status = store.setStatus(item, 'skimmed', 200);

  await waitForSaveCount(item, 1);
  item.saves[0].resolve();
  await waitForSaveCount(item, 2);
  item.saves[1].resolve();
  await progress;
  await status;
  const saved = readFlowLine(item.getExtra());
  assert.equal(saved.p['10'], 0.4);
  assert.equal(saved.s, 'skimmed');
});

test('a failed same-item write does not poison the mutation queue', async () => {
  const item = controlledSaveItem(32);
  const store = new DataStore();

  const first = store.setStatus(item, 'reading', 100);
  const firstRejected = assert.rejects(first, /first failed/);
  const second = store.setStatus(item, 'skimmed', 200);

  await waitForSaveCount(item, 1);
  item.saves[0].reject(new Error('first failed'));
  await firstRejected;
  await waitForSaveCount(item, 2);
  item.saves[1].resolve();
  await second;
  assert.equal(readFlowLine(item.getExtra()).s, 'skimmed');
});

test('failed rollback preserves newer Extra and the next mutation composes from it', async () => {
  const item = controlledSaveItem(33);
  const store = new DataStore();
  const externalExtra = `External: keep\n${FLOW_PREFIX}{"v":1,"p":{"99":0.8},"s":null}`;

  const first = store.setStatus(item, 'reading', 100);
  const firstRejected = assert.rejects(first, /first failed/);
  const second = store.recordProgress(item, { attachmentId: '10', progress: 0.4, at: 200 });

  await waitForSaveCount(item, 1);
  item.setExtra(externalExtra);
  item.saves[0].reject(new Error('first failed'));
  await firstRejected;
  await waitForSaveCount(item, 2);
  item.saves[1].resolve();
  await second;
  const saved = readFlowLine(item.getExtra());
  assert.match(item.getExtra(), /External: keep/);
  assert.deepEqual(saved.p, { '10': 0.4, '99': 0.8 });
});

test('mutations bypass stale LRU data and make no-op decisions from current Extra', async () => {
  const item = controlledSaveItem(34);
  const store = new DataStore();
  assert.equal(store.getData(item).s, null);
  item.setExtra(`${FLOW_PREFIX}{"v":1,"p":{},"s":"reading"}`);

  assert.equal(await store.updateData(item, { s: 'reading' }), false);
  assert.equal(item.saves.length, 0);
  assert.equal(readFlowLine(item.getExtra()).s, 'reading');
});

test('close lets an in-flight save settle and skips queued same-item work', async () => {
  const item = controlledSaveItem(35);
  const store = new DataStore();

  const first = store.setStatus(item, 'reading', 100);
  const second = store.setStatus(item, 'skimmed', 200);
  await waitForSaveCount(item, 1);
  store.close();
  item.saves[0].resolve();

  await first;
  await second;
  assert.equal(item.saves.length, 1);
  assert.equal(readFlowLine(item.getExtra()).s, 'reading');
});

test('different parent item IDs can save concurrently', async () => {
  const firstItem = controlledSaveItem(36);
  const secondItem = controlledSaveItem(37);
  const store = new DataStore();

  const first = store.setStatus(firstItem, 'reading', 100);
  const second = store.setStatus(secondItem, 'skimmed', 200);
  await waitForSaveCount(firstItem, 1);
  await waitForSaveCount(secondItem, 1);

  firstItem.saves[0].resolve();
  secondItem.saves[0].resolve();
  await Promise.all([first, second]);
  assert.equal(readFlowLine(firstItem.getExtra()).s, 'reading');
  assert.equal(readFlowLine(secondItem.getExtra()).s, 'skimmed');
});

test('recordProgress keeps the maximum progress and counts an active day once', async () => {
  const item = memoryItem(4);
  const store = new DataStore();
  const firstAt = Date.parse('2026-07-28T09:00:00Z');
  const secondAt = Date.parse('2026-07-28T11:00:00Z');

  await store.recordProgress(item, { attachmentId: '10', progress: 0.6, at: firstAt });
  await store.recordProgress(item, { attachmentId: '10', progress: 0.2, at: secondAt });

  const saved = readFlowLine(item.getExtra());
  const day = saved.history.days[getLocalDayKey(firstAt)];
  assert.equal(saved.p['10'], 0.6);
  assert.equal(day.progress['10'], 0.6);
  assert.equal(day.lastReadAt, secondAt);
  assert.equal(saved.history.activeDaysTotal, 1);
  assert.equal(item.getSaveCount(), 2);
});

test('recordProgress advances legacy page progress when a page count makes the new fraction comparable', async () => {
  const item = memoryItem(41, `${FLOW_PREFIX}${JSON.stringify({
    v: 1,
    p: { '10': 5 },
    pageCount: { '10': 10 },
    s: null
  })}`);
  const store = new DataStore();
  const at = Date.parse('2026-07-28T12:00:00Z');

  await store.recordProgress(item, {
    attachmentId: '10',
    progress: 0.6,
    pageCount: 10,
    at
  });

  const saved = readFlowLine(item.getExtra());
  assert.equal(saved.p['10'], 0.6);
  assert.equal(saved.history.days[getLocalDayKey(at)].progress['10'], 0.6);
});

test('recordProgress keeps a legacy page value when the new observation is behind it but normalizes history', async () => {
  const item = memoryItem(42, `${FLOW_PREFIX}${JSON.stringify({
    v: 1,
    p: { '10': 5 },
    pageCount: { '10': 10 },
    s: null
  })}`);
  const store = new DataStore();
  const at = Date.parse('2026-07-28T12:00:00Z');

  await store.recordProgress(item, {
    attachmentId: '10',
    progress: 0.4,
    pageCount: 10,
    at
  });

  const saved = readFlowLine(item.getExtra());
  assert.equal(saved.p['10'], 5);
  assert.equal(saved.history.days[getLocalDayKey(at)].progress['10'], 0.5);
});

test('setStatus records prospective completion without inventing activity', async () => {
  const item = memoryItem(5, `${FLOW_PREFIX}{"v":1,"p":{},"s":null}`);
  const store = new DataStore();
  const at = Date.parse('2026-07-28T12:00:00Z');

  await store.setStatus(item, 'read', at);

  const saved = readFlowLine(item.getExtra());
  const day = saved.history.days[getLocalDayKey(at)];
  assert.equal(saved.s, 'read');
  assert.equal(saved.history.completedAt, at);
  assert.equal(saved.history.activeDaysTotal, 0);
  assert.equal(day.activity, false);
  assert.equal(day.status, 'read');
  assert.equal(day.completed, true);
});

test('a successfully persisted reset suppresses stale queued progress', async () => {
  const item = controlledSaveItem(63);
  const store = new DataStore();

  const reset = store.resetProgress(item, 2000);
  const progress = store.recordProgressUnlessResetAfter(
    item,
    { attachmentId: '10', progress: 0.5, at: 1000 },
    1000
  );

  assert.equal(store.getResetTimestamp(item.id), null);
  await waitForSaveCount(item, 1);
  item.saves[0].resolve();
  await reset;

  assert.equal(store.getResetTimestamp(item.id), 2000);
  assert.equal(await progress, false);
  assert.equal(item.saves.length, 1);
  assert.deepEqual(readFlowLine(item.getExtra()).p, {});
});

test('a failed reset allows stale queued progress to persist', async () => {
  const item = controlledSaveItem(64);
  const store = new DataStore();

  const reset = store.resetProgress(item, 2000);
  const resetRejected = assert.rejects(reset, /reset failed/);
  const progress = store.recordProgressUnlessResetAfter(
    item,
    { attachmentId: '10', progress: 0.5, at: 1000 },
    1000
  );

  await waitForSaveCount(item, 1);
  item.saves[0].reject(new Error('reset failed'));
  await resetRejected;
  await waitForSaveCount(item, 2);
  item.saves[1].resolve();

  assert.equal(await progress, true);
  assert.equal(store.getResetTimestamp(item.id), null);
  assert.equal(readFlowLine(item.getExtra()).p['10'], 0.5);
});

test('a dirty skipped reset allows queued progress once the item is clean', async () => {
  const item = controlledSaveItem(65);
  let dirtyChecks = 0;
  (item as any).isDirty = () => dirtyChecks++ < 3;
  const store = new DataStore();
  (store as any).delay = async () => {};

  const reset = store.resetProgress(item, 2000);
  const progress = store.recordProgressUnlessResetAfter(
    item,
    { attachmentId: '10', progress: 0.5, at: 1000 },
    1000
  );

  await reset;
  await waitForSaveCount(item, 1);
  item.saves[0].resolve();
  assert.equal(await progress, true);
  assert.equal(store.getResetTimestamp(item.id), null);
});

test('a no-op reset leaves no cutoff and allows queued progress', async () => {
  const item = memoryItem(66);
  const store = new DataStore();
  await store.resetProgress(item, 2000);
  store.clearCache(item.id);

  await store.resetProgress(item, 2000);
  assert.equal(store.getResetTimestamp(item.id), null);
  assert.equal(await store.recordProgressUnlessResetAfter(
    item,
    { attachmentId: '10', progress: 0.5, at: 1000 },
    1000
  ), true);
  assert.equal(readFlowLine(item.getExtra()).p['10'], 0.5);
});

test('conditional progress queued before a later reset is persisted then cleared', async () => {
  const item = controlledSaveItem(67);
  const store = new DataStore();

  const progress = store.recordProgressUnlessResetAfter(
    item,
    { attachmentId: '10', progress: 0.5, at: 1000 },
    1000
  );
  const reset = store.resetProgress(item, 2000);

  await waitForSaveCount(item, 1);
  item.saves[0].resolve();
  await waitForSaveCount(item, 2);
  item.saves[1].resolve();
  assert.equal(await progress, true);
  await reset;
  assert.deepEqual(readFlowLine(item.getExtra()).p, {});
  assert.equal(store.getResetTimestamp(item.id), 2000);
});

test('progress-reset-stale progress queue sequence ends reset and suppresses the stale write', async () => {
  const item = controlledSaveItem(68);
  const store = new DataStore();

  const first = store.recordProgressUnlessResetAfter(
    item,
    { attachmentId: '10', progress: 0.4, at: 1000 },
    1000
  );
  const reset = store.resetProgress(item, 2000);
  const stale = store.recordProgressUnlessResetAfter(
    item,
    { attachmentId: '10', progress: 0.8, at: 1500 },
    1500
  );

  await waitForSaveCount(item, 1);
  item.saves[0].resolve();
  await waitForSaveCount(item, 2);
  item.saves[1].resolve();
  assert.equal(await first, true);
  await reset;
  assert.equal(await stale, false);
  assert.equal(item.saves.length, 2);
  assert.deepEqual(readFlowLine(item.getExtra()).p, {});
});

test('a later failed reset preserves an earlier successful cutoff and allows newer captures', async () => {
  const item = controlledSaveItem(69);
  const store = new DataStore();

  const firstReset = store.resetProgress(item, 1000);
  await waitForSaveCount(item, 1);
  item.saves[0].resolve();
  await firstReset;

  const failedReset = store.resetProgress(item, 2000);
  const failedResetRejected = assert.rejects(failedReset, /later reset failed/);
  const progress = store.recordProgressUnlessResetAfter(
    item,
    { attachmentId: '10', progress: 0.5, at: 1500 },
    1500
  );
  await waitForSaveCount(item, 2);
  item.saves[1].reject(new Error('later reset failed'));
  await failedResetRejected;
  await waitForSaveCount(item, 3);
  item.saves[2].resolve();

  assert.equal(await progress, true);
  assert.equal(store.getResetTimestamp(item.id), 1000);
  assert.equal(readFlowLine(item.getExtra()).p['10'], 0.5);
});

test('multiple successful resets publish the latest successfully persisted timestamp', async () => {
  const item = controlledSaveItem(70);
  const store = new DataStore();

  const first = store.resetProgress(item, 1000);
  const second = store.resetProgress(item, 3000);
  await waitForSaveCount(item, 1);
  item.saves[0].resolve();
  await waitForSaveCount(item, 2);
  item.saves[1].resolve();
  await Promise.all([first, second]);

  assert.equal(store.getResetTimestamp(item.id), 3000);
});

test('a capture at the exact reset timestamp is not suppressed', async () => {
  const item = memoryItem(71);
  const store = new DataStore();
  await store.resetProgress(item, 2000);

  assert.equal(await store.recordProgressUnlessResetAfter(
    item,
    { attachmentId: '10', progress: 0.5, at: 2000 },
    2000
  ), true);
});

test('status mutations retain queue order around reset and stale progress', async () => {
  const item = controlledSaveItem(72);
  const store = new DataStore();

  const reset = store.resetProgress(item, 2000);
  const status = store.setStatus(item, 'skimmed', 3000);
  const stale = store.recordProgressUnlessResetAfter(
    item,
    { attachmentId: '10', progress: 0.5, at: 1000 },
    1000
  );
  await waitForSaveCount(item, 1);
  item.saves[0].resolve();
  await waitForSaveCount(item, 2);
  item.saves[1].resolve();
  await Promise.all([reset, status]);

  assert.equal(await stale, false);
  assert.equal(item.saves.length, 2);
  assert.equal(readFlowLine(item.getExtra()).s, 'skimmed');
});

test('close during an in-flight reset does not repopulate its timestamp and skips queued progress', async () => {
  const item = controlledSaveItem(73);
  const store = new DataStore();

  const reset = store.resetProgress(item, 2000);
  const progress = store.recordProgressUnlessResetAfter(
    item,
    { attachmentId: '10', progress: 0.5, at: 1000 },
    1000
  );
  await waitForSaveCount(item, 1);
  store.close();
  item.saves[0].resolve();
  await reset;

  assert.equal(store.getResetTimestamp(item.id), null);
  assert.equal(await progress, false);
  assert.equal(item.saves.length, 1);
});

test('same-day reset preserves the day progress maximum and activity rollup', async () => {
  const item = memoryItem(60);
  const store = new DataStore();
  const progressAt = Date.parse('2026-07-28T09:00:00Z');
  const resetAt = Date.parse('2026-07-28T12:00:00Z');

  await store.recordProgress(item, { attachmentId: '10', progress: 0.6, at: progressAt });
  await store.resetProgress(item, resetAt);

  const saved = readFlowLine(item.getExtra());
  const day = saved.history.days[getLocalDayKey(resetAt)];
  assert.deepEqual(saved.p, {});
  assert.deepEqual(day.progress, { '10': 0.6 });
  assert.equal(day.activity, true);
  assert.equal(day.lastReadAt, progressAt);
  assert.equal(day.status, 'to-read');
  assert.equal(day.reset, true);
  assert.equal(saved.history.activeDaysTotal, 1);
});

test('progress after a same-day reset updates current progress without lowering day history', async () => {
  const item = memoryItem(61);
  const store = new DataStore();
  const firstAt = Date.parse('2026-07-28T09:00:00Z');
  const resetAt = Date.parse('2026-07-28T10:00:00Z');
  const secondAt = Date.parse('2026-07-28T11:00:00Z');

  await store.recordProgress(item, { attachmentId: '10', progress: 0.6, at: firstAt });
  await store.resetProgress(item, resetAt);
  await store.recordProgress(item, { attachmentId: '10', progress: 0.2, at: secondAt });

  const saved = readFlowLine(item.getExtra());
  const day = saved.history.days[getLocalDayKey(secondAt)];
  assert.equal(saved.p['10'], 0.2);
  assert.equal(day.progress['10'], 0.6);
  assert.equal(day.reset, true);
  assert.equal(saved.history.activeDaysTotal, 1);
});

test('a reset-only day remains non-active', async () => {
  const item = memoryItem(62);
  const store = new DataStore();
  const resetAt = Date.parse('2026-07-28T12:00:00Z');

  await store.resetProgress(item, resetAt);

  const saved = readFlowLine(item.getExtra());
  const day = saved.history.days[getLocalDayKey(resetAt)];
  assert.equal(day.activity, false);
  assert.equal(day.lastReadAt, null);
  assert.deepEqual(day.progress, {});
  assert.equal(day.reset, true);
  assert.equal(saved.history.activeDaysTotal, 0);
});

test('reset clears current progress but preserves first completion and history', async () => {
  const item = memoryItem(6);
  const store = new DataStore();
  const completedAt = Date.parse('2026-07-27T12:00:00Z');
  const resetAt = Date.parse('2026-07-28T12:00:00Z');

  await store.setStatus(item, 'read', completedAt);
  await store.resetProgress(item, resetAt);

  const saved = readFlowLine(item.getExtra());
  const resetDay = saved.history.days[getLocalDayKey(resetAt)];
  assert.equal(saved.v, 2);
  assert.equal(saved.p && Object.keys(saved.p).length, 0);
  assert.equal(saved.s, 'to-read');
  assert.equal(saved.history.completedAt, completedAt);
  assert.equal(resetDay.reset, true);
  assert.equal(resetDay.status, 'to-read');
  assert.deepEqual(resetDay.progress, {});
  assert.equal(Object.keys(saved.history.days).length, 2);
});

test('successful history writes prune days outside the 366-day retention window', async () => {
  const initial = {
    v: 2,
    p: {},
    s: null,
    history: {
      startedAt: Date.parse('2024-01-01T00:00:00Z'),
      completedAt: null,
      activeDaysTotal: 2,
      days: {
        '2024-01-01': { activity: true, lastReadAt: 1, progress: { '10': 0.1 }, status: 'reading', reset: false, completed: false },
        '2026-07-28': { activity: true, lastReadAt: 2, progress: { '10': 0.2 }, status: 'reading', reset: false, completed: false }
      }
    }
  };
  const item = memoryItem(7, `${FLOW_PREFIX}${JSON.stringify(initial)}`);
  const store = new DataStore();
  const at = Date.parse('2026-07-28T12:00:00Z');

  await store.recordProgress(item, { attachmentId: '11', progress: 0.3, at });

  const saved = readFlowLine(item.getExtra());
  assert.equal(saved.history.days['2024-01-01'], undefined);
  assert.ok(Object.keys(saved.history.days).length <= 366);
  assert.equal(saved.history.activeDaysTotal, 2);
});

test('malformed history is dropped on read and rebuilt on the next transition', async () => {
  const item = memoryItem(8, `${FLOW_PREFIX}{"v":2,"p":{"10":0.4},"history":{"startedAt":"bad","days":{}}}`);
  const store = new DataStore();
  const at = Date.parse('2026-07-28T12:00:00Z');

  assert.equal(store.getData(item).history, undefined);
  await store.setStatus(item, 'skimmed', at);

  const saved = readFlowLine(item.getExtra());
  assert.equal(saved.v, 2);
  assert.equal(saved.p['10'], 0.4);
  assert.equal(saved.history.startedAt, at);
  assert.equal(saved.history.days[getLocalDayKey(at)].status, 'skimmed');
});

test('historical transition writes are skipped during shutdown', async () => {
  const item = memoryItem(9);
  const store = new DataStore();
  const previousServices = (globalThis as any).Services;
  (globalThis as any).Services = { startup: { shuttingDown: true } };

  try {
    assert.equal(await store.recordProgress(item, { attachmentId: '10', progress: 0.5, at: 100 }), false);
    assert.equal(item.getSaveCount(), 0);
    assert.equal(item.getExtra(), '');
  } finally {
    (globalThis as any).Services = previousServices;
  }
});
