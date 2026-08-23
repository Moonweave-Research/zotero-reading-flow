import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { DEFAULT_FLOW_DATA } from '../src/flowData';
import { DashboardApp, renderDashboard, startDashboard } from '../src/dashboard';
import type { HistoricalSnapshot, StatisticsDataset, StatisticsSnapshot } from '../src/statistics';

class FakeElement {
  public textContent = '';
  public className = '';
  public hidden = false;
  public disabled = false;
  public value = '';
  public style: Record<string, string> = {};
  public children: FakeElement[] = [];
  public attributes: Record<string, string> = {};
  public listeners: Record<string, Array<() => void>> = {};

  constructor(public readonly tagName: string) {}

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  removeAttribute(name: string) {
    delete this.attributes[name];
  }

  addEventListener(type: string, listener: () => void) {
    this.listeners[type] ??= [];
    this.listeners[type].push(listener);
  }

  replaceChildren(...children: FakeElement[]) {
    this.children = children;
  }

  append(...children: FakeElement[]) {
    this.children.push(...children);
  }
}

class FakeDocument {
  public readonly elements = new Map<string, FakeElement>();
  public documentElement: FakeElement | null = null;

  getElementById(id: string) {
    return this.elements.get(id) ?? null;
  }

  createElement(tagName: string) {
    return new FakeElement(tagName);
  }

  add(id: string, tagName = 'div', value = '') {
    const element = new FakeElement(tagName);
    element.value = value;
    this.elements.set(id, element);
    return element;
  }
}

function documentFixture() {
  const doc = new FakeDocument();
  doc.documentElement = doc.add('reading-flow-dashboard', 'main');
  doc.add('dashboard-scope', 'select', 'current-view');
  doc.add('dashboard-dataset', 'select', 'tracked');
  doc.add('dashboard-status-filter', 'select', 'all');
  doc.add('dashboard-history-range', 'select', '7d');
  doc.add('dashboard-refresh', 'button');
  for (const id of [
    'dashboard-state',
    'dashboard-papers',
    'dashboard-in-progress',
    'dashboard-read',
    'dashboard-remaining-pages',
    'dashboard-remaining-coverage',
    'dashboard-updated',
    'dashboard-filter-note',
    'dashboard-range-active-days',
    'dashboard-range-progress-activity',
    'dashboard-range-completions',
    'dashboard-history-range-note',
    'dashboard-history-footnote',
    'dashboard-error',
    'dashboard-recent-progress-empty',
    'dashboard-history-range-empty',
    'dashboard-recent-progress-summary',
    'dashboard-recent-progress-action-status',
    'dashboard-activity-day-detail-heading',
    'dashboard-activity-day-detail-summary',
    'dashboard-activity-day-detail-empty',
    'dashboard-activity-day-action-status'
  ]) doc.add(id);
  for (const id of [
    'dashboard-history-onboarding',
    'dashboard-reading-pulse',
    'dashboard-recent-progress-panel',
    'dashboard-completion-trend-panel',
    'dashboard-activity-day-detail'
  ]) doc.add(id, 'section');
  doc.add('dashboard-status-composition');
  doc.add('dashboard-progress-distribution');
  doc.add('dashboard-history-calendar');
  doc.add('dashboard-activity-day-detail-table', 'table');
  doc.add('dashboard-activity-day-detail-body', 'tbody');
  doc.add('dashboard-recent-progress', 'table');
  doc.add('dashboard-recent-progress-body', 'tbody');
  doc.add('dashboard-recent-progress-toggle', 'button');
  doc.add('dashboard-completion-trend');
  return doc;
}

function history(overrides: Partial<HistoricalSnapshot> = {}): HistoricalSnapshot {
  return {
    range: '7d',
    startDay: '2026-07-22',
    endDay: '2026-07-28',
    days: [],
    completionTrend: [],
    lifetime: { activeDays: 4, firstCompletions: 2 },
    rangeSummary: { activeDays: 3, papersWithProgressActivity: 2, firstCompletions: 1 },
    recentProgress: [],
    coverage: { papersWithHistory: 4, totalPapers: 10, detailedDays: 3 },
    ...overrides
  };
}

function snapshot(overrides: Partial<StatisticsSnapshot> = {}): StatisticsSnapshot {
  return {
    totalPapers: 10,
    inProgress: 3,
    read: 2,
    statusCounts: {
      'to-read': 3,
      reading: 3,
      skimmed: 1,
      read: 2,
      important: 1
    },
    progressDistribution: {
      'not-started': 3,
      '1-24': 1,
      '25-49': 2,
      '50-74': 1,
      '75-94': 1,
      complete: 2,
      unknown: 0
    },
    knownRemainingPages: 42,
    remainingPagesCoverage: { knownPapers: 7, totalPapers: 10 },
    history: history(),
    ...overrides
  };
}

function emptyHistory(totalPapers = 10): HistoricalSnapshot {
  return history({
    startDay: '2026-07-22',
    endDay: '2026-07-28',
    days: [],
    completionTrend: [],
    lifetime: { activeDays: 0, firstCompletions: 0 },
    rangeSummary: { activeDays: 0, papersWithProgressActivity: 0, firstCompletions: 0 },
    recentProgress: [],
    coverage: { papersWithHistory: 0, totalPapers, detailedDays: 0 }
  });
}

