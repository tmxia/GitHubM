import i18n from "@/i18n";

export interface ModelPrice {
  inputPer1M: number;
  outputPer1M: number;
  isFree?: boolean;
  isEstimated?: boolean;
  currency?: string;
  sourceUrl?: string;
  note?: string;
}

const SOURCES = {
  deepseek: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
  gemini:   'https://ai.google.dev/pricing',
  qwen:     'https://help.aliyun.com/zh/model-studio/developer-reference/tongyi-qianwen-7b-14b-72b-api',
  openai:   'https://openai.com/api/pricing',
  wenxin:   'https://cloud.baidu.com/doc/WENXINWORKSHOP/s/Blfmc9dlf',
} as const;

const MODEL_PRICES: Record<string, ModelPrice> = {

  'deepseek-v4-flash': {
    inputPer1M: 1.00 / 7.2,          // ¥1.00/M → ~$0.139/M
    outputPer1M: 2.00 / 7.2,         // ¥2.00/M → ~$0.278/M
    currency: 'CNY',
    sourceUrl: SOURCES.deepseek,
    note: i18n.t('缓存命中输入 ¥0.02/M (~$0.003/M)；上下文 1M / 最大输出 384K'),
  },
  'deepseek-v4-pro': {
    inputPer1M: 3.00 / 7.2,          // ¥3.00/M（折后） → ~$0.417/M
    outputPer1M: 6.00 / 7.2,         // ¥6.00/M（折后） → ~$0.833/M
    currency: 'CNY',
    sourceUrl: SOURCES.deepseek,
    note: '当前 2.5 折至 2026/05/31（原价 ¥12/¥24/M）；缓存命中输入 ¥0.025/M；思考模式含 reasoning_content',
  },
  'deepseek-chat': {
    inputPer1M: 1.00 / 7.2,
    outputPer1M: 2.00 / 7.2,
    currency: 'CNY',
    sourceUrl: SOURCES.deepseek,
    note: i18n.t('已弃用旧名称（等价于 deepseek-v4-flash），建议升级'),
  },
  'deepseek-coder': {
    inputPer1M: 1.00 / 7.2,
    outputPer1M: 2.00 / 7.2,
    currency: 'CNY',
    sourceUrl: SOURCES.deepseek,
    note: i18n.t('按 deepseek-v4-flash 价格估算'),
  },
  'deepseek-reasoner': {
    inputPer1M: 3.00 / 7.2,
    outputPer1M: 6.00 / 7.2,
    currency: 'CNY',
    sourceUrl: SOURCES.deepseek,
    note: i18n.t('已弃用旧名称（等价于 deepseek-v4-pro），建议升级'),
  },

  'gemini-2.5-flash-preview-05-20': {
    inputPer1M: 0.15,
    outputPer1M: 0.60,
    sourceUrl: SOURCES.gemini,
    note: i18n.t('含免费额度（RPM 15）；思考输出按 $3.50/M 计'),
    isFree: true,
  },
  'gemini-2.5-flash-preview-04-17': {
    inputPer1M: 0.15,
    outputPer1M: 0.60,
    sourceUrl: SOURCES.gemini,
    isFree: true,
  },
  'gemini-2.5-pro-preview-05-06': {
    inputPer1M: 1.25,
    outputPer1M: 10.00,
    sourceUrl: SOURCES.gemini,
    note: i18n.t('≤200K token 输入单价；>200K 为 $2.50/M'),
    isFree: true,
  },
  'gemini-2.5-pro-preview-03-25': {
    inputPer1M: 1.25,
    outputPer1M: 10.00,
    sourceUrl: SOURCES.gemini,
    isFree: true,
  },
  'gemini-2.0-flash': {
    inputPer1M: 0.10,
    outputPer1M: 0.40,
    sourceUrl: SOURCES.gemini,
    isFree: true,
  },
  'gemini-1.5-flash': {
    inputPer1M: 0.075,
    outputPer1M: 0.30,
    sourceUrl: SOURCES.gemini,
    isFree: true,
  },
  'gemini-1.5-pro': {
    inputPer1M: 1.25,
    outputPer1M: 5.00,
    sourceUrl: SOURCES.gemini,
    isFree: true,
  },

  'qwen2.5-coder-32b-instruct': {
    inputPer1M: 2.00 / 7.2,        // ¥2.00/M → ~$0.278/M
    outputPer1M: 6.00 / 7.2,       // ¥6.00/M → ~$0.833/M
    currency: 'CNY',
    sourceUrl: SOURCES.qwen,
    note: i18n.t('原价 ¥2.00/¥6.00 per 1M tokens，按 1 USD=7.2 CNY 换算'),
  },
  'qwen2.5-coder-7b-instruct': {
    inputPer1M: 0.50 / 7.2,        // ¥0.50/M → ~$0.069/M
    outputPer1M: 2.00 / 7.2,       // ¥2.00/M → ~$0.278/M
    currency: 'CNY',
    sourceUrl: SOURCES.qwen,
    note: i18n.t('原价 ¥0.50/¥2.00 per 1M tokens'),
  },
  'qwen-plus': {
    inputPer1M: 0.80 / 7.2,        // ¥0.80/M → ~$0.111/M
    outputPer1M: 2.00 / 7.2,       // ¥2.00/M → ~$0.278/M
    currency: 'CNY',
    sourceUrl: SOURCES.qwen,
    note: i18n.t('原价 ¥0.80/¥2.00 per 1M tokens'),
  },
  'qwen-turbo': {
    inputPer1M: 0.30 / 7.2,        // ¥0.30/M → ~$0.042/M
    outputPer1M: 0.60 / 7.2,       // ¥0.60/M → ~$0.083/M
    currency: 'CNY',
    sourceUrl: SOURCES.qwen,
    note: i18n.t('原价 ¥0.30/¥0.60 per 1M tokens'),
  },
  'qwen-max': {
    inputPer1M: 2.40 / 7.2,        // ¥2.40/M → ~$0.333/M
    outputPer1M: 9.60 / 7.2,       // ¥9.60/M → ~$1.333/M
    currency: 'CNY',
    sourceUrl: SOURCES.qwen,
    note: i18n.t('原价 ¥2.40/¥9.60 per 1M tokens'),
  },

  'gpt-4o': {
    inputPer1M: 2.50,
    outputPer1M: 10.00,
    sourceUrl: SOURCES.openai,
  },
  'gpt-4o-mini': {
    inputPer1M: 0.15,
    outputPer1M: 0.60,
    sourceUrl: SOURCES.openai,
  },
  'gpt-4-turbo': {
    inputPer1M: 10.00,
    outputPer1M: 30.00,
    sourceUrl: SOURCES.openai,
  },
  'gpt-4': {
    inputPer1M: 30.00,
    outputPer1M: 60.00,
    sourceUrl: SOURCES.openai,
  },
  'gpt-3.5-turbo': {
    inputPer1M: 0.50,
    outputPer1M: 1.50,
    sourceUrl: SOURCES.openai,
  },
  'o1': {
    inputPer1M: 15.00,
    outputPer1M: 60.00,
    sourceUrl: SOURCES.openai,
  },
  'o1-mini': {
    inputPer1M: 3.00,
    outputPer1M: 12.00,
    sourceUrl: SOURCES.openai,
  },
  'o3-mini': {
    inputPer1M: 1.10,
    outputPer1M: 4.40,
    sourceUrl: SOURCES.openai,
  },
};

