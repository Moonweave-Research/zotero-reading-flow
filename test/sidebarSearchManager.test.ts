import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SidebarSearchManager } from '../src/sidebarSearchManager';
import { READING_FLOW_PREFS } from '../src/preferences';

function runtime(initialReference = '') {
  const prefSets: unknown[][] = [];
  const searches: any[] = [];
  class Search {
    libraryID = 0;
    name = '';
    key = 'SEARCHKEY';
    conditions: unknown[][] = [];
    addCondition(...condition: unknown[]) { this.conditions.push(condition); }
    async saveTx() { searches.push(this); }
  }
  (globalThis as any).Zotero = {
    Search,
    Searches: { getByLibraryAndKey: () => null },
    getActiveZoteroPane: () => ({ getSelectedLibraryID: () => 1 }),
    getMainWindow: () => null,
    Libraries: { get: (libraryID: number) => ({ name: `Library ${libraryID}`, editable: true }) },
    Prefs: {
      get: (name: string, global: boolean) => {
        assert.equal(global, true);
        return name === READING_FLOW_PREFS.sidebarSearchKey ? initialReference : undefined;
      },
      set: (...args: unknown[]) => prefSets.push(args)
    }
  };
  return { prefSets, searches };
}

test('creates a clearly named tracked-papers search and reports where to find it', async () => {
  const { prefSets, searches } = runtime();
  const message = await new SidebarSearchManager().create();

  assert.match(message, /Created “Reading Flow — Tracked Papers”/);
  assert.match(message, /Saved Searches in the left sidebar/);
  assert.equal(searches.length, 1);
  assert.equal(searches[0].libraryID, 1);
  assert.equal(searches[0].name, 'Reading Flow — Tracked Papers');
  assert.deepEqual(searches[0].conditions, [
    ['extra', 'contains', 'ReadingFlow:'],
    ['noChildren', 'true', ''],
    ['itemType', 'isNot', 'attachment'],
    ['itemType', 'isNot', 'note']
  ]);
  assert.deepEqual(prefSets, [[
    READING_FLOW_PREFS.sidebarSearchKey,
    JSON.stringify({ 1: 'SEARCHKEY' }),
    true
  ]]);
});

test('reports whether the selected library has a sidebar search', async () => {
  const manager = new SidebarSearchManager();
  assert.match(await manager.status(), /Not added to “Library 1”/);

  const reference = JSON.stringify({ 1: 'OWNEDKEY' });
  runtime(reference);
  (globalThis as any).Zotero.Searches.getByLibraryAndKey = () => ({
    key: 'OWNEDKEY',
    name: 'Reading Flow — Tracked Papers'
  });
  assert.match(await manager.status(), /Added to “Library 1”/);
});

test('renames only the tracked legacy sidebar search when its status is checked', async () => {
  const reference = JSON.stringify({ 1: 'OWNEDKEY' });
  runtime(reference);
  let saves = 0;
  const tracked = {
    key: 'OWNEDKEY',
    name: 'Reading Flow Metadata',
    async saveTx() { saves += 1; }
  };
  (globalThis as any).Zotero.Searches.getByLibraryAndKey = () => tracked;

  assert.match(await new SidebarSearchManager().status(), /Added to “Library 1”/);
  assert.equal(tracked.name, 'Reading Flow — Tracked Papers');
  assert.equal(saves, 1);
});

test('puts the sidebar list control before secondary appearance settings and states its limits', () => {
  const prefs = readFileSync('addon/prefs.xhtml', 'utf8');
  assert.ok(prefs.indexOf('Reading list in the left sidebar') < prefs.indexOf('Completed color'));
  assert.match(prefs, /Add to Left Sidebar/);
  assert.match(prefs, /under <html:strong>Saved Searches<\/html:strong>/);
  assert.match(prefs, /not an exact status-filtered folder/);
  assert.match(prefs, /refreshSidebarSearchStatus/);
});

