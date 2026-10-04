
import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Star,
  GitFork,
  Users,
  Eye,
  Clock,
  Activity,
  ExternalLink,
  Pin,
  Lock,
  Globe,
  Flame,

  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { getUserRepos, getUserEvents, formatRelativeTime, formatNumber, getLanguageColor, getStarredCount, getRepo, getRepoLatestRun, getWorkflows, getWorkflowRuns, clearApiCache } from '@/services/github';
import { gqlGetContributions, gqlGetPinnedRepos } from '@/services/github-graphql';
import type { GitHubRepo, GitHubEvent, ContributionCalendar, GQL_PinnedRepo } from '@/types/types';
import { toast } from 'sonner';
import { pageCache } from '@/lib/page-cache';
import { registerCompileWatch } from '@/lib/compilePoller';
import {
  FEATURE_FLAGS,
  getFeatureFlag,
  subscribeFeatureFlags,
  getCompileBoardMode,
  getCompileBoardSmartCount,
  getCompileBoardCustomRepos,
  getCompileBoardCustomWorkflows,
  setCompileBoardCustomWorkflows,
  subscribeCompileBoardConfig,
  type MonitoredWorkflow,
} from '@/lib/preferences';
import { saveListScroll, readListScroll, clearListScroll } from '@/lib/scrollRestore';
import PullToRefresh from '@/components/common/PullToRefresh';
import i18n from "@/i18n";

function getContributionClass(level: string, count: number): string {
  if (count === 0) return 'bg-secondary';
  switch (level) {
    case 'FIRST_QUARTILE': return 'bg-primary/25';
    case 'SECOND_QUARTILE': return 'bg-primary/50';
    case 'THIRD_QUARTILE': return 'bg-primary/75';
    case 'FOURTH_QUARTILE': return 'bg-primary';
    default: return 'bg-secondary';
  }
}

const ContributionHeatmap = memo(function ContributionHeatmap({
  calendar,
  loading,
}: {
  calendar: ContributionCalendar | null;
  loading: boolean;
}) {
  const weekdayLabels = [i18n.t('日'), '', i18n.t('二'), '', i18n.t('四'), '', i18n.t('六')];

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32 bg-muted" />
          <Skeleton className="h-4 w-20 bg-muted" />
        </div>
        <Skeleton className="h-28 w-full bg-muted rounded" />
      </div>
    );
  }

  if (!calendar) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-medium text-foreground flex items-center gap-2">
          <Flame className="w-4 h-4 text-primary" />
          {i18n.t('贡献热力图')}</span>
        <Badge variant="outline" className="text-xs border-border text-muted-foreground">
          {i18n.t('今年共')}<span className="text-foreground font-semibold mx-1">{calendar.totalContributions.toLocaleString()}</span> {i18n.t('次贡献')}</Badge>
      </div>

      <TooltipProvider>
        <div className="w-full min-w-0 overflow-x-auto">
          <div className="inline-flex gap-1 min-w-max">
            <div className="flex flex-col gap-px pt-5">
              {weekdayLabels.map((label, i) => (
                <div key={i} className="h-3 flex items-center">
                  <span className="text-[9px] text-muted-foreground w-3 leading-none">{label}</span>
                </div>
              ))}
            </div>
            {calendar.weeks.map((week, wi) => {
              const firstDayDate = new Date(week.firstDay);
              const showMonth = wi === 0 || firstDayDate.getDate() <= 7;
              const monthName = showMonth
                ? firstDayDate.toLocaleDateString('zh-CN', { month: 'short' })
                : '';

              return (
                <div key={wi} className="flex flex-col gap-px">
                  <div className="h-4 flex items-end">
                    {showMonth && (
                      <span className="text-[9px] text-muted-foreground leading-none whitespace-nowrap">
                        {monthName}
                      </span>
                    )}
                  </div>
                  {Array.from({ length: 7 }).map((_, di) => {
                    const day = week.contributionDays.find((d) => d.weekday === di);
                    if (!day) return <div key={di} className="w-3 h-3 rounded-sm bg-transparent" />;
                    return (
                      <Tooltip key={di}>
                        <TooltipTrigger asChild>
                          <div
                            className={`w-3 h-3 rounded-sm cursor-default transition-opacity hover:opacity-80 ${getContributionClass(day.contributionLevel, day.contributionCount)}`}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-popover border-border text-xs text-foreground">
                          {day.date}：{day.contributionCount > 0 ? `${day.contributionCount} 次贡献` : i18n.t('无贡献')}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </TooltipProvider>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{i18n.t('少')}</span>
        {['bg-secondary', 'bg-primary/25', 'bg-primary/50', 'bg-primary/75', 'bg-primary'].map((cls, i) => (
          <div key={i} className={`w-3 h-3 rounded-sm ${cls}`} />
        ))}
        <span>{i18n.t('多')}</span>
      </div>
    </div>
  );
});
const PinnedRepoCard = memo(function PinnedRepoCard({ repo }: { repo: GQL_PinnedRepo }) {
  const navigate = useNavigate();
  const [owner, name] = repo.nameWithOwner.split('/');
  return (
    <button
      type="button"
      className="w-full text-left bg-secondary/30 border border-border rounded-lg p-3 hover:bg-secondary/60 transition-colors group"
      onClick={() => navigate(`/repos/${repo.nameWithOwner}`)}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {repo.isPrivate
            ? <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
            : <Globe className="w-3 h-3 text-muted-foreground shrink-0" />}
          <span className="text-sm font-semibold text-accent group-hover:underline truncate">{name}</span>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{owner}</span>
      </div>
      {repo.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 text-pretty mb-2">{repo.description}</p>
      )}
      <div className="flex items-center gap-3">
        {repo.primaryLanguage && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: repo.primaryLanguage.color || '#8b949e' }}
            />
            {repo.primaryLanguage.name}
          </span>
        )}
        {repo.stargazerCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="w-3 h-3" />{formatNumber(repo.stargazerCount)}
          </span>
        )}
        {repo.forkCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <GitFork className="w-3 h-3" />{formatNumber(repo.forkCount)}
          </span>
        )}
      </div>
    </button>
  );
});


