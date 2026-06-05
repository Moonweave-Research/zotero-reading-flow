import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getFlowAction,
  parseFlowAction,
  serializeFlowAction
} from '../src/flowAction';
import { normalizeFlowData } from '../src/flowData';

const now = Date.parse('2026-06-04T12:00:00Z');
const day = 24 * 60 * 60 * 1000;

test('getFlowAction stays quiet for untouched items', () => {
  const action = getFlowAction(normalizeFlowData({}), now);

  assert.equal(action.label, '');
  assert.equal(action.detail, '');
  assert.equal(action.title, '');
  assert.equal(action.tone, 'empty');
  assert.equal(action.sortValue, '900|empty');
});

test('getFlowAction suggests Read Next for high-priority unread papers', () => {
  const action = getFlowAction(normalizeFlowData({ priority: 'high' }), now);

  assert.equal(action.label, 'Read Next');
  assert.equal(action.detail, '');
  assert.equal(action.tone, 'high');
  assert.equal(action.sortValue, '000|read-next');
  assert.match(action.title, /High priority/);
  assert.match(action.title, /not started/);
});

test('getFlowAction suggests Resume with percent for recent active reading', () => {
  const action = getFlowAction(normalizeFlowData({
    p: { '10': 0.45 },
    lastAttachmentId: '10',
    lastPage: 9,
    pageCount: { '10': 20 },
    lastReadAt: now - day
  }), now);

  assert.equal(action.label, 'Resume');
  assert.equal(action.detail, '45%');
  assert.equal(action.tone, 'reading');
  assert.equal(action.sortValue, '300|resume|045');
  assert.match(action.title, /45%/);
  assert.match(action.title, /page 9 \/ 20/);
  assert.match(action.title, /last read 1d/);
});

test('getFlowAction shows manually marked reading even before progress is tracked', () => {
  const action = getFlowAction(normalizeFlowData({ s: 'reading' }), now);

  assert.equal(action.label, 'Reading');
  assert.equal(action.detail, '');
  assert.equal(action.tone, 'reading');
  assert.equal(action.sortValue, '350|reading');
});

test('getFlowAction lets explicit Reading state win over stale priority', () => {
  const action = getFlowAction(normalizeFlowData({ s: 'reading', priority: 'low' }), now);

  assert.equal(action.label, 'Reading');
  assert.equal(action.detail, '');
  assert.equal(action.tone, 'reading');
  assert.equal(action.sortValue, '350|reading');
});

test('getFlowAction treats legacy page-number progress as a page target, not a percent', () => {
  const action = getFlowAction(normalizeFlowData({
    p: { '10': 9 },
    lastAttachmentId: '10',
    lastPage: 9,
    lastReadAt: now - day
  }), now);

  assert.equal(action.label, 'Resume');
  assert.equal(action.detail, 'p. 9');
  assert.equal(action.tone, 'reading');
  assert.equal(action.sortValue, '300|resume-page|009');
  assert.doesNotMatch(action.detail, /0%/);
});

test('getFlowAction returns to stale legacy page-number progress without showing impossible percent', () => {
  const action = getFlowAction(normalizeFlowData({
    priority: 'high',
    p: { '10': 9 },
    lastAttachmentId: '10',
    lastPage: 9,
    lastReadAt: now - 20 * day
  }), now);

  assert.equal(action.label, 'Return');
  assert.equal(action.detail, 'p. 9');
  assert.equal(action.tone, 'high');
  assert.equal(action.sortValue, '100|return-page|020|009');
});

test('getFlowAction suggests Return instead of exposing stale diagnostics', () => {
  const action = getFlowAction(normalizeFlowData({
    priority: 'high',
    p: { '10': 0.45 },
    lastAttachmentId: '10',
    lastReadAt: now - 15 * day
  }), now);

  assert.equal(action.label, 'Return');
  assert.equal(action.detail, '45%');
  assert.equal(action.tone, 'high');
  assert.equal(action.sortValue, '100|return|015|045');
  assert.match(action.title, /High priority/);
  assert.match(action.title, /untouched 15d/);
  assert.doesNotMatch(action.label, /Stale/);
});

