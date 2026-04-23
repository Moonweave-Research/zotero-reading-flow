export type ReadingStatus = 'to-read' | 'reading' | 'skimmed' | 'read' | 'important';

export interface FlowData {
  v: number;
  p: { [attId: string]: number };
  c: string | null;
  s: ReadingStatus | null;
  ts: number;
  lastAttachmentId: string | null;
  lastPage: number | null;
  lastReadAt: number | null;
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

const VALID_STATUSES = new Set<ReadingStatus>(['to-read', 'reading', 'skimmed', 'read', 'important']);

export function normalizeFlowData(input: any): FlowData {
  const progress: { [attId: string]: number } = {};
  if (input?.p && typeof input.p === 'object') {
    for (const [key, value] of Object.entries(input.p)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        progress[key] = value > 1 ? Math.round(value) : Math.min(1, value);
      }
    }
  }

  const lastAttachmentId =
    typeof input?.lastAttachmentId === 'string' && input.lastAttachmentId
      ? input.lastAttachmentId
      : null;

  return {
    v: 1,
    p: progress,
    c: typeof input?.c === 'string' ? input.c : null,
    s: VALID_STATUSES.has(input?.s) ? input.s : null,
    ts: finiteNumberOrZero(input?.ts),
    lastAttachmentId,
    lastPage: finitePositiveIntegerOrNull(input?.lastPage),
    lastReadAt: finiteNumberOrNull(input?.lastReadAt)
  };
}

export function mergeFlowData(current: FlowData, updates: Partial<FlowData>, now = Date.now()): FlowData {
  const shouldReplaceProgress =
    Object.prototype.hasOwnProperty.call(updates, 'p')
    && updates.p
    && Object.keys(updates.p).length === 0;
  const nextWithoutTimestamp = normalizeFlowData({
    ...current,
    ...updates,
    p: shouldReplaceProgress ? {} : { ...current.p, ...(updates.p || {}) },
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
  if (progress >= 0.95 && progress <= 1) return 'read';
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

function finiteNumberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function finitePositiveIntegerOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}
