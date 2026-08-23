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
  private mutationQueues = new Map<number, Promise<void>>();
  private closed = false;

  public getData(item: any): FlowData {
    const id = item.id;
    const cached = this.cache.get(id);
    if (cached) return cached;

    const data = this.parseData(id, item.getField('extra') || '');
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
    return this.enqueueMutation(item, async () => {
      if (!await this.prepareMutation(item)) return false;
      const originalExtra = item.getField('extra') || '';
      const current = this.parseData(item.id, originalExtra);

      // Last write wins check
      if (updates.ts && updates.ts < current.ts) return false;

      const nextWithoutTimestamp = mergeFlowData(current, updates, current.ts);
      if (isFlowDataSame(current, nextWithoutTimestamp)) return false;

      const merged = mergeFlowData(current, updates);
      return this.saveData(item, merged, originalExtra);
    });
  }

  public async recordProgress(item: any, input: ProgressInput): Promise<boolean> {
    const build = this.buildProgressTransition(input);
    if (!build) return false;
    return this.transition(item, build);
  }

  public async recordProgressUnlessResetAfter(
    item: any,
    input: ProgressInput,
    capturedAt: number
  ): Promise<boolean> {
    const build = this.buildProgressTransition(input);
    if (!build) return false;

    return this.enqueueMutation(item, async () => {
      const resetAt = this.resetTimestamps.get(item.id);
      if (typeof resetAt === 'number' && resetAt > capturedAt) return false;
      return this.executeTransition(item, build);
    });
  }

  private buildProgressTransition(input: ProgressInput): ((current: FlowData) => FlowData) | null {
    const at = this.normalizeTimestamp(input.at);
    const observed = normalizeFlowData({ p: { [input.attachmentId]: input.progress } }).p[input.attachmentId];
    if (!observed) return null;

    return (current) => {
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
    };
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
    await this.enqueueMutation(item, async () => {
      const saved = await this.executeTransition(item, (current) => {
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
      if (saved && !this.isClosedOrShuttingDown()) {
        this.resetTimestamps.set(item.id, timestamp);
      }
      return saved;
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
    return this.enqueueMutation(item, () => this.executeTransition(item, build));
  }

  private async executeTransition(
    item: any,
    build: (current: FlowData) => FlowData
  ): Promise<boolean> {
    if (!await this.prepareMutation(item)) return false;
    const originalExtra = item.getField('extra') || '';
    const current = this.parseData(item.id, originalExtra);
    const next = build(current);
    if (isFlowDataSame(current, next)) return false;
    return this.saveData(item, next, originalExtra);
  }

  private async prepareMutation(item: any): Promise<boolean> {
    if (this.isClosedOrShuttingDown()) {
      Logger.log('ReadingFlow: write skipped during shutdown');
      return false;
    }

    if (!await this.waitUntilClean(item)) {
      Logger.warn('ReadingFlow: Item remained dirty after retries, skipping write to prevent race condition');
      return false;
    }
    return true;
  }

  private async saveData(item: any, data: FlowData, originalExtra: string): Promise<boolean> {
    const lines = originalExtra.split('\n').filter((line: string) => !line.startsWith(FLOW_PREFIX));
    lines.push(`${FLOW_PREFIX}${JSON.stringify(data)}`);

    if (this.isClosedOrShuttingDown()) {
      Logger.log('ReadingFlow: write skipped before saveTx during shutdown');
      return false;
    }

    const attemptedExtra = lines.join('\n');
    item.setField('extra', attemptedExtra);
    try {
      await item.saveTx();
      this.cache.delete(item.id);
      return true;
    } catch (error) {
      try {
        if ((item.getField('extra') || '') === attemptedExtra) {
          item.setField('extra', originalExtra);
        }
      } catch {
        // Best-effort rollback. The cache is still cleared below.
      }
      this.cache.delete(item.id);
      throw error;
    }
  }

  private enqueueMutation(item: any, run: () => Promise<boolean>): Promise<boolean> {
    const previous = this.mutationQueues.get(item.id) ?? Promise.resolve();
    const operation = previous.then(run);
    const tail = operation.then(() => undefined, () => undefined);
    this.mutationQueues.set(item.id, tail);
    void tail.then(() => {
      if (this.mutationQueues.get(item.id) === tail) {
        this.mutationQueues.delete(item.id);
      }
    });
    return operation;
  }

  private parseData(itemId: number, extra: string): FlowData {
    const match = extra.split('\n').find((line: string) => line.startsWith(FLOW_PREFIX));
    if (!match) return { ...DEFAULT_FLOW_DATA };

    try {
      return normalizeFlowData(JSON.parse(match.substring(FLOW_PREFIX.length)));
    } catch (error) {
      Logger.error(`ReadingFlow: Failed to parse data for ${itemId}`, error);
      return { ...DEFAULT_FLOW_DATA };
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
