import test from 'node:test';
import assert from 'node:assert/strict';
import { DataStore } from '../src/dataStore';
import { FLOW_PREFIX } from '../src/flowData';

function environment(initial?: string) {
  const files = new Map<string, string>();
  if (initial !== undefined) files.set('/profile/reading-flow-private.json', initial);
  let fail = false;
  (globalThis as any).PathUtils = { profileDir: '/profile', join: (...parts: string[]) => parts.join('/') };
  (globalThis as any).IOUtils = {
    exists: async (path: string) => files.has(path),
    readUTF8: async (path: string) => files.get(path),
    writeUTF8: async (path: string, value: string, options: any) => {
      assert.equal(options.tmpPath, path + '.tmp'); assert.equal(options.flush, true);
      if (fail) throw new Error('disk failure'); files.set(path, value);
    }
  };
  (globalThis as any).Zotero = { Libraries: { get: (id: number) => ({ libraryType: id === 1 ? 'user' : 'group', groupID: id + 100 }) }, debug() {} };
  return { files, fail: (value: boolean) => { fail = value; } };
}
function item(id = 1, libraryID = 2, key = 'AAAABBBB', editable = false) {
  const extra = 'Custom: team\n' + FLOW_PREFIX + '{"v":1,"p":{},"s":"read"}';
  return { id, libraryID, key, isEditable: () => editable, isRegularItem: () => true,
    getField: () => extra, setField() { throw new Error('shared Extra must not be written'); },
    saveTx() { throw new Error('shared item must not be saved'); } };
}

test('group records are private, writable in read-only groups, persistent and independent of shared Extra', async () => {
  environment(); const store = new DataStore(); await store.initialize(); const paper = item();
  assert.equal(store.getData(paper).s, null); assert.equal(store.hasReadingFlowData(paper), false);
  assert.equal(await store.setStatus(paper, 'reading', 100), true);
  assert.equal(await store.setImportant(paper, true, 110), true);
  assert.equal(await store.setReadingBookmark(paper, { attachmentKey: 'CCCCDDDD', page: 3, pageCount: 10, at: 120 }), true);
  assert.equal(await store.recordProgress(paper, { attachmentId: 'key:CCCCDDDD', progress: .6, pageCount: 10, lastPage: 6, at: 130 }), true);
  const peer = new DataStore(); await peer.initialize();
  assert.deepEqual(peer.getData(paper), store.getData(paper));
  assert.equal(peer.getData(item(9, 3)).s, null, 'same item key in another group is independent');
  assert.equal(peer.getData(item(10, 2, 'EEEEFFFF')).s, null);
  const freshProfile = environment(); const separate = new DataStore(); await separate.initialize();
  assert.equal(separate.getData(paper).s, null); assert.equal(freshProfile.files.size, 0, 'viewing does not create records');
});

test('private group writes serialize across items and recover after a failed durable save', async () => {
  const env = environment(); const store = new DataStore(); await store.initialize();
  const a = item(), b = item(2, 2, 'CCCCDDDD');
  await Promise.all([store.setStatus(a, 'to-read'), store.setStatus(b, 'skimmed')]);
  const before = env.files.get('/profile/reading-flow-private.json');
  env.fail(true); await assert.rejects(store.setStatus(a, 'read'), /disk failure/);
  assert.equal(store.getData(a).s, 'to-read'); assert.equal(env.files.get('/profile/reading-flow-private.json'), before);
  env.fail(false); assert.equal(await store.setImportant(b, true), true);
  const peer = new DataStore(); await peer.initialize();
  assert.equal(peer.getData(a).s, 'to-read'); assert.equal(peer.getData(b).s, 'skimmed'); assert.equal(peer.getData(b).important, true);
});

test('corrupt or newer private storage is unavailable and never overwritten', async () => {
  for (const raw of ['{bad', '{"v":99,"records":{}}']) {
    const env = environment(raw), store = new DataStore(); await store.initialize();
    assert.equal(store.getData(item()).availability, 'unavailable');
    assert.equal(await store.setStatus(item(), 'reading'), false);
    assert.equal(env.files.get('/profile/reading-flow-private.json'), raw);
  }
});

