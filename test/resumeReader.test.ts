import test from 'node:test';
import assert from 'node:assert/strict';
import { ResumeReader } from '../src/resumeReader';
import { DEFAULT_FLOW_DATA, FlowData } from '../src/flowData';
import { Logger } from '../src/Logger';

function flowData(updates: Partial<FlowData> = {}): FlowData {
  return { ...DEFAULT_FLOW_DATA, ...updates };
}

function pdfAttachment(id: number, parentID?: number, fields?: Record<string, any>) {
  return {
    id,
    parentID,
    isPDFAttachment() {
      return true;
    },
    getField(fieldName: string) {
      return fields?.[fieldName];
    }
  };
}

function regularItem(id: number, attachment?: any) {
  return {
    id,
    isPDFAttachment() {
      return false;
    },
    isRegularItem() {
      return true;
    },
    async getBestAttachment() {
      return attachment;
    }
  };
}

test('canResume returns true when parent lastAttachmentId resolves to a PDF attachment', async () => {
  const attachment = pdfAttachment(10, 20);
  const parent = regularItem(20);
  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 10);
        return attachment;
      }
    },
    Reader: {
      async open() {}
    }
  };

  const reader = new ResumeReader({
    getData(item: any) {
      assert.equal(item, parent);
      return flowData({ lastAttachmentId: '10', lastPage: 4 });
    }
  } as any);

  assert.equal(await reader.canResume(parent), true);
});

test('getResumeDisplayTarget provides dynamic menu metadata for page and total', async () => {
  const attachment = pdfAttachment(10, 20);
  const parent = regularItem(20);
  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 10);
        return attachment;
      }
    },
    Reader: {
      async open() {}
    }
  };

  const reader = new ResumeReader({
    getData(item: any) {
      assert.equal(item, parent);
      return flowData({ lastAttachmentId: '10', lastPage: 4, pageCount: { '10': 5 } });
    }
  } as any);

  const target = await reader.getResumeDisplayTarget(parent);
  assert.equal(target.canResume, true);
  assert.equal(target.attachmentId, 10);
  assert.equal(target.lastPage, 4);
  assert.equal(target.totalPages, 5);
  assert.equal(target.l10nArgs, JSON.stringify({ mode: 'page-total', page: 4, total: 5 }));
  assert.equal(target.fallbackLabel, 'Resume at Page 4 / 5');
});

test('getResumeDisplayTarget disables resume when no last page is known', async () => {
  const attachment = pdfAttachment(10, 20);
  const parent = regularItem(20);
  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 10);
        return attachment;
      }
    },
    Reader: {
      async open() {}
    }
  };

  const reader = new ResumeReader({
    getData(item: any) {
      assert.equal(item, parent);
      return flowData({ lastAttachmentId: '10' });
    }
  } as any);

  const target = await reader.getResumeDisplayTarget(parent);
  assert.equal(target.canResume, false);
  assert.equal(target.lastPage, null);
  assert.equal(target.l10nArgs, undefined);
  assert.equal(target.fallbackLabel, 'Resume Reading');
});

test('resume opens parent last attachment at stored 1-based lastPage converted to 0-based pageIndex', async () => {
  const calls: any[] = [];
  const attachment = pdfAttachment(10, 20);
  const parent = regularItem(20);
  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 10);
        return attachment;
      }
    },
    Reader: {
      async open(...args: any[]) {
        calls.push(args);
      }
    }
  };

  const reader = new ResumeReader({
    getData(item: any) {
      assert.equal(item, parent);
      return flowData({ lastAttachmentId: '10', lastPage: 7 });
    }
  } as any);

  assert.equal(await reader.resume(parent), true);
  assert.deepEqual(calls, [[10, { pageIndex: 6 }]]);
});

test('resume falls back to best PDF attachment when parent lastAttachmentId is invalid', async () => {
  const calls: any[] = [];
  const attachment = pdfAttachment(11, 20);
  const parent = regularItem(20, attachment);
  (globalThis as any).Zotero = {
    Items: {
      get() {
        throw new Error('invalid IDs should not be looked up');
      }
    },
    Reader: {
      async open(...args: any[]) {
        calls.push(args);
      }
    }
  };

  const reader = new ResumeReader({
    getData() {
      return flowData({ lastAttachmentId: 'not-a-number', lastPage: 3 });
    }
  } as any);

  assert.equal(await reader.resume(parent), true);
  assert.deepEqual(calls, [[11, undefined]]);
});

