import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefresh from '@/components/common/PullToRefresh';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Zap, ChevronRight, RefreshCw, AlertCircle, Loader2, Package, GitBranch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import {
  getActionsPermissions, updateActionsPermissions,
  getWorkflowPermissions, updateWorkflowPermissions,
  getSelectedActions, updateSelectedActions,
  getArtifactLogRetention, updateArtifactLogRetention,
} from '@/services/github';
import { toast } from 'sonner';
import i18n from '@/i18n';

type AllowedActions = 'all' | 'local_only' | 'selected';
type WorkflowPerm = 'read' | 'write';

export default function RepoActionsSettingsPage() {
  const { owner, repo: repoName } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const { ref: refreshRef, trigger } = usePullToRefresh();
  const [reloadKey, setReloadKey] = useState(0);
    const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [enabled, setEnabled] = useState(true);
  const [allowedActions, setAllowedActions] = useState<AllowedActions>('all');

  const [workflowPerm, setWorkflowPerm] = useState<WorkflowPerm>('read');
  const [canApprovePR, setCanApprovePR] = useState(false);

  const [githubOwnedAllowed, setGithubOwnedAllowed] = useState(true);
  const [verifiedAllowed, setVerifiedAllowed] = useState(true);
  const [patternsText, setPatternsText] = useState('');

  const [retentionDays, setRetentionDays] = useState(90);

  const load = useCallback(async (isSilent = false) => {
    if (!owner || !repoName) return;
    if (!isSilent) setLoading(true);
    setError('');
    try {
      const [perm, wf, sel, ret] = await Promise.all([
        getActionsPermissions(owner, repoName).catch(() => null),
        getWorkflowPermissions(owner, repoName).catch(() => null),
        getSelectedActions(owner, repoName).catch(() => null),
        getArtifactLogRetention(owner, repoName).catch(() => null),
      ]);
      if (perm) {
        setEnabled(perm.enabled);
        if (perm.allowed_actions) setAllowedActions(perm.allowed_actions);
      }
      if (wf) {
        if (wf.default_workflow_permissions) setWorkflowPerm(wf.default_workflow_permissions);
        setCanApprovePR(!!wf.can_approve_pull_request_reviews);
      }
      if (sel) {
        setGithubOwnedAllowed(!!sel.github_owned_allowed);
        setVerifiedAllowed(!!sel.verified_allowed);
        setPatternsText((sel.patterns_allowed || []).join('\n'));
      }
      if (ret && typeof ret.days === 'number') setRetentionDays(ret.days);
    } catch (e) {
      setError(e instanceof Error ? e.message : i18n.t('加载失败'));
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [owner, repoName, reloadKey]);

  useEffect(() => { load(); }, [load, reloadKey]);

  
  const handleSave = async () => {
    if (!owner || !repoName) return;
    if (retentionDays < 1 || retentionDays > 400) {
      toast.error(i18n.t('保留天数必须在 1-400 之间'));
      return;
    }
    setSaving(true);

    try {
      // 1. 执行所有更新请求（严格遵循，不吞错误）
      const promises = [
        updateActionsPermissions(owner, repoName, {
          enabled,
          ...(enabled ? { allowed_actions: allowedActions } : {}),
        })
      ];

      if (enabled) {
        promises.push(
          updateWorkflowPermissions(owner, repoName, {
            default_workflow_permissions: workflowPerm,
            can_approve_pull_request_reviews: canApprovePR,
          })
        );

        if (allowedActions === 'selected') {
          const patterns = patternsText
            .split(String.fromCharCode(10))
            .map((l) => l.trim())
            .filter(Boolean);
          promises.push(
            updateSelectedActions(owner, repoName, {
              github_owned_allowed: githubOwnedAllowed,
              verified_allowed: verifiedAllowed,
              patterns_allowed: patterns,
            })
          );
        }
      }

      await Promise.all(promises);

      // 隔离企业版接口，静默忽略它的报错，不影响整体流程
      await updateArtifactLogRetention(owner, repoName, retentionDays).catch(() => {});

      // 2. 完美对齐仓库设置：强制重新拉取最新数据（带 fresh 标志，如果底层支持的话）
      // 为了兼容性，如果我们的 api 没有 fresh 参数，我们直接通过重新执行 load(true) 并在内部加上防缓存参数，或者直接用本地状态覆盖。
      // 这里我们选择重新请求接口拉取最新真实状态
      const [freshPerm, freshWf, freshSel, freshRet] = await Promise.all([
        getActionsPermissions(owner, repoName).catch(() => null),
        getWorkflowPermissions(owner, repoName).catch(() => null),
        getSelectedActions(owner, repoName).catch(() => null),
        getArtifactLogRetention(owner, repoName).catch(() => null),
      ]);

      if (freshPerm) {
        setEnabled(freshPerm.enabled);
        if (freshPerm.allowed_actions) setAllowedActions(freshPerm.allowed_actions);
      }
      if (freshWf) {
        if (freshWf.default_workflow_permissions) setWorkflowPerm(freshWf.default_workflow_permissions);
        setCanApprovePR(!!freshWf.can_approve_pull_request_reviews);
      }
      if (freshSel) {
        setGithubOwnedAllowed(!!freshSel.github_owned_allowed);
        setVerifiedAllowed(!!freshSel.verified_allowed);
        setPatternsText((freshSel.patterns_allowed || []).join('\n'));
      }
      if (freshRet && typeof freshRet.days === 'number') setRetentionDays(freshRet.days);

      // 3. 成功提示
      toast.success(i18n.t('Actions 设置已保存并同步生效'));

    } catch (e) {
      // 只要有一个步骤报错，这里一定会接住
      toast.error(e instanceof Error ? e.message : i18n.t('保存失败，请检查权限或网络'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-6 w-40 bg-muted" />
        <Skeleton className="h-32 bg-muted" />
        <Skeleton className="h-32 bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto text-center py-12 text-destructive">
        <AlertCircle className="w-10 h-10 mx-auto mb-3" />
        <p>{error}</p>
        
      </div>
    );
  }

  return (
    <PullToRefresh ref={refreshRef} onRefresh={() => load(true)}>
<div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <button type="button" className="hover:text-accent" onClick={() => navigate('/repos')}>{i18n.t('仓库')}</button>
        <ChevronRight className="w-3 h-3" />
        <button type="button" className="hover:text-accent truncate" onClick={() => navigate(`/repos/${owner}/${repoName}`)}>{owner}/{repoName}</button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">{i18n.t('Actions 设置')}</span>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            {i18n.t('Actions 设置')}
          </h1>
        <div className="flex items-center gap-2">
          
          <Button
          variant="ghost"
          size="sm"
          className="border border-border text-muted-foreground hover:bg-secondary h-9"
          onClick={() => trigger(handleSave)}
          disabled={saving}
        >
          {i18n.t('保存更改')}
        </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
          <Zap className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{i18n.t('Actions 权限')}</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="actions-enabled" className="text-sm font-normal text-foreground cursor-pointer">
              {i18n.t('启用 GitHub Actions')}
            </Label>
            <Switch id="actions-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          {enabled && (
            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">{i18n.t('允许哪些 Actions 运行')}</p>
              <div className="flex flex-col gap-2">
                {([
                  { val: 'all', label: i18n.t('允许所有 Actions') },
                  { val: 'local_only', label: i18n.t('仅允许本地 Actions（同仓库内）') },
                  { val: 'selected', label: i18n.t('仅允许选定的 Actions') },
                ] as const).map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors text-left ${allowedActions === opt.val ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:bg-secondary'}`}
                    onClick={() => setAllowedActions(opt.val)}
                  >
                    <span className={`w-3 h-3 rounded-full border-2 shrink-0 ${allowedActions === opt.val ? 'border-primary bg-primary' : 'border-border'}`} />
                    {opt.label}
                  </button>
                ))}
              </div>
        {allowedActions === 'selected' && (
          <div className="mt-3 space-y-2">
            <Label className="text-sm font-normal text-foreground">{i18n.t('允许的 Actions 白名单 (每行一个模式)')}</Label>
            <Textarea
              value={patternsText}
              onChange={(e) => setPatternsText(e.target.value)}
              placeholder="actions/checkout@*"
              className="font-mono text-xs bg-secondary border-border min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">支持通配符 *，例如 actions/* 或 *。</p>
          </div>
        )}

            </div>
          )}
        </div>
      </div>

      {enabled && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{i18n.t('Workflow 权限')}</span>
        </div>
        <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">{i18n.t('GITHUB_TOKEN 的默认权限')}</p>
            <div className="flex flex-col gap-2">
              {([
                { val: 'read', label: i18n.t('只读（推荐）'), desc: i18n.t('仅允许读取内容') },
                { val: 'write', label: i18n.t('读写'), desc: i18n.t('允许修改仓库内容') },
              ] as const).map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  className={`flex items-start gap-2 px-3 py-2 rounded-md border text-sm transition-colors text-left ${workflowPerm === opt.val ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:bg-secondary'}`}
                  onClick={() => setWorkflowPerm(opt.val)}
                >
                  <span className={`w-3 h-3 rounded-full border-2 shrink-0 mt-0.5 ${workflowPerm === opt.val ? 'border-primary bg-primary' : 'border-border'}`} />
                  <span className="flex-1 min-w-0">
                    <span className="block">{opt.label}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{opt.desc}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
              <Label htmlFor="can-approve" className="text-sm font-normal text-foreground cursor-pointer">
                {i18n.t('允许 GitHub Actions 创建和批准 Pull Request')}
              </Label>
              <Switch id="can-approve" checked={canApprovePR} onCheckedChange={setCanApprovePR} />
            </div>
          </div>
        </div>
      )}

      {enabled && allowedActions === 'selected' && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
          <Package className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{i18n.t('选定的 Actions')}</span>
        </div>
        <div className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="gh-owned" className="text-sm font-normal text-foreground cursor-pointer">
                {i18n.t('允许 GitHub 官方 Actions（如 actions/checkout）')}
              </Label>
              <Switch id="gh-owned" checked={githubOwnedAllowed} onCheckedChange={setGithubOwnedAllowed} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="verified" className="text-sm font-normal text-foreground cursor-pointer">
                {i18n.t('允许已验证创建者的 Actions')}
              </Label>
              <Switch id="verified" checked={verifiedAllowed} onCheckedChange={setVerifiedAllowed} />
            </div>
            <div className="space-y-1.5 pt-2 border-t border-border">
              <Label className="text-sm font-normal text-foreground">{i18n.t('额外允许的 Action 模式（每行一个）')}</Label>
              <textarea
                value={patternsText}
                onChange={(e) => setPatternsText(e.target.value)}
                placeholder={'owner/repo@*\nowner/*@v1.0'}
                rows={4}
                className="w-full rounded-md bg-secondary border border-border text-foreground placeholder:text-muted-foreground font-mono text-xs p-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-xs text-muted-foreground">{i18n.t('支持 * 通配符。例如：actions/*@v4')}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
          <Package className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{i18n.t('产物和日志保留')}</span>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">{i18n.t('Artifacts 和日志的保留天数（1-400）')}</p>
          <div className="space-y-1.5">
            <Label className="text-sm font-normal text-foreground">{i18n.t('保留天数')}</Label>
            <Input
              type="number"
              min={1}
              max={400}
              value={retentionDays}
              onChange={(e) => setRetentionDays(parseInt(e.target.value, 10) || 0)}
              className="bg-secondary border-border text-foreground"
            />
          </div>
        </div>
      </div>
    </div>
    </PullToRefresh>
  );
}
