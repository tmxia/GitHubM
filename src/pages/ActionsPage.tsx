
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  History,
  ClipboardCopy,
  Link,
  MoveRight,
  Download,
  ChevronRight,
  Play,
  RefreshCw,
  XCircle,
  Square,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  Zap,
  ChevronDown,
  SkipForward,
  GitBranch,
  Plus,
  Trash2,
  Terminal,
  Copy,
  Check,

  Package,
  HardDrive,

  ExternalLink,
  AlertTriangle,
  ListX,
  Sliders,
  Pencil,
  FileCode2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  getWorkflows,
  getWorkflowRuns,
  getWorkflowRun,
  getWorkflowRunFresh,
  triggerWorkflow,
  cancelWorkflowRun,
  rerunWorkflowRun,
  deleteAllWorkflowRuns,
  getWorkflowRunJobs,
  getJobLogs,
  getBranches,
  getFileContent,
  getFileRawText,
  formatRelativeTime,
  getUserPackages,
  listUserPackageVersions,
  getPackageVersionSize,
  deleteUserPackageVersion,
  deleteUserPackage,
  deleteWorkflowRun,
} from '@/services/github';
import type { GitHubWorkflow, GitHubWorkflowRun, GitHubWorkflowJob } from '@/types/types';
import { toast } from 'sonner';
import { parseWorkflowInputs, type WorkflowInput } from '@/lib/workflowInputs';
import { copyToClipboard, decodeBase64Content } from '@/lib/utils';
import i18n from "@/i18n";
import { registerCompileWatch } from '@/lib/compilePoller';
import { useAuth } from '@/contexts/AuthContext';
import { useRepoPermissions } from "@/hooks/use-repo-permissions";
import PullToRefresh from '@/components/common/PullToRefresh';

type LastTrigger = {
  workflowId: number;
  workflowName: string;
  ref: string;
  inputs: Record<string, string>;
  triggeredAt: string;
};

function lastTriggerKey(owner: string, repo: string, workflowId?: number) {
  if (workflowId !== undefined) {
    return `last-trigger:${owner}/${repo}:${workflowId}`;
  }
  return `last-trigger:${owner}/${repo}`;
}

function loadLastTrigger(owner: string, repo: string, workflowId?: number): LastTrigger | null {
  try {
    const raw = localStorage.getItem(lastTriggerKey(owner, repo, workflowId));
    return raw ? (JSON.parse(raw) as LastTrigger) : null;
  } catch {
    return null;
  }
}

function saveLastTrigger(owner: string, repo: string, data: LastTrigger) {
  try {
    localStorage.setItem(lastTriggerKey(owner, repo, data.workflowId), JSON.stringify(data));
  } catch {}
}

function RunStatusBadge({ status, conclusion }: { status: string | null; conclusion: string | null }) {
  if (status === 'in_progress' || status === 'queued' || status === 'waiting') {
    return (
      <Badge className="bg-warning/10 text-warning border-warning/30 text-xs flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        {status === 'in_progress' ? i18n.t('运行中') : status === 'queued' ? i18n.t('排队中') : i18n.t('等待中')}
      </Badge>
    );
  }
  if (conclusion === 'success') {
    return <Badge className="bg-success/10 text-success border-success/30 text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{i18n.t('成功')}</Badge>;
  }
  if (conclusion === 'failure') {
    return <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-xs flex items-center gap-1"><XCircle className="w-3 h-3" />{i18n.t('失败')}</Badge>;
  }
  if (conclusion === 'cancelled') {
    return <Badge className="bg-secondary text-muted-foreground border-border text-xs">{i18n.t('已取消')}</Badge>;
  }
  if (conclusion === 'skipped') {
    return <Badge className="bg-secondary text-muted-foreground border-border text-xs flex items-center gap-1"><SkipForward className="w-3 h-3" />{i18n.t('已跳过')}</Badge>;
  }
  if (conclusion === 'timed_out') {
    return <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-xs flex items-center gap-1"><Clock className="w-3 h-3" />{i18n.t('超时')}</Badge>;
  }
  return <Badge className="bg-secondary text-muted-foreground border-border text-xs">{conclusion || status || i18n.t('未知')}</Badge>;
}

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '');
}

function AnsiLine({ raw }: { raw: string }) {
  const clean = stripAnsi(raw);
  const ltrimmed = clean.replace(/^[\s\uFEFF\u00A0]+/, '');
  const m = ltrimmed.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(.*)/);
  if (m) {
    return (
      <span>
        <span className="text-[#d0d7de] select-none mr-2 text-[10px]">{m[1].replace('T', ' ').replace('Z', '')}</span>
        <span className="text-[#e6edf3]">{m[2]}</span>
      </span>
    );
  }
  return <span className="text-[#e6edf3]">{clean}</span>;
}

interface LogPanelProps {
  jobId: number;
  owner: string;
  repo: string;
  isRunning: boolean;
}


function parseLineTime(rawLine: string): number | null {
  const clean = rawLine.replace(/^\uFEFF/, '');
  const m = clean.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/);
  if (!m) return null;
  const t = new Date(m[1]).getTime();
  return Number.isFinite(t) ? t : null;
}

function extractStepLogByTime(
  fullLog: string,
  stepStartMs: number,
  stepEndMs: number,
): string | null {
  const lines = fullLog.split('\n');
  const BUFFER_MS = 500;
  const lo = stepStartMs - BUFFER_MS;
  const hi = stepEndMs + BUFFER_MS;

  const result: string[] = [];
  let lastTime: number | null = null;

  for (const line of lines) {
    const t = parseLineTime(line);
    if (t !== null) lastTime = t;
    if (lastTime !== null && lastTime >= lo && lastTime <= hi) {
      result.push(line);
    }
  }

  return result.length > 0 ? result.join('\n') : null;
}

