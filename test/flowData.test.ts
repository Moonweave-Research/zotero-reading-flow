import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FLOW_DATA,
  HISTORY_RETENTION_DAYS,
  formatRelativeDate,
  getDisplayAttachmentId,
  getDisplayProgress,
  getNormalizedDisplayProgress,
  inferStatus,
  mergeFlowData,
  normalizeFlowData,
  resolveReadingStatus
} from '../src/flowData';

test('normalizeFlowData preserves valid v1 fields and drops invalid values', () => {
  const data = normalizeFlowData({
    v: 99,
    p: { '10': 0.5, '11': 8.2, bad: Number.NaN, zero: 0 },
    pageCount: { '10': 5, '11': 12, bad: Number.NaN, zero: 0, tooLarge: 200001 },
    c: '#123456',
    s: 'important',
    ts: 100,
    lastAttachmentId: '10',
    lastPage: 3.6,
    lastReadAt: 200
  });

  assert.deepEqual(data, {
    v: 1,
    p: { '10': 0.5, '11': 8 },
    pageCount: { '10': 5, '11': 12 },
    c: '#123456',
    s: 'important',
    ts: 100,
    lastAttachmentId: '10',
    lastPage: 4,
    lastReadAt: 200
  });
});

test('normalizeFlowData reads valid v2 history without changing current fields', () => {
  const data = normalizeFlowData({
    v: 2,
    p: { '10': 0.5 },
    s: 'reading',
    history: {
      startedAt: 100,
      completedAt: null,
      activeDaysTotal: 1,
      days: {
        '2026-07-28': {
          activity: true,
          lastReadAt: 200,
          progress: { '10': 0.5 },
          status: 'reading',
          reset: false,
          completed: false
        }
      }
    }
  });

  assert.equal(data.v, 2);
  assert.equal(data.p['10'], 0.5);
  assert.equal(data.history?.activeDaysTotal, 1);
  assert.equal(data.history?.days['2026-07-28'].status, 'reading');
});

test('normalizeFlowData drops malformed or oversized history but keeps current state', () => {
  const days = Object.fromEntries(Array.from({ length: HISTORY_RETENTION_DAYS + 1 }, (_, index) => [
    `2026-01-${String(index + 1).padStart(2, '0')}`,
    { activity: false }
  ]));
  const data = normalizeFlowData({
    v: 2,
    p: { '10': 0.5 },
    s: 'reading',
    history: { startedAt: 'bad', activeDaysTotal: 4, days }
  });

  assert.equal(data.v, 1);
  assert.equal(data.p['10'], 0.5);
  assert.equal(data.s, 'reading');
  assert.equal(data.history, undefined);
});

test('getDisplayProgress prefers the most recently read attachment over max progress', () => {
  const data = normalizeFlowData({
    p: { '10': 0.9, '11': 0.2 },
    lastAttachmentId: '11'
  });

  assert.equal(getDisplayAttachmentId(data), '11');
  assert.equal(getDisplayProgress(data), 0.2);
});

test('getDisplayProgress falls back to max progress when last attachment is unavailable', () => {
  const data = normalizeFlowData({
    p: { '10': 0.4, '11': 0.7 },
    lastAttachmentId: '99'
  });

  assert.equal(getDisplayAttachmentId(data), '11');
  assert.equal(getDisplayProgress(data), 0.7);
});

test('mergeFlowData preserves progress map and updates recency metadata', () => {
  const current = normalizeFlowData({
    p: { '10': 0.4 },
    lastAttachmentId: '10',
    pageCount: { '10': 5 },
    ts: 50
  });

  const merged = mergeFlowData(current, {
    p: { '11': 0.2 },
    pageCount: { '10': 5, '11': 12 },
    lastAttachmentId: '11',
    lastPage: 2,
    lastReadAt: 1000
  }, 1100);

  assert.equal(merged.ts, 1100);
  assert.deepEqual(merged.p, { '10': 0.4, '11': 0.2 });
  assert.equal(merged.lastAttachmentId, '11');
  assert.equal(merged.lastPage, 2);
  assert.equal(merged.lastReadAt, 1000);
  assert.deepEqual(merged.pageCount, { '10': 5, '11': 12 });
});

