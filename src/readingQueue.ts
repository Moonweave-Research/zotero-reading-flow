import { FlowData, getDisplayProgress, inferStatus } from './flowData';

export const STALE_READING_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_IN_PROGRESS = 0.01;
const MAX_IN_PROGRESS = 0.97;
const MIN_NEARLY_DONE = 0.8;

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
  if (data.s && data.s !== 'reading') return false;
  const progress = getDisplayProgress(data);
  return data.s === 'reading' || isInProgress(progress);
}

export function isNearlyDone(data: FlowData): boolean {
  if (data.s && data.s !== 'reading') return false;
  const progress = getDisplayProgress(data);
  return progress >= MIN_NEARLY_DONE && progress <= MAX_IN_PROGRESS;
}

export function isStaleReading(data: FlowData, now = Date.now()): boolean {
  if (!data.lastReadAt || !Number.isFinite(data.lastReadAt)) return false;
  if (!isContinueReading(data) && inferStatus(data) !== 'reading') return false;
  return now - data.lastReadAt >= STALE_READING_MS;
}

function isInProgress(progress: number): boolean {
  return progress >= MIN_IN_PROGRESS && progress <= MAX_IN_PROGRESS;
}
