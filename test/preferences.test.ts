import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  clearLegacyReadingFlowPreferenceAliases,
  getGlobalPreference,
  READING_FLOW_PREFS,
  setGlobalPreference,
  setNewItemStatusPreference
} from '../src/preferences';

test('Reading Flow preferences always use Zotero global keys and clear legacy aliases', () => {
  const calls: unknown[][] = [];
  (globalThis as any).Zotero = {
    Prefs: {
      get(...args: unknown[]) { calls.push(['get', ...args]); return 'value'; },
      set(...args: unknown[]) { calls.push(['set', ...args]); },
      clear(...args: unknown[]) { calls.push(['clear', ...args]); }
    }
  };

  assert.equal(getGlobalPreference(READING_FLOW_PREFS.newItemStatus), 'value');
  setGlobalPreference(READING_FLOW_PREFS.displayDensity, 'icons');
  clearLegacyReadingFlowPreferenceAliases();

  assert.deepEqual(calls.slice(0, 2), [
    ['get', READING_FLOW_PREFS.newItemStatus, true],
    ['set', READING_FLOW_PREFS.displayDensity, 'icons', true]
  ]);
  assert.deepEqual(
    calls.slice(2),
    Object.values(READING_FLOW_PREFS).map((name) => ['clear', name])
  );
});

test('new-item status activation is stored as a string to avoid Zotero integer truncation', () => {
  const calls: unknown[][] = [];
  (globalThis as any).Zotero = { Prefs: { set: (...args: unknown[]) => calls.push(args) } };

  setNewItemStatusPreference('to-read', 1234);
  setNewItemStatusPreference('unassigned', 5678);

  assert.deepEqual(calls, [
    [READING_FLOW_PREFS.newItemStatus, 'to-read', true],
    [READING_FLOW_PREFS.newItemStatusActivatedAt, '1000', true],
    [READING_FLOW_PREFS.newItemStatus, 'unassigned', true],
    [READING_FLOW_PREFS.newItemStatusActivatedAt, '0', true]
  ]);
});

test('packaged activation default is a string so Zotero does not lock the pref to integer type', () => {
  const prefs = readFileSync('addon/prefs.js', 'utf8');
  assert.match(
    prefs,
    /pref\("extensions\.readingflow\.newItemStatusActivatedAt", "0"\);/
  );
});
