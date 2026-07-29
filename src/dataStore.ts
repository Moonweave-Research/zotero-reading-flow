import { LRUCache } from './lruCache';
import { Logger } from './Logger';
import {
  DailyReadingRollup,
  DEFAULT_FLOW_DATA,
  FLOW_PREFIX,
  FlowData,
  getLocalDayKey,
  inferStatus,
  isFlowDataSame,
  mergeFlowData,
  normalizeFlowData,
  pruneReadingHistory,
  ReadingHistory,
  ReadingStatus
} from './flowData';

export interface ProgressInput {
  attachmentId: string;
  progress: number;
  pageCount?: number | null;
  lastPage?: number | null;
  at?: number;
}

export class DataStore {
  private static readonly DIRTY_RETRY_COUNT = 3;
  private static readonly DIRTY_RETRY_MS = 100;
  private cache = new LRUCache<number, FlowData>(2000);
  private resetTimestamps = new Map<number, number>();
  private closed = false;

  public getData(item: any): FlowData {
    const id = item.id;
    const cached = this.cache.get(id);
    if (cached) return cached;

    const match = this.getReadingFlowLine(item);
    
    let data = { ...DEFAULT_FLOW_DATA };
    if (match) {
      try {
        const parsed = JSON.parse(match.substring(FLOW_PREFIX.length));
        data = normalizeFlowData(parsed);
      } catch (e) {
        Logger.error(`ReadingFlow: Failed to parse data for ${id}`, e);
      }
    }
    
    this.cache.set(id, data);
    return data;
  }

  public hasReadingFlowData(item: any): boolean {
    const match = this.getReadingFlowLine(item);
    if (!match) return false;

    try {
      const parsed = JSON.parse(match.substring(FLOW_PREFIX.length));
      return Boolean(
        parsed
        && typeof parsed === 'object'
        && !Array.isArray(parsed)
        && (parsed.v === 1 || parsed.v === 2)
      );
    } catch {
      return false;
    }
  }

  public async updateData(item: any, updates: Partial<FlowData>): Promise<boolean> {
    if (this.isClosedOrShuttingDown()) {
      Logger.log('ReadingFlow: write skipped during shutdown');
      return false;
    }

    if (!await this.waitUntilClean(item)) {
      Logger.warn('ReadingFlow: Item remained dirty after retries, skipping write to prevent race condition');
      return false;
    }

    const current = this.getData(item);
    
    // Last write wins check
    if (updates.ts && updates.ts < current.ts) return false;

    const nextWithoutTimestamp = mergeFlowData(current, updates, current.ts);
    if (isFlowDataSame(current, nextWithoutTimestamp)) return false;

    const merged = mergeFlowData(current, updates);
    return this.saveData(item, merged);
  }

  public async recordProgress(item: any, input: ProgressInput): Promise<boolean> {
    const at = this.normalizeTimestamp(input.at);
    const observed = normalizeFlowData({ p: { [input.attachmentId]: input.progress } }).p[input.attachmentId];
    if (!observed) return false;

    return this.transition(item, (current) => {
      const currentProgress = current.p[input.attachmentId];
      const comparableCurrent = normalizeComparableProgress(
        currentProgress,
        current.pageCount?.[input.attachmentId] ?? input.pageCount
      );
      const nextProgress = typeof currentProgress === 'number'
        && comparableCurrent !== null
        && observed <= comparableCurrent
        ? currentProgress
        : observed;
      const updates: Partial<FlowData> = {
        p: { [input.attachmentId]: nextProgress },
        lastAttachmentId: input.attachmentId,
        lastPage: input.lastPage ?? null,
        lastReadAt: at
      };
      if (typeof input.pageCount === 'number' && Number.isFinite(input.pageCount) && input.pageCount > 0) {
        updates.pageCount = { [input.attachmentId]: Math.round(input.pageCount) };
      }

      const next = mergeFlowData(current, updates, at);
      return normalizeFlowData({
        ...next,
        history: this.recordProgressHistory(
          current.history,
          next,
          input.attachmentId,
          normalizeComparableProgress(
            nextProgress,
            next.pageCount?.[input.attachmentId] ?? input.pageCount
          ) ?? nextProgress,
          at
        )
      });
    });
  }

  public async setStatus(item: any, status: ReadingStatus | null, at = Date.now()): Promise<void> {
    const timestamp = this.normalizeTimestamp(at);
    await this.transition(item, (current) => {
      const next = mergeFlowData(current, { s: status }, timestamp);
      return normalizeFlowData({
        ...next,
        history: this.recordStatusHistory(current.history, next, timestamp)
      });
    });
  }

  public async resetProgress(item: any, at = Date.now()): Promise<void> {
    const timestamp = this.normalizeTimestamp(at);
    this.resetTimestamps.set(item.id, timestamp);
    await this.transition(item, (current) => {
      const next = mergeFlowData(current, {
        p: {},
        s: 'to-read',
        lastAttachmentId: null,
        lastPage: null,
        lastReadAt: null
      }, timestamp);
      return normalizeFlowData({
        ...next,
        history: this.recordResetHistory(current.history, timestamp)
      });
    });
  }

  public clearCache(itemId: number) {
    this.cache.delete(itemId);
    this.resetTimestamps.delete(itemId);
  }

  public invalidateCache(itemId: number) {
    this.cache.delete(itemId);
  }

  public getResetTimestamp(itemId: number): number | null {
    return this.resetTimestamps.get(itemId) ?? null;
  }

