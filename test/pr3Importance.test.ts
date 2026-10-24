import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { DataStore } from '../src/dataStore';
import { DEFAULT_FLOW_DATA, FLOW_PREFIX, resolveReadingStatus, resolveReadingAvailability } from '../src/flowData';
import { calculateStatisticsSnapshot, selectStatisticsPapers } from '../src/statistics';

function item(payload: any = { v: 1, s: 'read', p: {} }) {
  let extra = `Custom: keep\n${FLOW_PREFIX}${JSON.stringify(payload)}`, saves = 0;
  return { id: 300, tags: ['Important', 'read', 'user-tag'],
    getField: () => extra,
    setField(field: string, value: string) { assert.equal(field, 'extra'); extra = value; },
    async saveTx() { saves++; }, get saves() { return saves; }
  };
}
const parsed = (i: ReturnType<typeof item>) => JSON.parse(i.getField().split(FLOW_PREFIX)[1]);

test('Read and Important survive each independent command, PDF tracking, reset, and supported-client round trip', async () => {
  const i = item({ ...DEFAULT_FLOW_DATA, s: 'read', p: { pdf: 0.8 }, lastAttachmentId: 'pdf', lastPage: 8, lastReadAt: 100 });
  const s = new DataStore(); const tags = [...i.tags];
  assert.equal(await s.setImportant(i, true, 200), true);
  assert.equal(parsed(i).v, 3); assert.equal(parsed(i).s, 'read');
  assert.equal(parsed(i).history, undefined); // importance does not fabricate history
  assert.equal(await s.setImportant(i, false, 201), true);
  assert.equal(parsed(i).s, 'read');
  await s.setImportant(i, true, 202);
  for (const stage of ['skimmed', 'reading', 'to-read', 'read'] as const) {
    await s.setStatus(i, stage, 300); assert.equal(parsed(i).important, true);
    assert.equal(parsed(i).lastPage, 8);
  }
  await s.clearManualStatus(i); assert.equal(parsed(i).important, true);
  assert.deepEqual(resolveReadingStatus(s.getData(i)), { status: 'reading', source: 'automatic' });
  await s.setStatus(i, 'read', 400);
  await s.recordProgress(i, { attachmentId: 'pdf', progress: 0.95, at: 500 });
  await s.resetProgress(i, 600);
  const peer = new DataStore().getData(i);
  assert.equal(peer.s, 'read'); assert.equal(peer.important, true); assert.equal(peer.lastReadAt, 500);
  assert.deepEqual(i.tags, tags); assert.match(i.getField(), /^Custom: keep\n/);
});

test('legacy important is a read-only flag interpretation; manual Read is never reconstructed', async () => {
  for (const p of [{}, { pdf: 1 }, { pdf: 100 }]) {
    const i = item({ v: 1, s: 'important', p }); const original = i.getField(); const s = new DataStore();
    for (let count = 0; count < 3; count++) {
      const data = s.getData(i);
      assert.equal(data.important, true); assert.equal(data.s, null);
      assert.equal(resolveReadingStatus(data).status, Object.keys(p).length ? 'reading' : 'unassigned');
      assert.equal(resolveReadingAvailability(data), 'available');
      s.hasReadingFlowData(i); s.hasStoredReadingFlowData(i); s.invalidateCache(i.id);
    }
    assert.equal(i.saves, 0); assert.equal(i.getField(), original);
    assert.equal(await s.clearManualStatus(i), false);
    await s.setStatus(i, 'read', 200);
    assert.equal(parsed(i).v, 3); assert.equal(parsed(i).s, 'read'); assert.equal(parsed(i).important, true);
  }
});

test('background PDF observation retains legacy encoding until explicit importance/status transition', async () => {
  const i = item({ v: 1, s: 'important', p: {} }); const s = new DataStore();
  await s.recordProgress(i, { attachmentId: 'pdf', progress: 0.5, at: 100 });
  assert.equal(parsed(i).v, 2); assert.equal(parsed(i).s, 'important'); assert.equal(parsed(i).important, undefined);
  assert.equal(s.getData(i).s, null); assert.equal(s.getData(i).important, true);
  const history = parsed(i).history;
  await s.setImportant(i, false, 200);
  assert.equal(parsed(i).v, 3); assert.equal(parsed(i).s, null); assert.equal(parsed(i).important, false);
  assert.deepEqual(parsed(i).history, history);
});

