// OpenAI 兼容接口地址归一化
// 用户填写接口地址时常见几种写法差异：
//   https://host/v1
//   https://host/v1/
//   https://host/v1/chat/completions
//   https://host/v1/chat/completions/
// 本模块统一把它们折叠成同一份基础地址，供各平台端点拼接使用。
// 注意：不自动补 /v1，基础地址按用户所填原样保留。

const CHAT_SUFFIX = '/chat/completions';
const MODELS_SUFFIX = '/models';

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * 归一化为基础地址（不带 /chat/completions 或 /models，不带末尾斜杠）。
 * 例：
 *   https://host/v1/chat/completions  -> https://host/v1
 *   https://host/v1/chat/completions/ -> https://host/v1
 *   https://host/v1/                 -> https://host/v1
 *   https://host/v1/models           -> https://host/v1
 *   '' 或仅空白                      -> ''
 */
export function normalizeBaseEndpoint(endpoint?: string | null): string {
  const raw = (endpoint ?? '').trim();
  if (!raw) return '';

  let base = trimTrailingSlashes(raw);
  // 循环剥离，兼容 .../chat/completions/ 以及末尾多余的斜杠
  for (;;) {
    const lower = base.toLowerCase();
    if (lower.endsWith(CHAT_SUFFIX)) {
      base = trimTrailingSlashes(base.slice(0, -CHAT_SUFFIX.length));
      continue;
    }
    if (lower.endsWith(MODELS_SUFFIX)) {
      base = trimTrailingSlashes(base.slice(0, -MODELS_SUFFIX.length));
      continue;
    }
    return base;
  }
}

/**
 * 归一化为可直接 POST 的 chat/completions 完整地址，幂等。
 * 例：
 *   https://host/v1                      -> https://host/v1/chat/completions
 *   https://host/v1/chat/completions/    -> https://host/v1/chat/completions
 *   ''                                   -> ''
 */
export function normalizeChatEndpoint(endpoint?: string | null): string {
  const base = normalizeBaseEndpoint(endpoint);
  return base ? `${base}${CHAT_SUFFIX}` : '';
}

/** 归一化为 /models 列表地址，未填地址时返回 ''（调用方据此跳过远端请求）。 */
export function normalizeModelsEndpoint(endpoint?: string | null): string {
  const base = normalizeBaseEndpoint(endpoint);
  return base ? `${base}${MODELS_SUFFIX}` : '';
}