function findBar(doc: FakeDocument, containerId: string, label: string) {
  return doc.getElementById(containerId)?.children.find((row) => row.children[0]?.textContent === label);
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function packagedDashboardFixture(bridge: any) {
  const doc = documentFixture();
  const unloadListeners: Array<() => void> = [];
  const win = {
    arguments: [bridge],
    addEventListener(type: string, listener: () => void) {
      if (type === 'unload') unloadListeners.push(listener);
    }
  };
  const dashboardBundle = readFileSync('addon/dashboard.js', 'utf8');

  runInNewContext(dashboardBundle, {
    window: win,
    document: doc,
    Date,
    setTimeout,
    clearTimeout
  });

  return {
    doc,
    win: win as typeof win & { readingFlowDashboard?: { refresh(): Promise<void> } },
    close() { unloadListeners.forEach((listener) => listener()); }
  };
}

test('renderDashboard keeps current summary honest and uses semantic status colors with text labels', () => {
  const doc = documentFixture();

  renderDashboard(doc as any, snapshot(), 'all', Date.parse('2026-07-28T12:00:00Z'), 'tracked');

  assert.equal(doc.getElementById('dashboard-papers')?.textContent, '10');
  assert.equal(doc.getElementById('dashboard-in-progress')?.textContent, '3');
  assert.equal(doc.getElementById('dashboard-read')?.textContent, '2');
  assert.equal(doc.getElementById('dashboard-remaining-pages')?.textContent, '42');
  assert.equal(doc.getElementById('dashboard-remaining-coverage')?.textContent, 'Known for 7 of 10 papers; 3 unknown.');
  assert.equal(doc.getElementById('dashboard-status-composition')?.children.length, 5);
  assert.match(findBar(doc, 'dashboard-status-composition', 'Reading')?.className ?? '', /status-reading/);
  assert.match(findBar(doc, 'dashboard-status-composition', 'Read')?.className ?? '', /status-read/);
  assert.equal(findBar(doc, 'dashboard-status-composition', 'Read')?.children[2]?.textContent, '2 (20%)');
  assert.equal(doc.getElementById('dashboard-progress-distribution')?.children.length, 7);
  assert.equal(doc.getElementById('dashboard-filter-note')?.textContent, 'Reading set: papers with Reading Flow data · all statuses · selected Zotero scope.');
});

test('no-history state shows one onboarding callout and hides every retained-history detail panel', () => {
  const doc = documentFixture();

  renderDashboard(doc as any, snapshot({ history: emptyHistory() }), 'all', 0, 'tracked');

  assert.equal(doc.getElementById('dashboard-history-onboarding')?.hidden, false);
  assert.equal(doc.getElementById('dashboard-reading-pulse')?.hidden, true);
  assert.equal(doc.getElementById('dashboard-recent-progress-panel')?.hidden, true);
  assert.equal(doc.getElementById('dashboard-completion-trend-panel')?.hidden, true);
  assert.equal(doc.getElementById('dashboard-history-footnote')?.hidden, true);
  assert.equal(doc.getElementById('dashboard-papers')?.textContent, '10');
  assert.equal(doc.getElementById('dashboard-status-composition')?.children.length, 5);
  assert.equal(doc.getElementById('dashboard-history-calendar')?.children.length, 0);
  assert.equal(doc.getElementById('dashboard-recent-progress-body')?.children.length, 0);
});

test('populated history renders the reading pulse and one semantic Recent Progress table body', () => {
  const doc = documentFixture();
  renderDashboard(doc as any, snapshot({
    history: history({
      days: [
        { day: '2026-07-27', activePapers: 2, completedPapers: 1, resetPapers: 1, progressPapers: 2 },
        { day: '2026-07-28', activePapers: 1, completedPapers: 0, resetPapers: 0, progressPapers: 1 }
      ],
      completionTrend: [{ day: '2026-07-27', papers: 1, cumulativePapers: 1 }],
      recentProgress: [{
        id: 1,
        title: 'Paper one',
        status: 'reading',
        currentProgress: 0.8,
        delta: 0.35,
        lastProgressDay: '2026-07-28',
        resetCount: 1
      }]
    })
  }), 'all', 0, 'tracked');

  assert.equal(doc.getElementById('dashboard-history-onboarding')?.hidden, true);
  assert.equal(doc.getElementById('dashboard-reading-pulse')?.hidden, false);
  assert.equal(doc.getElementById('dashboard-range-active-days')?.textContent, '3');
  assert.equal(doc.getElementById('dashboard-range-progress-activity')?.textContent, '2');
  assert.equal(doc.getElementById('dashboard-range-completions')?.textContent, '1');
  assert.equal(doc.getElementById('dashboard-history-calendar')?.children[0]?.children.length, 2);
  assert.equal(doc.getElementById('dashboard-completion-trend')?.children[0]?.children.length, 3);
  const table = doc.getElementById('dashboard-recent-progress');
  const row = doc.getElementById('dashboard-recent-progress-body')?.children[0];
  assert.equal(table?.tagName, 'table');
  assert.equal(table?.hidden, false);
  assert.equal(row?.tagName, 'tr');
  assert.deepEqual(row?.children.map((cell) => cell.tagName), ['td', 'td', 'td', 'td', 'td', 'td']);
  assert.deepEqual(row?.children.map((cell) => cell.attributes['data-label']), ['Paper', 'Current progress', 'Change in range', 'Last update', 'Status', 'Reset']);
  assert.match(row?.children[4]?.className ?? '', /status-reading/);
  assert.equal(doc.getElementById('dashboard-recent-progress-summary')?.textContent, 'Showing 1 of 1 papers with a progress update in this range.');
});

test('Recent Progress makes its displayed subset explicit, can expand, and returns only a user-chosen paper to Zotero', () => {
  const doc = documentFixture();
  const recentProgress = Array.from({ length: 9 }, (_, index) => ({
    id: index + 1,
    title: `Paper ${index + 1}`,
    status: 'reading' as const,
    currentProgress: 0.1 * (index + 1),
    delta: 0.1,
    lastProgressDay: `2026-07-${String(28 - index).padStart(2, '0')}`,
    resetCount: 0
  }));
  const selected: Array<[number | string, string]> = [];
  const render = (expanded: boolean) => renderDashboard(doc as any, snapshot({
    history: history({ recentProgress })
  }), 'all', 0, 'tracked', {
    recentProgressExpanded: expanded,
    onToggleRecentProgress: () => render(true),
    onFocusItem: (id, title) => selected.push([id, title])
  });

  render(false);
  assert.equal(doc.getElementById('dashboard-recent-progress-body')?.children.length, 8);
  assert.equal(doc.getElementById('dashboard-recent-progress-summary')?.textContent, 'Showing 8 of 9 papers with a progress update in this range.');
  assert.equal(doc.getElementById('dashboard-recent-progress-toggle')?.textContent, 'Show all 9');
  doc.getElementById('dashboard-recent-progress-toggle')!.listeners.click[0]();
  assert.equal(doc.getElementById('dashboard-recent-progress-body')?.children.length, 9);
  assert.equal(doc.getElementById('dashboard-recent-progress-toggle')?.textContent, 'Show fewer');

  const focus = doc.getElementById('dashboard-recent-progress-body')?.children[0]?.children[0]?.children[1]?.children[0];
  focus?.listeners.click[0]();
  assert.deepEqual(selected, [[1, 'Paper 1']]);
});

test('Resume invokes its row bridge exactly once only after direct activation', async () => {
  const doc = documentFixture();
  const resumes: Array<number | string> = [];
  const focuses: Array<number | string> = [];
  const current = snapshot({
    history: history({
      recentProgress: [{
        id: 42,
        title: 'Chosen paper',
        status: 'reading',
        currentProgress: 0.5,
        delta: 0.2,
        lastProgressDay: '2026-07-28',
        resetCount: 0
      }]
    })
  });
  const app = new DashboardApp(doc as any, {
    async getSnapshot() { return current; },
    async focusItem(id) { focuses.push(id); return true; },
    async resumeItem(id) { resumes.push(id); return true; }
  }, () => 0);

  app.start();
  await flush();
  assert.deepEqual(resumes, []);

  await app.refresh();
  doc.getElementById('dashboard-status-filter')!.listeners.change[0]();
  await flush();
  assert.deepEqual(resumes, []);

  const actions = doc.getElementById('dashboard-recent-progress-body')!.children[0].children[0].children[1];
  actions.children[0].listeners.click[0]();
  await flush();
  assert.deepEqual(focuses, [42]);
  assert.deepEqual(resumes, []);

  actions.children[1].listeners.click[0]();
  await flush();
  assert.deepEqual(resumes, [42]);
  assert.equal(doc.getElementById('dashboard-recent-progress-action-status')?.textContent, 'Opened Chosen paper in the Zotero Reader.');
});

test('calendar selection projects only its cached day, can clear, and does not resume without a row action', async () => {
  const doc = documentFixture();
  const detailRequests: Array<[string, string]> = [];
  const focuses: Array<number | string> = [];
  const resumes: Array<number | string> = [];
  const current = snapshot({
    snapshotId: 'snapshot-1',
    history: history({
      days: [
        { day: '2026-07-27', activePapers: 2, completedPapers: 0, resetPapers: 0, progressPapers: 2 },
        { day: '2026-07-28', activePapers: 0, completedPapers: 0, resetPapers: 1, progressPapers: 0 }
      ]
    })
  });
  const app = new DashboardApp(doc as any, {
    async getSnapshot() { return current; },
    async getActivityDayDetail(snapshotId, day) {
      detailRequests.push([snapshotId, day]);
      return {
        snapshotId,
        day,
        state: 'available' as const,
        papers: [
          { itemID: 2, title: 'Alpha', recordedProgress: null, status: 'skimmed' as const, lastRecordedAt: null },
          { itemID: 1, title: 'Zeta', recordedProgress: 0.4, status: 'reading' as const, lastRecordedAt: 0 }
        ]
      };
    },
    async focusItem(id) { focuses.push(id); return true; },
    async resumeItem(id) { resumes.push(id); return true; }
  }, () => 0);

  app.start();
  await flush();
  const calendar = doc.getElementById('dashboard-history-calendar')!;
  const firstDay = calendar.children[0].children[0];
  const resetOnlyDay = calendar.children[0].children[1];
  assert.equal(firstDay.tagName, 'button');
  assert.equal(firstDay.attributes['aria-pressed'], 'false');
  assert.equal(resetOnlyDay.tagName, 'span');

  firstDay.listeners.click[0]();
  await flush();
  assert.deepEqual(detailRequests, [['snapshot-1', '2026-07-27']]);
  assert.deepEqual(resumes, []);
  assert.equal(doc.getElementById('dashboard-activity-day-detail')?.hidden, false);
  assert.equal(doc.getElementById('dashboard-activity-day-detail-heading')?.textContent, 'Progress updates on 2026-07-27');
  assert.equal(doc.getElementById('dashboard-activity-day-detail-summary')?.textContent, 'Showing 2 of 2 papers with a progress update on this date.');
  assert.equal(doc.getElementById('dashboard-activity-day-detail-body')?.children.length, 2);
  assert.equal(doc.getElementById('dashboard-activity-day-detail-body')?.children[0].children[1].textContent, 'Unknown');

  const actions = doc.getElementById('dashboard-activity-day-detail-body')!.children[0].children[0].children[1];
  actions.children[0].listeners.click[0]();
  await flush();
  assert.deepEqual(focuses, [2]);
  assert.deepEqual(resumes, []);

  actions.children[1].listeners.click[0]();
  await flush();
  assert.deepEqual(resumes, [2]);
  assert.equal(doc.getElementById('dashboard-activity-day-action-status')?.textContent, 'Opened Alpha in the Zotero Reader.');

  doc.getElementById('dashboard-history-calendar')!.children[0].children[0].listeners.click[0]();
  assert.equal(doc.getElementById('dashboard-activity-day-detail')?.hidden, true);
  assert.deepEqual(detailRequests, [['snapshot-1', '2026-07-27']]);
});

test('the packaged dashboard bundle loads an activity detail, clears it, and releases its cache across close/reopen', async () => {
  let snapshotRequests = 0;
  const detailRequests: Array<[string, string]> = [];
  const focuses: Array<number | string> = [];
  const resumes: Array<number | string> = [];
  let discardedCaches = 0;
  const current = snapshot({
    snapshotId: 'packaged-snapshot',
    history: history({
      days: [{ day: '2026-07-27', activePapers: 2, completedPapers: 0, resetPapers: 0, progressPapers: 2 }]
    })
  });
  const bridge = {
    async getSnapshot() { snapshotRequests += 1; return current; },
    async getActivityDayDetail(snapshotId: string, day: string) {
      detailRequests.push([snapshotId, day]);
      return {
        snapshotId,
        day,
        state: 'available' as const,
        papers: [
          { itemID: 4, title: 'Selected paper', recordedProgress: 0.5, status: 'reading' as const, lastRecordedAt: 0 },
          { itemID: 9, title: 'Unknown location', recordedProgress: null, status: 'skimmed' as const, lastRecordedAt: null }
        ]
      };
    },
    async focusItem(id: number | string) { focuses.push(id); return true; },
    async resumeItem(id: number | string) { resumes.push(id); return true; },
    discardActivityDayDetailCache() { discardedCaches += 1; }
  };

  const first = packagedDashboardFixture(bridge);
  await flush();
  assert.ok(first.win.readingFlowDashboard);
  assert.equal(first.doc.getElementById('dashboard-papers')?.textContent, '10');
  assert.equal(snapshotRequests, 1);
  assert.deepEqual(focuses, []);
  assert.deepEqual(resumes, []);

  const day = first.doc.getElementById('dashboard-history-calendar')!.children[0].children[0];
  assert.equal(day.tagName, 'button');
  day.listeners.click[0]();
  await flush();

  assert.deepEqual(detailRequests, [['packaged-snapshot', '2026-07-27']]);
  assert.equal(first.doc.getElementById('dashboard-activity-day-detail-heading')?.textContent, 'Progress updates on 2026-07-27');
  assert.equal(first.doc.getElementById('dashboard-activity-day-detail-summary')?.textContent, 'Showing 2 of 2 papers with a progress update on this date.');
  const rows = first.doc.getElementById('dashboard-activity-day-detail-body')!.children;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].children[0].children[0].textContent, 'Selected paper');
  assert.equal(rows[1].children[1].textContent, 'Unknown');
  assert.deepEqual(rows[0].children[0].children[1].children.map((button) => button.textContent), ['Show in Zotero', 'Resume']);
  assert.equal(snapshotRequests, 1);
  assert.deepEqual(focuses, []);
  assert.deepEqual(resumes, []);

  day.listeners.click[0]();
  assert.equal(first.doc.getElementById('dashboard-activity-day-detail')?.hidden, true);
  assert.deepEqual(detailRequests, [['packaged-snapshot', '2026-07-27']]);
  assert.equal(snapshotRequests, 1);
  assert.deepEqual(focuses, []);
  assert.deepEqual(resumes, []);

  first.close();
  assert.equal(discardedCaches, 1);
  assert.equal(snapshotRequests, 1);
  assert.deepEqual(focuses, []);
  assert.deepEqual(resumes, []);

  const reopened = packagedDashboardFixture(bridge);
  await flush();
  assert.ok(reopened.win.readingFlowDashboard);
  assert.equal(snapshotRequests, 2);
  assert.equal(reopened.doc.getElementById('dashboard-activity-day-detail')?.hidden, true);
  assert.deepEqual(focuses, []);
  assert.deepEqual(resumes, []);
});

