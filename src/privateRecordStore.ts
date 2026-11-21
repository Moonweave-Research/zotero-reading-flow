import { Logger } from './Logger';

/** Group records belong to this Zotero profile, never to the shared item. */
export class PrivateRecordStore {
  private records: Record<string, string> = {};
  private path?: string;
  private ready = false;
  private queue: Promise<void> = Promise.resolve();

  async initialize(): Promise<void> {
    try {
      const { IOUtils, PathUtils } = globalThis as any;
      this.path = PathUtils.join(PathUtils.profileDir, 'reading-flow-private.json');
      if (await IOUtils.exists(this.path)) {
        const parsed = JSON.parse(await IOUtils.readUTF8(this.path));
        if (parsed?.v !== 1 || !parsed.records || typeof parsed.records !== 'object'
          || Array.isArray(parsed.records) || Object.values(parsed.records).some(value => typeof value !== 'string')) {
          throw new Error('Unsupported private Reading Flow storage');
        }
        this.records = parsed.records;
      }
      this.ready = true;
    } catch (error) {
      Logger.error('Private Reading Flow records could not be loaded; preserving storage unchanged', error);
    }
  }

  get available(): boolean { return this.ready; }
  get(key: string): string { return this.records[key] ?? ''; }

  async set(key: string, value: string, isCurrent: () => boolean): Promise<boolean> {
    const operation = this.queue.then(async () => {
      if (!this.ready || !this.path) throw new Error('Private Reading Flow storage is unavailable');
      if (!isCurrent()) return false;
      const next = { ...this.records };
      if (value) next[key] = value; else delete next[key];
      await (globalThis as any).IOUtils.writeUTF8(this.path, JSON.stringify({ v: 1, records: next }), {
        tmpPath: this.path + '.tmp', flush: true
      });
      this.records = next;
      return true;
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async flush(): Promise<void> { await this.queue; }
}
