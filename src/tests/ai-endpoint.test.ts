import { describe, it, expect } from 'vitest';
import {
  normalizeBaseEndpoint,
  normalizeChatEndpoint,
  normalizeModelsEndpoint,
  normalizeProxyChatEndpoint,
} from '@/lib/ai-endpoint';

describe('normalizeBaseEndpoint', () => {
  it('四种等价写法折叠为同一基础地址', () => {
    expect(normalizeBaseEndpoint('https://host/v1')).toBe('https://host/v1');
    expect(normalizeBaseEndpoint('https://host/v1/')).toBe('https://host/v1');
    expect(normalizeBaseEndpoint('https://host/v1/chat/completions')).toBe('https://host/v1');
    expect(normalizeBaseEndpoint('https://host/v1/chat/completions/')).toBe('https://host/v1');
  });

  it('剥离 /models 与末尾多余斜杠', () => {
    expect(normalizeBaseEndpoint('https://host/v1/models')).toBe('https://host/v1');
    expect(normalizeBaseEndpoint('https://host/v1///')).toBe('https://host/v1');
  });

  it('后缀匹配不区分大小写', () => {
    expect(normalizeBaseEndpoint('https://host/v1/Chat/Completions')).toBe('https://host/v1');
    expect(normalizeBaseEndpoint('https://host/v1/MODELS')).toBe('https://host/v1');
  });

  it('不自动补 /v1', () => {
    expect(normalizeBaseEndpoint('https://host')).toBe('https://host');
  });

  it('空值返回空串', () => {
    expect(normalizeBaseEndpoint('')).toBe('');
    expect(normalizeBaseEndpoint('   ')).toBe('');
    expect(normalizeBaseEndpoint(undefined)).toBe('');
    expect(normalizeBaseEndpoint(null)).toBe('');
  });
});

describe('normalizeChatEndpoint', () => {
  it('拼出完整的 chat/completions 地址', () => {
    expect(normalizeChatEndpoint('https://host/v1')).toBe('https://host/v1/chat/completions');
    expect(normalizeChatEndpoint('https://host/v1/')).toBe('https://host/v1/chat/completions');
  });

  it('幂等', () => {
    const once = normalizeChatEndpoint('https://host/v1');
    expect(normalizeChatEndpoint(once)).toBe(once);
    expect(normalizeChatEndpoint(normalizeChatEndpoint(once))).toBe(once);
  });

  it('空值返回空串（调用方据此判定未配置）', () => {
    expect(normalizeChatEndpoint('')).toBe('');
    expect(normalizeChatEndpoint(null)).toBe('');
  });
});

describe('normalizeModelsEndpoint', () => {
  it('拼出 /models 地址', () => {
    expect(normalizeModelsEndpoint('https://host/v1')).toBe('https://host/v1/models');
    expect(normalizeModelsEndpoint('https://host/v1/models/')).toBe('https://host/v1/models');
  });

  it('空值返回空串', () => {
    expect(normalizeModelsEndpoint('')).toBe('');
    expect(normalizeModelsEndpoint(undefined)).toBe('');
  });
});

describe('normalizeProxyChatEndpoint', () => {
  it('根地址 / /v1 / 完整 chat 路径都折叠到同一代理路由', () => {
    const expected = 'https://p.example.com/v1/chat/completions';
    expect(normalizeProxyChatEndpoint('https://p.example.com')).toBe(expected);
    expect(normalizeProxyChatEndpoint('https://p.example.com/v1')).toBe(expected);
    expect(normalizeProxyChatEndpoint('https://p.example.com/v1/')).toBe(expected);
    expect(normalizeProxyChatEndpoint('https://p.example.com/v1/chat/completions')).toBe(expected);
    expect(normalizeProxyChatEndpoint('https://p.example.com/v1/chat/completions/')).toBe(expected);
  });

  it('保留用户自填的子路径，只在其后追加代理路由', () => {
    expect(normalizeProxyChatEndpoint('https://p.example.com/api')).toBe(
      'https://p.example.com/api/v1/chat/completions',
    );
    expect(normalizeProxyChatEndpoint('https://p.example.com/api/v1')).toBe(
      'https://p.example.com/api/v1/chat/completions',
    );
  });

  it('主机名恰好为 v1 时不会剥掉协议头', () => {
    expect(normalizeProxyChatEndpoint('https://v1')).toBe('https://v1/v1/chat/completions');
    expect(normalizeProxyChatEndpoint('https://v1/')).toBe('https://v1/v1/chat/completions');
  });

  it('幂等', () => {
    const once = normalizeProxyChatEndpoint('https://p.example.com/v1');
    expect(normalizeProxyChatEndpoint(once)).toBe(once);
  });

  it('未配置返回空串（调用方据此回落到内置代理或直连）', () => {
    expect(normalizeProxyChatEndpoint('')).toBe('');
    expect(normalizeProxyChatEndpoint('   ')).toBe('');
    expect(normalizeProxyChatEndpoint(undefined)).toBe('');
    expect(normalizeProxyChatEndpoint(null)).toBe('');
  });

  it('内置代理归一化结果与历史硬编码保持一致', () => {
    expect(normalizeProxyChatEndpoint('https://llm.callact.xyz')).toBe(
      'https://llm.callact.xyz/v1/chat/completions',
    );
  });
});
