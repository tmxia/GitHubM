// 仓库设置 —— 独立页面

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Settings, ChevronRight, Loader2, Globe, Lock, Package, GitBranch,
  AlertTriangle, Trash2, Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getRepo, updateRepo, deleteRepo } from '@/services/github';
import type { GitHubRepo } from '@/types/types';
import { pageCache } from '@/lib/page-cache';
import { toast } from 'sonner';
import i18n from '@/i18n';

export default function RepoSettingsPage() {
  const { owner, repo: repoName } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();

  const [repo, setRepo] = useState<GitHubRepo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 基本信息
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [homepage, setHomepage] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  // 功能
  const [hasIssues, setHasIssues] = useState(true);
  const [hasWiki, setHasWiki] = useState(true);
  const [hasProjects, setHasProjects] = useState(true);
  const [hasDownloads, setHasDownloads] = useState(true);

  // 合并选项
  const [allowMerge, setAllowMerge] = useState(true);
  const [allowSquash, setAllowSquash] = useState(true);
  const [allowRebase, setAllowRebase] = useState(true);
  const [allowAuto, setAllowAuto] = useState(false);
  const [deleteBranchOnMerge, setDeleteBranchOnMerge] = useState(false);

  // 删除
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!owner || !repoName) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await getRepo(owner, repoName);
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
        setAllowAuto(r.allow_auto_merge ?? false);
        setDeleteBranchOnMerge(r.delete_branch_on_merge ?? false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : i18n.t('加载失败'));
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
      const patch: Record<string, unknown> = {
        name: name.trim() || repoName,
        description: description || null,
        private: isPrivate,
        has_issues: hasIssues,
        has_wiki: hasWiki,
        has_projects: hasProjects,
        allow_squash_merge: allowSquash,
        allow_merge_commit: allowMerge,
        allow_rebase_merge: allowRebase,
        delete_branch_on_merge: deleteBranchOnMerge,
      };
      if (homepage.trim()) patch.homepage = homepage.trim();

      const updated = await updateRepo(owner, repoName, patch);
      setRepo(updated);
      pageCache.delete(`repodetail:${owner}/${repoName}`);
      pageCache.invalidate('repos:');
      toast.success(i18n.t('仓库信息已更新'));
      if (name.trim() && name.trim() !== repoName) {
        navigate(`/repos/${owner}/${name.trim()}/settings`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : i18n.t('更新失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!owner || !repoName) return;
    if (deleteConfirmName !== repoName) {
      toast.error(i18n.t('仓库名称不一致'));
      return;
    }
    setDeleting(true);
    try {
      await deleteRepo(owner, repoName);
      pageCache.delete(`repodetail:${owner}/${repoName}`);
      pageCache.invalidate('repos:');
      toast.success(`${i18n.t('已删除仓库')} ${repoName}`);
      navigate('/repos');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : i18n.t('删除失败'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-6 w-40 bg-muted" />
        <Skeleton className="h-40 bg-muted rounded-lg" />
        <Skeleton className="h-40 bg-muted rounded-lg" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      {/* 面包屑 */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <button type="button" className="hover:text-accent" onClick={() => navigate('/repos')}>{i18n.t('仓库')}</button>
        <ChevronRight className="w-3 h-3" />
        <button type="button" className="hover:text-accent truncate" onClick={() => navigate(`/repos/${owner}/${repoName}`)}>{owner}/{repoName}</button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">{i18n.t('设置')}</span>
      </div>

      {/* 标题 + 保存按钮 */}
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
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{i18n.t('保存中...')}</> : <><Save className="w-4 h-4 mr-2" />{i18n.t('保存更改')}</>}
        </Button>
      </div>

      {/* 卡片 1：基本信息 */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
          <Settings className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{i18n.t('基本信息')}</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-normal text-foreground">{i18n.t('仓库名称')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={repoName}
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-mono h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-normal text-foreground">{i18n.t('仓库描述')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={i18n.t('简短描述这个仓库...')}
              rows={3}
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-normal text-foreground">{i18n.t('主页')}</Label>
            <Input
              value={homepage}
              onChange={(e) => setHomepage(e.target.value)}
              placeholder="https://example.com"
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-normal text-foreground">{i18n.t('可见性')}</Label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors ${!isPrivate ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:bg-secondary'}`}
                onClick={() => setIsPrivate(false)}
              >
                <Globe className="w-3.5 h-3.5" />{i18n.t('公开')}
              </button>
              <button
                type="button"
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors ${isPrivate ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:bg-secondary'}`}
                onClick={() => setIsPrivate(true)}
              >
                <Lock className="w-3.5 h-3.5" />{i18n.t('私有')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 卡片 2：功能 */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
          <Package className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{i18n.t('功能')}</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="has-issues" className="text-sm font-normal text-foreground cursor-pointer">{i18n.t('Issues')}</Label>
            <Switch id="has-issues" checked={hasIssues} onCheckedChange={setHasIssues} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="has-wiki" className="text-sm font-normal text-foreground cursor-pointer">{i18n.t('Wiki')}</Label>
            <Switch id="has-wiki" checked={hasWiki} onCheckedChange={setHasWiki} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="has-projects" className="text-sm font-normal text-foreground cursor-pointer">{i18n.t('Projects')}</Label>
            <Switch id="has-projects" checked={hasProjects} onCheckedChange={setHasProjects} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="has-downloads" className="text-sm font-normal text-foreground cursor-pointer">{i18n.t('Downloads')}</Label>
            <Switch id="has-downloads" checked={hasDownloads} onCheckedChange={setHasDownloads} />
          </div>
        </div>
      </div>

      {/* 卡片 3：合并选项 */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{i18n.t('合并选项')}</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="allow-merge" className="text-sm font-normal text-foreground cursor-pointer">{i18n.t('允许合并提交 (Merge commit)')}</Label>
            <Switch id="allow-merge" checked={allowMerge} onCheckedChange={(v) => {
              if (!v && !allowSquash && !allowRebase) { toast.error(i18n.t('至少需要保留一种合并策略')); return; }
              setAllowMerge(v);
            }} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="allow-squash" className="text-sm font-normal text-foreground cursor-pointer">{i18n.t('允许压缩合并 (Squash)')}</Label>
            <Switch id="allow-squash" checked={allowSquash} onCheckedChange={(v) => {
              if (!v && !allowMerge && !allowRebase) { toast.error(i18n.t('至少需要保留一种合并策略')); return; }
              setAllowSquash(v);
            }} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="allow-rebase" className="text-sm font-normal text-foreground cursor-pointer">{i18n.t('允许变基合并 (Rebase)')}</Label>
            <Switch id="allow-rebase" checked={allowRebase} onCheckedChange={(v) => {
              if (!v && !allowMerge && !allowSquash) { toast.error(i18n.t('至少需要保留一种合并策略')); return; }
              setAllowRebase(v);
            }} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="allow-auto" className="text-sm font-normal text-foreground cursor-pointer">{i18n.t('允许自动合并')}</Label>
            <Switch id="allow-auto" checked={allowAuto} onCheckedChange={setAllowAuto} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="delete-branch" className="text-sm font-normal text-foreground cursor-pointer">{i18n.t('合并后自动删除分支')}</Label>
            <Switch id="delete-branch" checked={deleteBranchOnMerge} onCheckedChange={setDeleteBranchOnMerge} />
          </div>
        </div>
      </div>

      {/* 卡片 4：危险区 */}
      <div className="bg-card border border-destructive/40 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-destructive/40 bg-destructive/10 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <span className="text-sm font-medium text-destructive">{i18n.t('危险区')}</span>
        </div>
        <div className="p-4 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{i18n.t('删除此仓库')}</p>
            <p className="text-xs text-muted-foreground mt-1">{i18n.t('一旦删除将永久无法恢复，包括所有代码、Issues、PR 等。')}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="border border-destructive/60 text-destructive hover:bg-destructive/10 h-9 shrink-0"
            onClick={() => { setDeleteConfirmName(''); setDeleteOpen(true); }}
          >
            <Trash2 className="w-4 h-4 mr-1.5" />{i18n.t('删除此仓库')}
          </Button>
        </div>
      </div>

      {/* 删除确认对话框 */}
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
            <AlertDialogCancel className="border-border hover:bg-secondary" onClick={() => { setDeleteOpen(false); setDeleteConfirmName(''); }}>{i18n.t('取消')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting || deleteConfirmName !== repoName}
            >
              {deleting ? i18n.t('删除中...') : i18n.t('确认删除')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