async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  onProgress?: (partial: R[]) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  let completed = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const i = index++;
        if (i >= items.length) return;
        try {
          results[i] = await fn(items[i]);
        } catch {
          results[i] = undefined as unknown as R;
        }
        completed++;
        if (onProgress && completed % 3 === 0) {
          onProgress(results.slice());
        }
      }
    },
  );
  await Promise.all(workers);
  if (onProgress) onProgress(results.slice());
  return results;
}
export default function DashboardPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [events, setEvents] = useState<GitHubEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const DASHBOARD_SCROLL_KEY = 'dashboard:scroll';

  const [calendar, setCalendar] = useState<ContributionCalendar | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [pinnedRepos, setPinnedRepos] = useState<GQL_PinnedRepo[]>([]);
  const [pinnedLoading, setPinnedLoading] = useState(true);
  const [starredCount, setStarredCount] = useState<number | null>(null);
  const [compileStatus, setCompileStatus] = useState<Array<{ repo: GitHubRepo; workflow?: import('@/types/types').GitHubWorkflow; run: import('@/types/types').GitHubWorkflowRun | null }>>([]);
  const [compileLoading, setCompileLoading] = useState(true);
  // 用 ref 保存 compileStatus，避免轮询 effect 依赖它导致无限重置
  const compileStatusRef = useRef<typeof compileStatus>([]);
  useEffect(() => { compileStatusRef.current = compileStatus; }, [compileStatus]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [compileEnabled, setCompileEnabled] = useState(() => getFeatureFlag(FEATURE_FLAGS.compileBoard));
  const [boardMode, setBoardMode] = useState(() => getCompileBoardMode());
  const [boardSmartCount, setBoardSmartCount] = useState(() => getCompileBoardSmartCount());
  const [boardCustomRepos, setBoardCustomRepos] = useState<string[]>(() => getCompileBoardCustomRepos());
  const [boardCustomWorkflows, setBoardCustomWorkflows] = useState<MonitoredWorkflow[]>(() => getCompileBoardCustomWorkflows());


  const [customRepoObjects, setCustomRepoObjects] = useState<GitHubRepo[]>([]);

  
  useEffect(() => {
    if (boardMode !== 'custom' || (boardCustomWorkflows.length === 0 && boardCustomRepos.length === 0)) {
      setCustomRepoObjects([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const inHome = new Map(repos.map((r) => [r.full_name, r]));
      const neededRepos = boardCustomWorkflows.length > 0
        ? Array.from(new Set(boardCustomWorkflows.map((w) => w.repoFullName)))
        : boardCustomRepos;
      const missing = neededRepos.filter((fn) => !inHome.has(fn));
      const fetched: GitHubRepo[] = [];
      for (const fn of missing) {
        const [owner, name] = fn.split('/');
        if (!owner || !name) continue;
        try {
          const r = await getRepo(owner, name);
          fetched.push(r);
        } catch { /* 忽略 */ }
      }
      if (!cancelled) setCustomRepoObjects(fetched);
    })();
    return () => { cancelled = true; };
  }, [boardMode, boardCustomWorkflows, boardCustomRepos, repos]);

  
  const monitoredItems = useMemo(() => {
    if (boardMode === 'custom') {
      const homeMap = new Map(repos.map((r) => [r.full_name, r]));
      const extraMap = new Map(customRepoObjects.map((r) => [r.full_name, r]));

      
      if (boardCustomWorkflows.length === 0 && boardCustomRepos.length > 0) {
        const items: Array<{ repo: GitHubRepo; workflow?: import('@/types/types').GitHubWorkflow }> = [];
        for (const fn of boardCustomRepos) {
          const repo = homeMap.get(fn) ?? extraMap.get(fn);
          if (repo) items.push({ repo });
        }
        return items;
      }

      const items: Array<{ repo: GitHubRepo; workflow?: import('@/types/types').GitHubWorkflow }> = [];
      const seen = new Set<string>();
      for (const w of boardCustomWorkflows) {
        const repo = homeMap.get(w.repoFullName) ?? extraMap.get(w.repoFullName);
        if (!repo) continue;
        
        const dedupKey = `${w.repoFullName}#${w.workflowId}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        items.push({
          repo,
          workflow: {
            id: w.workflowId,
            name: w.workflowName,
            path: w.workflowPath,
          } as import('@/types/types').GitHubWorkflow,
        });
      }
      return items;
    }
    return repos.slice(0, boardSmartCount).map((r) => ({ repo: r }));
  }, [boardMode, boardCustomWorkflows, boardCustomRepos, boardSmartCount, repos, customRepoObjects]);

  
  useEffect(() => {
    try {
      const list = getCompileBoardCustomWorkflows();
      if (list.length === 0) return;
      const seen = new Set<string>();
      const deduped = list.filter((w) => {
        const key = `${w.repoFullName}#${w.workflowId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (deduped.length !== list.length) {
        setCompileBoardCustomWorkflows(deduped);
        setBoardCustomWorkflows(deduped);
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCompileStatus = useCallback(async (
    items: Array<{ repo: GitHubRepo; workflow?: import('@/types/types').GitHubWorkflow }>,
    opts: { silent?: boolean } = {},
  ) => {
    if (!getFeatureFlag(FEATURE_FLAGS.compileBoard)) {
      setCompileLoading(false);
      return;
    }
    if (!opts.silent) setCompileLoading(true);

    type Item = { repo: GitHubRepo; workflow?: import('@/types/types').GitHubWorkflow; run: import('@/types/types').GitHubWorkflowRun | null };

    try {
      
      // ── 按仓库聚合：同一仓库多个 workflow 只发一次请求 ──
      const byRepo = new Map<string, typeof items>();
      for (const it of items) {
        const k = it.repo.full_name;
        if (!byRepo.has(k)) byRepo.set(k, []);
        byRepo.get(k)!.push(it);
      }
      const groups = [...byRepo.entries()];
      const collected: Item[] = [];

      await runWithConcurrency(
        groups,
        5,
        async ([fullName, group]) => {
          const [owner, name] = fullName.split('/');
          try {
            // 一次拿 50 条 run，本地按 workflow_id 匹配
            const res = await getWorkflowRuns(owner, name, { per_page: 50 });
            const runs = res.workflow_runs || [];
            const runsByWfId = new Map<number, import('@/types/types').GitHubWorkflowRun>();
            for (const r of runs) {
              if (!runsByWfId.has(r.workflow_id)) runsByWfId.set(r.workflow_id, r);
            }
            for (const it of group) {
              const run = it.workflow
                ? (runsByWfId.get(it.workflow.id) ?? null)
                : (runs[0] ?? null);
              collected.push({ repo: it.repo, workflow: it.workflow, run });
            }
          } catch {
            for (const it of group) {
              collected.push({ repo: it.repo, workflow: it.workflow, run: null });
            }
          }
          if (!opts.silent && collected.length > 0) {
            setCompileStatus([...collected]);
          }
        },
      );

      setCompileStatus(collected.filter((x): x is Item => !!x));
    } catch {
      if (!opts.silent) setCompileStatus([]);
    } finally {
      if (!opts.silent) setCompileLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = subscribeFeatureFlags(() => {
      setCompileEnabled(getFeatureFlag(FEATURE_FLAGS.compileBoard));
    });
    return unsub;
  }, []);

  
  useEffect(() => {
    if (!compileEnabled || compileStatus.length === 0) return;
    // 非 completed 都算"运行中"（含 waiting/requested/pending）
    const running = compileStatus.filter(({ run }) => run && run.status && run.status !== 'completed');
    if (running.length === 0) return;
    for (const item of running) {
      const run = item.run!;
      const [owner, repoName] = item.repo.full_name.split('/');
      try {
        registerCompileWatch({
          owner,
          repo: repoName,
          runId: run.id,
          wfName: item.workflow?.name || run.name || item.repo.name,
          runNumber: run.run_number,
        });
      } catch { /* ignore */ }
    }
  }, [compileEnabled, compileStatus]);

  useEffect(() => {
    if (!user) return;

    const cacheKey = `dashboard:${user.login}`;

    const cached = pageCache.get<{
      repos: GitHubRepo[];
      events: GitHubEvent[];
      calendar: ContributionCalendar | null;
      pinnedRepos: GQL_PinnedRepo[];
      starredCount: number | null;
    }>(cacheKey);
    if (cached) {
      setRepos(cached.repos);
      setEvents(cached.events);
      setCalendar(cached.calendar);
      setPinnedRepos(cached.pinnedRepos);
      setStarredCount(cached.starredCount);
      setLoading(false);
      setCalendarLoading(false);
      setPinnedLoading(false);
      void getStarredCount().then(setStarredCount).catch(() => {});
      void refreshUser();
      return;
    }

    const loadData = async (): Promise<{ repos: GitHubRepo[]; events: GitHubEvent[] }> => {
      setLoading(true);
      try {
        const [reposResult, eventsResult] = await Promise.all([
          getUserRepos({ sort: 'pushed', per_page: 6, type: 'owner' }),
          getUserEvents(user.login, 1),
        ]);
        const repos = reposResult.data;
        const events = [...eventsResult]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 15);
        setRepos(repos);
        setEvents(events);
        return { repos, events };
      } catch (err) {
        toast.error(i18n.t('加载仪表盘数据失败'));
        console.error(err);
        return { repos: [], events: [] };
      } finally {
        setLoading(false);
      }
    };

    const loadCalendar = async (): Promise<ContributionCalendar | null> => {
      setCalendarLoading(true);
      try {
        const cal = await gqlGetContributions(user.login);
        setCalendar(cal);
        return cal;
      } catch {
        return null;
      } finally {
        setCalendarLoading(false);
      }
    };

    const loadPinned = async (): Promise<GQL_PinnedRepo[]> => {
      setPinnedLoading(true);
      try {
        const pinned = await gqlGetPinnedRepos(user.login);
        setPinnedRepos(pinned);
        return pinned;
      } catch {
        return [];
      } finally {
        setPinnedLoading(false);
      }
    };

    const loadStarredCount = async (): Promise<number | null> => {
      try {
        const count = await getStarredCount();
        setStarredCount(count);
        return count;
      } catch {
        return null;
      }
    };

    Promise.all([loadData(), loadCalendar(), loadPinned(), loadStarredCount()]).then(
      ([{ repos, events }, calendar, pinnedRepos, starredCount]) => {
        pageCache.set(cacheKey, { repos, events, calendar, pinnedRepos, starredCount });
      }
    );
  }, [user, refreshUser, refreshKey]);

  useEffect(() => {
    if (!user) return;
    if (repos.length === 0) return;
    void loadCompileStatus(monitoredItems);
  }, [user, repos.length, monitoredItems, loadCompileStatus, refreshKey]);

  
  useEffect(() => {
    if (!compileLoading) return;
    const timer = setTimeout(() => setCompileLoading(false), 10000);
    return () => clearTimeout(timer);
  }, [compileLoading]);

  
  useEffect(() => {
    if (!compileEnabled) return;
    if (repos.length === 0) return;

    // GitHub run status: queued/in_progress/waiting/requested/pending/completed
    // 只要不是 completed，就认为有活跃 run
    const activeRuns = compileStatusRef.current.filter(({ run }) =>
      run?.status && run.status !== 'completed'
    );
    // 有活跃 run → 8 秒（及时）；无 → 60 秒（省额度）
    const interval = activeRuns.length > 0 ? 8000 : 60000;

    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      
      await loadCompileStatus(monitoredItems, { silent: true });
    };

    const timer = setInterval(tick, interval);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [compileEnabled, monitoredItems, loadCompileStatus]);

  
  useEffect(() => {
    const unsub = subscribeCompileBoardConfig(() => {
      setBoardMode(getCompileBoardMode());
      setBoardSmartCount(getCompileBoardSmartCount());
      setBoardCustomRepos(getCompileBoardCustomRepos());
      setBoardCustomWorkflows(getCompileBoardCustomWorkflows());
    });
    return unsub;
  }, []);

  
  useEffect(() => {
    const handler = () => {
      if (repos.length > 0) {
        void loadCompileStatus(monitoredItems, { silent: true });
      }
    };
    window.addEventListener('compile-board-refresh', handler);
    return () => window.removeEventListener('compile-board-refresh', handler);
  }, [repos, loadCompileStatus]);

  const getEventTargetPath = (event: GitHubEvent): string => {
    const repoName = event.repo.name;
    const p = event.payload as { number?: number };
    switch (event.type) {
      case 'PushEvent':
        return `/repos/${repoName}/commits`;
      case 'PullRequestEvent':
        return p.number ? `/repos/${repoName}/pulls/${p.number}` : `/repos/${repoName}/pulls`;
      case 'IssuesEvent':
      case 'IssueCommentEvent':
        return p.number ? `/repos/${repoName}/issues/${p.number}` : `/repos/${repoName}/issues`;
      case 'PullRequestReviewEvent':
      case 'PullRequestReviewCommentEvent':
        return `/repos/${repoName}/pulls`;
      default:
        return `/repos/${repoName}`;
    }
  };

  const getEventDescription = (event: GitHubEvent): string => {
    const repoName = event.repo.name;
    switch (event.type) {
      case 'PushEvent': {
        const payload = event.payload as {
          commits?: unknown[];
          size?: number;
          distinct_size?: number;
          ref?: string;
        };
        const count = payload.size || payload.distinct_size || payload.commits?.length || 0;
        const branch = (payload.ref || '').replace('refs/heads/', '');
        if (count > 0) {
          return branch
            ? `推送了 ${count} 个提交到 ${repoName} (${branch})`
            : `推送了 ${count} 个提交到 ${repoName}`;
        }
        return branch
          ? `更新了 ${repoName} (${branch})`
          : `更新了 ${repoName}`;
      }
      case 'CreateEvent': {
        const payload = event.payload as { ref_type?: string; ref?: string };
        return `在 ${repoName} 创建了 ${payload.ref_type} ${payload.ref || ''}`;
      }
      case 'IssuesEvent': {
        const payload = event.payload as { action?: string; issue?: { title?: string } };
        return `${payload.action === 'opened' ? i18n.t('创建了') : payload.action === 'closed' ? i18n.t('关闭了') : i18n.t('更新了')} Issue: ${payload.issue?.title || ''} (${repoName})`;
      }
      case 'PullRequestEvent': {
        const payload = event.payload as { action?: string; pull_request?: { title?: string } };
        return `${payload.action === 'opened' ? i18n.t('创建了') : payload.action === 'closed' ? i18n.t('关闭了') : i18n.t('更新了')} PR: ${payload.pull_request?.title || ''} (${repoName})`;
      }
      case 'WatchEvent':
        return `标星了 ${repoName}`;
      case 'ForkEvent':
        return `Fork 了 ${repoName}`;
      case 'IssueCommentEvent':
        return `评论了 ${repoName} 的 Issue`;
      case 'PullRequestReviewEvent':
        return `审查了 ${repoName} 的 Pull Request`;
      default:
        return `在 ${repoName} 有新活动`;
    }
  };

  const restoredRef = useRef(false);
  useEffect(() => {
    if (loading || restoredRef.current) return;
    restoredRef.current = true;
    const y = readListScroll(DASHBOARD_SCROLL_KEY);
    if (y <= 0) return;
    let attempts = 0;
    const tryScroll = () => {
      window.scrollTo(0, y);
      document.documentElement.scrollTop = y;
      document.body.scrollTop = y;
      const actual = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      if (Math.abs(actual - y) <= 2 || attempts >= 60) {
        clearListScroll(DASHBOARD_SCROLL_KEY);
      } else {
        attempts++;
        setTimeout(tryScroll, 30);
      }
    };
    setTimeout(tryScroll, 50);
  }, [loading]);

  
  useEffect(() => {
    if (!compileEnabled) return;
    const bridge = (window as unknown as {
      AndroidBridge?: { syncMonitorConfig?: (json: string) => void };
    }).AndroidBridge;
    if (!bridge?.syncMonitorConfig) return;

    let token = '';
    try { token = localStorage.getItem('github_manager_token') || ''; } catch { /* ignore */ }
    if (!token) return;

    const repos = compileStatus
      .map((it) => {
        const wfId = it.workflow?.id || it.run?.workflow_id;
        if (!wfId) return null;
        return {
          fullName: it.repo.full_name,
          workflowId: wfId,
          workflowName: it.workflow?.name || it.run?.name || it.repo.name,
        };
      })
      .filter((x): x is { fullName: string; workflowId: number; workflowName: string } => x !== null);

    if (repos.length === 0) return;

    let notifyEnabled = true;
    try { notifyEnabled = localStorage.getItem('notify_compile_done') !== 'false'; } catch { /* ignore */ }

    let lastStatus: Record<string, string> = {};
    try {
      const raw = localStorage.getItem('gm_monitor_last_status');
      if (raw) lastStatus = JSON.parse(raw);
    } catch { /* ignore */ }

    try {
      bridge.syncMonitorConfig(JSON.stringify({ notifyEnabled, token, repos, lastStatus }));
    } catch { /* ignore */ }
  }, [compileEnabled, compileStatus]);

  
  const prevCompileRef = useRef<Map<number, { status?: string; conclusion?: string }>>(new Map());

  useEffect(() => {
    const prev = prevCompileRef.current;
    const bridge = (window as unknown as {
      AndroidBridge?: {
        notifyCompileDone?: (t: string, b: string, u: string) => void;
      };
    }).AndroidBridge;

    let enabled = true;
    try {
      enabled = localStorage.getItem('notify_compile_done') !== 'false';
    } catch { /* ignore */ }

    for (const item of compileStatus) {
      if (!item.run) continue;
      const runId = item.run.id;
      const p = prev.get(runId);

      
      if (
        enabled &&
        bridge?.notifyCompileDone &&
        p &&
        p.status !== 'completed' &&
        item.run.status === 'completed'
      ) {
        const ok = item.run.conclusion === 'success';
        const repoName = item.repo.full_name;
        const wfName = item.workflow?.name || item.run.name || item.repo.name;
        const title = `${ok ? '✅' : '❌'} ${wfName} 编译${ok ? '成功' : '失败'}`;
        const body = `${repoName} #${item.run.run_number}` + (ok ? '，点击查看' : '，点击排查');
        const deepLink = `githubmanager://repos/${repoName}/actions`;
        try {
          bridge.notifyCompileDone(title, body, deepLink);
        } catch { /* ignore */ }
      }

      
      prev.set(runId, {
        status: item.run.status ?? undefined,
        conclusion: item.run.conclusion ?? undefined,
      });
    }
  }, [compileStatus]);

  const handleRefresh = async () => {
    if (!user) return;
    // 1) 清缓存
    try { clearApiCache(); } catch { /* ignore */ }
    try { pageCache.delete(`dashboard:${user.login}`); } catch { /* ignore */ }
    // 2) 刷新用户信息
    try { await refreshUser(); } catch { /* ignore */ }
    // 3) 触发主数据 useEffect 重跑（异步，不阻塞）
    setRefreshKey((k) => k + 1);
    // 4) 立即刷编译看板（独立于主数据）
    if (compileEnabled) {
      try { await loadCompileStatus(monitoredItems, { silent: true }); } catch { /* ignore */ }
    }
  };

  if (!user) return null;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-4">
          <Avatar className="w-16 h-16 shrink-0 ring-2 ring-border">
            <AvatarImage src={user.avatar_url} alt={user.login} loading="lazy" />
            <AvatarFallback className="bg-secondary text-secondary-foreground text-xl font-bold">
              {user.login.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <h1 className="text-lg font-bold text-foreground text-balance leading-tight">
                {user.name || user.login}
              </h1>
              <span className="text-sm text-muted-foreground truncate">@{user.login}</span>
            </div>
            {user.bio && (
              <p className="text-sm text-muted-foreground mt-1.5 text-pretty line-clamp-2">{user.bio}</p>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {user.company && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 shrink-0" />
                  {user.company}
                </span>
              )}
              {user.location && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 shrink-0" />
                  {user.location}
                </span>
              )}
              {user.blog && (
                <a
                  href={user.blog.startsWith('http') ? user.blog : `https://${user.blog}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  <span className="truncate max-w-[140px]">{user.blog}</span>
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {user.twitter_username && (
              <span className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-muted-foreground/80">𝕏</span>
                @{user.twitter_username}
              </span>
            )}
            <span>
              {i18n.t('加入于')}{new Date(user.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}
            </span>
          </div>
          <a
            href={user.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium
                       border border-border rounded-lg px-3 h-8
                       bg-background hover:bg-secondary transition-colors text-foreground"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {i18n.t('GitHub 主页')}</a>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: i18n.t('公开仓库'), value: user.public_repos as number | null, icon: BookOpen, color: 'text-primary', to: '/repos' },
          { label: i18n.t('关注者'), value: user.followers as number | null, icon: Users, color: 'text-accent', to: '/follow-list/followers' },
          { label: i18n.t('正在关注'), value: user.following as number | null, icon: Eye, color: 'text-chart-3', to: '/follow-list/following' },
          { label: i18n.t('我的收藏'), value: starredCount, icon: Star, color: 'text-warning', to: '/starred' },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.label}
              type="button"
              className="text-left bg-card border border-border rounded-xl p-4 hover:border-primary/50 hover:bg-secondary/40 active:scale-[0.98] transition-all group"
              onClick={() => navigate(stat.to)}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              {stat.value === null ? (
                <p className="text-2xl font-bold text-transparent mt-1 select-none" aria-hidden="true">0</p>
              ) : (
                <p className="text-2xl font-bold text-foreground">{formatNumber(stat.value)}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1 transition-colors">
                {i18n.t('点击查看 →')}</p>
            </button>
          );
        })}
      </div>

      {compileEnabled && (compileLoading || compileStatus.length > 0) && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              {i18n.t('编译看板')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {compileLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 bg-muted" />)}
              </div>
            ) : compileStatus.filter(({ run }) => run).length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {i18n.t('暂无编译记录')}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {compileStatus
                  .filter(({ run }) => run)
                  .sort((a, b) => {
                    const aRunning = a.run?.status === 'in_progress' || a.run?.status === 'queued';
                    const bRunning = b.run?.status === 'in_progress' || b.run?.status === 'queued';
                    if (aRunning && !bRunning) return -1;
                    if (!aRunning && bRunning) return 1;
                    return new Date(b.run?.created_at || 0).getTime() - new Date(a.run?.created_at || 0).getTime();
                  })
                  .slice(0, 6)
                  .map(({ repo, run }, idx) => {
                    const isRunning = run?.status === 'in_progress' || run?.status === 'queued';
                    return (
                      <button
                        key={`${repo.id}-${run?.id ?? idx}`}
                        type="button"
                        className="w-full px-4 py-2.5 hover:bg-secondary/50 transition-colors text-left flex items-center gap-3"
                        onClick={() => {
                          saveListScroll(DASHBOARD_SCROLL_KEY);
                          navigate(`/repos/${repo.full_name}/actions`);
                        }}
                      >
                        <span className="shrink-0">
                          {isRunning ? (
                            <Loader2 className="w-4 h-4 text-warning animate-spin" />
                          ) : run?.conclusion === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 text-success" />
                          ) : run?.conclusion === 'failure' ? (
                            <XCircle className="w-4 h-4 text-destructive" />
                          ) : (
                            <Clock className="w-4 h-4 text-muted-foreground" />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{repo.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {run?.name} #{run?.run_number}
                            {' · '}
                            {isRunning ? (run?.status === 'queued' ? i18n.t('排队中') : i18n.t('运行中')) : formatRelativeTime(run?.updated_at || run?.created_at || '')}
                          </p>
                        </div>
                      </button>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card border-border h-full flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold text-foreground">{i18n.t('最近仓库')}</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-accent hover:bg-secondary text-xs h-7"
              onClick={() => navigate('/repos')}
            >
              {i18n.t('查看全部')}</Button>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {loading ? (
              <div className="px-4 pb-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 bg-muted rounded-md" />
                ))}
              </div>
            ) : repos.length === 0 ? (
              <div className="px-4 pb-4 text-center text-muted-foreground text-sm py-8">
                {i18n.t('暂无仓库')}</div>
            ) : (
              <div className="divide-y divide-border">
                {repos.map((repo) => (
                  <button
                    key={repo.id}
                    type="button"
                    className="w-full px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
                    onClick={() => {
                      saveListScroll(DASHBOARD_SCROLL_KEY);
                      navigate(`/repos/${repo.full_name}`);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-accent truncate">
                            {user && repo.owner.login.toLowerCase() !== user.login.toLowerCase() && (
                              <>
                                <span className="text-muted-foreground font-normal">{repo.owner.login}</span>
                                <span className="text-muted-foreground font-normal mx-1">/</span>
                              </>
                            )}
                            {repo.name}
                          </span>
                          {repo.private && (
                            <Badge variant="outline" className="text-xs border-border text-muted-foreground h-4 px-1">{i18n.t('私有')}</Badge>
                          )}
                          {repo.fork && (
                            <Badge variant="outline" className="text-xs border-border text-muted-foreground h-4 px-1 shrink-0">Fork</Badge>
                          )}
                        </div>
                        {repo.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate text-pretty">{repo.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1">
                          {repo.language && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: getLanguageColor(repo.language) }}
                              />
                              {repo.language}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Star className="w-3 h-3" />
                            {formatNumber(repo.stargazers_count)}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(repo.pushed_at)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border h-full flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              {i18n.t('最近活动')}</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-y-auto max-h-[400px]">
            {loading ? (
              <div className="px-4 pb-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-10 bg-muted rounded-md" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="px-4 pb-4 text-center text-muted-foreground text-sm py-8">
                {i18n.t('暂无活动记录')}</div>
            ) : (
              <div className="px-4 pb-4 space-y-0">
                {events.map((event, index) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => {
                      saveListScroll(DASHBOARD_SCROLL_KEY);
                      navigate(getEventTargetPath(event));
                    }}
                    className="w-full flex gap-3 py-3 border-b border-border last:border-0 text-left hover:bg-secondary/30 transition-colors -mx-1 px-1 rounded"
                  >
                    <div className="w-1 shrink-0 relative">
                      <div className={`w-2 h-2 rounded-full bg-primary mt-1 -ml-0.5 ${index === 0 ? 'ring-2 ring-primary/20' : ''}`} />
                      {index < events.length - 1 && (
                        <div className="absolute top-3 left-0.5 w-px h-full bg-border" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground text-pretty">{getEventDescription(event)}</p>
                      <span className="text-xs text-muted-foreground mt-0.5 block">
                        {formatRelativeTime(event.created_at)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {(calendarLoading || calendar) && (
        <Card className="bg-card border-border">
          <CardContent className="p-4 md:p-6">
            <ContributionHeatmap calendar={calendar} loading={calendarLoading} />
          </CardContent>
        </Card>
      )}

      {(pinnedLoading || pinnedRepos.length > 0) && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Pin className="w-4 h-4 text-primary" />
              {i18n.t('置顶仓库')}<Badge variant="outline" className="text-xs border-border text-muted-foreground font-normal">GraphQL</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pinnedLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-24 bg-muted rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pinnedRepos.map((repo) => (
                  <PinnedRepoCard key={repo.id} repo={repo} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
    </PullToRefresh>
  );
}
