// 精简版构建时不引用此文件
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BarChart3, Bot, CheckCircle2, ChevronDown, ChevronRight, DollarSign, ExternalLink, Info, Key, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { MODEL_DEFS, loadProviderKey, saveProviderKey, type ModelType } from '@/components/ai/aiUtils';
import { getProviderStats, getTotalRequestCount, clearAllUsage, type ProviderStats } from '@/components/ai/usageStats';
import { formatCostUsd, getModelPrice, SOURCES } from '@/components/ai/modelPricing';

interface SectionGroupProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  collapsed: boolean;
  onToggle: (id: string) => void;
  danger?: boolean;
}

function SectionGroup({ id, title, icon, children, collapsed, onToggle, danger }: SectionGroupProps) {
  return (
    <div className={cn(
      'border rounded-xl overflow-hidden',
      danger ? 'border-destructive/30' : 'border-border'
    )}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        className={cn(
          'w-full flex items-center justify-between px-5 py-4 transition-colors',
          'bg-card hover:bg-secondary/50',
          danger ? 'text-destructive' : 'text-foreground'
        )}
      >
        <div className="flex items-center gap-2.5">
          <span className={cn('shrink-0', danger ? 'text-destructive' : 'text-primary')}>
            {icon}
          </span>
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <ChevronRight
          className={cn(
            'w-4 h-4 shrink-0 transition-transform duration-200',
            danger ? 'text-destructive/60' : 'text-muted-foreground',
            !collapsed && 'rotate-90'
          )}
        />
      </button>

      {!collapsed && (
        <div className="bg-card border-t border-border/60 px-5 py-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

export default function AiSettingsSection() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ ai: true });
  const toggleSection = (id: string) => {
    setCollapsed(prev => ({ ...prev, [id]: !(prev[id] ?? true) }));
  };

  const aiKeyProviders = MODEL_DEFS.filter(m => m.needKey && m.type !== 'custom');
  const [aiKeys, setAiKeys] = useState<Record<string, string>>(() =>
    Object.fromEntries(aiKeyProviders.map(m => [m.type, loadProviderKey(m.type as import('@/components/ai/aiUtils').ModelType)]))
  );
  const [savedAiKeys, setSavedAiKeys] = useState<Record<string, boolean>>({});

  const handleSaveAiKey = (type: string, key: string) => {
    saveProviderKey(type as import('@/components/ai/aiUtils').ModelType, key);
    setSavedAiKeys(prev => ({ ...prev, [type]: true }));
    setTimeout(() => setSavedAiKeys(prev => ({ ...prev, [type]: false })), 2000);
    if (key.trim()) {
      toast.success(`${MODEL_DEFS.find(m => m.type === type)?.label ?? type} API Key 已保存`);
    } else {
      toast.info(`${MODEL_DEFS.find(m => m.type === type)?.label ?? type} API Key 已清除`);
    }
  };

  const [usageStats, setUsageStats] = useState<ProviderStats[]>(() => getProviderStats());
  const [totalRequests, setTotalRequests] = useState(() => getTotalRequestCount());
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

  const toggleProviderExpand = (pt: string) =>
    setExpandedProviders(prev => {
      const next = new Set(prev);
      next.has(pt) ? next.delete(pt) : next.add(pt);
      return next;
    });

  const handleClearUsage = () => {
    clearAllUsage();
    setUsageStats([]);
    setTotalRequests(0);
    toast.success('AI 用量统计已清除');
  };

  return (
      <SectionGroup
        id="ai"
        title={t('settings.aiConfig')}
        icon={<Bot className="w-4 h-4" />}
        collapsed={collapsed['ai'] ?? true}
        onToggle={toggleSection}
      >
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" />AI 模型 API Key
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            配置各平台密钥后，在 AI 助手中切换模型时将自动预填。密钥仅存储在本地。
          </p>
          <div className="space-y-3">
            {aiKeyProviders.map(provider => {
              const key = aiKeys[provider.type] ?? '';
              const saved = savedAiKeys[provider.type] ?? false;
              return (
                <div key={provider.type} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-normal text-foreground flex items-center gap-1.5">
                      {provider.label}
                      {provider.badge && (
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                          {provider.badge}
                        </span>
                      )}
                    </Label>
                    {provider.docsUrl && (
                      <a
                        href={provider.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                      >
                        获取密钥<ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                      <Input
                        type="text"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        inputMode="text"
                        value={key}
                        onChange={e => setAiKeys(prev => ({ ...prev, [provider.type]: e.target.value }))}
                        placeholder={provider.keyPlaceholder ?? '请输入 API Key'}
                        className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-mono text-sm"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-border hover:bg-secondary gap-1.5"
                      onClick={() => handleSaveAiKey(provider.type, key)}
                    >
                      {saved
                        ? <><CheckCircle2 className="w-3.5 h-3.5 text-success" />已保存</>
                        : '保存'
                      }
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border/60" />

        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />AI 用量统计
            </p>
            {usageStats.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs border-border text-muted-foreground hover:text-destructive hover:border-destructive/50"
                onClick={handleClearUsage}
              >
                <Trash2 className="w-3 h-3 mr-1" />清除统计
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            近 30 天 AI 对话 Token 用量及费用估算，数据存储在本地，自动清理超期记录。
          </p>

          {usageStats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
              <BarChart3 className="w-7 h-7 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">暂无用量记录</p>
              <p className="text-xs text-muted-foreground/70">使用 AI 助手后将自动统计 Token 用量</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 bg-secondary/50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>共 <span className="font-medium text-foreground">{totalRequests}</span> 次对话，覆盖 <span className="font-medium text-foreground">{usageStats.length}</span> 个平台</span>
                </div>
                <div className="flex items-center gap-1 text-xs font-medium text-foreground shrink-0">
                  <DollarSign className="w-3.5 h-3.5 text-primary" />
                  <span>{formatCostUsd(usageStats.reduce((s, p) => s + p.costUsd, 0))}</span>
                  <span className="text-muted-foreground font-normal">合计</span>
                </div>
              </div>

              <div className="space-y-2">
                {usageStats.map(stat => {
                  const providerLabel = MODEL_DEFS.find(m => m.type === stat.providerType)?.label ?? stat.providerType;
                  const expanded = expandedProviders.has(stat.providerType);
                  const hasMultipleModels = stat.modelBreakdown.length > 1;
                  const singleModel = stat.modelBreakdown[0]?.model ?? '';
                  const priceInfo = getModelPrice(stat.providerType, singleModel);
                  const sourceUrl = priceInfo.sourceUrl ?? (SOURCES as Record<string, string>)[stat.providerType];

                  return (
                    <div key={stat.providerType} className="border border-border rounded-lg overflow-hidden">
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-foreground truncate">{providerLabel}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{stat.requestCount} 次</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-base font-semibold font-mono text-primary">
                              {formatCostUsd(stat.costUsd)}
                            </span>
                            {priceInfo.isFree && stat.costUsd === 0 && (
                              <span className="text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded font-medium">免费额度</span>
                            )}
                            {priceInfo.isEstimated && (
                              <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">估算</span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-muted-foreground">输入 Tokens</span>
                            <span className="text-sm font-mono font-medium text-foreground">{stat.promptTokens.toLocaleString()}</span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-muted-foreground">输出 Tokens</span>
                            <span className="text-sm font-mono font-medium text-foreground">{stat.completionTokens.toLocaleString()}</span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-muted-foreground">合计 Tokens</span>
                            <span className="text-sm font-mono font-medium text-foreground">{stat.totalTokens.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-border/50">
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Info className="w-3 h-3 shrink-0" />
                            {priceInfo.note ? (
                              <span className="truncate max-w-[180px]">{priceInfo.note}</span>
                            ) : (
                              <span>官方定价</span>
                            )}
                            {sourceUrl && (
                              <a
                                href={sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-0.5 text-primary hover:underline ml-1 shrink-0"
                              >
                                查看定价 <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                          {hasMultipleModels && (
                            <button
                              type="button"
                              onClick={() => toggleProviderExpand(stat.providerType)}
                              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
                            >
                              {expanded ? (
                                <><ChevronDown className="w-3 h-3 rotate-180" />收起明细</>
                              ) : (
                                <><ChevronDown className="w-3 h-3" />{stat.modelBreakdown.length} 个模型</>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                      {expanded && hasMultipleModels && (
                        <div className="border-t border-border bg-secondary/30 divide-y divide-border/50">
                          {stat.modelBreakdown.map(ms => {
                            const mp = getModelPrice(stat.providerType, ms.model);
                            return (
                              <div key={ms.model} className="px-3 py-2 flex items-center justify-between gap-2">
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <span className="text-xs font-mono text-foreground truncate">{ms.model || '(默认)'}</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {ms.requestCount} 次 · {ms.totalTokens.toLocaleString()} tokens
                                    {mp.inputPer1M > 0 && (
                                      <> · 输入 ${(mp.inputPer1M).toFixed(mp.inputPer1M < 0.1 ? 4 : 2)}/M · 输出 ${(mp.outputPer1M).toFixed(mp.outputPer1M < 0.1 ? 4 : 2)}/M</>
                                    )}
                                  </span>
                                </div>
                                <span className="text-sm font-semibold font-mono text-foreground shrink-0">
                                  {formatCostUsd(ms.costUsd)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                费用按各平台官方定价估算，免费额度内实际费用为 $0，仅供参考。CNY 定价按 1 USD = 7.2 CNY 换算。
              </p>
            </div>
          )}
        </div>
      </SectionGroup>
  );
}
