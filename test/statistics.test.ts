import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FLOW_DATA, FlowData, ReadingStatus } from '../src/flowData';
import {
  calculateActivityDayDetail,
  calculateHistorySnapshot,
  calculateStatisticsSnapshot,
  selectStatisticsPapers,
  StatisticsPaper
} from '../src/statistics';

function paper(id: number, updates: Partial<FlowData> = {}): StatisticsPaper {
  return { id, flowData: { ...DEFAULT_FLOW_DATA, ...updates } };
}

function data(updates: Partial<FlowData> = {}): FlowData {
  return { ...DEFAULT_FLOW_DATA, ...updates };
}

function localTimestamp(day: string, hour = 12): number {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, hour).getTime();
}

test('empty statistics snapshot is serializable and exposes every metric bucket', () => {
  const snapshot = calculateStatisticsSnapshot([], { now: localTimestamp('2026-07-28') });
  const { history, ...currentSnapshot } = snapshot;

  assert.deepEqual(currentSnapshot, {
    totalPapers: 0,
    inProgress: 0,
    read: 0,
    statusCounts: {
      unassigned: 0,
      'to-read': 0,
      reading: 0,
      skimmed: 0,
      read: 0,
      important: 0
    },
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
    remainingPagesCoverage: { knownPapers: 0, totalPapers: 0 }
  });
  assert.equal(history.range, '7d');
  assert.equal(history.startDay, '2026-07-22');
  assert.equal(history.endDay, '2026-07-28');
  assert.equal(history.days.length, 7);
  assert.deepEqual(history.lifetime, { activeDays: 0, firstCompletions: 0 });
  assert.deepEqual(history.rangeSummary, {
    activeDays: 0,
    papersWithProgressActivity: 0,
    firstCompletions: 0
  });
  assert.deepEqual(history.recentProgress, []);
  assert.deepEqual(history.coverage, { papersWithHistory: 0, totalPapers: 0, detailedDays: 0 });
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test('status precedence and every progress bucket are calculated from current state', () => {
  const explicitStatuses: Array<[ReadingStatus, Partial<FlowData>]> = [
    ['skimmed', { s: 'skimmed', p: { '1': 0.2 } }],
    ['important', { s: 'important', p: { '2': 0.8 } }],
    ['to-read', { s: 'to-read', p: { '3': 0.9 } }]
  ];
  const papers = [
    paper(1),
    paper(2, { p: { '2': 0.1 } }),
    paper(3, { p: { '3': 0.25 } }),
    paper(4, { p: { '4': 0.5 } }),
    paper(5, { p: { '5': 0.75 } }),
    paper(6, { p: { '6': 0.95 } }),
    paper(7, { p: { '7': 12 } }),
    ...explicitStatuses.map(([status, updates], index) => paper(20 + index, updates))
  ];

  const snapshot = calculateStatisticsSnapshot(papers);

  assert.equal(snapshot.totalPapers, 10);
  assert.equal(snapshot.inProgress, 5);
  assert.equal(snapshot.read, 1);
  assert.deepEqual(snapshot.statusCounts, {
    unassigned: 1,
    'to-read': 1,
    reading: 5,
    skimmed: 1,
    read: 1,
    important: 1
  });
  assert.deepEqual(snapshot.progressDistribution, {
    'not-started': 1,
    '1-24': 2,
    '25-49': 1,
    '50-74': 1,
    '75-94': 3,
    complete: 1,
    unknown: 1
  });
});

test('manual Read does not fabricate measured progress or completion', () => {
  const snapshot = calculateStatisticsSnapshot([
    paper(1, { s: 'read' }),
    paper(2, { s: 'read', p: { '2': 0.4 } }),
    paper(3, { s: 'to-read', p: { '3': 0.9 } })
  ]);

  assert.equal(snapshot.read, 2);
  assert.equal(snapshot.progressDistribution.complete, 0);
  assert.equal(snapshot.progressDistribution['not-started'], 1);
  assert.equal(snapshot.progressDistribution['25-49'], 1);
  assert.equal(snapshot.progressDistribution['75-94'], 1);
});

test('last attachment wins, then greatest recorded progress is used once per paper', () => {
  const snapshot = calculateStatisticsSnapshot([
    paper(1, {
      p: { '10': 0.9, '11': 0.2 },
      lastAttachmentId: '11',
      pageCount: { '10': 100, '11': 20 }
    }),
    paper(2, {
      p: { '20': 0.4, '21': 0.7 },
      lastAttachmentId: 'missing',
      pageCount: { '20': 10, '21': 10 }
    })
  ]);

  assert.equal(snapshot.totalPapers, 2);
  assert.equal(snapshot.progressDistribution['1-24'], 1);
  assert.equal(snapshot.progressDistribution['50-74'], 1);
  assert.equal(snapshot.knownRemainingPages, 16 + 3);
  assert.deepEqual(snapshot.remainingPagesCoverage, { knownPapers: 2, totalPapers: 2 });
});

test('remaining pages follow fractional, legacy, read, and unknown-page rules', () => {
  const snapshot = calculateStatisticsSnapshot([
    paper(1, { p: { '1': 0.51 }, pageCount: { '1': 10 } }),
    paper(2, { p: { '2': 4 }, pageCount: { '2': 10 } }),
    paper(3, { p: { '3': 4 } }),
    paper(4, { s: 'read', p: { '4': 0.3 } }),
    paper(5, { p: { '5': 0.3 }, pageCount: { '5': 0 } }),
    paper(6, { p: { '6': 1 }, pageCount: { '6': 100 }, lastAttachmentId: '6', lastPage: 1 }),
    paper(7, { p: { '7': 1 }, pageCount: { '7': 100 } }),
    paper(8, { p: { '8': 1 }, pageCount: { '8': 100 }, lastAttachmentId: '8', lastPage: 100 })
  ]);

  assert.equal(snapshot.knownRemainingPages, 5 + 6 + 99);
  assert.deepEqual(snapshot.remainingPagesCoverage, { knownPapers: 4, totalPapers: 8 });
  assert.equal(snapshot.progressDistribution.unknown, 2);
});

test('history ranges use local-day boundaries and exclude status-only or reset-only activity', () => {
  const snapshot = calculateHistorySnapshot([
    paper(1, {
      history: {
        startedAt: localTimestamp('2026-07-20'),
        completedAt: null,
        activeDaysTotal: 1,
        days: {
          '2026-07-22': {
            activity: true,
            lastReadAt: localTimestamp('2026-07-22'),
            progress: { a: 0.2 },
            status: 'reading',
            reset: false,
            completed: false
          },
          '2026-07-23': {
            activity: false,
            lastReadAt: null,
            progress: {},
            status: 'read',
            reset: false,
            completed: true
          },
          '2026-07-24': {
            activity: false,
            lastReadAt: null,
            progress: {},
            status: 'to-read',
            reset: true,
            completed: false
          },
          '2026-07-29': {
            activity: true,
            lastReadAt: localTimestamp('2026-07-29'),
            progress: { a: 0.8 },
            status: 'reading',
            reset: false,
            completed: false
          }
        }
      }
    })
  ], '7d', localTimestamp('2026-07-28'));

  assert.deepEqual([snapshot.startDay, snapshot.endDay], ['2026-07-22', '2026-07-28']);
  assert.equal(snapshot.days.length, 7);
  assert.deepEqual(snapshot.days[0], {
    day: '2026-07-22',
    activePapers: 1,
    completedPapers: 0,
    resetPapers: 0,
    progressPapers: 1
  });
  assert.equal(snapshot.days[1].activePapers, 0);
  assert.equal(snapshot.days[2].resetPapers, 1);
  assert.equal(snapshot.lifetime.activeDays, 1);
  assert.deepEqual(snapshot.rangeSummary, {
    activeDays: 1,
    papersWithProgressActivity: 1,
    firstCompletions: 0
  });
  assert.equal(snapshot.recentProgress.length, 1);
  assert.equal(snapshot.recentProgress[0].delta, null);
});

test('history coverage excludes status-only and reset-only records but keeps explicit completions', () => {
  const statusOnly = paper(11, {
    history: {
      startedAt: localTimestamp('2026-07-28'),
      completedAt: null,
      activeDaysTotal: 0,
      days: {
        '2026-07-28': {
          activity: false,
          lastReadAt: null,
          progress: {},
          status: 'reading',
          reset: false,
          completed: false
        }
      }
    }
  });
  const resetOnly = paper(12, {
    history: {
      startedAt: localTimestamp('2026-07-28'),
      completedAt: null,
      activeDaysTotal: 0,
      days: {
        '2026-07-28': {
          activity: false,
          lastReadAt: null,
          progress: {},
          status: 'to-read',
          reset: true,
          completed: false
        }
      }
    }
  });
  const explicitCompletion = paper(13, {
    history: {
      startedAt: localTimestamp('2026-07-28'),
      completedAt: localTimestamp('2026-07-28'),
      activeDaysTotal: 0,
      days: {
        '2026-07-28': {
          activity: false,
          lastReadAt: null,
          progress: {},
          status: 'read',
          reset: false,
          completed: true
        }
      }
    }
  });

  const snapshot = calculateHistorySnapshot(
    [statusOnly, resetOnly, explicitCompletion],
    '7d',
    localTimestamp('2026-07-28')
  );

  assert.equal(snapshot.coverage.papersWithHistory, 1);
});

test('activity day detail keeps every real progress update, excludes status/reset-only records, and preserves unknown locations', () => {
  const papers: StatisticsPaper[] = [
    {
      ...paper(1, {
        s: 'reading',
        p: { a: 0.4 },
        pageCount: { a: 100 },
        history: {
          startedAt: localTimestamp('2026-07-27'),
          completedAt: null,
          activeDaysTotal: 1,
          days: {
            '2026-07-28': {
              activity: true,
              lastReadAt: localTimestamp('2026-07-28', 9),
              progress: { a: 0.4 },
              status: 'reading',
              reset: false,
              completed: false
            }
          }
        }
      }),
      title: 'Zeta paper'
    },
    {
      ...paper(2, {
        s: 'skimmed',
        p: { b: 12 },
        history: {
          startedAt: localTimestamp('2026-07-27'),
          completedAt: null,
          activeDaysTotal: 1,
          days: {
            '2026-07-28': {
              activity: true,
              lastReadAt: null,
              progress: { b: 12 },
              status: 'skimmed',
              reset: false,
              completed: false
            }
          }
        }
      }),
      title: 'Alpha paper'
    },
    {
      ...paper(3, {
        history: {
          startedAt: localTimestamp('2026-07-27'),
          completedAt: null,
          activeDaysTotal: 0,
          days: {
            '2026-07-28': {
              activity: false,
              lastReadAt: null,
              progress: { c: 0.6 },
              status: 'reading',
              reset: false,
              completed: false
            }
          }
        }
      }),
      title: 'Status-only paper'
    },
    {
      ...paper(4, {
        history: {
          startedAt: localTimestamp('2026-07-27'),
          completedAt: null,
          activeDaysTotal: 0,
          days: {
            '2026-07-28': {
              activity: false,
              lastReadAt: null,
              progress: {},
              status: 'to-read',
              reset: true,
              completed: false
            }
          }
        }
      }),
      title: 'Reset-only paper'
    }
  ];

  assert.deepEqual(calculateActivityDayDetail(papers, '2026-07-28'), [
    {
      itemID: 2,
      title: 'Alpha paper',
      recordedProgress: null,
      status: 'skimmed',
      lastRecordedAt: null
    },
    {
      itemID: 1,
      title: 'Zeta paper',
      recordedProgress: 0.4,
      status: 'reading',
      lastRecordedAt: localTimestamp('2026-07-28', 9)
    }
  ]);
  assert.deepEqual(calculateActivityDayDetail(papers, '2026-02-30'), []);

  const daySnapshot = calculateHistorySnapshot(papers, '7d', localTimestamp('2026-07-28'));
  assert.deepEqual(daySnapshot.days.at(-1), {
    day: '2026-07-28',
    activePapers: 2,
    completedPapers: 0,
    resetPapers: 1,
    progressPapers: 2
  });
  assert.deepEqual(daySnapshot.rangeSummary, {
    activeDays: 1,
    papersWithProgressActivity: 2,
    firstCompletions: 0
  });
  assert.deepEqual(daySnapshot.recentProgress.map((entry) => entry.id), [2, 1]);
});

test('Recent Progress preserves every matching paper for the UI to disclose or expand', () => {
  const papers = Array.from({ length: 9 }, (_, index) => paper(index + 1, {
    history: {
      startedAt: localTimestamp('2026-07-22'),
      completedAt: null,
      activeDaysTotal: 1,
      days: {
        [`2026-07-${String(20 + index).padStart(2, '0')}`]: {
          activity: true,
          lastReadAt: localTimestamp(`2026-07-${String(20 + index).padStart(2, '0')}`),
          progress: { a: 0.1 * (index + 1) },
          status: 'reading',
          reset: false,
          completed: false
        }
      }
    }
  }));

  const snapshot = calculateHistorySnapshot(papers, '30d', localTimestamp('2026-07-28'));

  assert.equal(snapshot.recentProgress.length, 9);
  assert.deepEqual(snapshot.recentProgress.map((entry) => entry.id), [9, 8, 7, 6, 5, 4, 3, 2, 1]);
});

test('completion trend counts each paper once and All time separates lifetime totals from retained detail', () => {
  const snapshot = calculateHistorySnapshot([
    paper(1, {
      history: {
        startedAt: localTimestamp('2025-01-01'),
        completedAt: localTimestamp('2025-01-03'),
        activeDaysTotal: 10,
        days: {
          '2026-07-27': {
            activity: true,
            lastReadAt: localTimestamp('2026-07-27'),
            progress: { a: 0.5, b: 0.75 },
            status: 'reading',
            reset: false,
            completed: false
          }
        }
      }
    }),
    paper(2, {
      history: {
        startedAt: localTimestamp('2026-07-01'),
        completedAt: localTimestamp('2026-07-28'),
        activeDaysTotal: 2,
        days: {}
      }
    })
  ], 'all-time', localTimestamp('2026-07-28'));

  assert.equal(snapshot.range, 'all-time');
  assert.equal(snapshot.lifetime.activeDays, 12);
  assert.equal(snapshot.lifetime.firstCompletions, 2);
  assert.deepEqual(snapshot.completionTrend, [
    { day: '2025-01-03', papers: 1, cumulativePapers: 1 },
    { day: '2026-07-28', papers: 1, cumulativePapers: 2 }
  ]);
  assert.deepEqual(snapshot.days.map((day) => day.day), ['2026-07-27']);
  assert.equal('averageProgress' in snapshot.days[0], false);
  assert.equal(snapshot.coverage.detailedDays, 1);
  assert.deepEqual(snapshot.rangeSummary, {
    activeDays: 1,
    papersWithProgressActivity: 1,
    firstCompletions: 2
  });
});

test('finite history ranges support 30d, 90d, and 1y windows without leaving the current day', () => {
  const now = localTimestamp('2026-07-28');
  assert.equal(calculateHistorySnapshot([], '30d', now).days.length, 30);
  assert.equal(calculateHistorySnapshot([], '90d', now).days.length, 90);
  assert.equal(calculateHistorySnapshot([], '1y', now).days.length, 365);
  assert.equal(calculateHistorySnapshot([], '1y', now).endDay, '2026-07-28');
});

test('status filters narrow current metrics and retained history together', () => {
  const now = localTimestamp('2026-07-28');
  const snapshot = calculateStatisticsSnapshot([
    paper(1, {
      s: 'reading',
      p: { '1': 0.4 },
      history: {
        startedAt: localTimestamp('2026-07-27'),
        completedAt: null,
        activeDaysTotal: 1,
        days: {
          '2026-07-27': {
            activity: true,
            lastReadAt: localTimestamp('2026-07-27'),
            progress: { a: 0.4 },
            status: 'reading',
            reset: false,
            completed: false
          }
        }
      }
    }),
    paper(2, { s: 'read', p: { '2': 1 } })
  ], { historyRange: '7d', statusFilter: 'reading', now });

  assert.equal(snapshot.totalPapers, 1);
  assert.deepEqual(snapshot.statusCounts, {
    unassigned: 0,
    'to-read': 0,
    reading: 1,
    skimmed: 0,
    read: 0,
    important: 0
  });
  assert.equal(snapshot.history.coverage.totalPapers, 1);
  assert.equal(snapshot.history.rangeSummary.papersWithProgressActivity, 1);
  assert.equal(snapshot.history.recentProgress[0].status, 'reading');
});

test('tracked and all datasets use the same paper set for current metrics and history', () => {
  const now = localTimestamp('2026-07-28');
  const history = {
    startedAt: localTimestamp('2026-07-27'),
    completedAt: null,
    activeDaysTotal: 1,
    days: {
      '2026-07-27': {
        activity: true,
        lastReadAt: localTimestamp('2026-07-27'),
        progress: { a: 0.4 },
        status: 'reading' as const,
        reset: false,
        completed: false
      }
    }
  };
  const papers: StatisticsPaper[] = [
    { ...paper(1, { s: 'reading', p: { '1': 0.4 }, history }), tracked: true },
    { ...paper(2, { s: 'reading', p: { '2': 0.4 }, history }), tracked: false },
    { ...paper(3, { s: 'read' }), tracked: false }
  ];

  const tracked = calculateStatisticsSnapshot(papers, {
    dataset: 'tracked',
    statusFilter: 'reading',
    historyRange: '7d',
    now
  });
  assert.equal(tracked.totalPapers, 1);
  assert.equal(tracked.history.coverage.totalPapers, 1);
  assert.equal(tracked.history.rangeSummary.papersWithProgressActivity, 1);

  const all = calculateStatisticsSnapshot(papers, {
    dataset: 'all',
    statusFilter: 'reading',
    historyRange: '7d',
    now
  });
  assert.equal(all.totalPapers, 2);
  assert.equal(all.history.coverage.totalPapers, 2);
  assert.equal(all.history.rangeSummary.papersWithProgressActivity, 2);
});

test('cacheable paper selection matches the dashboard dataset and status filters', () => {
  const papers: StatisticsPaper[] = [
    { ...paper(1, { s: 'reading' }), tracked: true },
    { ...paper(2, { s: 'skimmed' }), tracked: true },
    { ...paper(3, { s: 'reading' }), tracked: false }
  ];

  assert.deepEqual(
    selectStatisticsPapers(papers, { dataset: 'tracked', statusFilter: 'reading' }).map((entry) => entry.id),
    [1]
  );
  assert.deepEqual(
    selectStatisticsPapers(papers, { dataset: 'all', statusFilter: 'reading' }).map((entry) => entry.id),
    [1, 3]
  );
});
