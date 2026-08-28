import test from 'node:test';
import assert from 'node:assert/strict';
import { Bootstrap, createDashboardBridge, runWhenUIReady } from '../src/bootstrap';
import { DEFAULT_FLOW_DATA, type FlowData } from '../src/flowData';
import type { ScopeItem } from '../src/statisticsScope';

const DAY = '2026-07-28';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function item(id: number, title: string, progress: number): ScopeItem & { flowData: FlowData } {
  return {
    id,
    getField: () => title,
    flowData: {
      ...DEFAULT_FLOW_DATA,
      v: 2,
      p: { attachment: progress },
      s: 'reading',
      history: {
        startedAt: 1,
        completedAt: null,
        activeDaysTotal: 1,
        days: {
          [DAY]: {
            activity: true,
            lastReadAt: 1,
            progress: { attachment: progress },
            status: 'reading',
            reset: false,
            completed: false
          }
        }
      }
    }
  };
}

function bridgeFixture() {
  const requests: Array<ReturnType<typeof deferred<ScopeItem[]>>> = [];
  const bridge = createDashboardBridge({
    scopeAdapter: {
      getItems() {
        const request = deferred<ScopeItem[]>();
        requests.push(request);
        return request.promise;
      }
    },
    dataStore: {
      hasReadingFlowData() { return true; },
      getData(candidate) {
        return (candidate as ScopeItem & { flowData: FlowData }).flowData;
      }
    },
    resumeReader: { async resume() { return false; } }
  });
  return { bridge, requests };
}

test('UI-bound registration waits for Zotero UI readiness without blocking plugin startup', async () => {
  const ready = deferred<void>();
  const calls: string[] = [];

  const scheduled = runWhenUIReady({ uiReadyPromise: ready.promise }, async () => {
    calls.push('registered');
  });

  assert.deepEqual(calls, []);
  ready.resolve();
  await scheduled;
  assert.deepEqual(calls, ['registered']);
});

test('UI-bound registration runs immediately when the runtime has no readiness promise', async () => {
  const calls: string[] = [];
  await runWhenUIReady({}, () => { calls.push('registered'); });
  assert.deepEqual(calls, ['registered']);
});

test('UI-bound registration waits for the mounted main item tree when its view exists', async () => {
  const callbacks: Array<() => void> = [];
  const itemsView: { tree: object | null } = { tree: null };
  const runtime = {
    uiReadyPromise: Promise.resolve(),
    getActiveZoteroPane: () => ({ itemsView }),
    getMainWindow: () => ({ setTimeout(callback: () => void) { callbacks.push(callback); } })
  };
  const calls: string[] = [];

  const scheduled = runWhenUIReady(runtime, () => { calls.push('registered'); });
  await Promise.resolve();
  assert.deepEqual(calls, []);
  assert.equal(callbacks.length, 1);

  itemsView.tree = {};
  callbacks.shift()?.();
  await scheduled;
  assert.deepEqual(calls, ['registered']);
});

test('shutdown flushes pending reader progress before unregistering and closing the store', async () => {
  const events: string[] = [];
  const originalZotero = (globalThis as any).Zotero;
  const bootstrap = new Bootstrap();
  bootstrap.dataStore = { close() { events.push('close'); } } as any;
  (bootstrap as any).readerTracker = {
    async flushPending() { events.push('flush'); },
    unregister() { events.push('unregister'); }
  };
  (bootstrap as any).styleManager = { unregister() { events.push('style'); } };
  (globalThis as any).Zotero = {};

  try {
    await bootstrap.shutdown();
    assert.deepEqual(events.slice(0, 3), ['flush', 'unregister', 'close']);
  } finally {
    (globalThis as any).Zotero = originalZotero;
  }
});