const PROVIDER_FALLBACK: Record<string, ModelPrice> = {
  deepseek: {
    inputPer1M: 1.00 / 7.2,
    outputPer1M: 2.00 / 7.2,
    isEstimated: true,
    currency: 'CNY',
    sourceUrl: SOURCES.deepseek,
    note: i18n.t('未知模型，按 deepseek-v4-flash 估算'),
  },
  gemini: {
    inputPer1M: 0.10,
    outputPer1M: 0.40,
    isEstimated: true,
    isFree: true,
    sourceUrl: SOURCES.gemini,
    note: i18n.t('未知 Gemini 模型，按 gemini-2.0-flash 估算'),
  },
  qwen: {
    inputPer1M: 0.50 / 7.2,
    outputPer1M: 2.00 / 7.2,
    isEstimated: true,
    currency: 'CNY',
    sourceUrl: SOURCES.qwen,
    note: i18n.t('未知通义模型，按 qwen2.5-coder-7b 估算'),
  },
  openai: {
    inputPer1M: 0.15,
    outputPer1M: 0.60,
    isEstimated: true,
    sourceUrl: SOURCES.openai,
    note: i18n.t('未知 OpenAI 模型，按 gpt-4o-mini 估算'),
  },
  wenxin: {
    inputPer1M: 0,
    outputPer1M: 0,
    isFree: true,
    sourceUrl: SOURCES.wenxin,
    note: i18n.t('平台内置，免费使用'),
  },
  custom: {
    inputPer1M: 0,
    outputPer1M: 0,
    isEstimated: true,
    note: i18n.t('自定义接口，无法自动估算费用'),
  },
};

export function getModelPrice(providerType: string, model: string): ModelPrice {
  const exact = MODEL_PRICES[model];
  if (exact) return exact;
  const fallback = PROVIDER_FALLBACK[providerType];
  if (fallback) return fallback;
  return { inputPer1M: 0, outputPer1M: 0, isEstimated: true, note: i18n.t('未知平台，无法估算费用') };
}

export function calcCostUsd(
  providerType: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
): { costUsd: number; price: ModelPrice } {
  const price = getModelPrice(providerType, model);
  const costUsd =
    (promptTokens / 1_000_000) * price.inputPer1M +
    (completionTokens / 1_000_000) * price.outputPer1M;
  return { costUsd, price };
}

export function formatCostUsd(costUsd: number): string {
  if (costUsd === 0) return '$0.00';
  if (costUsd < 0.000001) return '< $0.000001';
  if (costUsd < 0.001) return `$${costUsd.toFixed(6)}`;
  if (costUsd < 1) return `$${costUsd.toFixed(4)}`;
  return `$${costUsd.toFixed(2)}`;
}

export { SOURCES };
