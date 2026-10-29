
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Info,
  Copy,
  Shield,
  Zap,
  Key,
  Star,
  GitFork,
  AlertCircle,
  AlertTriangle,
  GitPullRequest,
  GitBranch,
  Users,
  Code,
  Clock,
  Globe,
  Lock,
  ExternalLink,
  Plus,
  ChevronRight,
  Tag,
  Upload,
  Package,
  Settings,
  Loader2,
  Play,
  MessageCircle,
  BookOpen,
  LayoutGrid,
  Network,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  getRepo,
  getReadme,
  getFileContent,
  getCommits,
  checkStarred,
  starRepo,
  unstarRepo,
  forkRepo,
  getRepoLanguages,
  formatRelativeTime,
  formatNumber,
  getLanguageColor,
  updateRepo,
  updateFileContent,
  createFileContent,
} from '@/services/github';
import type { GitHubRepo, GitHubCommit } from '@/types/types';
import MarkdownRenderer from '@/components/common/MarkdownRenderer';
import { toast } from 'sonner';
import { decodeBase64Content, copyToClipboard } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { setCurrentRepo } from '@/lib/repo-tracker';
import { pageCache } from '@/lib/page-cache';
import i18n from "@/i18n";
import PullToRefresh from '@/components/common/PullToRefresh';

function encodeBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export default function RepoDetailPage() {
  const location = useLocation();

  const [refreshKey, setRefreshKey] = useState(0);

  const { owner, repo: repoName } = useParams<{ owner: string; repo: string }>();

  useEffect(() => {
    const handleUpdate = () => {

      const cacheKey = `repodetail:v2:${owner}/${repoName}`;
      pageCache.delete(cacheKey);
      setRefreshKey(prev => prev + 1);
    };
    window.addEventListener('repo-data-updated', handleUpdate);
    return () => window.removeEventListener('repo-data-updated', handleUpdate);
  }, [owner, repoName, location.key]);

  useEffect(() => {
    if (owner && repoName) {
      setCurrentRepo(`${owner}/${repoName}`);
    }
  }, [owner, repoName, location.key, refreshKey]);
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [repo, setRepo] = useState<GitHubRepo | null>(null);
  const [readme, setReadme] = useState<string>('');
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [languages, setLanguages] = useState<Record<string, number>>({});
  const [starred, setStarred] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starring, setStarring] = useState(false);
  const [forking, setForking] = useState(false);
  const [forkConfirmOpen, setForkConfirmOpen] = useState(false);
  const [repoInfoOpen, setRepoInfoOpen] = useState(false);
  const [readmeDialogOpen, setReadmeDialogOpen] = useState(false);
  const [readmeDraft, setReadmeDraft] = useState('');
  const [readmeSha, setReadmeSha] = useState('');
  const [savingReadme, setSavingReadme] = useState(false);

  const isOwner = !!(currentUser && owner && currentUser.login.toLowerCase() === owner.toLowerCase());
  const canAdmin = isOwner || !!repo?.permissions?.admin;
  const canPush  = canAdmin || !!repo?.permissions?.push;

    useEffect(() => {
    if (!owner || !repoName) return;

    let cancelled = false;

    const load = async () => {

      setLoading(true);
      setRepo(null);
      setReadme('');

      try {

        const [repoData, langData, readmeData, commitsResult, starredVal] = await Promise.all([
          getRepo(owner, repoName, { fresh: true }),
          getRepoLanguages(owner, repoName, { fresh: true }),
          getReadme(owner, repoName, undefined, { fresh: true }).catch(() => null),
          getCommits(owner, repoName, { per_page: 10 }, { fresh: true }).catch(() => ({ data: [], hasNextPage: false })),
          isOwner ? Promise.resolve(false) : checkStarred(owner, repoName).catch(() => false),
        ]);

        if (cancelled) return;

        setRepo(repoData);
        setLanguages(langData);
        setStarred(starredVal);

        const decoded = readmeData?.content ? decodeBase64Content(readmeData.content) : '';
        setReadme(decoded);
        setCommits(commitsResult.data);
      } catch (err) {
        if (!cancelled) {
          toast.error(i18n.t('加载仓库信息失败'));
          console.error(err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [owner, repoName, location.key, refreshKey]);

  const handleStar = async () => {
    if (!owner || !repoName) return;
    setStarring(true);
    try {
      const cacheKey = `repodetail:v2:${owner}/${repoName}`;
      if (starred) {
        await unstarRepo(owner, repoName);
        setStarred(false);
        setRepo((prev) => {
          const updated = prev ? { ...prev, stargazers_count: prev.stargazers_count - 1 } : prev;
          if (updated) pageCache.set(cacheKey, { repo: updated, languages, readme, commits, starred: false });
          return updated;
        });
        toast.success(i18n.t('已取消收藏'));
      } else {
        await starRepo(owner, repoName);
        setStarred(true);
        setRepo((prev) => {
          const updated = prev ? { ...prev, stargazers_count: prev.stargazers_count + 1 } : prev;
          if (updated) pageCache.set(cacheKey, { repo: updated, languages, readme, commits, starred: true });
          return updated;
        });
        toast.success(i18n.t('已收藏仓库'));
      }
    } catch {
      toast.error(i18n.t('操作失败'));
    } finally {
      setStarring(false);
    }
  };

  const handleFork = async () => {
    if (!owner || !repoName) return;
    setForking(true);
    try {
      const forked = await forkRepo(owner, repoName);
      toast.success(`Fork 成功！新仓库：${forked.full_name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('Fork 失败'));
    } finally {
      setForking(false);
    }
  };

  const confirmFork = async () => {
    setForkConfirmOpen(false);
    await handleFork();
  };

  const openReadmeEdit = async () => {
    if (!owner || !repoName) return;
    try {
      const data = (await getReadme(owner, repoName)) as unknown as {
        content?: string;
        sha?: string;
      };
      const decoded = data?.content ? decodeBase64Content(data.content) : '';
      setReadmeDraft(decoded);
      setReadmeSha((data as any)?.sha || '');
      setReadmeDialogOpen(true);
    } catch (e) {
      toast.error('读取 README 失败');
    }
  };

  const saveReadme = async () => {
    if (!owner || !repoName) return;
    setSavingReadme(true);
    try {

      let latestSha = readmeSha;
      try {
        const data = await getFileContent(owner, repoName, 'README.md');
        latestSha = (data as any)?.sha || '';
      } catch (e) {
        // 如果文件不存在，忽略错误
      }

      const payload = {
        message: 'Update README.md',
        content: encodeBase64Utf8(readmeDraft),
      };

      if (latestSha) {
        await updateFileContent(owner, repoName, 'README.md', { ...payload, sha: latestSha });
      } else {
        await createFileContent(owner, repoName, 'README.md', payload);
      }

      setReadmeSha(latestSha);
      toast.success('README 已保存');
      setReadme(readmeDraft);
      setReadmeDialogOpen(false);

      const cacheKey = `repodetail:v2:${owner}/${repoName}`;
      const cached = pageCache.get<any>(cacheKey);
      if (cached) {
        pageCache.set(cacheKey, { ...cached, readme: readmeDraft });
      }
    } catch (e) {
      toast.error('保存失败：' + (e instanceof Error ? e.message : '未知错误'));
    } finally {
      setSavingReadme(false);
    }
  };

  const totalBytes = Object.values(languages).reduce((a, b) => a + b, 0);
  const langEntries = Object.entries(languages).sort(([, a], [, b]) => b - a).slice(0, 6);

  if (loading) {
  return (

      <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-64 bg-muted" />
        <Skeleton className="h-4 w-96 bg-muted" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 bg-muted" />
          <Skeleton className="h-9 w-24 bg-muted" />
        </div>
        <Skeleton className="h-48 w-full bg-muted" />
      </div>

    );
  }

  if (!repo) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
        <p className="text-foreground font-medium">{i18n.t('仓库不存在或无权访问')}</p>
        <Button
          variant="outline"
          className="mt-4 border-border hover:bg-secondary"
          onClick={() => navigate('/repos')}
        >
          {i18n.t('返回仓库列表')}</Button>
      </div>
    );
  }

  const handleRefresh = async () => {
    if (!owner || !repoName) return;
    try {
      const [repoData, langData, readmeData, commitsResult, starredVal] = await Promise.all([
        getRepo(owner, repoName, { fresh: true }),
        getRepoLanguages(owner, repoName, { fresh: true }),
        getReadme(owner, repoName, undefined, { fresh: true }).catch(() => null),
        getCommits(owner, repoName, { per_page: 10 }, { fresh: true }).catch(() => ({ data: [], hasNextPage: false })),
        isOwner ? Promise.resolve(false) : checkStarred(owner, repoName).catch(() => false),
      ]);

      setRepo(repoData);
      setLanguages(langData);
      setStarred(starredVal);
      const decoded = readmeData?.content ? decodeBase64Content(readmeData.content) : '';
      setReadme(decoded);
      setCommits(commitsResult.data);
      // 刷新成功，静默更新不弹提示
    } catch (err) {
      toast.error(i18n.t('刷新失败'));
    }
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <TooltipProvider>
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button
            type="button"
            className="hover:text-accent transition-colors"
            onClick={() => navigate('/repos')}
          >
            {i18n.t('仓库')}</button>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground truncate">{repo.full_name}</span>
        </div>
        <div className="flex flex-col gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground text-balance">{repo.full_name}</h1>
              {!isOwner && (
                <button
                  type="button"
                  onClick={() => navigate(`/users/${repo.owner.login}/repos`)}
                  className="text-xs text-muted-foreground hover:text-accent hover:underline flex items-center gap-1 transition-colors"
                >
                  {i18n.t('查看')}{repo.owner.login}{i18n.t('的其他仓库')} →
                </button>
              )}
              <Badge variant="outline" className="border-border text-muted-foreground text-xs">
                {repo.private ? <><Lock className="w-3 h-3 mr-1" />{i18n.t('私有')}</> : <><Globe className="w-3 h-3 mr-1" />{i18n.t('公开')}</>}
              </Badge>
              {repo.archived && (
                <Badge variant="outline" className="border-warning text-warning text-xs">{i18n.t('已归档')}</Badge>
              )}
              {isOwner && (
                <Badge
                  variant="outline"
                  className="border-border text-muted-foreground text-xs cursor-pointer hover:bg-secondary/50 transition-colors"
                  onClick={() => setRepoInfoOpen(true)}
                  title={i18n.t('查看仓库详细信息')}
                >
                  {i18n.t('我的仓库')}
                </Badge>
              )}
            </div>
            {repo.description && (
              <p className="text-sm text-muted-foreground mt-1 text-pretty">{repo.description}</p>
            )}

            {repo.topics && repo.topics.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {repo.topics.map((topic) => (
                  <Badge
                    key={topic}
                    variant="outline"
                    className="border-accent/40 text-accent bg-accent/10 text-xs cursor-pointer hover:bg-accent/20 transition-colors"
                    onClick={() => navigate(`/search?q=${encodeURIComponent(topic)}`)}
                  >
                    {topic}
                  </Badge>
                ))}
              </div>
            )}

            {repo.fork && (repo.parent || repo.source) && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <GitFork className="w-3 h-3 shrink-0" />
                {i18n.t('Fork 自')}
                <button
                  type="button"
                  onClick={() => navigate(`/repos/${(repo.parent || repo.source)!.full_name}`)}
                  className="text-primary hover:underline font-mono"
                >
                  {(repo.parent || repo.source)!.full_name}
                </button>
              </p>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0 justify-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-muted-foreground hover:bg-secondary"
                >
                  <a href={repo.html_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-popover border-border text-foreground text-xs">{i18n.t('在 GitHub 中查看')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-muted-foreground hover:bg-secondary"
                  onClick={() => { copyToClipboard(repo.html_url); toast.success(i18n.t('已复制仓库地址')); }}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-popover border-border text-foreground text-xs">{i18n.t('复制仓库地址')}</TooltipContent>
            </Tooltip>

            {canAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 text-muted-foreground hover:bg-secondary"
                    onClick={() => navigate(`/repos/${owner}/${repoName}/deploy-keys`)}
                  >
                    <Key className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-popover border-border text-foreground text-xs">{i18n.t('部署密钥')}</TooltipContent>
              </Tooltip>
            )}

            {canAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 text-muted-foreground hover:bg-secondary"
                    onClick={() => navigate(`/repos/${owner}/${repoName}/secrets-variables`)}
                  >
                    <Shield className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-popover border-border text-foreground text-xs">{i18n.t('机密和变量')}</TooltipContent>
              </Tooltip>
            )}
            {canAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 text-muted-foreground hover:bg-secondary"
                    onClick={() => navigate(`/repos/${owner}/${repoName}/actions-settings`)}
                  >
                    <Zap className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-popover border-border text-foreground text-xs">{i18n.t('Actions 设置')}</TooltipContent>
              </Tooltip>
            )}
            {canAdmin && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:bg-secondary" onClick={() => navigate(`/repos/${owner}/${repoName}/settings`)}>
                      <Settings className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-popover border-border text-foreground text-xs">{i18n.t('编辑仓库设置')}</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!isOwner && (
          <>
            <Button
              variant="outline"
              size="sm"
              className={`border-border h-8 ${starred ? 'text-warning border-warning' : 'text-foreground hover:bg-secondary'}`}
              onClick={handleStar}
              disabled={starring}
            >
              <Star className={`w-3.5 h-3.5 mr-1.5 ${starred ? 'fill-warning' : ''}`} />
              {starred ? i18n.t('已收藏') : i18n.t('收藏')}
              <button
                type="button"
                className="ml-1.5 text-xs text-muted-foreground hover:text-accent hover:underline"
                onClick={(e) => { e.stopPropagation(); navigate(`/repos/${repo.full_name}/stargazers`); }}
              >
                {formatNumber(repo.stargazers_count)}
              </button>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-border hover:bg-secondary h-8"
              onClick={() => setForkConfirmOpen(true)}
              disabled={forking}
            >
              {forking
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{i18n.t('Fork 中')}</>
                : <><GitFork className="w-3.5 h-3.5 mr-1.5" />Fork</>
              }
              <span className="ml-1.5 text-xs text-muted-foreground">{formatNumber(repo.forks_count)}</span>
            </Button>
          </>
        )}
        {isOwner && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="border-border hover:bg-secondary h-8"
              onClick={() => navigate(`/repos/${repo.full_name}/stargazers`)}
            >
              <Star className="w-3.5 h-3.5 mr-1.5 text-warning" />
              {i18n.t('收藏者')}<span className="ml-1.5 text-xs text-muted-foreground">{formatNumber(repo.stargazers_count)}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-border hover:bg-secondary h-8"
              onClick={() => navigate(`/repos/${repo.full_name}/forks`)}
            >
              <Network className="w-3.5 h-3.5 mr-1.5" />
              {i18n.t('查看 Forks')}<span className="ml-1.5 text-xs text-muted-foreground">{formatNumber(repo.forks_count)}</span>
            </Button>
          </>
        )}
        {repo.license && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Tag className="w-3.5 h-3.5" />
            {repo.license.spdx_id}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          { label: i18n.t('代码浏览'),        icon: Code,           path: 'code',          count: null,                   permission: 'read' as const },
          { label: i18n.t('产物下载'),        icon: Package,        path: 'artifacts',     count: null,                   permission: 'read' as const },
          { label: i18n.t('Pages 部署'),      icon: Globe,          path: 'pages',         count: null,                   permission: 'push' as const },
          { label: 'Issues',          icon: AlertCircle,    path: 'issues',        count: repo.open_issues_count, permission: 'read' as const },
          { label: 'Pull Requests',   icon: GitPullRequest, path: 'pulls',         count: null,                   permission: 'read' as const },
          { label: i18n.t('提交历史'),        icon: Clock,          path: 'commits',       count: null,                   permission: 'read' as const },
          { label: canPush ? i18n.t('分支管理') : i18n.t('分支浏览'), icon: GitBranch, path: 'branches', count: null, permission: 'read' as const },
          { label: 'Actions',         icon: Play,           path: 'actions',       count: null,                   permission: 'read' as const },
          { label: i18n.t('协作者'),          icon: Users,          path: 'collaborators', count: null,                   permission: 'admin' as const },
          { label: i18n.t('上传文件'),        icon: Upload,         path: 'upload',        count: null,                   permission: 'push' as const },
          { label: 'Discussions',     icon: MessageCircle,  path: 'discussions',   count: null,                   permission: 'read' as const },
          { label: 'Wiki',            icon: BookOpen,       path: 'wiki',          count: null,                   permission: 'read' as const },
          { label: 'Projects',        icon: LayoutGrid,     path: 'projects',      count: null,                   permission: 'read' as const },
        ] as Array<{ label: string; icon: React.ElementType; path: string; count: number | null; permission: 'read' | 'push' | 'admin' }>)
          .filter((item) => {
        if (item.permission === 'admin') return canAdmin;
        if (item.permission === 'push') return canPush;
        return true;
      })
          .map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                type="button"
                className="bg-card border border-border rounded-lg p-3 hover:bg-secondary/50 transition-colors text-left group"
                onClick={() => navigate(`/repos/${repo.full_name}/${item.path}`)}
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-muted-foreground group-hover:text-accent transition-colors shrink-0" />
                  <span className="text-sm text-foreground group-hover:text-accent transition-colors truncate">{item.label}</span>
                  {item.count !== null && (
                    <Badge variant="outline" className="ml-auto border-border text-muted-foreground text-xs shrink-0">
                      {item.count}
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}

        {!isOwner && (
          <button
            type="button"
            className="bg-card border border-border rounded-lg p-3 hover:bg-secondary/50 transition-colors text-left group"
            onClick={() => navigate(`/repos/${repo.full_name}/forks`)}
          >
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-muted-foreground group-hover:text-accent transition-colors shrink-0" />
              <span className="text-sm text-foreground group-hover:text-accent transition-colors truncate">{i18n.t('Fork 列表')}</span>
              <Badge variant="outline" className="ml-auto border-border text-muted-foreground text-xs shrink-0">
                {formatNumber(repo.forks_count)}
              </Badge>
            </div>
          </button>
        )}
      </div>

      <Tabs defaultValue="readme" className="space-y-4">
        <TabsList className="bg-secondary border border-border">
          <TabsTrigger value="readme" className="data-[state=active]:bg-card data-[state=active]:text-foreground text-muted-foreground">
            README
          </TabsTrigger>
          <TabsTrigger value="commits" className="data-[state=active]:bg-card data-[state=active]:text-foreground text-muted-foreground">
            {i18n.t('最近提交')}</TabsTrigger>
          <TabsTrigger value="stats" className="data-[state=active]:bg-card data-[state=active]:text-foreground text-muted-foreground">
            {i18n.t('统计')}</TabsTrigger>
        </TabsList>

        <TabsContent value="readme">
          <Card className="bg-card border-border">
            <CardContent className="p-6">
              {readme && (
                <div className="flex justify-end -mt-4 -mr-4 mb-1 gap-1">
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-0.5" onClick={() => {
                    navigator.clipboard.writeText(readme);
                    toast.success(i18n.t('README 源码已复制'));
                  }}>
                    <Copy className="w-2 h-2" style={{ width: 10, height: 10 }} />{i18n.t('复制')}
                  </Button>
                  {canPush && (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-0.5" onClick={openReadmeEdit}>
                      <Pencil className="w-2 h-2" style={{ width: 10, height: 10 }} />{i18n.t('编辑')}
                    </Button>
                  )}
                </div>
              )}
              {readme ? (
                <MarkdownRenderer
                  content={readme}
                  repoContext={repo ? { owner: repo.owner.login, repo: repo.name, branch: repo.default_branch } : undefined}
                  onLinkClick={async (href) => {
                    if (!href) return false;

                    if (href.startsWith('#')) return false;

                    if (/^(https?:|mailto:|tel:)/.test(href)) {
                      window.open(href, '_blank');
                      return true;
                    }

                    if (href.endsWith('.md') || href.toLowerCase().includes('readme')) {
                      try {
                        toast.loading('正在切换语言...', { id: 'lang-switch' });
                        const cleanPath = href.replace(/^\.\//, '').replace(/^\//, '');

                        const res = await getFileContent(
                          repo?.owner.login || '',
                          repo?.name || '',
                          cleanPath,
                          repo?.default_branch
                        );

                        if (res && res.content) {
                          const decoded = decodeBase64Content(res.content);
                          setReadme(decoded);
                          toast.success('语言已切换', { id: 'lang-switch' });
                        } else {
                          toast.error('未找到该语言文件', { id: 'lang-switch' });
                        }
                      } catch (e) {
                        toast.error('切换失败，文件可能不存在', { id: 'lang-switch' });
                      }
                      return true;
                    }

                    return false;
                  }}
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Code className="w-10 h-10 mx-auto mb-3" />
                  <p>{i18n.t('暂无 README')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commits">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              {commits.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">{i18n.t('暂无提交记录')}</div>
              ) : (
                <div className="divide-y divide-border">
                  {commits.map((commit) => (
                    <div key={commit.sha} className="p-4 hover:bg-secondary/50 transition-colors">
                      <div className="flex items-start gap-3">
                        <Avatar className="w-7 h-7 shrink-0">
                          <AvatarImage src={commit.author?.avatar_url} loading="lazy" />
                          <AvatarFallback className="bg-secondary text-xs">
                            {commit.commit.author.name.substring(0, 1)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground font-medium line-clamp-1 text-balance">
                            {commit.commit.message.split('\n')[0]}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-muted-foreground">
                              {commit.commit.author.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(commit.commit.author.date)}
                            </span>
                          </div>
                        </div>
                        <a
                          href={commit.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <code className="text-xs bg-secondary border border-border px-2 py-1 rounded font-mono text-accent hover:bg-secondary/80">
                            {commit.sha.substring(0, 7)}
                          </code>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <div className="text-center mt-3">
            <Button
              variant="outline"
              size="sm"
              className="border-border hover:bg-secondary"
              onClick={() => navigate(`/repos/${repo.full_name}/commits`)}
            >
              {i18n.t('查看全部提交')}<ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="stats">
          <div className="space-y-4">
            <Card className="bg-card border-border">
              <CardContent className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: i18n.t('默认分支'), value: repo.default_branch, icon: GitBranch },
                  { label: i18n.t('最近推送'), value: formatRelativeTime(repo.pushed_at), icon: Clock },
                  { label: i18n.t('仓库大小'), value: `${(repo.size / 1024).toFixed(1)} MB`, icon: Code },
                ].map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div key={stat.label} className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Icon className="w-3 h-3" />
                        {stat.label}
                      </div>
                      <p className="text-sm font-medium text-foreground">{stat.value}</p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {langEntries.length > 0 && (
              <Card className="bg-card border-border">
                <CardContent className="p-4 space-y-3">
                  <h3 className="text-sm font-medium text-foreground">{i18n.t('编程语言')}</h3>
                  <div className="flex h-2 rounded-full overflow-hidden gap-px">
                    {langEntries.map(([lang, bytes]) => (
                      <div
                        key={lang}
                        className="h-full first:rounded-l-full last:rounded-r-full"
                        style={{
                          width: `${(bytes / totalBytes) * 100}%`,
                          backgroundColor: getLanguageColor(lang),
                        }}
                        title={`${lang}: ${((bytes / totalBytes) * 100).toFixed(1)}%`}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {langEntries.map(([lang, bytes]) => (
                      <div key={lang} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: getLanguageColor(lang) }}
                        />
                        <span className="text-foreground">{lang}</span>
                        <span>{((bytes / totalBytes) * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {repo.topics && repo.topics.length > 0 && (
              <Card className="bg-card border-border">
                <CardContent className="p-4 space-y-2">
                  <h3 className="text-sm font-medium text-foreground">Topics</h3>
                  <div className="flex flex-wrap gap-2">
                    {repo.topics.map((topic) => (
                      <Badge
                        key={topic}
                        variant="outline"
                        className="border-accent/40 text-accent bg-accent/10 text-xs cursor-pointer hover:bg-accent/20 transition-colors"
                        onClick={() => navigate(`/search?q=${encodeURIComponent(topic)}`)}
                      >
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={repoInfoOpen} onOpenChange={setRepoInfoOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border p-4 flex flex-col max-h-[85vh] gap-2">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Info className="w-5 h-5 text-primary" />
              {i18n.t('仓库详细信息')}
            </DialogTitle>
          </DialogHeader>
                    {repo && (
            <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-1 [&::-webkit-scrollbar]:hidden pb-1" style={{ scrollbarWidth: 'none' }}>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-foreground font-mono break-all leading-tight">{repo.full_name}</h2>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="bg-secondary/50 text-muted-foreground border-none">
                    {repo.private ? <><Lock className="w-3 h-3 mr-1" />{i18n.t('私有')}</> : <><Globe className="w-3 h-3 mr-1" />{i18n.t('公开')}</>}
                  </Badge>
                  {repo.archived && <Badge variant="outline" className="bg-warning/10 text-warning border-none">{i18n.t('已归档')}</Badge>}
                  {repo.fork && <Badge variant="outline" className="bg-secondary/50 text-muted-foreground border-none">Fork</Badge>}
                  {repo.license && <Badge variant="outline" className="bg-secondary/50 text-muted-foreground border-none">{repo.license.name}</Badge>}
                </div>
              </div>

              {repo.description && (
                <p className="text-sm text-foreground/80 leading-normal whitespace-pre-wrap break-words">
                  {repo.description}
                </p>
              )}

              <div className="grid grid-cols-4 gap-2 py-3 border-y border-border/50">
                <div className="flex flex-col items-center justify-center">
                  <span className="text-lg font-bold text-foreground">{formatNumber(repo.stargazers_count)}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Stars</span>
                </div>
                <div className="flex flex-col items-center justify-center border-l border-border/50">
                  <span className="text-lg font-bold text-foreground">{formatNumber(repo.forks_count)}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Forks</span>
                </div>
                <div className="flex flex-col items-center justify-center border-l border-border/50">
                  <span className="text-lg font-bold text-foreground">{formatNumber(repo.watchers_count)}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Watch</span>
                </div>
                <div className="flex flex-col items-center justify-center border-l border-border/50">
                  <span className="text-lg font-bold text-foreground">{formatNumber(repo.open_issues_count)}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Issues</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                {repo.language && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{i18n.t('主要语言')}</span>
                    <span className="text-foreground font-medium flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getLanguageColor(repo.language) }} />
                      {repo.language}
                    </span>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{i18n.t('默认分支')}</span>
                  <span className="text-foreground font-mono font-medium">{repo.default_branch}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{i18n.t('大小')}</span>
                  <span className="text-foreground font-medium">{(repo.size / 1024).toFixed(2)} MB</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{i18n.t('最后推送')}</span>
                  <span className="text-foreground font-medium">{formatRelativeTime(repo.pushed_at)}</span>
                </div>
              </div>

              {repo.homepage && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{i18n.t('主页')}</span>
                  <a href={repo.homepage} target="_blank" rel="noopener noreferrer" className="text-primary text-sm hover:underline break-all truncate">
                    {repo.homepage}
                  </a>
                </div>
              )}

              {repo.topics && repo.topics.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {repo.topics.map((t) => (
                    <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">{t}</span>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{i18n.t('克隆地址')}</span>
                <div className="bg-secondary/30 border border-border rounded-lg p-1 flex items-center gap-2">
                  <code className="text-foreground font-mono text-xs break-all flex-1 pl-2 select-all">{repo.clone_url}</code>
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:bg-background shrink-0" onClick={() => { copyToClipboard(repo.clone_url); toast.success(i18n.t('已复制')); }}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="bg-secondary/30 border border-border rounded-lg p-1 flex items-center gap-2">
                  <code className="text-foreground font-mono text-xs break-all flex-1 pl-2 select-all">{repo.ssh_url}</code>
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:bg-background shrink-0" onClick={() => { copyToClipboard(repo.ssh_url); toast.success(i18n.t('已复制')); }}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          <div className="pt-1 mt-auto shrink-0">
            <Button variant="secondary" className="w-full h-10 font-medium bg-secondary hover:bg-secondary/80 text-foreground rounded-xl transition-colors" onClick={() => setRepoInfoOpen(false)}>{i18n.t('关闭')}</Button>
          </div>
        </DialogContent>
      </Dialog>

        <Dialog open={readmeDialogOpen} onOpenChange={setReadmeDialogOpen}>
          <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2">
                <Pencil className="w-4 h-4" />编辑 README.md
              </DialogTitle>
            </DialogHeader>
            <Textarea
              value={readmeDraft}
              onChange={(e) => setReadmeDraft(e.target.value)}
              className="bg-secondary border-border text-foreground font-mono text-xs min-h-[400px] max-h-[60vh]"
              placeholder={"# 标题\n\n支持 Markdown 语法"}
            />
            <DialogFooter className="flex flex-row justify-end gap-3 mt-6 sm:space-x-0" >
              <Button className="min-w-[80px] px-4" variant="outline" size="sm" onClick={() => setReadmeDialogOpen(false)} disabled={savingReadme}>
                取消
              </Button>
              <Button className="min-w-[80px] px-4" size="sm" onClick={saveReadme} disabled={savingReadme}>
                {savingReadme ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />保存中…</> : '保存'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      <AlertDialog open={forkConfirmOpen} onOpenChange={setForkConfirmOpen}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-primary" />
              {i18n.t('Fork 仓库')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm">
              {i18n.t('将把此仓库 Fork 到你的账号下。')}
              <code className="block mt-2 font-mono text-foreground bg-secondary px-2 py-1.5 rounded text-xs break-all">
                {owner}/{repoName}
              </code>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-row justify-end gap-3 mt-6 sm:space-x-0">
            <AlertDialogCancel className="min-w-[80px] px-4 border-border hover:bg-secondary">{i18n.t('取消')}</AlertDialogCancel>
            <AlertDialogAction
              className="min-w-[100px] px-6 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={(e) => { e.preventDefault(); confirmFork(); }}
            >
              {i18n.t('确认 Fork')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
    </TooltipProvider>
    </PullToRefresh>

  );
}