test('resume falls back to best PDF attachment when tracked attachment is not a PDF', async () => {
  const calls: any[] = [];
  const attachment = pdfAttachment(11, 20);
  const parent = regularItem(20, attachment);
  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 10);
        return {
          id: 10,
          isPDFAttachment() {
            return false;
          }
        };
      }
    },
    Reader: {
      async open(...args: any[]) {
        calls.push(args);
      }
    }
  };

  const reader = new ResumeReader({
    getData(item: any) {
      assert.equal(item, parent);
      return flowData({ lastAttachmentId: '10', lastPage: 5 });
    }
  } as any);

  assert.equal(await reader.resume(parent), true);
  assert.deepEqual(calls, [[11, undefined]]);
});

test('resume falls back to best PDF attachment without stale page when tracked attachment is missing', async () => {
  const calls: any[] = [];
  const attachment = pdfAttachment(11, 20);
  const parent = regularItem(20, attachment);
  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 10);
        return null;
      }
    },
    Reader: {
      async open(...args: any[]) {
        calls.push(args);
      }
    }
  };

  const reader = new ResumeReader({
    getData(item: any) {
      assert.equal(item, parent);
      return flowData({ lastAttachmentId: '10', lastPage: 5 });
    }
  } as any);

  assert.equal(await reader.resume(parent), true);
  assert.deepEqual(calls, [[11, undefined]]);
});

test('resume falls back to best PDF attachment without stale page when tracked attachment is undefined', async () => {
  const calls: any[] = [];
  const attachment = pdfAttachment(11, 20);
  const parent = regularItem(20, attachment);
  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 10);
        return undefined;
      }
    },
    Reader: {
      async open(...args: any[]) {
        calls.push(args);
      }
    }
  };

  const reader = new ResumeReader({
    getData(item: any) {
      assert.equal(item, parent);
      return flowData({ lastAttachmentId: '10', lastPage: 5 });
    }
  } as any);

  assert.equal(await reader.resume(parent), true);
  assert.deepEqual(calls, [[11, undefined]]);
});

test('resume ignores tracked PDF from a different parent and opens best attachment without stale page', async () => {
  const calls: any[] = [];
  const fallbackAttachment = pdfAttachment(11, 20);
  const otherParentAttachment = pdfAttachment(10, 99);
  const parent = regularItem(20, fallbackAttachment);
  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 10);
        return otherParentAttachment;
      }
    },
    Reader: {
      async open(...args: any[]) {
        calls.push(args);
      }
    }
  };

  const reader = new ResumeReader({
    getData(item: any) {
      assert.equal(item, parent);
      return flowData({ lastAttachmentId: '10', lastPage: 5 });
    }
  } as any);

  assert.equal(await reader.resume(parent), true);
  assert.deepEqual(calls, [[11, undefined]]);
});

test('resume uses PDF attachment directly and reads parent lastPage when parent lastAttachmentId matches', async () => {
  const calls: any[] = [];
  const attachment = pdfAttachment(10, 20);
  const parent = regularItem(20);
  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 20);
        return parent;
      }
    },
    Reader: {
      async open(...args: any[]) {
        calls.push(args);
      }
    }
  };

  const reader = new ResumeReader({
    getData(item: any) {
      assert.equal(item, parent);
      return flowData({ lastAttachmentId: '10', lastPage: 4 });
    }
  } as any);

  assert.equal(await reader.resume(attachment), true);
  assert.deepEqual(calls, [[10, { pageIndex: 3 }]]);
});

test('resume opens direct PDF without stale page when parent lastAttachmentId points to a sibling', async () => {
  const calls: any[] = [];
  const attachmentB = pdfAttachment(11, 20);
  const parent = regularItem(20);
  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 20);
        return parent;
      }
    },
    Reader: {
      async open(...args: any[]) {
        calls.push(args);
      }
    }
  };

  const reader = new ResumeReader({
    getData(item: any) {
      assert.equal(item, parent);
      return flowData({ lastAttachmentId: '10', lastPage: 4 });
    }
  } as any);

  assert.equal(await reader.resume(attachmentB), true);
  assert.deepEqual(calls, [[11, undefined]]);
});

