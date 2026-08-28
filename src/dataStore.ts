import { LRUCache } from './lruCache';
import { Logger } from './Logger';
import {
  DailyReadingRollup,
  DEFAULT_FLOW_DATA,
  FLOW_PREFIX,
  FlowData,
  getNormalizedDisplayProgress,
  getLocalDayKey,
  inferStatus,
  isFlowDataSame,
  mergeFlowData,
  normalizeProgressValue,
  normalizeFlowData,
  pruneReadingHistory,
  ReadingHistory,
  READ_PROGRESS_THRESHOLD,
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
  private static readonly EXTRA_MERGE_RETRY_COUNT = 3;
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
    const stored = this.getStoredReadingFlowData(item);
    return stored ? this.hasMeaningfulData(stored) : false;
  }

  public hasStoredReadingFlowData(item: any): boolean {
    return this.getStoredReadingFlowData(item) !== null;
  }

  private getStoredReadingFlowData(item: any): FlowData | null {
    const extra = item.getField('extra') || '';
    return this.getLatestSupportedData(extra);
  }

  public async updateData(item: any, updates: Partial<FlowData>): Promise<boolean> {
    return this.enqueueMutation(item, async () => {
      if (!await this.prepareMutation(item)) return false;
      const originalExtra = item.getField('extra') || '';
      const current = this.getMutationBaseline(item.id, originalExtra);
      if (!current) return false;

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
    capturedAt: number,
    options: { allowDuringShutdown?: boolean } = {}
  ): Promise<boolean> {
    const build = this.buildProgressTransition(input);
    if (!build) return false;

    return this.enqueueMutation(item, async () => {
      const resetAt = this.resetTimestamps.get(item.id);
      if (typeof resetAt === 'number' && resetAt >= capturedAt) return false;
      return this.executeTransition(item, build, options.allowDuringShutdown === true);
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

  public async setStatus(item: any, status: ReadingStatus, at = Date.now()): Promise<boolean> {
    const timestamp = this.normalizeTimestamp(at);
    return this.transition(item, (current) => {
      if (current.s === status) return current;
      const next = mergeFlowData(current, { s: status }, timestamp);
      return normalizeFlowData({
        ...next,
        history: this.recordStatusHistory(current.history, next, timestamp)
      });
    });
  }

  public async initializeStatusIfUnowned(
    item: any,
    status: ReadingStatus,
    at = Date.now()
  ): Promise<boolean> {
    const timestamp = this.normalizeTimestamp(at);
    return this.enqueueMutation(item, async () => {
      if (!await this.prepareMutation(item)) return false;
      const originalExtra = item.getField('extra') || '';
      if (this.getFlowLinesFromExtra(originalExtra).length > 0) return false;
      const initial = normalizeFlowData({ ...DEFAULT_FLOW_DATA, s: status, ts: timestamp });
      return this.persistDataChange(
        item,
        initial,
        originalExtra,
        { skipDateModifiedUpdate: true }
      );
    });
  }

  public async clearManualStatus(item: any): Promise<boolean> {
    return this.enqueueMutation(item, async () => {
      if (!await this.prepareMutation(item)) return false;
      const originalExtra = item.getField('extra') || '';
      const current = this.getMutationBaseline(item.id, originalExtra);
      if (!current) return false;
      if (current.s === null) return false;

      const next = normalizeFlowData({ ...current, s: null });
      if (!this.hasMeaningfulData(next)) {
        return this.removeData(item, originalExtra);
      }
      return this.saveData(item, { ...next, ts: Date.now() }, originalExtra);
    });
  }

  public async resetProgress(item: any, at = Date.now()): Promise<boolean> {
    return this.reset(item, false, at);
  }

  public async restartAsToRead(item: any, at = Date.now()): Promise<boolean> {
    return this.reset(item, true, at);
  }

  private async reset(item: any, markToRead: boolean, at: number): Promise<boolean> {
    const timestamp = this.normalizeTimestamp(at);
    return this.enqueueMutation(item, async () => {
      const saved = await this.executeTransition(item, (current) => {
        const hasResumeState = Object.keys(current.p).length > 0
          || current.lastAttachmentId !== null
          || current.lastPage !== null
          || current.lastReadAt !== null;
        if (!hasResumeState && (!markToRead || current.s === 'to-read')) return current;
        const next = mergeFlowData(current, {
          p: {},
          s: markToRead ? 'to-read' : current.s,
          lastAttachmentId: null,
          lastPage: null,
          lastReadAt: null
        }, timestamp);
        return normalizeFlowData({
          ...next,
          history: this.recordResetHistory(current.history, inferStatus(next), timestamp)
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

  private isClosedOrShuttingDown(allowDuringShutdown = false): boolean {
    const startup = (globalThis as any).Services?.startup;
    return this.closed || (!allowDuringShutdown && Boolean(startup?.shuttingDown));
  }

  private async transition(
    item: any,
    build: (current: FlowData) => FlowData
  ): Promise<boolean> {
    return this.enqueueMutation(item, () => this.executeTransition(item, build));
  }

  private async executeTransition(
    item: any,
    build: (current: FlowData) => FlowData,
    allowDuringShutdown = false
  ): Promise<boolean> {
    if (!await this.prepareMutation(item, allowDuringShutdown)) return false;
    const originalExtra = item.getField('extra') || '';
    const current = this.getMutationBaseline(item.id, originalExtra);
    if (!current) return false;
    const next = build(current);
    if (isFlowDataSame(current, next)) return false;
    return this.saveData(item, next, originalExtra, allowDuringShutdown);
  }

  private async prepareMutation(item: any, allowDuringShutdown = false): Promise<boolean> {
    if (this.isClosedOrShuttingDown(allowDuringShutdown)) {
      Logger.log('ReadingFlow: write skipped during shutdown');
      return false;
    }

    if (!this.isEligibleForMutation(item)) {
      Logger.log(`ReadingFlow: write skipped for ineligible item ${item?.id ?? 'unknown'}`);
      return false;
    }

    if (!await this.waitUntilClean(item, allowDuringShutdown)) {
      Logger.warn('ReadingFlow: Item remained dirty after retries, skipping write to prevent race condition');
      return false;
    }
    return true;
  }

  private async saveData(
    item: any,
    data: FlowData,
    originalExtra: string,
    allowDuringShutdown = false
  ): Promise<boolean> {
    return this.persistDataChange(item, data, originalExtra, undefined, allowDuringShutdown);
  }

  private async removeData(item: any, originalExtra: string): Promise<boolean> {
    return this.persistDataChange(item, null, originalExtra);
  }

  private async persistDataChange(
    item: any,
    data: FlowData | null,
    originalExtra: string,
    saveOptions?: { skipDateModifiedUpdate?: boolean },
    allowDuringShutdown = false
  ): Promise<boolean> {
    let baselineExtra = originalExtra;
    for (let attempt = 0; attempt < DataStore.EXTRA_MERGE_RETRY_COUNT; attempt++) {
      if (this.isClosedOrShuttingDown(allowDuringShutdown)) {
        Logger.log('ReadingFlow: write skipped before saveTx during shutdown');
        return false;
      }

      const attemptedExtra = this.composeExtra(baselineExtra, data);
      item.setField('extra', attemptedExtra);
      try {
        await item.saveTx(saveOptions);
      } catch (error) {
        try {
          if ((item.getField('extra') || '') === attemptedExtra) item.setField('extra', baselineExtra);
        } catch {
          // Best-effort rollback. The cache is still cleared below.
        }
        this.cache.delete(item.id);
        throw error;
      }

      const persistedExtra = item.getField('extra') || '';
      if (persistedExtra === attemptedExtra) {
        this.cache.delete(item.id);
        return true;
      }

      if (!this.areStringArraysEqual(
        this.getFlowLinesFromExtra(persistedExtra),
        this.getFlowLinesFromExtra(baselineExtra)
      )) {
        Logger.warn('ReadingFlow: concurrent Reading Flow metadata change detected; preserving newer data');
        this.cache.delete(item.id);
        return false;
      }
      baselineExtra = persistedExtra;
    }

    Logger.warn('ReadingFlow: Extra kept changing during save; update was skipped');
    this.cache.delete(item.id);
    return false;
  }

  private composeExtra(extra: string, data: FlowData | null): string {
    const lines = extra.split('\n').filter((line: string) => !line.startsWith(FLOW_PREFIX));
    if (data) lines.push(`${FLOW_PREFIX}${JSON.stringify(data)}`);
    return lines.join('\n');
  }

  public hasReadingFlowNamespace(item: any): boolean {
    return this.getFlowLinesFromExtra(item.getField('extra') || '').length > 0;
  }

  private getFlowLinesFromExtra(extra: string): string[] {
    return extra.split('\n').filter((line: string) => line.startsWith(FLOW_PREFIX));
  }

  private areStringArraysEqual(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
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
    const data = this.getLatestSupportedData(extra);
    if (data) return data;
    if (this.getFlowLinesFromExtra(extra).length > 0) {
      Logger.warn(`ReadingFlow: No supported metadata could be read for ${itemId}`);
    }
    return { ...DEFAULT_FLOW_DATA };
  }

  private getMutationBaseline(itemId: number, extra: string): FlowData | null {
    const lines = this.getFlowLinesFromExtra(extra);
    if (lines.length === 0) return { ...DEFAULT_FLOW_DATA };
    if (lines.length !== 1) {
      Logger.warn(`ReadingFlow: ${lines.length} metadata lines found for ${itemId}; preserving them unchanged`);
      return null;
    }

    const parsed = this.parseSupportedLine(lines[0]);
    if (!parsed) {
      Logger.warn(`ReadingFlow: unsupported or malformed metadata found for ${itemId}; preserving it unchanged`);
      return null;
    }
    return parsed;
  }

  private getLatestSupportedData(extra: string): FlowData | null {
    let latest: FlowData | null = null;
    for (const line of this.getFlowLinesFromExtra(extra)) {
      const parsed = this.parseSupportedLine(line);
      if (parsed && (!latest || parsed.ts >= latest.ts)) latest = parsed;
    }
    return latest;
  }

  private parseSupportedLine(line: string): FlowData | null {
    try {
      const parsed = JSON.parse(line.substring(FLOW_PREFIX.length));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      if (parsed.v !== 1 && parsed.v !== 2) return null;
      return normalizeFlowData(parsed);
    } catch {
      return null;
    }
  }

  private isEligibleForMutation(item: any): boolean {
    if (!item || typeof item.id !== 'number') return false;
    if (typeof item.isEditable === 'function' && item.isEditable() === false) return false;
    if (typeof item.isEditable === 'boolean' && item.isEditable === false) return false;
    if (item.deleted === true || item._deleted === true) return false;
    if (typeof item.isDeleted === 'function' && item.isDeleted()) return false;
    if (typeof item.isInTrash === 'function' && item.isInTrash()) return false;
    if (typeof item.parentID === 'number' && item.parentID > 0) return false;
    if (typeof item.isRegularItem === 'function' && item.isRegularItem() === false) return false;
    return true;
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
    const measuredProgress = getNormalizedDisplayProgress(next);
    if (measuredProgress !== null
      && measuredProgress >= READ_PROGRESS_THRESHOLD
      && history.completedAt === null) {
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
    history.days[dayKey] = day;
    return pruneReadingHistory(history, at);
  }

  private recordResetHistory(
    current: ReadingHistory | undefined,
    status: ReadingStatus | null,
    at: number
  ): ReadingHistory {
    const history = this.cloneOrCreateHistory(current, at);
    const dayKey = getLocalDayKey(at);
    const day = this.cloneOrCreateDay(history.days[dayKey]);
    day.status = status;
    day.reset = true;
    history.days[dayKey] = day;
    return pruneReadingHistory(history, at);
  }

  private hasMeaningfulData(data: FlowData): boolean {
    if (data.s !== null || data.c !== null || Object.keys(data.p).length > 0) return true;
    if (data.lastAttachmentId !== null || data.lastPage !== null || data.lastReadAt !== null) return true;
    if (!data.history) return false;
    if (data.history.completedAt !== null || data.history.activeDaysTotal > 0) return true;
    return Object.values(data.history.days).some((day) =>
      day.activity || day.completed || Object.keys(day.progress).length > 0
    );
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

  private async waitUntilClean(item: any, allowDuringShutdown = false): Promise<boolean> {
    if (typeof item.isDirty !== 'function') return true;

    for (let attempt = 0; attempt < DataStore.DIRTY_RETRY_COUNT; attempt++) {
      if (!item.isDirty()) return true;
      if (this.isClosedOrShuttingDown(allowDuringShutdown)) return false;
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
  const normalizedPageCount = typeof pageCount === 'number' && Number.isFinite(pageCount) && pageCount > 0
    ? pageCount
    : null;
  return normalizeProgressValue(value, normalizedPageCount);
}
