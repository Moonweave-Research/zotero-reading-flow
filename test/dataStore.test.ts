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