test('getResumeDisplayTarget for direct PDF attachment uses cached total pages from parent flow data', async () => {
  const attachment = pdfAttachment(10, 20, { numPages: 50 });
  const parent = regularItem(20);
  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 20);
        return parent;
      }
    },
    Reader: {
      async open() {}
    }
  };

  const reader = new ResumeReader({
    getData(item: any) {
      assert.equal(item, parent);
      return flowData({ lastAttachmentId: '10', lastPage: 4, pageCount: { '10': 7 } });
    }
  } as any);

  const target = await reader.getResumeDisplayTarget(attachment);
  assert.equal(target.canResume, true);
  assert.equal(target.totalPages, 7);
  assert.equal(target.l10nArgs, JSON.stringify({ mode: 'page-total', page: 4, total: 7 }));
  assert.equal(target.fallbackLabel, 'Resume at Page 4 / 7');
});

test('direct PDF attachment falls back to PDF metadata when parent cache page count is unavailable', async () => {
  const attachment = pdfAttachment(10, 20, { numPages: '12 pages' });
  const parent = regularItem(20);
  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 20);
        return parent;
      }
    },
    Reader: {
      async open() {}
    }
  };

  const reader = new ResumeReader({
    getData(item: any) {
      assert.equal(item, parent);
      return flowData({ lastAttachmentId: '10', lastPage: 4 });
    }
  } as any);

  const target = await reader.getResumeDisplayTarget(attachment);
  assert.equal(target.canResume, true);
  assert.equal(target.totalPages, 12);
  assert.equal(target.fallbackLabel, 'Resume at Page 4 / 12');
  assert.equal(target.l10nArgs, JSON.stringify({ mode: 'page-total', page: 4, total: 12 }));
});

test('direct PDF attachment uses live reader page count when metadata and cache are unavailable', async () => {
  const attachment = pdfAttachment(10, 20);
  const parent = regularItem(20);
  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 20);
        return parent;
      }
    },
    Reader: {
      _readers: [
        {
          itemID: 10,
          _internalReader: {
            _primaryView: {
              _iframeWindow: {
                wrappedJSObject: {
                  PDFViewerApplication: {
                    pdfDocument: {
                      numPages: '9'
                    }
                  }
                }
              }
            }
          }
        }
      ]
    }
  };

  const reader = new ResumeReader({
    getData(item: any) {
      assert.equal(item, parent);
      return flowData({ lastAttachmentId: '10', lastPage: 4 });
    }
  } as any);

  const target = await reader.getResumeDisplayTarget(attachment);
  assert.equal(target.canResume, true);
  assert.equal(target.totalPages, 9);
  assert.equal(target.fallbackLabel, 'Resume at Page 4 / 9');
});

test('direct PDF attachment prefers cached pageCount string when reader is unavailable', async () => {
  const attachment = pdfAttachment(10, 20, { numPages: 5 });
  const parent = regularItem(20);
  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 20);
        return parent;
      }
    },
    Reader: {
      _readers: []
    }
  };

  const reader = new ResumeReader({
    getData(item: any) {
      assert.equal(item, parent);
      return flowData({ lastAttachmentId: '10', lastPage: 4, pageCount: { '10': '12 pages' } });
    }
  } as any);

  const target = await reader.getResumeDisplayTarget(attachment);
  assert.equal(target.canResume, true);
  assert.equal(target.totalPages, 12);
  assert.equal(target.fallbackLabel, 'Resume at Page 4 / 12');
});

test('direct PDF attachment prefers cached page count when live reader count conflicts', async () => {
  const attachment = pdfAttachment(10, 20);
  const parent = regularItem(20);
  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 20);
        return parent;
      }
    },
    Reader: {
      _readers: [
        {
          itemID: 10,
          _internalReader: {
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
    }
  };

  const reader = new ResumeReader({
    getData(item: any) {
      assert.equal(item, parent);
      return flowData({ lastAttachmentId: '10', lastPage: 4, pageCount: { '10': 5 } });
    }
  } as any);

  const target = await reader.getResumeDisplayTarget(attachment);
  assert.equal(target.canResume, true);
  assert.equal(target.totalPages, 5);
  assert.equal(target.fallbackLabel, 'Resume at Page 4 / 5');
});

