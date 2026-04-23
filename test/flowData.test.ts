import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FLOW_DATA,
  formatRelativeDate,
  getDisplayAttachmentId,
  getDisplayProgress,
  inferStatus,
  mergeFlowData,
  normalizeFlowData
} from '../src/flowData';

test('normalizeFlowData preserves valid v1 fields and drops invalid values', () => {
  const data = normalizeFlowData({
    v: 99,
    p: { '10': 0.5, '11': 8.2, bad: Number.NaN, zero: 0 },
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
    c: '#123456',
    s: 'important',
    ts: 100,
    lastAttachmentId: '10',
    lastPage: 4,
    lastReadAt: 200
  });
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
    ts: 50
  });

  const merged = mergeFlowData(current, {
    p: { '11': 0.2 },
    lastAttachmentId: '11',
    lastPage: 2,
    lastReadAt: 1000
  }, 1100);

  assert.equal(merged.ts, 1100);
  assert.deepEqual(merged.p, { '10': 0.4, '11': 0.2 });
  assert.equal(merged.lastAttachmentId, '11');
  assert.equal(merged.lastPage, 2);
  assert.equal(merged.lastReadAt, 1000);
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

test('inferStatus uses explicit status or derives from progress', () => {
  assert.equal(inferStatus({ ...DEFAULT_FLOW_DATA }), 'to-read');
  assert.equal(inferStatus(normalizeFlowData({ p: { '10': 0.2 } })), 'reading');
  assert.equal(inferStatus(normalizeFlowData({ p: { '10': 0.98 } })), 'read');
  assert.equal(inferStatus(normalizeFlowData({ s: 'skimmed', p: { '10': 0.98 } })), 'skimmed');
});

test('formatRelativeDate gives compact stable labels', () => {
  const now = Date.parse('2026-04-23T12:00:00Z');
  assert.equal(formatRelativeDate(now - 30 * 1000, now), 'now');
  assert.equal(formatRelativeDate(now - 5 * 60 * 1000, now), '5m');
  assert.equal(formatRelativeDate(now - 3 * 60 * 60 * 1000, now), '3h');
  assert.equal(formatRelativeDate(now - 2 * 24 * 60 * 60 * 1000, now), '2d');
  assert.equal(formatRelativeDate(Date.parse('2026-03-01T00:00:00Z'), now), '2026-03-01');
});
