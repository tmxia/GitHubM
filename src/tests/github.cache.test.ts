import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  buildCacheKey,
  getCached,
  setCached,
  invalidateCache,
  clearApiCache,
  setToken,
  getToken,
} from '@/services/github';

describe('GitHub API 缓存层', () => {
  beforeEach(() => {
    clearApiCache();
    setToken(null);
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('buildCacheKey', () => {
    it('无 token 时 key 包含空字符串前缀', () => {
      setToken(null);
      const key = buildCacheKey('https://api.github.com/user');
      expect(key).toBe('|https://api.github.com/user');
    });

    it('有 token 时 key 包含 token 前缀', () => {
      setToken('ghp_testtoken123');
      const key = buildCacheKey('https://api.github.com/user');
      expect(key).toBe('ghp_testtoken123|https://api.github.com/user');
    });

    it('相同 URL + 相同 token 生成相同 key', () => {
      setToken('token-a');
      const key1 = buildCacheKey('https://api.github.com/repos');
      const key2 = buildCacheKey('https://api.github.com/repos');
      expect(key1).toBe(key2);
    });

    it('相同 URL + 不同 token 生成不同 key（防跨用户缓存污染）', () => {
      setToken('token-user1');
      const key1 = buildCacheKey('https://api.github.com/user');
      setToken('token-user2');
      const key2 = buildCacheKey('https://api.github.com/user');
      expect(key1).not.toBe(key2);
    });
  });

  describe('getCached / setCached', () => {
    it('未写入时返回 null', () => {
      expect(getCached('nonexistent-key')).toBeNull();
    });

    it('写入后立即读取命中', () => {
      setCached('test-key', { name: 'octocat' });
      expect(getCached('test-key')).toEqual({ name: 'octocat' });
    });

    it('写入数组后读取命中', () => {
      const repos = [{ id: 1, name: 'repo1' }, { id: 2, name: 'repo2' }];
      setCached('repos-key', repos);
      expect(getCached('repos-key')).toEqual(repos);
    });

    it('过期后自动失效返回 null', () => {
      vi.useFakeTimers();
      setCached('expire-key', 'value');
      vi.advanceTimersByTime(31_000);
      expect(getCached('expire-key')).toBeNull();
    });

    it('TTL 内不失效', () => {
      vi.useFakeTimers();
      setCached('valid-key', 'still-valid');
      vi.advanceTimersByTime(29_000);
      expect(getCached('valid-key')).toBe('still-valid');
    });

    it('写入后可用新值覆盖同一 key', () => {
      setCached('update-key', 'v1');
      setCached('update-key', 'v2');
      expect(getCached('update-key')).toBe('v2');
    });

    it('不同 key 互不干扰', () => {
      setCached('key-a', 'value-a');
      setCached('key-b', 'value-b');
      expect(getCached('key-a')).toBe('value-a');
      expect(getCached('key-b')).toBe('value-b');
    });
  });

  describe('invalidateCache', () => {
    it('失效匹配前缀的所有 key', () => {
      setCached('|https://api.github.com/repos/owner/repo', { id: 1 });
      setCached('|https://api.github.com/repos/owner/repo/issues', []);
      invalidateCache('https://api.github.com/repos/owner/repo');
      expect(getCached('|https://api.github.com/repos/owner/repo')).toBeNull();
      expect(getCached('|https://api.github.com/repos/owner/repo/issues')).toBeNull();
    });

    it('不匹配前缀的 key 不受影响', () => {
      setCached('|https://api.github.com/user', { login: 'octocat' });
      setCached('|https://api.github.com/repos/owner/repo', { id: 1 });
      invalidateCache('https://api.github.com/repos/owner/repo');
      expect(getCached('|https://api.github.com/user')).toEqual({ login: 'octocat' });
    });

    it('失效不存在的前缀不报错', () => {
      expect(() => invalidateCache('nonexistent-prefix')).not.toThrow();
    });
  });

  describe('clearApiCache', () => {
    it('清空后所有 key 均返回 null', () => {
      setCached('key-1', 'v1');
      setCached('key-2', 'v2');
      setCached('key-3', 'v3');
      clearApiCache();
      expect(getCached('key-1')).toBeNull();
      expect(getCached('key-2')).toBeNull();
      expect(getCached('key-3')).toBeNull();
    });

    it('清空后仍可正常写入新缓存', () => {
      setCached('old-key', 'old');
      clearApiCache();
      setCached('new-key', 'new');
      expect(getCached('new-key')).toBe('new');
    });
  });

  describe('setToken 缓存联动', () => {
    it('token 变更时自动清空全部缓存', () => {
      setToken('old-token');
      setCached('|https://api.github.com/user', { login: 'user1' });
      setToken('new-token');
      expect(getCached('|https://api.github.com/user')).toBeNull();
    });

    it('null → 有效 token 也触发缓存清空', () => {
      setToken(null);
      setCached('|https://api.github.com/user', { login: 'user1' });
      setToken('new-token');
      expect(getCached('|https://api.github.com/user')).toBeNull();
    });

    it('token 不变时不清空缓存', () => {
      setToken('stable-token');
      setCached('|https://api.github.com/user', { login: 'octocat' });
      setToken('stable-token');
      expect(getCached('|https://api.github.com/user')).toEqual({ login: 'octocat' });
    });

    it('setToken 后 getToken 返回新值', () => {
      setToken('ghp_abc123');
      expect(getToken()).toBe('ghp_abc123');
    });

    it('setToken(null) 后 getToken 返回 null', () => {
      setToken('ghp_abc123');
      setToken(null);
      expect(getToken()).toBeNull();
    });
  });
});
