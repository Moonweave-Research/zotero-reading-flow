import test from 'node:test';
import assert from 'node:assert/strict';
import { DataStore } from '../src/dataStore';
import { ReaderTracker } from '../src/readerTracker';
import { resolveReadingStatus } from '../src/flowData';
import { calculateStatisticsSnapshot } from '../src/statistics';
import { readFileSync } from 'node:fs';

async function fixture(enabled: unknown = true, manual: any = null, nativeTab = false) {
  const old = (globalThis as any).Zotero;
  let extra = 'Custom: keep\nReadingFlow: ' + JSON.stringify({ v: 6, important: true, s: manual, p: {}, snapshotOpenedAt: 100 });
  const paper: any = { id: 20, getField: () => extra, setField: (_: string, value: string) => { extra = value; }, saveTx: async () => {} };
  const pdf = { id: 10, key: 'AAAABBBB', parentID: 20, isPDFAttachment: () => true };
  const app = { pdfViewer: { currentPageNumber: 10 }, pdfDocument: { numPages: 10 } };
  const reader = { itemID: 10, tabID: 'reader-tab', _type: 'pdf', _initPromise: Promise.resolve(), PDFViewerApplication: app };
  let hostCalls = 0, tabExists = true;
  const tab = { onClose() { assert.equal(this, tab); hostCalls++; } };
  if (nativeTab) Object.assign(reader, { _window: { Zotero_Tabs: { _getTab: () => ({ tab: tabExists ? tab : undefined }) } } });
  let toolbar!: (event: any) => void, priority: number | undefined;
  const store = new DataStore(), tracker = new ReaderTracker(store);
  const api = { _readers: [reader] as any[], registerEventListener: (_: string, listener: any) => { toolbar = listener; }, unregisterEventListener() {} };
  (globalThis as any).Zotero = {
    Prefs: { get: () => enabled }, Reader: api,
    Items: { get: (id: number) => id === 10 ? pdf : paper, getAsync: async () => paper },
    Notifier: { registerObserver: (_: any, _types: any, _id: any, p: number) => { priority = p; return 'tracker'; }, unregisterObserver() {}, trigger() {} },
    ItemTreeManager: { refreshColumns() {} }
  };
  tracker.register(); toolbar({ reader }); await new Promise(resolve => setImmediate(resolve)); await tracker.flushPending();
  return { store, tracker, reader, paper, app, api, tab, get hostCalls() { return hostCalls; },
    setTabExists(value: boolean) { tabExists = value; }, get priority() { return priority; },
    setEnabled(value: unknown) { enabled = value; },
    restore() { tracker.unregister(); (globalThis as any).Zotero = old; } };
}

test('opt-in final-page tab closure derives automatic Read without changing manual Read statistics', async () => {
  const f = await fixture();
  try {
    const before = f.store.getData(f.paper);
    assert.equal(resolveReadingStatus(before).status, 'reading');
    f.tracker.notify('close', 'tab', ['reader-tab'] as any);
    f.api._readers.length = 0;
    await f.tracker.flushPending();
    const after = f.store.getData(f.paper);
    assert.deepEqual(resolveReadingStatus(after), { status: 'read', source: 'automatic' });
    assert.equal(after.s, null);
    assert.equal(after.v, 7);
    assert.equal(after.automaticRead!.attachmentKey, 'AAAABBBB');
    for (const field of ['p', 'pageCount', 'lastPage', 'lastReadAt', 'history', 'snapshotOpenedAt', 'important'] as const) assert.deepEqual(after[field], before[field], field);
    const stats = calculateStatisticsSnapshot([{ id: 20, flowData: after, tracked: true }]);
    assert.equal(stats.read, 0);
    assert.equal(stats.automaticRead, 1);
    assert.equal(stats.statusCounts.read, 1);
    assert.ok(f.priority! > 0 && f.priority! < 100, 'capture the live page before Zotero destroys the reader');
  } finally { f.restore(); }
});

for (const option of [undefined, false, 'true']) {
  test(`automatic completion stays off for preference ${String(option)}`, async () => {
    const f = await fixture(option === undefined ? null : option);
    try {
      f.tracker.notify('close', 'tab', ['reader-tab']); await f.tracker.flushPending();
      assert.equal(resolveReadingStatus(f.store.getData(f.paper)).status, 'reading');
      assert.equal(f.store.getData(f.paper).v, 6);
    } finally { f.restore(); }
  });
}

