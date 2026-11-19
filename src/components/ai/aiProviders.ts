

import type { ModelType } from './aiTypes';
import i18n from "@/i18n";

export function getProviderChatUrl(type: ModelType, endpoint?: string): string {
  switch (type) {
    case 'deepseek': return 'https://api.deepseek.com/v1/chat/completions';
    case 'gemini':   return 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    case 'qwen':     return 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    case 'openai':   return 'https://api.openai.com/v1/chat/completions';
    case 'openrouter': return 'https://openrouter.ai/api/v1/chat/completions';
    case 'cloudflare': return 'https://llm.callact.xyz/v1/chat/completions';
    case 'custom': {

      const base = normalizeCustomEndpoint(endpoint);
      return base ? `${base}/chat/completions` : '';
    }
    case 'wenxin':   // 平台内置免费通道已随后端移除，不再支持
      return '';
  }
}

function normalizeCustomEndpoint(endpoint?: string): string {
  const raw = (endpoint || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  return raw.replace(/\/chat\/completions$/i, '');
}

export function getProviderModelsUrl(type: ModelType, endpoint?: string): string {
  switch (type) {
    case 'deepseek': return 'https://api.deepseek.com/v1/models';
    case 'gemini':   return 'https://generativelanguage.googleapis.com/v1beta/openai/models';
    case 'qwen':     return 'https://dashscope.aliyuncs.com/compatible-mode/v1/models';
    case 'openai':   return 'https://api.openai.com/v1/models';
    case 'openrouter': return 'https://openrouter.ai/api/v1/models';
    case 'cloudflare': return '';
    case 'custom': {
      const base = normalizeCustomEndpoint(endpoint);
      return base ? `${base}/models` : '';
    }
    case 'wenxin':   return '';
  }
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

export function getDefaultProviderModel(type: ModelType): string {
  switch (type) {
    case 'deepseek': return 'deepseek-v4-flash';
    case 'gemini': return 'gemini-2.5-flash-preview-05-20';
    case 'qwen': return 'qwen2.5-coder-32b-instruct';
    case 'openai': return 'gpt-4o-mini';
    case 'openrouter': return 'particle-ai/particle-1:free';
    case 'cloudflare': return '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    case 'custom':
    case 'wenxin':
      return 'default';
  }
}

function parseModelsList(json: unknown): Array<{ id: string; name: string }> {
  const raw = json as { data?: Array<{ id?: string; name?: string }> } | Array<{ id?: string; name?: string }>;
  let items: Array<{ id?: string; name?: string }> = [];
  if (Array.isArray(raw)) items = raw;
  else if (raw && Array.isArray(raw.data)) items = raw.data;
  return items
    .filter(m => m && typeof m.id === 'string' && m.id.trim())
    .map(m => ({ id: m.id as string, name: m.name || m.id as string }));
}

export async function fetchModelsFromAPI(
  type: ModelType,
  apiKey: string,
  endpoint?: string,
): Promise<Array<{ id: string; name: string }>> {
  if (type === 'wenxin') return [];
  const url = getProviderModelsUrl(type, endpoint);
  if (!url) throw new Error(i18n.t('该平台不支持模型列表查询'));

  let res: Response;
  try {
    res = await fetch(url, { headers: authHeaders(apiKey) });
  } catch {

    throw new Error(i18n.t('无法连接到接口地址：请确认地址可访问；Android 上如果是 http:// 明文地址，该地址需在白名单内且服务端允许跨域'));
  }
  if (!res.ok) {
    let msg = '';
    try {
      const j = await res.json() as { error?: { message?: string } | string };
      const e = j?.error;
      msg = typeof e === 'string' ? e : e?.message ?? '';
    } catch { /* ignore */ }
    if (res.status === 401 || res.status === 403) throw new Error(i18n.t('API Key 无效或无权访问（401/403）'));
    if (res.status === 404) throw new Error(i18n.t('接口地址不正确（404），请检查平台与地址'));
    throw new Error(`HTTP ${res.status}${msg ? `: ${msg.slice(0, 200)}` : ''}`);
  }

  const models = parseModelsList(await res.json());
  if (!models.length) throw new Error(i18n.t('未返回任何模型，请检查 API Key 或接口地址'));
  return models;
}

export interface TestConnectionResult {
  success: boolean;
  elapsedMs?: number;
  error?: string;
}

export async function testProviderConnection(
  type: ModelType,
  apiKey: string,
  endpoint?: string,
  model?: string,
  proxyUrl?: string,
): Promise<TestConnectionResult> {
  if (type === 'wenxin') return { success: false, error: i18n.t('该平台已不再支持') };
  const proxyBase = proxyUrl?.trim().replace(/\/+$/, '') ||
    (type !== 'custom' && type !== 'openrouter' ? 'https://llm.callact.xyz' : '');
  const url = proxyBase
    ? `${proxyBase}/v1/chat/completions`
    : getProviderChatUrl(type, endpoint);
  if (!url) return { success: false, error: i18n.t('接口地址为空，请先填写') };
  const headers: Record<string, string> = {
    ...authHeaders(apiKey),
    ...(proxyBase ? { 'x-llm-provider': type } : {}),
    ...(proxyBase && type === 'custom' && endpoint ? { 'x-llm-upstream': endpoint } : {}),
  };
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model || getDefaultProviderModel(type),
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
    });
    const elapsedMs = Date.now() - startedAt;

    if (res.ok) return { success: true, elapsedMs };

    let detail = '';
    try {
      const j = await res.json() as { error?: { message?: string } | string };
      const e = j?.error;
      detail = typeof e === 'string' ? e : e?.message ?? '';
    } catch { /* ignore */ }

    if (res.status === 401 || res.status === 403) {
      return { success: false, elapsedMs, error: i18n.t('API Key 无效或无权访问（401/403）') };
    }
    if (res.status === 404) {
      return { success: false, elapsedMs, error: i18n.t('接口地址不正确（404），请检查平台与地址') };
    }
    return {
      success: false,
      elapsedMs,
      error: detail ? `HTTP ${res.status}: ${detail.slice(0, 200)}` : `HTTP ${res.status}`,
    };
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (msg.includes('CORS') || msg.includes('Failed to fetch')) {
      return { success: false, error: i18n.t('跨域请求被拒绝，该接口可能不支持浏览器直连') };
    }
    return { success: false, error: msg || i18n.t('网络请求失败') };
  }
}