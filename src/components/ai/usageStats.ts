
import { calcCostUsd } from './modelPricing';

export interface UsageRecord {
  id: string;           // 唯一 ID
  providerType: string; // 平台类型（deepseek/gemini/qwen/groq/openai/custom）
  model: string;        // 模型名
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: number;    // ms since epoch
}

export interface ModelStats {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  requestCount: number;
}

export interface ProviderStats {
  providerType: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  requestCount: number;
  lastUsed: number;
  modelBreakdown: ModelStats[];
}

const STORAGE_KEY = 'ai_usage_stats';
const RETENTION_DAYS = 30;

function loadAll(): UsageRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(records: UsageRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
  }
}

function prune(records: UsageRecord[]): UsageRecord[] {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return records.filter(r => r.timestamp >= cutoff);
}

export function appendUsageRecord(
  providerType: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
) {
  const all = prune(loadAll());
  const record: UsageRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    providerType,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    timestamp: Date.now(),
  };
  all.push(record);
  saveAll(all);
}

export function getProviderStats(): ProviderStats[] {
  const all = prune(loadAll());

  const providerMap = new Map<string, ProviderStats>();
  const modelMap = new Map<string, ModelStats>();

  for (const r of all) {
    const { costUsd } = calcCostUsd(r.providerType, r.model, r.promptTokens, r.completionTokens);

    let ps = providerMap.get(r.providerType);
    if (!ps) {
      ps = {
        providerType: r.providerType,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        requestCount: 0,
        lastUsed: 0,
        modelBreakdown: [],
      };
      providerMap.set(r.providerType, ps);
    }
    ps.promptTokens += r.promptTokens;
    ps.completionTokens += r.completionTokens;
    ps.totalTokens += r.totalTokens;
    ps.costUsd += costUsd;
    ps.requestCount += 1;
    if (r.timestamp > ps.lastUsed) ps.lastUsed = r.timestamp;

    const mKey = `${r.providerType}::${r.model}`;
    let ms = modelMap.get(mKey);
    if (!ms) {
      ms = { model: r.model, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, requestCount: 0 };
      modelMap.set(mKey, ms);
    }
    ms.promptTokens += r.promptTokens;
    ms.completionTokens += r.completionTokens;
    ms.totalTokens += r.totalTokens;
    ms.costUsd += costUsd;
    ms.requestCount += 1;
  }

  for (const [mKey, ms] of modelMap) {
    const providerType = mKey.split('::')[0];
    const ps = providerMap.get(providerType);
    if (ps) ps.modelBreakdown.push(ms);
  }
  for (const ps of providerMap.values()) {
    ps.modelBreakdown.sort((a, b) => b.costUsd - a.costUsd);
  }

  return Array.from(providerMap.values()).sort((a, b) => b.lastUsed - a.lastUsed);
}

export function getTotalRequestCount(): number {
  return prune(loadAll()).length;
}

export function clearAllUsage() {
  localStorage.removeItem(STORAGE_KEY);
}
