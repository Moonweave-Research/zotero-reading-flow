import test from 'node:test';
import assert from 'node:assert/strict';
import { DataStore } from '../src/dataStore';
import { DEFAULT_FLOW_DATA, FLOW_PREFIX } from '../src/flowData';
function fixture(payload: any = DEFAULT_FLOW_DATA) {
  let extra = `Custom: retained\n${FLOW_PREFIX}${JSON.stringify(payload)}`;
  const item = { id: 501, getField: () => extra, setField: (_: string, value: string) => { extra = value; }, saveTx: async () => {} };
  return { item, store: new DataStore(), extra: () => extra };
}
const mark = { attachmentKey: 'ABCD2345', page: 12, pageCount: 30, at: 100 };
test('explicit reading bookmark survives browsing, status, importance, reset and a peer round trip without fabricating activity', async () => {
  const f = fixture({ ...DEFAULT_FLOW_DATA, s: 'read' });
  assert.equal(await f.store.setReadingBookmark(f.item, mark), true);
  const saved = f.store.getData(f.item);
  assert.deepEqual(saved.bookmark, mark);
  assert.equal(saved.v, 4); assert.equal(saved.s, 'read'); assert.equal(saved.lastReadAt, null); assert.equal(saved.history, undefined);
  await f.store.recordProgress(f.item, { attachmentId: '42', progress: 28/30, pageCount: 30, lastPage: 28, at: 200 });
  await f.store.setImportant(f.item, true, 210);
  await f.store.setStatus(f.item, 'skimmed', 220);
  await f.store.clearManualStatus(f.item);
  assert.deepEqual(f.store.getData(f.item).bookmark, mark);
  await f.store.setStatus(f.item, 'skimmed', 221);
  assert.equal(f.store.getData(f.item).lastPage, 28);
  await f.store.resetProgress(f.item, 230);
  const peer = new DataStore().getData(f.item);
  assert.deepEqual(peer.bookmark, mark); assert.equal(peer.v, 4); assert.equal(peer.important, true);
  assert.equal(peer.s, 'skimmed'); assert.equal(peer.lastReadAt, 200);
  assert.match(f.extra(), /^Custom: retained\n/);
});
test('bookmark undo is conditional and cannot overwrite a newer edit from another client', async () => {
  const f = fixture();
  await f.store.setReadingBookmark(f.item, mark);
  const next = { ...mark, page: 15, at: 200 };
  await f.store.setReadingBookmark(f.item, next);
  assert.equal(await f.store.setReadingBookmark(f.item, null, mark), false);
  assert.deepEqual(f.store.getData(f.item).bookmark, next);
  assert.equal(await f.store.setReadingBookmark(f.item, mark, next), true);
  assert.equal(await f.store.setReadingBookmark(f.item, null, mark), true);
  assert.equal(f.store.getData(f.item).bookmark, undefined);
});
test('legacy browsing is not converted to a bookmark; invalid and readonly changes are refused', async () => {
  const f = fixture({ ...DEFAULT_FLOW_DATA, lastAttachmentId: '42', lastPage: 12, p: {42: .4} });
  const original = f.extra();
  assert.equal(f.store.getData(f.item).bookmark, undefined); assert.equal(f.extra(), original);
  for (const bad of [{...mark, page: 0}, {...mark, page: 31}, {...mark, attachmentKey: ''}]) {
    assert.equal(await f.store.setReadingBookmark(f.item, bad), false); assert.equal(f.extra(), original);
  }
  (f.item as any).isEditable = () => false;
  assert.equal(await f.store.setReadingBookmark(f.item, mark), false); assert.equal(f.extra(), original);
});

