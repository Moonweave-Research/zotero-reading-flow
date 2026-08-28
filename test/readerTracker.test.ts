import test from 'node:test';
import assert from 'node:assert/strict';
import { ReaderTracker } from '../src/readerTracker';
import { ColumnManager } from '../src/columnManager';
import { DataStore } from '../src/dataStore';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 20 && !condition(); attempt++) {
    await Promise.resolve();
  }
  assert.equal(condition(), true);
}

test('ReaderTracker ignores a page-change notification when the private reader registry is unavailable', () => {
  const originalZotero = (globalThis as any).Zotero;
  const tracker = new ReaderTracker({} as any);
  let itemReads = 0;
  (globalThis as any).Zotero = {
    Items: {
      get() {
        itemReads += 1;
        return null;
      }
    },
    Notifier: {
      registerObserver() { return 'reader-tracker'; },
      unregisterObserver() {}
    }
  };

  try {
    tracker.register();
    assert.doesNotThrow(() => tracker.notify('pageChange', 'file', 10));
    assert.equal(itemReads, 0);
  } finally {
    tracker.unregister();
    (globalThis as any).Zotero = originalZotero;
  }
});

test('ReaderTracker ignores non-PDF reader locations instead of persisting them as page progress', () => {
  const originalZotero = (globalThis as any).Zotero;
  const originalSetTimeout = globalThis.setTimeout;
  const tracker = new ReaderTracker({} as any);
  let scheduled = 0;
  (globalThis as any).setTimeout = () => {
    scheduled += 1;
    return 1;
  };
  (globalThis as any).Zotero = {
    Reader: {
      _readers: [{ itemID: 10, _type: 'snapshot', _state: { scrollYPercent: 0.6 } }]
    },
    Items: {
      get(id: number) {
        assert.equal(id, 10);
        return {
          parentID: 20,
          isPDFAttachment() { return false; },
          getAttachmentLastPageIndex() { return 24; }
        };
      }
    },
    Notifier: {
      registerObserver() { return 'reader-tracker'; },
      unregisterObserver() {}
    }
  };

  try {
    tracker.register();
    tracker.notify('pageChange', 'file', 10);
    assert.equal(scheduled, 0);
  } finally {
    tracker.unregister();
    (globalThis as any).setTimeout = originalSetTimeout;
    (globalThis as any).Zotero = originalZotero;
  }
});

test('ReaderTracker prefers live PDF page index over saved attachment page index', () => {
  const tracker = new ReaderTracker({} as any);
  let savedCall: any[] | null = null;
  (tracker as any).debounceSave = (...args: any[]) => {
    savedCall = args;
  };

  (globalThis as any).Zotero = {
    Reader: {
      _readers: [
        {
          itemID: 10,
          _type: 'pdf',
          _state: { pageIndex: 1 },
          _internalReader: {
            _state: { pageIndex: 1 },
            _primaryView: {
              _iframeWindow: {
                wrappedJSObject: {
                  PDFViewerApplication: {
                    pdfDocument: { numPages: 5 }
                  }
                }
              }
            }
          }
        }
      ]
    },
    Items: {
      get(id: number) {
        assert.equal(id, 10);
        return {
          parentID: 20,
          isPDFAttachment() {
            return true;
          },
          getAttachmentLastPageIndex() {
            return 399;
          }
        };
      }
    }
  };

  (tracker as any).handlePageChange(10);

  assert.deepEqual(savedCall, [20, '10', 0.4, 2, 5]);
});

