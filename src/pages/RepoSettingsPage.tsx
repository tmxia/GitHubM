import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Settings, Save, Loader2, Globe, Lock, Package, GitMerge, Trash2, Archive, AlertTriangle, ArrowRightLeft, Tag, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { pageCache } from '@/lib/page-cache';
import { getRepo, updateRepo, updateRepoTopics, deleteRepo, getBranches, transferRepo } from '@/services/github';
import type { GitHubRepo } from '@/types/types';
import i18n from '@/i18n';
import { toast } from 'sonner';

export default function RepoSettingsPage() {
  const { owner, repo: repoName } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();

  const [repo, setRepo] = useState<GitHubRepo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [homepage, setHomepage] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [defaultBranch, setDefaultBranch] = useState('');
  const [branches, setBranches] = useState<string[]>([]);

  const [topics, setTopics] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState('');

  const [hasIssues, setHasIssues] = useState(true);
  const [hasWiki, setHasWiki] = useState(true);
  const [hasProjects, setHasProjects] = useState(true);
  const [hasDownloads, setHasDownloads] = useState(true);

  const [allowMerge, setAllowMerge] = useState(true);
  const [allowSquash, setAllowSquash] = useState(true);
  const [allowRebase, setAllowRebase] = useState(true);
  const [deleteBranchOnMerge, setDeleteBranchOnMerge] = useState(false);

  const [isArchived, setIsArchived] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferring, setTransferring] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!owner || !repoName) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await getRepo(owner, repoName, { fresh: true });
        if (cancelled) return;
        setRepo(r);
        setName(r.name);
        setDescription(r.description || '');
        setHomepage(r.homepage || '');
        setIsPrivate(r.private);
        setHasIssues(r.has_issues ?? true);
        setHasWiki(r.has_wiki ?? true);
        setHasProjects(r.has_projects ?? true);
        setHasDownloads(r.has_downloads ?? true);
        setAllowMerge(r.allow_merge_commit ?? true);
        setAllowSquash(r.allow_squash_merge ?? true);
        setAllowRebase(r.allow_rebase_merge ?? true);
        setDeleteBranchOnMerge(r.delete_branch_on_merge ?? false);
        setDefaultBranch(r.default_branch || 'main');
        setIsArchived(r.archived ?? false);
        setTopics(r.topics || []);

        if (r.permissions?.admin) {
          const bListRes = await getBranches(owner, repoName, 1).catch(() => ({ data: [] }));
          setBranches(bListRes.data.map(b => b.name));
        }
      } catch (e) {
        toast.error('加载仓库设置失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [owner, repoName]);

  const handleSave = async () => {
    if (!owner || !repoName) return;
    if (!allowMerge && !allowSquash && !allowRebase) {
      toast.error(i18n.t('至少需要保留一种合并策略'));
      return;
    }
    setSaving(true);

    try {
      const patch: Record<string, any> = {
        name: name.trim() || repoName,
        description: description.trim() === '' ? '' : description.trim(),
        private: isPrivate,
        has_issues: hasIssues,
        has_wiki: hasWiki,
        has_projects: hasProjects,
        has_downloads: hasDownloads,
        allow_squash_merge: allowSquash,
        allow_merge_commit: allowMerge,
        allow_rebase_merge: allowRebase,
        delete_branch_on_merge: deleteBranchOnMerge,
        default_branch: defaultBranch,
        archived: isArchived,
      };
      if (homepage.trim()) patch.homepage = homepage.trim();

      await updateRepo(owner, repoName, patch);

      const cleanTopics = topics.map(t => t.toLowerCase().replace(/[^a-z0-9-]/g, '')).filter(Boolean);
      await updateRepoTopics(owner, repoName, cleanTopics).catch(() => {});

      const freshRepo = await getRepo(owner, repoName, { fresh: true });
      setRepo(freshRepo);
      setTopics(freshRepo.topics || []);

      toast.success(i18n.t('仓库信息已更新'));

      pageCache.delete(`repodetail:v2:${owner}/${repoName}`);

      if (name.trim() && name.trim() !== repoName) {
        pageCache.delete(`repodetail:v2:${owner}/${name.trim()}`);
        navigate(`/repos/${owner}/${name.trim()}/settings`);
      }
    } catch (e: any) {
      toast.error(e instanceof Error ? e.message : i18n.t('保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferTarget.trim() || !owner || !repoName) return;
    setTransferring(true);
    try {
      await transferRepo(owner, repoName, transferTarget.trim());
      toast.success('仓库转移成功，即将跳转...');
      navigate('/repos');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '转移失败，请检查用户名是否正确');
    } finally {
      setTransferring(false);
      setTransferOpen(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmName !== repoName || !owner || !repoName) return;
    setDeleting(true);
    try {
      await deleteRepo(owner, repoName);
      toast.success(`${i18n.t('已删除仓库')} ${repoName}`);
      navigate('/repos');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : i18n.t('删除失败'));
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-6 w-48 bg-muted mb-4" />
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <Skeleton className="h-10 w-full bg-muted" />
          <Skeleton className="h-20 w-full bg-muted" />
          <Skeleton className="h-10 w-full bg-muted" />
        </div>
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <Skeleton className="h-8 w-32 bg-muted" />
          <Skeleton className="h-10 w-full bg-muted" />
        </div>
      </div>
    );
  }
  if (!repo) return <div className="p-8 text-center text-destructive">{i18n.t('仓库不存在')}</div>;

  return (
    <>
      <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <button type="button" className="hover:text-accent" onClick={() => navigate('/repos')}>{i18n.t('仓库')}</button>
          <ChevronRight className="w-3 h-3" />
          <button type="button" className="hover:text-accent truncate" onClick={() => navigate(`/repos/${owner}/${repoName}`)}>{owner}/{repoName}</button>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">{i18n.t('设置')}</span>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            {i18n.t('仓库设置')}
          </h1>
          <Button
            variant="ghost"
            size="sm"
            className="border border-border text-muted-foreground hover:bg-secondary h-9"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />{i18n.t('保存中...')}</> : <><Save className="w-3.5 h-3.5 mr-1" />{i18n.t('保存更改')}</>}
          </Button>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{i18n.t('基本信息')}</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-foreground">{i18n.t('仓库名称')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-secondary border-border text-foreground font-mono h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-foreground">{i18n.t('仓库描述')}</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={i18n.t('简短描述这个仓库...')}
                className="flex min-h-[80px] w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-foreground">{i18n.t('默认分支')}</Label>
              <Select value={defaultBranch} onValueChange={setDefaultBranch}>
                <SelectTrigger className="bg-secondary border-border text-foreground h-9 font-mono">
                  <SelectValue placeholder="选择分支" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground">
                  {branches.length > 0 ? (
                    branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)
                  ) : (
                    <SelectItem value={defaultBranch}>{defaultBranch}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-foreground">{i18n.t('主页')}</Label>
              <Input value={homepage} onChange={(e) => setHomepage(e.target.value)} placeholder="https://example.com" className="bg-secondary border-border text-foreground h-9" />
            </div>
            <div className="space-y-1.5 pt-2">
              <Label className="text-sm font-normal text-foreground">{i18n.t('可见性')}</Label>
              <div className="flex gap-2">
                <Button variant={!isPrivate ? "default" : "outline"} size="sm" onClick={() => setIsPrivate(false)} className="h-8">
                  <Globe className="w-3.5 h-3.5 mr-1" />{i18n.t('公开')}
                </Button>
                <Button variant={isPrivate ? "default" : "outline"} size="sm" onClick={() => setIsPrivate(true)} className="h-8">
                  <Lock className="w-3.5 h-3.5 mr-1" />{i18n.t('私有')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
            <Tag className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{i18n.t('话题')}</span>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-foreground">{i18n.t('话题标签')}</Label>
              <div className="flex gap-2">
                <Input
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && topicInput.trim()) {
                      e.preventDefault();
                      if (!topics.includes(topicInput.trim())) setTopics([...topics, topicInput.trim()]);
                      setTopicInput('');
                    }
                  }}
                  placeholder={i18n.t('输入标签，回车添加')}
                  className="bg-secondary border-border text-foreground h-9"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 shrink-0"
                  onClick={() => {
                    if (topicInput.trim() && !topics.includes(topicInput.trim())) {
                      setTopics([...topics, topicInput.trim()]);
                      setTopicInput('');
                    }
                  }}
                >
                  {i18n.t('添加')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{i18n.t('仅支持字母、数字和连字符(-)')}</p>
            </div>

            {topics.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {topics.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 text-xs bg-accent/10 text-accent border border-accent/20 px-2 py-1 rounded">
                    {t}
                    <button type="button" onClick={() => setTopics(topics.filter(x => x !== t))} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
            <Package className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{i18n.t('功能')}</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="has-issues" className="text-sm font-normal text-foreground cursor-pointer">Issues</Label>
              <Switch id="has-issues" checked={hasIssues} onCheckedChange={setHasIssues} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="has-wiki" className="text-sm font-normal text-foreground cursor-pointer">Wiki</Label>
              <Switch id="has-wiki" checked={hasWiki} onCheckedChange={setHasWiki} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="has-projects" className="text-sm font-normal text-foreground cursor-pointer">Projects</Label>
              <Switch id="has-projects" checked={hasProjects} onCheckedChange={setHasProjects} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="has-downloads" className="text-sm font-normal text-foreground cursor-pointer">Downloads</Label>
              <Switch id="has-downloads" checked={hasDownloads} onCheckedChange={setHasDownloads} />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
            <GitMerge className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{i18n.t('合并选项')}</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal text-foreground">{i18n.t('允许合并提交 (Merge commit)')}</Label>
              <Switch checked={allowMerge} onCheckedChange={setAllowMerge} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal text-foreground">{i18n.t('允许压缩合并 (Squash)')}</Label>
              <Switch checked={allowSquash} onCheckedChange={setAllowSquash} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal text-foreground">{i18n.t('允许变基合并 (Rebase)')}</Label>
              <Switch checked={allowRebase} onCheckedChange={setAllowRebase} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal text-foreground">{i18n.t('合并后自动删除分支')}</Label>
              <Switch checked={deleteBranchOnMerge} onCheckedChange={setDeleteBranchOnMerge} />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
            <Archive className="w-4 h-4 text-warning" />
            <span className="text-sm font-medium text-foreground">{i18n.t('归档仓库')}</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-normal text-foreground">{i18n.t('将此仓库归档')}</Label>
                <p className="text-xs text-muted-foreground">{i18n.t('归档后，仓库将变为只读状态，无法进行 Issues、PRs 等操作，但代码仍可浏览。')}</p>
              </div>
              <Switch checked={isArchived} onCheckedChange={setIsArchived} />
            </div>
          </div>
        </div>

        <div className="bg-card border border-destructive/50 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-destructive/50 bg-destructive/10 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">{i18n.t('危险区')}</span>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">{i18n.t('转移仓库')}</p>
                <p className="text-xs text-muted-foreground">{i18n.t('将此仓库转移给另一个用户或组织。')}</p>
              </div>
              <Button
                variant="outline"
                className="w-full sm:w-auto h-9 border-warning/50 text-warning hover:bg-warning/10 shrink-0"
                onClick={() => setTransferOpen(true)}
              >
                <ArrowRightLeft className="w-3.5 h-3.5 mr-1" />
                {i18n.t('转移仓库')}
              </Button>
            </div>

            <div className="h-px w-full bg-border" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">{i18n.t('删除此仓库')}</p>
                <p className="text-xs text-muted-foreground">{i18n.t('一旦删除将永久无法恢复，包括所有代码、Issues、PR 等。')}</p>
              </div>
              <Button
                variant="destructive"
                className="w-full sm:w-auto h-9 shrink-0"
                onClick={() => { setDeleteConfirmName(''); setDeleteOpen(true); }}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />{i18n.t('删除此仓库')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={transferOpen} onOpenChange={setTransferOpen}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-warning" />
              {i18n.t('转移仓库')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm space-y-2">
              {i18n.t('将仓库转移给另一个用户或组织。转移后，当前账户将失去管理员权限。')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 py-2 space-y-1.5">
            <Label className="text-sm font-normal text-foreground">{i18n.t('新所有者用户名')}</Label>
            <Input
              value={transferTarget}
              onChange={(e) => setTransferTarget(e.target.value)}
              placeholder="e.g. octocat"
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={transferring}>{i18n.t('取消')}</AlertDialogCancel>
            <Button variant="destructive" onClick={handleTransfer} disabled={!transferTarget.trim() || transferring}>
              {transferring ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {i18n.t('确认转移')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!open) { setDeleteOpen(false); setDeleteConfirmName(''); } }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />{i18n.t('删除仓库')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm space-y-2">
              <span>{i18n.t('此操作将永久删除')}</span>
              <code className="font-mono text-foreground bg-secondary px-1.5 py-0.5 rounded text-xs">{`${owner}/${repoName}`}</code>
              <span>{i18n.t('，包括所有代码、Issues、PR 等，且不可恢复。')}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 py-2 space-y-1.5">
            <Label className="text-sm font-normal text-foreground">
              {i18n.t('请输入仓库名称')}<code className="font-mono bg-secondary px-1 rounded text-xs">{repoName}</code> {i18n.t('确认删除')}
            </Label>
            <Input
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={repoName ?? ''}
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-mono"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{i18n.t('取消')}</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteConfirmName !== repoName || deleting}>
              {deleting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
              {i18n.t('确认删除')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