test('startDashboard begins cache ownership before app start and binds that exact token to once-only unload', async () => {
  const doc = documentFixture();
  const lifecycleToken = {} as any;
  const events: string[] = [];
  let unload: (() => void) | null = null;
  let unloadOptions: unknown;
  const bridge = {
    beginActivityDayDetailCacheLifecycle() {
      events.push('begin');
      return lifecycleToken;
    },
    async getSnapshot() {
      events.push('snapshot');
      return snapshot();
    },
    discardActivityDayDetailCache(token?: unknown) {
      assert.equal(token, lifecycleToken);
      events.push('discard');
    }
  };
  const win = {
    arguments: [bridge],
    addEventListener(type: string, listener: () => void, options?: unknown) {
      if (type === 'unload') {
        unload = listener;
        unloadOptions = options;
      }
    }
  };

  startDashboard(win as any, doc as any);
  assert.deepEqual(events, ['begin', 'snapshot']);
  assert.deepEqual(unloadOptions, { once: true });
  unload?.();
  assert.deepEqual(events, ['begin', 'snapshot', 'discard']);
});

test('an unavailable activity-day cache asks for Refresh and never turns into a new scope query', async () => {
  const doc = documentFixture();
  const detailRequests: Array<[string, string]> = [];
  const current = snapshot({
    snapshotId: 'evicted-snapshot',
    history: history({
      days: [{ day: '2026-07-28', activePapers: 1, completedPapers: 0, resetPapers: 0, progressPapers: 1 }]
    })
  });
  const app = new DashboardApp(doc as any, {
    async getSnapshot() { return current; },
    async getActivityDayDetail(snapshotId, day) {
      detailRequests.push([snapshotId, day]);
      return { snapshotId, day, state: 'unavailable' as const };
    }
  }, () => 0);

  app.start();
  await flush();
  doc.getElementById('dashboard-history-calendar')!.children[0].children[0].listeners.click[0]();
  await flush();

  assert.deepEqual(detailRequests, [['evicted-snapshot', '2026-07-28']]);
  assert.match(
    doc.getElementById('dashboard-activity-day-detail-summary')?.textContent ?? '',
    /Refresh to load the current snapshot/
  );
  assert.equal(doc.getElementById('dashboard-activity-day-detail-table')?.hidden, true);
});

