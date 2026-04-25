import test from 'node:test';
import assert from 'node:assert/strict';
import { ResumeReader } from '../src/resumeReader';
import { DEFAULT_FLOW_DATA, FlowData } from '../src/flowData';

function flowData(updates: Partial<FlowData> = {}): FlowData {
  return { ...DEFAULT_FLOW_DATA, ...updates };
}

function pdfAttachment(id: number, parentID?: number) {
  return {
    id,
    parentID,
    isPDFAttachment() {
      return true;
    }
  };
}

function regularItem(id: number, attachment?: any) {
  return {
    id,
    isPDFAttachment() {
      return false;
    },
    async getBestAttachment() {
      return attachment;
    }
  };
}

test('canResume returns true when parent lastAttachmentId resolves to a PDF attachment', async () => {
  const attachment = pdfAttachment(10);
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

  assert.equal(await reader.canResume(parent), true);
});

test('resume opens parent last attachment at stored 1-based lastPage converted to 0-based pageIndex', async () => {
  const calls: any[] = [];
  const attachment = pdfAttachment(10);
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
  const attachment = pdfAttachment(11);
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
  assert.deepEqual(calls, [[11, { pageIndex: 2 }]]);
});

test('resume uses PDF attachment directly and reads parent lastPage when parentID exists', async () => {
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
      return flowData({ lastPage: 4 });
    }
  } as any);

  assert.equal(await reader.resume(attachment), true);
  assert.deepEqual(calls, [[10, { pageIndex: 3 }]]);
});

test('resume opens without location when no positive lastPage is available', async () => {
  const calls: any[] = [];
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
      return flowData();
    }
  } as any);

  assert.equal(await reader.resume(attachment), true);
  assert.deepEqual(calls, [[10, undefined]]);
});

test('resume retries without location when opening at page location throws', async () => {
  const calls: any[] = [];
  const attachment = pdfAttachment(10);
  (globalThis as any).Zotero = {
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
    getData() {
      return flowData({ lastPage: 2 });
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
