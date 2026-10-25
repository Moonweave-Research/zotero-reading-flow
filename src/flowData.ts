export type ReadingStatus = 'to-read' | 'reading' | 'skimmed' | 'read';
export type DisplayReadingStatus = ReadingStatus | 'unassigned' | 'unavailable';
export type ReadingStatusSource = 'manual' | 'automatic' | 'unassigned' | 'unavailable';

export interface ResolvedReadingStatus {
  status: DisplayReadingStatus;
  source: ReadingStatusSource;
}

export interface ResolvedDisplayProgress {
  attachmentId: string | null;
  rawProgress: number | null;
  normalizedProgress: number | null;
  presentationProgress: number | null;
  pageCount: number | null;
}

export const HISTORY_RETENTION_DAYS = 366;

export interface DailyReadingRollup {
  activity: boolean;
  lastReadAt: number | null;
  progress: { [attachmentId: string]: number };
  status: ReadingStatus | 'important' | null;
  reset: boolean;
  completed: boolean;
}

export interface ReadingHistory {
  startedAt: number;
  completedAt: number | null;
  activeDaysTotal: number;
  days: { [day: string]: DailyReadingRollup };
}

export interface ReadingBookmark {
  attachmentKey: string;
  page: number;
  pageCount: number | null;
  at: number;
}

export function isReadingBookmark(value: any): value is ReadingBookmark {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.attachmentKey === 'string' && /^[A-Z0-9]{8}$/.test(value.attachmentKey)
    && Number.isInteger(value.page) && value.page > 0 && value.page <= 100000
    && (value.pageCount === null || (Number.isInteger(value.pageCount) && value.pageCount >= value.page && value.pageCount <= 100000))
    && Number.isFinite(value.at) && value.at > 0);
}

export interface FlowData {
  bookmark?: ReadingBookmark;
  /** Read-only interpretation; never persisted by a supported writer. */
  availability?: 'unavailable';
  v: number;
  /** Independent flag; legacy s=important is interpreted without recovering a manual stage.
   * v3 persists a boolean. Older encodings are retained until an explicit transition. */
  important?: boolean;
  p: { [attId: string]: number };
  pageCount?: { [attId: string]: number };
  c: string | null;
  s: ReadingStatus | null;
  ts: number;
  lastAttachmentId: string | null;
  lastPage: number | null;
  lastReadAt: number | null;
  /** Most recent explicit transition to the manual Reading status. Never inferred from PDF activity. */
  readingStartedAt?: number;
  history?: ReadingHistory;
}

export const FLOW_PREFIX = 'ReadingFlow: ';

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

