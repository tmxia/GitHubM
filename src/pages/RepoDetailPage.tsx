// 仓库详情页

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
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
  ChevronRight,
  Tag,
  Upload,
  Package,
  Trash2,
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
  getCommits,
  checkStarred,
  starRepo,
  unstarRepo,
  forkRepo,
  getRepoLanguages,
  formatRelativeTime,
  formatNumber,
  getLanguageColor,
  deleteRepo,
  updateRepo,
  updateFileContent,
  createFileContent,
} from '@/services/github';
import type { GitHubRepo, GitHubCommit } from '@/types/types';
import MarkdownRenderer from '@/components/common/MarkdownRenderer';
import { toast } from 'sonner';
import { decodeBase64Content } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { pageCache } from '@/lib/page-cache';
import i18n from "@/i18n";

// UTF-8 安全的 Base64 编码（GitHub contents API 要求）
function encodeBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export default function RepoDetailPage() {
  const { owner, repo: repoName } = useParams<{ owner: string; repo: string }>();
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editDesc, setEditDesc] = useState('');
  const [editPrivate, setEditPrivate] = useState(false);
  const [editRepoName, setEditRepoName] = useState('');
  const [updating, setUpdating] = useState(false);
  const [editHomepage, setEditHomepage] = useState('');
  const [editHasIssues, setEditHasIssues] = useState(true);
  const [editHasWiki, setEditHasWiki] = useState(true);
  const [editHasProjects, setEditHasProjects] = useState(true);
  const [editHasDownloads, setEditHasDownloads] = useState(true);
  const [editAllowSquash, setEditAllowSquash] = useState(true);
  const [editAllowMerge, setEditAllowMerge] = useState(true);
  const [editAllowRebase, setEditAllowRebase] = useState(true);
  const [editAllowAuto, setEditAllowAuto] = useState(false);
  const [editDeleteBranchOnMerge, setEditDeleteBranchOnMerge] = useState(false);
  // README 编辑
  const [readmeDialogOpen, setReadmeDialogOpen] = useState(false);
  const [readmeDraft, setReadmeDraft] = useState('');
  const [readmeSha, setReadmeSha] = useState('');
  const [savingReadme, setSavingReadme] = useState(false);

  // 判断当前用户是否为仓库所有者
  const isOwner = !!(currentUser && owner && currentUser.login.toLowerCase() === owner.toLowerCase());

  useEffect(() => {
    if (!owner || !repoName) return;

    const cacheKey = `repodetail:${owner}/${repoName}`;

    // 命中缓存：立即恢复所有数据，不展示 loading
    const cached = pageCache.get<{
      repo: GitHubRepo;
      languages: Record<string, number>;
      readme: string;
      commits: GitHubCommit[];
      starred: boolean;
    }>(cacheKey);
    if (cached) {
      setRepo(cached.repo);
      setLanguages(cached.languages);
      setReadme(cached.readme);
      setCommits(cached.commits);
      setStarred(cached.starred);
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const [repoData, langData] = await Promise.all([
          getRepo(owner, repoName),
          getRepoLanguages(owner, repoName),
        ]);
        setRepo(repoData);
        setLanguages(langData);

        // 非仓库所有者才需要检查 star 状态
        let starredVal = false;
        if (!isOwner) {
          starredVal = await checkStarred(owner, repoName).catch(() => false);
          setStarred(starredVal);
        }

        // 加载 README 和提交记录（不阻塞主内容）
        Promise.all([
          getReadme(owner, repoName).catch(() => null),
          getCommits(owner, repoName, { per_page: 10 }).catch(() => ({ data: [], hasNextPage: false })),
        ]).then(([readmeData, commitsResult]) => {
          const decoded = readmeData?.content ? decodeBase64Content(readmeData.content) : '';
          setReadme(decoded);
          setCommits(commitsResult.data);
          // 所有数据就绪后写入缓存
          pageCache.set(cacheKey, {
            repo: repoData,
            languages: langData,
            readme: decoded,
            commits: commitsResult.data,
            starred: starredVal,
          });
        });
      } catch (err) {
        toast.error(i18n.t('加载仓库信息失败'));
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [owner, repoName, isOwner]);

  const handleStar = async () => {
    if (!owner || !repoName) return;
    setStarring(true);
    try {
      const cacheKey = `repodetail:${owner}/${repoName}`;
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

  // 删除仓库
  const handleDeleteRepo = async () => {
    if (!owner || !repoName) return;
    if (deleteConfirmName !== repoName) { toast.error(i18n.t('仓库名称不一致')); return; }
    setDeleting(true);
    try {
      await deleteRepo(owner, repoName);
      pageCache.delete(`repodetail:${owner}/${repoName}`);
      pageCache.invalidate('repos:'); // 使仓库列表缓存失效
      toast.success(`已删除仓库 ${repoName}`);
      navigate('/repos');
    } catch (err) { toast.error(err instanceof Error ? err.message : i18n.t('删除失败')); }
    finally { setDeleting(false); }
  };

  // 修改仓库信息
  const handleUpdateRepo = async () => {
    if (!owner || !repoName) return;
    setUpdating(true);
    try {
      const updated = await updateRepo(owner, repoName, {
        name: editRepoName.trim() || repoName,
        description: editDesc,
        private: editPrivate,
        homepage: editHomepage.trim(),
        has_issues: editHasIssues,
        has_wiki: editHasWiki,
        has_projects: editHasProjects,
        has_downloads: editHasDownloads,
        allow_squash_merge: editAllowSquash,
        allow_merge_commit: editAllowMerge,
        allow_rebase_merge: editAllowRebase,
        allow_auto_merge: editAllowAuto,
        delete_branch_on_merge: editDeleteBranchOnMerge,
      });
      setRepo(updated);
      // 更新缓存中的仓库信息
      const cacheKey = `repodetail:${owner}/${repoName}`;
      const cached = pageCache.get<{ repo: GitHubRepo; languages: Record<string, number>; readme: string; commits: GitHubCommit[]; starred: boolean }>(cacheKey);
      if (cached) pageCache.set(cacheKey, { ...cached, repo: updated });
      pageCache.invalidate('repos:');
      toast.success(i18n.t('仓库信息已更新'));
      setEditDialogOpen(false);
      if (editRepoName.trim() && editRepoName.trim() !== repoName) navigate(`/repos/${owner}/${editRepoName.trim()}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : i18n.t('更新失败')); }
    finally { setUpdating(false); }
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
      setReadmeSha(data?.sha || '');
      setReadmeDialogOpen(true);
    } catch (e) {
      toast.error('读取 README 失败');
    }
  };

  const saveReadme = async () => {
    if (!owner || !repoName) return;
    setSavingReadme(true);
    try {
      const payload = {
        message: 'Update README.md',
        content: encodeBase64Utf8(readmeDraft),
      };
      if (readmeSha) {
        await updateFileContent(owner, repoName, 'README.md', { ...payload, sha: readmeSha });
      } else {
        await createFileContent(owner, repoName, 'README.md', payload);
      }
      toast.success('README 已保存');
      setReadme(readmeDraft);
      setReadmeDialogOpen(false);
      pageCache.delete(`repodetail:${owner}/${repoName}`);
    } catch (e) {
      toast.error('保存失败：' + (e instanceof Error ? e.message : '未知错误'));
    } finally {
      setSavingReadme(false);
    }
  };

  const openEditDialog = () => {
    if (!repo) return;
    setEditDesc(repo.description || '');
    setEditPrivate(repo.private);
    setEditRepoName(repo.name);
    setEditHomepage(repo.homepage || '');
    setEditHasIssues(repo.has_issues ?? true);
    setEditHasWiki(repo.has_wiki ?? true);
    setEditHasProjects(repo.has_projects ?? true);
    setEditHasDownloads(repo.has_downloads ?? true);
    setEditAllowSquash(repo.allow_squash_merge ?? true);
    setEditAllowMerge(repo.allow_merge_commit ?? true);
    setEditAllowRebase(repo.allow_rebase_merge ?? true);
    setEditAllowAuto(repo.allow_auto_merge ?? false);
    setEditDeleteBranchOnMerge(repo.delete_branch_on_merge ?? false);
    setEditDialogOpen(true);
  };

  // 计算语言占比
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

  return (
    <TooltipProvider>
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      {/* 仓库标题 */}
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
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground text-balance">{repo.full_name}</h1>
              <Badge variant="outline" className="border-border text-muted-foreground text-xs">
                {repo.private ? <><Lock className="w-3 h-3 mr-1" />{i18n.t('私有')}</> : <><Globe className="w-3 h-3 mr-1" />{i18n.t('公开')}</>}
              </Badge>
              {repo.archived && (
                <Badge variant="outline" className="border-warning text-warning text-xs">{i18n.t('已归档')}</Badge>
              )}
              {/* 身份标识 */}
              {isOwner && (
                <Badge className="bg-primary/15 text-primary border border-primary/30 text-xs">{i18n.t('我的仓库')}</Badge>
              )}
            </div>
            {repo.description && (
              <p className="text-sm text-muted-foreground mt-1 text-pretty">{repo.description}</p>
            )}
          </div>

          {/* 右侧操作按钮区 —— 根据 isOwner 动态显示 */}
          <div className="flex items-center gap-1 shrink-0">
            <a href={repo.html_url} target="_blank" rel="noopener noreferrer">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:bg-secondary" title={i18n.t('在 GitHub 中查看')}>
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-popover border-border text-foreground text-xs">{i18n.t('在 GitHub 中查看')}</TooltipContent>
              </Tooltip>
            </a>
            {/* 仅自己的仓库显示编辑和删除 */}
            {isOwner && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:bg-secondary" onClick={openEditDialog}>
                      <Settings className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-popover border-border text-foreground text-xs">{i18n.t('编辑仓库设置')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-destructive/70 hover:bg-destructive/10 hover:text-destructive" onClick={() => { setDeleteConfirmName(''); setDeleteDialogOpen(true); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-popover border-border text-foreground text-xs">{i18n.t('删除仓库')}</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 统计行 —— 根据 isOwner 显示不同操作 */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 他人仓库：显示 Star 和 Fork 操作按钮 */}
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
              onClick={handleFork}
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
        {/* 自己的仓库：Star/Fork 数只读展示 + 查看 Forks 按钮 */}
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

      {/* 功能导航网格 —— 统一数组，ownerOnly 字段按 isOwner 过滤 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          // ── 前列：高频入口（所有人可见）──
          { label: i18n.t('代码浏览'),        icon: Code,           path: 'code',          count: null,                   ownerOnly: false },
          { label: i18n.t('产物下载'),        icon: Package,        path: 'artifacts',     count: null,                   ownerOnly: false },
          // ── 前列：管理入口（仅 owner）──
          { label: i18n.t('Pages 部署'),      icon: Globe,          path: 'pages',         count: null,                   ownerOnly: true  },
          // ── 核心协作功能（所有人可见）──
          { label: 'Issues',          icon: AlertCircle,    path: 'issues',        count: repo.open_issues_count, ownerOnly: false },
          { label: 'Pull Requests',   icon: GitPullRequest, path: 'pulls',         count: null,                   ownerOnly: false },
          { label: i18n.t('提交历史'),        icon: Clock,          path: 'commits',       count: null,                   ownerOnly: false },
          { label: isOwner ? i18n.t('分支管理') : i18n.t('分支浏览'), icon: GitBranch, path: 'branches', count: null,             ownerOnly: false },
          { label: 'Actions',         icon: Play,           path: 'actions',       count: null,                   ownerOnly: false },
          // ── 管理功能（仅 owner）──
          { label: i18n.t('协作者'),          icon: Users,          path: 'collaborators', count: null,                   ownerOnly: true  },
          { label: i18n.t('上传文件'),        icon: Upload,         path: 'upload',        count: null,                   ownerOnly: true  },
          // ── 社区功能（所有人可见）──
          { label: 'Discussions',     icon: MessageCircle,  path: 'discussions',   count: null,                   ownerOnly: false },
          { label: 'Wiki',            icon: BookOpen,       path: 'wiki',          count: null,                   ownerOnly: false },
          { label: 'Projects',        icon: LayoutGrid,     path: 'projects',      count: null,                   ownerOnly: false },
        ] as Array<{ label: string; icon: React.ElementType; path: string; count: number | null; ownerOnly: boolean }>)
          .filter((item) => !item.ownerOnly || isOwner)
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

        {/* 他人仓库：查看 Forks 列表 */}
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

      {/* 主内容标签 */}
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

        {/* README */}
        <TabsContent value="readme">
          <Card className="bg-card border-border">
            <CardContent className="p-6">
              {isOwner && (
                <div className="flex justify-end -mt-4 -mr-4 mb-1">
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-0.5" onClick={openReadmeEdit}>
                    <Pencil className="w-2 h-2" style={{ width: 10, height: 10 }} />{i18n.t('编辑')}
                  </Button>
                </div>
              )}
              {readme ? (
                <MarkdownRenderer content={readme} />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Code className="w-10 h-10 mx-auto mb-3" />
                  <p>{i18n.t('暂无 README')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 最近提交 */}
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
                          <AvatarImage src={commit.author?.avatar_url} />
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

        {/* 统计 */}
        <TabsContent value="stats">
          <div className="space-y-4">
            {/* 仓库信息 */}
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

            {/* 语言统计 */}
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

            {/* Topics */}
            {repo.topics && repo.topics.length > 0 && (
              <Card className="bg-card border-border">
                <CardContent className="p-4 space-y-2">
                  <h3 className="text-sm font-medium text-foreground">Topics</h3>
                  <div className="flex flex-wrap gap-2">
                    {repo.topics.map((topic) => (
                      <Badge key={topic} variant="outline" className="border-accent/40 text-accent bg-accent/10 text-xs">
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

        {/* README 编辑弹窗 */}
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
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setReadmeDialogOpen(false)} disabled={savingReadme}>
                取消
              </Button>
              <Button size="sm" onClick={saveReadme} disabled={savingReadme}>
                {savingReadme ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />保存中…</> : '保存'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      {/* ── 删除仓库确认对话框（仅 owner 可触发） ── */}
      {isOwner && (
        <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => { if (!open) { setDeleteDialogOpen(false); setDeleteConfirmName(''); } }}>
          <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />{i18n.t('删除仓库')}</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground text-sm space-y-2">
                <span>{i18n.t('此操作将永久删除')}</span>
                <code className="font-mono text-foreground bg-secondary px-1.5 py-0.5 rounded text-xs">{`${owner}/${repoName}`}</code>
                <span>{i18n.t('，包括所有代码、Issues、PR 等，且不可恢复。')}</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="px-1 py-2 space-y-1.5">
              <Label className="text-sm font-normal text-foreground">
                {i18n.t('请输入仓库名称')}<code className="font-mono bg-secondary px-1 rounded text-xs">{repoName}</code> {i18n.t('确认删除')}</Label>
              <Input value={deleteConfirmName} onChange={(e) => setDeleteConfirmName(e.target.value)} placeholder={repoName ?? ''} className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-mono" />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-border hover:bg-secondary" onClick={() => { setDeleteDialogOpen(false); setDeleteConfirmName(''); }}>{i18n.t('取消')}</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteRepo} disabled={deleting || deleteConfirmName !== repoName}>
                {deleting ? i18n.t('删除中...') : i18n.t('确认删除')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* ── 仓库设置对话框（仅 owner 可触发） ── */}
      {isOwner && (
        <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) setEditDialogOpen(false); }}>
          <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2">
                <Settings className="w-4 h-4 text-primary" />{i18n.t('仓库设置')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              <div className="space-y-1.5">
                <Label className="text-sm font-normal text-foreground">{i18n.t('仓库名称')}</Label>
                <Input value={editRepoName} onChange={(e) => setEditRepoName(e.target.value)} placeholder={repoName} className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-mono" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-normal text-foreground">{i18n.t('仓库描述')}</Label>
                <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder={i18n.t('简短描述这个仓库...')} rows={3} className="bg-secondary border-border text-foreground placeholder:text-muted-foreground resize-none" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-normal text-foreground">{i18n.t('主页')}</Label>
                <Input value={editHomepage} onChange={(e) => setEditHomepage(e.target.value)} placeholder="https://example.com" className="bg-secondary border-border text-foreground placeholder:text-muted-foreground" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-normal text-foreground">{i18n.t('可见性')}</Label>
                <div className="flex items-center gap-3">
                  <button type="button" className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${!editPrivate ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-secondary"}`} onClick={() => setEditPrivate(false)}>
                    <Globe className="w-3.5 h-3.5" />{i18n.t('公开')}</button>
                  <button type="button" className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${editPrivate ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-secondary"}`} onClick={() => setEditPrivate(true)}>
                    <Lock className="w-3.5 h-3.5" />{i18n.t('私有')}</button>
                </div>
              </div>

              <div className="pt-2 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-3">{i18n.t('功能')}</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="has-issues" className="text-sm font-normal text-foreground cursor-pointer">{i18n.t('Issues')}</Label>
                    <Switch id="has-issues" checked={editHasIssues} onCheckedChange={setEditHasIssues} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="has-wiki" className="text-sm font-normal text-foreground cursor-pointer">{i18n.t('Wiki')}</Label>
                    <Switch id="has-wiki" checked={editHasWiki} onCheckedChange={setEditHasWiki} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="has-projects" className="text-sm font-normal text-foreground cursor-pointer">{i18n.t('Projects')}</Label>
                    <Switch id="has-projects" checked={editHasProjects} onCheckedChange={setEditHasProjects} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="has-downloads" className="text-sm font-normal text-foreground cursor-pointer">{i18n.t('Downloads')}</Label>
                    <Switch id="has-downloads" checked={editHasDownloads} onCheckedChange={setEditHasDownloads} />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-3">{i18n.t('合并选项')}</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="allow-merge" className="text-sm font-normal text-foreground cursor-pointer">{i18n.t('允许合并提交 (Merge commit)')}</Label>
                    <Switch id="allow-merge" checked={editAllowMerge} onCheckedChange={setEditAllowMerge} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="allow-squash" className="text-sm font-normal text-foreground cursor-pointer">{i18n.t('允许压缩合并 (Squash)')}</Label>
                    <Switch id="allow-squash" checked={editAllowSquash} onCheckedChange={setEditAllowSquash} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="allow-rebase" className="text-sm font-normal text-foreground cursor-pointer">{i18n.t('允许变基合并 (Rebase)')}</Label>
                    <Switch id="allow-rebase" checked={editAllowRebase} onCheckedChange={setEditAllowRebase} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="allow-auto" className="text-sm font-normal text-foreground cursor-pointer">{i18n.t('允许自动合并')}</Label>
                    <Switch id="allow-auto" checked={editAllowAuto} onCheckedChange={setEditAllowAuto} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="delete-branch" className="text-sm font-normal text-foreground cursor-pointer">{i18n.t('合并后自动删除分支')}</Label>
                    <Switch id="delete-branch" checked={editDeleteBranchOnMerge} onCheckedChange={setEditDeleteBranchOnMerge} />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" className="border border-border text-muted-foreground hover:bg-secondary" onClick={() => setEditDialogOpen(false)}>{i18n.t('取消')}</Button>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleUpdateRepo} disabled={updating}>
                {updating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{i18n.t('保存中...')}</> : i18n.t('保存更改')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
    </TooltipProvider>
  );
}