test('importance-only items enroll; status and importance filters intersect and counts never double-count stages', async () => {
  const rows = [
    { id: 1, flowData: { ...DEFAULT_FLOW_DATA, v: 3, s: 'read' as const, important: true } },
    { id: 2, flowData: { ...DEFAULT_FLOW_DATA, v: 3, important: true } },
    { id: 3, flowData: { ...DEFAULT_FLOW_DATA, s: 'read' as const } },
    { id: 4, flowData: { ...DEFAULT_FLOW_DATA, availability: 'unavailable' as const } }
  ];
  const snapshot = calculateStatisticsSnapshot(rows, { importantOnly: true });
  assert.equal(snapshot.totalPapers, 2); assert.equal(snapshot.importantCount, 2);
  assert.equal(snapshot.statusCounts.read, 1); assert.equal(snapshot.statusCounts.unassigned, 1);
  assert.equal(Object.values(snapshot.statusCounts).reduce((a,b) => a+b, 0), 2);
  assert.deepEqual(selectStatisticsPapers(rows, { statusFilter: 'read', importantOnly: true }).map(p => p.id), [1]);
  const i = item({ v: 3, important: true, s: null, p: {} }); const s = new DataStore();
  assert.equal(s.hasReadingFlowData(i), true);
  assert.equal(await s.clearManualStatus(i), false); assert.equal(parsed(i).important, true);
});

test('malformed, duplicate, future and invalid v3 records are retained without writes', async () => {
  for (const payload of [{ v: 4, important: true }, { v: 3, important: 'true' }, { v: 3, important: true, s: 'important' }, { v: 2, important: true }]) {
    const i = item(payload); const s = new DataStore(); const bytes = i.getField();
    assert.equal(s.getData(i).availability, 'unavailable');
    assert.equal(await s.setImportant(i, true), false); assert.equal(await s.setStatus(i, 'read'), false);
    assert.equal(i.getField(), bytes); assert.equal(i.saves, 0);
  }
  for (const extra of ['ReadingFlow: {broken', 'ReadingFlow: {"v":3,"important":true}\nReadingFlow: {"v":1}']) {
    const i = item(); i.setField('extra', extra); const s = new DataStore();
    assert.equal(await s.setImportant(i, false), false); assert.equal(i.getField(), extra); assert.equal(i.saves, 0);
  }
});

test('read-only and no-op importance commands do not write; concurrent commands preserve both values', async () => {
  const i = item(); const s = new DataStore();
  assert.equal(await s.setImportant(i, false), false); assert.equal(i.saves, 0);
  await Promise.all([s.setImportant(i, true, 100), s.setStatus(i, 'skimmed', 200)]);
  assert.equal(parsed(i).important, true); assert.equal(parsed(i).s, 'skimmed');
  const readonly = Object.assign(item(), { isEditable: () => false });
  assert.equal(await s.setImportant(readonly, true), false); assert.equal(readonly.saves, 0);
});

test('legacy historical Important rollups and first-completion metadata are retained on explicit transition', async () => {
  const history = { startedAt: 0, completedAt: 100, activeDaysTotal: 1, days: {
    '2026-10-24': { activity: true, lastReadAt: 100, progress: { pdf: 0.95 }, status: 'important', reset: false, completed: true }
  } };
  const i = item({ v: 2, s: 'important', p: {}, history }); const s = new DataStore();
  await s.setImportant(i, false, 200);
  assert.equal(parsed(i).v, 3); assert.equal(parsed(i).s, null);
  assert.deepEqual(parsed(i).history, history);
  assert.deepEqual(resolveReadingStatus(s.getData(i)), { status: 'reading', source: 'automatic' });
});

test('actual pinned old writer refuses v3 and retains bytes through every mutation API', () => {
  assert.match(execFileSync(process.execPath, ['scripts/verify-pr3-compatibility.js'], { encoding: 'utf8' }), /16 old-writer refusals/);
});