test('uses Zotero 10 selected-library IDs API when the removed singular API is unavailable', async () => {
  const { searches } = runtime();
  (globalThis as any).Zotero.getActiveZoteroPane = () => ({
    getSelectedLibraryIDs: () => [7]
  });

  assert.match(await new SidebarSearchManager().create(), /Created/);
  assert.equal(searches[0].libraryID, 7);
});

test('removes only the exact tracked saved search and clears its reference', async () => {
  let erased = 0;
  const reference = JSON.stringify({ libraryID: 3, key: 'OWNEDKEY' });
  const { prefSets } = runtime(reference);
  (globalThis as any).Zotero.getActiveZoteroPane = () => ({ getSelectedLibraryID: () => 3 });
  (globalThis as any).Zotero.Searches.getByLibraryAndKey = (libraryID: number, key: string) => {
    assert.deepEqual([libraryID, key], [3, 'OWNEDKEY']);
    return { async eraseTx() { erased += 1; } };
  };

  await new SidebarSearchManager().remove();
  assert.equal(erased, 1);
  assert.deepEqual(prefSets, [[READING_FLOW_PREFS.sidebarSearchKey, '', true]]);
});

test('reuses a tracked saved search instead of creating duplicates', async () => {
  const reference = JSON.stringify({ libraryID: 1, key: 'OWNEDKEY' });
  const { searches } = runtime(reference);
  (globalThis as any).Zotero.Searches.getByLibraryAndKey = () => ({ key: 'OWNEDKEY' });

  assert.match(await new SidebarSearchManager().create(), /already added/);
  assert.equal(searches.length, 0);
});

test('creates a separate shortcut for a different selected library', async () => {
  const reference = JSON.stringify({ libraryID: 1, key: 'LIBRARY1' });
  const { searches, prefSets } = runtime(reference);
  (globalThis as any).Zotero.getActiveZoteroPane = () => ({
    getSelectedLibraryIDs: () => [2]
  });
  (globalThis as any).Zotero.Searches.getByLibraryAndKey = () => ({ key: 'LIBRARY1' });

  assert.match(await new SidebarSearchManager().create(), /Created/);
  assert.equal(searches.length, 1);
  assert.equal(searches[0].libraryID, 2);
  assert.deepEqual(JSON.parse(prefSets.at(-1)?.[1] as string), {
    1: 'LIBRARY1',
    2: 'SEARCHKEY'
  });
});

test('remove affects only the currently selected library shortcut', async () => {
  let erased = 0;
  const reference = JSON.stringify({ 1: 'LIBRARY1', 2: 'LIBRARY2' });
  const { prefSets } = runtime(reference);
  (globalThis as any).Zotero.getActiveZoteroPane = () => ({
    getSelectedLibraryIDs: () => [2]
  });
  (globalThis as any).Zotero.Searches.getByLibraryAndKey = (libraryID: number, key: string) => ({
    async eraseTx() {
      assert.deepEqual([libraryID, key], [2, 'LIBRARY2']);
      erased += 1;
    }
  });

  assert.match(await new SidebarSearchManager().remove(), /Removed/);
  assert.equal(erased, 1);
  assert.deepEqual(JSON.parse(prefSets.at(-1)?.[1] as string), { 1: 'LIBRARY1' });
});

test('reports Zotero save failures without leaving an unhandled preference reference', async () => {
  const { prefSets } = runtime();
  (globalThis as any).Zotero.Search.prototype.saveTx = async () => {
    throw new Error('library is read-only');
  };

  assert.match(await new SidebarSearchManager().create(), /library is read-only/);
  assert.deepEqual(prefSets, []);
});

test('rejects a read-only selected library before attempting to save', async () => {
  const { searches } = runtime();
  (globalThis as any).Zotero.Libraries.get = () => ({ name: 'Read-only Group', editable: false });

  assert.match(await new SidebarSearchManager().create(), /read-only/);
  assert.equal(searches.length, 0);
});