for (const manual of ['to-read', 'reading', 'skimmed', 'read']) {
  test(`automatic completion never overwrites manual ${manual}`, async () => {
    const f = await fixture(true, manual);
    try {
      f.tracker.notify('close', 'tab', ['reader-tab']); await f.tracker.flushPending();
      assert.deepEqual(resolveReadingStatus(f.store.getData(f.paper)), { status: manual, source: 'manual' });
      assert.equal(f.store.getData(f.paper).automaticRead, undefined);
    } finally { f.restore(); }
  });
}

for (const scenario of ['back-from-end', 'unknown-page-count', 'other-reader-open', 'snapshot', 'epub', 'preference-disabled', 'late-manual-choice', 'shutdown', 'unregister'] as const) {
  test(`final-page closure guard: ${scenario}`, async () => {
    const f = await fixture(); const services = (globalThis as any).Services;
    try {
      if (scenario === 'back-from-end') f.app.pdfViewer.currentPageNumber = 3;
      if (scenario === 'unknown-page-count') f.app.pdfDocument.numPages = 0;
      if (scenario === 'other-reader-open') f.api._readers.push({ itemID: 10, tabID: 'other-tab' });
      if (scenario === 'snapshot' || scenario === 'epub') f.reader._type = scenario;
      if (scenario === 'shutdown') (globalThis as any).Services = { startup: { shuttingDown: true } };
      f.tracker.notify('close', 'tab', ['reader-tab']);
      if (scenario === 'preference-disabled') f.setEnabled(false);
      if (scenario === 'late-manual-choice') await f.store.setStatus(f.paper, 'to-read');
      if (scenario === 'unregister') f.tracker.unregister();
      await f.tracker.flushPending();
      assert.equal(f.store.getData(f.paper).automaticRead, undefined);
      assert.equal(f.store.getData(f.paper).snapshotOpenedAt, 100);
    } finally { (globalThis as any).Services = services; f.restore(); }
  });
}

test('focused split closing page wins over the primary pane and historical maximum', async () => {
  const f = await fixture();
  try {
    (f.reader as any)._internalReader = { _lastViewPrimary: false,
      _primaryView: { _iframeWindow: { PDFViewerApplication: f.app } },
      _secondaryView: { _iframeWindow: { PDFViewerApplication: { pdfViewer: { currentPageNumber: 2 }, pdfDocument: { numPages: 10 } } } } };
    f.tracker.notify('close', 'tab', ['reader-tab']); await f.tracker.flushPending();
    assert.equal(f.store.getData(f.paper).automaticRead, undefined);
    (f.reader as any)._internalReader._secondaryView._iframeWindow.PDFViewerApplication.pdfViewer.currentPageNumber = 10;
    f.tracker.notify('close', 'tab', ['reader-tab']); await f.tracker.flushPending();
    assert.equal(f.store.getData(f.paper).automaticRead!.attachmentKey, 'AAAABBBB');
  } finally { f.restore(); }
});

test('clear automatic Read preserves manual choices and every other record field after reload', async () => {
  const f = await fixture();
  try {
    f.tracker.notify('close', 'tab', ['reader-tab']); await f.tracker.flushPending();
    await f.store.setStatus(f.paper, 'reading');
    const before = f.store.getData(f.paper);
    assert.equal(before.v, 7);
    assert.equal(await f.store.clearAutomaticRead(f.paper), true);
    const after = new DataStore().getData(f.paper);
    const { automaticRead: _removed, ...retained } = before;
    assert.deepEqual(after, { ...retained, ts: after.ts });
    assert.deepEqual(resolveReadingStatus(after), { status: 'reading', source: 'manual' });
    await f.store.clearManualStatus(f.paper);
    assert.deepEqual(resolveReadingStatus(f.store.getData(f.paper)), { status: 'reading', source: 'automatic' });
    assert.equal(await f.store.clearAutomaticRead(f.paper), false);
  } finally { f.restore(); }
});