test('direct PDF attachment prefers live reader page count when cached page count conflicts', async () => {
  const attachment = pdfAttachment(10, 20);
  const parent = regularItem(20);
  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 20);
        return parent;
      }
    },
    Reader: {
      _readers: [
        {
          itemID: '10',
          _internalReader: {
            _primaryView: {
              _iframeWindow: {
                wrappedJSObject: {
                  PDFViewerApplication: {
                    pdfDocument: {
                      numPages: 5
                    }
                  }
                }
              }
            }
          }
        }
      ]
    }
  };

  const reader = new ResumeReader({
    getData(item: any) {
      assert.equal(item, parent);
      return flowData({ lastAttachmentId: '10', lastPage: 4, pageCount: { '10': 999999 } });
    }
  } as any);

  const target = await reader.getResumeDisplayTarget(attachment);
  assert.equal(target.canResume, true);
  assert.equal(target.totalPages, 5);
  assert.equal(target.fallbackLabel, 'Resume at Page 4 / 5');
});

test('resume opens without location when no positive lastPage is available', async () => {
  const calls: any[] = [];
  let dataReads = 0;
  const attachment = pdfAttachment(10);
  (globalThis as any).Zotero = {
    Reader: {
      async open(...args: any[]) {
        calls.push(args);
      }
    }
  };

  const reader = new ResumeReader({
    getData() {
      dataReads += 1;
      return flowData();
    }
  } as any);

  assert.equal(await reader.resume(attachment), true);
  assert.deepEqual(calls, [[10, undefined]]);
  assert.equal(dataReads, 0);
});

test('resume returns false and logs a warning when opening without location fails', async () => {
  const calls: any[] = [];
  const warnings: any[] = [];
  const originalWarn = Logger.warn;
  const attachment = pdfAttachment(10);
  Logger.warn = (...args: any[]) => {
    warnings.push(args);
  };
  (globalThis as any).Zotero = {
    Reader: {
      async open(...args: any[]) {
        calls.push(args);
        if (args[1] === undefined) {
          throw new Error('open failed');
        }
      }
    }
  };

  try {
    const reader = new ResumeReader({
      getData() {
        return flowData();
      }
    } as any);

    assert.equal(await reader.resume(attachment), false);
    assert.deepEqual(calls, [[10, undefined]]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0][0], /failed to open attachment 10/);
    assert.match(warnings[0][0], /open failed/);
  } finally {
    Logger.warn = originalWarn;
  }
});

test('resume uses only Zotero.Reader.open and does not fall back to pane openPDF', async () => {
  const calls: any[] = [];
  const warnings: any[] = [];
  const originalWarn = Logger.warn;
  const attachment = pdfAttachment(10);
  Logger.warn = (...args: any[]) => {
    warnings.push(args);
  };
  (globalThis as any).Zotero = {
    Reader: {},
    getActiveZoteroPane() {
      return {
        async openPDF(...args: any[]) {
          calls.push(args);
        }
      };
    }
  };

  try {
    const reader = new ResumeReader({
      getData() {
        return flowData();
      }
    } as any);

    assert.equal(await reader.resume(attachment), false);
    assert.deepEqual(calls, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0][0], /failed to open attachment 10/);
  } finally {
    Logger.warn = originalWarn;
  }
});

test('resume retries without location when opening at page location throws', async () => {
  const calls: any[] = [];
  const attachment = pdfAttachment(10, 20);
  const parent = regularItem(20);
  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 20);
        return parent;
      }
    },
    Reader: {
      async open(...args: any[]) {
        calls.push(args);
        if (calls.length === 1) {
          throw new Error('location failed');
        }
      }
    }
  };

  const reader = new ResumeReader({
    getData(item: any) {
      assert.equal(item, parent);
      return flowData({ lastAttachmentId: '10', lastPage: 2 });
    }
  } as any);

  assert.equal(await reader.resume(attachment), true);
  assert.deepEqual(calls, [[10, { pageIndex: 1 }], [10, undefined]]);
});

