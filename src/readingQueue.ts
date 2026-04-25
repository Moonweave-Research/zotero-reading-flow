import { FlowData, getDisplayProgress, inferStatus } from './flowData';

export const STALE_READING_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_NEARLY_DONE = 0.8;
const READ_PROGRESS_THRESHOLD = 0.95;

export interface ReadingQueueState {
  continueReading: boolean;
  nearlyDone: boolean;
  staleReading: boolean;
}

export function getReadingQueueState(data: FlowData, now = Date.now()): ReadingQueueState {
  return {
    continueReading: isContinueReading(data),
    nearlyDone: isNearlyDone(data),
    staleReading: isStaleReading(data, now)
  };
}

export function isContinueReading(data: FlowData): boolean {
  if (data.s === 'reading') return true;
  if (data.s) return false;
  return inferStatus(data) === 'reading';
}

export function isNearlyDone(data: FlowData): boolean {
  if (data.s && data.s !== 'reading') return false;
  if (!data.s && inferStatus(data) !== 'reading') return false;
  const progress = getDisplayProgress(data);
  return progress >= MIN_NEARLY_DONE && progress < READ_PROGRESS_THRESHOLD;
}

export function isStaleReading(data: FlowData, now = Date.now()): boolean {
  if (!data.lastReadAt || !Number.isFinite(data.lastReadAt)) return false;
  if (!isContinueReading(data)) return false;
  return now - data.lastReadAt >= STALE_READING_MS;
}
