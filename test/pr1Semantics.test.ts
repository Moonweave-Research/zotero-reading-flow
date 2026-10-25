import test from 'node:test';
import assert from 'node:assert/strict';
import { DataStore } from '../src/dataStore';
import { DEFAULT_FLOW_DATA, FLOW_PREFIX, formatPDFPosition, getLastActivityAt, getLocalDayKey,
  getNormalizedDisplayProgress, resolveReadingStatus, resolveReadingAvailability, formatRelativeDate } from '../src/flowData';
import { calculateStatisticsSnapshot } from '../src/statistics';

function item(extra = '') {
  return { id: 900, saves: 0, getField: () => extra,
    setField: (_field: string, next: string) => { extra = next; },
    async saveTx() { this.saves++; } };
}

for (const maximum of [0.98, 1]) {
  test(`end jump ${maximum} and return preserves maximum, current page, and manual judgment`, async () => {
    const paper = item();
    const store = new DataStore();
    await store.recordProgress(paper, { attachmentId: 'pdf', progress: maximum, lastPage: maximum * 100, pageCount: 100, at: 100 });
    await store.recordProgress(paper, { attachmentId: 'pdf', progress: 0.01, lastPage: 1, pageCount: 100, at: 200 });
    const data = store.getData(paper);
    assert.equal(getNormalizedDisplayProgress(data), maximum);
    assert.equal(formatPDFPosition(data), 'Last viewed: page 1 / 100');
    assert.deepEqual(resolveReadingStatus(data), { status: 'reading', source: 'automatic' });
    assert.equal(data.history?.completedAt, null);
    const snapshot = calculateStatisticsSnapshot([{ id: 1, flowData: data }]);
    assert.equal(snapshot.read, 0);
    assert.equal(snapshot.statusCounts.reading, 1);
    assert.equal(snapshot.progressDistribution['1-24'], 1);
    await store.setStatus(paper, 'read', 300);
    assert.equal(resolveReadingStatus(store.getData(paper)).status, 'read');
    assert.equal(formatPDFPosition(store.getData(paper)), 'Last viewed: page 1 / 100');
    assert.equal(getLastActivityAt(store.getData(paper)), 200);
  });
}

test('proven legacy exact endpoint stays at 100 percent after return', async () => {
  const paper = item(FLOW_PREFIX + JSON.stringify({ ...DEFAULT_FLOW_DATA, p: { pdf: 1 }, pageCount: { pdf: 100 }, lastAttachmentId: 'pdf', lastPage: 100 }));
  const store = new DataStore();
  await store.recordProgress(paper, { attachmentId: 'pdf', progress: 0.01, pageCount: 100, lastPage: 1, at: 100 });
  assert.equal(getNormalizedDisplayProgress(store.getData(paper)), 1);
});

test('ambiguous legacy raw one remains unknown across reads and subsequent non-endpoint observations', async () => {
  const paper = item(FLOW_PREFIX + JSON.stringify({ v: 1, p: { pdf: 1 }, pageCount: { pdf: 100 }, lastAttachmentId: 'pdf', lastPage: 1 }));
  const original = paper.getField();
  const store = new DataStore();
  assert.equal(getNormalizedDisplayProgress(store.getData(paper)), null);
  assert.equal(paper.getField(), original);
  assert.equal(paper.saves, 0);
  await store.recordProgress(paper, { attachmentId: 'pdf', progress: 0.2, pageCount: 100, lastPage: 20, at: 100 });
  assert.equal(getNormalizedDisplayProgress(store.getData(paper)), null);
  assert.equal(formatPDFPosition(store.getData(paper)), 'Last viewed: page 20 / 100');
});

test('no record, supported empty record, malformed, unsupported, duplicate, and invalid status have honest denominators', async () => {
  const valid = FLOW_PREFIX + JSON.stringify({ v: 1, p: {}, s: 'read' });
  const extras = ['', FLOW_PREFIX + '{"v":1,"p":{}}', FLOW_PREFIX + '{bad',
    FLOW_PREFIX + '{"v":99,"s":"read"}', `${valid}\n${valid}`, FLOW_PREFIX + '{"v":1,"s":"future-state"}', valid];
  const papers = [];
  for (const [id, extra] of extras.entries()) {
    const paper = item(extra);
    const store = new DataStore();
    const flowData = store.getData(paper);
    papers.push({ id, flowData, tracked: store.hasReadingFlowData(paper) });
    if (id >= 2 && id <= 5) {
      assert.equal(resolveReadingStatus(flowData).status, 'unavailable');
      assert.equal(await store.setStatus(paper, 'read'), false);
    }
    assert.equal(paper.getField(), extra);
    assert.equal(paper.saves, 0);
  }
  const snapshot = calculateStatisticsSnapshot(papers, { dataset: 'all' });
  assert.equal(snapshot.scopeTotal, 7);
  assert.equal(snapshot.classifiableItems, 3);
  assert.equal(snapshot.unavailableItems, 4);
  assert.equal(snapshot.statusCounts.unassigned, 2);
  assert.equal(snapshot.statusCounts.read, 1);
  assert.equal(snapshot.statusDenominator, 3);
  const filtered = calculateStatisticsSnapshot(papers, { dataset: 'all', statusFilter: 'read' });
  assert.equal(filtered.totalPapers, 1);
  assert.equal(filtered.scopeTotal, 7);
  assert.equal(filtered.statusDenominator, 3);
  assert.equal(calculateStatisticsSnapshot(papers, { dataset: 'tracked' }).unavailableItems, 4);
});

