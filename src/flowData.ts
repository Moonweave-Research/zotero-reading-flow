export type ReadingStatus = 'to-read' | 'reading' | 'skimmed' | 'read' | 'important';

export const HISTORY_RETENTION_DAYS = 366;

export interface DailyReadingRollup {
  activity: boolean;
  lastReadAt: number | null;
  progress: { [attachmentId: string]: number };
  status: ReadingStatus | null;
  reset: boolean;
  completed: boolean;
}

export interface ReadingHistory {
  startedAt: number;
  completedAt: number | null;
  activeDaysTotal: number;
  days: { [day: string]: DailyReadingRollup };
}

export interface FlowData {
  v: number;
  p: { [attId: string]: number };
  pageCount?: { [attId: string]: number };
  c: string | null;
  s: ReadingStatus | null;
  ts: number;
  lastAttachmentId: string | null;
  lastPage: number | null;
  lastReadAt: number | null;
  history?: ReadingHistory;
}

export const FLOW_PREFIX = 'ReadingFlow: ';
export const READ_PROGRESS_THRESHOLD = 0.95;

export const DEFAULT_FLOW_DATA: FlowData = {
  v: 1,
  p: {},
  c: null,
  s: null,
  ts: 0,
  lastAttachmentId: null,
  lastPage: null,
  lastReadAt: null
};

const VALID_STATUSES = new Set<ReadingStatus>(['to-read', 'reading', 'skimmed', 'read', 'important']);
const MAX_REASONABLE_PAGE_COUNT = 100000;

export function normalizeFlowData(input: any): FlowData {
  const progress = normalizeProgressMap(input?.p);

  const pageCount = normalizePageCountMap(input?.pageCount);
  const history = normalizeReadingHistory(input?.history);

  const lastAttachmentId =
    typeof input?.lastAttachmentId === 'string' && input.lastAttachmentId
      ? input.lastAttachmentId
      : null;

  const normalized: FlowData = {
    v: history ? 2 : 1,
    p: progress,
    pageCount: Object.keys(pageCount).length ? pageCount : undefined,
    c: typeof input?.c === 'string' ? input.c : null,
    s: VALID_STATUSES.has(input?.s) ? input.s : null,
    ts: finiteNumberOrZero(input?.ts),
    lastAttachmentId,
    lastPage: finitePositiveIntegerOrNull(input?.lastPage),
    lastReadAt: finiteNumberOrNull(input?.lastReadAt)
  };

  if (history) normalized.history = history;
  return normalized;
}

export function mergeFlowData(current: FlowData, updates: Partial<FlowData>, now = Date.now()): FlowData {
  const shouldReplaceProgress =
    Object.prototype.hasOwnProperty.call(updates, 'p')
    && updates.p
    && Object.keys(updates.p).length === 0;
  const mergedPageCount = { ...(current.pageCount || {}), ...(updates.pageCount || {}) };
  const nextWithoutTimestamp = normalizeFlowData({
    ...current,
    ...updates,
    p: shouldReplaceProgress ? {} : { ...current.p, ...(updates.p || {}) },
    pageCount: Object.keys(mergedPageCount).length ? mergedPageCount : undefined,
    ts: current.ts
  });
  return { ...nextWithoutTimestamp, ts: now };
}

export function isFlowDataSame(a: FlowData, b: FlowData): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function getDisplayAttachmentId(data: FlowData): string | null {
  if (data.lastAttachmentId && typeof data.p[data.lastAttachmentId] === 'number') {
    return data.lastAttachmentId;
  }

  let bestId: string | null = null;
  let bestProgress = 0;
  for (const [attachmentId, progress] of Object.entries(data.p)) {
    if (progress > bestProgress) {
      bestId = attachmentId;
      bestProgress = progress;
    }
  }
  return bestId;
}

export function getDisplayProgress(data: FlowData): number {
  const attachmentId = getDisplayAttachmentId(data);
  return attachmentId ? data.p[attachmentId] ?? 0 : 0;
}

export function inferStatus(data: FlowData): ReadingStatus {
  if (data.s) return data.s;
  const progress = getDisplayProgress(data);
  if (progress >= READ_PROGRESS_THRESHOLD && progress <= 1) return 'read';
  if (progress > 0) return 'reading';
  return 'to-read';
}

export function formatRelativeDate(timestamp: number | null, now = Date.now()): string {
  if (!timestamp || !Number.isFinite(timestamp) || timestamp <= 0) return '';
  const diffMs = Math.max(0, now - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return 'now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d`;
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function getLocalDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function pruneReadingHistory(history: ReadingHistory, timestamp: number): ReadingHistory {
  const reference = new Date(timestamp);
  const cutoff = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  cutoff.setDate(cutoff.getDate() - (HISTORY_RETENTION_DAYS - 1));
  const cutoffKey = getLocalDayKey(cutoff.getTime());
  const days: { [day: string]: DailyReadingRollup } = {};

  for (const [day, rollup] of Object.entries(history.days)) {
    if (day >= cutoffKey) days[day] = rollup;
  }

  return { ...history, days };
}

function finiteNumberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function finitePositiveIntegerOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function normalizeProgressMap(input: unknown): { [attId: string]: number } {
  const progress: { [attId: string]: number } = {};
  if (!input || typeof input !== 'object') return progress;

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      progress[key] = value > 1 ? Math.round(value) : Math.min(1, value);
    }
  }

  return progress;
}

function normalizeReadingHistory(input: unknown): ReadingHistory | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const candidate = input as any;
  if (!candidate.days || typeof candidate.days !== 'object') return undefined;

  const dayKeys = Object.keys(candidate.days);
  if (dayKeys.length > HISTORY_RETENTION_DAYS) return undefined;

  const startedAt = finiteTimestampOrNull(candidate.startedAt);
  if (startedAt === null) return undefined;

  const days: { [day: string]: DailyReadingRollup } = {};
  for (const [day, value] of Object.entries(candidate.days)) {
    if (!isValidDayKey(day) || !value || typeof value !== 'object') continue;
    const rollup = value as any;
    days[day] = {
      activity: rollup.activity === true,
      lastReadAt: finiteNumberOrNull(rollup.lastReadAt),
      progress: normalizeProgressMap(rollup.progress),
      status: VALID_STATUSES.has(rollup.status) ? rollup.status : null,
      reset: rollup.reset === true,
      completed: rollup.completed === true
    };
  }

  const completedAt = rollupTimestampOrNull(candidate.completedAt);
  const activeDaysTotal = typeof candidate.activeDaysTotal === 'number'
    && Number.isFinite(candidate.activeDaysTotal)
    && candidate.activeDaysTotal >= 0
    ? Math.floor(candidate.activeDaysTotal)
    : 0;

  return { startedAt, completedAt, activeDaysTotal, days };
}

function finiteTimestampOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function rollupTimestampOrNull(value: unknown): number | null {
  return value === null ? null : finiteTimestampOrNull(value);
}

function isValidDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

function normalizePageCountMap(input: unknown): { [attId: string]: number } {
  const normalized: { [attId: string]: number } = {};
  if (!input || typeof input !== 'object') return normalized;

  for (const [key, value] of Object.entries(input)) {
    const pageCount = finitePositiveIntegerOrNull(value);
    if (pageCount && pageCount <= MAX_REASONABLE_PAGE_COUNT) {
      normalized[key] = pageCount;
    }
  }

  return normalized;
}