  public close() {
    this.closed = true;
    this.cache.clear();
    this.resetTimestamps.clear();
  }

  private isClosedOrShuttingDown(): boolean {
    const startup = (globalThis as any).Services?.startup;
    return this.closed || Boolean(startup?.shuttingDown);
  }

  private getReadingFlowLine(item: any): string | undefined {
    const extra = item.getField('extra') || '';
    return extra.split('\n').find((line: string) => line.startsWith(FLOW_PREFIX));
  }

  private async transition(
    item: any,
    build: (current: FlowData) => FlowData
  ): Promise<boolean> {
    if (this.isClosedOrShuttingDown()) {
      Logger.log('ReadingFlow: write skipped during shutdown');
      return false;
    }

    if (!await this.waitUntilClean(item)) {
      Logger.warn('ReadingFlow: Item remained dirty after retries, skipping write to prevent race condition');
      return false;
    }

    const current = this.getData(item);
    const next = build(current);
    if (isFlowDataSame(current, next)) return false;
    return this.saveData(item, next);
  }

  private async saveData(item: any, data: FlowData): Promise<boolean> {
    const originalExtra = item.getField('extra') || '';
    const lines = originalExtra.split('\n').filter((line: string) => !line.startsWith(FLOW_PREFIX));
    lines.push(`${FLOW_PREFIX}${JSON.stringify(data)}`);

    if (this.isClosedOrShuttingDown()) {
      Logger.log('ReadingFlow: write skipped before saveTx during shutdown');
      return false;
    }

    item.setField('extra', lines.join('\n'));
    try {
      await item.saveTx();
      this.cache.set(item.id, data);
      return true;
    } catch (error) {
      try {
        item.setField('extra', originalExtra);
      } catch {
        // Best-effort rollback. The cache is still cleared below.
      }
      this.cache.delete(item.id);
      throw error;
    }
  }

  private recordProgressHistory(
    current: ReadingHistory | undefined,
    next: FlowData,
    attachmentId: string,
    progress: number,
    at: number
  ): ReadingHistory {
    const history = this.cloneOrCreateHistory(current, at);
    const dayKey = getLocalDayKey(at);
    const day = this.cloneOrCreateDay(history.days[dayKey]);
    const wasActive = day.activity;

    day.activity = true;
    day.lastReadAt = at;
    day.progress[attachmentId] = Math.max(day.progress[attachmentId] ?? 0, progress);
    day.status = inferStatus(next);
    if (day.status === 'read' && history.completedAt === null) {
      history.completedAt = at;
      day.completed = true;
    }
    history.activeDaysTotal += wasActive ? 0 : 1;
    history.days[dayKey] = day;
    return pruneReadingHistory(history, at);
  }

  private recordStatusHistory(
    current: ReadingHistory | undefined,
    next: FlowData,
    at: number
  ): ReadingHistory {
    const history = this.cloneOrCreateHistory(current, at);
    const dayKey = getLocalDayKey(at);
    const day = this.cloneOrCreateDay(history.days[dayKey]);
    day.status = inferStatus(next);
    if (day.status === 'read' && history.completedAt === null) {
      history.completedAt = at;
      day.completed = true;
    }
    history.days[dayKey] = day;
    return pruneReadingHistory(history, at);
  }

  private recordResetHistory(current: ReadingHistory | undefined, at: number): ReadingHistory {
    const history = this.cloneOrCreateHistory(current, at);
    const dayKey = getLocalDayKey(at);
    const day = this.cloneOrCreateDay(history.days[dayKey]);
    day.progress = {};
    day.status = 'to-read';
    day.reset = true;
    history.days[dayKey] = day;
    return pruneReadingHistory(history, at);
  }

  private cloneOrCreateHistory(current: ReadingHistory | undefined, at: number): ReadingHistory {
    if (!current) {
      return { startedAt: at, completedAt: null, activeDaysTotal: 0, days: {} };
    }

    const days: { [day: string]: DailyReadingRollup } = {};
    for (const [day, rollup] of Object.entries(current.days)) {
      days[day] = {
        ...rollup,
        progress: { ...rollup.progress }
      };
    }
    return { ...current, days };
  }

  private cloneOrCreateDay(current: DailyReadingRollup | undefined): DailyReadingRollup {
    return current
      ? { ...current, progress: { ...current.progress } }
      : { activity: false, lastReadAt: null, progress: {}, status: null, reset: false, completed: false };
  }

  private normalizeTimestamp(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : Date.now();
  }

  private async waitUntilClean(item: any): Promise<boolean> {
    if (typeof item.isDirty !== 'function') return true;

    for (let attempt = 0; attempt < DataStore.DIRTY_RETRY_COUNT; attempt++) {
      if (!item.isDirty()) return true;
      if (this.isClosedOrShuttingDown()) return false;
      if (attempt < DataStore.DIRTY_RETRY_COUNT - 1) {
        await this.delay(DataStore.DIRTY_RETRY_MS);
      }
    }

    return false;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => {
      const win = (globalThis as any).Zotero?.getMainWindow?.();
      const schedule = win?.setTimeout?.bind(win) ?? (globalThis as any).setTimeout;
      if (typeof schedule !== 'function') {
        resolve(undefined);
        return;
      }
      schedule(resolve, ms);
    });
  }
}

function normalizeComparableProgress(value: number | undefined, pageCount: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  if (value <= 1) return Math.min(1, value);
  if (typeof pageCount !== 'number' || !Number.isFinite(pageCount) || pageCount <= 0) return null;
  return Math.min(1, value / pageCount);
}
