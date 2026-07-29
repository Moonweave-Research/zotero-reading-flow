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
