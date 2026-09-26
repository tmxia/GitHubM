// 仓库部署密钥 —— 管理用于访问仓库的 SSH 公钥

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Key, Plus, Trash2, ChevronRight, RefreshCw, AlertCircle, Lock, Check, ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  getDeployKeys, createDeployKey, deleteDeployKey, formatRelativeTime,
} from '@/services/github';
import type { GitHubDeployKey } from '@/services/github';
import { toast } from 'sonner';
import i18n from '@/i18n';

export default function RepoDeployKeysPage() {
  const { owner, repo: repoName } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const [keys, setKeys] = useState<GitHubDeployKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [keyContent, setKeyContent] = useState('');
  const [readOnly, setReadOnly] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GitHubDeployKey | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!owner || !repoName) return;
    setLoading(true);
    setError('');
    try {
      const data = await getDeployKeys(owner, repoName);
      setKeys(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : i18n.t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [owner, repoName]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!owner || !repoName) return;
    if (!title.trim()) { toast.error(i18n.t('请输入标题')); return; }
    if (!keyContent.trim()) { toast.error(i18n.t('请输入公钥')); return; }
    if (!keyContent.trim().startsWith('ssh-')) { toast.error(i18n.t('公钥格式错误，应以 ssh- 开头')); return; }
    setSaving(true);
    try {
      await createDeployKey(owner, repoName, {
        title: title.trim(), key: keyContent.trim(), read_only: readOnly,
      });
      toast.success(i18n.t('部署密钥已添加'));
      setAddOpen(false);
      setTitle(''); setKeyContent(''); setReadOnly(true);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : i18n.t('添加失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!owner || !repoName || !deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDeployKey(owner, repoName, deleteTarget.id);
      toast.success(i18n.t('已删除'));
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : i18n.t('删除失败'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <button type="button" className="hover:text-accent" onClick={() => navigate('/repos')}>{i18n.t('仓库')}</button>
        <ChevronRight className="w-3 h-3" />
        <button type="button" className="hover:text-accent truncate" onClick={() => navigate(`/repos/${owner}/${repoName}`)}>{owner}/{repoName}</button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">{i18n.t('部署密钥')}</span>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            {i18n.t('部署密钥')}
          </h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="border border-border" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {i18n.t('刷新')}
          </Button>
          <Button variant="ghost" size="sm" className="border border-border text-muted-foreground hover:bg-secondary h-9" onClick={() => setAddOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          {i18n.t('添加部署密钥')}
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mt-1 text-pretty">
            {i18n.t('部署密钥是存储在仓库上的 SSH 公钥，用于允许外部服务访问该仓库（默认只读）')}
          </p>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 bg-muted" />)}
        </div>
      ) : error ? (
        <div className="text-center py-8 text-destructive">
          <AlertCircle className="w-10 h-10 mx-auto mb-3" />
          <p>{error}</p>
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-border rounded-lg bg-card">
          <Key className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">{i18n.t('暂无部署密钥')}</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-card divide-y divide-border overflow-hidden">
          <div className="px-4 py-3 bg-secondary/30 flex items-center gap-3">
            <Key className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{i18n.t('已添加的密钥')}</span>
            <Badge variant="outline" className="border-border text-muted-foreground text-xs">{keys.length}</Badge>
          </div>
          {keys.map((k) => (
            <div key={k.id} className="p-4 flex items-start gap-3">
              <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
                <Key className="w-4 h-4 text-muted-foreground" />
              </div>
                        <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{k.title}</span>
                  {k.verified && (
                    <Badge variant="outline" className="border-success text-success text-xs">
                      <Check className="w-3 h-3 mr-1" />{i18n.t('已验证')}
                    </Badge>
                  )}
                  {k.read_only && (
                    <Badge variant="outline" className="border-border text-muted-foreground text-xs">
                      <Lock className="w-3 h-3 mr-1" />{i18n.t('只读')}
                    </Badge>
                  )}
                </div>
                <code className="block text-xs font-mono text-muted-foreground mt-1 truncate">{k.key}</code>
                <p className="text-xs text-muted-foreground mt-1">
                  {i18n.t('添加于')} {formatRelativeTime(k.created_at)}
                  {k.last_used && ` · ${i18n.t('最后使用')} ${formatRelativeTime(k.last_used)}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 text-destructive/70 hover:bg-destructive/10 hover:text-destructive shrink-0"
                onClick={() => setDeleteTarget(k)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" />{i18n.t('添加部署密钥')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-foreground">{i18n.t('标题')}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={i18n.t('例如：服务器部署')} className="bg-secondary border-border text-foreground placeholder:text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-foreground">{i18n.t('公钥')}</Label>
              <Textarea value={keyContent} onChange={(e) => setKeyContent(e.target.value)} placeholder="ssh-rsa AAAAB3NzaC1yc2E..." rows={5} className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-mono text-xs resize-none" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="deploy-key-ro" className="text-sm font-normal text-foreground cursor-pointer">
                {i18n.t('只读访问（不允许通过该密钥推送）')}
              </Label>
              <Switch id="deploy-key-ro" checked={readOnly} onCheckedChange={setReadOnly} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="border border-border text-muted-foreground hover:bg-secondary" onClick={() => setAddOpen(false)} disabled={saving}>{i18n.t('取消')}</Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleAdd} disabled={saving}>
              {saving ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />{i18n.t('添加中...')}</> : i18n.t('添加')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive" />{i18n.t('删除部署密钥')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm">
              {i18n.t('确定要删除')}<code className="font-mono text-foreground bg-secondary px-1 rounded">{deleteTarget?.title}</code>{i18n.t('吗？此操作不可恢复。')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border hover:bg-secondary" disabled={deleting}>{i18n.t('取消')}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete} disabled={deleting}>
              {deleting ? i18n.t('删除中...') : i18n.t('确认删除')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