test('mergeFlowData can intentionally clear progress for reset actions', () => {
  const current = normalizeFlowData({
    p: { '10': 0.4, '11': 0.8 },
    lastAttachmentId: '11',
    lastPage: 8,
    lastReadAt: 1000
  });

  const merged = mergeFlowData(current, {
    p: {},
    s: 'to-read',
    lastAttachmentId: null,
    lastPage: null,
    lastReadAt: null
  }, 1200);

  assert.deepEqual(merged.p, {});
  assert.equal(merged.s, 'to-read');
  assert.equal(merged.lastAttachmentId, null);
  assert.equal(merged.lastPage, null);
  assert.equal(merged.lastReadAt, null);
});

test('reading status distinguishes untouched, automatic, and manual states consistently', () => {
  assert.deepEqual(resolveReadingStatus({ ...DEFAULT_FLOW_DATA }), {
    status: 'unassigned',
    source: 'unassigned'
  });
  assert.equal(inferStatus({ ...DEFAULT_FLOW_DATA }), null);
  assert.equal(inferStatus(normalizeFlowData({ p: { '10': 0.2 } })), 'reading');
  assert.equal(inferStatus(normalizeFlowData({ p: { '10': 0.98 } })), 'read');
  assert.equal(inferStatus(normalizeFlowData({ p: { '10': 95 }, pageCount: { '10': 100 } })), 'read');
  assert.deepEqual(resolveReadingStatus(normalizeFlowData({ p: { '10': 0.2 } })), {
    status: 'reading',
    source: 'automatic'
  });
  assert.equal(inferStatus(normalizeFlowData({ s: 'skimmed', p: { '10': 0.98 } })), 'skimmed');
  assert.deepEqual(resolveReadingStatus(normalizeFlowData({ s: 'skimmed', p: { '10': 0.98 } })), {
    status: 'skimmed',
    source: 'manual'
  });
});

test('ambiguous legacy progress value 1 is not inferred as complete', () => {
  const ambiguous = normalizeFlowData({ p: { '10': 1 } });
  assert.equal(getNormalizedDisplayProgress(ambiguous), null);
  assert.equal(resolveReadingStatus(ambiguous).status, 'reading');

  const firstPage = normalizeFlowData({
    p: { '10': 1 },
    pageCount: { '10': 100 },
    lastAttachmentId: '10',
    lastPage: 1
  });
  assert.equal(getNormalizedDisplayProgress(firstPage), 0.01);
  assert.equal(resolveReadingStatus(firstPage).status, 'reading');

  const completed = normalizeFlowData({
    p: { '10': 1 },
    pageCount: { '10': 100 },
    lastAttachmentId: '10',
    lastPage: 100
  });
  assert.equal(getNormalizedDisplayProgress(completed), 1);
  assert.equal(resolveReadingStatus(completed).status, 'read');
});

test('oversized valid history is capped deterministically instead of discarded', () => {
  const days = Object.fromEntries(Array.from({ length: HISTORY_RETENTION_DAYS + 4 }, (_, index) => {
    const date = new Date(2025, 0, 1 + index);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return [key, { activity: true, progress: { '10': 0.2 } }];
  }));
  const data = normalizeFlowData({
    v: 2,
    p: { '10': 0.2 },
    history: { startedAt: 1, activeDaysTotal: HISTORY_RETENTION_DAYS + 4, days }
  });

  assert.equal(data.v, 2);
  assert.equal(Object.keys(data.history!.days).length, HISTORY_RETENTION_DAYS);
  assert.equal(Object.keys(data.history!.days)[0], '2025-01-05');
});

test('formatRelativeDate gives compact stable labels', () => {
  const now = Date.parse('2026-04-23T12:00:00Z');
  assert.equal(formatRelativeDate(now - 30 * 1000, now), 'now');
  assert.equal(formatRelativeDate(now - 5 * 60 * 1000, now), '5m');
  assert.equal(formatRelativeDate(now - 3 * 60 * 60 * 1000, now), '3h');
  assert.equal(formatRelativeDate(now - 2 * 24 * 60 * 60 * 1000, now), '2d');
  assert.equal(formatRelativeDate(Date.parse('2026-03-01T00:00:00Z'), now), '2026-03-01');
});
