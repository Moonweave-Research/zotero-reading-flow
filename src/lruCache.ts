export class LRUCache<K, V> {
  private max: number;
  private cache: Map<K, V>;

  constructor(max = 1000) {
    this.max = max;
    this.cache = new Map();
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    const val = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, val);
    return val;
  }

  set(key: K, val: V) {
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size === this.max) {
      // @ts-ignore
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, val);
  }

  delete(key: K) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}