test('a refreshed snapshot clears a pending calendar detail and uses only the replacement snapshot ID', async () => {
  const doc = documentFixture();
  const detailRequests: Array<[string, string]> = [];
  let resolveFirstDetail: ((value: {
    snapshotId: string;
    day: string;
    state: 'available';
    papers: [];
  }) => void) | null = null;
  const first = snapshot({
    snapshotId: 'snapshot-before-refresh',
    history: history({
      days: [{ day: '2026-07-28', activePapers: 1, completedPapers: 0, resetPapers: 0, progressPapers: 1 }]
    })
  });
  const replacement = snapshot({
    snapshotId: 'snapshot-after-refresh',
    history: history({
      days: [{ day: '2026-07-28', activePapers: 1, completedPapers: 0, resetPapers: 0, progressPapers: 1 }]
    })
  });
  let current = first;
  const app = new DashboardApp(doc as any, {
    async getSnapshot() { return current; },
    getActivityDayDetail(snapshotId, day) {
      detailRequests.push([snapshotId, day]);
      if (snapshotId === first.snapshotId) {
        return new Promise((resolve) => { resolveFirstDetail = resolve; });
      }
      return Promise.resolve({ snapshotId, day, state: 'available' as const, papers: [] });
    }
  }, () => 0);

  app.start();
  await flush();
  doc.getElementById('dashboard-history-calendar')!.children[0].children[0].listeners.click[0]();
  await flush();
  current = replacement;
  await app.refresh();
  assert.equal(doc.getElementById('dashboard-activity-day-detail')?.hidden, true);

  resolveFirstDetail?.({
    snapshotId: 'snapshot-before-refresh',
    day: '2026-07-28',
    state: 'available',
    papers: []
  });
  await flush();
  assert.equal(doc.getElementById('dashboard-activity-day-detail')?.hidden, true);

  doc.getElementById('dashboard-history-calendar')!.children[0].children[0].listeners.click[0]();
  await flush();
  assert.deepEqual(detailRequests, [
    ['snapshot-before-refresh', '2026-07-28'],
    ['snapshot-after-refresh', '2026-07-28']
  ]);
});

