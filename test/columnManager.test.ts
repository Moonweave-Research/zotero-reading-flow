import test from 'node:test';
import assert from 'node:assert/strict';
import { ColumnManager } from '../src/columnManager';

test('register adds Flow as the primary Reading Flow column', async () => {
  const registeredColumns: any[] = [];
  (globalThis as any).Zotero = {
    Prefs: {
      get(pref: string) {
        if (pref === 'extensions.readingflow.columnsInitialized') return true;
        return undefined;
      },
      set() {}
    },
    ItemTreeManager: {
      async registerColumn(config: any) {
        registeredColumns.push(config);
        return `${config.pluginID}-${config.dataKey}`;
      },
      unregisterColumn() {}
    }
  };

  const manager = new ColumnManager({
    getData() {
      return {
        v: 1,
        p: { '10': 0.45 },
        c: null,
        s: null,
        priority: 'high',
        ts: 0,
        lastAttachmentId: '10',
        lastPage: 9,
        lastReadAt: Date.parse('2026-06-03T12:00:00Z')
      };
    }
  } as any);

  await manager.register();

  assert.equal(registeredColumns[0].dataKey, 'readingFlowFlow');
  assert.equal(registeredColumns[0].label, 'Flow');
  assert.deepEqual(registeredColumns.map((column) => column.dataKey), [
    'readingFlowFlow',
    'readingFlowProgress',
    'readingFlowStatus',
    'readingFlowLastRead'
  ]);
  assert.deepEqual(registeredColumns.map((column) => column.label), [
    'Flow',
    'Progress',
    'State',
    'Last Read'
  ]);
});

test('Flow column renders action label, percent detail, and tooltip', async () => {
  const registeredColumns: any[] = [];
  const fakeDoc = {
    createElement() {
      return {
        className: '',
        style: { cssText: '' },
        children: [] as any[],
        appendChild(child: any) {
          this.children.push(child);
        },
        textContent: '',
        title: ''
      };
    }
  } as any;

  (globalThis as any).Zotero = {
    Prefs: {
      get(pref: string) {
        if (pref === 'extensions.readingflow.columnsInitialized') return true;
        return undefined;
      },
      set() {}
    },
    ItemTreeManager: {
      async registerColumn(config: any) {
        registeredColumns.push(config);
        return `${config.pluginID}-${config.dataKey}`;
      },
      unregisterColumn() {}
    }
  };

  const manager = new ColumnManager({
    getData() {
      return {
        v: 1,
        p: { '10': 0.45 },
        pageCount: { '10': 20 },
        c: null,
        s: null,
        priority: null,
        ts: 0,
        lastAttachmentId: '10',
        lastPage: 9,
        lastReadAt: Date.now()
      };
    }
  } as any);

  await manager.register();
  const flowColumn = registeredColumns.find((column) => column.dataKey === 'readingFlowFlow');
  const serialized = flowColumn.dataProvider({ isRegularItem: () => true }, 'readingFlowFlow');
  const cell = flowColumn.renderCell(0, serialized, { className: 'custom-flow' }, false, fakeDoc);

  assert.equal(cell.className, 'cell custom-flow');
  assert.equal(cell.children[0].textContent, 'Resume');
  assert.match(cell.style.cssText, /padding:0 2px/);
  assert.match(cell.children[0].style.cssText, /min-width:0/);
  assert.equal(cell.children[1].textContent, '45%');
  assert.match(cell.title, /45% read/);
  assert.match(cell.title, /page 9 \/ 20/);
});

test('Flow column renders tone styles for urgent actions', async () => {
  const registeredColumns: any[] = [];
  const fakeDoc = {
    createElement() {
      return {
        className: '',
        style: { cssText: '' },
        children: [] as any[],
        appendChild(child: any) {
          this.children.push(child);
        },
        textContent: '',
        title: ''
      };
    }
  } as any;

  (globalThis as any).Zotero = {
    Prefs: {
      get(pref: string) {
        if (pref === 'extensions.readingflow.columnsInitialized') return true;
        return undefined;
      },
      set() {}
    },
    ItemTreeManager: {
      async registerColumn(config: any) {
        registeredColumns.push(config);
        return `${config.pluginID}-${config.dataKey}`;
      },
      unregisterColumn() {}
    }
  };

  const manager = new ColumnManager({
    getData() {
      return {
        v: 1,
        p: {},
        c: null,
        s: null,
        priority: 'high',
        ts: 0,
        lastAttachmentId: null,
        lastPage: null,
        lastReadAt: null
      };
    }
  } as any);

  await manager.register();
  const flowColumn = registeredColumns.find((column) => column.dataKey === 'readingFlowFlow');
  const serialized = flowColumn.dataProvider({ isRegularItem: () => true }, 'readingFlowFlow');
  const cell = flowColumn.renderCell(0, serialized, { className: 'custom-flow' }, false, fakeDoc);

  assert.equal(cell.style.color, '#b91c1c');
  assert.match(cell.children[0].style.cssText, /font-weight:600/);
});

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
  assert.deepEqual(prefWrites, [
    ['extensions.readingflow.flowColumnInitialized', true],
    ['extensions.readingflow.columnsInitialized', true]
  ]);
  assert.equal(paneLookups, 3);
});

