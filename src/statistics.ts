import {
  FlowData,
  ReadingHistory,
  ReadingStatus,
  getDisplayAttachmentId,
  getLocalDayKey
} from './flowData';

export const PROGRESS_BUCKETS = [
  'not-started',
  '1-24',
  '25-49',
  '50-74',
  '75-94',
  'complete',
  'unknown'
] as const;

export type ProgressBucket = typeof PROGRESS_BUCKETS[number];

export const HISTORY_RANGES = ['7d', '30d', '90d', '1y', 'all-time'] as const;
export type HistoryRange = typeof HISTORY_RANGES[number];

export const STATISTICS_DATASETS = ['tracked', 'all'] as const;
export type StatisticsDataset = typeof STATISTICS_DATASETS[number];

export interface HistoryDaySnapshot {
  day: string;
  activePapers: number;
  completedPapers: number;
  resetPapers: number;
  progressPapers: number;
  /** @deprecated Type-only compatibility for the pre-correction dashboard; never emitted. */
  averageProgress?: number | null;
}

export interface HistoryCompletionPoint {
  day: string;
  papers: number;
  cumulativePapers: number;
}

export interface HistoricalSnapshot {
  range: HistoryRange;
  startDay: string | null;
  endDay: string | null;
  days: HistoryDaySnapshot[];
  completionTrend: HistoryCompletionPoint[];
  lifetime: {
    activeDays: number;
    firstCompletions: number;
  };
  rangeSummary: {
    activeDays: number;
    papersWithProgressActivity: number;
    /** @deprecated Type-only compatibility for the pre-correction dashboard; never emitted. */
    papersAdvanced?: number;
    firstCompletions: number;
  };
  recentProgress: RecentProgressSnapshot[];
  coverage: {
    papersWithHistory: number;
    totalPapers: number;
    detailedDays: number;
  };
}

export interface RecentProgressSnapshot {
  id: number | string;
  title: string;
  status: ReadingStatus;
  currentProgress: number | null;
  delta: number | null;
  lastProgressDay: string;
  resetCount: number;
}

export interface StatisticsOptions {
  dataset?: StatisticsDataset;
  historyRange?: HistoryRange;
  now?: number;
  statusFilter?: ReadingStatus;
}

export const READING_STATUSES = [
  'to-read',
  'reading',
  'skimmed',
  'read',
  'important'
] as const satisfies readonly ReadingStatus[];

export interface StatisticsPaper {
  id: number | string;
  flowData: FlowData;
  tracked?: boolean;
  title?: string;
}

export interface StatisticsSnapshot {
  totalPapers: number;
  inProgress: number;
  read: number;
  statusCounts: Record<ReadingStatus, number>;
  progressDistribution: Record<ProgressBucket, number>;
  knownRemainingPages: number;
  remainingPagesCoverage: {
    knownPapers: number;
    totalPapers: number;
  };
  history: HistoricalSnapshot;
}

interface DisplayState {
  attachmentId: string | null;
  rawProgress: number | null;
  normalizedProgress: number | null;
  pageCount: number | null;
}

const READ_PROGRESS_THRESHOLD = 0.95;

export function calculateStatisticsSnapshot(
  papers: readonly StatisticsPaper[],
  options: StatisticsOptions = {}
): StatisticsSnapshot {
  const datasetPapers = options.dataset === 'all'
    ? papers
    : papers.filter((paper) => paper.tracked !== false);
  const selectedPapers = options.statusFilter
    ? datasetPapers.filter((paper) => {
      const display = getDisplayState(paper.flowData);
      return resolveStatus(paper.flowData, display) === options.statusFilter;
    })
    : datasetPapers;
  const statusCounts = emptyStatusCounts();
  const progressDistribution = emptyProgressDistribution();
  let knownRemainingPages = 0;
  let knownRemainingPapers = 0;

  for (const paper of selectedPapers) {
    const display = getDisplayState(paper.flowData);
    const status = resolveStatus(paper.flowData, display);
    const bucket = resolveProgressBucket(status, display);
    const remainingPages = resolveRemainingPages(status, display);

    statusCounts[status] += 1;
    progressDistribution[bucket] += 1;

    if (remainingPages !== null) {
      knownRemainingPages += remainingPages;
      knownRemainingPapers += 1;
    }
  }

  return {
    totalPapers: selectedPapers.length,
    inProgress: statusCounts.reading,
    read: statusCounts.read,
    statusCounts,
    progressDistribution,
    knownRemainingPages,
    remainingPagesCoverage: {
      knownPapers: knownRemainingPapers,
      totalPapers: selectedPapers.length
    },
    history: calculateHistorySnapshot(selectedPapers, options.historyRange ?? '7d', options.now ?? Date.now())
  };
}

