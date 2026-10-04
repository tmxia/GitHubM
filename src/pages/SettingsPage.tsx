
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Settings,
  Key,
  Moon,
  Sun,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  Shield,
  Info,
  Monitor,
  Pencil,
  ExternalLink,
  Loader2,
  Palette,
  ArrowUpCircle,
  Bot,
  CheckCircle2,
  BarChart3,
  ChevronDown,
  ChevronRight,
  DollarSign,
  TrendingUp,
  Activity,
  Users,
  Calendar,

  Zap,
  CheckSquare,
  Square,
  Lock,} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, type ThemeMode, ACCENT_SCHEMES } from '@/contexts/ThemeContext';
import {
  FEATURE_FLAGS,
  getFeatureFlag,
  setFeatureFlag,
  getCompileBoardMode,
  setCompileBoardMode,
  getCompileBoardSmartCount,
  setCompileBoardSmartCount,
  getCompileBoardCustomRepos,
  setCompileBoardCustomRepos,
  getCompileBoardCustomWorkflows,
  setCompileBoardCustomWorkflows,
  type MonitoredWorkflow,
  type CompileBoardMode,
} from '@/lib/preferences';
import { updateUserProfile } from '@/services/github';
import type { GitHubRepo, GitHubWorkflow } from '@/types/types';
import { getUserRepos, getWorkflows } from '@/services/github';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MODEL_DEFS, loadProviderKey, saveProviderKey } from '@/components/ai/aiUtils';
import { getProviderStats, getTotalRequestCount, clearAllUsage, type ProviderStats } from '@/components/ai/usageStats';
import { formatCostUsd, getModelPrice, SOURCES } from '@/components/ai/modelPricing';
import { fetchVisitStats, type DailyStats, type VisitSummary } from '@/lib/visitStats';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Bar,
  BarChart,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { Globe, Bell } from 'lucide-react';

const themeOptions: { value: ThemeMode; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'light', label: '浅色', Icon: Sun },
  { value: 'dark', label: '深色', Icon: Moon },
  { value: 'system', label: '跟随系统', Icon: Monitor },
];

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

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function EditProfileDialog({ open, onOpenChange }: EditProfileDialogProps) {
  const { user, updateUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: user?.name || '',
    bio: user?.bio || '',
    company: user?.company || '',
    location: user?.location || '',
    blog: user?.blog || '',
    twitter_username: user?.twitter_username || '',
    email: user?.email || '',
  });

  const handleChange = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      (Object.keys(form) as (keyof typeof form)[]).forEach((k) => {
        payload[k] = form[k].trim();
      });
      const updated = await updateUserProfile(payload);
      updateUser(updated);
      toast.success('资料已更新');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSaving(false);
    }
  };

  const fields: { key: keyof typeof form; label: string; placeholder: string; multiline?: boolean }[] = [
    { key: 'name', label: '显示名称', placeholder: '你的名字' },
    { key: 'bio', label: '个人简介', placeholder: '介绍一下自己', multiline: true },
    { key: 'company', label: '公司/组织', placeholder: '@company' },
    { key: 'location', label: '所在地区', placeholder: '城市, 国家' },
    { key: 'blog', label: '个人网站', placeholder: 'https://example.com' },
    { key: 'twitter_username', label: 'X (Twitter)', placeholder: 'username' },
    { key: 'email', label: '公开邮箱', placeholder: 'you@example.com', },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">编辑个人资料</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {fields.map(({ key, label, placeholder, multiline }) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-sm font-normal text-foreground">{label}</Label>
              {multiline ? (
                <Textarea
                  value={form[key]}
                  onChange={handleChange(key)}
                  placeholder={placeholder}
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground resize-none"
                  rows={3}
                />
              ) : (
                <Input
                  type={key === 'email' ? 'email' : 'text'}
                  value={form[key]}
                  onChange={handleChange(key)}
                  placeholder={placeholder}
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                />
              )}
            </div>
          ))}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1 border-border hover:bg-secondary"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const COLLAPSE_KEY = 'settings_collapse';

function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}');
  } catch { return {}; }
}

function saveCollapsed(data: Record<string, boolean>) {
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(data)); } catch {}
}