const VALID_STATUSES = new Set<ReadingStatus>(['to-read', 'reading', 'skimmed', 'read']);
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
    v: input?.v === 5 ? 5 : input?.v === 4 ? 4 : input?.v === 3 ? 3 : history ? 2 : 1,
    p: progress,
    pageCount: Object.keys(pageCount).length ? pageCount : undefined,
    c: typeof input?.c === 'string' ? input.c : null,
    s: VALID_STATUSES.has(input?.s) ? input.s : null,
    ts: finiteNumberOrZero(input?.ts),
    lastAttachmentId,
    lastPage: finitePositiveIntegerOrNull(input?.lastPage),
    lastReadAt: finiteNumberOrNull(input?.lastReadAt)
  };

  if ((input?.v === 4 || input?.v === 5) && isReadingBookmark(input.bookmark)) normalized.bookmark = { ...input.bookmark };
  if (input?.v === 5 && typeof input.readingStartedAt === 'number' && Number.isFinite(input.readingStartedAt) && input.readingStartedAt > 0) {
    normalized.readingStartedAt = input.readingStartedAt;
  }
  if (input?.important === true || input?.s === 'important' || input?.v >= 3) normalized.important = input?.important === true || input?.s === 'important';
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
    v: Math.max(current.v, updates.v ?? current.v),
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
  if (data.lastAttachmentId && (typeof data.p[data.lastAttachmentId] === 'number' || data.lastPage != null)) {
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

export type ReadingAvailability = 'no-record' | 'available' | 'unavailable';

export function resolveReadingAvailability(data: FlowData): ReadingAvailability {
  if (data.availability) return 'unavailable';
  return data.bookmark || data.readingStartedAt || data.important || data.s || data.c || Object.keys(data.p).length || data.lastAttachmentId
    || data.lastPage || data.lastReadAt || data.history ? 'available' : 'no-record';
}

export function resolveReadingStatus(data: FlowData): ResolvedReadingStatus {
  if (data.availability === 'unavailable') return { status: 'unavailable', source: 'unavailable' };
  if (data.s) return { status: data.s, source: 'manual' };
  if (data.bookmark || Object.keys(data.p).length > 0 || data.lastPage != null || getLastActivityAt(data) !== null
    || Object.values(data.history?.days ?? {}).some(day => day.activity)) {
    return { status: 'reading', source: 'automatic' };
  }
  return { status: 'unassigned', source: 'unassigned' };
}

export function inferStatus(data: FlowData): ReadingStatus | null {
  const resolved = resolveReadingStatus(data).status;
  return resolved === 'unassigned' || resolved === 'unavailable' ? null : resolved;
}

export function getNormalizedDisplayProgress(data: FlowData): number | null {
  const attachmentId = getDisplayAttachmentId(data);
  if (!attachmentId) return null;
  const rawProgress = data.p[attachmentId] ?? null;
  const pageCount = normalizePageCount(data.pageCount?.[attachmentId]);
  const lastPage = data.lastAttachmentId === attachmentId ? data.lastPage ?? null : null;
  return normalizeProgressValue(rawProgress, pageCount, lastPage);
}

export function resolveDisplayProgress(data: FlowData): ResolvedDisplayProgress {
  const attachmentId = data.availability ? null : getDisplayAttachmentId(data);
  if (!attachmentId) {
    return { attachmentId: null, rawProgress: null, normalizedProgress: null, presentationProgress: null, pageCount: null };
  }
  const rawProgress = data.p[attachmentId] ?? null;
  const pageCount = normalizePageCount(data.pageCount?.[attachmentId]);
  const lastPage = data.lastAttachmentId === attachmentId ? data.lastPage ?? null : null;
  const normalizedProgress = normalizeProgressValue(rawProgress, pageCount, lastPage);
  return {
    attachmentId,
    rawProgress,
    normalizedProgress,
    // Current location belongs only to the saved attachment. A maximum is not a current position.
    presentationProgress: lastPage !== null
      ? (pageCount !== null ? Math.min(1, lastPage / pageCount) : lastPage)
      : null,
    pageCount
  };
}

export function formatReadingBookmark(data: FlowData): string {
  if (data.availability) return 'Reading bookmark unavailable';
  const mark = data.bookmark;
  return mark ? `Reading bookmark: page ${mark.page}${mark.pageCount ? ` / ${mark.pageCount}` : ''}` : 'No reading bookmark';
}

export function formatPDFPosition(data: FlowData): string {
  if (data.availability) return 'Reading Flow record unavailable';
  const display = resolveDisplayProgress(data);
  const page = data.lastAttachmentId === display.attachmentId ? data.lastPage ?? null : null;
  if (page === null) return Object.keys(data.p).length ? 'Last viewed position unknown' : 'No last viewed position';
  return display.pageCount !== null ? `Last viewed: page ${page} / ${display.pageCount}` : `Last viewed: page ${page} (page count unknown)`;
}

/** A PDF location, never a reading/completion percentage. */
export function formatPDFLocation(progress: number | null, pageCount: number | null): string {
  if (progress === null || !Number.isFinite(progress) || progress <= 0 || progress > 1) return 'Unknown';
  if (pageCount === null) return progress === 1 ? 'Unknown' : progress < 0.01 ? '<1% of PDF' : `About ${Math.floor(progress * 100)}% of PDF`;
  const page = progress * pageCount;
  return `${Math.abs(page - Math.round(page)) < 0.000001 ? 'Page' : 'About page'} ${Math.max(1, Math.round(page))} / ${pageCount}`;
}

export function formatMaximumPosition(data: FlowData): string {
  const display = resolveDisplayProgress(data);
  return `Farthest PDF position: ${formatPDFLocation(display.normalizedProgress, display.pageCount)}`;
}

export function formatActivityTimestamp(timestamp: number | null): string {
  if (timestamp === null || !Number.isFinite(timestamp) || timestamp <= 0) return 'Not recorded';
  const date = new Date(timestamp);
  return `${getLocalDayKey(timestamp)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function normalizeProgressValue(
  rawProgress: unknown,
  pageCount: number | null,
  lastPage: number | null = null,
  exactOneIsKnownFraction = false
): number | null {
  if (typeof rawProgress !== 'number' || !Number.isFinite(rawProgress) || rawProgress <= 0) return null;
  if (rawProgress < 1) return rawProgress;
  if (rawProgress === 1) {
    if (exactOneIsKnownFraction || pageCount === 1 || (pageCount !== null && lastPage !== null && lastPage >= pageCount)) return 1;
    return null;
  }
  if (pageCount === null) return null;
  return Math.min(1, rawProgress / pageCount);
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
  return getLocalDayKey(timestamp);
}

/** Only persisted PDF observations count; ts and startedAt also record status/reset writes. */
export function getLastActivityAt(data: FlowData): number | null {
  if (data.availability) return null;
  const times = [data.lastReadAt, ...Object.values(data.history?.days ?? {})
    .filter(day => day.activity).map(day => day.lastReadAt)]
    .filter((at): at is number => typeof at === 'number' && Number.isFinite(at) && at > 0);
  return times.length ? Math.max(...times) : null;
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
      status: rollup.status === 'important' || VALID_STATUSES.has(rollup.status) ? rollup.status : null,
      reset: rollup.reset === true,
      completed: rollup.completed === true
    };
  }

  const retainedDayKeys = Object.keys(days).sort().slice(-HISTORY_RETENTION_DAYS);
  const retainedDays: { [day: string]: DailyReadingRollup } = {};
  for (const day of retainedDayKeys) retainedDays[day] = days[day];

  const completedAt = rollupTimestampOrNull(candidate.completedAt);
  const activeDaysTotal = typeof candidate.activeDaysTotal === 'number'
    && Number.isFinite(candidate.activeDaysTotal)
    && candidate.activeDaysTotal >= 0
    ? Math.floor(candidate.activeDaysTotal)
    : 0;

  return { startedAt, completedAt, activeDaysTotal, days: retainedDays };
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

function normalizePageCount(value: unknown): number | null {
  const pageCount = finitePositiveIntegerOrNull(value);
  return pageCount && pageCount <= MAX_REASONABLE_PAGE_COUNT ? pageCount : null;
}