test('ReaderTracker uses attachment numPages field when PDF viewer count is unavailable', () => {
  const tracker = new ReaderTracker({} as any);
  let savedCall: any[] | null = null;
  (tracker as any).debounceSave = (...args: any[]) => {
    savedCall = args;
  };

  (globalThis as any).Zotero = {
    Reader: {
      _readers: [
        {
          itemID: 10,
          _type: 'pdf',
          _state: { pageIndex: 1 },
          _internalReader: {
            _state: { pageIndex: 1 },
            _primaryView: {
              _iframeWindow: {
                wrappedJSObject: {
                  PDFViewerApplication: {
                    // no explicit page count on app object
                  }
                }
              }
            }
          }
        }
      ]
    },
    Items: {
      get(id: number) {
        assert.equal(id, 10);
        return {
          parentID: 20,
          isPDFAttachment() {
            return true;
          },
          getField(fieldName: string) {
            if (fieldName === 'numPages') return '5';
            return null;
          }
        };
      }
    }
  };

  (tracker as any).handlePageChange(10);

  assert.deepEqual(savedCall, [20, '10', 0.4, 2, 5]);
});

test('ReaderTracker prefers attachment metadata when open-reader page count conflicts', () => {
  const tracker = new ReaderTracker({} as any);
  let savedCall: any[] | null = null;
  (tracker as any).debounceSave = (...args: any[]) => {
    savedCall = args;
  };

  (globalThis as any).Zotero = {
    Reader: {
      _readers: [
        {
          itemID: 10,
          _type: 'pdf',
          _state: { pageIndex: 1 },
          _internalReader: {
            _state: { pageIndex: 1 },
            _primaryView: {
              _iframeWindow: {
                wrappedJSObject: {
                  PDFViewerApplication: {
                    pdfDocument: {
                      numPages: 400
                    }
                  }
                }
              }
            }
          }
        }
      ]
    },
    Items: {
      get(id: number) {
        assert.equal(id, 10);
        return {
          parentID: 20,
          isPDFAttachment() {
            return true;
          },
          getField(fieldName: string) {
            if (fieldName === 'numPages') return '5';
            return null;
          }
        };
      }
    }
  };

  (tracker as any).handlePageChange(10);

  assert.deepEqual(savedCall, [20, '10', 0.4, 2, 5]);
});

test('ReaderTracker does not emit synthetic page number when page count is unavailable', () => {
  const tracker = new ReaderTracker({} as any);
  let savedCall: any[] | null = null;
  (tracker as any).debounceSave = (...args: any[]) => {
    savedCall = args;
  };

  (globalThis as any).Zotero = {
    Reader: {
      _readers: [
        {
          itemID: 10,
          _type: 'pdf',
          _state: { pageIndex: 399 }
        }
      ]
    },
    Items: {
      get(id: number) {
        assert.equal(id, 10);
        return {
          parentID: 20,
          isPDFAttachment() {
            return true;
          },
          getField() {
            return null;
          }
        };
      }
    }
  };

  (tracker as any).handlePageChange(10);

  assert.equal(savedCall, null);
});

test('ReaderTracker delegates with one captured timestamp and refreshes after a persisted write', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalDateNow = Date.now;
  const callbacks: Array<() => Promise<void>> = [];
  const calls: any[] = [];
  let refreshes = 0;
  let notifications = 0;
  const dataStore = {
    async recordProgressUnlessResetAfter(...args: any[]) {
      calls.push(args);
      return true;
    }
  };
  const tracker = new ReaderTracker(dataStore as any);

  (globalThis as any).setTimeout = (callback: () => Promise<void>) => {
    callbacks.push(callback);
    return 1;
  };
  Date.now = () => 3000;
  (globalThis as any).Zotero = {
    Items: {
      async getAsync(id: number) {
        assert.equal(id, 20);
        return { id: 20 };
      }
    },
    ItemTreeManager: {
      refreshColumns() {
        refreshes += 1;
      }
    },
    Notifier: {
      trigger() {
        notifications += 1;
      }
    }
  };
  (tracker as any).active = true;
  (tracker as any).generation = 1;

  try {
    (tracker as any).debounceSave(20, '10', 0.5, 2, 4);
    Date.now = () => 9000;
    await callbacks[0]();

    assert.deepEqual(calls, [[
      { id: 20 },
      { attachmentId: '10', progress: 0.5, pageCount: 4, lastPage: 2, at: 3000 },
      3000
    ]]);
    assert.equal(refreshes, 1);
    assert.equal(notifications, 1);
  } finally {
    (globalThis as any).setTimeout = originalSetTimeout;
    Date.now = originalDateNow;
  }
});