function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-400/40 text-foreground rounded-[2px]">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user, rateLimit, login, token, refreshRateLimit } = useAuth();
  const [rateRefreshing, setRateRefreshing] = useState(false);
  const { theme: currentTheme, setTheme, accentSchemeId, setAccentScheme } = useTheme();

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => loadCollapsed());
  const [compileBoardEnabled, setCompileBoardEnabled] = useState(() => getFeatureFlag(FEATURE_FLAGS.compileBoard));
  const [fileTimeEnabled, setFileTimeEnabled] = useState(() => getFeatureFlag(FEATURE_FLAGS.fileTime));
  const [sortIncludeDirs, setSortIncludeDirs] = useState(() => getFeatureFlag(FEATURE_FLAGS.sortIncludeDirs, false));
  const [showFileSize, setShowFileSize] = useState(() => getFeatureFlag(FEATURE_FLAGS.showFileSize));
  
  const [boardMode, setBoardMode] = useState<CompileBoardMode>(() => getCompileBoardMode());
  const [boardSmartCount, setBoardSmartCount] = useState(() => getCompileBoardSmartCount());
  const [boardCustomRepos, setBoardCustomRepos] = useState<string[]>(() => getCompileBoardCustomRepos());
  
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRepos, setPickerRepos] = useState<GitHubRepo[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());
  const [boardCustomWorkflows, setBoardCustomWorkflows] = useState<MonitoredWorkflow[]>(() => getCompileBoardCustomWorkflows());
  const [pickerExpanded, setPickerExpanded] = useState<Set<string>>(new Set());
  const [pickerWorkflows, setPickerWorkflows] = useState<Map<string, GitHubWorkflow[]>>(new Map());
  const [pickerWorkflowsLoading, setPickerWorkflowsLoading] = useState<Set<string>>(new Set());

  const openRepoPicker = async () => {
    setPickerQuery('');
    setPickerExpanded(new Set());
    
    setPickerSelected(
      new Set(boardCustomWorkflows.map((w) => `${w.repoFullName}#${w.workflowId}`)),
    );
    setPickerOpen(true);
    if (pickerRepos.length > 0) return;
    setPickerLoading(true);
    try {
      const res = await getUserRepos({ sort: 'pushed', per_page: 100, type: 'owner' });
      setPickerRepos(res.data);
    } catch {
      toast.error(i18n.t('加载仓库列表失败'));
    } finally {
      setPickerLoading(false);
    }
  };

  const loadRepoWorkflows = async (repoFullName: string) => {
    if (pickerWorkflows.has(repoFullName)) return;
    setPickerWorkflowsLoading((prev) => new Set(prev).add(repoFullName));
    try {
      const [owner, name] = repoFullName.split('/');
      const res = await getWorkflows(owner, name);
      setPickerWorkflows((prev) => {
        const next = new Map(prev);
        next.set(repoFullName, res.workflows || []);
        return next;
      });
    } catch {
      toast.error(`${i18n.t('加载工作流失败')}：${repoFullName}`);
      setPickerWorkflows((prev) => {
        const next = new Map(prev);
        next.set(repoFullName, []);
        return next;
      });
    } finally {
      setPickerWorkflowsLoading((prev) => {
        const next = new Set(prev);
        next.delete(repoFullName);
        return next;
      });
    }
  };

  const toggleRepoExpand = async (repoFullName: string) => {
    setPickerExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(repoFullName)) next.delete(repoFullName);
      else next.add(repoFullName);
      return next;
    });
    await loadRepoWorkflows(repoFullName);
  };

  const togglePickerWorkflow = (repoFullName: string, workflowId: number) => {
    const key = `${repoFullName}#${workflowId}`;
    setPickerSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const togglePickerRepo = (repoFullName: string) => {
    const wfs = pickerWorkflows.get(repoFullName) || [];
    if (wfs.length === 0) return;
    const keys = wfs.map((w) => `${repoFullName}#${w.id}`);
    const allSelected = keys.every((k) => pickerSelected.has(k));
    setPickerSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  };

  const saveRepoPicker = () => {
    const list: MonitoredWorkflow[] = [];
    for (const key of pickerSelected) {
      const idx = key.lastIndexOf('#');
      if (idx === -1) continue;
      const repoFullName = key.slice(0, idx);
      const workflowId = parseInt(key.slice(idx + 1), 10);
      const wfs = pickerWorkflows.get(repoFullName) || [];
      const wf = wfs.find((w) => w.id === workflowId);
      if (wf) {
        list.push({
          repoFullName,
          workflowId: wf.id,
          workflowName: wf.name,
          workflowPath: wf.path,
        });
      }
    }
    setBoardCustomWorkflows(list);
    setCompileBoardCustomWorkflows(list);
    setPickerOpen(false);
  };


  const toggleSection = (id: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [id]: !prev[id] };
      saveCollapsed(next);
      return next;
    });
  };

  const [showToken, setShowToken] = useState(false);
  const [notifyCompile, setNotifyCompile] = useState(() => {
    try { return localStorage.getItem('notify_compile_done') !== 'false'; } catch { return true; }
  });
  const [notifPermission, setNotifPermission] = useState<boolean | null>(null);
  const [notifyDownload, setNotifyDownload] = useState(() => {
    try { return localStorage.getItem('notify_artifact_download') !== 'false'; } catch { return true; }
  });
  const [newToken, setNewToken] = useState('');
  const [showNewToken, setShowNewToken] = useState(false);
  const [updatingToken, setUpdatingToken] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const maskedToken = token
    ? `${token.substring(0, 6)}${'*'.repeat(20)}${token.substring(token.length - 4)}`
    : '';

  const handleUpdateToken = async () => {
    if (!newToken.trim()) { toast.error('请输入新令牌'); return; }
    setUpdatingToken(true);
    try {
      await login(newToken.trim());
      setNewToken('');
      toast.success('令牌已更新');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '令牌无效');
    } finally {
      setUpdatingToken(false);
    }
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

  const [visitDays, setVisitDays] = useState<DailyStats[]>([]);
  const [visitSummary, setVisitSummary] = useState<VisitSummary>({ todayPv: 0, todayUv: 0, totalPv: 0, totalUv: 0, allTimePv: 0, allTimeUv: 0, activeDays: 0 });
  const [visitLoading, setVisitLoading] = useState(false);
  const [visitError, setVisitError] = useState<string | null>(null);

  const loadVisitStats = useCallback(async () => {
    setVisitLoading(true);
    setVisitError(null);
    try {
      const result = await fetchVisitStats(7);
      setVisitDays(result.trend);
      setVisitSummary(result.summary);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '获取访问统计失败，请重试';
      setVisitError(msg);
    } finally {
      setVisitLoading(false);
    }
  }, []);

  
  useEffect(() => {
    const bridge = (window as unknown as {
      AndroidBridge?: { checkNotificationPermission?: () => boolean };
    }).AndroidBridge;
    if (bridge?.checkNotificationPermission) {
      try { setNotifPermission(bridge.checkNotificationPermission()); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => { loadVisitStats(); }, [loadVisitStats]);

  const isAndroid = typeof window !== 'undefined' &&
    !!(window as unknown as { AndroidBridge?: unknown }).AndroidBridge;

  const [updateInfo, setUpdateInfo] = useState<{
    version: string;
    downloadUrl: string;
    releaseNotes: string;
  } | null>(null);

  type UpdateCheckState = 'idle' | 'checking' | 'latest' | 'error';
  const [checkState, setCheckState] = useState<UpdateCheckState>('idle');
  const [checkErrorMsg, setCheckErrorMsg] = useState('');
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ver = import.meta.env.VITE_APP_VERSION;
    if (ver) { try { localStorage.setItem('app_version', ver); } catch {} }
  }, []);

  useEffect(() => {
    const onAvailable = (e: Event) => {
      const detail = (e as CustomEvent<{ version: string; downloadUrl: string; releaseNotes: string }>).detail;
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
      if (detail?.version) { setUpdateInfo(detail); setCheckState('idle'); }
    };
    const onLatest = () => {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
      setCheckState('latest');
      checkTimeoutRef.current = setTimeout(() => setCheckState('idle'), 3000);
    };
    const onError = (e: Event) => {
      const msg = (e as CustomEvent<{ message: string }>).detail?.message || '网络异常，请稍后重试';
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
      setCheckErrorMsg(msg);
      setCheckState('error');
      checkTimeoutRef.current = setTimeout(() => setCheckState('idle'), 5000);
    };
    window.addEventListener('appUpdateAvailable', onAvailable);
    window.addEventListener('appUpdateLatest', onLatest);
    window.addEventListener('appUpdateError', onError);
    return () => {
      window.removeEventListener('appUpdateAvailable', onAvailable);
      window.removeEventListener('appUpdateLatest', onLatest);
      window.removeEventListener('appUpdateError', onError);
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    };
  }, []);

  const handleCheckUpdate = useCallback(() => {
    const bridge = (window as unknown as { AndroidBridge?: { checkUpdate?: () => void } }).AndroidBridge;
    if (!bridge?.checkUpdate) return;
    setUpdateInfo(null);
    setCheckState('checking');
    setCheckErrorMsg('');
    bridge.checkUpdate();
    checkTimeoutRef.current = setTimeout(() => {
      setCheckState('error');
      setCheckErrorMsg('检查超时，请检查网络后重试');
    }, 15_000);
  }, []);

  const summaryCards = [
    { label: '今日访问', value: visitSummary.todayPv, icon: <Activity className="w-4 h-4" />, color: 'text-primary' },
    { label: '今日独立 IP', value: visitSummary.todayUv, icon: <Users className="w-4 h-4" />, color: 'text-primary' },
    { label: '近7天 PV', value: visitSummary.totalPv, icon: <TrendingUp className="w-4 h-4" />, color: 'text-primary' },
    { label: '近7天 UV', value: visitSummary.totalUv, icon: <Calendar className="w-4 h-4" />, color: 'text-primary' },
    { label: '历史总访问量', value: visitSummary.allTimePv, icon: <BarChart3 className="w-4 h-4" />, color: 'text-primary' },
    { label: '历史总独立 IP', value: visitSummary.allTimeUv, icon: <Users className="w-4 h-4" />, color: 'text-primary' },
  ];

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('app_language', lng);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
        <Settings className="w-5 h-5 text-primary" />
        {t('settings.title')}
      </h1>

      {user && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">{t('settings.accountInfo')}</h2>
            <Button
              variant="outline"
              size="sm"
              className="border-border hover:bg-secondary text-xs h-8 gap-1.5"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="w-3.5 h-3.5" />
              {t('settings.editProfile')}
            </Button>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <Avatar className="w-16 h-16 ring-2 ring-border">
                <AvatarImage src={user.avatar_url} alt={user.login} loading="lazy" />
                <AvatarFallback className="bg-secondary text-lg font-bold">
                  {user.login.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground truncate max-w-[180px] text-base">
                  {user.name || user.login}
                </span>
                <Badge variant="outline" className="border-primary/50 text-primary text-xs shrink-0">
                  {t('settings.verified')}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">@{user.login}</p>
              {user.bio && (
                <p className="text-xs text-muted-foreground mt-1 text-pretty line-clamp-2">{user.bio}</p>
              )}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-muted-foreground border-t border-border pt-4">
            {user.email && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground/60 w-14 shrink-0">{t('settings.email')}</span>
                <span className="truncate text-foreground/80">{user.email}</span>
              </div>
            )}
            {user.company && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground/60 w-14 shrink-0">{t('settings.company')}</span>
                <span className="truncate text-foreground/80">{user.company}</span>
              </div>
            )}
            {user.location && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground/60 w-14 shrink-0">{t('settings.location')}</span>
                <span className="truncate text-foreground/80">{user.location}</span>
              </div>
            )}
            {user.blog && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground/60 w-14 shrink-0">{t('settings.website')}</span>
                <a
                  href={user.blog.startsWith('http') ? user.blog : `https://${user.blog}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline truncate flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  {user.blog}
                </a>
              </div>
            )}
            {user.twitter_username && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground/60 w-14 shrink-0">X</span>
                <span className="text-foreground/80">@{user.twitter_username}</span>
              </div>
            )}
            <div className="flex items-center gap-3 mt-1 pt-2 border-t border-border/60">
              <span>{user.public_repos} {t('settings.publicRepos')}</span>
              <span>·</span>
              <span>{user.followers} followers</span>
              <span>·</span>
              <span>following {user.following}</span>
            </div>
          </div>
          <div className="mt-3">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="w-full border border-border text-muted-foreground hover:text-foreground hover:bg-secondary text-xs h-8 gap-1.5"
            >
              <a href={user.html_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5" />
                {t('settings.viewGithub')}
              </a>
            </Button>
          </div>
        </div>
      )}

      <SectionGroup
        id="appearance"
        title={t('settings.preferences')}
        icon={<Settings className="w-4 h-4" />}
        collapsed={collapsed['appearance'] ?? true}
        onToggle={toggleSection}
      >
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" />{t('settings.language')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => changeLanguage('zh-CN')}
              className={cn(
                'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all',
                i18n.language === 'zh-CN'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/40 hover:bg-secondary'
              )}
            >
              <span className="text-xs font-medium">{t('settings.langZh')}</span>
            </button>
            <button
              type="button"
              onClick={() => changeLanguage('en')}
              className={cn(
                'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all',
                i18n.language === 'en'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/40 hover:bg-secondary'
              )}
            >
              <span className="text-xs font-medium">{t('settings.langEn')}</span>
            </button>
          </div>
        </div>

        <div className="border-t border-border/60 mt-4 mb-2" />

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <Sun className="w-3.5 h-3.5" />{t('settings.theme')}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'light', label: t('settings.themeLight'), Icon: Sun },
              { value: 'dark', label: t('settings.themeDark'), Icon: Moon },
              { value: 'system', label: t('settings.themeSystem'), Icon: Monitor }
            ].map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value as ThemeMode)}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all',
                  currentTheme === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/40 hover:bg-secondary'
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {currentTheme === 'system' ? t('settings.themeDescSystem') : (currentTheme === 'dark' ? t('settings.themeDescDark') : t('settings.themeDescLight'))}
          </p>
        </div>

        <div className="border-t border-border/60" />

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5" />{t('settings.accentScheme')}
          </p>
          <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
            {ACCENT_SCHEMES.map((scheme) => (
              <button
                key={scheme.id}
                type="button"
                onClick={() => setAccentScheme(scheme.id)}
                title={scheme.label}
                className={cn(
                  'flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-lg border-2 transition-all',
                  accentSchemeId === scheme.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-secondary/50 hover:border-border/70 hover:bg-secondary'
                )}
              >
                <span
                  className="w-6 h-6 rounded-full shadow-sm ring-1 ring-border/30 shrink-0"
                  style={{ backgroundColor: scheme.previewColor }}
                />
                <span className={cn(
                  'text-[10px] font-medium leading-tight text-center',
                  accentSchemeId === scheme.id ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {scheme.label}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            当前方案：<span className="text-foreground font-medium">
              {ACCENT_SCHEMES.find(s => s.id === accentSchemeId)?.label ?? '紫罗兰'}
            </span>，选择后立即生效并持久化保存
          </p>
        </div>

        <div className="border-t border-border/60 mt-4 pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5" />{t('通知')}
          </p>
          <div className="space-y-2">
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{t('编译完成')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('workflow 成功或失败时提醒')}
                  </p>
                </div>
                <Switch
                  checked={notifyCompile}
                  onCheckedChange={(v) => {
                    setNotifyCompile(v);
                    try { localStorage.setItem('notify_compile_done', v ? 'true' : 'false'); } catch {}
                    
                    if (v && notifPermission === false) {
                      const bridge = (window as unknown as {
                        AndroidBridge?: { requestNotificationPermission?: () => void; checkNotificationPermission?: () => boolean };
                      }).AndroidBridge;
                      try {
                        bridge?.requestNotificationPermission?.();
                        setTimeout(() => {
                          try { setNotifPermission(bridge?.checkNotificationPermission?.() ?? null); } catch { /* ignore */ }
                        }, 1000);
                      } catch { /* ignore */ }
                    }
                  }}
                />
              </div>
              {notifyCompile && notifPermission === false && (
                <div className="mt-2 pt-2 border-t border-border/60 flex items-start gap-2">
                  <span className="text-destructive text-xs leading-5 shrink-0">⚠</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-destructive">
                      {t('系统通知权限未开启')}
                    </p>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline mt-0.5"
                      onClick={() => {
                        const bridge = (window as unknown as {
                          AndroidBridge?: { requestNotificationPermission?: () => void; openNotificationSettings?: () => void; checkNotificationPermission?: () => boolean };
                        }).AndroidBridge;
                        try {
                          bridge?.requestNotificationPermission?.();
                          setTimeout(() => {
                            try { setNotifPermission(bridge?.checkNotificationPermission?.() ?? null); } catch { /* ignore */ }
                          }, 1000);
                        } catch { /* ignore */ }
                      }}
                    >
                      {t('点击开启通知权限')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                const next = !notifyDownload;
                setNotifyDownload(next);
                try { localStorage.setItem('notify_artifact_download', next ? 'true' : 'false'); } catch {}
              }}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t('产物下载')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('固件下载完成时提醒')}
                </p>
              </div>
              <Switch
                checked={notifyDownload}
                onCheckedChange={(v) => {
                  setNotifyDownload(v);
                  try { localStorage.setItem('notify_artifact_download', v ? 'true' : 'false'); } catch {}
                  try {
                    const bridge = (window as unknown as {
                      AndroidBridge?: { setDownloadNotify?: (v: boolean) => void };
                    }).AndroidBridge;
                    bridge?.setDownloadNotify?.(v);
                  } catch {}
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </button>
          </div>
        </div>

        <div className="border-t border-border/60 mt-4 pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" />{t('功能')}
          </p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                const next = !compileBoardEnabled;
                setCompileBoardEnabled(next);
                setFeatureFlag(FEATURE_FLAGS.compileBoard, next);
              }}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t('编译看板')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('首页显示各仓库最近编译状态')}</p>
              </div>
              <Switch
                checked={compileBoardEnabled}
                onCheckedChange={(v) => {
                  setCompileBoardEnabled(v);
                  setFeatureFlag(FEATURE_FLAGS.compileBoard, v);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </button>

{compileBoardEnabled && (
                        <div className="p-3 rounded-lg border border-border bg-secondary/20 space-y-3">
                          <p className="text-xs font-medium text-muted-foreground">{t('监控范围')}</p>
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => { setBoardMode('smart'); setCompileBoardMode('smart'); }}
                              className={`w-full flex items-start gap-2 p-2 rounded-md border text-left transition-colors ${boardMode === 'smart' ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary'}`}
                            >
                              <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 mt-0.5 ${boardMode === 'smart' ? 'border-primary bg-primary' : 'border-border'}`} />
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-medium text-foreground">{t('智能模式')}</span>
                                <span className="block text-xs text-muted-foreground mt-0.5">{t('监控最近推送的仓库')}</span>
                              </span>
                            </button>
                            {boardMode === 'smart' && (
                              <div className="flex items-center gap-2 pl-6">
                                <span className="text-xs text-muted-foreground">{t('监控前')}</span>
                                <Input
                                  type="number"
                                  min={1}
                                  max={50}
                                  value={boardSmartCount}
                                  onChange={(e) => {
                                    const n = parseInt(e.target.value, 10) || 1;
                                    setBoardSmartCount(n);
                                    setCompileBoardSmartCount(n);
                                  }}
                                  className="w-16 h-7 text-xs bg-secondary border-border text-foreground"
                                />
                                <span className="text-xs text-muted-foreground">{t('个仓库')}</span>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => { setBoardMode('custom'); setCompileBoardMode('custom'); }}
                              className={`w-full flex items-start gap-2 p-2 rounded-md border text-left transition-colors ${boardMode === 'custom' ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary'}`}
                            >
                              <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 mt-0.5 ${boardMode === 'custom' ? 'border-primary bg-primary' : 'border-border'}`} />
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-medium text-foreground">{t('自定义模式')}</span>
                                <span className="block text-xs text-muted-foreground mt-0.5">{t('手动勾选要监控的仓库')}</span>
                              </span>
                            </button>
                            {boardMode === 'custom' && (
                              <div className="flex items-center justify-between pl-6 gap-2">
                                <span className="text-xs text-muted-foreground">{t('已选')} {boardCustomWorkflows.length} {t('个')}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs border border-border text-muted-foreground hover:bg-secondary"
                                  onClick={openRepoPicker}
                                >
                                  {t('选择仓库')}
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                                  <button
              type="button"
              onClick={() => {
                const next = !fileTimeEnabled;
                setFileTimeEnabled(next);
                setFeatureFlag(FEATURE_FLAGS.fileTime, next);
              }}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t('文件时间')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('文件列表显示最后提交时间')}</p>
              </div>
              <Switch
                checked={fileTimeEnabled}
                onCheckedChange={(v) => {
                  setFileTimeEnabled(v);
                  setFeatureFlag(FEATURE_FLAGS.fileTime, v);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </button>
            <button
              type="button"
              onClick={() => {
                const next = !sortIncludeDirs;
                setSortIncludeDirs(next);
                setFeatureFlag(FEATURE_FLAGS.sortIncludeDirs, next);
              }}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t('文件夹参与时间排序')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('关闭时文件夹始终置顶，开启后按时间混合排序')}</p>
              </div>
              <Switch
                checked={sortIncludeDirs}
                onCheckedChange={(v) => {
                  setSortIncludeDirs(v);
                  setFeatureFlag(FEATURE_FLAGS.sortIncludeDirs, v);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </button>

            <button
              type="button"
              onClick={() => {
                const next = !showFileSize;
                setShowFileSize(next);
                setFeatureFlag(FEATURE_FLAGS.showFileSize, next);
              }}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t('显示文件大小')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('在文件列表中显示文件/文件夹大小')}</p>
              </div>
              <Switch
                checked={showFileSize}
                onCheckedChange={(v) => {
                  setShowFileSize(v);
                  setFeatureFlag(FEATURE_FLAGS.showFileSize, v);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </button>
          </div>
        </div>
      </SectionGroup>

      <SectionGroup
        id="account"
        title={t('settings.accountToken')}
        icon={<Key className="w-4 h-4" />}
        collapsed={collapsed['account'] ?? true}
        onToggle={toggleSection}
      >
        {rateLimit && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />API 速率限制
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:bg-secondary h-7 text-xs"
                onClick={async () => {
                  setRateRefreshing(true);
                  try { await refreshRateLimit(); } finally { setRateRefreshing(false); }
                }}
                disabled={rateRefreshing}
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${rateRefreshing ? 'animate-spin' : ''}`} />
                刷新
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">剩余请求</span>
                <span className={cn(
                  'font-mono font-medium',
                  rateLimit.remaining > 1000 ? 'text-success' :
                  rateLimit.remaining > 100 ? 'text-warning' : 'text-destructive'
                )}>
                  {rateLimit.remaining} / {rateLimit.limit}
                </span>
              </div>
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    rateLimit.remaining > 1000 ? 'bg-success' :
                    rateLimit.remaining > 100 ? 'bg-warning' : 'bg-destructive'
                  )}
                  style={{ width: `${(rateLimit.remaining / rateLimit.limit) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                重置时间：{new Date(rateLimit.reset * 1000).toLocaleTimeString('zh-CN')}
              </p>
            </div>
          </div>
        )}

        {rateLimit && <div className="border-t border-border/60" />}

        {token && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5" />当前 Token
            </p>
            <div className="relative">
              <Input
                type={showToken ? 'text' : 'password'}
                value={showToken ? token : maskedToken}
                readOnly
                className="bg-secondary border-border text-foreground pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
              <Info className="w-3 h-3" />令牌仅保存在本地浏览器中
            </p>
          </div>
        )}

        {token && <div className="border-t border-border/60" />}

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">更新 Token</p>
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-sm font-normal text-foreground">新 Personal Access Token</Label>
              <div className="relative">
                <Input
                  type={showNewToken ? 'text' : 'password'}
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowNewToken(!showNewToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleUpdateToken}
              disabled={updatingToken || !newToken.trim()}
            >
              {updatingToken ? '验证中...' : '更新令牌'}
            </Button>
          </div>
        </div>
      </SectionGroup>

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

      <SectionGroup
        id="visit"
        title={t('settings.visitStats')}
        icon={<TrendingUp className="w-4 h-4" />}
        collapsed={collapsed['visit'] ?? true}
        onToggle={toggleSection}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Activity className="w-3 h-3" />
            全网真实访问数据，按客户端 IP 去重计算 UV
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={loadVisitStats}
            disabled={visitLoading}
          >
            <RefreshCw className={cn('w-3 h-3', visitLoading && 'animate-spin')} />
            刷新
          </Button>
        </div>

        {visitError && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
            {visitError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {summaryCards.map(card => (
            <div key={card.label} className="bg-secondary/50 rounded-lg p-3 flex items-center gap-3">
              <div className={cn('shrink-0', card.color)}>{card.icon}</div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{card.label}</p>
                {visitLoading ? (
                  <div className="h-7 w-12 bg-muted animate-pulse rounded mt-0.5" />
                ) : (
                  <p className="text-xl font-bold font-mono text-foreground leading-tight">{card.value}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />近 7 天访问趋势
          </p>
          {visitLoading ? (
            <div className="h-[180px] bg-secondary/30 rounded-lg flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !visitDays.some(d => d.pv > 0 || d.uv > 0) ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 bg-secondary/30 rounded-lg">
              <TrendingUp className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">暂无访问数据</p>
              <p className="text-xs text-muted-foreground/70">浏览应用页面后将自动记录</p>
            </div>
          ) : (
            <div className="w-full min-w-0 overflow-hidden">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={visitDays} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: 12,
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    cursor={{ fill: 'hsl(var(--secondary))' }}
                  />
                  <Legend
                    layout="horizontal"
                    wrapperStyle={{ paddingTop: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="pv" name="PV 访问量" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="uv" name="UV 独立访客" fill="hsl(var(--primary) / 0.4)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          UV 基于客户端 IP 的 SHA-256 哈希计算，不存储明文 IP，符合隐私保护要求。
        </p>
      </SectionGroup>

      <SectionGroup
        id="danger"
        title={t('settings.about')}
        icon={<Info className="w-4 h-4" />}
        collapsed={collapsed['danger'] ?? true}
        onToggle={toggleSection}
      >
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">{t('settings.about')}</p>
          <div className="space-y-3">
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p>GitHub 管理器 v{import.meta.env.VITE_APP_VERSION || '1.0.local'}</p>
              <p>基于 GitHub REST API v2022-11-28</p>
              <p>使用 React + TypeScript + Tailwind CSS 构建</p>
            </div>
            {updateInfo && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                <ArrowUpCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-xs font-medium text-primary">新版本 {updateInfo.version} 可用</p>
                  {updateInfo.releaseNotes && (
                    <p className="text-xs text-muted-foreground line-clamp-2 text-pretty">{updateInfo.releaseNotes}</p>
                  )}
                </div>
                {updateInfo.downloadUrl && (
                  <Button
                    size="sm"
                    className="h-7 text-xs px-2 bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                    onClick={(e) => {
                      e.preventDefault();
                      const bridge = (window as unknown as { AndroidBridge?: { downloadFile?: (u: string, f: string, t: string) => void } }).AndroidBridge;
                      if (bridge?.downloadFile) {
                        const filename = updateInfo.downloadUrl.split('/').pop() || 'update.apk';
                        const token = localStorage.getItem('github_manager_token') || '';
                        bridge.downloadFile(updateInfo.downloadUrl, filename, token);
                      } else {
                        window.open(updateInfo.downloadUrl, '_blank', 'noopener,noreferrer');
                      }
                    }}
                  >
                    下载
                  </Button>
                )}
              </div>
            )}
            {checkState === 'latest' && !updateInfo && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-green-500/10 border border-green-500/20">
                <svg className="w-4 h-4 text-green-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <p className="text-xs text-green-700 dark:text-green-400 font-medium">已是最新版本</p>
              </div>
            )}
            {checkState === 'error' && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                <svg className="w-4 h-4 text-destructive shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-xs text-destructive text-pretty">{checkErrorMsg}</p>
              </div>
            )}
            {isAndroid && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs border-border"
                onClick={handleCheckUpdate}
                disabled={checkState === 'checking'}
              >
                {checkState === 'checking' ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />检查中…</>
                ) : (
                  <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />检查更新</>
                )}
              </Button>
            )}
          </div>
        </div>

        <div className="border-t border-border/60" />

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border border-border shrink-0 overflow-hidden">
            <img
              src="https://miaoda-conversation-file.cdn.bcebos.com/user-a7uyohzdep6o/app-bgc5z86utjwh/20260513/头像.png"
              alt="作者头像"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="text-sm text-foreground truncate">作者：MT 论坛练习时长两年半的水怪</p>
            <p className="text-xs text-muted-foreground">
              反馈邮箱：
              <a
                href="mailto:3214931827@qq.com"
                className="hover:text-primary transition-colors underline underline-offset-2 decoration-border hover:decoration-primary"
              >
                3214931827@qq.com
              </a>
            </p>
          </div>
        </div>
      </SectionGroup>

      {user && <EditProfileDialog open={editOpen} onOpenChange={setEditOpen} />}
    {/* 仓库选择器 */}
    <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border flex flex-col h-[35vh]">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            {t('选择监控仓库')}
          </DialogTitle>
        </DialogHeader>
        <Input
          placeholder={t('搜索仓库...')}
          value={pickerQuery}
          onChange={(e) => setPickerQuery(e.target.value)}
          className="bg-secondary border-border text-foreground shrink-0"
        />
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {pickerLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 bg-muted rounded" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {pickerRepos
                .filter((r) => {
                  const q = pickerQuery.trim().toLowerCase();
                  if (!q) return true;
                  if (r.full_name.toLowerCase().includes(q)) return true;
                  const wfs = pickerWorkflows.get(r.full_name) || [];
                  return wfs.some((w) => w.name.toLowerCase().includes(q));
                })
                .map((r) => {
                  const q = pickerQuery.trim().toLowerCase();
                  const wfs = pickerWorkflows.get(r.full_name) || [];
                  const wfsLoading = pickerWorkflowsLoading.has(r.full_name);
                  const hasWorkflowMatch = !!q && wfs.length > 0 && wfs.some((w) => w.name.toLowerCase().includes(q));
                  const isExpanded = pickerExpanded.has(r.full_name) || hasWorkflowMatch;
                  const selectedCount = wfs.filter((w) =>
                    pickerSelected.has(`${r.full_name}#${w.id}`),
                  ).length;
                  const allSelected = wfs.length > 0 && selectedCount === wfs.length;

                  return (
                    <div key={r.id} className="rounded-md border border-border overflow-hidden">
                      {/* 仓库行 */}
                      <div className="flex items-center gap-1 bg-secondary/30">
                        <button
                          type="button"
                          onClick={() => toggleRepoExpand(r.full_name)}
                          className="flex-1 flex items-center gap-2 p-2 text-left min-w-0"
                        >
                          <ChevronRight
                            className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          />
                          <span className="flex-1 min-w-0 text-sm text-foreground truncate">
                            {highlightMatch(r.full_name, q)}
                          </span>
                          {selectedCount > 0 && (
                            <span className="text-[10px] text-primary shrink-0">
                              {selectedCount}
                            </span>
                          )}
                          {r.private && <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
                        </button>
                        {wfs.length > 0 && (
                          <button
                            type="button"
                            onClick={() => togglePickerRepo(r.full_name)}
                            className="px-2 py-1.5 text-[10px] text-muted-foreground hover:text-primary shrink-0"
                          >
                            {allSelected ? t('取消') : t('全选')}
                          </button>
                        )}
                      </div>

                      {/* 展开后：workflow 列表 */}
                      {isExpanded && (
                        <div className="divide-y divide-border">
                          {wfsLoading ? (
                            <div className="p-2 space-y-1">
                              <Skeleton className="h-6 bg-muted rounded" />
                              <Skeleton className="h-6 bg-muted rounded" />
                            </div>
                          ) : wfs.length === 0 ? (
                            <p className="p-2 text-xs text-muted-foreground text-center">
                              {t('该仓库无工作流')}
                            </p>
                          ) : (
                            wfs.map((w) => {
                              const key = `${r.full_name}#${w.id}`;
                              const checked = pickerSelected.has(key);
                              return (
                                <button
                                  key={w.id}
                                  type="button"
                                  onClick={() => togglePickerWorkflow(r.full_name, w.id)}
                                  className={`w-full flex items-center gap-2 p-2 pl-7 text-left transition-colors ${checked ? 'bg-primary/5' : 'hover:bg-secondary'}`}
                                >
                                  {checked
                                    ? <CheckSquare className="w-3.5 h-3.5 text-primary shrink-0" />
                                    : <Square className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                                  <span className="flex-1 min-w-0 text-xs text-foreground truncate">
                                    {highlightMatch(w.name, q)}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[100px]">
                                    {w.path.split('/').pop()}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
                </div>
        <DialogFooter className="gap-2 shrink-0 pt-2">
          <Button
            variant="ghost"
            className="border border-border text-muted-foreground hover:bg-secondary"
            onClick={() => setPickerOpen(false)}
          >
            {t('取消')}
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={saveRepoPicker}
          >
            {t('保存')} ({pickerSelected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    </div>
  );
}
