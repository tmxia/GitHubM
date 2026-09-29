import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOrCreateInFlight } from '@/services/github';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getOrCreateInFlight — in-flight 请求合并', () => {
  describe('基础合并行为', () => {
    it('相同 key 并发调用只执行一次 factory', async () => {
      const factory = vi.fn().mockResolvedValue('data');
      const key = 'test-key-1';

      const [r1, r2, r3] = await Promise.all([
        getOrCreateInFlight(key, factory),
        getOrCreateInFlight(key, factory),
        getOrCreateInFlight(key, factory),
      ]);

      expect(factory).toHaveBeenCalledTimes(1);
      expect(r1).toBe('data');
      expect(r2).toBe('data');
      expect(r3).toBe('data');
    });

    it('不同 key 各自独立调用 factory', async () => {
      const factory1 = vi.fn().mockResolvedValue('data-1');
      const factory2 = vi.fn().mockResolvedValue('data-2');

      const [r1, r2] = await Promise.all([
        getOrCreateInFlight('key-a', factory1),
        getOrCreateInFlight('key-b', factory2),
      ]);

      expect(factory1).toHaveBeenCalledTimes(1);
      expect(factory2).toHaveBeenCalledTimes(1);
      expect(r1).toBe('data-1');
      expect(r2).toBe('data-2');
    });
  });

  describe('完成后 in-flight 记录清除', () => {
    it('请求完成后相同 key 可重新发起（factory 再次被调用）', async () => {
      const factory = vi.fn()
        .mockResolvedValueOnce('first')
        .mockResolvedValueOnce('second');
      const key = 'test-key-seq';

      const r1 = await getOrCreateInFlight(key, factory);
      const r2 = await getOrCreateInFlight(key, factory);

      expect(factory).toHaveBeenCalledTimes(2);
      expect(r1).toBe('first');
      expect(r2).toBe('second');
    });

    it('第一次完成后，新的并发请求再次合并为一次 factory 调用', async () => {
      const factory = vi.fn()
        .mockResolvedValueOnce('round-1')
        .mockResolvedValueOnce('round-2');
      const key = 'test-key-rounds';

      await getOrCreateInFlight(key, factory);
      expect(factory).toHaveBeenCalledTimes(1);

      const [r1, r2] = await Promise.all([
        getOrCreateInFlight(key, factory),
        getOrCreateInFlight(key, factory),
      ]);
      expect(factory).toHaveBeenCalledTimes(2);
      expect(r1).toBe('round-2');
      expect(r2).toBe('round-2');
    });
  });

  describe('失败场景', () => {
    it('请求失败时 in-flight 记录清除，后续可重试', async () => {
      const err = new Error('网络错误');
      const factory = vi.fn()
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce('ok');

      const key = 'test-key-fail';

      await expect(getOrCreateInFlight(key, factory)).rejects.toThrow('网络错误');

      const result = await getOrCreateInFlight(key, factory);
      expect(result).toBe('ok');
      expect(factory).toHaveBeenCalledTimes(2);
    });

    it('并发请求中 factory 失败时，所有请求均收到同一错误', async () => {
      const err = new Error('统一失败');
      const factory = vi.fn().mockRejectedValue(err);
      const key = 'test-key-concurrent-fail';

      const results = await Promise.allSettled([
        getOrCreateInFlight(key, factory),
        getOrCreateInFlight(key, factory),
        getOrCreateInFlight(key, factory),
      ]);

      expect(factory).toHaveBeenCalledTimes(1);
      results.forEach(r => {
        expect(r.status).toBe('rejected');
        expect((r as PromiseRejectedResult).reason.message).toBe('统一失败');
      });
    });
  });

  describe('类型安全', () => {
    it('支持泛型，返回值类型与 factory 一致', async () => {
      interface User { id: number; name: string }
      const user: User = { id: 1, name: '测试用户' };
      const factory = vi.fn().mockResolvedValue(user);

      const result = await getOrCreateInFlight<User>('user-key', factory);
      expect(result.id).toBe(1);
      expect(result.name).toBe('测试用户');
    });
  });
});