import { ResumeReader } from '../src/resumeReader';
import { ReadingBookmarkManager, visiblePDFPosition } from '../src/readingBookmarkManager';
import { formatReadingBookmark, formatPDFPosition, resolveReadingStatus } from '../src/flowData';
import { calculateStatisticsSnapshot } from '../src/statistics';
function readerFixture() {
  const f = fixture({ ...DEFAULT_FLOW_DATA, lastAttachmentId: '42', lastPage: 28, p: {42: 28/30}, pageCount: {42: 30} });
  const pdf: any = { id: 42, key: mark.attachmentKey, parentID: f.item.id, isPDFAttachment: () => true, fileExists: async () => true, attachmentFilename: 'reading.pdf' };
  const parent: any = f.item; parent.libraryID = 1; parent.isRegularItem = () => true; parent.getBestAttachment = async () => pdf;
  let page = 12; const app = { pdfViewer: { get currentPageNumber() { return page; } }, pdfDocument: { numPages: 30 } };
  const live: any = { itemID: 42, _type: 'pdf', PDFViewerApplication: app };
  const items = new Map<number, any>([[parent.id, parent], [pdf.id, pdf]]), opens: any[] = [];
  (globalThis as any).Zotero = { debug() {}, Items: { get: (id: number) => items.get(id), getByLibraryAndKey: (library: number, key: string) => library === 1 ? [...items.values()].find(i => i.key === key) : null }, Reader: { _readers: [live], open: async (...args: any[]) => { opens.push(args); } } };
  return { ...f, parent, pdf, live, items, opens, move: (to: number) => { page = to; } };
}
test('one-click capture uses live page before debounce and default resume keeps bookmark while last viewed remains separately actionable', async () => {
  const f = readerFixture(), manager = new ReadingBookmarkManager(f.store), reader = new ResumeReader(f.store);
  assert.equal(await manager.saveCurrent(f.parent), true);
  f.move(28);
  await f.store.recordProgress(f.parent, { attachmentId: '42', progress: 28/30, lastPage: 28, pageCount: 30, at: Date.now() });
  const main = await reader.getResumeDisplayTarget(f.parent), last = await reader.getResumeDisplayTarget(f.parent, 'last-viewed');
  assert.equal(main.positionKind, 'bookmark'); assert.equal(main.lastPage, 12); assert.match(main.fallbackLabel, /Reading bookmark/);
  assert.equal(last.positionKind, 'last-viewed'); assert.equal(last.lastPage, 28);
  assert.equal(await reader.executeTarget(main), true); assert.equal(await reader.executeTarget(last), true);
  assert.deepEqual(f.opens, [[42, {pageIndex: 11}], [42, {pageIndex: 27}]]);
  const data = f.store.getData(f.parent);
  assert.equal(formatReadingBookmark(data), 'Reading bookmark: page 12 / 30');
  assert.equal(formatPDFPosition(data), 'Last viewed: page 28 / 30');
  assert.equal(resolveReadingStatus(data).status, 'reading');
  const snap = calculateStatisticsSnapshot([{id: f.item.id, flowData: data}]);
  assert.equal(snap.statusCounts.read, 0);
  assert.equal(snap.history.recentProgress[0].bookmarkText, formatReadingBookmark(data));
  assert.equal(snap.history.recentProgress[0].positionText, formatPDFPosition(data));
  assert.equal(await manager.undoChange(f.parent), true);
  assert.equal((await reader.getResumeDisplayTarget(f.parent)).lastPage, 28);
});
test('bookmark resolves on a peer using attachment key, never its old numeric item ID or another PDF', async () => {
  const f = readerFixture(); await f.store.setReadingBookmark(f.parent, mark);
  f.items.delete(42); f.pdf.id = 99; f.items.set(99, f.pdf);
  const reader = new ResumeReader(f.store);
  assert.equal((await reader.getResumeDisplayTarget(f.parent)).attachmentId, 99);
  const other = { ...f.pdf, id: 77, key: 'OTHER234', parentID: f.parent.id };
  f.items.set(77, other);
  assert.notEqual((await reader.getResumeDisplayTarget(other)).lastPage, 12);
  f.pdf.deleted = true;
  assert.equal((await reader.getResumeDisplayTarget(f.parent)).action, 'none');
  assert.equal(f.opens.length, 0);
});
test('a stale bookmark button cannot open a changed bookmark and a missing PDF never silently opens another file', async () => {
  const f = readerFixture(); await f.store.setReadingBookmark(f.parent, mark);
  const reader = new ResumeReader(f.store), old = await reader.getResumeDisplayTarget(f.parent);
  await f.store.setReadingBookmark(f.parent, {...mark, page: 15});
  assert.equal(await reader.executeTarget(old), false); assert.equal(f.opens.length, 0);
  f.pdf.fileExists = async () => false;
  assert.equal((await reader.getResumeDisplayTarget(f.parent)).action, 'none');
});
test('capture refuses stale opening state, ambiguous open PDFs and readonly parents', async () => {
  assert.equal(visiblePDFPosition({_type: 'pdf', _state: {pageIndex: 99}}), null);
  const f = readerFixture(), manager = new ReadingBookmarkManager(f.store);
  const other = {...f.pdf, id: 77, key: 'OTHER234'}; f.items.set(77, other);
  (globalThis as any).Zotero.Reader._readers.push({...f.live, itemID: 77});
  assert.equal(await manager.saveCurrent(f.parent), false);
  assert.equal(await manager.saveCurrent(f.parent, f.live), true);
  f.parent.isEditable = () => false; f.move(18);
  assert.equal(await manager.saveCurrent(f.parent, f.live), false);
  assert.equal(f.store.getData(f.parent).bookmark?.page, 12);
});
test('the last page bookmark is still a bookmark, not a completion or pages-read total', async () => {
  const f = readerFixture(); f.move(30); const manager = new ReadingBookmarkManager(f.store);
  await manager.saveCurrent(f.parent);
  const data = f.store.getData(f.parent);
  assert.equal(data.s, null); assert.equal(data.history, undefined);
  assert.doesNotMatch(formatReadingBookmark(data), /100%|read complete|pages read/i);
  assert.equal(calculateStatisticsSnapshot([{id: 1, flowData: data}]).statusCounts.read, 0);
});
test('invalid v4 bookmark payload remains byte-for-byte readonly', async () => {
  const f = fixture({...DEFAULT_FLOW_DATA, v: 4, important: false, bookmark: {...mark, page: 50}}), before = f.extra();
  assert.equal(f.store.getData(f.item).availability, 'unavailable');
  assert.equal(await f.store.setReadingBookmark(f.item, mark), false); assert.equal(f.extra(), before);
});

