// 仓库机密和变量 —— 管理 Actions / Dependabot / Codespaces 下的 Secrets 和 Variables

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import sealedbox from 'tweetnacl-sealedbox-js';
import {
  Shield, ChevronRight, RefreshCw, AlertCircle, Plus, Trash2, Pencil, Lock, Loader2, Eye, EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  getRepoSecrets, getRepoSecretPublicKey, putRepoSecret, deleteRepoSecret,
  getRepoVariables, createRepoVariable, updateRepoVariable, deleteRepoVariable,
  formatRelativeTime,
} from '@/services/github';
import type { GitHubSecret, GitHubVariable, SecretScope } from '@/services/github';
import { toast } from 'sonner';
import i18n from '@/i18n';

// ── 加密：sealed box ───────────────────────────────
function encryptSecretValue(value: string, publicKeyB64: string): string {
  const pubKeyBytes = Uint8Array.from(atob(publicKeyB64), (c) => c.charCodeAt(0));
  const msgBytes = new TextEncoder().encode(value);
  const sealed = sealedbox.seal(msgBytes, pubKeyBytes);
  let binary = '';
  for (let i = 0; i < sealed.length; i++) binary += String.fromCharCode(sealed[i]);
  return btoa(binary);
}

// ── 单个 Scope 的内容（Secrets + Variables）───────
function ScopePanel({ owner, repo, scope }: { owner: string; repo: string; scope: SecretScope }) {
  const [secrets, setSecrets] = useState<GitHubSecret[]>([]);
  const [variables, setVariables] = useState<GitHubVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Secret 弹窗
  const [secretOpen, setSecretOpen] = useState(false);
  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [showSecretValue, setShowSecretValue] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);

  // Variable 弹窗
  const [varOpen, setVarOpen] = useState(false);
  const [varEditMode, setVarEditMode] = useState(false);
  const [varOriginalName, setVarOriginalName] = useState('');
  const [varName, setVarName] = useState('');
  const [varValue, setVarValue] = useState('');
  const [savingVar, setSavingVar] = useState(false);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'secret' | 'variable'; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, v] = await Promise.all([
        getRepoSecrets(owner, repo, scope).catch(() => []),
        getRepoVariables(owner, repo, scope).catch(() => []),
      ]);
      setSecrets(s);
      setVariables(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : i18n.t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [owner, repo, scope]);

  useEffect(() => { load(); }, [load]);

  // ── Secret 操作 ──────────────────────────────
  const openAddSecret = () => {
    setSecretName('');
    setSecretValue('');
    setShowSecretValue(false);
    setSecretOpen(true);
  };

  const handleSaveSecret = async () => {
    if (!secretName.trim()) { toast.error(i18n.t('请输入名称')); return; }
    if (!secretValue) { toast.error(i18n.t('请输入值')); return; }
    setSavingSecret(true);
    try {
      const pk = await getRepoSecretPublicKey(owner, repo, scope);
      const encrypted = encryptSecretValue(secretValue, pk.key);
      await putRepoSecret(owner, repo, secretName.trim(), encrypted, pk.key_id, scope);
      toast.success(i18n.t('机密已保存'));
      setSecretOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : i18n.t('保存失败'));
    } finally {
      setSavingSecret(false);
    }
  };

  // ── Variable 操作 ────────────────────────────
  const openAddVariable = () => {
    setVarEditMode(false);
    setVarOriginalName('');
    setVarName('');
    setVarValue('');
    setVarOpen(true);
  };

  const openEditVariable = (v: GitHubVariable) => {
    setVarEditMode(true);
    setVarOriginalName(v.name);
    setVarName(v.name);
    setVarValue(v.value);
    setVarOpen(true);
  };

  const handleSaveVariable = async () => {
    if (!varName.trim()) { toast.error(i18n.t('请输入名称')); return; }
    setSavingVar(true);
    try {
      if (varEditMode) {
        await updateRepoVariable(owner, repo, varOriginalName, varValue, scope);
      } else {
        await createRepoVariable(owner, repo, varName.trim(), varValue, scope);
      }
      toast.success(i18n.t('变量已保存'));
      setVarOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : i18n.t('保存失败'));
    } finally {
      setSavingVar(false);
    }
  };

  // ── 删除 ─────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === 'secret') {
        await deleteRepoSecret(owner, repo, deleteTarget.name, scope);
      } else {
        await deleteRepoVariable(owner, repo, deleteTarget.name, scope);
      }
      toast.success(i18n.t('已删除'));
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : i18n.t('删除失败'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 bg-muted" />
        <Skeleton className="h-20 bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        <AlertCircle className="w-8 h-8 mx-auto mb-2" />
        <p className="text-sm">{error}</p>
        <Button variant="ghost" size="sm" className="mt-2 border border-border text-muted-foreground hover:bg-secondary h-9" onClick={load}>{i18n.t('重试')}</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      {/* ── Secrets 区块 ── */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{i18n.t('机密 (Secrets)')}</span>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground border border-border hover:bg-secondary" onClick={openAddSecret}>
          <Plus className="w-3 h-3 mr-1" />{i18n.t('新建机密')}
          </Button>
        </div>
        <div className="p-4">
          {secrets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{i18n.t('暂无机密')}</p>
          ) : (
            <div className="divide-y divide-border border border-border rounded-md">
              {secrets.map((s) => (
                <div key={s.name} className="p-3 flex items-center gap-3">
                  <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-foreground truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {i18n.t('更新于')} {formatRelativeTime(s.updated_at)}
                    </p>
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    className="w-7 h-7 text-destructive/70 hover:bg-destructive/10 hover:text-destructive shrink-0"
                    onClick={() => setDeleteTarget({ kind: 'secret', name: s.name })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Variables 区块 ── */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{i18n.t('变量 (Variables)')}</span>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground border border-border hover:bg-secondary" onClick={openAddVariable}>
          <Plus className="w-3 h-3 mr-1" />{i18n.t('新建变量')}
          </Button>
        </div>
        <div className="p-4">
          {variables.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{i18n.t('暂无变量')}</p>
          ) : (
            <div className="divide-y divide-border border border-border rounded-md">
              {variables.map((v) => (
                <div key={v.name} className="p-3 flex items-center gap-3">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-foreground truncate">{v.name}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{v.value}</p>
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    className="w-7 h-7 text-muted-foreground hover:bg-secondary shrink-0"
                    onClick={() => openEditVariable(v)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="w-7 h-7 text-destructive/70 hover:bg-destructive/10 hover:text-destructive shrink-0"
                    onClick={() => setDeleteTarget({ kind: 'variable', name: v.name })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Secret 添加弹窗 ── */}
      <Dialog open={secretOpen} onOpenChange={setSecretOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />{i18n.t('新建机密')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-foreground">{i18n.t('名称')}</Label>
              <Input
                value={secretName}
                onChange={(e) => setSecretName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                placeholder="MY_SECRET"
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-mono"
              />
              <p className="text-xs text-muted-foreground">{i18n.t('只能包含字母、数字和下划线，不能以数字开头')}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-foreground">{i18n.t('值')}</Label>
              <div className="relative">
                <Textarea
                  value={secretValue}
                  onChange={(e) => setSecretValue(e.target.value)}
                  placeholder={i18n.t('机密内容...')}
                  rows={4}
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-mono text-xs resize-none pr-10"
                  style={{ WebkitTextSecurity: showSecretValue ? 'none' : 'disc' } as React.CSSProperties}
                />
                <button
                  type="button"
                  className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSecretValue(!showSecretValue)}
                >
                  {showSecretValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="border border-border text-muted-foreground hover:bg-secondary" onClick={() => setSecretOpen(false)} disabled={savingSecret}>{i18n.t('取消')}</Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleSaveSecret} disabled={savingSecret}>
              {savingSecret ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{i18n.t('保存中...')}</> : i18n.t('保存')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Variable 添加/编辑弹窗 ── */}
      <Dialog open={varOpen} onOpenChange={setVarOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />{varEditMode ? i18n.t('编辑变量') : i18n.t('新建变量')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-foreground">{i18n.t('名称')}</Label>
              <Input
                value={varName}
                onChange={(e) => setVarName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                placeholder="MY_VARIABLE"
                disabled={varEditMode}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-mono disabled:opacity-60"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-foreground">{i18n.t('值')}</Label>
              <Textarea
                value={varValue}
                onChange={(e) => setVarValue(e.target.value)}
                placeholder={i18n.t('变量值...')}
                rows={3}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-mono text-xs resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="border border-border text-muted-foreground hover:bg-secondary" onClick={() => setVarOpen(false)} disabled={savingVar}>{i18n.t('取消')}</Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleSaveVariable} disabled={savingVar}>
              {savingVar ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{i18n.t('保存中...')}</> : i18n.t('保存')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 删除确认 ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive" />
              {deleteTarget?.kind === 'secret' ? i18n.t('删除机密') : i18n.t('删除变量')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm">
              {i18n.t('确定要删除')}<code className="font-mono text-foreground bg-secondary px-1 rounded">{deleteTarget?.name}</code>{i18n.t('吗？此操作不可恢复。')}
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

// ── 主页面 ─────────────────────────────────────
export default function RepoSecretsVariablesPage() {
  const { owner, repo: repoName } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const [scope, setScope] = useState<SecretScope>('actions');
  const [refreshKey, setRefreshKey] = useState(0);

  if (!owner || !repoName) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <button type="button" className="hover:text-accent" onClick={() => navigate('/repos')}>{i18n.t('仓库')}</button>
        <ChevronRight className="w-3 h-3" />
        <button type="button" className="hover:text-accent truncate" onClick={() => navigate(`/repos/${owner}/${repoName}`)}>{owner}/{repoName}</button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">{i18n.t('机密和变量')}</span>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            {i18n.t('机密和变量')}
          </h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="border border-border text-muted-foreground hover:bg-secondary h-9" onClick={() => setRefreshKey((k) => k + 1)}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {i18n.t('刷新')}
          </Button>
        </div>
      </div>

      <Tabs value={scope} onValueChange={(v) => setScope(v as SecretScope)} className="space-y-3">
        <TabsList className="bg-secondary border border-border">
          <TabsTrigger value="actions" className="data-[state=active]:bg-card data-[state=active]:text-foreground text-muted-foreground">
            Actions
          </TabsTrigger>
          <TabsTrigger value="dependabot" className="data-[state=active]:bg-card data-[state=active]:text-foreground text-muted-foreground">
            Dependabot
          </TabsTrigger>
          <TabsTrigger value="codespaces" className="data-[state=active]:bg-card data-[state=active]:text-foreground text-muted-foreground">
            Codespaces
          </TabsTrigger>
        </TabsList>
        <TabsContent value="actions">
          <ScopePanel key={`actions-${refreshKey}`} owner={owner} repo={repoName} scope="actions" />
        </TabsContent>
        <TabsContent value="dependabot">
          <ScopePanel key={`dependabot-${refreshKey}`} owner={owner} repo={repoName} scope="dependabot" />
        </TabsContent>
        <TabsContent value="codespaces">
          <ScopePanel key={`codespaces-${refreshKey}`} owner={owner} repo={repoName} scope="codespaces" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