test('unavailable and failed Resume outcomes keep the row and explain the result', async () => {
  const doc = documentFixture();
  const current = snapshot({
    history: history({
      recentProgress: [{
        id: 7,
        title: 'Stable row',
        status: 'reading',
        currentProgress: 0.25,
        delta: 0.1,
        lastProgressDay: '2026-07-28',
        resetCount: 0
      }]
    })
  });
  let fail = false;
  const app = new DashboardApp(doc as any, {
    async getSnapshot() { return current; },
    async resumeItem() {
      if (fail) throw new Error('Reader service stopped');
      return false;
    }
  }, () => 0);

  app.start();
  await flush();
  let resume = doc.getElementById('dashboard-recent-progress-body')!.children[0].children[0].children[1].children[1];
  resume.listeners.click[0]();
  await flush();
  assert.match(doc.getElementById('dashboard-recent-progress-action-status')?.textContent ?? '', /unavailable/);
  assert.equal(doc.getElementById('dashboard-recent-progress-body')?.children.length, 1);
  assert.deepEqual(DEFAULT_FLOW_DATA.p, {});

  fail = true;
  resume = doc.getElementById('dashboard-recent-progress-body')!.children[0].children[0].children[1].children[1];
  resume.listeners.click[0]();
  await flush();
  assert.match(doc.getElementById('dashboard-recent-progress-action-status')?.textContent ?? '', /Reader service stopped/);
  assert.equal(doc.getElementById('dashboard-recent-progress-body')?.children.length, 1);
});