test('showColumnsOnFirstRun gives Flow enough default width for action labels', async () => {
  const prefWrites: Array<[string, unknown]> = [];
  (globalThis as any).CSS = {
    escape: (value: string) => value.replace(/@/g, '\\@').replace(/\./g, '\\.')
  };

  const itemsView = {
    id: 'item-tree-main-default',
    _columnPrefs: {},
    async _resetColumns() {},
    async _writeColumnPrefsToFile(force: boolean) {
      assert.equal(force, true);
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

  await (manager as any).showColumnsOnFirstRun(['readingFlowFlow']);

  assert.deepEqual(itemsView._columnPrefs, {
    readingFlowFlow: { hidden: false, width: 180 },
    'readingflow@moon.com-readingFlowFlow': { hidden: false, width: 180 },
    'readingflow\\@moon\\.com-readingFlowFlow': { hidden: false, width: 180 }
  });
  assert.deepEqual(prefWrites, [
    ['extensions.readingflow.flowColumnInitialized', true],
    ['extensions.readingflow.columnsInitialized', true]
  ]);
});

test('showColumnsOnFirstRun shows Flow for existing installs with old columnsInitialized pref', async () => {
  const prefWrites: Array<[string, unknown]> = [];
  (globalThis as any).CSS = {
    escape: (value: string) => value.replace(/@/g, '\\@').replace(/\./g, '\\.')
  };

  const itemsView = {
    id: 'item-tree-main-default',
    _columnPrefs: {},
    async _resetColumns() {},
    async _writeColumnPrefsToFile(force: boolean) {
      assert.equal(force, true);
    }
  };

  (globalThis as any).Zotero = {
    Prefs: {
      get(pref: string) {
        if (pref === 'extensions.readingflow.columnsInitialized') return true;
        if (pref === 'extensions.readingflow.flowColumnInitialized') return false;
        return undefined;
      },
      set(pref: string, value: unknown) {
        prefWrites.push([pref, value]);
      }
    },
    uiReadyPromise: Promise.resolve(),
    getActiveZoteroPane() {
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

  await (manager as any).showColumnsOnFirstRun(['readingFlowFlow']);

  assert.equal(itemsView._columnPrefs['readingflow\\@moon\\.com-readingFlowFlow'].hidden, false);
  assert.equal(itemsView._columnPrefs['readingflow\\@moon\\.com-readingFlowFlow'].width, 180);
  assert.deepEqual(prefWrites, [['extensions.readingflow.flowColumnInitialized', true]]);
});

test('showColumnsOnFirstRun does not rewrite Flow after the Flow migration has run', async () => {
  const prefWrites: Array<[string, unknown]> = [];
  let paneLookups = 0;

  (globalThis as any).Zotero = {
    Prefs: {
      get(pref: string) {
        if (pref === 'extensions.readingflow.flowColumnInitialized') return true;
        return false;
      },
      set(pref: string, value: unknown) {
        prefWrites.push([pref, value]);
      }
    },
    getActiveZoteroPane() {
      paneLookups++;
      return { itemsView: { id: 'item-tree-main-default', _columnPrefs: {} } };
    },
    ItemTreeManager: {
      unregisterColumn() {}
    },
    debug() {},
    logError() {}
  };

  const manager = new ColumnManager({} as any);
  await (manager as any).showColumnsOnFirstRun(['readingFlowFlow']);

  assert.equal(paneLookups, 0);
  assert.deepEqual(prefWrites, []);
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
  assert.deepEqual(prefWrites, [
    ['extensions.readingflow.flowColumnInitialized', true],
    ['extensions.readingflow.columnsInitialized', true]
  ]);
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
