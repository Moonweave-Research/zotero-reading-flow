import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { ReadingFlowItemPaneManager, READING_FLOW_PANE_ID, firstRecordedPDFActivity } from '../src/itemPaneManager';
import { ColumnManager } from '../src/columnManager';
import { createDashboardBridge } from '../src/bootstrap';
import { DataStore } from '../src/dataStore';
import { ResumeReader } from '../src/resumeReader';
import { DEFAULT_FLOW_DATA, FLOW_PREFIX, getLastActivityAt, getLocalDayKey, getNormalizedDisplayProgress, resolveReadingStatus } from '../src/flowData';
import { calculateStatisticsSnapshot, selectStatisticsPapers } from '../src/statistics';
import { ReadingFlowMenuManager } from '../src/menuManager';

class Element {
  children: Element[] = []; dataset: any = {}; attributes: any = {}; listeners: any = {};
  textContent = ''; value = ''; checked = false; disabled = false; type = ''; style = { setProperty() {} };
  constructor(public tag: string) {}
  append(...elements: Element[]) { this.children.push(...elements); }
  prepend(element: Element) { this.children.unshift(element); }
  replaceChildren() { this.children = []; }
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  addEventListener(key: string, fn: any) { this.listeners[key] = fn; }
  all(): Element[] { return this.children.flatMap(child => [child, ...child.all()]); }
  querySelectorAll(selector: string) { return this.all().filter(e => selector.split(',').includes(e.tag)); }
  querySelector(selector: string) { return this.all().find(e => selector.includes('target') ? e.dataset.readingFlowTarget : e.dataset.readingFlowError); }
  text(): string { return this.textContent + this.children.map(e => e.text()).join(' '); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(extra = '', editable = true) {
  let saves = 0, setters = 0, hooks: any, registers = 0, unregisters = 0, observed = 0, removed = 0, refreshes = 0;
  const paper: any = { id: 1, isRegularItem: () => true, isEditable: () => editable,
    getField: (field: string) => field === 'extra' ? extra : 'Book',
    setField: (_field: string, next: string) => { setters++; extra = next; }, saveTx: async () => { saves++; },
    getBestAttachment: async () => pdf };
  const pdf: any = { id: 2, parentID: 1, attachmentFilename: 'chosen.pdf', isPDFAttachment: () => true, fileExists: async () => true };
  let selection = [paper]; const opens: any[] = [], scrolls: string[] = [], menus: any[] = [];
  const pane = { collapsed: true }; const details = { render: async () => {}, scrollToPane: async (id: string) => { if (pane.collapsed) return null; scrolls.push(id); return true; } };
  const win = { ZoteroPane: { itemPane: pane, toggleItemPane: () => { pane.collapsed = !pane.collapsed; }, getSelectedItems: () => selection }, document: { querySelector: () => details } };
  const items = new Map([[1, paper], [2, pdf]]); let observer: any;
  (globalThis as any).Zotero = { Items: { get: (id: number) => items.get(id) }, getMainWindow: () => win,
    getActiveZoteroPane: () => win.ZoteroPane, Reader: { open: async (...args: any[]) => { opens.push(args); } },
    ItemPaneManager: { registerSection: (options: any) => { hooks = options; registers++; return READING_FLOW_PANE_ID; }, unregisterSection: () => { unregisters++; } },
    Notifier: { registerObserver: (o: any) => { observer = o; observed++; return observed; }, unregisterObserver: () => { removed++; } },
    MenuManager: { registerMenu: (m: any) => { menus.push(m); return m.menuID; }, unregisterMenu() {} } };
  const store = new DataStore(), reader = new ResumeReader(store), manager = new ReadingFlowItemPaneManager(store, reader);
  manager.register();
  const body = new Element('body'), doc = { createElementNS: (_ns: string, tag: string) => new Element(tag) };
  const props: any = { body, doc, item: paper, editable, setEnabled: (value: boolean) => { props.enabled = value; }, refresh: () => { refreshes++; } };
  async function view(item = paper) { props.item = item; hooks.onItemChange({ ...props }); await hooks.onRender({ ...props }); await hooks.onAsyncRender?.({ ...props }); }
  hooks.onInit(props);
  return { store, reader, manager, paper, pdf, props, body, items, view, menus, opens, scrolls,
    pane, details, hooks: () => hooks, select: (items: any[]) => { selection = items; }, notify: () => observer.notify('modify', 'item', [1]),
    counts: () => ({ saves, setters, registers, unregisters, observed, removed, refreshes }) };
}
const payload = (updates: any) => FLOW_PREFIX + JSON.stringify({ ...DEFAULT_FLOW_DATA, ...updates });

test('official section lifecycle, native menu focus, notifier refresh and reload release resources; viewing writes zero', async () => {
  const f = fixture(); f.manager.register(); await f.view(); await f.view();
  assert.equal(f.body.attributes.lang, 'en'); assert.match(f.body.text(), /Not recorded/);
  assert.equal(f.body.querySelectorAll('select').length, 1); assert.equal(f.body.querySelectorAll('input').length, 1);
  assert.equal(f.counts().saves, 0); assert.equal(f.counts().setters, 0); assert.equal(f.opens.length, 0);
  const menu = new ReadingFlowMenuManager(f.store, undefined, f.manager); menu.register();
  const entry = f.menus[0].menus[0].menus.find((e: any) => e.label === 'View Reading Flow');
  await entry.onCommand(); assert.deepEqual(f.scrolls, [READING_FLOW_PANE_ID]);
  f.select([f.paper, f.pdf]); assert.equal(await f.manager.focus(), false);
  f.notify(); assert.equal(f.counts().refreshes, 1);
  f.hooks().onDestroy(f.props); f.manager.unregister(); f.manager.unregister();
  assert.deepEqual(f.counts(), { saves: 0, setters: 0, registers: 1, unregisters: 1, observed: 1, removed: 1, refreshes: 1 });
  f.manager.register(); assert.equal(f.counts().registers, 2); f.manager.unregister();
});

test('first activity date uses retained activity days and legacy last activity, never status/reset/container timestamps', () => {
  const data: any = { ...DEFAULT_FLOW_DATA, history: { startedAt: 1, completedAt: 2, days: {
    '2026-01-01': { activity: false, reset: true, lastReadAt: 1 },
    '2026-03-05': { activity: true, lastReadAt: null }, '2026-04-01': { activity: true, lastReadAt: null }
  } } };
  assert.equal(firstRecordedPDFActivity(data), '2026-03-05');
  data.history.days = {}; assert.equal(firstRecordedPDFActivity(data), null);
  data.lastReadAt = new Date(2025, 11, 1, 12).getTime(); assert.equal(firstRecordedPDFActivity(data), '2025-12-01');
});

for (const [name, extra, reason] of [
  ['absent', '', /Not recorded/], ['corrupt', 'ReadingFlow: {bad', /damaged or invalid/],
  ['unsupported', 'ReadingFlow: {"v":99}', /unsupported version/],
  ['duplicate', payload({}) + '\n' + payload({}), /Multiple Reading Flow records/]
] as const) test(`${name} records stay unchanged during pane viewing`, async () => {
  const f = fixture(extra); await f.view(); assert.match(f.body.text(), reason);
  if (name !== 'absent') {
    assert.ok(f.body.querySelectorAll('select,input').every(e => e.disabled));
    assert.match((await f.reader.getResumeDisplayTarget(f.paper)).reason, /cannot be read/);
  }
  assert.equal(f.paper.getField('extra'), extra); assert.equal(f.counts().saves, 0); f.manager.unregister();
});

test('direct pane controls share queued stage/importance writes and preserve PDF state across all four PRs', async () => {
  const f = fixture(); await f.store.recordProgress(f.paper, { attachmentId: '2', lastPage: 100, pageCount: 100, progress: 1, at: 100 });
  await f.store.recordProgress(f.paper, { attachmentId: '2', lastPage: 1, pageCount: 100, progress: 0.01, at: 200 });
  await f.view(); assert.match(f.body.text(), /based on recorded PDF activity/);
  let select = f.body.querySelectorAll('select')[0]; select.value = 'read'; select.listeners.change(); await tick();
  let check = f.body.querySelectorAll('input')[0]; check.checked = true; check.listeners.change(); await tick();
  let data = f.store.getData(f.paper); assert.equal(data.s, 'read'); assert.equal(data.important, true);
  assert.equal(data.lastPage, 1); assert.equal(getNormalizedDisplayProgress(data), 1); assert.equal(data.history?.completedAt, null);
  const papers = [{ id: 1, flowData: data }];
  assert.equal(calculateStatisticsSnapshot(papers).statusCounts.read, 1);
  assert.equal(selectStatisticsPapers(papers, { dataset: 'tracked', statusFilter: 'read', importantOnly: true }).length, 1);
  const target = await f.reader.getResumeDisplayTarget(f.paper); assert.equal(target.lastPage, 1);
  const button = f.body.querySelectorAll('button')[0]; await button.listeners.click(); assert.deepEqual(f.opens, [[2, { pageIndex: 0 }]]);
  await f.store.resetProgress(f.paper, 300); await f.view(); data = f.store.getData(f.paper);
  assert.equal(data.s, 'read'); assert.equal(data.important, true); assert.equal(getLastActivityAt(data), 200);
  assert.match(f.body.text(), /Open PDF/); assert.equal(firstRecordedPDFActivity(data), getLocalDayKey(200));
  select = f.body.querySelectorAll('select')[0]; select.value = ''; select.listeners.change(); await tick();
  assert.deepEqual(resolveReadingStatus(f.store.getData(f.paper)), { status: 'reading', source: 'automatic' });
  f.manager.unregister();
});

test('read-only books can open PDF; EPUB-only books keep independent manual controls without PDF tracking', async () => {
  const f = fixture(payload({ s: 'read', important: true, v: 3 }), false); await f.view();
  assert.ok(f.body.querySelectorAll('select,input').every(e => e.disabled));
  const select = f.body.querySelectorAll('select')[0]; select.value = 'skimmed'; select.listeners.change(); await tick();
  await f.body.querySelectorAll('button')[0].listeners.click(); assert.equal(f.opens.length, 1); assert.equal(f.counts().saves, 0);
  f.manager.unregister();
  const book = fixture(); book.paper.getBestAttachment = async () => ({ id: 3, parentID: 1, isPDFAttachment: () => false });
  await book.view(); assert.equal(book.body.querySelectorAll('select')[0].disabled, false);
  assert.match(book.body.text(), /No accessible PDF/); assert.match(book.body.text(), /EPUB positions are not tracked/);
  assert.equal(book.body.querySelectorAll('button').length, 0); book.manager.unregister();
});

test('selection changes and destroy invalidate delayed results and detached controls', async () => {
  const f = fixture(); let resolve!: (value: any) => void;
  f.paper.getBestAttachment = () => new Promise(r => { resolve = r; });
  const pending = f.view(); const oldSelect = f.body.querySelectorAll('select')[0];
  const other = { ...f.paper, id: 5, getBestAttachment: async () => null }; await f.view(other);
  oldSelect.value = 'read'; oldSelect.listeners.change(); resolve(f.pdf); await pending; await tick();
  assert.equal(f.body.querySelectorAll('button').length, 0); assert.equal(f.counts().saves, 0);
  f.paper.getBestAttachment = () => new Promise(r => { resolve = r; }); const destroyed = f.view();
  f.manager.unregister(); resolve(f.pdf); await destroyed; assert.equal(f.body.querySelectorAll('button').length, 0);
});

test('multiple/deleted PDFs never transfer a saved page; changed targets and failed writes show plain errors', async () => {
  const f = fixture(payload({ lastAttachmentId: '2', lastPage: 37, p: { '2': 0.37 }, pageCount: { '2': 100 } }));
  await f.view(); assert.match(f.body.text(), /37 \/ 100/);
  const button = f.body.querySelectorAll('button')[0]; f.pdf.deleted = true;
  const replacement: any = { id: 3, parentID: 1, attachmentFilename: 'alternative.pdf', isPDFAttachment: () => true };
  f.items.set(3, replacement); f.paper.getBestAttachment = async () => replacement;
  await button.listeners.click(); assert.equal(f.opens.length, 0); assert.match(f.body.text(), /no longer available/);
  await f.view(); assert.match(f.body.text(), /alternative.pdf/); assert.match(f.body.text(), /Open PDF/); assert.doesNotMatch(f.body.text(), /Resume at Page 37/);
  f.store.setStatus = async () => { throw new Error('disk'); };
  const select = f.body.querySelectorAll('select')[0]; select.value = 'read'; select.listeners.change(); await tick();
  assert.match(f.body.text(), /could not be saved/); assert.equal(f.body.querySelectorAll('select')[0].disabled, false);
  f.manager.unregister();
});


test('menu, dashboard and pane expose the same file/page action; dashboard filters reflect direct pane edits without read writes', async () => {
  const f = fixture(payload({ lastAttachmentId: '2', lastPage: 12, pageCount: { '2': 30 }, p: { '2': 40 }, s: 'read', v: 3, important: true }));
  const registrations: any[] = [];
  (globalThis as any).Zotero.Prefs = { get: () => 'compact' };
  (globalThis as any).Zotero.ItemTreeManager = { registerColumn: (options: any) => { registrations.push(options); return options.dataKey; } };
  await new ColumnManager(f.store).register();
  assert.equal(registrations.find(c => c.label === 'Status').dataProvider(f.paper), 'read|manual|important');
  const bridge = createDashboardBridge({ scopeAdapter: { getItems: async () => [f.paper] }, dataStore: f.store, resumeReader: f.reader });
  await f.view();
  const target = await bridge.getPDFTarget!(1);
  const menu = new ReadingFlowMenuManager(f.store, undefined, f.manager); menu.register();
  const entry = f.menus[0].menus[0].menus.find((e: any) => e.l10nID === 'reading-flow-resume-reading');
  let label = ''; const context = { items: [f.paper], setEnabled() {}, menuElem: { setAttribute: (key: string, value: string) => { if (key === 'label') label = value; }, removeAttribute() {} } };
  await entry.onShowing(undefined, context);
  assert.equal(label, target.fallbackLabel); assert.equal(f.body.querySelectorAll('button')[0].attributes['aria-label'], label);
  assert.equal(f.body.querySelectorAll('button')[0].textContent, 'Resume at page 12 / 30');
  const snapshot = await bridge.getSnapshot('current-view', 'all-time', 'read', 'tracked', true);
  assert.equal(snapshot.statusCounts.read, 1); assert.equal(f.counts().saves, 0); assert.equal(f.opens.length, 0);
  const check = f.body.querySelectorAll('input')[0]; check.checked = false; check.listeners.change(); await tick();
  const filtered = await bridge.getSnapshot('current-view', 'all-time', 'read', 'tracked', true);
  assert.equal(filtered.statusCounts.read, 0);
  assert.equal(registrations.find(c => c.label === 'Status').dataProvider(f.paper), 'read|manual');
  assert.equal((await bridge.getSnapshot('current-view', 'all-time', 'read', 'tracked', false)).statusCounts.read, 1);
  assert.equal((await bridge.getPDFTarget!(1)).lastPage, 12);
  f.manager.unregister(); menu.unregister();
});

test('retained history date changes only when a real write prunes evidence; viewing never backfills startedAt', async () => {
  const old = new Date(2024, 0, 1, 12).getTime(), retained = new Date(2026, 5, 3, 12).getTime();
  const day = (at: number) => ({ activity: true, lastReadAt: at, progress: { '2': 20 }, status: 'reading', reset: false, completed: false });
  const f = fixture(payload({ v: 2, history: { startedAt: old - 1000, completedAt: null, activeDaysTotal: 2,
    days: { [getLocalDayKey(old)]: day(old), [getLocalDayKey(retained)]: day(retained) } } }));
  await f.view(); assert.equal(firstRecordedPDFActivity(f.store.getData(f.paper)), getLocalDayKey(old));
  assert.match(f.body.text(), /retains at most 366 days/); assert.equal(f.counts().saves, 0);
  await f.store.recordProgress(f.paper, { attachmentId: '2', lastPage: 3, pageCount: 10, progress: 0.3, at: retained + 86400000 });
  await f.view(); assert.equal(firstRecordedPDFActivity(f.store.getData(f.paper)), getLocalDayKey(retained));
  assert.equal(f.store.getData(f.paper).history?.startedAt, old - 1000);
  assert.match(f.body.text(), /not the actual reading start/); f.manager.unregister();
});


test('save-time notifier refresh does not leave controls disabled', async () => {
  const f = fixture(); await f.view();
  const save = f.paper.saveTx;
  f.paper.saveTx = async () => { f.notify(); f.hooks().onRender({ ...f.props }); await save(); };
  const select = f.body.querySelectorAll('select')[0]; select.value = 'read'; select.listeners.change(); await tick();
  assert.equal(f.body.querySelectorAll('select')[0].disabled, false);
  assert.equal(f.store.getData(f.paper).s, 'read'); assert.equal(f.counts().saves, 1);
  f.manager.unregister();
});


test('an already-achieved native command is not reported as a failed save', async () => {
 const f=fixture(); await f.view(); const original=f.store.setStatus.bind(f.store);
 f.store.setStatus=async (item, status) => { await original(item,status); return false; };
 const select=f.body.querySelectorAll('select')[0]; select.value='read'; select.listeners.change(); await tick();
 assert.equal(f.store.getData(f.paper).s,'read'); assert.doesNotMatch(f.body.text(),/No change was saved/);
 f.manager.unregister();
});


test('native View Reading Flow command localizes its menu label attribute', () => {
 const ftl=readFileSync('addon/locale/en-US/reading-flow.ftl','utf8');
 assert.match(ftl,/reading-flow-view-pane =\n\s+\.label = View Reading Flow/);
});

 test('View Reading Flow expands a collapsed native item pane before scrolling and does not toggle an open pane closed', async () => {
  const f = fixture(); await f.view();
  assert.equal(await f.manager.focus(), true);
  assert.equal(f.pane.collapsed, false);
  assert.deepEqual(f.scrolls, [READING_FLOW_PANE_ID]);
  assert.equal(await f.manager.focus(), true);
  assert.equal(f.pane.collapsed, false);
  assert.equal(f.counts().saves, 0);
  f.manager.unregister();
});

test('compact pane shows resolved automatic state, consistent dates and saved location before optional explanations, without writes', async () => {
  const at = new Date(2026, 9, 24, 14, 11).getTime();
  const f = fixture(payload({ v: 2, s: 'important', lastAttachmentId: '2', lastPage: 3,
    pageCount: { '2': 10 }, p: { '2': 0.9 }, lastReadAt: at }));
  await f.view();
  const select = f.body.querySelectorAll('select')[0];
  assert.equal(select.children.find(e => e.value === '')!.textContent, 'Reading (automatic)');
  assert.equal(select.children.find(e => e.value === 'read')!.textContent, 'Read (manual)');
  const visible = f.body.children.filter(e => e.tag !== 'details').map(e => e.text()).join(' ');
  assert.match(visible, /Last activity.*2026-10-24 14:11/);
  assert.match(visible, /First recorded.*2026-10-24/);
  assert.match(visible, /Saved position.*Page 3 \/ 10/);
  assert.match(visible, /Farthest position.*Page 9 \/ 10/);
  assert.doesNotMatch(visible, /Legacy Important|retains at most|clear manual status|Maximum recorded location/);
  assert.match(f.body.children.find(e => e.tag === 'details')!.text(), /Legacy Important/);
  assert.equal(f.counts().saves, 0); assert.equal(f.counts().setters, 0);
  f.manager.unregister();
});

test('compact location facts keep ambiguous legacy maxima unknown instead of inventing a percentage', async () => {
  const f = fixture(payload({ p: { '2': 1 }, lastAttachmentId: '2', lastPage: 1, pageCount: { '2': 10 } }));
  await f.view();
  const visible = f.body.children.filter(e => e.tag !== 'details').map(e => e.text()).join(' ');
  assert.match(visible, /Saved position.*Page 1 \/ 10/);
  assert.match(visible, /Farthest position.*Unknown/);
  assert.equal(f.counts().saves, 0);
  f.manager.unregister();
});


test('inaccessible PDF is unavailable, not an assertion that no PDF is attached', async () => {
  const f = fixture(); f.pdf.fileExists = async () => false;
  await f.view();
  assert.match(f.body.text(), /Saved position.*PDF unavailable/);
  assert.doesNotMatch(f.body.text(), /No PDF/);
  assert.equal(f.counts().saves, 0); f.manager.unregister();
});

test('alternative PDF never inherits the original maximum in summary or disclosure', async () => {
  const f = fixture(payload({ lastAttachmentId: '2', lastPage: 37, p: { '2': 0.37 }, pageCount: { '2': 100 } }));
  f.pdf.deleted = true;
  const alternative: any = { id: 3, parentID: 1, attachmentFilename: 'alternative.pdf', isPDFAttachment: () => true };
  f.items.set(3, alternative); f.paper.getBestAttachment = async () => alternative;
  await f.view();
  assert.match(f.body.text(), /Farthest position.*Unknown.*PDF.*alternative.pdf/);
  assert.doesNotMatch(f.body.text(), /37%|Page 37|Recorded maximum/);
  assert.equal(f.counts().saves, 0); f.manager.unregister();
});

for (const [count, expected] of [[10, /Farthest position.*Page 10 \/ 10/], [null, /Farthest position.*Unknown/]] as const) {
  test(`end position with page count ${count} never looks like completion percentage`, async () => {
    const f = fixture(payload({ v: 3, important: false, lastAttachmentId: '2', lastPage: 10, p: { '2': 1 }, pageCount: count ? { '2': count } : {} }));
    await f.view();
    assert.match(f.body.text(), expected); assert.doesNotMatch(f.body.text(), /100%/);
    assert.equal(f.body.querySelectorAll('select')[0].value, '');
    assert.match(f.body.text(), /not pages read/);
    assert.equal(f.counts().saves, 0); f.manager.unregister();
  });
}


test('unknown page count does not round a fractional PDF location up to 100 percent', async () => {
  const f = fixture(payload({ lastAttachmentId: '2', lastPage: 99, p: { '2': 0.999 } }));
  await f.view(); assert.match(f.body.text(), /Farthest position.*About 99% of PDF/);
  assert.doesNotMatch(f.body.text(), /100%|End of PDF/);
  assert.equal(f.counts().saves, 0); f.manager.unregister();
});


test('a sync pane rerender resolves PDF details without another async hook or scroll and writes nothing', async () => {
  const original = payload({ lastAttachmentId: '2', lastPage: 3, p: { '2': 0.9 }, pageCount: { '2': 10 } });
  const f = fixture(original); await f.view();
  assert.match(f.body.text(), /Page 3 \/ 10/);
  await f.hooks().onRender({ ...f.props }); await tick();
  assert.doesNotMatch(f.body.text(), /Checking PDF availability/);
  assert.match(f.body.text(), /Page 3 \/ 10/);
  assert.match(f.body.text(), /Page 9 \/ 10/);
  assert.match(f.body.text(), /Resume at page 3 \/ 10/);
  assert.equal(f.paper.getField('extra'), original);
  assert.equal(f.counts().saves, 0); assert.equal(f.counts().setters, 0); assert.equal(f.opens.length, 0);
  f.manager.unregister();
});
