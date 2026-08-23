import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ColumnManager, READING_FLOW_DISPLAY_PREF, sortReadingFlowValues } from '../src/columnManager';

function fakeDocument() {
  return {
    createElement(tag: string) {
      return {
        tagName: tag.toUpperCase(),
        children: [] as any[],
        style: { cssText: '' } as any,
        className: '',
        textContent: '',
        title: '',
        setAttribute(name: string, value: string) { (this as any)[name] = value; },
        appendChild(child: any) { this.children.push(child); return child; }
      } as any;
    }
  } as any as Document;
}

function setupZotero(pref?: string) {
  const configuredPref = arguments.length === 0 ? 'compact' : pref;
  const registrations: any[] = [];
  const prefWrites: any[] = [];
  const forbiddenCalls: string[] = [];
  let refreshes = 0;
  let refreshThis: unknown;
  let refreshFailure: Error | undefined;
  (globalThis as any).Zotero = {
    Prefs: {
      get(name: string) { return name === READING_FLOW_DISPLAY_PREF ? configuredPref : undefined; },
      set(name: string, value: unknown) { prefWrites.push([name, value]); }
    },
    ItemTreeManager: {
      registerColumn(options: any) { registrations.push(options); return `registered-${registrations.length}`; },
      refreshColumns() { refreshThis = this; refreshes++; if (refreshFailure) throw refreshFailure; },
      unregisterColumn() { forbiddenCalls.push('unregisterColumn'); },
      resetColumns() { forbiddenCalls.push('resetColumns'); }
    },
    debug() {}, logError() {}
  };
  return { registrations, prefWrites, forbiddenCalls, get refreshes() { return refreshes; }, get refreshThis() { return refreshThis; }, failRefresh(error: Error) { refreshFailure = error; } };
}

function dataStoreFor(data: any) { return { getData() { return data; } } as any; }

const flow = { s: 'reading', p: { a: 0.42 }, lastReadAt: 1700000000000, lastAttachmentId: 'a' };

test('registers one composite public column idempotently without touching layout APIs', async () => {
  const zotero = setupZotero();
  const manager = new ColumnManager(dataStoreFor(flow));
  await manager.register();
  await manager.register();
  const composite = zotero.registrations.find((entry) => entry.dataKey === 'readingFlowDisplay');
  assert.ok(composite);
  assert.equal(zotero.registrations.filter((entry) => entry.dataKey === 'readingFlowDisplay').length, 1);
  assert.equal(composite.pluginID, 'readingflow@moon.com');
  assert.equal(typeof composite.dataProvider, 'function');
  assert.equal(typeof composite.renderCell, 'function');
  assert.equal(composite.sortReverse, true);
  for (const dataKey of ['readingFlowProgress', 'readingFlowStatus', 'readingFlowLastRead']) {
    assert.deepEqual(zotero.registrations.find((entry) => entry.dataKey === dataKey)?.defaultIn, ['default']);
  }
  assert.equal(composite.defaultIn, undefined);
  assert.equal(zotero.registrations.length, 4);
  await manager.ensureColumnsVisibleOnFirstRun();
  manager.unregister();
  assert.deepEqual(zotero.forbiddenCalls, []);
});

test('clean default visibility keeps Detailed columns visible and composite hidden without layout writes', async () => {
  const zotero = setupZotero(undefined);
  const manager = new ColumnManager(dataStoreFor(flow));
  await manager.register();
  const visibilityGroup = 'default';
  const initialHidden = (entry: any) => !(entry.defaultIn && entry.defaultIn.includes(visibilityGroup));
  for (const dataKey of ['readingFlowProgress', 'readingFlowStatus', 'readingFlowLastRead']) {
    const entry = zotero.registrations.find((candidate) => candidate.dataKey === dataKey);
    assert.equal(initialHidden(entry), false);
    assert.deepEqual(entry.enabledTreeIDs, ['main']);
  }
  const composite = zotero.registrations.find((entry) => entry.dataKey === 'readingFlowDisplay');
  assert.equal(initialHidden(composite), true);
  assert.deepEqual(zotero.prefWrites, [[READING_FLOW_DISPLAY_PREF, 'compact']]);
  assert.deepEqual(zotero.forbiddenCalls, []);
});

test('compact and icons render full accessible text while changing only composite DOM', async () => {
  const zotero = setupZotero('compact');
  const manager = new ColumnManager(dataStoreFor(flow));
  await manager.register();
  const column = zotero.registrations.find((entry) => entry.dataKey === 'readingFlowDisplay');
  const item = { id: 7, isRegularItem: () => true };
  const compact = column.renderCell(0, column.dataProvider(item), {}, false, fakeDocument());
  assert.match(compact.getAttribute?.('aria-label') ?? compact['aria-label'], /Reading, 42% read, last read/);
  assert.match(JSON.stringify(compact), /42%/);
  assert.equal(compact.children.length, 3);
  assert.equal(compact.children[1]['data-progress'], '42');
  (globalThis as any).Zotero.Prefs.get = () => 'icons';
  const icons = column.renderCell(0, column.dataProvider(item), {}, false, fakeDocument());
  assert.match(icons['aria-label'], /Reading, 42% read, last read/);
  assert.equal(icons.children.length, 1);
});

