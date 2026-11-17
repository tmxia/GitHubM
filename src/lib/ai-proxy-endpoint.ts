// 代理地址归一化（OpenAI 兼容无状态代理）
// 与 ./ai-endpoint 的分工：ai-endpoint 处理用户填写的上游接口地址；
// 本模块处理「代理地址」这一特殊约定——代理地址只写主机时，历史实现
// 一律拼 `${host}/v1/chat/completions`，因此用户填 https://host/v1 会拼出
// https://host/v1/v1/chat/completions。

import { normalizeBaseEndpoint, normalizeChatEndpoint } from './ai-endpoint';

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
// 已显式带版本段的路径，如 /v1、/v2、/v1beta/openai、/compatible-mode/v1
const VERSION_PATH_RE = /\/v\d+[a-z]*(?:\/[a-z][a-z0-9._-]*)?$/i;

/**
 * 代理地址是否已显式带版本段。
 * 先去掉协议再判断，避免把主机名恰好叫 v2 的地址（http://v2）误判成版本路径。
 */
function hasVersionPath(base: string): boolean {
  return VERSION_PATH_RE.test(base.replace(SCHEME_RE, ''));
}

/**
 * 归一化代理地址为可 POST 的 chat/completions 完整地址，幂等。
 * 规则：
 *   已带版本段（.../v1、.../v1beta/openai） → 原样使用
 *   只写主机或普通路径（.../proxy）         → 补 /v1，保持历史行为
 * 例：
 *   https://llm.callact.xyz           -> https://llm.callact.xyz/v1/chat/completions
 *   https://llm.callact.xyz/v1        -> https://llm.callact.xyz/v1/chat/completions
 *   https://llm.callact.xyz/v1/       -> https://llm.callact.xyz/v1/chat/completions
 *   https://host/v1/chat/completions/ -> https://host/v1/chat/completions
 *   https://host/proxy                -> https://host/proxy/v1/chat/completions
 *   '' 或仅空白                        -> ''
 */
export function normalizeProxyChatEndpoint(proxyUrl?: string | null): string {
  const base = normalizeBaseEndpoint(proxyUrl);
  if (!base) return '';
  return normalizeChatEndpoint(hasVersionPath(base) ? base : `${base}/v1`);
}
