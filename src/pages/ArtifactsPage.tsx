
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Package,
  Download,
  Trash2,
  Tag,
  Clock,
  FileArchive,
  AlertCircle,
  ChevronDown,
  ExternalLink,
  RefreshCw,
  Zap,
  Archive,
  Loader2,

  Tags,
  CheckSquare,} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import {
  getReleases,
  getRepoArtifacts,
  deleteArtifact,
  deleteRelease,
  getToken,
  formatRelativeTime,
  type GitHubRelease,
  type GitHubArtifact,
  type GitHubReleaseAsset,
  getTags,
  deleteTag,
  type GitHubTag,
} from '@/services/github';
import { toast } from 'sonner';
import i18n from "@/i18n";
import { useRepoPermissions } from '@/hooks/use-repo-permissions';
import PullToRefresh from '@/components/common/PullToRefresh';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function downloadWithAuth(asset: { url: string; browser_download_url: string; name: string }): Promise<void> {
  const token = getToken();
  if (!token) {
    toast.error(i18n.t('请先登录后再下载'));
    return;
  }

  const bridge = (window as unknown as { AndroidBridge?: { downloadFile?: (u: string, f: string, t: string) => void } }).AndroidBridge;
  if (bridge?.downloadFile) {
    bridge.downloadFile(asset.url, asset.name, token);
    toast.success(`开始下载 ${asset.name}`);
    return;
  }

  window.open(asset.browser_download_url, '_blank', 'noopener,noreferrer');
  toast.success(`已在新标签页中打开 ${asset.name} 的下载链接`);
}

function AssetItem({ asset }: { asset: GitHubReleaseAsset }) {
  const [downloading, setDownloading] = useState(false);
  const [localCount, setLocalCount] = useState(asset.download_count);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadWithAuth(asset);
      setLocalCount((c) => c + 1);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 group hover:bg-secondary/30 transition-colors">
      <FileArchive className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground font-mono break-all line-clamp-3">{asset.name}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
          <span className="shrink-0">{formatBytes(asset.size)}</span>
          <span className="break-all">{asset.content_type}</span>
          <span className="flex items-center gap-0.5 shrink-0">
            <Download className="w-3 h-3" />{localCount}
          </span>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs shrink-0"
        onClick={handleDownload}
        disabled={downloading}
      >
        {downloading
          ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{i18n.t('下载中')}</>
          : <><Download className="w-3.5 h-3.5 mr-1.5" />{i18n.t('下载')}</>
        }
      </Button>
    </div>
  );
}

