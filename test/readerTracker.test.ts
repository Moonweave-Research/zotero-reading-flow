import test from 'node:test';
import assert from 'node:assert/strict';
import { ReaderTracker } from '../src/readerTracker';
import { ColumnManager } from '../src/columnManager';

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

test('ReaderTracker prefers open-reader page count when it conflicts with metadata', () => {
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

  assert.deepEqual(savedCall, [20, '10', 0.005, 2, 400]);
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
