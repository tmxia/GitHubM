
export type TranslateLang = 'auto' | 'zh' | 'en' | 'jp' | 'kor' | 'fra' | 'de' | 'spa' | 'ru';

const LANG_MAP: Record<string, string> = {
  zh: 'zh-CN',
  en: 'en-GB',
  jp: 'ja',
  kor: 'ko',
  fra: 'fr',
  de: 'de',
  spa: 'es',
  ru: 'ru',
};

const MAX_LINES_PER_BATCH = 30;
const CONCURRENCY = 3;

function detectSource(text: string): string {
  return /[\u4e00-\u9fa5\u0800-\u4e00]/.test(text) ? 'zh-CN' : 'en';
}

async function callMyMemory(q: string, src: string, dst: string): Promise<string | null> {
  try {
    const url =
      `https://api.mymemory.translated.net/get` +
      `?q=${encodeURIComponent(q)}&langpair=${encodeURIComponent(`${src}|${dst}`)}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const translated: string | undefined = data?.responseData?.translatedText;
    return translated && translated.trim() ? translated : null;
  } catch {
    return null;
  }
}

export async function translateText(
  q: string,
  from: TranslateLang = 'auto',
  to: TranslateLang
): Promise<{ from: string; to: string; trans_result: Array<{ src: string; dst: string }> }> {
  if (!q.trim()) {
    return { from, to, trans_result: [] };
  }

  const target = LANG_MAP[to] ?? to;

  const lines = q
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, MAX_LINES_PER_BATCH);

  if (lines.length === 0) {
    return { from, to, trans_result: [] };
  }

  const trans_result: Array<{ src: string; dst: string }> = [];
  let cursor = 0;

  const workers = Array.from({ length: Math.min(CONCURRENCY, lines.length) }, async () => {
    while (cursor < lines.length) {
      const line = lines[cursor++];
      const src = from === 'auto' ? detectSource(line) : LANG_MAP[from] ?? from;
      const dst = await callMyMemory(line, src, target);
      if (dst) {
        trans_result.push({ src: line, dst });
      }
    }
  });

  await Promise.all(workers);

  if (trans_result.length === 0) {
    throw new Error('翻译服务暂不可用（MyMemory 直连失败），请稍后再试');
  }

  return { from: from === 'auto' ? 'auto' : from, to, trans_result };
}