test('getFlowAction suggests Finish for near-complete papers', () => {
  const action = getFlowAction(normalizeFlowData({
    p: { '10': 0.88 },
    lastAttachmentId: '10',
    lastReadAt: now - day
  }), now);

  assert.equal(action.label, 'Finish');
  assert.equal(action.detail, '88%');
  assert.equal(action.tone, 'finish');
  assert.equal(action.sortValue, '200|finish|088');
});

test('getFlowAction marks completed and skimmed papers plainly', () => {
  assert.equal(getFlowAction(normalizeFlowData({ s: 'read' }), now).label, 'Done');
  assert.equal(getFlowAction(normalizeFlowData({ p: { '10': 0.97 } }), now).label, 'Done');
  assert.equal(getFlowAction(normalizeFlowData({ s: 'skimmed' }), now).label, 'Skimmed');
});

test('getFlowAction handles explicit To Read without labeling untouched items', () => {
  assert.equal(getFlowAction(normalizeFlowData({}), now).label, '');
  assert.equal(getFlowAction(normalizeFlowData({ s: 'to-read' }), now).label, 'To Read');
});

test('getFlowAction gives low priority a visible lower-urgency action', () => {
  const action = getFlowAction(normalizeFlowData({ priority: 'low' }), now);

  assert.equal(action.label, 'Later');
  assert.equal(action.detail, '');
  assert.equal(action.tone, 'neutral');
  assert.equal(action.sortValue, '850|later');
});

test('getFlowAction keeps low priority visible on active reading', () => {
  const action = getFlowAction(normalizeFlowData({
    priority: 'low',
    p: { '10': 0.45 },
    lastAttachmentId: '10',
    lastReadAt: now - day
  }), now);

  assert.equal(action.label, 'Later');
  assert.equal(action.detail, '45%');
  assert.equal(action.tone, 'neutral');
  assert.equal(action.sortValue, '450|resume-later|045');
  assert.match(action.title, /Low priority/);
});

test('getFlowAction migrates legacy important status into high-priority active reading', () => {
  const action = getFlowAction(normalizeFlowData({
    s: 'important',
    p: { '10': 0.45 },
    lastAttachmentId: '10',
    lastReadAt: now - day
  }), now);

  assert.equal(action.label, 'Resume');
  assert.equal(action.detail, '45%');
  assert.equal(action.tone, 'high');
  assert.equal(action.sortValue, '150|resume|045');
  assert.match(action.title, /High priority/);
});

test('getFlowAction migrates legacy important status for papers that are ready to finish', () => {
  const action = getFlowAction(normalizeFlowData({
    s: 'important',
    p: { '10': 0.88 },
    lastAttachmentId: '10',
    lastReadAt: now - day
  }), now);

  assert.equal(action.label, 'Finish');
  assert.equal(action.detail, '88%');
  assert.equal(action.tone, 'finish');
  assert.equal(action.sortValue, '200|finish|088');
  assert.match(action.title, /High priority/);
});

test('getFlowAction migrates legacy important status for stale papers', () => {
  const action = getFlowAction(normalizeFlowData({
    s: 'important',
    p: { '10': 0.45 },
    lastAttachmentId: '10',
    lastReadAt: now - 20 * day
  }), now);

  assert.equal(action.label, 'Return');
  assert.equal(action.detail, '45%');
  assert.equal(action.tone, 'high');
  assert.equal(action.sortValue, '100|return|020|045');
  assert.match(action.title, /High priority/);
});

test('getFlowAction makes normal priority visibly demote legacy important items', () => {
  const action = getFlowAction(normalizeFlowData({
    s: 'important',
    priority: 'normal'
  }), now);

  assert.equal(action.label, 'To Read');
  assert.equal(action.detail, '');
  assert.equal(action.tone, 'neutral');
  assert.equal(action.sortValue, '600|to-read');
  assert.match(action.title, /To Read/);
  assert.doesNotMatch(action.title, /Important/);
  assert.doesNotMatch(action.title, /Normal priority/);
});

test('serializeFlowAction round-trips action data for column providers', () => {
  const action = getFlowAction(normalizeFlowData({
    p: { '10': 0.45 },
    lastAttachmentId: '10'
  }), now);

  assert.deepEqual(parseFlowAction(serializeFlowAction(action)), action);
  assert.equal(serializeFlowAction(action).startsWith(`${action.sortValue}\t`), true);
  assert.equal(parseFlowAction(''), null);
  assert.equal(parseFlowAction('{bad json'), null);
});
