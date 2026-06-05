import {
  FlowData,
  ReadingPriority,
  ReadingStatus,
  formatRelativeDate,
  getDisplayAttachmentId,
  getDisplayProgress,
  inferStatus
} from './flowData';

export type FlowActionTone = 'empty' | 'high' | 'reading' | 'finish' | 'complete' | 'neutral';

export interface FlowAction {
  label: string;
  detail: string;
  title: string;
  sortValue: string;
  tone: FlowActionTone;
}

const STALE_DAYS = 14;
const FINISH_THRESHOLD = 0.8;
const DAY_MS = 24 * 60 * 60 * 1000;

const PRIORITY_LABELS: Record<ReadingPriority, string> = {
  high: 'High priority',
  low: 'Low priority'
};

const STATUS_LABELS: Record<ReadingStatus, string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  skimmed: 'Skimmed',
  read: 'Read'
};

export function getFlowAction(data: FlowData, now = Date.now()): FlowAction {
  const status = inferStatus(data);
  const progress = getDisplayProgress(data);
  const percent = toPercent(progress);
  const detail = getProgressDetail(progress, percent);
  const rankProgress = getRankProgress(progress, percent);
  const isPageProgress = progress > 1;
  const staleDays = getStaleDays(data, status, now);
  const title = buildTitle(data, status, percent, staleDays, now);

  if (status === 'read' || (!isPageProgress && progress >= 0.95)) {
    return action('Done', '', title || 'Read', '700|done', 'complete');
  }

  if (status === 'skimmed') {
    return action('Skimmed', '', title || 'Skimmed', '650|skimmed', 'neutral');
  }

  if (isUntouched(data, progress)) {
    if (data.s === 'reading') {
      return action('Reading', '', title || 'Reading', '350|reading', 'reading');
    }
    if (data.priority === 'high') {
      return action('Read Next', '', title || 'High priority; not started', '000|read-next', 'high');
    }
    if (data.priority === 'low') {
      return action('Later', '', title || 'Low priority; not started', '850|later', 'neutral');
    }
    if (data.s === 'to-read') {
      return action('To Read', '', title || 'Marked To Read', '600|to-read', 'neutral');
    }
    return action('', '', '', '900|empty', 'empty');
  }

  if (!isPageProgress && progress >= FINISH_THRESHOLD) {
    return action('Finish', detail, title, `200|finish|${pad3(percent)}`, 'finish');
  }

  if (staleDays !== null) {
    const rank = data.priority === 'high' ? '100' : data.priority === 'low' ? '450' : '250';
    const tone: FlowActionTone = data.priority === 'high' ? 'high' : data.priority === 'low' ? 'neutral' : 'reading';
    const mode = data.priority === 'low' ? 'return-later' : isPageProgress ? 'return-page' : 'return';
    return action('Return', detail, title, `${rank}|${mode}|${pad3(staleDays)}|${rankProgress}`, tone);
  }

  if (progress > 0) {
    const rank = getResumeRank(data.priority);
    if (data.priority === 'low') {
      return action('Later', detail, title, `${rank}|resume-later|${rankProgress}`, 'neutral');
    }
    const tone: FlowActionTone = data.priority === 'high' ? 'high' : 'reading';
    const mode = isPageProgress ? 'resume-page' : 'resume';
    return action('Resume', detail, title, `${rank}|${mode}|${rankProgress}`, tone);
  }

  return action('', '', '', '900|empty', 'empty');
}

export function serializeFlowAction(action: FlowAction): string {
  return `${action.sortValue}\t${JSON.stringify(action)}`;
}

export function parseFlowAction(input: string): FlowAction | null {
  if (!input) return null;
  try {
    const json = input.includes('\t') ? input.slice(input.indexOf('\t') + 1) : input;
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.label !== 'string') return null;
    if (typeof parsed.detail !== 'string') return null;
    if (typeof parsed.title !== 'string') return null;
    if (typeof parsed.sortValue !== 'string') return null;
    if (typeof parsed.tone !== 'string') return null;
    return parsed as FlowAction;
  } catch {
    return null;
  }
}

function action(label: string, detail: string, title: string, sortValue: string, tone: FlowActionTone): FlowAction {
  return { label, detail, title, sortValue, tone };
}

function isUntouched(data: FlowData, progress: number): boolean {
  return progress <= 0 && !data.lastReadAt && !data.lastPage;
}

function getStaleDays(data: FlowData, status: ReadingStatus, now: number): number | null {
  if (!data.lastReadAt || status === 'read' || status === 'skimmed') return null;
  const days = Math.floor(Math.max(0, now - data.lastReadAt) / DAY_MS);
  return days >= STALE_DAYS ? days : null;
}

function buildTitle(
  data: FlowData,
  status: ReadingStatus,
  percent: number,
  staleDays: number | null,
  now: number
): string {
  const parts: string[] = [];
  if (data.priority) parts.push(PRIORITY_LABELS[data.priority]);
  parts.push(STATUS_LABELS[status]);
  if (percent > 0) parts.push(`${percent}% read`);
  const attachmentId = getDisplayAttachmentId(data);
  const total = attachmentId ? data.pageCount?.[attachmentId] : undefined;
  if (data.lastPage && total) parts.push(`page ${data.lastPage} / ${total}`);
  if (data.lastPage && !total) parts.push(`page ${data.lastPage}`);
  if (data.lastReadAt) parts.push(`last read ${formatRelativeDate(data.lastReadAt, now)}`);
  if (staleDays !== null) parts.push(`untouched ${staleDays}d`);
  if (data.priority === 'high' && percent <= 0) parts.push('not started');
  return parts.join(' | ');
}

function toPercent(progress: number): number {
  if (!Number.isFinite(progress) || progress <= 0 || progress > 1) return 0;
  return Math.max(1, Math.min(100, Math.round(progress * 100)));
}

function getProgressDetail(progress: number, percent: number): string {
  if (!Number.isFinite(progress) || progress <= 0) return '';
  if (progress > 1) return `p. ${Math.round(progress)}`;
  return `${percent}%`;
}

function getRankProgress(progress: number, percent: number): string {
  if (progress > 1) return pad3(progress);
  return pad3(percent);
}

function getResumeRank(priority: ReadingPriority | null): string {
  if (priority === 'high') return '150';
  if (priority === 'low') return '450';
  return '300';
}

function pad3(value: number): string {
  return String(Math.max(0, Math.round(value))).padStart(3, '0');
}