function LogPanel({ jobId, owner, repo, isRunning, stepName, onClearStep, stepStart, stepEnd }: LogPanelProps & {
  stepName?: string;
  onClearStep?: () => void;
  stepStart?: number;
  stepEnd?: number;
}) {
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const text = await getJobLogs(owner, repo, jobId);
      setLogs(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : i18n.t('获取日志失败');
      setLogs(`[错误] ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [owner, repo, jobId]);

  useEffect(() => {
    fetchLogs();
    if (isRunning) {
      intervalRef.current = setInterval(fetchLogs, 3000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchLogs, isRunning]);

  useEffect(() => {
    if (scrollRef.current && isRunning) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isRunning]);

  const handleCopy = async () => {
    try {
      await copyToClipboard(stripAnsi(logs));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(i18n.t('复制失败'));
    }
  };

  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#30363d] bg-[#161b22]">
        <Terminal className="w-3.5 h-3.5 text-[#8b949e]" />
        <span className="text-xs text-[#c9d1d9] flex-1 truncate" title={stepName}>
            {stepName ? `${i18n.t('步骤')}: ${stepName}` : i18n.t('日志输出')}
          </span>
          {stepName && onClearStep && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-white/10"
              onClick={onClearStep}
            >
              {i18n.t('全部')}
            </Button>
          )}
        {isRunning && (
          <span className="flex items-center gap-1 text-[10px] text-[#d29922]">
            <Loader2 className="w-3 h-3 animate-spin" />{i18n.t('实时刷新')}</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-white/10 gap-1"
          onClick={handleCopy}
          disabled={loading || !logs}
        >
          {copied ? <Check className="w-3 h-3 text-[#3fb950]" /> : <Copy className="w-3 h-3" />}
          {copied ? i18n.t('已复制') : i18n.t('复制')}
        </Button>
      </div>
      <div
        ref={scrollRef}
        className="overflow-y-auto max-h-96 p-3 font-mono text-xs leading-relaxed text-[#e6edf3]"
      >
        {loading ? (
          <div className="flex items-center gap-2 text-[#8b949e] py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{i18n.t('加载日志...')}</span>
          </div>
        ) : logs ? (
        (() => {
          const filtered =
            stepName && stepStart !== undefined && stepEnd !== undefined && stepEnd > stepStart
              ? extractStepLogByTime(logs, stepStart, stepEnd)
              : null;
          const display = stepName
            ? (filtered !== null ? filtered : `[未找到步骤 "${stepName}" 的日志]\n\n${logs}`)
            : logs;
          return display.split('\n').map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all py-0.5 hover:bg-white/5">
              <AnsiLine raw={line} />
            </div>
          ));
        })()
        ) : (
          <span className="text-[#8b949e]">{i18n.t('暂无日志')}</span>
        )}
      </div>
    </div>
  );
}

function JobItem({ job, owner, repo }: { job: GitHubWorkflowJob; owner: string; repo: string }) {
  const [open, setOpen] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [selectedStep, setSelectedStep] = useState<{
    name: string;
    startedAt?: string | null;
    completedAt?: string | null;
  } | undefined>(undefined);
  const isRunning = job.status === 'in_progress' || job.status === 'queued';

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center gap-2 px-4 py-2 hover:bg-secondary/50 transition-colors text-left">
        <ChevronDown className={`w-3 h-3 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        <RunStatusBadge status={job.status} conclusion={job.conclusion} />
        <span className="text-sm text-foreground flex-1 min-w-0 truncate">{job.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">{formatRelativeTime(job.started_at)}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-8 pr-4 pb-2 space-y-0.5">
          {job.steps.map((step) => (
            <button
              key={step.number}
              type="button"
              onClick={() => {
                setSelectedStep({
                  name: step.name,
                  startedAt: step.started_at,
                  completedAt: step.completed_at,
                });
                setShowLogs(true);
              }}
              className={`w-full flex items-center gap-2 py-0.5 px-1 rounded text-left hover:bg-secondary/50 transition-colors ${selectedStep?.name === step.name ? 'bg-primary/10' : ''}`}
            >
              {step.conclusion === 'success' ? (
                <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
              ) : step.conclusion === 'failure' ? (
                <XCircle className="w-3 h-3 text-destructive shrink-0" />
              ) : step.status === 'in_progress' ? (
                <Loader2 className="w-3 h-3 text-warning animate-spin shrink-0" />
              ) : (
                <div className="w-3 h-3 rounded-full border border-border shrink-0" />
              )}
              <span className={`text-xs flex-1 min-w-0 truncate ${selectedStep?.name === step.name ? 'text-primary font-medium' : 'text-muted-foreground'}`}>{step.name}</span>
              <Terminal className="w-3 h-3 text-muted-foreground/50 shrink-0" />
            </button>
          ))}
          <div className="pt-2 pb-1">
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 text-xs gap-1.5 border transition-colors ${showLogs ? 'bg-primary/10 hover:bg-primary/20' : 'bg-transparent hover:bg-secondary'}`}
              style={
                showLogs
                  ? { color: 'hsl(var(--primary))', borderColor: 'hsl(var(--primary) / 0.4)' }
                  : { color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }
              }
              onClick={() => setShowLogs(!showLogs)}
            >
              <Terminal className="w-3 h-3" />
              {showLogs ? i18n.t('收起日志') : i18n.t('查看日志')}
              {isRunning && <span className="text-warning text-[10px]">{i18n.t('● 实时')}</span>}
            </Button>
          </div>
          {showLogs && (
            <LogPanel
              jobId={job.id}
              owner={owner}
              repo={repo}
              isRunning={isRunning}
              stepName={selectedStep?.name}
              stepStart={selectedStep?.startedAt ? new Date(selectedStep.startedAt).getTime() : undefined}
              stepEnd={selectedStep?.completedAt ? new Date(selectedStep.completedAt).getTime() : undefined}
              onClearStep={() => setSelectedStep(undefined)}
            />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function RunDetail({ owner, repo, run, workflowPath, onClose, onDeleted, onRunUpdate, onRefresh }: {
  owner: string; repo: string;
  run: GitHubWorkflowRun;
  workflowPath?: string;
  onClose: () => void;
  onDeleted?: () => void;
  onRunUpdate?: (run: GitHubWorkflowRun) => void;
  onRefresh?: () => void;
}) {
  const { canPush } = useRepoPermissions(owner, repo);
  const navigate = useNavigate();
  const handleEditWorkflow = () => {
    if (!workflowPath) {
      toast.error(i18n.t('未找到工作流文件路径'));
      return;
    }
    const cleanPath = workflowPath.replace(/^\//, '');
    const qs = new URLSearchParams({
      returnTo: `/repos/${owner}/${repo}/actions`,
      action: 'edit',
    });
    navigate(`/repos/${owner}/${repo}/code/${cleanPath}?${qs.toString()}`);
  };
  const [jobs, setJobs] = useState<GitHubWorkflowJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [rerunMode, setRerunMode] = useState<'rerun' | 'dispatch'>(() => {
    try {
      const v = localStorage.getItem('rerun_mode');
      return v === 'dispatch' ? 'dispatch' : 'rerun';
    } catch { return 'rerun'; }
  });
  const [singleDeleting, setSingleDeleting] = useState(false);
  const [singleDeleteOpen, setSingleDeleteOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRunning = run.status === 'in_progress' || run.status === 'queued';

  const loadJobs = useCallback(() => {
    getWorkflowRunJobs(owner, repo, run.id)
      .then((res) => setJobs(res.jobs))
      .catch(console.error)
      .finally(() => setLoadingJobs(false));
  }, [owner, repo, run.id]);

  useEffect(() => {
    loadJobs();
    if (isRunning) {
      intervalRef.current = setInterval(loadJobs, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadJobs, isRunning]);

  useEffect(() => {
    if (!isRunning || !onRunUpdate) return;
    const timer = setInterval(async () => {
      try {
        const latest = await getWorkflowRunFresh(owner, repo, run.id);
        onRunUpdate(latest);
      } catch {}
    }, 10000);
    return () => clearInterval(timer);
  }, [isRunning, owner, repo, run.id, onRunUpdate]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelWorkflowRun(owner, repo, run.id);
      toast.success(i18n.t('已取消工作流运行'));
      
      onRunUpdate?.({ ...run, status: 'completed' as const, conclusion: 'cancelled' as const });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('取消失败'));
    } finally {
      setCancelling(false);
    }
  };

  const handleRerun = async () => {
    setRerunning(true);
    try {
      if (rerunMode === 'dispatch') {
        
        await triggerWorkflow(owner, repo, run.workflow_id, run.head_branch || 'main');
        toast.success(i18n.t('已用最新代码触发工作流'));
      } else {
        
        await rerunWorkflowRun(owner, repo, run.id);
        toast.success(i18n.t('已重新触发工作流（重放历史）'));
      }
      window.dispatchEvent(new CustomEvent('compile-board-refresh'));
      setTimeout(() => onRefresh?.(), 2000);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('重新运行失败'));
    } finally {
      setRerunning(false);
    }
  };

  const handleRerunModeChange = (mode: 'rerun' | 'dispatch') => {
    setRerunMode(mode);
    try { localStorage.setItem('rerun_mode', mode); } catch { /* ignore */ }
  };

  const handleDeleteSingle = async () => {
    setSingleDeleting(true);
    try {
      await deleteWorkflowRun(owner, repo, run.id);
      toast.success(i18n.t('已删除运行记录'));
      setSingleDeleteOpen(false);
      onDeleted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('删除失败'));
    } finally {
      setSingleDeleting(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="p-4 border-b border-border bg-secondary/30 flex items-center gap-3 flex-wrap">
        <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">{i18n.t('← 返回列表')}</button>
        <span className="text-muted-foreground text-sm">/</span>
        <span className="text-sm font-medium text-foreground truncate max-w-xs">{run.name} #{run.run_number}</span>
        {workflowPath && (
          <button
            type="button"
            onClick={handleEditWorkflow}
            className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
            title={i18n.t('编辑工作流文件')}
          >
            <FileCode2 className="w-4 h-4" />
          </button>
        )}
        <RunStatusBadge status={run.status} conclusion={run.conclusion} />
        {isRunning && (
          <span className="text-[11px] text-warning flex items-center gap-1 ml-1">
            <Loader2 className="w-3 h-3 animate-spin" />{i18n.t('自动刷新中')}</span>
        )}
        <div className="ml-auto flex gap-2">
          {(run.status === 'in_progress' || run.status === 'queued') && (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:bg-secondary h-8 border border-border"
              onClick={handleCancel}
              disabled={cancelling}
            >
              <Square className="w-3.5 h-3.5 mr-1" />
              {cancelling ? i18n.t('停止中...') : i18n.t('停止运行')}
            </Button>
          )}
          {run.status === 'completed' && (
            <>
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-8"
                onClick={handleRerun}
                disabled={rerunning}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                {rerunning ? i18n.t('触发中...') : i18n.t('重新运行')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 border border-border text-muted-foreground hover:bg-secondary"
                    disabled={rerunning}
                    title={i18n.t('重跑模式')}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 bg-popover border-border">
                  <DropdownMenuLabel className="text-xs text-muted-foreground py-1.5">
                    {i18n.t('重跑模式')}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-border" />
                  <DropdownMenuItem
                    className="text-xs cursor-pointer flex items-start gap-2 py-2"
                    onClick={() => handleRerunModeChange('rerun')}
                  >
                    <span className="w-3 pt-0.5">{rerunMode === 'rerun' ? '●' : '○'}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-foreground">{i18n.t('重放历史')}</span>
                      <span className="block text-[10px] text-muted-foreground mt-0.5">
                        {i18n.t('用当时的代码和 workflow')}
                      </span>
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-xs cursor-pointer flex items-start gap-2 py-2"
                    onClick={() => handleRerunModeChange('dispatch')}
                  >
                    <span className="w-3 pt-0.5">{rerunMode === 'dispatch' ? '●' : '○'}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-foreground">{i18n.t('用最新代码触发')}</span>
                      <span className="block text-[10px] text-muted-foreground mt-0.5">
                        {i18n.t('使用当前分支最新 workflow')}
                      </span>
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          {canPush && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive border border-destructive/40 hover:bg-destructive/10 h-8"
            onClick={() => setSingleDeleteOpen(true)}
            disabled={isRunning || singleDeleting}
            title={isRunning ? i18n.t('运行中无法删除') : i18n.t('删除此记录')}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            {i18n.t('删除记录')}
          </Button>
          )}
        </div>
      </div>
      <div className="p-4 space-y-1 text-xs text-muted-foreground border-b border-border">
        <div className="flex gap-4 flex-wrap">
          <span>{i18n.t('触发者：')}<span className="text-foreground">{run.triggering_actor?.login}</span></span>
          <span>{i18n.t('分支：')}<code className="font-mono text-foreground">{run.head_branch}</code></span>
          <span>{i18n.t('事件：')}<span className="text-foreground">{run.event}</span></span>
          <span>{i18n.t('开始：')}<span className="text-foreground">{formatRelativeTime(run.created_at)}</span></span>
        </div>
        <p className="text-foreground text-sm mt-1">{run.head_commit?.message?.split('\n')[0]}</p>
      </div>
      <div className="divide-y divide-border">
        {loadingJobs ? (
          <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-8 bg-muted" />)}</div>
        ) : jobs.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">{i18n.t('暂无任务数据')}</div>
        ) : jobs.map((job) => <JobItem key={job.id} job={job} owner={owner} repo={repo} />)}
      </div>
      <AlertDialog open={singleDeleteOpen} onOpenChange={setSingleDeleteOpen}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive" />
              {i18n.t('删除运行记录')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm">
              {i18n.t('确定要删除此运行记录吗？此操作不可恢复。')}
              <span className="block mt-2 font-mono text-foreground text-xs">
                {run.name} #{run.run_number}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border hover:bg-secondary" disabled={singleDeleting}>{i18n.t('取消')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); handleDeleteSingle(); }}
              disabled={singleDeleting}
            >
              {singleDeleting ? i18n.t('删除中...') : i18n.t('删除此记录')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

export default function ActionsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [workflows, setWorkflows] = useState<GitHubWorkflow[]>([]);
  const [runs, setRuns] = useState<GitHubWorkflowRun[]>([]);
  const [loadingWf, setLoadingWf] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('all');
  const { canPush: canManageGHCR, loading: permLoading } = useRepoPermissions(owner, repo);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedRun, setSelectedRun] = useState<GitHubWorkflowRun | null>(null);
  
  const cancelledIdsRef = useRef<Map<number, number>>(new Map());
  const [activeTab, setActiveTab] = useState<'workflows' | 'caches'>('workflows');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ deleted: 0, total: 0, failed: 0, currentName: '' });
  const [runCancelling, setRunCancelling] = useState<number | null>(null);
  const [bulkTarget, setBulkTarget] = useState<{ workflowId?: string; workflowName?: string } | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [triggering, setTriggering] = useState<number | null>(null);
  const [triggerDialog, setTriggerDialog] = useState<GitHubWorkflow | null>(null);
  
  const prefetchRef = useRef<Map<number, Promise<{ branches: string[]; inputs: WorkflowInput[] }>>>(new Map());

  const prefetchTriggerData = useCallback((wf: GitHubWorkflow) => {
    if (!owner || !repo) return;
    if (prefetchRef.current.has(wf.id)) return;
    const promise = (async () => {
      const [branchesResult, fileResult] = await Promise.allSettled([
        getBranches(owner, repo, 1),
        getFileContent(owner, repo, wf.path),
      ]);
      const names = branchesResult.status === 'fulfilled'
        ? branchesResult.value.data.map((b) => b.name)
        : [];
      let inputs: WorkflowInput[] = [];
      if (fileResult.status === 'fulfilled') {
        const fileData = fileResult.value as { content: string; encoding: string } | undefined;
        const content = fileData?.content ? decodeBase64Content(fileData.content) : '';
        inputs = parseWorkflowInputs(content);
      }
      return { branches: names, inputs };
    })();
    prefetchRef.current.set(wf.id, promise);
    
    setTimeout(() => prefetchRef.current.delete(wf.id), 5 * 60 * 1000);
  }, [owner, repo]);
  const [triggerRef, setTriggerRef] = useState('main');
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [inputPairs, setInputPairs] = useState<{ key: string; value: string }[]>([]);
  const [wfInputs, setWfInputs] = useState<WorkflowInput[]>([]);
  const [wfInputValues, setWfInputValues] = useState<Record<string, string>>({});
  const [loadingInputs, setLoadingInputs] = useState(false);
  const [lastTrigger, setLastTrigger] = useState<LastTrigger | null>(null);
  const [retriggering, setRetriggering] = useState(false);

  useEffect(() => {
    if (!owner || !repo) return;
    getWorkflows(owner, repo)
      .then((res) => setWorkflows(res.workflows))
      .catch(console.error)
      .finally(() => setLoadingWf(false));
  }, [owner, repo]);

  const openTriggerDialog = useCallback(async (wf: GitHubWorkflow) => {
    setTriggerDialog(wf);
    setInputPairs([]);
    setWfInputs([]);
    setWfInputValues({});
    if (!owner || !repo) return;

    
    const prefetched = prefetchRef.current.get(wf.id);
    if (prefetched) {
      setLoadingBranches(true);
      setLoadingInputs(true);
      const { branches: names, inputs } = await prefetched;
      setBranches(names);
      setTriggerRef(names[0] || 'main');
      setLoadingBranches(false);
      setWfInputs(inputs);
      const last = loadLastTrigger(owner, repo, wf.id);
      const values: Record<string, string> = {};
      inputs.forEach((inp) => {
        const lastVal = last?.inputs?.[inp.name];
        values[inp.name] = lastVal ?? inp.default ?? '';
      });
      setWfInputValues(values);
      if (last?.ref) setTriggerRef(last.ref);
      setLoadingInputs(false);
      return;
    }

    
    setLoadingBranches(true);
    setLoadingInputs(true);
    const [branchesResult, fileResult] = await Promise.allSettled([
      getBranches(owner, repo, 1),
      getFileContent(owner, repo, wf.path),
    ]);
    if (branchesResult.status === 'fulfilled') {
      const names = branchesResult.value.data.map((b) => b.name);
      setBranches(names);
      setTriggerRef(names[0] || 'main');
    } else {
      setBranches([]);
      setTriggerRef('main');
    }
    setLoadingBranches(false);
    if (fileResult.status === 'fulfilled') {
      const fileData = fileResult.value as { content: string; encoding: string } | undefined;
      const content = fileData?.content ? decodeBase64Content(fileData.content) : '';
      const inputs = parseWorkflowInputs(content);
      setWfInputs(inputs);
      const last = loadLastTrigger(owner, repo, wf.id);
      const values: Record<string, string> = {};
      inputs.forEach((inp) => {
        const lastVal = last?.inputs?.[inp.name];
        values[inp.name] = lastVal ?? inp.default ?? '';
      });
      setWfInputValues(values);
      if (last?.ref) setTriggerRef(last.ref);
    } else {
      setWfInputs([]);
    }
    setLoadingInputs(false);
  }, [owner, repo]);

  const handleTriggerConfirm = async () => {
    if (!owner || !repo || !triggerDialog) return;
    const inputs: Record<string, string> = {};
    wfInputs.forEach((inp) => {
      const v = wfInputValues[inp.name];
      if (v !== undefined && v !== '') inputs[inp.name] = v;
    });
    setTriggering(triggerDialog.id);
    try {
      await triggerWorkflow(owner, repo, triggerDialog.id, triggerRef, inputs);
      const saved: LastTrigger = {
        workflowId: triggerDialog.id,
        workflowName: triggerDialog.name,
        ref: triggerRef,
        inputs,
        triggeredAt: new Date().toISOString(),
      };
      saveLastTrigger(owner, repo, saved);
      setLastTrigger(saved);
      toast.success(`工作流 "${triggerDialog.name}" 已在 ${triggerRef} 分支触发`);
      window.dispatchEvent(new CustomEvent('compile-board-refresh'));
      setTriggerDialog(null);
      setTimeout(() => loadRuns(1), 2000);
      setTimeout(async () => {
        try {
          const res = await getWorkflowRuns(owner, repo, {
            workflow_id: triggerDialog.id,
            per_page: 1,
          });
          const latestRun = res.workflow_runs?.[0];
          if (latestRun) {
            registerCompileWatch({
              owner,
              repo,
              runId: latestRun.id,
              wfName: triggerDialog.name,
              runNumber: latestRun.run_number,
            });
          }
        } catch {}
      }, 5000);
      
      (async () => {
        for (let attempt = 0; attempt < 12; attempt++) {
          await new Promise((r) => setTimeout(r, 5000));
          try {
            const res = await getWorkflowRuns(owner, repo, {
              workflow_id: triggerDialog.id,
              per_page: 1,
            });
            const latest = res.workflow_runs?.[0];
            if (latest && (latest.status === 'queued' || latest.status === 'in_progress')) {
              registerCompileWatch({
                owner,
                repo,
                runId: latest.id,
                wfName: triggerDialog.name,
                runNumber: latest.run_number,
              });
              return;
            }
          } catch { /* retry */ }
        }
      })();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('触发失败，请确保工作流支持 workflow_dispatch'));
    } finally {
      setTriggering(null);
    }
  };

  const handleRetrigger = async () => {
    if (!owner || !repo || !lastTrigger) return;
    setRetriggering(true);
    try {
      await triggerWorkflow(owner, repo, lastTrigger.workflowId, lastTrigger.ref, lastTrigger.inputs);
      toast.success(`已重跑 ${lastTrigger.workflowName} @ ${lastTrigger.ref}`);
      window.dispatchEvent(new CustomEvent('compile-board-refresh'));
      setTimeout(() => loadRuns(1), 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('重跑失败'));
    } finally {
      setRetriggering(false);
    }
  };

  const loadRuns = useCallback(async (pg = 1, append = false, _force = false) => {
    if (!owner || !repo) return;
    setLoadingRuns(true);
    try {
      const wfId = selectedWorkflow !== 'all' ? selectedWorkflow : undefined;
      const status = statusFilter !== 'all' ? statusFilter : undefined;
      const res = await getWorkflowRuns(owner, repo, { workflow_id: wfId, status, per_page: 20, page: pg });
      
      const now = Date.now();
      const patched = res.workflow_runs.map((r) => {
        const t = cancelledIdsRef.current.get(r.id);
        if (t && now - t < 60000 && r.status !== 'completed') {
          return { ...r, status: 'completed' as const, conclusion: 'cancelled' as const };
        }
        return r;
      });
      if (append) setRuns((prev) => [...prev, ...patched]);
      else setRuns(patched);
      setHasMore(res.workflow_runs.length === 20);
      setPage(pg);
    } catch (err) {
      toast.error(i18n.t('加载运行记录失败'));
      console.error(err);
    } finally {
      setLoadingRuns(false);
    }
  }, [owner, repo, selectedWorkflow, statusFilter]);

  useEffect(() => { loadRuns(1); }, [loadRuns]);

  const hasRunningRun = runs.some(
    (r) => r.status === 'in_progress' || r.status === 'queued' || r.status === 'waiting'
  );
  useEffect(() => {
    if (!hasRunningRun) return;
    const timer = setInterval(() => {
      loadRuns(1, false, true);
    }, 10000);
    return () => clearInterval(timer);
  }, [hasRunningRun, loadRuns]);

  useEffect(() => {
    if (!owner || !repo) return;
    setLastTrigger(loadLastTrigger(owner, repo));
  }, [owner, repo]);

  const handleCancelRun = async (run: GitHubWorkflowRun) => {
    if (!owner || !repo) return;
    setRunCancelling(run.id);
    try {
      await cancelWorkflowRun(owner, repo, run.id);
      toast.success(i18n.t('已取消运行'));
      setRuns((prev) => prev.map((r) =>
        r.id === run.id ? { ...r, status: 'completed', conclusion: 'cancelled' } : r
      ));
      setTimeout(() => loadRuns(1, false, true), 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('取消失败'));
    } finally {
      setRunCancelling(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!owner || !repo) return;
    setBulkRunning(true);
    setBulkProgress({ deleted: 0, total: 0, failed: 0, currentName: '' });
    try {
      const result = await deleteAllWorkflowRuns(owner, repo, {
        workflowId: bulkTarget?.workflowId,
        onProgress: (info) => {
          setBulkProgress({
            deleted: info.deleted,
            total: info.total,
            failed: info.failed,
            currentName: info.currentName || '',
          });
        },
      });
      toast.success(
        i18n.t('已删除') + ` ${result.deleted}/${result.total}` +
        (result.failed > 0 ? ` (${i18n.t('失败')} ${result.failed})` : '')
      );
      setBulkOpen(false);
      setBulkTarget(null);
      await loadRuns(1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('批量删除失败'));
    } finally {
      setBulkRunning(false);
    }
  };

  const wfReturnTo = `/repos/${owner}/${repo}/actions`;
  const wfCleanPath = (p: string) => p.replace(/^\//, '');
  const goWfCode = (wf: GitHubWorkflow, action = 'view') => {
    const path = wfCleanPath(wf.path);
    const qs = new URLSearchParams({
      returnTo: wfReturnTo,
      action,
    });
    navigate(`/repos/${owner}/${repo}/code/${path}?${qs.toString()}`);
  };
  const downloadWfFile = async (wf: GitHubWorkflow) => {
    try {
      const path = wfCleanPath(wf.path);
      const branch = 'main';
      
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/yaml' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = wf.path.split('/').pop() || 'workflow.yml';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      toast.success(i18n.t('已下载'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('下载失败'));
    }
  };
  const copyWfPath = async (wf: GitHubWorkflow) => {
    const ok = await copyToClipboard(wf.path);
    if (ok) toast.success(i18n.t('已复制路径'));
    else toast.error(i18n.t('复制失败'));
  };
  const copyWfRawLink = async (wf: GitHubWorkflow) => {
    const branch = 'main';
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${wfCleanPath(wf.path)}`;
    const ok = await copyToClipboard(url);
    if (ok) toast.success(i18n.t('已复制 Raw 链接'));
    else toast.error(i18n.t('复制失败'));
  };
  const viewWfHistory = (wf: GitHubWorkflow) => {
    const path = wfCleanPath(wf.path);
    navigate(`/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&returnTo=${encodeURIComponent(wfReturnTo)}`);
  };

  const openBulkDelete = (target: { workflowId?: string; workflowName?: string } | null) => {
    setBulkTarget(target);
    setBulkOpen(true);
  };

  return (
    <>
    <PullToRefresh onRefresh={() => loadRuns(1)}>
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <button type="button" className="hover:text-accent" onClick={() => navigate('/repos')}>{i18n.t('仓库')}</button>
        <ChevronRight className="w-3 h-3" />
        <button type="button" className="hover:text-accent" onClick={() => navigate(`/repos/${owner}/${repo}`)}>{owner}/{repo}</button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">Actions</span>
      </div>

      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold text-foreground">{i18n.t('Actions 工作流')}</h1>
      </div>

      <div className="flex items-center gap-1 border-b border-border -mb-2">
        <button
          type="button"
          onClick={() => setActiveTab('workflows')}
          className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === 'workflows' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          {i18n.t('工作流')}
        </button>
        {!permLoading && canManageGHCR && (
          <button
            type="button"
            onClick={() => setActiveTab('caches')}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === 'caches' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {i18n.t('GHCR 管理')}
          </button>
        )}
      </div>

      {activeTab === 'workflows' && (
        <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30">
            <p className="text-sm font-medium text-foreground">{i18n.t('工作流')}</p>
          </div>
          {loadingWf ? (
            <div className="p-3 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-8 bg-muted" />)}</div>
          ) : workflows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{i18n.t('暂无工作流')}</div>
          ) : (
            <div className="divide-y divide-border">
              {workflows.map((wf) => (
                <ContextMenu key={wf.id}>
                  <ContextMenuTrigger asChild>
                    <div className="flex items-center gap-2 px-3 py-2.5 group cursor-context-menu">
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => setSelectedWorkflow(String(wf.id))}
                      >
                        <p className={`text-sm truncate ${selectedWorkflow === String(wf.id) ? 'text-primary font-medium' : 'text-foreground'}`}>
                          {wf.name}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono truncate">{wf.path}</p>
                      </div>
                      {canManageGHCR && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                            onTouchStart={() => prefetchTriggerData(wf)}
                            onMouseEnter={() => prefetchTriggerData(wf)}
                            onClick={() => openTriggerDialog(wf)}
                            disabled={triggering === wf.id}
                          >
                            {triggering === wf.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="bg-popover border-border text-foreground text-xs">
                          {i18n.t('触发工作流')}
                        </TooltipContent>
                      </Tooltip>
                      )}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="bg-popover border-border w-48">
                    <ContextMenuItem className="text-foreground cursor-pointer text-sm"
                      onClick={() => goWfCode(wf, 'view')}>
                      <FileCode2 className="w-3.5 h-3.5 mr-2" />{i18n.t('查看文件')}
                    </ContextMenuItem>
                    <ContextMenuItem className="text-foreground cursor-pointer text-sm"
                      onClick={() => goWfCode(wf, 'edit')}>
                      <Pencil className="w-3.5 h-3.5 mr-2" />{i18n.t('编辑文件')}
                    </ContextMenuItem>
                    <ContextMenuItem className="text-foreground cursor-pointer text-sm"
                      onClick={() => downloadWfFile(wf)}>
                      <Download className="w-3.5 h-3.5 mr-2" />{i18n.t('下载文件')}
                    </ContextMenuItem>
                    <ContextMenuItem className="text-foreground cursor-pointer text-sm"
                      onClick={() => copyWfPath(wf)}>
                      <ClipboardCopy className="w-3.5 h-3.5 mr-2" />{i18n.t('复制路径')}
                    </ContextMenuItem>
                    <ContextMenuItem className="text-foreground cursor-pointer text-sm"
                      onClick={() => copyWfRawLink(wf)}>
                      <Link className="w-3.5 h-3.5 mr-2" />{i18n.t('复制 Raw 链接')}
                    </ContextMenuItem>
                    <ContextMenuSeparator className="bg-border" />
                    <ContextMenuItem className="text-foreground cursor-pointer text-sm"
                      onClick={() => goWfCode(wf, 'rename')}>
                      <Pencil className="w-3.5 h-3.5 mr-2" />{i18n.t('重命名')}
                    </ContextMenuItem>
                    <ContextMenuItem className="text-foreground cursor-pointer text-sm"
                      onClick={() => goWfCode(wf, 'move')}>
                      <MoveRight className="w-3.5 h-3.5 mr-2" />{i18n.t('移动到...')}
                    </ContextMenuItem>
                    <ContextMenuItem className="text-foreground cursor-pointer text-sm"
                      onClick={() => viewWfHistory(wf)}>
                      <History className="w-3.5 h-3.5 mr-2" />{i18n.t('查看历史')}
                    </ContextMenuItem>
                    <ContextMenuSeparator className="bg-border" />
                    <ContextMenuItem className="text-destructive cursor-pointer text-sm focus:text-destructive"
                      onClick={() => goWfCode(wf, 'delete')}>
                      <Trash2 className="w-3.5 h-3.5 mr-2" />{i18n.t('删除文件')}
                    </ContextMenuItem>
                    <ContextMenuSeparator className="bg-border" />
                    {canManageGHCR && (
                      <ContextMenuItem className="text-destructive cursor-pointer text-sm focus:text-destructive"
                        onClick={() => openBulkDelete({ workflowId: String(wf.id), workflowName: wf.name })}>
                        <Trash2 className="w-3.5 h-3.5 mr-2" />{i18n.t('删除工作流记录')}
                      </ContextMenuItem>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </div>
          )}
        </div>

        <div className="md:col-span-2 space-y-3">
          {selectedRun ? (
            <RunDetail
              owner={owner!}
              repo={repo!}
              run={selectedRun}
              workflowPath={workflows.find((w) => w.id === selectedRun.workflow_id)?.path}
              onClose={() => setSelectedRun(null)}
              onDeleted={() => { setSelectedRun(null); loadRuns(1); }}
              onRunUpdate={(latest) => {
                setSelectedRun(latest);
                if (latest.conclusion === 'cancelled') {
                  cancelledIdsRef.current.set(latest.id, Date.now());
                }
                loadRuns(1, false, true);
              }}
              onRefresh={() => loadRuns(1, false, true)}
            />
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <Select value={selectedWorkflow} onValueChange={(v) => { setSelectedWorkflow(v); setSelectedRun(null); }}>
                  <SelectTrigger className="bg-secondary border-border text-foreground w-28 h-9 text-sm">
                    <SelectValue placeholder={i18n.t('工作流')} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="all" className="text-foreground text-sm">{i18n.t('全部工作流')}</SelectItem>
                    {workflows.map((wf) => (
                      <SelectItem key={wf.id} value={String(wf.id)} className="text-foreground text-sm">{wf.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-secondary border-border text-foreground w-28 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="all" className="text-foreground text-sm">{i18n.t('全部状态')}</SelectItem>
                    <SelectItem value="success" className="text-foreground text-sm">{i18n.t('成功')}</SelectItem>
                    <SelectItem value="failure" className="text-foreground text-sm">{i18n.t('失败')}</SelectItem>
                    <SelectItem value="in_progress" className="text-foreground text-sm">{i18n.t('运行中')}</SelectItem>
                    <SelectItem value="cancelled" className="text-foreground text-sm">{i18n.t('已取消')}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-9 h-9 text-muted-foreground hover:bg-secondary"
                  onClick={() => loadRuns(1)}
                  disabled={loadingRuns}
                >
                  <RefreshCw className={`w-4 h-4 ${loadingRuns ? 'animate-spin' : ''}`} />
                </Button>
                {canManageGHCR && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-9 h-9 text-destructive hover:bg-destructive/10"
                      onClick={() => openBulkDelete(null)}
                      disabled={bulkRunning || loadingRuns}
                    >
                      <ListX className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-popover border-border text-foreground text-xs">
                    {i18n.t('删除全部运行记录')}
                  </TooltipContent>
                </Tooltip>
                )}
              </div>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                {loadingRuns && runs.length === 0 ? (
                  <div className="p-4 space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 bg-muted rounded" />)}</div>
                ) : runs.length === 0 ? (
                  <div className="py-12 text-center">
                    <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-foreground font-medium">{i18n.t('暂无运行记录')}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {runs.map((run) => {
                      const isRunActive = run.status === 'in_progress' || run.status === 'queued';
                      const isThisCancelling = runCancelling === run.id;
                      return (
                        <div
                          key={run.id}
                          role="button"
                          tabIndex={0}
                          className="w-full flex items-start gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left cursor-pointer"
                          onClick={() => setSelectedRun(run)}
                          onKeyDown={(e) => { if (e.key === 'Enter') setSelectedRun(run); }}
                        >
                          <div className="mt-0.5 shrink-0">
                            <RunStatusBadge status={run.status} conclusion={run.conclusion} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {run.name} <span className="text-muted-foreground font-normal">#{run.run_number}</span>
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {run.head_commit?.message?.split('\n')[0]}
                            </p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                              <span>{run.event}</span>
                              <span>·</span>
                              <code className="font-mono">{run.head_branch}</code>
                              <span>·</span>
                              <span>{formatRelativeTime(run.created_at)}</span>
                            </div>
                          </div>
                          {isRunActive && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="w-7 h-7 shrink-0 text-warning hover:bg-warning/10"
                                  onClick={(e) => { e.stopPropagation(); handleCancelRun(run); }}
                                  disabled={isThisCancelling}
                                >
                                  {isThisCancelling
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Square className="w-3.5 h-3.5" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-popover border-border text-foreground text-xs">
                                {i18n.t('停止运行')}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {hasMore && (
                <Button
                  variant="ghost"
                  className="w-full border border-border text-muted-foreground hover:bg-secondary"
                  onClick={() => loadRuns(page + 1, true)}
                  disabled={loadingRuns}
                >
                  {loadingRuns ? i18n.t('加载中...') : i18n.t('加载更多')}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
        </>
      )}

      {activeTab === 'caches' && canManageGHCR && (
        <GhcrPanel owner={owner!} repo={repo!} />
      )}
    </div>

    <AlertDialog open={bulkOpen} onOpenChange={(v) => { if (!bulkRunning) setBulkOpen(v); }}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            {bulkRunning
              ? i18n.t('正在删除...')
              : bulkTarget?.workflowName
                ? `${i18n.t('删除运行记录')}：${bulkTarget.workflowName}`
                : i18n.t('删除所有已完成运行记录')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground text-sm space-y-2">
            {bulkRunning ? (
              <>
                <span>{i18n.t('进度：')} {bulkProgress.deleted} / {bulkProgress.total}
                  {bulkProgress.failed > 0 && ` · ${i18n.t('失败')} ${bulkProgress.failed}`}
                </span>
                <span className="block w-full max-w-full overflow-hidden text-xs font-mono text-foreground text-ellipsis whitespace-nowrap min-h-[16px]">
                  {bulkProgress.currentName || '\u00A0'}
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
                <span>
                  {bulkTarget?.workflowName
                    ? `${i18n.t('将删除工作流')}「${bulkTarget.workflowName}」${i18n.t('的所有已完成/失败/取消的运行记录。')}`
                    : i18n.t('此操作将删除该仓库所有已完成/失败/取消的 workflow 运行记录。')}
                </span>
                <span className="block text-warning text-xs">{i18n.t('正在运行或排队的记录会被保留。')}</span>
                <span className="block text-destructive text-xs">{i18n.t('删除后不可恢复。')}</span>
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-border hover:bg-secondary" disabled={bulkRunning}>
            {i18n.t('取消')}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => { e.preventDefault(); handleDeleteAll(); }}
            disabled={bulkRunning}
          >
            {bulkRunning ? i18n.t('正在删除...') : (bulkTarget?.workflowName ? i18n.t('删除该工作流记录') : i18n.t('删除全部'))}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog open={!!triggerDialog} onOpenChange={(open) => { if (!open) setTriggerDialog(null); }}>
<DialogContent className="max-w-[calc(100%-2rem)] md:max-w-xl h-[35vh] bg-card border-border grid-rows-[auto_1fr_auto]">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2 flex-1 min-w-0 mr-8">
            <Zap className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate" title={triggerDialog?.name}>
              {i18n.t('触发工作流：')}{triggerDialog?.name}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto space-y-4 py-2 pr-1 -mr-1 scrollbar-none">
          <div className="space-y-1.5">
            <Label className="text-sm font-normal text-muted-foreground flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" />{i18n.t('运行分支')}</Label>
            {loadingBranches ? (
              <Skeleton className="h-9 bg-muted w-full" />
            ) : branches.length > 0 ? (
              <Select value={triggerRef} onValueChange={setTriggerRef}>
                <SelectTrigger className="bg-secondary border-border text-foreground h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border max-h-52">
                  {branches.map((b) => (
                    <SelectItem key={b} value={b} className="text-foreground text-sm font-mono">{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                className="bg-secondary border-border text-foreground h-9 text-sm font-mono"
                value={triggerRef}
                onChange={(e) => setTriggerRef(e.target.value)}
                placeholder={i18n.t('分支名称，例如 main')}
              />
            )}
          </div>

          {loadingInputs ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-8 bg-muted" />
              <Skeleton className="h-8 bg-muted" />
            </div>
          ) : wfInputs.length > 0 ? (
            <div className="space-y-2 py-1">
              {wfInputs.map((inp) => (
                <div key={inp.name} className="flex items-center gap-2.5">
                  <Label
                    className="text-[11px] font-normal text-muted-foreground w-24 shrink-0 text-right truncate leading-none"
                    title={inp.description || inp.name}
                  >
                    {inp.name}
                    {inp.required && <span className="text-destructive ml-0.5">*</span>}
                  </Label>
                  <div className="flex-1 min-w-0">
                    {inp.type === 'choice' && inp.options ? (
                      <Select
                        value={wfInputValues[inp.name] ?? inp.default}
                        onValueChange={(v) => setWfInputValues((prev) => ({ ...prev, [inp.name]: v }))}
                      >
                        <SelectTrigger className="bg-secondary border-border text-foreground h-9 text-xs">
                          <SelectValue placeholder={inp.default} />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border">
                          {inp.options.map((opt) => (
                            <SelectItem key={opt} value={opt} className="text-foreground text-xs font-mono">
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : inp.type === 'boolean' ? (
                      <Switch
                        checked={wfInputValues[inp.name] === 'true'}
                        onCheckedChange={(v) => setWfInputValues((prev) => ({ ...prev, [inp.name]: v ? 'true' : 'false' }))}
                      />
                    ) : (
                      <Input
                        className="bg-secondary border-border text-foreground h-9 text-xs font-mono"
                        value={wfInputValues[inp.name] ?? ''}
                        onChange={(e) => setWfInputValues((prev) => ({ ...prev, [inp.name]: e.target.value }))}
                        placeholder={inp.default}
                        title={inp.description}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-1">
              {i18n.t('此工作流无需 inputs，将使用默认值运行')}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            className="border border-border text-muted-foreground hover:bg-secondary"
            onClick={() => setTriggerDialog(null)}
          >
            {i18n.t('取消')}</Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
            onClick={handleTriggerConfirm}
            disabled={!!triggering || !triggerRef.trim()}
          >
            {triggering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {triggering ? i18n.t('触发中…') : i18n.t('触发运行')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </PullToRefresh>
    </>
  );
}

function GhcrPanel({ owner, repo }: { owner: string; repo: string }) {
  const [packages, setPackages] = useState<import('@/types/types').GitHubPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [versions, setVersions] = useState<Record<string, import('@/types/types').GitHubPackageVersion[]>>({});
  const [loadingVersions, setLoadingVersions] = useState<Record<string, boolean>>({});
  const [versionSizes, setVersionSizes] = useState<Record<string, number>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: 'version'; pkg: import('@/types/types').GitHubPackage; vid: number; label: string }
    | { kind: 'package'; pkg: import('@/types/types').GitHubPackage }
    | null
  >(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const all = await getUserPackages(owner, 'container', true);
      const repoLower = repo.toLowerCase();
      const pkgs = all.filter((p) => p.name.toLowerCase().startsWith(`${repoLower}/`) || p.name.toLowerCase().includes(repoLower));
      setPackages(pkgs);
      setVersions({});
    } catch (e) {
      setError(e instanceof Error ? e.message : i18n.t('加载失败'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [owner, repo]);

  useEffect(() => { load(); }, [load]);

  const loadVersions = async (pkg: import('@/types/types').GitHubPackage) => {
    setLoadingVersions((prev) => ({ ...prev, [pkg.name]: true }));
    try {
      const vs = await listUserPackageVersions(owner, pkg.name, pkg.package_type, true);
      setVersions((prev) => ({ ...prev, [pkg.name]: vs }));

      if (pkg.package_type === 'container') {
        const parts = pkg.name.split('/');
        const ns = parts.length > 1 ? parts[0] : owner;
        const imgName = parts.length > 1 ? parts.slice(1).join('/') : pkg.name;

        void Promise.all(
          vs.map(async (v) => {
            const tags = v.metadata?.container?.tags || [];
            const tag = tags[0];
            if (!tag) return;
            try {
              const size = await getPackageVersionSize(owner, ns, imgName, tag);
              setVersionSizes((prev) => ({ ...prev, [`${pkg.name}/${v.id}`]: size }));
            } catch {}
          })
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : i18n.t('加载版本失败'));
    } finally {
      setLoadingVersions((prev) => ({ ...prev, [pkg.name]: false }));
    }
  };

  const togglePkg = async (pkg: import('@/types/types').GitHubPackage) => {
    const key = pkg.name;
    const next = !expanded[key];
    setExpanded((prev) => ({ ...prev, [key]: next }));
    if (next && !versions[key]) {
      await loadVersions(pkg);
    }
  };

  const requestDeleteVersion = (pkg: import('@/types/types').GitHubPackage, vid: number, label: string) => {
    setDeleteTarget({ kind: 'version', pkg, vid, label });
  };
  const requestDeletePackage = (pkg: import('@/types/types').GitHubPackage) => {
    setDeleteTarget({ kind: 'package', pkg });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const t = deleteTarget;
    if (t.kind === 'version') {
      const id = `${t.pkg.name}/${t.vid}`;
      setDeleting(id);
      try {
        await deleteUserPackageVersion(owner, t.pkg.name, t.vid, t.pkg.package_type);
        setVersions((prev) => ({
          ...prev,
          [t.pkg.name]: (prev[t.pkg.name] || []).filter((v) => v.id !== t.vid),
        }));
        toast.success(i18n.t('已删除'));
        setDeleteTarget(null);
        loadVersions(t.pkg).catch(() => {});
      } catch (e) {
        toast.error(e instanceof Error ? e.message : i18n.t('删除失败'));
      } finally {
        setDeleting(null);
      }
    } else {
      setDeleting(t.pkg.name);
      try {
        await deleteUserPackage(owner, t.pkg.name, t.pkg.package_type);
        setPackages((prev) => prev.filter((p) => p.id !== t.pkg.id));
        setVersions((prev) => {
          const next = { ...prev };
          delete next[t.pkg.name];
          return next;
        });
        toast.success(i18n.t('包已删除'));
        setDeleteTarget(null);
        load().catch(() => {});
      } catch (e) {
        toast.error(e instanceof Error ? e.message : i18n.t('删除失败'));
      } finally {
        setDeleting(null);
      }
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 bg-muted rounded-lg" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        <AlertCircle className="w-8 h-8 mx-auto mb-2" />
        <p className="text-sm">{error}</p>
        <Button variant="ghost" size="sm" className="mt-3 border border-border text-muted-foreground hover:bg-secondary h-9" onClick={() => load()}>{i18n.t('重试')}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {packages.length > 0 ? `${packages.length} ${i18n.t('个包')}` : ''}
        </p>
        <Button
          variant="ghost" size="sm"
          className="h-8 text-xs text-muted-foreground border border-border hover:bg-secondary"
          onClick={() => load(true)}
          disabled={refreshing}
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
          {i18n.t('刷新')}
        </Button>
      </div>

      {packages.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-border rounded-lg bg-card">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">{i18n.t('暂无 GHCR 包')}</p>
          <p className="text-xs mt-1 text-muted-foreground/70">{i18n.t('仓库推送到 GitHub Container Registry 的镜像包会显示在这里')}</p>
        </div>
      ) : (
        packages.map((pkg) => {
          const isOpen = !!expanded[pkg.name];
          const pkgVersions = versions[pkg.name] || [];
          const isLoadingV = !!loadingVersions[pkg.name];
          const isDeletingPkg = deleting === pkg.name;

          return (
            <div key={pkg.id} className="bg-card border border-border rounded-lg overflow-hidden">
              <button
                type="button"
                className="w-full px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between gap-3 text-left hover:bg-secondary/50 transition-colors"
                onClick={() => togglePkg(pkg)}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground break-all" title={pkg.name}>{pkg.name}</span>
                  <Badge variant="outline" className="border-border text-muted-foreground text-xs shrink-0">
                    {pkg.package_type}
                  </Badge>
                  <Badge variant="outline" className="border-border text-muted-foreground text-xs shrink-0">
                    {pkg.visibility}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={pkg.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-accent"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {isOpen && (
                <div className="divide-y divide-border">
                  {isLoadingV ? (
                    <div className="p-3 space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-10 bg-muted" />)}</div>
                  ) : pkgVersions.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">{i18n.t('暂无版本')}</p>
                  ) : (
                    pkgVersions.map((v) => {
                      const tags = v.metadata?.container?.tags || [];
                      const tagLabel = tags.length > 0 ? tags.join(', ') : (v.name || `#${v.id}`);
                      const vid = `${pkg.name}/${v.id}`;
                      return (
                        <div key={v.id} className="p-3 flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-mono text-foreground break-all">{tagLabel}</p>
                            {(() => {
                              const size = versionSizes[`${pkg.name}/${v.id}`];
                              if (size === undefined) return null;
                              const human = size < 1024 ? `${size} B`
                                : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB`
                                : size < 1024 * 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB`
                                : `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
                              return <span className="inline-block text-[11px] text-primary bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5 mt-0.5">{human}</span>;
                            })()}
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {i18n.t('创建于')} {formatRelativeTime(v.created_at)}
                              {v.updated_at !== v.created_at && ` · ${i18n.t('更新于')} ${formatRelativeTime(v.updated_at)}`}
                            </p>
                          </div>
                          <Button
                            variant="ghost" size="icon"
                            className="w-7 h-7 text-destructive/70 hover:bg-destructive/10 hover:text-destructive shrink-0"
                            onClick={() => requestDeleteVersion(pkg, v.id, tagLabel)}
                            disabled={deleting === vid}
                          >
                            {deleting === vid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      );
                    })
                  )}

                  <div className="px-3 py-2 bg-secondary/20 flex justify-end">
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 text-xs text-destructive border border-destructive/40 hover:bg-destructive/10"
                      onClick={() => requestDeletePackage(pkg)}
                      disabled={isDeletingPkg}
                    >
                      {isDeletingPkg ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />{i18n.t('删除中...')}</> : <><Trash2 className="w-3 h-3 mr-1" />{i18n.t('删除整个包')}</>}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive" />
              {deleteTarget?.kind === 'version' ? i18n.t('删除版本') : i18n.t('删除整个包')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm space-y-2">
              {deleteTarget?.kind === 'version' ? (
                <>
                  <span>{i18n.t('确定要删除该版本吗？此操作不可恢复。')}</span>
                  <code className="block font-mono text-foreground bg-secondary px-2 py-1.5 rounded text-xs break-all mt-2">
                    {deleteTarget.label}
                  </code>
                </>
              ) : deleteTarget?.kind === 'package' ? (
                <>
                  <span>{i18n.t('确定要删除整个包及其所有版本吗？此操作不可恢复。')}</span>
                  <code className="block font-mono text-foreground bg-secondary px-2 py-1.5 rounded text-xs break-all mt-2">
                    {deleteTarget.pkg.name}
                  </code>
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border hover:bg-secondary" disabled={!!deleting}>{i18n.t('取消')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={!!deleting}
            >
              {deleting ? i18n.t('删除中...') : i18n.t('确认删除')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