test('completion writes preserve unsupported and read-only records', async () => {
  const f = await fixture();
  try {
    const completion = { attachmentKey: 'AAAABBBB', at: Date.now() };
    f.paper.isEditable = () => false;
    assert.equal(await f.store.recordAutomaticRead(f.paper, completion), false);
    f.paper.isEditable = () => true;
    for (const payload of [{ v: 99 }, { v: 6, important: false, automaticRead: completion },
      { v: 7, important: false, automaticRead: { attachmentKey: 'bad', at: 1 } }]) {
      f.paper.setField('extra', 'ReadingFlow: ' + JSON.stringify(payload));
      const before = f.paper.getField();
      assert.equal(await f.store.recordAutomaticRead(f.paper, completion), false);
      assert.equal(f.paper.getField(), before);
    }
  } finally { f.restore(); }
});

test('automatic completion is packaged off by default with an accessible opt-in control', () => {
  assert.match(readFileSync('addon/prefs.js', 'utf8'), /pref\("extensions\.readingflow\.autoComplete", false\)/);
  const panel = readFileSync('addon/prefs.xhtml', 'utf8');
  assert.match(panel, /id="readingflow-pref-auto-complete"[^>]*preference="extensions\.readingflow\.autoComplete"/);
  assert.match(panel, /Off by default/);
  assert.match(readFileSync('addon/prefs.js', 'utf8'), /pref\("extensions\.readingflow\.autoCompleteSnapshot", false\)/);
  assert.match(panel, /id="readingflow-pref-auto-complete-snapshot"[^>]*preference="extensions\.readingflow\.autoCompleteSnapshot"[^>]*aria-describedby="readingflow-pref-auto-complete-snapshot-help"/);
});

test('a preference change during a dirty-item wait cancels completion before it is persisted', async () => {
  const f = await fixture();
  try {
    let checks = 0;
    f.paper.isDirty = () => { checks++; if (checks === 1) { f.setEnabled(false); return true; } return false; };
    f.tracker.notify('close', 'tab', ['reader-tab']); await f.tracker.flushPending();
    assert.ok(checks >= 2);
    assert.equal(f.store.getData(f.paper).automaticRead, undefined);
  } finally { f.restore(); }
});

test('clearing automatic Read does not cancel an unrelated pending PDF position save', async () => {
  const f = await fixture();
  try {
    f.tracker.notify('close', 'tab', ['reader-tab']); await f.tracker.flushPending();
    f.app.pdfViewer.currentPageNumber = 3;
    f.tracker.notify('pageChange', 'file', [10]);
    await f.store.clearAutomaticRead(f.paper);
    await f.tracker.flushPending();
    const data = f.store.getData(f.paper);
    assert.equal(data.automaticRead, undefined);
    assert.equal(data.lastPage, 3);
    assert.equal(data.snapshotOpenedAt, 100);
  } finally { f.restore(); }
});

test('a tab closed under a manual stage cannot complete after that stage is cleared', async () => {
  const f = await fixture(true, 'to-read');
  try {
    f.tracker.notify('close', 'tab', ['reader-tab']);
    await f.store.clearManualStatus(f.paper);
    await f.tracker.flushPending();
    assert.equal(f.store.getData(f.paper).automaticRead, undefined);
    assert.deepEqual(resolveReadingStatus(f.store.getData(f.paper)), { status: 'reading', source: 'automatic' });
  } finally { f.restore(); }
});