export function calculateHistorySnapshot(
  papers: readonly StatisticsPaper[],
  range: HistoryRange = '7d',
  now = Date.now()
): HistoricalSnapshot {
  const selectedRange = isHistoryRange(range) ? range : '7d';
  const window = getHistoryWindow(selectedRange, now);
  const dayAggregates = new Map<string, DayAggregate>();
  const completionCounts = new Map<string, number>();
  const seenCompletionPapers = new Set<string>();
  const detailedDays = new Set<string>();
  const activeDayKeys = new Set<string>();
  const progressActivityPaperKeys = new Set<string>();
  let papersWithHistory = 0;
  let activeDays = 0;
  let firstCompletions = 0;

  for (const paper of papers) {
    const history = paper.flowData.history;
    if (!history) continue;

    if (history.completedAt !== null || Object.values(history.days).some((rollup) => maxRollupProgress(rollup) !== null)) {
      papersWithHistory += 1;
    }
    activeDays += history.activeDaysTotal;

    const paperKey = String(paper.id);
    if (history.completedAt !== null && !seenCompletionPapers.has(paperKey)) {
      seenCompletionPapers.add(paperKey);
      firstCompletions += 1;
      const completionDay = getLocalDayKey(history.completedAt);
      if (isInWindow(completionDay, window)) {
        completionCounts.set(completionDay, (completionCounts.get(completionDay) ?? 0) + 1);
      }
    }

    for (const [day, rollup] of Object.entries(history.days)) {
      if (!isInWindow(day, window)) continue;
      detailedDays.add(day);
      const aggregate = dayAggregates.get(day) ?? emptyDayAggregate();
      if (rollup.activity) {
        aggregate.activePapers += 1;
        activeDayKeys.add(day);
      }
      if (rollup.reset) aggregate.resetPapers += 1;

      const progress = maxRollupProgress(rollup);
      if (progress !== null) {
        aggregate.progressPapers += 1;
        progressActivityPaperKeys.add(paperKey);
      }
      dayAggregates.set(day, aggregate);
    }
  }

  const dayKeys = window.allTime
    ? [...dayAggregates.keys()].sort()
    : listDayKeys(window.startDay!, window.endDay!);
  const days = dayKeys.map((day) => {
    const aggregate = dayAggregates.get(day) ?? emptyDayAggregate();
    return {
      day,
      activePapers: aggregate.activePapers,
      completedPapers: completionCounts.get(day) ?? 0,
      resetPapers: aggregate.resetPapers,
      progressPapers: aggregate.progressPapers
    };
  });

  let cumulativeCompletions = 0;
  const completionTrend = [...completionCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, papersCount]) => {
      cumulativeCompletions += papersCount;
      return { day, papers: papersCount, cumulativePapers: cumulativeCompletions };
    });

  const recentProgress = papers
    .map((paper) => buildRecentProgressSnapshot(paper, window))
    .filter((entry): entry is RecentProgressSnapshot => entry !== null)
    .sort((a, b) => b.lastProgressDay.localeCompare(a.lastProgressDay) || a.title.localeCompare(b.title));

  return {
    range: selectedRange,
    startDay: window.allTime ? days[0]?.day ?? null : window.startDay,
    endDay: window.allTime ? days[days.length - 1]?.day ?? null : window.endDay,
    days,
    completionTrend,
    lifetime: { activeDays, firstCompletions },
    rangeSummary: {
      activeDays: activeDayKeys.size,
      papersWithProgressActivity: progressActivityPaperKeys.size,
      firstCompletions: [...completionCounts.values()].reduce((sum, count) => sum + count, 0)
    },
    recentProgress,
    coverage: {
      papersWithHistory,
      totalPapers: papers.length,
      detailedDays: detailedDays.size
    }
  };
}

function buildRecentProgressSnapshot(
  paper: StatisticsPaper,
  window: HistoryWindow
): RecentProgressSnapshot | null {
  const history = paper.flowData.history;
  if (!history) return null;

  const progressDays = Object.entries(history.days)
    .filter(([day]) => isInWindow(day, window))
    .map(([day, rollup]) => ({ day, progress: maxRollupProgress(rollup), reset: rollup.reset }))
    .filter((entry): entry is { day: string; progress: number; reset: boolean } => entry.progress !== null)
    .sort((a, b) => a.day.localeCompare(b.day));
  if (progressDays.length === 0) return null;

  const latest = progressDays[progressDays.length - 1];
  const previous = progressDays.length > 1 ? progressDays[progressDays.length - 2] : null;
  const display = getDisplayState(paper.flowData);
  const resetCount = Object.entries(history.days)
    .filter(([day, rollup]) => isInWindow(day, window) && rollup.reset)
    .length;

  return {
    id: paper.id,
    title: paper.title?.trim() || `Paper ${paper.id}`,
    status: resolveStatus(paper.flowData, display),
    currentProgress: display.normalizedProgress,
    delta: previous ? latest.progress - previous.progress : null,
    lastProgressDay: latest.day,
    resetCount
  };
}