test('composite status icons use the approved eye-free mapping in both densities', async () => {
  const expected = {
    'to-read': '📙', reading: '📖', skimmed: '📘', read: '📗', important: '⭐'
  } as const;
  for (const [status, icon] of Object.entries(expected)) {
    const zotero = setupZotero('compact');
    const manager = new ColumnManager(dataStoreFor({ s: status, p: { a: 0.42 }, lastReadAt: 1700000000000, lastAttachmentId: 'a' }));
    await manager.register();
    const column = zotero.registrations.find((entry) => entry.dataKey === 'readingFlowDisplay');
    const compact = column.renderCell(0, column.dataProvider({ id: 8, isRegularItem: () => true }), {}, false, fakeDocument());
    assert.equal(compact.children[0].textContent, icon);
    assert.doesNotMatch(compact.children[0].textContent, /👁|👀/u);
    (globalThis as any).Zotero.Prefs.get = () => 'icons';
    const icons = column.renderCell(0, column.dataProvider({ id: 8, isRegularItem: () => true }), {}, false, fakeDocument());
    assert.equal(icons.children[0].textContent, icon);
    assert.equal(icons.children.length, 1);
    assert.equal(icons.title, icons['aria-label']);
  }
});

test('compact never-read To Read state renders one Not started phrase without unknown text', async () => {
  const zotero = setupZotero('compact');
  const manager = new ColumnManager(dataStoreFor({ s: 'to-read', p: {}, lastReadAt: null }));
  await manager.register();
  const column = zotero.registrations.find((entry) => entry.dataKey === 'readingFlowDisplay');
  const cell = column.renderCell(0, column.dataProvider({ id: 8, isRegularItem: () => true }), {}, false, fakeDocument());
  assert.equal(cell.children.length, 3);
  assert.equal(cell.children.filter((child: any) => child.textContent === 'Not started').length, 1);
  assert.equal(cell['aria-label'], 'To Read, not started, never read');
  assert.equal(cell.title, 'To Read, not started, never read');
  assert.doesNotMatch(JSON.stringify(cell), /unknown/i);
});

test('register initializes missing density to compact without layout writes', async () => {
  const zotero = setupZotero(undefined);
  const manager = new ColumnManager(dataStoreFor(flow));
  await manager.register();
  assert.deepEqual(zotero.prefWrites, [[READING_FLOW_DISPLAY_PREF, 'compact']]);
  assert.deepEqual(zotero.forbiddenCalls, []);
});

