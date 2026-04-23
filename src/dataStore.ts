import { LRUCache } from './lruCache';
import { Logger } from './Logger';
import {
  DEFAULT_FLOW_DATA,
  FLOW_PREFIX,
  FlowData,
  isFlowDataSame,
  mergeFlowData,
  normalizeFlowData,
  ReadingStatus
} from './flowData';

export class DataStore {
  private cache = new LRUCache<number, FlowData>(2000);
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

  public async updateData(item: any, updates: Partial<FlowData>) {
    if (this.isClosedOrShuttingDown()) {
      Logger.log('ReadingFlow: write skipped during shutdown');
      return;
    }

    if (typeof item.isDirty === 'function' && item.isDirty()) {
      Logger.warn('ReadingFlow: Item dirty, skipping write to prevent race condition');
      return;
    }

    const current = this.getData(item);
    
    // Last write wins check
    if (updates.ts && updates.ts < current.ts) return;

    const nextWithoutTimestamp = mergeFlowData(current, updates, current.ts);
    if (isFlowDataSame(current, nextWithoutTimestamp)) return;

    const merged = mergeFlowData(current, updates);

    this.cache.set(item.id, merged);

    let extra = item.getField('extra') || '';
    const lines = extra.split('\n').filter((line: string) => !line.startsWith(FLOW_PREFIX));
    lines.push(`${FLOW_PREFIX}${JSON.stringify(merged)}`);

    if (this.isClosedOrShuttingDown()) {
      Logger.log('ReadingFlow: write skipped before saveTx during shutdown');
      return;
    }
    
    item.setField('extra', lines.join('\n'));
    await item.saveTx();
  }

  public async setStatus(item: any, status: ReadingStatus | null) {
    await this.updateData(item, { s: status });
  }

  public async resetProgress(item: any) {
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
  }

  public close() {
    this.closed = true;
    this.cache.clear();
  }

  private isClosedOrShuttingDown(): boolean {
    const startup = (globalThis as any).Services?.startup;
    return this.closed || Boolean(startup?.shuttingDown);
  }
}