test('activity-day cache remains owned by the latest issued snapshot when an older request resolves last', async () => {
  const { bridge, requests } = bridgeFixture();
  const lifecycle = bridge.beginActivityDayDetailCacheLifecycle();
  const older = bridge.getSnapshot('current-view', 'all-time');
  const newer = bridge.getSnapshot('entire-library', 'all-time');

  requests[1].resolve([item(2, 'Newer paper', 0.7)]);
  const newerSnapshot = await newer;
  requests[0].resolve([item(1, 'Older paper', 0.3)]);
  const olderSnapshot = await older;

  assert.equal(
    (await bridge.getActivityDayDetail(newerSnapshot.snapshotId!, DAY)).state,
    'available'
  );
  assert.deepEqual(
    await bridge.getActivityDayDetail(olderSnapshot.snapshotId!, DAY),
    { snapshotId: olderSnapshot.snapshotId, day: DAY, state: 'unavailable' }
  );
  bridge.discardActivityDayDetailCache(lifecycle);
});

test('a failed latest snapshot prevents an older pending success from replacing the established cache', async () => {
  const { bridge, requests } = bridgeFixture();
  bridge.beginActivityDayDetailCacheLifecycle();

  const establishedRequest = bridge.getSnapshot('current-view', 'all-time');
  requests[0].resolve([item(10, 'Established paper', 0.5)]);
  const establishedSnapshot = await establishedRequest;

  const older = bridge.getSnapshot('current-view', 'all-time');
  const latest = bridge.getSnapshot('entire-library', 'all-time');
  requests[2].reject(new Error('latest request failed'));
  await assert.rejects(latest, /latest request failed/);
  requests[1].resolve([item(11, 'Older pending paper', 0.6)]);
  const olderSnapshot = await older;

  assert.equal(
    (await bridge.getActivityDayDetail(establishedSnapshot.snapshotId!, DAY)).state,
    'available'
  );
  assert.equal(
    (await bridge.getActivityDayDetail(olderSnapshot.snapshotId!, DAY)).state,
    'unavailable'
  );
});

test('a snapshot from an older lifecycle cannot replace the newer lifecycle cache', async () => {
  const { bridge, requests } = bridgeFixture();
  bridge.beginActivityDayDetailCacheLifecycle();
  const lifecycleOnePending = bridge.getSnapshot('current-view', 'all-time');

  bridge.beginActivityDayDetailCacheLifecycle();
  const lifecycleTwoRequest = bridge.getSnapshot('entire-library', 'all-time');
  requests[1].resolve([item(20, 'Lifecycle two paper', 0.8)]);
  const lifecycleTwoSnapshot = await lifecycleTwoRequest;

  requests[0].resolve([item(21, 'Lifecycle one paper', 0.2)]);
  const lifecycleOneSnapshot = await lifecycleOnePending;

  assert.equal(
    (await bridge.getActivityDayDetail(lifecycleTwoSnapshot.snapshotId!, DAY)).state,
    'available'
  );
  assert.equal(
    (await bridge.getActivityDayDetail(lifecycleOneSnapshot.snapshotId!, DAY)).state,
    'unavailable'
  );
});

test('discard clears only the matching current lifecycle cache', async () => {
  const { bridge, requests } = bridgeFixture();
  const lifecycleOne = bridge.beginActivityDayDetailCacheLifecycle();
  const firstRequest = bridge.getSnapshot('current-view', 'all-time');
  requests[0].resolve([item(30, 'Lifecycle one paper', 0.4)]);
  await firstRequest;

  const lifecycleTwo = bridge.beginActivityDayDetailCacheLifecycle();
  const secondRequest = bridge.getSnapshot('entire-library', 'all-time');
  requests[1].resolve([item(31, 'Lifecycle two paper', 0.9)]);
  const secondSnapshot = await secondRequest;

  bridge.discardActivityDayDetailCache(lifecycleOne);
  assert.equal(
    (await bridge.getActivityDayDetail(secondSnapshot.snapshotId!, DAY)).state,
    'available'
  );

  bridge.discardActivityDayDetailCache(lifecycleTwo);
  assert.equal(
    (await bridge.getActivityDayDetail(secondSnapshot.snapshotId!, DAY)).state,
    'unavailable'
  );
});