for (const order of ['snapshot-pending', 'snapshot-saved', 'manual-after-open', 'background-snapshot'] as const) {
  test(`final-page completion respects snapshot observation order (${order})`, async () => {
    const original = (globalThis as any).Zotero;
    let extra = '';
    const parent = { id: 20, getField: () => extra, setField: (_: string, value: string) => { extra = value; }, async saveTx() {} };
    const pdf = { id: 10, parentID: 20, key: 'ABCD2345', isPDFAttachment: () => true };
    const snapshot = { id: 11, parentID: 20 };
    const pdfReader = { itemID: 10, tabID: 'pdf', _type: 'pdf', _initPromise: Promise.resolve(),
      PDFViewerApplication: { pdfViewer: { currentPageNumber: 10 }, pdfDocument: { numPages: 10 } } };
    const snapshotReader = { itemID: 11, tabID: 'snapshot', _type: 'snapshot', _isTabClosed: false, _initPromise: Promise.resolve(),
      _window: { Zotero_Tabs: { selectedID: order === 'background-snapshot' ? 'pdf' : 'snapshot' } } };
    const readers = [pdfReader, snapshotReader];
    let toolbar!: (event: any) => void;
    (globalThis as any).Zotero = {
      Prefs: { get: () => true },
      Reader: { _readers: readers, registerEventListener: (_: string, callback: typeof toolbar) => { toolbar = callback; }, unregisterEventListener() {} },
      Items: { get: (id: number) => id === 10 ? pdf : id === 11 ? snapshot : parent, getAsync: async () => parent },
      Notifier: { registerObserver: () => 'tracker', unregisterObserver() {}, trigger() {} },
      ItemTreeManager: { refreshColumns() {} }
    };
    const store = new DataStore(), tracker = new ReaderTracker(store);
    try {
      await store.initializeStatusIfUnowned(parent, 'to-read');
      tracker.register();
      toolbar({ reader: pdfReader }); toolbar({ reader: snapshotReader });
      await new Promise(resolve => setImmediate(resolve));
      snapshotReader._isTabClosed = true;
      if (order === 'snapshot-saved') await tracker.flushPending();
      tracker.notify('close', 'tab', ['pdf']);
      readers.length = 0;
      if (order === 'manual-after-open') await store.setStatus(parent, 'to-read');
      await tracker.flushPending();
      const data = store.getData(parent);
      assert.ok(data.snapshotOpenedAt);
      const automatic = order === 'snapshot-pending' || order === 'snapshot-saved';
      assert.equal(resolveReadingStatus(data).status, automatic ? 'read' : 'to-read');
      assert.equal(Boolean(data.automaticRead), automatic);
    } finally { tracker.unregister(); (globalThis as any).Zotero = original; }
  });
}

for (const scenario of ['final-page', 'earlier-page', 'manual-after-close', 'manual-at-close', 'unloaded'] as const) {
  test(`queued host tab-close notification uses only the captured live page (${scenario})`, async () => {
    const f = await fixture(true, scenario === 'manual-at-close' ? 'to-read' : null, true);
    try {
      if (scenario === 'earlier-page') f.app.pdfViewer.currentPageNumber = 9;
      f.setTabExists(false);
      f.tab.onClose();
      assert.equal(f.hostCalls, 1);
      if (scenario === 'unloaded') f.setTabExists(true);
      await Promise.resolve();
      // A transaction can delay the notifier until the reader DOM has been removed.
      Object.defineProperty(f.app, 'pdfViewer', { get() { throw new TypeError('dead reader'); } });
      f.api._readers.length = 0;
      if (scenario === 'manual-after-close') await f.store.setStatus(f.paper, 'to-read');
      if (scenario === 'manual-at-close') await f.store.clearManualStatus(f.paper);
      f.tracker.notify('close', 'tab', ['reader-tab']);
      await f.tracker.flushPending();
      const data = f.store.getData(f.paper);
      assert.equal(Boolean(data.automaticRead), scenario === 'final-page');
      assert.equal(data.s, scenario === 'manual-after-close' ? 'to-read' : null);
    } finally { f.restore(); }
  });
}


test('disabling tracking restores the native tab-close callback', async () => {
  const f = await fixture(true, null, true);
  try {
    const wrapped = f.tab.onClose;
    f.tracker.unregister();
    assert.notEqual(f.tab.onClose, wrapped);
    f.tab.onClose();
    assert.equal(f.hostCalls, 1);
  } finally { f.restore(); }
});