function ReleaseItem({
  release,
  onDelete,
  canPush,
}: {
  release: GitHubRelease;
  onDelete: (id: number) => void;
  canPush: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [dlZip, setDlZip] = useState(false);
  const [dlTar, setDlTar] = useState(false);
  const totalSize = release.assets.reduce((sum, a) => sum + a.size, 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left group">
        <Tag className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground font-mono">{release.tag_name}</span>
            {release.name && release.name !== release.tag_name && (
              <span className="text-sm text-muted-foreground break-all">{release.name}</span>
            )}
            {release.draft && <Badge variant="outline" className="text-xs text-muted-foreground border-border">{i18n.t('草稿')}</Badge>}
            {release.prerelease && <Badge className="bg-warning/10 text-warning border-warning/30 text-xs">{i18n.t('预发布')}</Badge>}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatRelativeTime(release.published_at || release.created_at)}</span>
            <span>{release.assets.length} {i18n.t('个产物 ·')}{formatBytes(totalSize)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button asChild variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-accent hover:bg-accent/10">
            <a href={release.html_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Button>
          {canPush && (
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => { e.stopPropagation(); onDelete(release.id); }}
              title={i18n.t('删除 Release')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border bg-secondary/10">
          <div className="flex gap-2 px-4 py-2.5 border-b border-border/50 flex-wrap">
            {release.zipball_url && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={dlZip}
                onClick={async () => {
                  setDlZip(true);
                  await downloadWithAuth({
                    url: release.zipball_url!,
                    browser_download_url: release.zipball_url!,
                    name: `${release.tag_name}-source.zip`
                  });
                  setDlZip(false);
                }}
              >
                {dlZip
                  ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />{i18n.t('下载中')}</>
                  : <><Archive className="w-3 h-3 mr-1.5" />Source code (.zip)</>
                }
              </Button>
            )}
            {release.tarball_url && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={dlTar}
                onClick={async () => {
                  setDlTar(true);
                  await downloadWithAuth({
                    url: release.tarball_url!,
                    browser_download_url: release.tarball_url!,
                    name: `${release.tag_name}-source.tar.gz`
                  });
                  setDlTar(false);
                }}
              >
                {dlTar
                  ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />{i18n.t('下载中')}</>
                  : <><Archive className="w-3 h-3 mr-1.5" />Source code (.tar.gz)</>
                }
              </Button>
            )}
          </div>
          {release.assets.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{i18n.t('此版本没有产物文件')}</div>
          ) : (
            <div className="divide-y divide-border/50">
              {release.assets.map((asset) => <AssetItem key={asset.id} asset={asset} />)}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ArtifactDownloadButton({ art, owner, repo }: { art: GitHubArtifact; owner: string; repo: string }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    const token = getToken();
    if (!token) {
      toast.error(i18n.t('请先登录后再下载'));
      return;
    }

    setDownloading(true);
    try {
      const bridge = (window as unknown as {
        AndroidBridge?: { downloadFile?: (u: string, f: string, t: string) => void }
      }).AndroidBridge;
      if (bridge?.downloadFile) {
        bridge.downloadFile(art.archive_download_url, `${art.name}.zip`, token);
        toast.success(`开始下载 ${art.name}.zip`);
        return;
      }

      const res = await fetch(art.archive_download_url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      });

      if (!res.ok) {
        let msg = '';
        try { msg = (await res.text()).slice(0, 200); } catch {}
        toast.error(`下载失败：HTTP ${res.status}${msg ? ` ${msg}` : ''}`);
        return;
      }

      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `${art.name}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 10_000);
      toast.success(`开始下载 ${art.name}.zip`);
    } catch (err) {
      const msg = err instanceof Error && err.message.includes('CORS')
        ? i18n.t('跨域下载被拦截，请检查网络后重试')
        : err instanceof Error ? err.message : i18n.t('未知错误');
      toast.error(`下载失败：${msg}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 text-xs"
      disabled={downloading}
      onClick={handleDownload}
    >
      {downloading
        ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{i18n.t('获取中')}</>
        : <><Download className="w-3.5 h-3.5 mr-1.5" />{i18n.t('下载')}</>
      }
    </Button>
  );
}

export default function ArtifactsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { canPush } = useRepoPermissions(owner, repo);
  const navigate = useNavigate();
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [artifacts, setArtifacts] = useState<GitHubArtifact[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(true);
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);
  const [hasMoreReleases, setHasMoreReleases] = useState(false);
  const [releasePage, setReleasePage] = useState(1);
  const [deleteRelTarget, setDeleteRelTarget] = useState<number | null>(null);
  const [deleteArtTarget, setDeleteArtTarget] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [tags, setTags] = useState<GitHubTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [deleteTagTarget, setDeleteTagTarget] = useState<string | null>(null);
  const [bulkDeleteTagsOpen, setBulkDeleteTagsOpen] = useState(false);

  const loadReleases = useCallback(async (page = 1, append = false) => {
    if (!owner || !repo) return;
    if (page === 1) setLoadingReleases(true);
    try {
      const data = await getReleases(owner, repo, { per_page: 20, page });
      if (append) setReleases((prev) => [...prev, ...data]);
      else setReleases(data);
      setHasMoreReleases(data.length === 20);
      setReleasePage(page);
    } catch (err) {
      toast.error(i18n.t('加载 Release 列表失败'));
      console.error(err);
    } finally {
      setLoadingReleases(false);
    }
  }, [owner, repo]);

  const loadArtifacts = useCallback(async () => {
    if (!owner || !repo) return;
    setLoadingArtifacts(true);
    try {
      const data = await getRepoArtifacts(owner, repo, { per_page: 30 });
      setArtifacts(Array.isArray(data.artifacts) ? data.artifacts : []);
    } catch (err) {
      toast.error(i18n.t('加载 Artifacts 失败'));
      console.error(err);
    } finally {
      setLoadingArtifacts(false);
    }
  }, [owner, repo]);

  useEffect(() => { loadReleases(1); }, [loadReleases]);

  const loadTags = useCallback(async () => {
    if (!owner || !repo) return;
    setLoadingTags(true);
    try {
      const data = await getTags(owner, repo, { per_page: 100 });
      setTags(data);
      setSelectedTags(new Set());
    } catch (err) {
      toast.error(i18n.t('加载 Tags 失败'));
      console.error(err);
    } finally {
      setLoadingTags(false);
    }
  }, [owner, repo]);

  const toggleTagSelect = (name: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const deletableTags = tags.filter((t) => !releases.some((r) => r.tag_name === t.name));

  const toggleAllTags = () => {
    const allSelected = deletableTags.length > 0 && deletableTags.every((t) => selectedTags.has(t.name));
    if (allSelected) {
      setSelectedTags(new Set());
    } else {
      setSelectedTags(new Set(deletableTags.map((t) => t.name)));
    }
  };

  const handleDeleteTag = async () => {
    if (!deleteTagTarget || !owner || !repo) return;
    setDeleting(true);
    try {
      await deleteTag(owner, repo, deleteTagTarget);
      setTags((prev) => prev.filter((t) => t.name !== deleteTagTarget));
      toast.success(i18n.t('Tag 已删除'));
      setDeleteTagTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('删除失败'));
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDeleteTags = async () => {
    if (!owner || !repo || selectedTags.size === 0) return;
    setDeleting(true);
    let success = 0;
    let failed = 0;
    let skipped = 0;
    const namesToDelete = Array.from(selectedTags);
    for (const tagName of namesToDelete) {
      const hasRelease = releases.some((r) => r.tag_name === tagName);
      if (hasRelease) {
        skipped++;
        continue;
      }
      try {
        await deleteTag(owner, repo, tagName);
        success++;
        setTags((prev) => prev.filter((t) => t.name !== tagName));
      } catch {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    setDeleting(false);
    setBulkDeleteTagsOpen(false);
    setSelectedTags(new Set());
    if (skipped > 0) {
      toast.warning(
        `${i18n.t('已删除')} ${success} ${i18n.t('个')}` +
        (failed > 0 ? `，${i18n.t('失败')} ${failed}` : '') +
        `，${i18n.t('跳过')} ${skipped} ${i18n.t('个（有 Release）')}`
      );
    } else if (failed === 0) {
      toast.success(i18n.t('已删除') + ` ${success} ${i18n.t('个 Tag')}`);
    } else {
      toast.warning(i18n.t('已删除') + ` ${success}/${namesToDelete.length}`);
    }
  };

  const handleDeleteRelease = async () => {
    if (!deleteRelTarget || !owner || !repo) return;
    setDeleting(true);
    try {
      await deleteRelease(owner, repo, deleteRelTarget);
      setReleases((prev) => prev.filter((r) => r.id !== deleteRelTarget));
      toast.success(i18n.t('Release 已删除'));
      setDeleteRelTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('删除失败'));
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteArtifact = async () => {
    if (!deleteArtTarget || !owner || !repo) return;
    setDeleting(true);
    try {
      await deleteArtifact(owner, repo, deleteArtTarget);
      setArtifacts((prev) => prev.filter((a) => a.id !== deleteArtTarget));
      toast.success(i18n.t('Artifact 已删除'));
      setDeleteArtTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('删除失败'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PullToRefresh onRefresh={async () => { await Promise.all([loadReleases(1, false), loadArtifacts(), loadTags()]); }}>
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <button type="button" className="hover:text-accent" onClick={() => navigate('/repos')}>{i18n.t('仓库')}</button>
        <ChevronRight className="w-3 h-3" />
        <button type="button" className="hover:text-accent" onClick={() => navigate(`/repos/${owner}/${repo}`)}>{owner}/{repo}</button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">{i18n.t('产物')}</span>
      </div>

      <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
        <Package className="w-5 h-5 text-primary" />
        {i18n.t('仓库产物')}</h1>

      <Tabs defaultValue="releases">
        <TabsList className="bg-secondary border border-border">
          <TabsTrigger value="releases" className="data-[state=active]:bg-card data-[state=active]:text-foreground text-muted-foreground gap-1.5">
            <Tag className="w-3.5 h-3.5" />Releases
          </TabsTrigger>
          <TabsTrigger value="tags" className="data-[state=active]:bg-card data-[state=active]:text-foreground text-muted-foreground gap-1.5"
            onClick={() => { if (tags.length === 0) loadTags(); }}>
            <Tags className="w-3.5 h-3.5" />Tags
          </TabsTrigger>
          <TabsTrigger value="artifacts" className="data-[state=active]:bg-card data-[state=active]:text-foreground text-muted-foreground gap-1.5"
            onClick={() => { if (artifacts.length === 0) loadArtifacts(); }}>
            <Zap className="w-3.5 h-3.5" />Artifacts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="releases" className="mt-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {loadingReleases ? (
              <div className="divide-y divide-border">
                {[1,2,3].map(i => (
                  <div key={i} className="p-4 flex gap-3">
                    <Skeleton className="w-8 h-8 rounded bg-muted shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3 bg-muted" />
                      <Skeleton className="h-3 w-1/4 bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : releases.length === 0 ? (
              <div className="py-16 text-center">
                <Tag className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-foreground font-medium">{i18n.t('暂无 Release')}</p>
                <p className="text-sm text-muted-foreground mt-1">{i18n.t('创建 Release 后可在此查看和下载产物')}</p>
                <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 mt-4">
                  <a href={`https://github.com/${owner}/${repo}/releases/new`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />{i18n.t('在 GitHub 创建 Release')}
                  </a>
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {releases.map((rel) => (
                  <ReleaseItem key={rel.id} release={rel} onDelete={setDeleteRelTarget} canPush={canPush} />
                ))}
              </div>
            )}
          </div>
          {hasMoreReleases && !loadingReleases && (
            <Button variant="ghost" className="w-full mt-3 border border-border text-muted-foreground hover:bg-secondary" onClick={() => loadReleases(releasePage + 1, true)}>
              {i18n.t('加载更多')}</Button>
          )}
        </TabsContent>

        <TabsContent value="tags" className="mt-4">
          {tags.length > 0 && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Button variant="ghost" size="sm" className="h-8 border border-border text-muted-foreground hover:bg-secondary" onClick={toggleAllTags}>
                <CheckSquare className="w-3.5 h-3.5 mr-1.5" />
                {selectedTags.size === tags.length ? i18n.t('取消全选') : i18n.t('全选')}
              </Button>
              {selectedTags.size > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">{i18n.t('已选')} {selectedTags.size} {i18n.t('项')}</span>
                  {canPush && (
                    <Button variant="ghost" size="sm" className="h-8 border border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setBulkDeleteTagsOpen(true)}>
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      {i18n.t('批量删除')}
                    </Button>
                  )}
                </>
              )}
              <Button variant="ghost" size="icon" className="w-8 h-8 ml-auto text-muted-foreground hover:bg-secondary" onClick={loadTags} disabled={loadingTags}>
                <RefreshCw className={`w-3.5 h-3.5 ${loadingTags ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          )}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {loadingTags ? (
              <div className="divide-y divide-border">
                {[1,2,3].map(i => (
                  <div key={i} className="p-4 flex gap-3 items-center">
                    <Skeleton className="w-4 h-4 rounded bg-muted shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3 bg-muted" />
                      <Skeleton className="h-3 w-1/4 bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : tags.length === 0 ? (
              <div className="py-16 text-center">
                <Tags className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-foreground font-medium">{i18n.t('暂无 Tag')}</p>
                <p className="text-sm text-muted-foreground mt-1">{i18n.t('推送带 tag 的提交后此处会显示')}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {tags.map((tag) => {
                  const linkedRelease = releases.find((r) => r.tag_name === tag.name);
                  const checked = selectedTags.has(tag.name);
                  return (
                    <div key={tag.name} className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleTagSelect(tag.name)}
                        disabled={!!linkedRelease}
                        className="shrink-0"
                        title={linkedRelease ? i18n.t('有 Release 的 Tag 不支持批量删除，请先在 Releases 中删除对应 Release') : undefined}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground font-mono break-all">{tag.name}</span>
                          {linkedRelease ? (
                            <Badge variant="outline" className="text-xs border-primary/40 text-primary shrink-0">{i18n.t('有 Release')}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs border-border text-muted-foreground shrink-0">{i18n.t('无 Release')}</Badge>
                          )}
                          {linkedRelease?.prerelease && (
                            <Badge className="bg-warning/10 text-warning border-warning/30 text-xs shrink-0">{i18n.t('预发布')}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          <code className="font-mono">{tag.commit.sha.substring(0, 7)}</code>
                          {linkedRelease && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatRelativeTime(linkedRelease.published_at || linkedRelease.created_at)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {canPush && (
                        <Button variant="ghost" size="icon" className="w-7 h-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteTagTarget(tag.name)} title={i18n.t('删除 Tag')}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="artifacts" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button variant="ghost" size="sm" className="border border-border text-muted-foreground hover:bg-secondary h-8" onClick={loadArtifacts} disabled={loadingArtifacts}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loadingArtifacts ? 'animate-spin' : ''}`} />{i18n.t('刷新')}</Button>
          </div>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {loadingArtifacts ? (
              <div className="divide-y divide-border">
                {[1,2,3,4].map(i => (
                  <div key={i} className="p-4 flex gap-3">
                    <Skeleton className="w-8 h-8 rounded bg-muted shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3 bg-muted" />
                      <Skeleton className="h-3 w-1/4 bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : artifacts.length === 0 ? (
              <div className="py-16 text-center">
                <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-foreground font-medium">{i18n.t('暂无 Artifacts')}</p>
                <p className="text-sm text-muted-foreground mt-1 text-pretty max-w-xs mx-auto">
                  {i18n.t('Actions Artifacts 是工作流运行后上传的产物文件，会在一段时间后自动过期。')}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {artifacts.map((art) => (
                  <div key={art.id} className="flex items-center gap-3 px-4 py-3 group hover:bg-secondary/30 transition-colors">
                    <FileArchive className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-mono text-foreground">{art.name}</span>
                        {art.expired && <Badge variant="outline" className="text-xs text-muted-foreground border-border">{i18n.t('已过期')}</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        <span>{formatBytes(art.size_in_bytes)}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatRelativeTime(art.created_at)}</span>
                        {art.expires_at && !art.expired && (
                          <span>{i18n.t('过期：')}{formatRelativeTime(art.expires_at)}</span>
                        )}
                        {art.workflow_run && (
                          <span>{i18n.t('分支：')}<code className="font-mono">{art.workflow_run.head_branch}</code></span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!art.expired && (
                        <ArtifactDownloadButton art={art} owner={owner ?? ''} repo={repo ?? ''} />
                      )}
                      {canPush && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteArtTarget(art.id)}
                        title={i18n.t('删除')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!deleteRelTarget} onOpenChange={() => setDeleteRelTarget(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">{i18n.t('确认删除 Release')}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">{i18n.t('此操作不可撤销，该 Release 及所有关联产物文件将被永久删除。')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border hover:bg-secondary">{i18n.t('取消')}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteRelease} disabled={deleting}>
              {deleting ? i18n.t('删除中...') : i18n.t('确认删除')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteArtTarget} onOpenChange={() => setDeleteArtTarget(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">{i18n.t('确认删除 Artifact')}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">{i18n.t('此操作不可撤销，该 Artifact 文件将被永久删除。')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border hover:bg-secondary">{i18n.t('取消')}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteArtifact} disabled={deleting}>
              {deleting ? i18n.t('删除中...') : i18n.t('确认删除')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTagTarget} onOpenChange={() => setDeleteTagTarget(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">{i18n.t('确认删除 Tag')}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {i18n.t('删除 Tag 后，如果它关联了 Release，该 Release 会变为无 Tag 状态。此操作不可撤销。')}
              <code className="block mt-2 font-mono text-foreground bg-secondary px-2 py-1.5 rounded text-xs break-all">
                {deleteTagTarget}
              </code>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border hover:bg-secondary">{i18n.t('取消')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteTag}
              disabled={deleting}
            >
              {deleting ? i18n.t('删除中...') : i18n.t('确认删除')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteTagsOpen} onOpenChange={setBulkDeleteTagsOpen}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">{i18n.t('批量删除 Tag')}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {i18n.t('将删除选中的')} <span className="text-foreground font-semibold">{selectedTags.size}</span> {i18n.t('个 Tag。如果它们关联了 Release，相关 Release 会变为无 Tag 状态。此操作不可撤销。')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border hover:bg-secondary">{i18n.t('取消')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleBulkDeleteTags}
              disabled={deleting}
            >
              {deleting ? i18n.t('删除中...') : i18n.t('确认删除')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </PullToRefresh>
  );
}
