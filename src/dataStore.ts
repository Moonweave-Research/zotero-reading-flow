import { LRUCache } from './lruCache';
import { Logger } from './Logger';
import {
  DEFAULT_FLOW_DATA,
  FLOW_PREFIX,
  FlowData,
  isFlowDataSame,
  mergeFlowData,
  normalizeFlowData,
  ReadingPriority,
  ReadingStatus
} from './flowData';

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

    const extra = item.getField('extra') || '';
    const match = extra.split('\n').find((line: string) => line.startsWith(FLOW_PREFIX));
    
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

    const originalExtra = item.getField('extra') || '';
    const lines = originalExtra.split('\n').filter((line: string) => !line.startsWith(FLOW_PREFIX));
    lines.push(`${FLOW_PREFIX}${JSON.stringify(merged)}`);

    if (this.isClosedOrShuttingDown()) {
      Logger.log('ReadingFlow: write skipped before saveTx during shutdown');
      return false;
    }
    
    item.setField('extra', lines.join('\n'));
    try {
      await item.saveTx();
      this.cache.set(item.id, merged);
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

  public async setStatus(item: any, status: ReadingStatus | null) {
    const updates: Partial<FlowData> = { s: status };
    if (status === 'to-read' || status === 'reading' || status === 'read' || status === 'skimmed') {
      updates.priority = null;
    }
    await this.updateData(item, updates);
  }

  public async setPriority(item: any, priority: ReadingPriority | null) {
    const updates: Partial<FlowData> = { priority };
    const current = this.getData(item);
    const isUntouchedManualReading =
      current.s === 'reading'
      && Object.keys(current.p).length === 0
      && !current.lastPage
      && !current.lastReadAt;
    if (priority && (current.s === 'read' || current.s === 'skimmed' || isUntouchedManualReading)) {
      updates.s = 'to-read';
    }
    await this.updateData(item, updates);
  }

  public async setNormalPriority(item: any) {
    await this.updateData(item, { priority: null, s: 'to-read' });
  }

  public async resetProgress(item: any) {
    this.resetTimestamps.set(item.id, Date.now());
    await this.updateData(item, {
      p: {},
      s: 'to-read',
      lastAttachmentId: null,
      lastPage: null,
      lastReadAt: null
    });
  }

  public clearCache(itemId: number) {
    this.cache.delete(itemId);
    this.resetTimestamps.delete(itemId);
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