for (const scenario of [
  'qualifying-close', 'brief', 'above-end', 'short', 'background-close',
  'background-time', 'window-inactive', 'restored', 'pdf-option-only',
  'manual-stage', 'default-became-automatic', 'another-reader', 'unloaded', 'disabled-before-save',
  'moved-before-reader-opens', 'reader-opened-before-save'
] as const) {
  test(`snapshot automatic Read: ${scenario}`, async () => {
    const global = globalThis as any;
    const oldZotero = global.Zotero;
    let now = 0;
    const store = new DataStore();
    const tracker = new ReaderTracker(store);
    const manual = scenario === 'manual-stage' ? 'reading' : null;
    const defaultToRead = scenario === 'default-became-automatic';
    let extra = 'ReadingFlow: ' + JSON.stringify({ v: 8, s: defaultToRead ? 'to-read' : manual,
      ...(defaultToRead ? { defaultToRead: true } : {}), p: {}, important: true });
    const parent = {
      id: 20, getField: () => extra,
      setField: (_: string, value: string) => { extra = value; }, saveTx: async () => {}
    };
    const attachment = { id: 10, key: 'AAAABBBB', parentID: 20 };
    let tabExists = true, closed = false, focused = true;
    const secondRead = scenario === 'another-reader';
    let notifyClose: () => void = () => {};
    const tabs = {
      selectedID: 'snapshot-tab',
      tabHooks: {
        moveToNewWindow: {
          async reader(tab: { id: string }) {
            tabs.close(tab.id);
            await Promise.resolve();
            notifyClose();
            await tracker.flushPending();
          }
        }
      },
      _getTab: () => ({ tab: tabExists ? {} : undefined }),
      close(_id?: string) {
        closed = true;
        readers.splice(readers.indexOf(reader), 1);
        this.selectedID = 'library';
        tracker.notify('select', 'tab', 'library');
        tabExists = scenario === 'unloaded';
        notifyClose = () => tracker.notify('close', 'tab', 'snapshot-tab');
      }
    };
    const win = Object.assign(new EventTarget(), {
      Zotero_Tabs: tabs, document: { hasFocus: () => focused }, performance: { now: () => now }
    });
    const scroll = { clientHeight: 500, scrollHeight: scenario === 'short' ? 500 : 2500,
      scrollTop: scenario === 'short' ? 0 : scenario === 'above-end' ? 1500 : 2000 };
    const reader = {
      itemID: 10, tabID: 'snapshot-tab', _type: 'snapshot', _window: win,
      _internalReader: { _primaryView: { get _iframeDocument() { return closed ? undefined : { scrollingElement: scroll }; } } }
    };
    const readers: Array<{ itemID: number; tabID?: string }> = secondRead
      ? [reader, { itemID: 10, tabID: 'other-tab' }] : [reader];
    let toolbar!: (event: any) => void;
    let enabled = scenario !== 'pdf-option-only';
    global.Zotero = {
      Prefs: { get: (name: string) => name === 'extensions.readingflow.autoCompleteSnapshot' ? enabled : true },
      Session: { state: { windows: [{ tabs: [{ type: 'reader', selected: true, data: { itemID: 10 } }] }] } },
      Reader: { _readers: readers, registerEventListener: (_: string, listener: typeof toolbar) => { toolbar = listener; } },
      Items: { get: (id: number) => id === 10 ? attachment : parent, getAsync: async () => parent },
      Notifier: { registerObserver: () => 'tracker', unregisterObserver() {}, trigger() {} },
      ItemTreeManager: { refreshColumns() {} }
    };
    try {
      const originalClose = tabs.close;
      const originalMove = tabs.tabHooks.moveToNewWindow.reader;
      tracker.register(scenario === 'restored');
      toolbar({ reader });
      await new Promise(resolve => setImmediate(resolve));
      await tracker.flushPending();
      now = scenario === 'brief' ? 14_999 : 15_000;
      if (scenario === 'background-close' || scenario === 'background-time') {
        tabs.selectedID = 'library';
        tracker.notify('select', 'tab', 'library');
      }
      if (scenario === 'background-time') {
        now += 15_000;
        tabs.selectedID = reader.tabID;
        tracker.notify('select', 'tab', reader.tabID);
      }
      if (scenario === 'window-inactive') {
        focused = false;
        win.dispatchEvent(new Event('deactivate'));
        now += 15_000;
        focused = true;
        win.dispatchEvent(new Event('activate'));
      }
      if (scenario === 'moved-before-reader-opens') {
        await tabs.tabHooks.moveToNewWindow.reader({ id: reader.tabID });
      } else {
        tabs.close();
        await Promise.resolve();
        notifyClose();
      }
      if (scenario === 'reader-opened-before-save') readers.push({ itemID: 10 });
      if (scenario === 'disabled-before-save') enabled = false;
      await tracker.flushPending();
      const after = store.getData(parent);
      const qualifies = scenario === 'qualifying-close' || scenario === 'short' || defaultToRead;
      assert.equal(after.automaticRead?.attachmentKey, qualifies ? attachment.key : undefined);
      assert.equal(after.defaultToRead, undefined);
      assert.ok(after.snapshotOpenedAt);
      assert.equal(after.s, manual);
      assert.equal(after.important, true);
      assert.equal(after.v, 8);
      assert.deepEqual(after.p, {});
      tracker.unregister();
      assert.equal(tabs.close, originalClose);
      assert.equal(tabs.tabHooks.moveToNewWindow.reader, originalMove);
    } finally {
      tracker.unregister();
      global.Zotero = oldZotero;
    }
  });
}