test('ReaderTracker flushes the latest debounced PDF position before shutdown', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const originalServices = (globalThis as any).Services;
  const calls: any[] = [];
  const cleared: unknown[] = [];
  const tracker = new ReaderTracker({
    async recordProgressUnlessResetAfter(...args: any[]) {
      calls.push(args);
      return true;
    }
  } as any);
  (globalThis as any).setTimeout = () => 99;
  (globalThis as any).clearTimeout = (id: unknown) => { cleared.push(id); };
  (globalThis as any).Zotero = {
    Items: { async getAsync() { return { id: 20 }; } },
    ItemTreeManager: { refreshColumns() {} },
    Notifier: { trigger() {} }
  };
  (globalThis as any).Services = { startup: { shuttingDown: true } };
  (tracker as any).active = true;
  (tracker as any).generation = 1;

  try {
    (tracker as any).debounceSave(20, '10', 0.75, 3, 4);
    await tracker.flushPending();

    assert.deepEqual(cleared, [99]);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][1], {
      attachmentId: '10', progress: 0.75, pageCount: 4, lastPage: 3, at: calls[0][2]
    });
    assert.deepEqual(calls[0][3], { allowDuringShutdown: true });
  } finally {
    (globalThis as any).setTimeout = originalSetTimeout;
    (globalThis as any).clearTimeout = originalClearTimeout;
    (globalThis as any).Services = originalServices;
  }
});

test('ReaderTracker does not refresh when conditional progress is rejected', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const callbacks: Array<() => Promise<void>> = [];
  let refreshes = 0;
  let notifications = 0;
  const tracker = new ReaderTracker({
    async recordProgressUnlessResetAfter() {
      return false;
    }
  } as any);
  (globalThis as any).setTimeout = (callback: () => Promise<void>) => {
    callbacks.push(callback);
    return 1;
  };
  (globalThis as any).Zotero = {
    Items: { async getAsync() { return { id: 20 }; } },
    ItemTreeManager: { refreshColumns() { refreshes += 1; } },
    Notifier: { trigger() { notifications += 1; } }
  };
  (tracker as any).active = true;
  (tracker as any).generation = 1;

  try {
    (tracker as any).debounceSave(20, '10', 0.5, 2, 4);
    await callbacks[0]();
    assert.equal(refreshes, 0);
    assert.equal(notifications, 0);
  } finally {
    (globalThis as any).setTimeout = originalSetTimeout;
  }
});

test('ReaderTracker skips delegation when generation changes while getAsync is pending', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const callbacks: Array<() => Promise<void>> = [];
  const parent = deferred<any>();
  let calls = 0;
  const tracker = new ReaderTracker({
    async recordProgressUnlessResetAfter() {
      calls += 1;
      return true;
    }
  } as any);
  (globalThis as any).setTimeout = (callback: () => Promise<void>) => {
    callbacks.push(callback);
    return 1;
  };
  (globalThis as any).Zotero = {
    Items: { getAsync() { return parent.promise; } },
    ItemTreeManager: { refreshColumns() {} },
    Notifier: { trigger() {} }
  };
  (tracker as any).active = true;
  (tracker as any).generation = 1;

  try {
    (tracker as any).debounceSave(20, '10', 0.5, 2, 4);
    const callback = callbacks[0]();
    (tracker as any).generation = 2;
    parent.resolve({ id: 20 });
    await callback;
    assert.equal(calls, 0);
  } finally {
    (globalThis as any).setTimeout = originalSetTimeout;
  }
});