test('unknown private record preserves bytes while another group record can be written', async () => {
  const raw = FLOW_PREFIX + '{"v":99}';
  const env = environment(JSON.stringify({ v: 1, records: { '102/AAAABBBB': raw } }));
  const store = new DataStore(); await store.initialize();
  assert.equal(store.getData(item()).availability, 'unavailable');
  assert.equal(await store.setStatus(item(), 'read'), false);
  assert.equal(await store.setStatus(item(2, 3), 'reading'), true);
  assert.equal(JSON.parse(env.files.get('/profile/reading-flow-private.json')!).records['102/AAAABBBB'], raw);
});

test('private records support automatic completion, clear and pending-position reset guards', async () => {
  environment(); const store = new DataStore(); await store.initialize(); const paper = item();
  await store.recordSnapshotOpening(paper, 100);
  await store.recordAutomaticRead(paper, { attachmentKey: 'CCCCDDDD', at: 200 });
  assert.equal(store.getData(paper).automaticRead?.at, 200);
  await store.clearAutomaticRead(paper);
  assert.equal(store.getData(paper).automaticRead, undefined); assert.equal(store.getData(paper).snapshotOpenedAt, 100);
  await store.recordProgress(paper, { attachmentId: 'key:CCCCDDDD', progress: .5, lastPage: 5, at: 300 });
  await store.resetProgress(paper, 400);
  assert.equal(await store.recordProgressUnlessResetAfter(paper, { attachmentId: 'key:CCCCDDDD', progress: .8, at: 500 }, 350), false);
  assert.deepEqual(store.getData(paper).p, {});
  (paper as any).deleted = true;
  assert.equal(await store.setStatus(paper, 'read'), false);
});

import { ReadingFlowMenuManager } from '../src/menuManager';
import { createDashboardBridge } from '../src/bootstrap';

test('group context-menu writes and statistics use personal state rather than shared Extra', async () => {
  environment(); const store = new DataStore(); await store.initialize(); const paper = item(); const menus: any[] = [];
  Object.assign((globalThis as any).Zotero, {
    Items: { get: () => paper }, getActiveZoteroPane: () => ({ getSelectedItems: () => [paper] }),
    MenuManager: { registerMenu: (m: any) => { menus.push(m); return m.menuID; } },
    ItemTreeManager: { refreshColumns() {} }, Notifier: { trigger() {} }
  });
  new ReadingFlowMenuManager(store).register();
  const entry = menus.flatMap(m => m.menus).flatMap(m => m.menus ?? []).find(m => m.l10nID === 'reading-flow-status-to-read');
  assert.ok(entry); await entry.onCommand(new Event('command'), { items: [paper] });
  assert.equal(store.getData(paper).s, 'to-read');
  const bridge = createDashboardBridge({ scopeAdapter: { getItems: async () => [paper] }, dataStore: store, resumeReader: { resume: async () => false } });
  const snapshot: any = await bridge.getSnapshot('entire-library', 'all-time', 'to-read');
  assert.equal(snapshot.totalPapers, 1);
});

test('group creation defaults and empty-record removal use only private storage', async () => {
  const env = environment(); const store = new DataStore(); await store.initialize(); const paper = item();
  assert.equal(await store.initializeStatusIfUnowned(paper, 'to-read'), true);
  assert.equal(await store.initializeStatusIfUnowned(paper, 'read'), false);
  assert.equal(store.hasReadingFlowNamespace(paper), true);
  assert.equal(await store.clearManualStatus(paper), true);
  assert.equal(store.hasReadingFlowNamespace(paper), false);
  assert.deepEqual(JSON.parse(env.files.get('/profile/reading-flow-private.json')!).records, {});
  const missingKey = { ...paper, key: '' }; assert.equal(await store.setStatus(missingKey, 'read'), false);
});
