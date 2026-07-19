import test from 'node:test';
import assert from 'node:assert/strict';
import { DataStore } from '../src/dataStore';
import { NotifierManager } from '../src/notifierManager';

test('item modify notifications expose externally updated Reading Flow data', () => {
  let extra = 'ReadingFlow: {"v":1,"p":{},"s":"to-read"}';
  const item = {
    id: 42,
    getField(fieldName: string) {
      assert.equal(fieldName, 'extra');
      return extra;
    }
  };
  const store = new DataStore();
  const notifier = new NotifierManager(store);

  assert.equal(store.getData(item).s, 'to-read');
  extra = 'ReadingFlow: {"v":1,"p":{},"s":"read"}';

  notifier.notify('modify', 'item', [item.id]);

  assert.equal(store.getData(item).s, 'read');
});

test('item modify notifications preserve reset protection for pending reader saves', async () => {
  let extra = 'ReadingFlow: {"v":1,"p":{"10":0.5},"s":"reading"}';
  const item = {
    id: 43,
    getField() {
      return extra;
    },
    setField(_fieldName: string, value: string) {
      extra = value;
    },
    async saveTx() {}
  };
  const store = new DataStore();
  const notifier = new NotifierManager(store);

  await store.resetProgress(item);
  const resetAt = store.getResetTimestamp(item.id);
  assert.equal(typeof resetAt, 'number');

  notifier.notify('modify', 'item', [item.id]);

  assert.equal(store.getResetTimestamp(item.id), resetAt);
});
