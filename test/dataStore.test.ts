import test from 'node:test';
import assert from 'node:assert/strict';
import { DataStore } from '../src/dataStore';

test('updateData does not keep optimistic cache state when saveTx fails', async () => {
  let extra = '';
  const item = {
    id: 1,
    getField(fieldName: string) {
      assert.equal(fieldName, 'extra');
      return extra;
    },
    setField(fieldName: string, value: string) {
      assert.equal(fieldName, 'extra');
      extra = value;
    },
    async saveTx() {
      throw new Error('save failed');
    }
  };
  const store = new DataStore();

  assert.equal(store.getData(item).s, null);
  await assert.rejects(store.setStatus(item, 'read'), /save failed/);

  assert.equal(store.getData(item).s, null);
  assert.equal(extra, '');
});

test('updateData retries a temporarily dirty item instead of losing the update', async () => {
  let extra = '';
  let dirtyChecks = 0;
  let saves = 0;
  const item = {
    id: 2,
    isDirty() {
      dirtyChecks += 1;
      return dirtyChecks === 1;
    },
    getField(fieldName: string) {
      assert.equal(fieldName, 'extra');
      return extra;
    },
    setField(fieldName: string, value: string) {
      assert.equal(fieldName, 'extra');
      extra = value;
    },
    async saveTx() {
      saves += 1;
    }
  };
  const store = new DataStore();

  assert.equal(await store.updateData(item, { s: 'reading' }), true);
  assert.equal(saves, 1);
  assert.equal(store.getData(item).s, 'reading');
});

test('setPriority persists priority without clearing progress state', async () => {
  let extra = 'ReadingFlow: {"v":1,"p":{"10":0.45},"s":"reading","ts":1,"lastAttachmentId":"10","lastPage":9,"lastReadAt":1000}';
  const item = {
    id: 1,
    getField(fieldName: string) {
      assert.equal(fieldName, 'extra');
      return extra;
    },
    setField(fieldName: string, value: string) {
      assert.equal(fieldName, 'extra');
      extra = value;
    },
    async saveTx() {}
  };
  const store = new DataStore();

  await store.setPriority(item, 'high');

  const data = store.getData(item);
  assert.equal(data.priority, 'high');
  assert.deepEqual(data.p, { '10': 0.45 });
  assert.equal(data.s, 'reading');
  assert.equal(data.lastAttachmentId, '10');
  assert.equal(data.lastPage, 9);
});

test('setNormalPriority demotes high priority into visible To Read state', async () => {
  let extra = 'ReadingFlow: {"v":1,"p":{},"s":null,"priority":"high","ts":1,"lastAttachmentId":null,"lastPage":null,"lastReadAt":null}';
  const item = {
    id: 1,
    getField(fieldName: string) {
      assert.equal(fieldName, 'extra');
      return extra;
    },
    setField(fieldName: string, value: string) {
      assert.equal(fieldName, 'extra');
      extra = value;
    },
    async saveTx() {}
  };
  const store = new DataStore();

  await store.setNormalPriority(item);

  const data = store.getData(item);
  assert.equal(data.priority, null);
  assert.equal(data.s, 'to-read');
});

test('terminal status changes clear priority to avoid hidden future triage', async () => {
  let extra = 'ReadingFlow: {"v":1,"p":{},"s":"to-read","priority":"high","ts":1,"lastAttachmentId":null,"lastPage":null,"lastReadAt":null}';
  const item = {
    id: 1,
    getField(fieldName: string) {
      assert.equal(fieldName, 'extra');
      return extra;
    },
    setField(fieldName: string, value: string) {
      assert.equal(fieldName, 'extra');
      extra = value;
    },
    async saveTx() {}
  };
  const store = new DataStore();

  await store.setStatus(item, 'read');

  const data = store.getData(item);
  assert.equal(data.s, 'read');
  assert.equal(data.priority, null);
});

test('manual reading status clears priority so Flow does not contradict State', async () => {
  let extra = 'ReadingFlow: {"v":1,"p":{},"s":"to-read","priority":"low","ts":1,"lastAttachmentId":null,"lastPage":null,"lastReadAt":null}';
  const item = {
    id: 1,
    getField(fieldName: string) {
      assert.equal(fieldName, 'extra');
      return extra;
    },
    setField(fieldName: string, value: string) {
      assert.equal(fieldName, 'extra');
      extra = value;
    },
    async saveTx() {}
  };
  const store = new DataStore();

  await store.setStatus(item, 'reading');

  const data = store.getData(item);
  assert.equal(data.s, 'reading');
  assert.equal(data.priority, null);
});

test('setting priority on completed items returns them to the unread queue', async () => {
  let extra = 'ReadingFlow: {"v":1,"p":{},"s":"read","priority":null,"ts":1,"lastAttachmentId":null,"lastPage":null,"lastReadAt":null}';
  const item = {
    id: 1,
    getField(fieldName: string) {
      assert.equal(fieldName, 'extra');
      return extra;
    },
    setField(fieldName: string, value: string) {
      assert.equal(fieldName, 'extra');
      extra = value;
    },
    async saveTx() {}
  };
  const store = new DataStore();

  await store.setPriority(item, 'high');

  const data = store.getData(item);
  assert.equal(data.s, 'to-read');
  assert.equal(data.priority, 'high');
});

test('setting priority on untouched manual reading returns it to the unread queue', async () => {
  let extra = 'ReadingFlow: {"v":1,"p":{},"s":"reading","priority":null,"ts":1,"lastAttachmentId":null,"lastPage":null,"lastReadAt":null}';
  const item = {
    id: 1,
    getField(fieldName: string) {
      assert.equal(fieldName, 'extra');
      return extra;
    },
    setField(fieldName: string, value: string) {
      assert.equal(fieldName, 'extra');
      extra = value;
    },
    async saveTx() {}
  };
  const store = new DataStore();

  await store.setPriority(item, 'low');

  const data = store.getData(item);
  assert.equal(data.s, 'to-read');
  assert.equal(data.priority, 'low');
});
