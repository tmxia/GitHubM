import { describe, it, expect } from 'vitest';
import {
  normalizeBaseEndpoint,
  normalizeChatEndpoint,
  normalizeModelsEndpoint,
  normalizeProxyChatEndpoint,
} from '@/lib/ai-endpoint';

describe('normalizeBaseEndpoint', () => {
  it('折叠四种常见写法到同一基础地址', () => {
    const expected = 'https://host/v1';
    expect(normalizeBaseEndpoint('https://host/v1')).toBe(expected);
    expect(normalizeBaseEndpoint('https://host/v1/')).toBe(expected);
    expect(normalizeBaseEndpoint('https://host/v1/chat/completions')).toBe(expected);
    expect(normalizeBaseEndpoint('https://host/v1/chat/completions/')).toBe(expected);
    expect(normalizeBaseEndpoint('https://host/v1/models')).toBe(expected);
  });

  it('大小写不敏感地剥离后缀，但保留用户填写的大小写', () => {
    expect(normalizeBaseEndpoint('https://Host/V1/CHAT/COMPLETIONS')).toBe('https://Host/V1');
  });

  it('不自动补 /v1', () => {
    expect(normalizeBaseEndpoint('https://host')).toBe('https://host');
  });

  it('空值与纯空白返回空串', () => {
    expect(normalizeBaseEndpoint('')).toBe('');
    expect(normalizeBaseEndpoint('   ')).toBe('');
    expect(normalizeBaseEndpoint(undefined)).toBe('');
    expect(normalizeBaseEndpoint(null)).toBe('');
  });
});

describe('normalizeChatEndpoint', () => {
  it('补全 /chat/completions', () => {
    expect(normalizeChatEndpoint('https://host/v1')).toBe('https://host/v1/chat/completions');
  });

  it('幂等', () => {
    const once = normalizeChatEndpoint('https://host/v1');
    expect(normalizeChatEndpoint(once)).toBe(once);
    expect(normalizeChatEndpoint('https://host/v1/chat/completions/')).toBe(once);
  });

  it('空值返回空串', () => {
    expect(normalizeChatEndpoint('')).toBe('');
  });
});

describe('normalizeModelsEndpoint', () => {
  it('补全 /models', () => {
    expect(normalizeModelsEndpoint('https://host/v1')).toBe('https://host/v1/models');
    expect(normalizeModelsEndpoint('https://host/v1/chat/completions')).toBe('https://host/v1/models');
  });

  it('空值返回空串', () => {
    expect(normalizeModelsEndpoint('')).toBe('');
  });
});

describe('normalizeProxyChatEndpoint', () => {
  const expected = 'https://proxy.example.com/v1/chat/completions';

  it('根地址、尾斜杠、/v1、完整地址都折叠为同一结果', () => {
    expect(normalizeProxyChatEndpoint('https://proxy.example.com')).toBe(expected);
    expect(normalizeProxyChatEndpoint('https://proxy.example.com/')).toBe(expected);
    expect(normalizeProxyChatEndpoint('https://proxy.example.com/v1')).toBe(expected);
    expect(normalizeProxyChatEndpoint('https://proxy.example.com/v1/')).toBe(expected);
    expect(normalizeProxyChatEndpoint('https://proxy.example.com/v1/chat/completions')).toBe(expected);
    expect(normalizeProxyChatEndpoint('https://proxy.example.com/v1/chat/completions/')).toBe(expected);
  });

  it('保留代理路径前缀', () => {
    expect(normalizeProxyChatEndpoint('https://proxy.example.com/openai/v1')).toBe(
      'https://proxy.example.com/openai/v1/chat/completions',
    );
  });

  it('大小写不敏感地识别 /V1', () => {
    expect(normalizeProxyChatEndpoint('https://proxy.example.com/V1')).toBe(expected);
  });

  it('幂等', () => {
    const once = normalizeProxyChatEndpoint('https://proxy.example.com');
    expect(normalizeProxyChatEndpoint(once)).toBe(once);
  });

  it('空值与纯空白返回空串（调用方据此跳过代理）', () => {
    expect(normalizeProxyChatEndpoint('')).toBe('');
    expect(normalizeProxyChatEndpoint('  ')).toBe('');
    expect(normalizeProxyChatEndpoint(undefined)).toBe('');
    expect(normalizeProxyChatEndpoint(null)).toBe('');
  });

  it('主机名恰为 v1 时不破坏协议头', () => {
    expect(normalizeProxyChatEndpoint('https://v1')).toBe('https://v1/v1/chat/completions');
  });

  it('内置代理常量归一化结果与原硬编码一致', () => {
    expect(normalizeProxyChatEndpoint('https://llm.callact.xyz')).toBe(
      'https://llm.callact.xyz/v1/chat/completions',
    );
  });
});