test('preserves Detailed renderer presentation independently of composite density', async () => {
  const zotero = setupZotero('icons');
  const originalGet = (globalThis as any).Zotero.Prefs.get;
  (globalThis as any).Zotero.Prefs.get = (name: string) => {
    if (name === 'extensions.readingflow.color-completed') return '#123456';
    if (name === 'extensions.readingflow.color-reading') return '#654321';
    return originalGet(name);
  };
  const manager = new ColumnManager(dataStoreFor(flow));
  await manager.register();
  const status = zotero.registrations.find((entry) => entry.dataKey === 'readingFlowStatus');
  const progress = zotero.registrations.find((entry) => entry.dataKey === 'readingFlowProgress');
  const lastRead = zotero.registrations.find((entry) => entry.dataKey === 'readingFlowLastRead');
  const statusCell = status.renderCell(0, 'reading', {}, false, fakeDocument());
  const progressCell = progress.renderCell(0, '0.42', {}, false, fakeDocument());
  const lastReadCell = lastRead.renderCell(0, '1700000000000', {}, false, fakeDocument());
  assert.match(statusCell.children[0].style.cssText, /#2563eb/);
  assert.match(JSON.stringify(progressCell), /#654321/);
  assert.ok(lastReadCell.title);
  assert.ok(lastReadCell.textContent);
});

test('other absent-progress states use plain non-technical wording without duplicate text', async () => {
  const zotero = setupZotero('compact');
  const manager = new ColumnManager(dataStoreFor({ s: 'reading', p: {}, lastReadAt: 1700000000000 }));
  await manager.register();
  const column = zotero.registrations.find((entry) => entry.dataKey === 'readingFlowDisplay');
  const cell = column.renderCell(0, column.dataProvider({ id: 9, isRegularItem: () => true }), {}, false, fakeDocument());
  assert.match(cell['aria-label'], /^Reading, no progress recorded, last read /);
  assert.equal(cell.children.filter((child: any) => /No progress recorded/.test(child.textContent)).length, 1);
  assert.doesNotMatch(JSON.stringify(cell), /unknown/i);
});

test('data-provider failures use the same never-read-last native sort class', async () => {
  const zotero = setupZotero('compact');
  const manager = new ColumnManager({ getData() { throw new Error('unavailable'); } } as any);
  await manager.register();
  const column = zotero.registrations.find((entry) => entry.dataKey === 'readingFlowDisplay');
  const failure = column.dataProvider({ id: 9, isRegularItem: () => true });
  const recent = '1700000000000:9999999990|{}';
  const firstClickDirection = column.sortReverse ? -1 : 1;
  assert.match(failure, /^0000000000000:/);
  assert.deepEqual([failure, recent].sort((left, right) => firstClickDirection * left.localeCompare(right)), [recent, failure]);
});

test('preference changes save valid density, refresh publicly, and report unavailable refresh honestly', () => {
  const zotero = setupZotero();
  const manager = new ColumnManager(dataStoreFor(flow));
  assert.equal(manager.getDisplayDensity(), 'compact');
  manager.setDisplayDensity('icons');
  assert.deepEqual(zotero.prefWrites, [[READING_FLOW_DISPLAY_PREF, 'icons']]);
  assert.equal(zotero.refreshes, 1);
  delete (globalThis as any).Zotero.ItemTreeManager.refreshColumns;
  assert.match(manager.setDisplayDensity('compact'), /restart or refresh/i);
  assert.equal(manager.setDisplayDensity('invalid' as any), undefined);
});

test('preference refresh preserves the public manager receiver and reports thrown refresh failures', () => {
  const zotero = setupZotero();
  const manager = new ColumnManager(dataStoreFor(flow));
  manager.setDisplayDensity('icons');
  assert.equal(zotero.refreshThis, (globalThis as any).Zotero.ItemTreeManager);
  const message = { textContent: '' };
  (globalThis as any).document = { getElementById: () => message };
  zotero.failRefresh(new Error('refresh unavailable'));
  manager.setDisplayDensity('compact');
  assert.match(message.textContent, /restart or refresh/i);
});

test('preference control executes the public density handler and displays fallback guidance', () => {
  const prefs = readFileSync('addon/prefs.xhtml', 'utf8');
  const handler = prefs.match(/onchange="([^"]+)"/)?.[1];
  assert.equal(handler, 'Zotero.ReadingFlowColumnManager?.setDisplayDensity(this.value)');
  assert.match(prefs, /id="readingflow-pref-density-message"/);
  assert.doesNotMatch(prefs, /onchange="[^"]*refreshColumns/);
  const message = { textContent: '' };
  const zotero = setupZotero('compact');
  delete (globalThis as any).Zotero.ItemTreeManager.refreshColumns;
  (globalThis as any).Zotero.ReadingFlowColumnManager = new ColumnManager(dataStoreFor(flow));
  (globalThis as any).document = { getElementById: () => message };
  new Function('Zotero', handler!).call({ value: 'icons' }, (globalThis as any).Zotero);
  assert.match(message.textContent, /restart or refresh/i);
  assert.deepEqual(zotero.prefWrites, [[READING_FLOW_DISPLAY_PREF, 'icons']]);
});

test('composite sorting is recent-first, never-read-last, and deterministic', () => {
  assert.ok(sortReadingFlowValues({ lastReadAt: 20, itemID: 2 }, { lastReadAt: 10, itemID: 1 }) < 0);
  assert.ok(sortReadingFlowValues({ lastReadAt: null, itemID: 1 }, { lastReadAt: 10, itemID: 2 }) > 0);
  assert.ok(sortReadingFlowValues({ lastReadAt: null, itemID: 1 }, { lastReadAt: null, itemID: 2 }) < 0);
});

test('composite registration uses native descending keys for recent-first deterministic sorting', async () => {
  const zotero = setupZotero('compact');
  const manager = new ColumnManager({ getData(item: any) {
    if (item.id === 3) return { ...flow, s: 'to-read', p: {}, lastReadAt: null };
    if (item.id === 4) return { ...flow, lastReadAt: 1600000000000 };
    return flow;
  } } as any);
  await manager.register();
  const column = zotero.registrations.find((entry) => entry.dataKey === 'readingFlowDisplay');
  const recent = column.dataProvider({ id: 2, isRegularItem: () => true });
  const old = column.dataProvider({ id: 4, isRegularItem: () => true });
  const never = column.dataProvider({ id: 3, isRegularItem: () => true });
  const tieLowID = column.dataProvider({ id: 1, isRegularItem: () => true });
  const tieHighID = column.dataProvider({ id: 2, isRegularItem: () => true });
  assert.equal(column.sortComparator, undefined);
  assert.equal(column.sortReverse, true);
  // Zotero's first-click ItemTree path uses -1 for a public sortReverse:true column.
  const firstClickDirection = column.sortReverse ? -1 : 1;
  const nativeOrder = [recent, old, never].sort((left, right) => firstClickDirection * left.localeCompare(right));
  assert.deepEqual(nativeOrder, [recent, old, never]);
  assert.ok(tieLowID > tieHighID);
  assert.match(recent, /\|\{/);
});
