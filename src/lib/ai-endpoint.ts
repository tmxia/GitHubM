

const CHAT_SUFFIX = '/chat/completions';
const MODELS_SUFFIX = '/models';

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

export function normalizeBaseEndpoint(endpoint?: string | null): string {
  const raw = (endpoint ?? '').trim();
  if (!raw) return '';

  let base = trimTrailingSlashes(raw);

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

export function normalizeChatEndpoint(endpoint?: string | null): string {
  const base = normalizeBaseEndpoint(endpoint);
  return base ? `${base}${CHAT_SUFFIX}` : '';
}

export function normalizeModelsEndpoint(endpoint?: string | null): string {
  const base = normalizeBaseEndpoint(endpoint);
  return base ? `${base}${MODELS_SUFFIX}` : '';
}