test('resume returns false when no PDF target can be resolved', async () => {
  const parent = regularItem(20, {
    id: 12,
    isPDFAttachment() {
      return false;
    }
  });
  (globalThis as any).Zotero = {
    Items: {
      get() {
        return null;
      }
    },
    Reader: {
      async open() {
        throw new Error('should not open');
      }
    }
  };

  const reader = new ResumeReader({
    getData() {
      return flowData({ lastAttachmentId: '10' });
    }
  } as any);

  assert.equal(await reader.canResume(parent), false);
  assert.equal(await reader.resume(parent), false);
});

test('resume returns false and warns when flow data read fails during resolution', async () => {
  const warnings: any[] = [];
  const calls: any[] = [];
  const originalWarn = Logger.warn;
  const parent = regularItem(20, pdfAttachment(10));
  Logger.warn = (...args: any[]) => {
    warnings.push(args);
  };
  (globalThis as any).Zotero = {
    Reader: {
      async open(...args: any[]) {
        calls.push(args);
      }
    }
  };

  try {
    const reader = new ResumeReader({
      getData() {
        throw new Error('data failed');
      }
    } as any);

    assert.equal(await reader.canResume(parent), false);
    assert.equal(await reader.resume(parent), false);
    assert.deepEqual(calls, []);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0][0], /failed to resolve target/);
    assert.match(warnings[0][0], /data failed/);
  } finally {
    Logger.warn = originalWarn;
  }
});

test('resume returns false and warns when best attachment lookup fails during resolution', async () => {
  const warnings: any[] = [];
  const calls: any[] = [];
  const originalWarn = Logger.warn;
  const parent = {
    id: 20,
    isPDFAttachment() {
      return false;
    },
    isRegularItem() {
      return true;
    },
    async getBestAttachment() {
      throw new Error('best attachment failed');
    }
  };
  Logger.warn = (...args: any[]) => {
    warnings.push(args);
  };
  (globalThis as any).Zotero = {
    Reader: {
      async open(...args: any[]) {
        calls.push(args);
      }
    }
  };

  try {
    const reader = new ResumeReader({
      getData() {
        return flowData();
      }
    } as any);

    assert.equal(await reader.canResume(parent), false);
    assert.equal(await reader.resume(parent), false);
    assert.deepEqual(calls, []);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0][0], /failed to resolve target/);
    assert.match(warnings[0][0], /best attachment failed/);
  } finally {
    Logger.warn = originalWarn;
  }
});

test('resume opens direct PDF without location when resolved parent is not a regular item', async () => {
  const calls: any[] = [];
  let dataReads = 0;
  const attachment = pdfAttachment(10, 20);
  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 20);
        return {
          id: 20,
          isRegularItem() {
            return false;
          }
        };
      }
    },
    Reader: {
      async open(...args: any[]) {
        calls.push(args);
      }
    }
  };

  const reader = new ResumeReader({
    getData() {
      dataReads += 1;
      return flowData({ lastPage: 9 });
    }
  } as any);

  assert.equal(await reader.resume(attachment), true);
  assert.deepEqual(calls, [[10, undefined]]);
  assert.equal(dataReads, 0);
});

test('resume ignores unsupported non-PDF non-regular items without reading data or best attachment', async () => {
  let dataReads = 0;
  let bestAttachmentCalls = 0;
  const calls: any[] = [];
  const unsupportedItem = {
    id: 20,
    isPDFAttachment() {
      return false;
    },
    isRegularItem() {
      return false;
    },
    async getBestAttachment() {
      bestAttachmentCalls += 1;
      return pdfAttachment(10);
    }
  };
  (globalThis as any).Zotero = {
    Reader: {
      async open(...args: any[]) {
        calls.push(args);
      }
    }
  };

  const reader = new ResumeReader({
    getData() {
      dataReads += 1;
      return flowData({ lastAttachmentId: '10', lastPage: 3 });
    }
  } as any);

  assert.equal(await reader.canResume(unsupportedItem), false);
  assert.equal(await reader.resume(unsupportedItem), false);
  assert.equal(dataReads, 0);
  assert.equal(bestAttachmentCalls, 0);
  assert.deepEqual(calls, []);
});