test('retained history outside the selected range is distinguished from a progress update inside it', () => {
  const doc = documentFixture();
  renderDashboard(doc as any, snapshot({
    history: history({
      rangeSummary: { activeDays: 0, papersWithProgressActivity: 0, firstCompletions: 0 },
      recentProgress: [],
      coverage: { papersWithHistory: 2, totalPapers: 10, detailedDays: 1 }
    })
  }), 'all', 0, 'tracked');

  assert.equal(doc.getElementById('dashboard-reading-pulse')?.hidden, false);
  assert.equal(doc.getElementById('dashboard-history-range-empty')?.hidden, false);
});

test('positive percentages below one percent render as less than one instead of zero', () => {
  const doc = documentFixture();
  renderDashboard(doc as any, snapshot({
    totalPapers: 1000,
    statusCounts: { 'to-read': 999, reading: 1, skimmed: 0, read: 0, important: 0 },
    progressDistribution: {
      'not-started': 999,
      '1-24': 1,
      '25-49': 0,
      '50-74': 0,
      '75-94': 0,
      complete: 0,
      unknown: 0
    },
    history: history({
      recentProgress: [{
        id: 1,
        title: 'Small start',
        status: 'reading',
        currentProgress: 0.005,
        delta: 0.004,
        lastProgressDay: '2026-07-28',
        resetCount: 0
      }]
    })
  }), 'all', 0, 'tracked');

  assert.equal(findBar(doc, 'dashboard-status-composition', 'Reading')?.children[2]?.textContent, '1 (<1%)');
  assert.equal(findBar(doc, 'dashboard-progress-distribution', '1–24%')?.children[2]?.textContent, '1 (<1%)');
  const cells = doc.getElementById('dashboard-recent-progress-body')?.children[0]?.children;
  assert.equal(cells?.[1].textContent, '<1%');
  assert.equal(cells?.[2].textContent, '+<1%');
});

test('explicit Read statistics remain visible in both Read and Complete product surfaces', () => {
  const doc = documentFixture();
  renderDashboard(doc as any, snapshot({
    totalPapers: 1,
    inProgress: 0,
    read: 1,
    statusCounts: { 'to-read': 0, reading: 0, skimmed: 0, read: 1, important: 0 },
    progressDistribution: {
      'not-started': 0,
      '1-24': 0,
      '25-49': 0,
      '50-74': 0,
      '75-94': 0,
      complete: 1,
      unknown: 0
    }
  }), 'read', 0, 'tracked');

  assert.equal(doc.getElementById('dashboard-read')?.textContent, '1');
  assert.equal(findBar(doc, 'dashboard-status-composition', 'Read')?.children[2]?.textContent, '1 (100%)');
  assert.equal(findBar(doc, 'dashboard-progress-distribution', 'Complete')?.children[2]?.textContent, '1 (100%)');
  assert.match(findBar(doc, 'dashboard-progress-distribution', 'Complete')?.className ?? '', /status-read/);
});