test('ReaderTracker skips refresh when generation changes while queued progress is pending', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const callbacks: Array<() => Promise<void>> = [];
  const queued = deferred<boolean>();
  let calls = 0;
  let refreshes = 0;
  const tracker = new ReaderTracker({
    recordProgressUnlessResetAfter() {
      calls += 1;
      return queued.promise;
    }
  } as any);
  (globalThis as any).setTimeout = (callback: () => Promise<void>) => {
    callbacks.push(callback);
    return 1;
  };
  (globalThis as any).Zotero = {
    Items: { async getAsync() { return { id: 20 }; } },
    ItemTreeManager: { refreshColumns() { refreshes += 1; } },
    Notifier: { trigger() { refreshes += 1; } }
  };
  (tracker as any).active = true;
  (tracker as any).generation = 1;

  try {
    (tracker as any).debounceSave(20, '10', 0.5, 2, 4);
    const callback = callbacks[0]();
    await waitFor(() => calls === 1);
    (tracker as any).generation = 2;
    queued.resolve(true);
    await callback;
    assert.equal(refreshes, 0);
  } finally {
    (globalThis as any).setTimeout = originalSetTimeout;
  }
});

test('pending failed reset followed by Reader callback eventually records progress', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalDateNow = Date.now;
  const callbacks: Array<() => Promise<void>> = [];
  let extra = 'ReadingFlow: {"v":1,"p":{"10":0.4},"s":null}';
  const saves: Array<ReturnType<typeof deferred<void>>> = [];
  const item = {
    id: 20,
    getField() { return extra; },
    setField(_field: string, value: string) { extra = value; },
    saveTx() {
      const save = deferred<void>();
      saves.push(save);
      return save.promise;
    }
  };
  const store = new DataStore();
  const tracker = new ReaderTracker(store);
  (globalThis as any).setTimeout = (callback: () => Promise<void>) => {
    callbacks.push(callback);
    return 1;
  };
  Date.now = () => 1000;
  (globalThis as any).Zotero = {
    Items: { async getAsync() { return item; } },
    ItemTreeManager: { refreshColumns() {} },
    Notifier: { trigger() {} }
  };
  (tracker as any).active = true;
  (tracker as any).generation = 1;

  try {
    const reset = store.resetProgress(item, 2000);
    const resetRejected = assert.rejects(reset, /reset failed/);
    await waitFor(() => saves.length === 1);
    (tracker as any).debounceSave(20, '10', 0.5, 2, 4);
    const readerSave = callbacks[0]();

    saves[0].reject(new Error('reset failed'));
    await resetRejected;
    await waitFor(() => saves.length === 2);
    saves[1].resolve();
    await readerSave;

    const line = extra.split('\n').find((value) => value.startsWith('ReadingFlow: '));
    assert.ok(line);
    assert.equal(JSON.parse(line.slice('ReadingFlow: '.length)).p['10'], 0.5);
  } finally {
    (globalThis as any).setTimeout = originalSetTimeout;
    Date.now = originalDateNow;
  }
});

test('Progress column uses full cell width for the track instead of shrinking it with a fixed label slot', async () => {
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
      return { p: { a: 0.5 }, lastAttachmentId: 'a' };
    }
  } as any);

  await manager.register();
  const progressColumn = registeredColumns.find((column) => column.dataKey === 'readingFlowProgress');
  const cell = progressColumn.renderCell(0, '0.5', { className: 'custom-progress', width: 128 }, false, fakeDoc);
  const trackRow = cell.children[0];
  const track = trackRow?.children?.[0];
  const label = trackRow?.children?.[1];

  assert.equal(cell.className, 'cell custom-progress');
  assert.match(cell.style.cssText, /padding:0/);
  assert.match(cell.style.cssText, /width:100%/);
  assert.equal(trackRow.style.cssText.includes('display:flex'), true);
  assert.match(track.style.cssText, /width:100%/);
  assert.doesNotMatch(label.style.cssText, /flex:0 0 34px/);
});
