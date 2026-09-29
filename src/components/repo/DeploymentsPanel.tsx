import { useState, useEffect, useCallback } from 'react';
import {
  Rocket, Trash2, ListX, RefreshCw, AlertCircle, Loader2, ExternalLink, Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  getRepoDeployments, deleteDeployment, markDeploymentInactive, deleteAllDeployments,
  formatRelativeTime,
} from '@/services/github';
import type { GitHubDeployment } from '@/types/types';
import { toast } from 'sonner';
import i18n from '@/i18n';

export default function DeploymentsPanel({ owner, repo }: { owner: string; repo: string }) {
  const [deployments, setDeployments] = useState<GitHubDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GitHubDeployment | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ deleted: 0, total: 0, failed: 0 });

  const load = useCallback(async (bust = false) => {
    setLoading(true);
    setError('');
    try {
      const data = await getRepoDeployments(owner, repo, { per_page: 100, page: 1, bust });
      setDeployments(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : i18n.t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [owner, repo]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(deleteTarget.id);
    try {
      await markDeploymentInactive(owner, repo, deleteTarget.id);
      await deleteDeployment(owner, repo, deleteTarget.id);
      toast.success(i18n.t('已删除部署记录'));
      setDeployments((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : i18n.t('删除失败'));
    } finally {
      setDeleting(null);
    }
  };

  const handleClearAll = async () => {
    setBulkRunning(true);
    setBulkProgress({ deleted: 0, total: 0, failed: 0 });
    try {
      const result = await deleteAllDeployments(owner, repo, (info) => setBulkProgress(info));
      toast.success(
        i18n.t('已删除') + ` ${result.deleted}/${result.total}` +
        (result.failed > 0 ? ` (${i18n.t('失败')} ${result.failed})` : ''),
      );
      setClearAllOpen(false);
      setDeployments((prev) => (prev.length > 0 ? [prev[0]] : []));
      load(true).catch(() => {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : i18n.t('批量删除失败'));
    } finally {
      setBulkRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{i18n.t('部署记录')}</span>
          {!loading && (
            <Badge variant="outline" className="text-xs border-border text-muted-foreground font-normal">
              {deployments.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="border border-border text-muted-foreground hover:bg-secondary h-9"
            onClick={() => load(true)}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            {i18n.t('刷新')}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="w-9 h-9 text-destructive hover:bg-destructive/10"
            onClick={() => setClearAllOpen(true)}
            disabled={bulkRunning || deployments.length <= 1}
            title={i18n.t('删除所有部署记录（保留最新一条）')}
          >
            <ListX className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 bg-muted rounded-lg" />)}
        </div>
      ) : error ? (
        <div className="text-center py-12 text-destructive border border-border rounded-lg bg-card">
          <AlertCircle className="w-10 h-10 mx-auto mb-3" />
          <p>{error}</p>
          <Button variant="ghost" size="sm" className="mt-3 border border-border text-muted-foreground hover:bg-secondary h-9" onClick={() => load(true)}>
            {i18n.t('重试')}
          </Button>
        </div>
      ) : deployments.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-border rounded-lg bg-card">
          <Rocket className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">{i18n.t('暂无部署记录')}</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-card divide-y divide-border overflow-hidden">
          {deployments.map((dep, idx) => (
            <div key={dep.id} className="p-4 flex items-start gap-3">
              <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{dep.environment}</span>
                  {idx === 0 && (
                    <Badge variant="outline" className="border-primary/50 text-primary bg-primary/10 text-xs">
                      {i18n.t('最新')}
                    </Badge>
                  )}
                  <code className="text-xs font-mono text-muted-foreground">{dep.sha.substring(0, 7)}</code>
                </div>
                {dep.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{dep.description}</p>
                )}
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span>{formatRelativeTime(dep.created_at)}</span>
                  {dep.ref && <span className="font-mono">· {dep.ref}</span>}
                  {dep.creator && <span>· {dep.creator.login}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {dep.payload?.web_url && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 text-muted-foreground hover:bg-secondary"
                    onClick={() => window.open(dep.payload?.web_url || '', '_blank', 'noopener,noreferrer')}
                    title={i18n.t('打开链接')}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteTarget(dep)}
                  disabled={deleting === dep.id}
                >
                  {deleting === dep.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive" />
              {i18n.t('删除部署记录')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm">
              {i18n.t('确定要删除此部署记录吗？此操作不可恢复。')}
              <span className="block mt-2 font-mono text-foreground text-xs">
                {deleteTarget?.environment} · {deleteTarget?.sha.substring(0, 7)}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border hover:bg-secondary" disabled={!!deleting}>{i18n.t('取消')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={!!deleting}
            >
              {deleting ? i18n.t('删除中...') : i18n.t('确认删除')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearAllOpen} onOpenChange={(v) => { if (!bulkRunning) setClearAllOpen(v); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive" />
              {bulkRunning ? i18n.t('正在删除...') : i18n.t('清理所有部署记录')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm space-y-2">
              {bulkRunning ? (
                <>
                  <span>{i18n.t('进度：')} {bulkProgress.deleted} / {bulkProgress.total}
                    {bulkProgress.failed > 0 && ` · ${i18n.t('失败')} ${bulkProgress.failed}`}
                  </span>
                  <span className="block h-1.5 bg-secondary rounded-full overflow-hidden">
                    <span
                      className="block h-full bg-destructive transition-all"
                      style={{ width: bulkProgress.total > 0 ? `${(bulkProgress.deleted / bulkProgress.total) * 100}%` : '0%' }}
                    />
                  </span>
                </>
              ) : (
                <>
                  <span>{i18n.t('此操作将删除所有旧部署记录，保留最新一条。')}</span>
                  <span className="block text-destructive text-xs">{i18n.t('删除后不可恢复。')}</span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border hover:bg-secondary" disabled={bulkRunning}>{i18n.t('取消')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); handleClearAll(); }}
              disabled={bulkRunning}
            >
              {bulkRunning ? i18n.t('删除中...') : i18n.t('确认清理')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
