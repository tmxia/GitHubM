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
/** 版本段，仅用于「LLM 代理」场景的折叠与补全 */
const V1_SEGMENT = '/v1';
/** 项目内置 LLM 代理（Cloudflare Worker）的固定 chat 路由 */
const PROXY_CHAT_SUFFIX = '/v1/chat/completions';
/** 用于判断剥离 /v1 后是否仍保留合法的「协议://主机」前缀 */
const ORIGIN_PREFIX = /^[a-z][a-z0-9+.-]*:\/\/[^/]+/i;

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

/**
 * 归一化为「LLM 代理」（Cloudflare Worker）的 chat 完整地址。
 * 代理 Worker 的路由固定为 /v1/chat/completions，上游地址由 Worker 自行解析，
 * 因此允许用户只填根地址，也兼容误填 .../v1、.../v1/chat/completions 或末尾斜杠。
 * 例：
 *   https://proxy.example.com                      -> https://proxy.example.com/v1/chat/completions
 *   https://proxy.example.com/v1                   -> https://proxy.example.com/v1/chat/completions
 *   https://proxy.example.com/v1/chat/completions  -> https://proxy.example.com/v1/chat/completions
 *   '' 或仅空白                                    -> ''（调用方据此判定未配置代理）
 */
export function normalizeProxyChatEndpoint(proxyUrl?: string | null): string {
  const base = normalizeBaseEndpoint(proxyUrl);
  if (!base) return '';
  const root = base.toLowerCase().endsWith(V1_SEGMENT)
    ? trimTrailingSlashes(base.slice(0, -V1_SEGMENT.length))
    : base;
  // 主机名恰好是 v1（如 https://v1）时不能把协议头一并剥掉
  if (!ORIGIN_PREFIX.test(root)) return `${base}${PROXY_CHAT_SUFFIX}`;
  return `${root}${PROXY_CHAT_SUFFIX}`;
}
