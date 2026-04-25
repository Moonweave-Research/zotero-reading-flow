import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FLOW_DATA, normalizeFlowData } from '../src/flowData';
import {
  getReadingQueueState,
  isContinueReading,
  isNearlyDone,
  isStaleReading,
  STALE_READING_MS
} from '../src/readingQueue';

const NOW = Date.UTC(2026, 3, 25);

test('classifies explicit reading status as continue reading', () => {
  const data = normalizeFlowData({ s: 'reading' });
  const state = getReadingQueueState(data, NOW);

  assert.equal(state.continueReading, true);
  assert.equal(isContinueReading(data), true);
});

test('classifies implicit mid-progress as continue reading', () => {
  const data = normalizeFlowData({ p: { '10': 0.45 }, lastAttachmentId: '10' });
  const state = getReadingQueueState(data, NOW);

  assert.equal(state.continueReading, true);
  assert.equal(state.nearlyDone, false);
});

test('classifies progress between 80% and 94% as nearly done', () => {
  const data = normalizeFlowData({ p: { '10': 0.85 }, lastAttachmentId: '10' });
  const state = getReadingQueueState(data, NOW);

  assert.equal(state.continueReading, true);
  assert.equal(state.nearlyDone, true);
  assert.equal(isNearlyDone(data), true);
});

test('classifies implicit 0.94 progress as continue reading and nearly done', () => {
  const data = normalizeFlowData({ p: { '10': 0.94 }, lastAttachmentId: '10' });
  const state = getReadingQueueState(data, NOW);

  assert.equal(state.continueReading, true);
  assert.equal(state.nearlyDone, true);
});

test('does not classify implicit 0.95 progress as queued because status inference treats it as read', () => {
  const data = normalizeFlowData({
    p: { '10': 0.95 },
    lastAttachmentId: '10',
    lastReadAt: NOW - STALE_READING_MS
  });

  assert.deepEqual(getReadingQueueState(data, NOW), {
    continueReading: false,
    nearlyDone: false,
    staleReading: false
  });
});

test('classifies page-style progress as continue reading but not nearly done', () => {
  const data = normalizeFlowData({ p: { '10': 12 }, lastAttachmentId: '10' });
  const state = getReadingQueueState(data, NOW);

  assert.equal(state.continueReading, true);
  assert.equal(state.nearlyDone, false);
});

test('does not classify completed progress as in-progress', () => {
  const data = normalizeFlowData({ p: { '10': 1 }, lastAttachmentId: '10' });
  const state = getReadingQueueState(data, NOW);

  assert.equal(state.continueReading, false);
  assert.equal(state.nearlyDone, false);
  assert.equal(state.staleReading, false);
});

test('classifies old reading item as stale reading', () => {
  const data = normalizeFlowData({
    s: 'reading',
    lastReadAt: NOW - STALE_READING_MS - 1
  });

  assert.equal(isStaleReading(data, NOW), true);
  assert.equal(getReadingQueueState(data, NOW).staleReading, true);
});

test('classifies reading item at exact stale cutoff as stale reading', () => {
  const data = normalizeFlowData({
    s: 'reading',
    lastReadAt: NOW - STALE_READING_MS
  });

  assert.equal(isStaleReading(data, NOW), true);
});

test('classifies old page-style progress as stale reading', () => {
  const data = normalizeFlowData({
    p: { '10': 12 },
    lastAttachmentId: '10',
    lastReadAt: NOW - STALE_READING_MS - 1
  });

  assert.equal(isStaleReading(data, NOW), true);
  assert.equal(getReadingQueueState(data, NOW).staleReading, true);
});

test('does not classify recent reading item as stale', () => {
  const data = normalizeFlowData({
    s: 'reading',
    lastReadAt: NOW - STALE_READING_MS + 1
  });

  assert.equal(isStaleReading(data, NOW), false);
});

test('explicit non-reading status prevents progress-only continue reading', () => {
  const data = normalizeFlowData({
    s: 'to-read',
    p: { '10': 0.45 },
    lastAttachmentId: '10'
  });

  assert.deepEqual(getReadingQueueState(data, NOW), {
    continueReading: false,
    nearlyDone: false,
    staleReading: false
  });
});

test('empty flow data is not in any queue', () => {
  assert.deepEqual(getReadingQueueState({ ...DEFAULT_FLOW_DATA }, NOW), {
    continueReading: false,
    nearlyDone: false,
    staleReading: false
  });
});
