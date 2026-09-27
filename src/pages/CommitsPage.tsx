
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Clock,
  ChevronRight,
  GitCommit,
  Plus,
  Minus,
  ExternalLink,
  GitBranch,

  Scissors,
  ChevronDown,} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getCommits, getCommit, getBranches, getRepo, forceUpdateBranch, formatRelativeTime } from '@/services/github';
import type { GitHubCommit, GitHubBranch } from '@/types/types';
import { toast } from 'sonner';
import { pageCache } from '@/lib/page-cache';
import i18n from "@/i18n";

export default function CommitsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedCommit, setSelectedCommit] = useState<GitHubCommit | null>(null);
  const [commitDetailLoading, setCommitDetailLoading] = useState(false);
  const [pruneOpen, setPruneOpen] = useState(false);
  const [keepCount, setKeepCount] = useState(0);
  const [pruning, setPruning] = useState(false);

  useEffect(() => {
    if (!owner || !repo) return;
    const storageKey = `commits_branch:${owner}/${repo}`;
    const saved = localStorage.getItem(storageKey);

    Promise.all([
      getBranches(owner, repo),
      getRepo(owner, repo).catch(() => null),
    ])
      .then(([branchResult, repoData]) => {
        setBranches(branchResult.data);
        const names = branchResult.data.map((b) => b.name);
        const defaultBranch = repoData?.default_branch || '';
        // 优先级：上次选择 > 仓库默认分支 > 第一个分支
        let initial = '';
        if (saved && names.includes(saved)) initial = saved;
        else if (defaultBranch && names.includes(defaultBranch)) initial = defaultBranch;
        else initial = names[0] || '';
        setSelectedBranch(initial);
      })
      .catch(console.error);
  }, [owner, repo]);

  const loadCommits = useCallback(async (pageNum = 1, append = false, force = false) => {
    if (!owner || !repo || !selectedBranch) return;
    if (pageNum === 1) setLoading(true);

    const cacheKey = `commits:${owner}/${repo}:${selectedBranch}:p1`;
    if (pageNum === 1 && !append && !force) {
      const cached = pageCache.get<{ commits: GitHubCommit[]; hasNextPage: boolean }>(cacheKey);
      if (cached) {
        setCommits(cached.commits);
        setHasNextPage(cached.hasNextPage);
        setPage(1);
        setLoading(false);
        return;
      }
    }

    try {
      const result = await getCommits(owner, repo, {
        sha: selectedBranch,
        per_page: 30,
        page: pageNum,
      });
      if (append) {
        setCommits((prev) => [...prev, ...result.data]);
      } else {
        setCommits(result.data);
        pageCache.set(cacheKey, { commits: result.data, hasNextPage: result.hasNextPage });
      }
      setHasNextPage(result.hasNextPage);
      setPage(pageNum);
    } catch (err) {
      toast.error(i18n.t('加载提交历史失败'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [owner, repo, selectedBranch]);

  const handlePrune = async () => {
    if (!owner || !repo || !selectedBranch || keepCount < 1) return;
    const target = commits[keepCount - 1];
    if (!target) {
      toast.error(i18n.t('该分支不足') + ` ${keepCount} ` + i18n.t('个 commit'));
      return;
    }
    setPruning(true);
    try {
      await forceUpdateBranch(owner, repo, selectedBranch, target.sha);
      toast.success(i18n.t('已保留最近') + ` ${keepCount} ` + i18n.t('个 commit'));
      setPruneOpen(false);
      pageCache.invalidate(`commits:${owner}/${repo}:${selectedBranch}:`);
      // 重新加载列表
      await loadCommits(1, false, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('操作失败'));
    } finally {
      setPruning(false);
    }
  };

  useEffect(() => {
    if (selectedBranch) loadCommits(1);
  }, [loadCommits, selectedBranch]);

  const handleViewCommit = async (sha: string) => {
    if (!owner || !repo) return;
    setCommitDetailLoading(true);
    try {
      const detail = await getCommit(owner, repo, sha);
      setSelectedCommit(detail);
    } catch (err) {
      toast.error(i18n.t('加载提交详情失败'));
      console.error(err);
    } finally {
      setCommitDetailLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      {/* 面包屑 */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <button type="button" className="hover:text-accent" onClick={() => navigate('/repos')}>{i18n.t('仓库')}</button>
        <ChevronRight className="w-3 h-3" />
        <button type="button" className="hover:text-accent" onClick={() => navigate(`/repos/${owner}/${repo}`)}>{owner}/{repo}</button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">{i18n.t('提交历史')}</span>
      </div>

      <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
        <GitCommit className="w-5 h-5 text-primary" />
        {i18n.t('提交历史')}
      </h1>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 border border-border text-muted-foreground hover:bg-secondary justify-center"
                disabled={commits.length === 0}
              >
                <Scissors className="w-3.5 h-3.5 mr-1.5" />
                {i18n.t('清理历史')}
                <ChevronDown className="w-3.5 h-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover border-border">
              {[1, 3, 5, 10, 20].map((n) => (
                <DropdownMenuItem
                  key={n}
                  className="text-foreground cursor-pointer"
                  disabled={commits.length < n}
                  onClick={() => { setKeepCount(n); setPruneOpen(true); }}
                >
                  {i18n.t('保留最近')} {n} {i18n.t('个 commit')}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
        </DropdownMenu>
        <Select
          value={selectedBranch}
          onValueChange={(v) => {
            setSelectedBranch(v);
            try { localStorage.setItem(`commits_branch:${owner}/${repo}`, v); } catch { /* ignore */ }
          }}
        >
          <SelectTrigger className="border border-border text-foreground hover:bg-secondary w-32 h-9 justify-center">
            <GitBranch className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder={i18n.t('选择分支')} />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border max-h-60 min-w-[16rem] max-w-[calc(100vw-3rem)]">
            {branches.map((branch) => (
              <SelectItem
                key={branch.name}
                value={branch.name}
                className="text-foreground font-mono text-sm"
              >
                {branch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 提交列表 */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-4 flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-full bg-muted" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-2/3 bg-muted mb-1.5" />
                  <Skeleton className="h-4 w-1/3 bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : commits.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">{i18n.t('暂无提交记录')}</div>
        ) : (
          <div className="divide-y divide-border">
            {commits.map((commit) => (
              <div
                key={commit.sha}
                className="p-4 hover:bg-secondary/50 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarImage src={commit.author?.avatar_url} loading="lazy" />
                    <AvatarFallback className="bg-secondary text-xs">
                      {commit.commit.author.name.substring(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      className="text-sm font-medium text-foreground group-hover:text-accent transition-colors text-left line-clamp-2 text-balance w-full"
                      onClick={() => handleViewCommit(commit.sha)}
                    >
                      {commit.commit.message.split('\n')[0]}
                    </button>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {commit.commit.author.name}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(commit.commit.author.date)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      className="text-xs bg-secondary border border-border px-2 py-1 rounded font-mono text-accent hover:bg-secondary/80 transition-colors"
                      onClick={() => handleViewCommit(commit.sha)}
                    >
                      {commit.sha.substring(0, 7)}
                    </button>
                    <a
                      href={commit.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:bg-secondary">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {hasNextPage && !loading && (
        <div className="text-center">
          <Button
            variant="outline"
            className="border-border hover:bg-secondary"
            onClick={() => loadCommits(page + 1, true)}
          >
            {i18n.t('加载更多')}</Button>
        </div>
      )}

      {/* 提交详情弹窗 */}
      <Dialog open={!!selectedCommit} onOpenChange={() => setSelectedCommit(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl bg-card border-border max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground text-base font-medium">
              {i18n.t('提交详情')}</DialogTitle>
          </DialogHeader>
          {commitDetailLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full bg-muted" />
              <Skeleton className="h-4 w-2/3 bg-muted" />
            </div>
          ) : selectedCommit ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground">{selectedCommit.commit.message}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{selectedCommit.commit.author.name}</span>
                  <span>{formatRelativeTime(selectedCommit.commit.author.date)}</span>
                  <code className="font-mono text-accent">{selectedCommit.sha.substring(0, 12)}</code>
                </div>
              </div>
              {selectedCommit.stats && (
                <div className="flex items-center gap-3 text-sm bg-secondary rounded-lg px-3 py-2">
                  <span className="text-muted-foreground">{selectedCommit.stats.total} {i18n.t('个改动')}</span>
                  <span className="text-primary flex items-center gap-1"><Plus className="w-3.5 h-3.5" />{selectedCommit.stats.additions}</span>
                  <span className="text-destructive flex items-center gap-1"><Minus className="w-3.5 h-3.5" />{selectedCommit.stats.deletions}</span>
                </div>
              )}
              {selectedCommit.files && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">{i18n.t('变更文件 (')}{selectedCommit.files.length})</p>
                  <div className="space-y-2">
                    {selectedCommit.files.map((file) => (
                      <div key={file.filename} className="bg-secondary border border-border rounded-md">
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                          <code className="text-xs font-mono text-foreground flex-1 min-w-0 truncate">{file.filename}</code>
                          <span className="text-xs text-primary shrink-0">+{file.additions}</span>
                          <span className="text-xs text-destructive shrink-0">-{file.deletions}</span>
                        </div>
                        {file.patch && (
                          <div className="text-xs pl-3 pr-2 py-2 font-mono max-h-40 overflow-y-auto leading-relaxed bg-card">
                            {file.patch.split('\n').slice(0, 20).map((line, i) => {
                              const colorClass = line.startsWith('+')
                                ? 'text-primary'
                                : line.startsWith('-')
                                ? 'text-destructive'
                                : line.startsWith('@@')
                                ? 'text-accent'
                                : 'text-muted-foreground';
                              return (
                                <div
                                  key={i}
                                  className={`whitespace-pre-wrap break-all ${colorClass}`}
                                >
                                  {line || ' '}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      {/* 清理历史确认 */}
      <AlertDialog open={pruneOpen} onOpenChange={setPruneOpen}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <Scissors className="w-4 h-4 text-destructive" />
              {i18n.t('清理提交历史')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground space-y-2">
              <span className="block">
                {i18n.t('将保留')} <span className="text-foreground font-semibold">{selectedBranch}</span> {i18n.t('分支上最近的')}{' '}
                <span className="text-foreground font-semibold">{keepCount}</span> {i18n.t('个 commit，丢弃更早的提交。')}
              </span>
              {commits[keepCount - 1] && (
                <span className="block text-xs">
                  {i18n.t('保留的最新 commit：')}
                  <code className="block mt-1 font-mono text-foreground bg-secondary px-2 py-1.5 rounded break-all">
                    {commits[keepCount - 1].sha.substring(0, 12)} · {commits[keepCount - 1].commit.message.split('\n')[0]}
                  </code>
                </span>
              )}
              <span className="block text-destructive text-xs font-medium">
                ⚠️ {i18n.t('此操作会重写分支历史，丢弃的 commit 不可恢复。协作者会受影响，CI 与 PR 也可能异常。')}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border hover:bg-secondary" disabled={pruning}>
              {i18n.t('取消')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); handlePrune(); }}
              disabled={pruning}
            >
              {pruning ? i18n.t('处理中...') : i18n.t('确认清理')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
