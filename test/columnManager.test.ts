import test from 'node:test';
import assert from 'node:assert/strict';
import { ColumnManager } from '../src/columnManager';

test('showColumnsOnFirstRun retries until itemsView exists and persists visible columns', async () => {
  const prefWrites: Array<[string, unknown]> = [];
  let resetCalls = 0;
  let writeCalls = 0;
  let paneLookups = 0;
  (globalThis as any).CSS = {
    escape: (value: string) => value.replace(/@/g, '\\@').replace(/\./g, '\\.')
  };

  const itemsView = {
    id: 'item-tree-main-default',
    _columnPrefs: {},
    async _resetColumns() {
      resetCalls++;
    },
    async _writeColumnPrefsToFile(force: boolean) {
      assert.equal(force, true);
      writeCalls++;
    }
  };

  (globalThis as any).Zotero = {
    Prefs: {
      get(pref: string) {
        if (pref === 'extensions.readingflow.columnsInitialized') return false;
        return undefined;
      },
      set(pref: string, value: unknown) {
        prefWrites.push([pref, value]);
      }
    },
    uiReadyPromise: Promise.resolve(),
    getActiveZoteroPane() {
      paneLookups++;
      if (paneLookups < 3) {
        return {};
      }
      return { itemsView };
    },
    ItemTreeManager: {
      unregisterColumn() {}
    },
    debug() {},
    logError() {}
  };

  const manager = new ColumnManager({} as any);
  (manager as any).delay = async () => {};

  await (manager as any).showColumnsOnFirstRun(['progressKey', 'statusKey']);

  assert.deepEqual(itemsView._columnPrefs, {
    progressKey: { hidden: false },
    'readingflow@moon.com-progressKey': { hidden: false },
    'readingflow\\@moon\\.com-progressKey': { hidden: false },
    statusKey: { hidden: false },
    'readingflow@moon.com-statusKey': { hidden: false },
    'readingflow\\@moon\\.com-statusKey': { hidden: false }
  });
  assert.equal(resetCalls, 1);
  assert.equal(writeCalls, 1);
  assert.deepEqual(prefWrites, [['extensions.readingflow.columnsInitialized', true]]);
  assert.equal(paneLookups, 3);
});

test('showColumnsOnFirstRun leaves pref unset when itemsView never appears', async () => {
  const prefWrites: Array<[string, unknown]> = [];
  let paneLookups = 0;

  (globalThis as any).Zotero = {
    Prefs: {
      get(pref: string) {
        if (pref === 'extensions.readingflow.columnsInitialized') return false;
        return undefined;
      },
      set(pref: string, value: unknown) {
        prefWrites.push([pref, value]);
      }
    },
    uiReadyPromise: Promise.resolve(),
    getActiveZoteroPane() {
      paneLookups++;
      return {};
    },
    ItemTreeManager: {
      unregisterColumn() {}
    },
    debug() {},
    logError() {}
  };

  const manager = new ColumnManager({} as any);
  (manager as any).delay = async () => {};

  await (manager as any).showColumnsOnFirstRun(['progressKey']);

  assert.deepEqual(prefWrites, []);
  assert.equal(paneLookups, 120);
});

test('showColumnsOnFirstRun can succeed on a later retry after an earlier miss', async () => {
  const prefWrites: Array<[string, unknown]> = [];
  let paneMode: 'missing' | 'ready' = 'missing';
  let resetCalls = 0;
  let writeCalls = 0;
  (globalThis as any).CSS = {
    escape: (value: string) => value.replace(/@/g, '\\@').replace(/\./g, '\\.')
  };

  const itemsView = {
    id: 'item-tree-main-default',
    _columnPrefs: {},
    async _resetColumns() {
      resetCalls++;
    },
    async _writeColumnPrefsToFile(force: boolean) {
      assert.equal(force, true);
      writeCalls++;
    }
  };

  (globalThis as any).Zotero = {
    Prefs: {
      get(pref: string) {
        if (pref === 'extensions.readingflow.columnsInitialized') return false;
        return undefined;
      },
      set(pref: string, value: unknown) {
        prefWrites.push([pref, value]);
      }
    },
    uiReadyPromise: Promise.resolve(),
    getActiveZoteroPane() {
      return paneMode === 'ready' ? { itemsView } : {};
    },
    ItemTreeManager: {
      unregisterColumn() {}
    },
    debug() {},
    logError() {}
  };

  const manager = new ColumnManager({} as any);
  (manager as any).delay = async () => {};

  await (manager as any).showColumnsOnFirstRun(['progressKey']);
  assert.deepEqual(prefWrites, []);

  paneMode = 'ready';
  await (manager as any).showColumnsOnFirstRun(['progressKey']);

  assert.deepEqual(itemsView._columnPrefs, {
    progressKey: { hidden: false },
    'readingflow@moon.com-progressKey': { hidden: false },
    'readingflow\\@moon\\.com-progressKey': { hidden: false }
  });
  assert.equal(resetCalls, 1);
  assert.equal(writeCalls, 1);
  assert.deepEqual(prefWrites, [['extensions.readingflow.columnsInitialized', true]]);
});

test('delay uses Zotero main window timer when global setTimeout is unavailable', async () => {
  const originalSetTimeout = (globalThis as any).setTimeout;
  let scheduled = 0;

  (globalThis as any).Zotero = {
    getMainWindow() {
      return {
        setTimeout(callback: () => void) {
          scheduled++;
          callback();
          return 1;
        }
      };
    }
  };

  const manager = new ColumnManager({} as any);
  (globalThis as any).setTimeout = undefined;

  await (manager as any).delay(10);

  assert.equal(scheduled, 1);
  (globalThis as any).setTimeout = originalSetTimeout;
});
