


const PREFIX = 'pc:';
const DEFAULT_TTL = 5 * 60 * 1000;
const MAX_ENTRIES = 200;
const EVICT_RATIO = 0.5; 

interface StoredEntry<T> {
  data: T;
  ts: number;
  ttl: number;
}

function isStorageAvailable(): boolean {
  try {
    const k = '__pc_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

class PageCache {
  private readonly available = isStorageAvailable();

  get<T>(key: string): T | null {
    if (!this.available) return null;
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const entry = JSON.parse(raw) as StoredEntry<T>;
      if (Date.now() - entry.ts > entry.ttl) {
        localStorage.removeItem(PREFIX + key);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  
  getStale<T>(key: string): { data: T; age: number; expired: boolean } | null {
    if (!this.available) return null;
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const entry = JSON.parse(raw) as StoredEntry<T>;
      const age = Date.now() - entry.ts;
      return { data: entry.data, age, expired: age > entry.ttl };
    } catch {
      return null;
    }
  }

  set<T>(key: string, data: T, ttl = DEFAULT_TTL): void {
    if (!this.available) return;
    const payload = JSON.stringify({ data, ts: Date.now(), ttl });
    try {
      localStorage.setItem(PREFIX + key, payload);
    } catch {
      
      this.evict(true);
      try {
        localStorage.setItem(PREFIX + key, payload);
      } catch {
        // 彻底放弃，不抛错，让页面走网络
      }
    }
    this.evict(false);
  }

  delete(key: string): void {
    if (!this.available) return;
    try {
      localStorage.removeItem(PREFIX + key);
    } catch { /* ignore */ }
  }

  invalidate(prefix: string): void {
    if (!this.available) return;
    for (const k of this.keys()) {
      if (k.startsWith(prefix)) {
        try { localStorage.removeItem(PREFIX + k); } catch { /* ignore */ }
      }
    }
  }

  clear(): void {
    if (!this.available) return;
    for (const k of this.keys()) {
      try { localStorage.removeItem(PREFIX + k); } catch { /* ignore */ }
    }
  }

  keys(): string[] {
    if (!this.available) return [];
    const out: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
      }
    } catch { /* ignore */ }
    return out;
  }

  
  private evict(aggressive: boolean): void {
    if (!this.available) return;
    try {
      const all = this.keys();
      if (!aggressive && all.length <= MAX_ENTRIES) return;
      const items: Array<{ k: string; ts: number }> = [];
      for (const k of all) {
        try {
          const raw = localStorage.getItem(PREFIX + k);
          const e = raw ? (JSON.parse(raw) as StoredEntry<unknown>) : null;
          items.push({ k, ts: e?.ts ?? 0 });
        } catch {
          items.push({ k, ts: 0 });
        }
      }
      items.sort((a, b) => a.ts - b.ts);
      const target = aggressive
        ? Math.ceil(all.length * EVICT_RATIO)
        : all.length - MAX_ENTRIES;
      for (let i = 0; i < target && i < items.length; i++) {
        try { localStorage.removeItem(PREFIX + items[i].k); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }
}

export const pageCache = new PageCache();
