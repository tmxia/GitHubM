import { describe, it, expect } from 'vitest';
import {
  normalizeBaseEndpoint,
  normalizeChatEndpoint,
  normalizeModelsEndpoint,
} from '@/lib/ai-endpoint';
import { normalizeProxyChatEndpoint } from '@/lib/ai-proxy-endpoint';

describe('normalizeBaseEndpoint', () => {
  it('空值统一折叠为空字符串', () => {
    expect(normalizeBaseEndpoint()).toBe('');
    expect(normalizeBaseEndpoint(null)).toBe('');
    expect(normalizeBaseEndpoint('')).toBe('');
    expect(normalizeBaseEndpoint('   ')).toBe('');
  });

  it('去掉末尾斜杠', () => {
    expect(normalizeBaseEndpoint('https://h/v1/')).toBe('https://h/v1');
    expect(normalizeBaseEndpoint('https://h/v1///')).toBe('https://h/v1');
  });

  it('剥离 /chat/completions 后缀', () => {
    expect(normalizeBaseEndpoint('https://h/v1/chat/completions')).toBe('https://h/v1');
    expect(normalizeBaseEndpoint('https://h/v1/chat/completions/')).toBe('https://h/v1');
  });

  it('剥离 /models 后缀', () => {
    expect(normalizeBaseEndpoint('https://h/v1/models')).toBe('https://h/v1');
    expect(normalizeBaseEndpoint('https://h/v1/models/')).toBe('https://h/v1');
  });

  it('后缀匹配大小写不敏感', () => {
    expect(normalizeBaseEndpoint('https://h/v1/CHAT/COMPLETIONS')).toBe('https://h/v1');
    expect(normalizeBaseEndpoint('https://h/v1/Models')).toBe('https://h/v1');
  });

  it('叠加后缀循环剥离', () => {
    expect(normalizeBaseEndpoint('https://h/v1/chat/completions/models')).toBe('https://h/v1');
  });

  it('去掉首尾空白', () => {
    expect(normalizeBaseEndpoint('  https://h/v1/chat/completions  ')).toBe('https://h/v1');
  });

  it('不自动补 /v1，不改写主机与端口', () => {
    expect(normalizeBaseEndpoint('https://h')).toBe('https://h');
    expect(normalizeBaseEndpoint('http://127.0.0.1:17890')).toBe('http://127.0.0.1:17890');
  });
});

describe('normalizeChatEndpoint', () => {
  it('基础地址补齐 /chat/completions', () => {
    expect(normalizeChatEndpoint('https://h/v1')).toBe('https://h/v1/chat/completions');
    expect(normalizeChatEndpoint('https://h/v1/')).toBe('https://h/v1/chat/completions');
  });

  it('已填完整地址时保持幂等', () => {
    const once = normalizeChatEndpoint('https://h/v1/chat/completions/');
    expect(once).toBe('https://h/v1/chat/completions');
    expect(normalizeChatEndpoint(once)).toBe(once);
  });

  it('空值返回空字符串', () => {
    expect(normalizeChatEndpoint('')).toBe('');
    expect(normalizeChatEndpoint(null)).toBe('');
  });
});

describe('normalizeModelsEndpoint', () => {
  it('基础地址补齐 /models', () => {
    expect(normalizeModelsEndpoint('https://h/v1')).toBe('https://h/v1/models');
    expect(normalizeModelsEndpoint('https://h/v1/')).toBe('https://h/v1/models');
  });

  it('已是 /models 地址时保持幂等', () => {
    const once = normalizeModelsEndpoint('https://h/v1/models/');
    expect(once).toBe('https://h/v1/models');
    expect(normalizeModelsEndpoint(once)).toBe(once);
  });

  it('由 chat 完整地址推导 models 地址', () => {
    expect(normalizeModelsEndpoint('https://h/v1/chat/completions')).toBe('https://h/v1/models');
  });

  it('空值返回空字符串', () => {
    expect(normalizeModelsEndpoint('')).toBe('');
    expect(normalizeModelsEndpoint(null)).toBe('');
  });
});

describe('normalizeProxyChatEndpoint', () => {
  it('空值返回空字符串', () => {
    expect(normalizeProxyChatEndpoint()).toBe('');
    expect(normalizeProxyChatEndpoint(null)).toBe('');
    expect(normalizeProxyChatEndpoint('')).toBe('');
    expect(normalizeProxyChatEndpoint('   ')).toBe('');
  });

  it('只写主机时补默认 /v1（保持历史行为）', () => {
    expect(normalizeProxyChatEndpoint('https://llm.callact.xyz')).toBe(
      'https://llm.callact.xyz/v1/chat/completions',
    );
    expect(normalizeProxyChatEndpoint('https://llm.callact.xyz/')).toBe(
      'https://llm.callact.xyz/v1/chat/completions',
    );
  });

  it('已带 /v1 时不重复拼接', () => {
    expect(normalizeProxyChatEndpoint('https://llm.callact.xyz/v1')).toBe(
      'https://llm.callact.xyz/v1/chat/completions',
    );
    expect(normalizeProxyChatEndpoint('https://llm.callact.xyz/v1/')).toBe(
      'https://llm.callact.xyz/v1/chat/completions',
    );
  });

  it('已填完整 chat 地址时不重复拼接', () => {
    expect(normalizeProxyChatEndpoint('https://host/v1/chat/completions')).toBe(
      'https://host/v1/chat/completions',
    );
    expect(normalizeProxyChatEndpoint('https://host/v1/chat/completions/')).toBe(
      'https://host/v1/chat/completions',
    );
  });

  it('识别各家带版本段的路径', () => {
    expect(normalizeProxyChatEndpoint('https://host/compatible-mode/v1')).toBe(
      'https://host/compatible-mode/v1/chat/completions',
    );
    expect(normalizeProxyChatEndpoint('https://generativelanguage.googleapis.com/v1beta/openai')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    );
    expect(normalizeProxyChatEndpoint('https://host/api/v2')).toBe(
      'https://host/api/v2/chat/completions',
    );
  });

  it('普通路径仍补 /v1', () => {
    expect(normalizeProxyChatEndpoint('https://host/proxy')).toBe(
      'https://host/proxy/v1/chat/completions',
    );
  });

  it('主机名恰好是 v2 时不被误判为版本路径', () => {
    expect(normalizeProxyChatEndpoint('http://v2')).toBe('http://v2/v1/chat/completions');
  });

  it('幂等：重复归一化结果不变', () => {
    for (const input of [
      'https://llm.callact.xyz',
      'https://llm.callact.xyz/v1',
      'https://host/v1/chat/completions/',
      'https://host/proxy',
      'http://127.0.0.1:17890/v1',
    ]) {
      const once = normalizeProxyChatEndpoint(input);
      expect(normalizeProxyChatEndpoint(once)).toBe(once);
      expect(once.endsWith('/chat/completions')).toBe(true);
    }
  });
});