class Node {
  children: Node[] = []; textContent = ''; title = ''; disabled = false; type = ''; style: any = {}; listeners: any = {}; attributes: any = {};
  constructor(public tag: string) {}
  focus() { doc.activeElement = this; }
  append(...nodes: Node[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: Node[]) { this.children = nodes; }
  setAttribute(k: string, v: string) { this.attributes[k] = v; }
  addEventListener(k: string, fn: any) { this.listeners[k] = fn; }
  querySelectorAll(tag: string): Node[] { return this.children.flatMap(n => [...(n.tag === tag ? [n] : []), ...n.querySelectorAll(tag)]); }
}
const doc: any = { createElementNS: (_: string, tag: string) => new Node(tag) };
test('save-time panel replacement keeps Undo available; failed changes never replace the previous bookmark', async () => {
  const f = readerFixture(), manager = new ReadingBookmarkManager(f.store);
  let visible: any;
  f.parent.saveTx = async () => { f.store.invalidateCache(f.parent.id); visible = manager.controls(doc, f.parent); };
  await manager.saveCurrent(f.parent);
  assert.ok(visible.querySelectorAll('button').some((b: any) => b.textContent === 'Undo bookmark change'));
  await manager.undoChange(f.parent);
  assert.equal(f.store.getData(f.parent).bookmark, undefined);
  f.parent.saveTx = async () => { throw new Error('disk'); };
  await assert.rejects(manager.saveCurrent(f.parent));
  assert.equal(f.store.getData(f.parent).bookmark, undefined);
});
test('toolbar created before PDF page readiness stays operable and captures the page at click time', async () => {
  const f = readerFixture(), manager = new ReadingBookmarkManager(f.store);
  f.live.PDFViewerApplication = null;
  const controls: any = manager.controls(doc, f.parent, f.live);
  const button = controls.querySelectorAll('button')[0]; assert.equal(button.disabled, false);
  f.live.PDFViewerApplication = {page: 7, pdfDocument:{numPages:30}};
  await button.listeners.click();
  assert.equal(f.store.getData(f.parent).bookmark?.page, 7);
});


test('automatic page notifications preserve the focused bookmark action', () => {
  const f = readerFixture(), manager = new ReadingBookmarkManager(f.store);
  let notice: any;
  (globalThis as any).Zotero.Notifier = {registerObserver: (o: any) => { notice = o; return 'bookmark'; }, unregisterObserver() {}};
  (globalThis as any).Zotero.Reader.registerEventListener = () => {};
  (globalThis as any).Zotero.Reader.unregisterEventListener = () => {};
  manager.register();
  const box: any = manager.controls(doc, f.parent, f.live);
  doc.activeElement = box.querySelectorAll('button')[0];
  notice.notify('pageChange', 'file', [42]);
  assert.equal(doc.activeElement, box.querySelectorAll('button')[0]);
  assert.equal(doc.activeElement.textContent, 'Bookmark here');
  manager.unregister(); doc.activeElement = null;
});


test('bookmark changes and Undo refresh the visible list after persistence, not only during the save notification', async () => {
  const f = readerFixture(), manager = new ReadingBookmarkManager(f.store);
  let listPage: number | undefined, refreshes = 0;
  (globalThis as any).Zotero.ItemTreeManager = {refreshColumns: () => {refreshes++; listPage = f.store.getData(f.parent).bookmark?.page;}};
  await manager.saveCurrent(f.parent); assert.equal(listPage, 12);
  f.move(28); await manager.saveCurrent(f.parent); assert.equal(listPage, 28);
  await manager.undoChange(f.parent); assert.equal(listPage, 12);
  assert.equal(refreshes, 3);
});