interface DayAggregate {
  activePapers: number;
  resetPapers: number;
  progressPapers: number;
}

interface HistoryWindow {
  allTime: boolean;
  startDay: string | null;
  endDay: string | null;
}

function getHistoryWindow(range: HistoryRange, now: number): HistoryWindow {
  if (range === 'all-time') {
    return { allTime: true, startDay: null, endDay: null };
  }

  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 365;
  const endDay = getLocalDayKey(now);
  return { allTime: false, startDay: shiftDay(endDay, -(days - 1)), endDay };
}

function isInWindow(day: string, window: HistoryWindow): boolean {
  if (!isValidDayKey(day)) return false;
  if (window.allTime) return isValidDayKey(day);
  return day >= window.startDay! && day <= window.endDay!;
}

function listDayKeys(startDay: string, endDay: string): string[] {
  const keys: string[] = [];
  let current = startDay;
  while (current <= endDay) {
    keys.push(current);
    current = shiftDay(current, 1);
  }
  return keys;
}

function shiftDay(day: string, offset: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const value = new Date(year, month - 1, date);
  value.setDate(value.getDate() + offset);
  return getLocalDayKey(value.getTime());
}

function maxRollupProgress(rollup: ReadingHistory['days'][string]): number | null {
  const values = Object.values(rollup.progress).filter(
    (value) => typeof value === 'number' && Number.isFinite(value) && value > 0
  );
  return values.length ? Math.max(...values) : null;
}

function emptyDayAggregate(): DayAggregate {
  return { activePapers: 0, resetPapers: 0, progressPapers: 0 };
}

function isHistoryRange(value: unknown): value is HistoryRange {
  return typeof value === 'string' && (HISTORY_RANGES as readonly string[]).includes(value);
}

function isValidDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, date] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, date);
  return parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === date;
}

function getDisplayState(data: FlowData): DisplayState {
  const attachmentId = getDisplayAttachmentId(data);
  if (!attachmentId) {
    return {
      attachmentId: null,
      rawProgress: null,
      normalizedProgress: null,
      pageCount: null
    };
  }

  const rawProgress = data.p[attachmentId];
  const pageCount = validPageCount(data.pageCount?.[attachmentId]);
  const normalizedProgress = normalizeProgress(rawProgress, pageCount);
  return { attachmentId, rawProgress, normalizedProgress, pageCount };
}

function resolveStatus(data: FlowData, display: DisplayState): ReadingStatus {
  if (data.s) return data.s;
  if (display.normalizedProgress !== null && display.normalizedProgress >= READ_PROGRESS_THRESHOLD) {
    return 'read';
  }
  if (display.rawProgress !== null && display.rawProgress > 0) {
    return 'reading';
  }
  return 'to-read';
}

function resolveProgressBucket(status: ReadingStatus, display: DisplayState): ProgressBucket {
  if (status === 'read') return 'complete';
  if (display.rawProgress === null) return 'not-started';
  if (display.normalizedProgress === null) return 'unknown';

  const progress = display.normalizedProgress;
  if (progress >= READ_PROGRESS_THRESHOLD) return 'complete';
  if (progress < 0.25) return '1-24';
  if (progress < 0.5) return '25-49';
  if (progress < 0.75) return '50-74';
  return '75-94';
}

function resolveRemainingPages(status: ReadingStatus, display: DisplayState): number | null {
  if (status === 'read') return 0;
  if (display.rawProgress === null || display.pageCount === null) return null;

  if (display.rawProgress > 1) {
    return Math.max(display.pageCount - display.rawProgress, 0);
  }

  const remaining = display.pageCount * (1 - display.rawProgress);
  return Math.ceil(Number(remaining.toFixed(9)));
}

function normalizeProgress(rawProgress: number | undefined, pageCount: number | null): number | null {
  if (typeof rawProgress !== 'number' || !Number.isFinite(rawProgress) || rawProgress <= 0) {
    return null;
  }
  if (rawProgress <= 1) return Math.min(1, rawProgress);
  if (pageCount === null) return null;
  return Math.min(1, rawProgress / pageCount);
}

function validPageCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function emptyStatusCounts(): Record<ReadingStatus, number> {
  return {
    'to-read': 0,
    reading: 0,
    skimmed: 0,
    read: 0,
    important: 0
  };
}

function emptyProgressDistribution(): Record<ProgressBucket, number> {
  return {
    'not-started': 0,
    '1-24': 0,
    '25-49': 0,
    '50-74': 0,
    '75-94': 0,
    complete: 0,
    unknown: 0
  };
}