test('empty, large, and unknown-page scopes remain readable without inventing values', () => {
  const emptyDoc = documentFixture();
  renderDashboard(emptyDoc as any, snapshot({
    totalPapers: 0,
    inProgress: 0,
    read: 0,
    statusCounts: { 'to-read': 0, reading: 0, skimmed: 0, read: 0, important: 0 },
    progressDistribution: {
      'not-started': 0,
      '1-24': 0,
      '25-49': 0,
      '50-74': 0,
      '75-94': 0,
      complete: 0,
      unknown: 0
    },
    knownRemainingPages: 0,
    remainingPagesCoverage: { knownPapers: 0, totalPapers: 0 },
    history: emptyHistory(0)
  }), 'all', 0, 'tracked');
  assert.equal(emptyDoc.getElementById('dashboard-state')?.textContent, 'No papers in this reading set yet. Record progress or set a Reading Flow status from a paper context menu to add one.');
  assert.equal(emptyDoc.getElementById('dashboard-progress-distribution')?.children[0]?.textContent, 'No papers in this scope.');

  const unknownDoc = documentFixture();
  renderDashboard(unknownDoc as any, snapshot({
    totalPapers: 2,
    remainingPagesCoverage: { knownPapers: 0, totalPapers: 2 },
    knownRemainingPages: 0
  }), 'all', 0, 'tracked');
  assert.equal(unknownDoc.getElementById('dashboard-remaining-pages')?.textContent, 'Unknown');
  assert.equal(unknownDoc.getElementById('dashboard-remaining-coverage')?.textContent, 'Unknown for all 2 papers.');

  const largeDoc = documentFixture();
  renderDashboard(largeDoc as any, snapshot({
    totalPapers: 125000,
    knownRemainingPages: 987654,
    remainingPagesCoverage: { knownPapers: 100000, totalPapers: 125000 }
  }), 'all', 0, 'all');
  assert.equal(largeDoc.getElementById('dashboard-papers')?.textContent, '125000');
  assert.equal(largeDoc.getElementById('dashboard-remaining-pages')?.textContent, '987654');
  assert.equal(largeDoc.getElementById('dashboard-filter-note')?.textContent, 'All papers (inventory): includes untracked papers · all statuses · selected Zotero scope.');
});

test('DashboardApp installs one deterministic listener set and passes scope, range, status, and dataset', async () => {
  const doc = documentFixture();
  const requests: Array<[string, string | undefined, string | undefined, StatisticsDataset | undefined]> = [];
  const app = new DashboardApp(doc as any, {
    async getSnapshot(scope, range, statusFilter, dataset) {
      requests.push([scope, range, statusFilter, dataset]);
      return snapshot();
    }
  }, () => 0);

  app.start();
  app.start();
  await flush();
  assert.deepEqual(requests, [['current-view', '7d', undefined, 'tracked']]);
  assert.equal(doc.getElementById('dashboard-scope')?.listeners.change?.length, 1);
  assert.equal(doc.getElementById('dashboard-dataset')?.listeners.change?.length, 1);
  assert.equal(doc.getElementById('dashboard-status-filter')?.listeners.change?.length, 1);
  assert.equal(doc.getElementById('dashboard-history-range')?.listeners.change?.length, 1);
  assert.equal(doc.getElementById('dashboard-refresh')?.listeners.click?.length, 1);

  doc.getElementById('dashboard-scope')!.value = 'entire-library';
  doc.getElementById('dashboard-dataset')!.value = 'all';
  doc.getElementById('dashboard-status-filter')!.value = 'read';
  doc.getElementById('dashboard-history-range')!.value = 'all-time';
  doc.getElementById('dashboard-dataset')!.listeners.change[0]();
  doc.getElementById('dashboard-status-filter')!.listeners.change[0]();
  doc.getElementById('dashboard-history-range')!.listeners.change[0]();
  await flush();
  assert.deepEqual(requests.at(-1), ['entire-library', 'all-time', 'read', 'all']);
  assert.equal(doc.getElementById('dashboard-error')?.hidden, true);
  assert.deepEqual(DEFAULT_FLOW_DATA.p, {});
});

test('malformed control values fail closed to current view, tracked papers, all statuses, and the valid range', async () => {
  const doc = documentFixture();
  doc.getElementById('dashboard-scope')!.value = 'invalid';
  doc.getElementById('dashboard-dataset')!.value = 'invalid';
  doc.getElementById('dashboard-status-filter')!.value = 'invalid';
  doc.getElementById('dashboard-history-range')!.value = 'invalid';
  const requests: unknown[][] = [];
  const app = new DashboardApp(doc as any, {
    async getSnapshot(...args) {
      requests.push(args);
      return snapshot();
    }
  }, () => 0);

  app.start();
  await flush();
  assert.deepEqual(requests, [['current-view', '7d', undefined, 'tracked']]);
});

test('refresh race protection ignores an older response that completes last', async () => {
  const doc = documentFixture();
  const resolvers: Array<(value: StatisticsSnapshot) => void> = [];
  const app = new DashboardApp(doc as any, {
    getSnapshot() {
      return new Promise<StatisticsSnapshot>((resolve) => resolvers.push(resolve));
    }
  }, () => 0);

  app.start();
  const latestRefresh = app.refresh();
  assert.equal(resolvers.length, 2);
  resolvers[1](snapshot({ totalPapers: 2 }));
  await latestRefresh;
  assert.equal(doc.getElementById('dashboard-papers')?.textContent, '2');
  resolvers[0](snapshot({ totalPapers: 99 }));
  await flush();
  assert.equal(doc.getElementById('dashboard-papers')?.textContent, '2');
  assert.equal(doc.getElementById('dashboard-refresh')?.disabled, false);
});