test('status/reset timestamps are not PDF activity; retained observations supply display and sorting time', () => {
  const at = new Date(2026, 9, 20, 23, 45).getTime();
  const day = getLocalDayKey(at);
  const data = { ...DEFAULT_FLOW_DATA, ts: at + 1000, history: {
    startedAt: at - 1000, completedAt: null, activeDaysTotal: 1,
    days: { [day]: { activity: true, lastReadAt: at, progress: { pdf: 0.5 }, status: null, reset: true, completed: false } }
  } };
  assert.equal(getLastActivityAt(data), at);
  assert.equal(resolveReadingStatus(data).status, 'reading');
  const statusOnly = { ...data, history: { ...data.history, days: { [day]: { ...data.history.days[day], activity: false, progress: {} } } } };
  assert.equal(getLastActivityAt(statusOnly), null);
  assert.equal(resolveReadingStatus(statusOnly).status, 'unassigned');
});

test('preexisting manual states and historical completion records survive read-only reinterpretation and writes', async () => {
  for (const status of ['to-read', 'reading', 'skimmed', 'read'] as const) {
    const history = { startedAt: 1, completedAt: 50, activeDaysTotal: 1, days: {} };
    const paper = item(FLOW_PREFIX + JSON.stringify({ ...DEFAULT_FLOW_DATA, v: 2, s: status, history }));
    const original = paper.getField();
    const store = new DataStore();
    assert.equal(resolveReadingStatus(store.getData(paper)).status, status);
    assert.equal(paper.getField(), original);
    await store.recordProgress(paper, { attachmentId: 'pdf', progress: 1, pageCount: 100, lastPage: 100, at: 100 });
    assert.equal(store.getData(paper).history?.completedAt, 50);
    assert.equal(store.getData(paper).s, status);
  }
});

test('current page without a total never becomes a percentage, including page one', () => {
  for (const page of [1, 37]) {
    const data = { ...DEFAULT_FLOW_DATA, lastAttachmentId: 'pdf', lastPage: page };
    assert.equal(formatPDFPosition(data), `Last viewed: page ${page} (page count unknown)`);
    const snapshot = calculateStatisticsSnapshot([{ id: 1, flowData: data }]);
    assert.equal(snapshot.progressDistribution.unknown, 1);
    assert.equal(snapshot.progressDistribution['100'], 0);
  }
  assert.equal(resolveReadingAvailability({ ...DEFAULT_FLOW_DATA }), 'no-record');
  assert.equal(resolveReadingAvailability({ ...DEFAULT_FLOW_DATA, s: 'read' }), 'available');
  assert.equal(resolveReadingAvailability({ ...DEFAULT_FLOW_DATA, availability: 'unavailable' }), 'unavailable');
});

test('older PDF activity labels use the same local date as history instead of UTC', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Asia/Seoul';
  try {
    const at = Date.parse('2026-10-01T16:00:00Z');
    assert.equal(formatRelativeDate(at, at + 10 * 86400000), '2026-10-02');
    assert.equal(formatRelativeDate(at, at + 10 * 86400000), getLocalDayKey(at));
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('damaged rollups and timestamps cannot silently turn into valid empty history on a write', async () => {
  for (const fields of [
    { ts: 'bad' },
    { lastReadAt: 'bad' },
    { history: { startedAt: 1, completedAt: 'bad', days: {} } },
    { history: { startedAt: 1, days: { '2026-10-24': { activity: 'true' } } } },
    { history: { startedAt: 1, days: { '2026-02-30': { activity: true } } } }
  ]) {
    const original = FLOW_PREFIX + JSON.stringify({ v: 2, p: {}, ...fields });
    const paper = item(original);
    const store = new DataStore();
    assert.equal(resolveReadingAvailability(store.getData(paper)), 'unavailable');
    assert.equal(await store.setStatus(paper, 'read'), false);
    assert.equal(paper.getField(), original);
    assert.equal(paper.saves, 0);
  }
});

test('a damaged namespace without the usual separator space cannot masquerade as no record', async () => {
  for (const original of ['ReadingFlow:{bad', '  ReadingFlow: {"v":99,"s":"read"}']) {
    const paper = item(original);
    const store = new DataStore();
    assert.equal(resolveReadingAvailability(store.getData(paper)), 'unavailable');
    assert.equal(await store.initializeStatusIfUnowned(paper, 'to-read'), false);
    assert.equal(await store.setStatus(paper, 'read'), false);
    assert.equal(paper.getField(), original);
    assert.equal(paper.saves, 0);
  }
});
