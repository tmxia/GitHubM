
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Settings, ChevronRight, Loader2, Globe, Lock, Package, GitBranch,
  AlertTriangle, Trash2, Save, RefreshCw, Zap, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getRepo, updateRepo, deleteRepo, getRepoContents, getFileContent, updateFileContent, deleteFileContent, getRepoSecretPublicKey, putRepoSecret, dispatchWorkflow } from '@/services/github';
import type { GitHubRepo } from '@/types/types';
import { pageCache } from '@/lib/page-cache';
import { toast } from 'sonner';
import { decodeBase64Content } from '@/lib/utils';
import i18n from '@/i18n';

import sealedbox from 'tweetnacl-sealedbox-js';

function b64EncodeUtf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function encryptSecretValue(value: string, publicKeyB64: string): string {
  
  
  const pubKeyBytes = Uint8Array.from(atob(publicKeyB64), (c) => c.charCodeAt(0));
  const msgBytes = new TextEncoder().encode(value);
  const sealed = sealedbox.seal(msgBytes, pubKeyBytes);
  let binary = '';
  for (let i = 0; i < sealed.length; i++) binary += String.fromCharCode(sealed[i]);
  return btoa(binary);
}

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

  const [hasIssues, setHasIssues] = useState(true);
  const [hasWiki, setHasWiki] = useState(true);
  const [hasProjects, setHasProjects] = useState(true);
  const [hasDownloads, setHasDownloads] = useState(true);

  const [allowMerge, setAllowMerge] = useState(true);
  const [allowSquash, setAllowSquash] = useState(true);
  const [allowRebase, setAllowRebase] = useState(true);
  const [allowAuto, setAllowAuto] = useState(false);
  const [deleteBranchOnMerge, setDeleteBranchOnMerge] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  
  const [isMirror, setIsMirror] = useState(false);
  const [mirrorSource, setMirrorSource] = useState('');
  const [mirrorFreq, setMirrorFreq] = useState<'6h' | '12h' | '1d'>('6h');
  const [mirrorSha, setMirrorSha] = useState('');
  const [mirrorLoading, setMirrorLoading] = useState(false);
  const [mirrorSaving, setMirrorSaving] = useState(false);

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

  
  const loadMirrorInfo = async () => {
    if (!owner || !repoName) return;
    setMirrorLoading(true);
    try {
      const list = await getRepoContents(owner, repoName, '.github/workflows');
      const arr = Array.isArray(list) ? list : [];
      const entry = arr.find((f) => f.name === 'sync.yml');
      if (!entry) { setIsMirror(false); return; }
      setMirrorSha(entry.sha);

      const data = await getFileContent(owner, repoName, '.github/workflows/sync.yml');
      const content = decodeBase64Content(data.content);
      if (!content.includes('Auto Sync Source')) { setIsMirror(false); return; }
      setIsMirror(true);

      const srcMatch = content.match(/# mirror-source:\s*(\S+)/);
      if (srcMatch) setMirrorSource(srcMatch[1]);

      const freqMatch = content.match(/cron:\s*'([^']+)'/);
      if (freqMatch) {
        const c = freqMatch[1];
        setMirrorFreq(c === '0 */6 * * *' ? '6h' : c === '0 */12 * * *' ? '12h' : '1d');
      }
    } catch {
      setIsMirror(false);
    } finally {
      setMirrorLoading(false);
    }
  };

  useEffect(() => { loadMirrorInfo(); /* eslint-disable-next-line */ }, [owner, repoName]);

  const saveMirrorFreq = async () => {
    if (!owner || !repoName || !mirrorSha) return;
    setMirrorSaving(true);
    try {
      const data = await getFileContent(owner, repoName, '.github/workflows/sync.yml');
      const content = decodeBase64Content(data.content);
      const newCron = mirrorFreq === '6h' ? '0 */6 * * *' : mirrorFreq === '12h' ? '0 */12 * * *' : '0 3 * * *';
      let newContent = content.replace(/cron:\s*'[^']*'/, `cron: '${newCron}'`);
      if (/# mirror-frequency:/.test(newContent)) {
        newContent = newContent.replace(/# mirror-frequency:\s*\S+/, `# mirror-frequency: ${mirrorFreq}`);
      } else {
        newContent = `# mirror-frequency: ${mirrorFreq}\n` + newContent;
      }

      await updateFileContent(owner, repoName, '.github/workflows/sync.yml', {
        message: `chore: update mirror frequency to ${mirrorFreq}`,
        content: b64EncodeUtf8(newContent),
        sha: mirrorSha,
      });

      
      try {
        const pub = await getRepoSecretPublicKey(owner, repoName);
        const encWf = encryptSecretValue(b64EncodeUtf8(newContent), pub.key);
        await putRepoSecret(owner, repoName, 'MIRROR_WORKFLOW_B64', encWf, pub.key_id);
      } catch { /* 忽略 secret 更新失败 */ }

      toast.success(i18n.t('频率已更新'));
      await loadMirrorInfo();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('更新失败'));
    } finally {
      setMirrorSaving(false);
    }
  };

  const triggerMirrorNow = async () => {
    if (!owner || !repoName) return;
    setMirrorSaving(true);
    try {
      await dispatchWorkflow(owner, repoName, 'sync.yml', repo?.default_branch || 'main');
      toast.success(i18n.t('已触发同步，请稍后查看 Actions'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('触发失败'));
    } finally {
      setMirrorSaving(false);
    }
  };

  const stopMirror = async () => {
    if (!owner || !repoName || !mirrorSha) return;
    if (!confirm(i18n.t('确定停止镜像？将删除 sync.yml workflow，源同步停止'))) return;
    setMirrorSaving(true);
    try {
      await deleteFileContent(owner, repoName, '.github/workflows/sync.yml', {
        message: 'chore: stop mirror',
        sha: mirrorSha,
      });
      toast.success(i18n.t('镜像已停止'));
      setIsMirror(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('停止失败'));
    } finally {
      setMirrorSaving(false);
    }
  };

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

      {isMirror && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{i18n.t('镜像设置')}</span>
            {mirrorLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground ml-auto" />}
          </div>
          <div className="p-4 space-y-4">
            {mirrorSource ? (
              <div className="space-y-1">
                <Label className="text-sm font-normal text-foreground">{i18n.t('源仓库')}</Label>
                <code className="text-foreground font-mono text-xs bg-secondary px-2 py-1 rounded block">{mirrorSource}</code>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{i18n.t('旧版镜像仓库，未记录源仓库名。如需完整信息，请删除后重新创建镜像')}</p>
            )}
            <div className="space-y-1">
              <Label className="text-sm font-normal text-foreground">{i18n.t('同步频率')}</Label>
              <Select value={mirrorFreq} onValueChange={(v) => setMirrorFreq(v as '6h' | '12h' | '1d')}>
                <SelectTrigger className="bg-secondary border-border text-foreground h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="6h" className="text-foreground">{i18n.t('每 6 小时')}</SelectItem>
                  <SelectItem value="12h" className="text-foreground">{i18n.t('每 12 小时')}</SelectItem>
                  <SelectItem value="1d" className="text-foreground">{i18n.t('每天')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" className="h-8 bg-primary text-primary-foreground hover:bg-primary/90" onClick={saveMirrorFreq} disabled={mirrorSaving}>
                {mirrorSaving ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />{i18n.t('处理中...')}</> : <><Save className="w-3.5 h-3.5 mr-1" />{i18n.t('保存频率')}</>}
              </Button>
              <Button size="sm" variant="outline" className="h-8 border-border" onClick={triggerMirrorNow} disabled={mirrorSaving}>
                <Zap className="w-3.5 h-3.5 mr-1" />{i18n.t('立即同步')}
              </Button>
              <Button size="sm" variant="outline" className="h-8 border-destructive/50 text-destructive hover:bg-destructive/10" onClick={stopMirror} disabled={mirrorSaving}>
                <XCircle className="w-3.5 h-3.5 mr-1" />{i18n.t('停止镜像')}
              </Button>
            </div>
          </div>
        </div>
      )}

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
            <Trash2 className="w-3.5 h-3.5 mr-1" />{i18n.t('删除此仓库')}
          </Button>
        </div>
      </div>

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