test('bridge errors expose one alert message and leave refresh available', async () => {
  const doc = documentFixture();
  const app = new DashboardApp(doc as any, {
    async getSnapshot() {
      throw new Error('fixture failure');
    }
  }, () => 0);

  app.start();
  await flush();
  assert.equal(doc.getElementById('dashboard-error')?.hidden, false);
  assert.match(doc.getElementById('dashboard-error')?.textContent ?? '', /fixture failure/);
  assert.equal(doc.getElementById('dashboard-refresh')?.disabled, false);
});

test('a failed refresh marks previously rendered values as stale instead of presenting them as current', async () => {
  const doc = documentFixture();
  let calls = 0;
  const app = new DashboardApp(doc as any, {
    async getSnapshot() {
      calls += 1;
      if (calls === 1) return snapshot({ totalPapers: 4 });
      throw new Error('fixture refresh failure');
    }
  }, () => 0);

  app.start();
  await flush();
  await app.refresh();

  assert.equal(doc.getElementById('dashboard-papers')?.textContent, '4');
  assert.match(doc.getElementById('dashboard-state')?.textContent ?? '', /last successful snapshot/);
  assert.equal(doc.getElementById('dashboard-updated')?.attributes['data-stale'], 'true');
  assert.match(doc.getElementById('dashboard-error')?.textContent ?? '', /fixture refresh failure/);
});

test('a stale snapshot identifies the filters used by the last successful request', async () => {
  const doc = documentFixture();
  let calls = 0;
  const app = new DashboardApp(doc as any, {
    async getSnapshot() {
      calls += 1;
      if (calls === 1) return snapshot({ totalPapers: 4 });
      throw new Error('fixture refresh failure');
    }
  }, () => 0);

  app.start();
  await flush();
  doc.getElementById('dashboard-scope')!.value = 'entire-library';
  doc.getElementById('dashboard-dataset')!.value = 'all';
  doc.getElementById('dashboard-status-filter')!.value = 'read';
  doc.getElementById('dashboard-history-range')!.value = '30d';
  await app.refresh();

  assert.match(doc.getElementById('dashboard-state')?.textContent ?? '', /Current View/);
  assert.match(doc.getElementById('dashboard-state')?.textContent ?? '', /Reading set \(tracked\)/);
  assert.match(doc.getElementById('dashboard-state')?.textContent ?? '', /all statuses/);
  assert.match(doc.getElementById('dashboard-state')?.textContent ?? '', /7 days/);
  assert.match(doc.getElementById('dashboard-filter-note')?.textContent ?? '', /Last successful snapshot/);
});

test('XHTML and CSS preserve native control order, table semantics, visible focus, and narrow reflow', () => {
  const xhtml = readFileSync('addon/dashboard.xhtml', 'utf8');
  const css = readFileSync('addon/dashboard.css', 'utf8');
  const scopeIndex = xhtml.indexOf('id="dashboard-scope"');
  const datasetIndex = xhtml.indexOf('id="dashboard-dataset"');
  const statusIndex = xhtml.indexOf('id="dashboard-status-filter"');
  const rangeIndex = xhtml.indexOf('id="dashboard-history-range"');
  const refreshIndex = xhtml.indexOf('id="dashboard-refresh"');

  assert.ok(scopeIndex < datasetIndex && datasetIndex < statusIndex && statusIndex < rangeIndex && rangeIndex < refreshIndex);
  assert.match(xhtml, /<label for="dashboard-dataset"/);
  assert.match(xhtml, /<table id="dashboard-recent-progress">[\s\S]*<thead>[\s\S]*<th scope="col">Paper<\/th>[\s\S]*<th scope="col">Current progress<\/th>[\s\S]*<tbody id="dashboard-recent-progress-body">/);
  assert.match(xhtml, /<section id="dashboard-activity-day-detail"[\s\S]*aria-labelledby="dashboard-activity-day-detail-heading"[\s\S]*<table id="dashboard-activity-day-detail-table">[\s\S]*<tbody id="dashboard-activity-day-detail-body">/);
  assert.match(xhtml, /id="dashboard-recent-progress-toggle"/);
  assert.match(xhtml, /id="dashboard-history-range-empty"/);
  assert.doesNotMatch(xhtml, /Retained progress trajectory|dashboard-progress-trajectory/);
  assert.doesNotMatch(xhtml, /<h2[^>]*>Reading history<\/h2>/);
  assert.equal((xhtml.match(/reading-flow-dashboard-history-note/g) ?? []).length, 1);
  assert.match(css, /:focus-visible/);
  assert.match(css, /history-calendar-selectable/);
  assert.match(css, /@media \(max-width: 42rem\)/);
  assert.match(css, /grid-template-areas:[\s\S]*"label value"[\s\S]*"meter meter"/);
  assert.match(css, /#dashboard-recent-progress td::before/);
  assert.match(css, /\.recent-progress-focus/);
  assert.match(css, /\.recent-progress-resume/);
  assert.match(css, /overflow-x: hidden/);
  assert.match(css, /--status-reading: #2563eb/);
  assert.match(css, /--status-read: #16a34a/);
  assert.match(css, /--dashboard-background: #ffffff/);
  assert.match(css, /--surface-background: #ffffff/);
  assert.match(css, /background: var\(--dashboard-background\)/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
});
