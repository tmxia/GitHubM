import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getRepoBranches } from '@/services/github';
import { runAiAgent } from '@/lib/aiAgentCore';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  User, Send, Square, Trash2, Settings,
  Sparkles, AlertCircle,
  RefreshCw, Plus, GitPullRequest, History, ArrowLeft, Loader2,
  Zap, FolderSearch, PanelRight, Wrench, ListChecks, WifiOff, CheckCircle2, XCircle,
  Paperclip, X, ImageIcon, FileText, ChevronDown, ChevronRight, Cpu, Download, ClipboardList,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { GitHubRepo } from '@/types/types';
import ModelSettingsDialog from '@/components/ai/ModelSettingsDialog';
import RepoSelector from '@/components/ai/RepoSelector';
import CopyButton from '@/components/ai/CopyButton';
import BranchPicker from '@/components/ai/BranchPicker';
import CreateBranchDialog from '@/components/ai/CreateBranchDialog';
import HistoryPanel from '@/components/ai/HistoryPanel';
import FileBrowserPanel from '@/components/ai/FileBrowserPanel';
import { ToolHistoryPanel } from '@/components/ai/ToolHistoryPanel';
import { RunHistoryPanel } from '@/components/ai/RunHistoryPanel';
import { TaskPlanPanel, type StepStatus } from '@/components/ai/TaskPlanPanel';
import WorkflowHistoryPanel from '@/components/ai/WorkflowHistoryPanel';
import InlineActivityPanel from '@/components/ai/InlineActivityPanel';
import StreamMetricsBar from '@/components/ai/StreamMetricsBar';
import ExecutionBlock from '@/components/ai/ExecutionBlock';
import ToolWorkshopPanel from '@/components/ai/ToolWorkshopPanel';
import {
  getModelDef, loadModelConfig, saveModelConfig,
  parseChunk, parseTypedChunk, renderMarkdown, ThinkingBlock, QUICK_PROMPTS, ModelAvatar,
} from '@/components/ai/aiUtils';
import { upsertSession, replaceSessionMessages, insertToolExecutionLogs, upsertWorkflowSnapshot, fetchLatestSnapshot, type PersistMessageInput } from '@/components/ai/aiSupabase';
import type { Message, ModelConfig, ChatSession, ChatSessionMessage, ToolHistoryItem, TaskPlanStep, InlineStep, InlineTool, Attachment, FileRequest, StreamMetrics } from '@/components/ai/aiTypes';
import { appendUsageRecord } from '@/components/ai/usageStats';
import i18n from "@/i18n";

const WRITE_TOOLS = new Set([
  'create_file', 'update_file', 'patch_file', 'write_file', 'delete_file',
  'create_branch', 'delete_branch', 'merge_branch',
  'create_pull_request', 'merge_pull_request', 'close_pull_request',
  'create_issue', 'close_issue', 'update_issue',
  'push_commit', 'create_commit', 'trigger_workflow',
  'add_collaborator', 'remove_collaborator',
  'create_webhook', 'delete_webhook',
  'create_release', 'update_release',
]);

const AI_SESSION_KEY = 'ai_chat_session_v1';

interface PersistedAiSession {
  step: 'repo' | 'chat';
  selectedRepo: GitHubRepo | null;
  selectedBranch: string;
  sessionId: string | null;
  messages: Message[];
  taskPlanSteps?: TaskPlanStep[];
  stepStatuses?: Record<string, StepStatus>;
}

interface ConversationMemorySummary {
  id: string;
  content: string;
  coveredMessageIds: string[];
  generatedAt: string;
}

const MEMORY_SUMMARY_TRIGGER_COUNT = 24;
const MEMORY_SUMMARY_WINDOW_SIZE = 16;
const MEMORY_SUMMARY_KEEP_RECENT = 8;

function loadPersistedSession(): PersistedAiSession | null {
  try {
    const raw = localStorage.getItem(AI_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedAiSession;
    if (parsed.step !== 'chat' || !parsed.selectedRepo?.full_name) return null;
    return parsed;
  } catch { return null; }
}

function isVisibleConversationMessage(message: Message): boolean {
  return message.messageType !== 'memory_summary';
}

function toPersistMessage(message: Message): PersistMessageInput {
  return {
    role: message.role,
    content: message.content,
    messageType: message.messageType ?? 'plain',
    meta: message.meta,
    full: message,
  };
}

function messageEffectiveText(m: Message): string {
  if (m.bubbleType === 'step') return (m.stepTitle || '').trim();
  if (m.bubbleType === 'tool') {
    const label = (m.toolLabel || m.toolName || '').trim();
    const result = (m.toolResult || '').replace(/\s+/g, ' ').trim();
    const brief = result.length > 120 ? `${result.slice(0, 120)}…` : result;
    return brief ? `${label}：${brief}` : label;
  }
  if (m.bubbleType === 'thinking') return '';
  return (m.content || '').replace(/\s+/g, ' ').trim();
}
function createConversationMemorySummary(messages: Message[]): ConversationMemorySummary | null {
  const visibleMessages = messages.filter(m => !m.streaming && isVisibleConversationMessage(m) && m.id !== 'welcome');
  if (visibleMessages.length < MEMORY_SUMMARY_TRIGGER_COUNT) return null;

  const recentMessages = visibleMessages.slice(-MEMORY_SUMMARY_KEEP_RECENT);
  const recentIds = new Set(recentMessages.map(m => m.id));
  const existingSummaryIds = new Set(
    messages
      .filter(m => m.messageType === 'memory_summary')
      .flatMap(m => Array.isArray(m.meta?.coveredMessageIds) ? (m.meta?.coveredMessageIds as string[]) : []),
  );

  const candidates = visibleMessages.filter(m => !recentIds.has(m.id) && !existingSummaryIds.has(m.id));
  if (candidates.length < MEMORY_SUMMARY_WINDOW_SIZE) return null;
  const window = candidates.slice(-MEMORY_SUMMARY_WINDOW_SIZE);
  const chunks: string[] = [];
  for (const m of window) {
    const text = messageEffectiveText(m);
    if (!text) continue;
    const shortened = text.length > 180 ? `${text.slice(0, 180)}…` : text;
    const role = m.role === 'user' ? i18n.t('用户') : i18n.t('助手');
    chunks.push(`${chunks.length + 1}. ${role}：${shortened}`);
  }
  const summaryText = [
    i18n.t('【历史记忆摘要】'),
    i18n.t('以下是更早对话中的关键上下文，请在后续回答中视为已知事实：'),
    ...chunks,
  ].join('\n');

  return {
    id: `mem-${Date.now()}`,
    content: summaryText,
    coveredMessageIds: window.map(m => m.id),
    generatedAt: new Date().toISOString(),
  };
}

function buildModelHistory(messages: Message[], latestUserText?: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  const normalized = messages
    .filter(m => m.id !== 'welcome')
    .filter(m => !m.streaming)
    .map(m => ({ role: m.role, content: m.content }));

  if (!latestUserText) return normalized;
  if (normalized.length === 0) return [{ role: 'user', content: latestUserText }];

  const last = normalized[normalized.length - 1];
  if (last.role === 'user') {
    return [...normalized.slice(0, -1), { role: 'user', content: latestUserText }];
  }
  return [...normalized, { role: 'user', content: latestUserText }];
}

export default function AiAssistantPage() {
  const { token, user } = useAuth();
  const [initialSession] = useState(() => loadPersistedSession());
  const [step, setStep] = useState<'repo' | 'chat'>(initialSession?.step ?? 'repo');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(initialSession?.selectedRepo ?? null);
  const [messages, setMessages] = useState<Message[]>(initialSession?.messages ?? []);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [modelConfig, setModelConfig] = useState<ModelConfig>(loadModelConfig);
  const [showModelSettings, setShowModelSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCreateBranch, setShowCreateBranch] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [showToolHistory, setShowToolHistory] = useState(false);
  const [toolHistory, setToolHistory] = useState<ToolHistoryItem[]>([]);
  const [taskPlanSteps, setTaskPlanSteps] = useState<TaskPlanStep[]>([]);
  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>({});
  const [stepRetryCounts, setStepRetryCounts] = useState<Record<string, number>>({});
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [sidePanelTab, setSidePanelTab] = useState<'tools' | 'plan' | 'history' | 'workshop' | 'runlog'>('plan');
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);
  const [interruptedWorkflowCount, setInterruptedWorkflowCount] = useState(0);
  const [pendingProposalCount, setPendingProposalCount] = useState(0);
  const [workshopRefreshTrigger, setWorkshopRefreshTrigger] = useState(0);
  const [pendingResumeInfo, setPendingResumeInfo] = useState<{ workflowId?: string; taskSummary: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(initialSession?.sessionId ?? null);
  const [memorySummary, setMemorySummary] = useState<ConversationMemorySummary | null>(null);
  const pendingMsgsRef = useRef<PersistMessageInput[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(initialSession?.selectedBranch ?? '');
  const [isProtectedBranch, setIsProtectedBranch] = useState(false);

  const autoMode = true;

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const [streamMetrics, setStreamMetrics] = useState<Partial<StreamMetrics> | null>(null);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<number | null>(null);
  const lastContentAtRef = useRef<number>(0);
  const lastRequestBodyRef = useRef<Record<string, unknown> | null>(null);
  const lastUserTextRef = useRef<string>('');
  const networkInterruptedRef = useRef(false);
  const [isNetworkInterrupted, setIsNetworkInterrupted] = useState(false);
  const streamingAiMsgIdRef = useRef<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const currentTurnIdRef = useRef<string>('');
  const toolHistoryRef = useRef<ToolHistoryItem[]>([]);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    try {
      const session: PersistedAiSession = {
        step,
        selectedRepo,
        selectedBranch,
        sessionId,
        messages: messages.filter(m => !m.streaming),
        taskPlanSteps,
        stepStatuses,
      };
      localStorage.setItem(AI_SESSION_KEY, JSON.stringify(session));
    } catch {}
  }, [step, selectedRepo, selectedBranch, sessionId, messages, taskPlanSteps, stepStatuses]);

  useEffect(() => {
    if (initialSession?.step === 'chat' && initialSession.selectedRepo) {
      loadBranches(initialSession.selectedRepo);
    }
  }, []);
  useEffect(() => {
    if (initialSession?.taskPlanSteps && initialSession.taskPlanSteps.length > 0) {
      setTaskPlanSteps(initialSession.taskPlanSteps);
      if (initialSession.stepStatuses) setStepStatuses(initialSession.stepStatuses);
      return;
    }
    const planMsg = (initialSession?.messages ?? []).find(m => Array.isArray(m.inlinePlan) && m.inlinePlan.length > 0);
    if (planMsg?.inlinePlan) {
      const steps = planMsg.inlinePlan.map(s => ({ id: s.id, title: s.title, desc: s.desc }));
      setTaskPlanSteps(steps);
      const hasFinalAnswer = (initialSession?.messages ?? []).some(m =>
        m.role === 'assistant' && (m.bubbleType === 'answer' || (!m.bubbleType && (m.content || '').length > 0)));
      if (hasFinalAnswer) {
        setStepStatuses(Object.fromEntries(steps.map(s => [s.id, 'done' as StepStatus])));
      }
    }
  }, []);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 112) + 'px';
  }, [input]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let rafId = 0;
    const adjust = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const el = chatContainerRef.current;
        if (!el) return;
        const topOffset = el.getBoundingClientRect().top + window.scrollY;
        const available = vv.offsetTop + vv.height - topOffset;
        el.style.height = Math.max(available, 200) + 'px';
      });
    };

    vv.addEventListener('resize', adjust);
    vv.addEventListener('scroll', adjust);

    return () => {
      cancelAnimationFrame(rafId);
      vv.removeEventListener('resize', adjust);
      vv.removeEventListener('scroll', adjust);
      if (chatContainerRef.current) {
        chatContainerRef.current.style.height = '';
      }
    };
  }, []);

  useEffect(() => {
    const el = scrollAreaRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) return;
      if (!networkInterruptedRef.current) return;
      networkInterruptedRef.current = false;
      setIsNetworkInterrupted(true);
      toast.warning(i18n.t('网络连接已断开，AI 任务被中断'), {
        duration: 0,
        id: 'reconnect-toast',
        action: {
          label: i18n.t('重新连接'),
          onClick: () => { toast.dismiss('reconnect-toast'); handleReconnect(); },
        },
      });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { toolHistoryRef.current = toolHistory; }, [toolHistory]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    fetchLatestSnapshot(sessionId).then(snapshot => {
      if (cancelled || !snapshot) return;
      setToolHistory(prev => prev.length === 0 ? snapshot.toolHistory : prev);
    });
    return () => { cancelled = true; };
  }, [sessionId]);

  useEffect(() => {
    const summaries = messages.filter(m => m.messageType === 'memory_summary');
    const latest = summaries.length > 0 ? summaries[summaries.length - 1] : null;
    if (!latest) {
      setMemorySummary(null);
      return;
    }
    setMemorySummary({
      id: latest.id,
      content: latest.content,
      coveredMessageIds: Array.isArray(latest.meta?.coveredMessageIds) ? latest.meta.coveredMessageIds as string[] : [],
      generatedAt: typeof latest.meta?.generatedAt === 'string' ? latest.meta.generatedAt : '',
    });
  }, [messages]);

  const loadBranches = useCallback(async (repo: GitHubRepo) => {
    setBranchesLoading(true);
    try {
      const list = await getRepoBranches(repo.owner.login, repo.name);
      const names = (list as Array<{ name: string }>).map(b => b.name);
      setBranches(names);
      const def = repo.default_branch || 'main';
      setSelectedBranch(names.includes(def) ? def : (names[0] || def));
    } catch {
      setBranches([]);
      setSelectedBranch(repo.default_branch || 'main');
    } finally {
      setBranchesLoading(false);
    }
  }, []);

  const handleSelectRepo = useCallback((repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setSelectedBranch(repo.default_branch || 'main');
    setSessionId(null);
    pendingMsgsRef.current = [];
    const welcome: Message = {
      id: 'welcome',
      role: 'assistant',
      content: `你好！我已连接到仓库 **${repo.full_name}**（${repo.private ? i18n.t('私有') : i18n.t('公开')}）。

默认分支：\`${repo.default_branch}\`${repo.description ? `

> ${repo.description}` : ''}

你可以在顶部切换目标分支、新建分支，AI 可帮你写文件并提交 PR。告诉我需要什么帮助！`,
    };
    setMessages([welcome]);
    loadBranches(repo);
    setStep('chat');
  }, [loadBranches]);

  const handleLoadHistory = useCallback((session: ChatSession, histMsgs: ChatSessionMessage[]) => {
    const fakeRepo: GitHubRepo = {
      id: 0,
      name: session.repo_full_name.split('/')[1] || session.repo_full_name,
      full_name: session.repo_full_name,
      private: false,
      owner: {
        id: 0, login: session.repo_full_name.split('/')[0], name: null, email: null,
        avatar_url: '', bio: null, company: null, location: null, blog: null,
        twitter_username: null, public_repos: 0, public_gists: 0,
        followers: 0, following: 0, created_at: '', updated_at: '', html_url: '',
      },
      description: null,
      html_url: '',
      clone_url: '',
      default_branch: session.branch,
      stargazers_count: 0,
      language: null,
      updated_at: '',
      created_at: '',
      forks_count: 0,
      watchers_count: 0,
      open_issues_count: 0,
      topics: [],
      size: 0,
      pushed_at: '',
      visibility: 'public',
      fork: false,
      ssh_url: '',
      archived: false,
      disabled: false,
      license: null,
    };
    setSelectedRepo(fakeRepo);
    setSelectedBranch(session.branch);
    setSessionId(session.id);
    setIsProtectedBranch(session.branch === 'main' || session.branch === 'master');
    pendingMsgsRef.current = [];
    const converted: Message[] = histMsgs.map(m => {
      if (m.full_json) {
        try {
          const full = JSON.parse(m.full_json) as Message;
          if (full && typeof full === 'object' && full.role) {
            return { ...full, streaming: false };
          }
        } catch {}
      }
      return {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        messageType: m.message_type ?? 'plain',
        meta: m.meta_json ? JSON.parse(m.meta_json) as Record<string, unknown> : undefined,
      };
    });
    const visibleMessages = converted.filter(isVisibleConversationMessage);
    setMessages(visibleMessages.length > 0 ? converted : [{
      id: 'welcome',
      role: 'assistant',
      content: `已加载历史对话：**${session.repo_full_name}** 分支 \`${session.branch}\``,
    }]);
    loadBranches(fakeRepo);
    setStep('chat');
  }, [loadBranches]);

  const handleBranchChange = (b: string) => {
    setSelectedBranch(b);
    setIsProtectedBranch(b === 'main' || b === 'master');
  };

  const handleBranchCreated = (name: string, from: string) => {
    setBranches(prev => [...prev, name]);
    setSelectedBranch(name);
    setIsProtectedBranch(false);
    handleSend(`请帮我新建分支 \`${name}\`，从 \`${from}\` 创建。`, false);
  };

  const handleSaveModelConfig = (cfg: ModelConfig) => {
    setModelConfig(cfg);
    saveModelConfig(cfg);
  };
const currentModelDef = getModelDef(modelConfig.type);

  useEffect(() => {
    if (!selectedRepo || !sessionId) return;
    const nextSummary = createConversationMemorySummary(messages);
    if (!nextSummary) return;
    if (memorySummary && nextSummary.coveredMessageIds.every(id => memorySummary.coveredMessageIds.includes(id))) return;

    const summaryMessage: Message = {
      id: nextSummary.id,
      role: 'assistant',
      content: nextSummary.content,
      messageType: 'memory_summary',
      meta: {
        coveredMessageIds: nextSummary.coveredMessageIds,
        generatedAt: nextSummary.generatedAt,
      },
    };

    setMessages(prev => [...prev, summaryMessage]);
    setMemorySummary(nextSummary);
  }, [messages, memorySummary, selectedBranch, selectedRepo, sessionId]);

  useEffect(() => {
    if (!user?.login || !selectedRepo?.full_name) return;
    if (messages.some(m => m.streaming)) return;
    const toSave = messages
      .filter(m => m.id !== 'welcome')
      .map(toPersistMessage);
    if (toSave.length === 0) return;
    let sid = sessionId;
    if (!sid) {
      const firstUser = toSave.find(m => m.role === 'user');
      const title = firstUser
        ? firstUser.content.slice(0, 40) + (firstUser.content.length > 40 ? '…' : '')
        : i18n.t('新对话');
      sid = crypto.randomUUID();
      setSessionId(sid);
      void upsertSession({
        id: sid,
        github_login: user.login,
        repo_full_name: selectedRepo.full_name,
        branch: selectedBranch,
        title,
        model_type: modelConfig.type,
        model_name: modelConfig.model,
      });
    }
    void replaceSessionMessages(sid, toSave);
  }, [messages, sessionId, selectedRepo, selectedBranch, user?.login, modelConfig.type, modelConfig.model]);

  const handleRegenerate = useCallback(async () => {
    if (isStreaming) return;
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser) return;
    setMessages(prev => {
      const idx = [...prev].reverse().findIndex(m => m.role === 'assistant');
      if (idx === -1) return prev;
      return prev.slice(0, prev.length - 1 - idx);
    });
    await handleSend(lastUser.content, true);
  }, [isStreaming, messages]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    files.forEach(file => {
      const isImage = file.type.startsWith('image/');
      const maxSize = isImage ? 5 * 1024 * 1024 : 500 * 1024;
      if (file.size > maxSize) {
        toast.warning(`文件 ${file.name} 超过大小限制（${isImage ? '5MB' : '500KB'}）`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        const attachment: Attachment = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          type: isImage ? 'image' : (file.type.startsWith('text/') || /\.(ts|tsx|js|jsx|json|yaml|yml|md|py|go|kt|swift|sh|env|xml|html|css)$/.test(file.name)) ? 'text' : 'binary',
          mimeType: file.type,
          content: result,
          size: file.size,
        };
        setAttachments(prev => [...prev, attachment]);
      };
      if (isImage) reader.readAsDataURL(file);
      else reader.readAsText(file);
    });
    e.target.value = '';
  }, []);

  const formatAttachmentsForMessage = useCallback((atts: Attachment[]): string => {
    if (!atts.length) return '';
    return atts.map(att => {
      if (att.type === 'image') return `\n\n[图片附件: ${att.name}]\n${att.content}`;
      if (att.type === 'text') return `\n\n[文件附件: ${att.name}]\n\`\`\`\n${att.content}\n\`\`\``;
      return `\n\n[二进制附件: ${att.name}（base64）]\n${att.content}`;
    }).join('');
  }, []);

  const handleSend = useCallback(async (text?: string, isRegen = false, resumeWorkflowId?: string) => {
    const userText = (text ?? input).trim();
    if (!userText || isStreaming || !selectedRepo || !token) return;

    reconnectAttemptsRef.current = 0;
    toast.dismiss('reconnect-backoff');
    toast.dismiss('reconnect-max-retry');

    const pendingAttachments = isRegen ? [] : [...attachments];
    const attachmentText = formatAttachmentsForMessage(pendingAttachments);
    const fullUserText = userText + attachmentText;

    if (!isRegen) {
      setInput('');
      setAttachments([]);
      setPendingResumeInfo(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userText,
      attachments: pendingAttachments.length ? pendingAttachments : undefined,
    };
    const aiMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: '', streaming: true };
    setMessages(prev => isRegen ? [...prev, aiMsg] : [...prev, userMsg, aiMsg]);
    setIsStreaming(true);

    const baseHistory = messages.filter(m => m.id !== 'welcome');
    const historyUserMsg: Message = { id: `history-user-${Date.now()}`, role: 'user', content: fullUserText };
    const historySource = isRegen ? baseHistory : [...baseHistory, historyUserMsg];
    const history = buildModelHistory(historySource, fullUserText);

    abortRef.current = new AbortController();
    let accumulated = '';
    let currentThinking = '';

    if (!isRegen) {
      setToolHistory([]);
      setShowToolHistory(false);
      setTaskPlanSteps([]);
      setStepStatuses({});
      setStepRetryCounts({});
      setCurrentStepId(null);
      setStreamMetrics(null);
    }

    const idempotencyKey = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    currentTurnIdRef.current = idempotencyKey;
    const reqBody: Record<string, unknown> = {
      messages: history,
      github_token: token,
      owner: selectedRepo.owner.login,
      repo: selectedRepo.name,
      target_branch: selectedBranch,
      model_config: modelConfig,
      user_id: user?.login || 'anonymous',
      auto_mode: autoMode,
      idempotency_key: idempotencyKey,
    };
    if (resumeWorkflowId) reqBody.resume_workflow_id = resumeWorkflowId;
    lastRequestBodyRef.current = reqBody;
    lastUserTextRef.current = userText;
    streamingAiMsgIdRef.current = aiMsg.id;
    networkInterruptedRef.current = false;

    const initMsgId = aiMsg.id;
    let currentStepBubbleId: string | null = null;
    let answerMsgId: string | null = null;
    let hasSteps = false;
    let planStepsLocal: Array<{ id: string; title: string; desc: string }> = [];
    let localCurrentStepId: string | null = null;
    let thinkingBubbleId: string | null = null;
    const toolBubbleMap = new Map<string, string>();

    type MsgMutFn = (prev: Message[]) => Message[];
    type ToolMutFn = (prev: ToolHistoryItem[]) => ToolHistoryItem[];
    const msgQueue: MsgMutFn[] = [];
    const toolQueue: ToolMutFn[] = [];
    let rafId = 0;
    let rafPending = false;

    const flushQueues = () => {
      rafPending = false;
      if (msgQueue.length) {
        const fns = msgQueue.splice(0);
        setMessages(prev => fns.reduce((acc, fn) => fn(acc), prev));
      }
      if (toolQueue.length) {
        const fns = toolQueue.splice(0);
        setToolHistory(prev => fns.reduce((acc, fn) => fn(acc), prev));
      }
    };

    const queueMsg = (fn: MsgMutFn) => {
      msgQueue.push(fn);
      if (!rafPending) {
        rafPending = true;
        rafId = requestAnimationFrame(flushQueues);
      }
    };

    const queueTool = (fn: ToolMutFn) => {
      toolQueue.push(fn);
      if (!rafPending) {
        rafPending = true;
        rafId = requestAnimationFrame(flushQueues);
      }
    };

    const cancelAndFlush = () => {
      cancelAnimationFrame(rafId);
      rafPending = false;
      if (msgQueue.length) {
        const fns = msgQueue.splice(0);
        setMessages(prev => fns.reduce((acc, fn) => fn(acc), prev));
      }
      if (toolQueue.length) {
        const fns = toolQueue.splice(0);
        setToolHistory(prev => fns.reduce((acc, fn) => fn(acc), prev));
      }
    };

    await runAiAgent({
      requestBody: reqBody,
      signal: abortRef.current.signal,
      onMetrics: (metrics) => {
        setStreamMetrics(prev => ({ ...prev, ...metrics }));
        if (metrics.ttft !== undefined) {
          console.debug(`[SSE] TTFT=${metrics.ttft}ms stream_id=${metrics.streamId}`);
        }
        if (metrics.interruptReason === 'completed') {
          console.debug(`[SSE] 流结束 TTFT=${metrics.ttft}ms 流速≈${metrics.throughput}chars/s seqs=${metrics.totalSeq}`);
        }
      },
      onData: (data) => {
        const chunk = parseTypedChunk(data);
        if (!chunk) return;

        switch (chunk.type) {
          case 'content': {
            if (answerMsgId === null) {
              if (hasSteps) {
                const newId = `ans-${Date.now()}`;
                answerMsgId = newId;
                streamingAiMsgIdRef.current = newId;
                const answerMsg: Message = { id: newId, role: 'assistant', content: '', streaming: true, bubbleType: 'answer' };
                queueMsg(prev => [...prev, answerMsg]);
              } else {
                answerMsgId = initMsgId;
              }
            }
            lastContentAtRef.current = Date.now();
            accumulated += chunk.content;
            const aid = answerMsgId;
            const snapshot = accumulated;
            queueMsg(prev => prev.map(m => m.id === aid ? { ...m, content: snapshot } : m));
            break;
          }
          case 'think_start': {
            const tbId = `think-${Date.now()}`;
            thinkingBubbleId = tbId;
            const thinkMsg: Message = {
              id: tbId, role: 'assistant', content: '',
              streaming: true, bubbleType: 'thinking',
              thinkingContent: '', thinkingDone: false,
            };
            queueMsg(prev => [...prev, thinkMsg]);
            break;
          }
          case 'think_chunk': {
            currentThinking += chunk.content;
            if (thinkingBubbleId) {
              const tid = thinkingBubbleId;
              const snap = currentThinking;
              queueMsg(prev => prev.map(m => m.id === tid ? { ...m, thinkingContent: snap } : m));
            }
            break;
          }
          case 'think_end': {
            if (thinkingBubbleId) {
              const tid = thinkingBubbleId;
              queueMsg(prev => prev.map(m => m.id === tid ? { ...m, thinkingDone: true, streaming: false } : m));
            }
            thinkingBubbleId = null;
            currentThinking = '';
            break;
          }
          case 'tool_queued': {
            queueTool(prev => [...prev, {
              id: chunk.id, tool: chunk.tool,
              label: chunk.label, hint: chunk.hint,
              status: 'queued', startedAt: Date.now(),
            }]);
            if (window.innerWidth >= 768) setShowToolHistory(true);
            const toolMsgId = `tool-${chunk.id}-${Date.now()}`;
            toolBubbleMap.set(chunk.id, toolMsgId);
            queueMsg(prev => [...prev, {
              id: toolMsgId, role: 'assistant', content: '',
              streaming: true, bubbleType: 'tool',
              toolCallId: chunk.id, toolName: chunk.tool,
              toolLabel: chunk.label, toolHint: chunk.hint,
              toolStatus: 'queued',
            }]);
            break;
          }
          case 'tool_start': {
            const existing = toolBubbleMap.get(chunk.id);
            if (existing) {
              queueTool(prev => prev.map(t => t.id === chunk.id ? { ...t, status: 'running' } : t));
              queueMsg(prev => prev.map(m => m.id === existing ? { ...m, toolStatus: 'running' } : m));
            } else {
              queueTool(prev => [...prev, {
                id: chunk.id, tool: chunk.tool,
                label: chunk.label, hint: chunk.hint,
                status: 'running', startedAt: Date.now(),
              }]);
              if (window.innerWidth >= 768) setShowToolHistory(true);
              const toolMsgId = `tool-${chunk.id}-${Date.now()}`;
              toolBubbleMap.set(chunk.id, toolMsgId);
              queueMsg(prev => [...prev, {
                id: toolMsgId, role: 'assistant', content: '',
                streaming: true, bubbleType: 'tool',
                toolCallId: chunk.id, toolName: chunk.tool,
                toolLabel: chunk.label, toolHint: chunk.hint,
                toolStatus: 'running',
              }]);
            }
            break;
          }
          case 'tool_end': {
            const { id: toolId, status: toolStatus, result: toolResult, elapsedMs } = chunk;
            let finalStatus: any = toolStatus;
            if (toolStatus === 'fail' && toolResult) {
              if (toolResult.includes(i18n.t('【安全风控】')) || toolResult.includes(i18n.t('【熔断拦截】'))) {
                finalStatus = 'blocked';
              }
            }
            queueTool(prev => prev.map(item => item.id === toolId
              ? { ...item, status: finalStatus, result: toolResult, elapsedMs }
              : item
            ));
            const endMsgId = toolBubbleMap.get(toolId);
            if (endMsgId) {
              queueMsg(prev => prev.map(m =>
                m.id === endMsgId
                  ? { ...m, streaming: false, toolStatus: finalStatus, toolElapsedMs: elapsedMs, toolResult }
                  : m
              ));
            }
            break;
          }
          case 'plan': {
            hasSteps = true;
            planStepsLocal = chunk.steps;
            setTaskPlanSteps(chunk.steps);
            setStepStatuses(Object.fromEntries(chunk.steps.map(s => [s.id, 'pending' as StepStatus])));
            setStepRetryCounts({});
            setCurrentStepId(null);
            setSidePanelTab('plan');
            if (window.innerWidth >= 768) setShowToolHistory(true);
            setHistoryRefreshTrigger(v => v + 1);
            queueMsg(prev => prev.map(m => {
              if (m.id !== initMsgId) return m;
              const inlinePlan: InlineStep[] = chunk.steps.map(s => ({ id: s.id, title: s.title, desc: s.desc, status: 'pending' }));
              return { ...m, inlinePlan, bubbleType: 'step', stepTitle: i18n.t('任务规划') };
            }));
            break;
          }
          case 'step_start': {
            hasSteps = true;
            localCurrentStepId = chunk.stepId;
            setCurrentStepId(chunk.stepId);
            setStepStatuses(prev => ({ ...prev, [chunk.stepId]: 'running' }));

            const stepInfo = planStepsLocal.find(s => s.id === chunk.stepId);
            const stepTitle = stepInfo?.title ?? `步骤 ${chunk.stepId}`;

            const reuseInit = !currentStepBubbleId && !answerMsgId;
            if (reuseInit) {
              currentStepBubbleId = initMsgId;
              queueMsg(prev => prev.map(m =>
                m.id === initMsgId
                  ? { ...m, bubbleType: 'step', stepTitle, stepId: chunk.stepId, inlinePlan: undefined, streaming: true }
                  : m
              ));
            } else {
              if (currentStepBubbleId) {
                const prevId = currentStepBubbleId;
                queueMsg(prev => prev.map(m => m.id === prevId ? { ...m, streaming: false } : m));
              }
              const newId = `step-${chunk.stepId}-${Date.now()}`;
              currentStepBubbleId = newId;
              const stepMsg: Message = {
                id: newId, role: 'assistant', content: '',
                streaming: true, bubbleType: 'step',
                stepTitle, stepId: chunk.stepId,
              };
              queueMsg(prev => [...prev, stepMsg]);
            }
            break;
          }
          case 'step_retry': {
            setStepStatuses(prev => ({ ...prev, [chunk.stepId]: 'running' }));
            setStepRetryCounts(prev => ({ ...prev, [chunk.stepId]: chunk.retryCount }));
            setCurrentStepId(chunk.stepId);
            localCurrentStepId = chunk.stepId;
            break;
          }
          case 'step_end': {
            setStepStatuses(prev => ({ ...prev, [chunk.stepId]: chunk.status === 'error' ? 'error' : 'done' }));
            if (chunk.status !== 'error') {
              setCurrentStepId(null);
              localCurrentStepId = null;
            }
            if (currentStepBubbleId) {
              const sid = currentStepBubbleId;
              queueMsg(prev => prev.map(m => m.id === sid ? { ...m, streaming: false } : m));
              currentStepBubbleId = null;
            }
            break;
          }
          case 'status_info':
            toast.info(chunk.message, { duration: 4000 });
            break;
          case 'status_warning':
            toast.warning(chunk.message, { duration: 5000 });
            break;
          case 'file_request': {
            const tid = answerMsgId ?? currentStepBubbleId ?? initMsgId;
            queueMsg(prev => prev.map(m => {
              if (m.id !== tid) return m;
              const req: FileRequest = { id: chunk.id, filename: chunk.filename, description: chunk.description, mime_types: chunk.mime_types, fulfilled: false };
              return { ...m, fileRequests: [...(m.fileRequests ?? []), req] };
            }));
            break;
          }
          case 'tool_issue_reported':
          case 'tool_fix_proposed': {
            setWorkshopRefreshTrigger(v => v + 1);
            setPendingProposalCount(v => v + 1);
            break;
          }
          case 'timeout': {
            const wfId = chunk.workflow_id;
            const summary = lastUserTextRef.current.slice(0, 60) || i18n.t('上次任务');
            setPendingResumeInfo({ workflowId: wfId, taskSummary: summary });
            toast.warning(i18n.t('任务执行超时（超过 8 分钟），已自动暂停'), {
              description: wfId
                ? i18n.t('点击「立即恢复」可从断点处继续，或稍后在「任务历史」中恢复。')
                : i18n.t('请在右侧「任务历史」Tab 中找到该任务并点击「恢复执行」继续。'),
              duration: 12000,
              action: {
                label: wfId ? i18n.t('立即恢复') : i18n.t('查看历史'),
                onClick: () => {
                  if (wfId) {
                    setPendingResumeInfo(null);
                    handleSend(`继续上次未完成的任务：${summary}`, false, wfId);
                  } else {
                    setShowToolHistory(true);
                    setSidePanelTab('history');
                    setHistoryRefreshTrigger(v => v + 1);
                  }
                },
              },
            });
            break;
          }
          case 'usage': {
            appendUsageRecord(
              chunk.providerType,
              chunk.model,
              chunk.prompt_tokens,
              chunk.completion_tokens,
              chunk.total_tokens,
            );
            break;
          }
          case 'heartbeat': {
            setLastHeartbeatAt(Date.now());
            break;
          }
          case 'done': {
            console.debug(`[SSE] done event received totalSeq=${chunk.total_seq}`);
            break;
          }
          case 'error': {
            const errTarget = answerMsgId ?? currentStepBubbleId ?? initMsgId;
            queueMsg(prev => prev.map(m =>
              m.id === errTarget
                ? { ...m, content: `❌ ${chunk.message}（${chunk.code}）`, streaming: false }
                : (m.role === 'assistant' && m.streaming
                    ? (m.bubbleType === 'thinking' ? { ...m, streaming: false, thinkingDone: true } : { ...m, streaming: false })
                    : m)
            ));
            break;
          }
        }
      },
      onComplete: async () => {
        cancelAndFlush();
        networkInterruptedRef.current = false;
        setIsNetworkInterrupted(false);
        streamingAiMsgIdRef.current = null;
        reconnectAttemptsRef.current = 0;
        toast.dismiss('reconnect-backoff');
        setMessages(prev => prev.map(m => {
          if (m.role !== 'assistant' || !m.streaming) return m;
          if (m.bubbleType === 'thinking') return { ...m, streaming: false, thinkingDone: true };
          return { ...m, streaming: false };
        }));
        setIsStreaming(false);
        setStepStatuses(prev => {
          let changed = false;
          const next: Record<string, StepStatus> = { ...prev };
          for (const k of Object.keys(next)) {
            if (next[k] === 'pending' || next[k] === 'running') { next[k] = 'done'; changed = true; }
          }
          return changed ? next : prev;
        });
        pendingMsgsRef.current = [];
        const sid = sessionIdRef.current;
        const tid = currentTurnIdRef.current;
        if (sid && tid) {
          const finalToolHistory = toolHistoryRef.current;
          const finalMessages = messagesRef.current;
          await Promise.all([
            insertToolExecutionLogs(sid, tid, finalToolHistory),
            upsertWorkflowSnapshot(sid, tid, finalMessages, finalToolHistory),
          ]);
        }
      },
      onError: (err) => {
        cancelAndFlush();
        const isUserAbort = abortRef.current?.signal.aborted;
        const isNetworkDrop = !isUserAbort && (
          err.message.includes(i18n.t('网络')) ||
          err.message.includes('Failed to fetch') ||
          err.message.includes('NetworkError') ||
          err.message.includes(i18n.t('超时')) ||
          err.message.includes('timeout') ||
          err.message.includes(i18n.t('中断'))
        );
        const errTargetId = answerMsgId ?? currentStepBubbleId ?? initMsgId;
        if (isNetworkDrop) {
          networkInterruptedRef.current = true;
          setIsNetworkInterrupted(true);
          setMessages(prev => prev.map(m =>
            m.id === errTargetId
              ? { ...m, content: accumulated + (accumulated ? '\n\n' : '') + `⚠️ 连接中断：${err.message}`, streaming: false }
              : (m.role === 'assistant' && m.streaming
                  ? (m.bubbleType === 'thinking' ? { ...m, streaming: false, thinkingDone: true } : { ...m, streaming: false })
                  : m)
          ));
          setIsStreaming(false);
          if (!document.hidden) {
            networkInterruptedRef.current = false;
            triggerReconnectOrWarn();
          }
        } else {
          setMessages(prev => prev.map(m =>
            m.id === errTargetId
              ? { ...m, content: `❌ ${err.message}`, streaming: false }
              : (m.role === 'assistant' && m.streaming
                  ? (m.bubbleType === 'thinking' ? { ...m, streaming: false, thinkingDone: true } : { ...m, streaming: false })
                  : m)
          ));
          setIsStreaming(false);
          if (!isUserAbort) toast.error(err.message, { duration: 5000 });
        }
      },
    });
  }, [input, attachments, formatAttachmentsForMessage, isStreaming, messages, selectedRepo, token, modelConfig, selectedBranch]);

  const handleReconnect = useCallback(() => {
    if (isStreaming || !lastRequestBodyRef.current || !selectedRepo || !token) return;
    const prevBody = lastRequestBodyRef.current;
    const userText = lastUserTextRef.current;
    const reconnectHistory = [
      ...((prevBody.messages as Array<{ role: string; content: string }>) ?? []),
      {
        role: 'user',
        content: '⚠️ 系统提示：上一次连接因网络中断，请从中断处继续完成任务，如果有任务计划，继续执行剩余未完成的步骤。',
      },
    ];

    const aiMsg: Message = { id: Date.now().toString(), role: 'assistant', content: '', streaming: true };
    setMessages(prev => [...prev, aiMsg]);
    setIsStreaming(true);
    abortRef.current = new AbortController();
    streamingAiMsgIdRef.current = aiMsg.id;
    networkInterruptedRef.current = false;

    let accumulated = '';
    const newReqBody = { ...prevBody, messages: reconnectHistory };
    lastRequestBodyRef.current = newReqBody as Record<string, unknown>;

    type MsgMutFn = (prev: Message[]) => Message[];
    const msgQueue: MsgMutFn[] = [];
    let rafId = 0;
    let rafPending = false;
    const flushMsgQueue = () => {
      rafPending = false;
      if (!msgQueue.length) return;
      const fns = msgQueue.splice(0);
      setMessages(prev => fns.reduce((acc, fn) => fn(acc), prev));
    };
    const queueMsg = (fn: MsgMutFn) => {
      msgQueue.push(fn);
      if (!rafPending) { rafPending = true; rafId = requestAnimationFrame(flushMsgQueue); }
    };
    const cancelAndFlush = () => {
      cancelAnimationFrame(rafId);
      rafPending = false;
      if (msgQueue.length) {
        const fns = msgQueue.splice(0);
        setMessages(prev => fns.reduce((acc, fn) => fn(acc), prev));
      }
    };

    runAiAgent({
      requestBody: newReqBody,
      signal: abortRef.current.signal,
      onData: (data) => {
        const chunk = parseTypedChunk(data);
        if (!chunk) return;
        if (chunk.type === 'content') {
          accumulated += chunk.content;
          const snap = accumulated;
          queueMsg(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: snap } : m));
        }
      },
      onComplete: async () => {
        cancelAndFlush();
        networkInterruptedRef.current = false;
        setIsNetworkInterrupted(false);
        streamingAiMsgIdRef.current = null;
        reconnectAttemptsRef.current = 0;
        toast.dismiss('reconnect-backoff');
        setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, streaming: false } : m));
        setIsStreaming(false);
        const sid = sessionIdRef.current;
        const tid = currentTurnIdRef.current;
        if (sid && tid) {
          const finalToolHistory = toolHistoryRef.current;
          const finalMessages = messagesRef.current;
          await Promise.all([
            insertToolExecutionLogs(sid, tid, finalToolHistory),
            upsertWorkflowSnapshot(sid, tid, finalMessages, finalToolHistory),
          ]);
        }
      },
      onError: (err) => {
        cancelAndFlush();
        setMessages(prev => prev.map(m =>
          m.id === aiMsg.id ? { ...m, content: `❌ 重连失败：${err.message}`, streaming: false } : m
        ));
        setIsStreaming(false);
        toast.error(`重连失败：${err.message}`);
      },
    });
  }, [isStreaming, selectedRepo, token, modelConfig, selectedBranch]);

  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;

  const calcReconnectDelay = (attempt: number): number => {
    const base = Math.min(1500 * Math.pow(2, attempt), 30_000);
    const jitter = Math.random() * 500;
    return base + jitter;
  };

  const triggerReconnectOrWarn = useCallback(() => {
    const hasWrite = toolHistory.some(t => WRITE_TOOLS.has(t.tool ?? ''));
    if (hasWrite) {
      toast.warning(i18n.t('检测到本轮含写操作，自动重连可能导致重复执行。请确认后手动重连。'), {
        id: 'write-op-reconnect',
        duration: 0,
        action: {
          label: i18n.t('确认重连'),
          onClick: () => {
            toast.dismiss('write-op-reconnect');
            reconnectAttemptsRef.current = 0;
            handleReconnect();
          },
        },
      });
      return;
    }
    const attempt = reconnectAttemptsRef.current;
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      toast.error(
        `已重试 ${MAX_RECONNECT_ATTEMPTS} 次，连接仍然失败。请检查网络后手动重连。`,
        {
          id: 'reconnect-max-retry',
          duration: 0,
          action: {
            label: i18n.t('手动重连'),
            onClick: () => {
              toast.dismiss('reconnect-max-retry');
              reconnectAttemptsRef.current = 0;
              handleReconnect();
            },
          },
        },
      );
      return;
    }
    const delay = calcReconnectDelay(attempt);
    reconnectAttemptsRef.current = attempt + 1;
    toast.info(
      `网络中断，${Math.round(delay / 1000)} 秒后自动重连（第 ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS} 次）…`,
      { id: 'reconnect-backoff', duration: delay - 200 },
    );
    setTimeout(() => handleReconnect(), delay);
  }, [toolHistory, handleReconnect]);

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setIsNetworkInterrupted(false);
    networkInterruptedRef.current = false;
    setMessages(prev => prev.map(m => {
      if (!m.streaming) return m;
      if (m.bubbleType === 'thinking') return { ...m, streaming: false, thinkingDone: true };
      return { ...m, streaming: false };
    }));
    if (taskPlanSteps.length > 0) {
      const allDone = taskPlanSteps.every(s => {
        const st = stepStatuses[s.id];
        return st === 'done' || st === 'error';
      });
      if (!allDone) {
        const summary = lastUserTextRef.current.slice(0, 60) || i18n.t('上次任务');
        setPendingResumeInfo({ taskSummary: summary });
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleBack = () => {
    try { localStorage.removeItem(AI_SESSION_KEY); } catch {}
    setStep('repo');
    setSelectedRepo(null);
    setMessages([]);
    setBranches([]);
    setSelectedBranch('');
    setSessionId(null);
    setShowFileBrowser(false);
    pendingMsgsRef.current = [];
  };

  const handleClearChat = () => {
    if (!selectedRepo) return;
    setSessionId(null);
    pendingMsgsRef.current = [];
    setPendingResumeInfo(null);
    const welcomeMsg: Message = {
      id: 'welcome-' + Date.now(),
      role: 'assistant',
      content: `对话已清空。当前目标分支：\`${selectedBranch}\`。有什么可以帮你？`,
    };
    setMessages([welcomeMsg]);
    try {
      localStorage.setItem(AI_SESSION_KEY, JSON.stringify({
        step: 'chat', selectedRepo, selectedBranch, sessionId: null, messages: [welcomeMsg],
      }));
    } catch {}
  };

  const handleFileBrowserInsert = useCallback((text: string) => {
    setInput(prev => prev ? `${prev}\n${text}` : text);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const handleExportMarkdown = useCallback(() => {
    if (!selectedRepo || messages.length <= 1) return;
    const lines: string[] = [
      i18n.t('# AI 助手对话记录'),
      ``,
      `> 仓库：${selectedRepo.full_name}  分支：\`${selectedBranch}\``,
      `> 导出时间：${new Date().toLocaleString('zh-CN')}`,
      ``,
      `---`,
      ``,
    ];
    messages.forEach(m => {
      if (m.id === 'welcome') return;
      if (m.bubbleType === 'thinking' || m.bubbleType === 'tool' || m.bubbleType === 'step') return;
      if (m.role === 'user') {
        lines.push(i18n.t('## 👤 用户'));
        lines.push(``);
        lines.push(m.content);
        lines.push(``);
        lines.push(`---`);
        lines.push(``);
      } else if (m.role === 'assistant' && m.content) {
        lines.push(i18n.t('## 🤖 AI 助手'));
        lines.push(``);
        lines.push(m.content);
        lines.push(``);
        lines.push(`---`);
        lines.push(``);
      }
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = `ai-chat-${selectedRepo.name}-${new Date().toISOString().slice(0, 10)}.md`;
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(i18n.t('对话已导出为 Markdown'));
  }, [messages, selectedRepo, selectedBranch]);

  const handleRetryFromMsg = useCallback(async (aiMsgId: string) => {
    if (isStreaming) return;
    const aiIdx = messages.findIndex(m => m.id === aiMsgId);
    if (aiIdx === -1) return;
    const userMsg = [...messages.slice(0, aiIdx)].reverse().find(m => m.role === 'user');
    if (!userMsg) return;
    const userMsgIdx = messages.slice(0, aiIdx).reduce<number>((acc, m, i) => m.role === 'user' ? i : acc, -1);
    setMessages(prev => prev.slice(0, userMsgIdx));
    await handleSend(userMsg.content, false);
  }, [isStreaming, messages]);

  type MsgGroup =
    | { kind: 'user'; msg: Message }
    | { kind: 'exec'; msgs: Message[]; streaming: boolean }
    | { kind: 'answer'; msg: Message };

  const messageGroups = useMemo((): MsgGroup[] => {
    const groups: MsgGroup[] = [];
    let i = 0;
    while (i < messages.length) {
      const m = messages[i];
      if (m.messageType === 'memory_summary') { i++; continue; }
      if (m.role === 'user') {
        groups.push({ kind: 'user', msg: m });
        i++;
      } else if (m.bubbleType === 'step' || m.bubbleType === 'tool' || m.bubbleType === 'thinking') {
        const execMsgs: Message[] = [];
        while (
          i < messages.length &&
          (messages[i].bubbleType === 'step' ||
            messages[i].bubbleType === 'tool' ||
            messages[i].bubbleType === 'thinking')
        ) {
          execMsgs.push(messages[i]);
          i++;
        }
        groups.push({ kind: 'exec', msgs: execMsgs, streaming: execMsgs.some(m2 => m2.streaming === true) });
      } else {
        groups.push({ kind: 'answer', msg: m });
        i++;
      }
    }
    return groups;
  }, [messages]);

  const showSlowHint = isStreaming &&
    lastHeartbeatAt !== null &&
    (Date.now() - lastContentAtRef.current) > 15_000;

  if (step === 'repo') {
    return (
      <div className="flex flex-col min-h-0 h-full overflow-y-auto">
        <div className="flex flex-col items-center gap-5 px-4 pt-6 pb-8 max-w-lg mx-auto w-full">

          <div className="flex flex-col items-center gap-2 text-center w-full">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center">
                <Sparkles className="w-10 h-10 text-primary" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-background" />
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight text-balance">{i18n.t('AI 仓库助手')}</h1>
            <p className="text-sm text-muted-foreground">{i18n.t('选择仓库，开始智能编程')}</p>
          </div>

          <button
            onClick={() => setShowModelSettings(true)}
            className="flex items-center gap-2.5 w-full max-w-sm px-3.5 py-2.5 rounded-xl border border-border bg-card hover:bg-accent/50 transition-colors group"
          >
            <ModelAvatar modelDef={currentModelDef} size="sm" />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs text-muted-foreground leading-none mb-0.5">{i18n.t('当前模型')}</p>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-foreground truncate">{currentModelDef.label}</span>
                {currentModelDef.badge && (
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 shrink-0">{currentModelDef.badge}</Badge>
                )}
              </div>
            </div>
            <Settings className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
          </button>

          <div className="w-full max-w-sm">
            <RepoSelector onSelect={handleSelectRepo} />
          </div>

          <div className="flex items-center gap-2 w-full max-w-sm">
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent/50 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <History className="w-4 h-4" />
              {i18n.t('历史对话')}</button>
            <div className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="text-pretty leading-snug">{i18n.t('建议在测试仓库或非主分支操作')}</span>
            </div>
          </div>

        </div>

        <ModelSettingsDialog
          open={showModelSettings}
          onClose={() => setShowModelSettings(false)}
          config={modelConfig}
          onSave={handleSaveModelConfig}
        />
        <HistoryPanel
          open={showHistory}
          onClose={() => setShowHistory(false)}
          login={user?.login || ''}
          onLoad={handleLoadHistory}
        />
      </div>
    );
  }

  return (
    <div ref={chatContainerRef} className="flex flex-col h-[calc(100dvh-4rem)] md:h-[calc(100dvh-1rem)] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card shrink-0">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title={i18n.t('切换仓库')}
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-semibold text-foreground truncate hidden sm:block max-w-[100px]">
            {selectedRepo?.name}
          </span>
        </button>

        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <BranchPicker
            branches={branches}
            value={selectedBranch}
            onChange={handleBranchChange}
            loading={branchesLoading}
          />
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => setShowCreateBranch(true)}
            title={i18n.t('新建分支')}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isStreaming && (
            <Badge variant="secondary" className="text-xs animate-pulse bg-primary/10 text-primary border-primary/20">
              <Cpu className="w-3 h-3 mr-1 animate-spin" /><span className="hidden sm:inline">{i18n.t('执行中')}</span>
            </Badge>
          )}
          <button
            onClick={() => setShowFileBrowser(v => !v)}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              showFileBrowser
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
            title={showFileBrowser ? i18n.t('关闭文件浏览器') : i18n.t('打开文件浏览器')}
          >
            <FolderSearch className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowToolHistory(v => !v)}
            className={cn(
              'p-1.5 rounded-md transition-colors relative',
              showToolHistory
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
            title={showToolHistory ? i18n.t('关闭侧边面板') : i18n.t('打开侧边面板')}
          >
            <Wrench className="w-3.5 h-3.5" />
            {(toolHistory.length > 0 || taskPlanSteps.length > 0) && !showToolHistory && (
              <span className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full border border-background" />
            )}
            {interruptedWorkflowCount > 0 && !showToolHistory && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 flex items-center justify-center bg-amber-500 text-white rounded-full text-[9px] font-bold border border-background">
                {interruptedWorkflowCount}
              </span>
            )}
          </button>
          {messages.length > 1 && !isStreaming && (
            <button
              onClick={handleExportMarkdown}
              className="p-1.5 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
              title={i18n.t('导出对话为 Markdown')}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {isProtectedBranch && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-600 dark:text-amber-400 flex-1 min-w-0">
            {i18n.t('当前分支')}<span className="font-semibold">{selectedBranch}</span> {i18n.t('受保护，建议')}<button onClick={() => setShowCreateBranch(true)} className="underline ml-1 hover:text-amber-700">
              {i18n.t('新建功能分支')}</button>
          </p>
          <button
            onClick={() => setIsProtectedBranch(false)}
            className="shrink-0 p-0.5 rounded text-amber-500/70 hover:text-amber-600 hover:bg-amber-500/15 transition-colors"
            title={i18n.t('关闭提示')}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">

        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {taskPlanSteps.length > 0 && (() => {
            const total = taskPlanSteps.length;
            const done = taskPlanSteps.filter(s => {
              const st = stepStatuses[s.id];
              return st === 'done' || st === 'error';
            }).length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const allDone = done === total && !isStreaming;
            const hasError = taskPlanSteps.some(s => stepStatuses[s.id] === 'error');
            return (
              <div className={cn(
                'shrink-0 px-3 py-2 border-b border-border/50 transition-all duration-500',
                allDone ? 'bg-green-500/5' : hasError ? 'bg-destructive/5' : 'bg-primary/5'
              )}>
                <div className="flex items-center gap-2.5">
                  {isStreaming && !allDone
                    ? <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
                    : allDone
                      ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                      : hasError
                        ? <XCircle className="w-3 h-3 text-destructive shrink-0" />
                        : <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                  }
                  <span className={cn(
                    'text-[11px] font-medium shrink-0',
                    allDone ? 'text-green-600 dark:text-green-400'
                      : hasError ? 'text-destructive'
                        : 'text-primary'
                  )}>
                    {allDone ? i18n.t('任务完成') : isStreaming ? i18n.t('执行中') : i18n.t('已暂停')}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-border/60 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        allDone ? 'bg-green-500'
                          : hasError ? 'bg-destructive'
                            : 'bg-primary'
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                    {done}/{total}
                  </span>
                </div>
              </div>
            );
          })()}

          <div
            ref={scrollAreaRef}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="flex flex-col p-4 pb-2">
              {messageGroups.map((group, gIdx) => {
                const marginClass = gIdx === 0 ? '' : group.kind === 'user' ? 'mt-5' : 'mt-3';

                if (group.kind === 'user') {
                  const msg = group.msg;
                  return (
                    <div key={msg.id} className={cn('flex gap-2.5 flex-row-reverse', marginClass)}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-primary text-primary-foreground">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex flex-col gap-1 min-w-0 max-w-[85%]">
                        <div className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm min-w-0 bg-primary text-primary-foreground">
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {msg.attachments.map(att => (
                                <div key={att.id} className="flex items-center gap-1 rounded-md border border-primary-foreground/30 bg-primary-foreground/10 px-2 py-1 text-xs text-primary-foreground/90">
                                  {att.type === 'image'
                                    ? <img src={att.content} alt={att.name} className="w-5 h-5 rounded object-cover shrink-0" />
                                    : <FileText className="w-3.5 h-3.5 shrink-0" />}
                                  <span className="truncate max-w-[120px]">{att.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                if (group.kind === 'exec') {
                  return (
                    <div key={group.msgs[0].id} className={marginClass}>
                      <ExecutionBlock msgs={group.msgs} streaming={group.streaming} />
                    </div>
                  );
                }

                const msg = group.msg;
                const assistantMessages = messages.filter(m => m.role === 'assistant' && m.bubbleType !== 'step');
                const lastAssistantMessage = assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1] : undefined;
                const isLastAi = msg.id === lastAssistantMessage?.id;
                return (
                  <div key={msg.id} className={cn('flex gap-2.5 flex-row', marginClass)}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <ModelAvatar modelDef={currentModelDef} size="sm" />
                    </div>
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm min-w-0 bg-muted/60 border border-border text-foreground">
                        <div className="min-w-0">
                          {msg.streaming && showSlowHint && (
                            <p className="text-[11px] text-muted-foreground/60 italic mb-1.5 animate-pulse">
                              {i18n.t('正在处理复杂任务，请稍候…')}</p>
                          )}
                          {msg.content ? (
                            msg.content.includes(i18n.t('## 🔧 修复清单'))
                              ? <RepairChecklist content={msg.content} />
                              : renderMarkdown(msg.content, (filePath) => {
                                  handleSend(`请将上面的 diff 修改应用到仓库文件 \`${filePath}\`，直接使用工具提交到当前分支。`);
                                })
                          ) : (
                            msg.streaming
                              ? <span className="inline-block w-1.5 h-4 bg-primary animate-pulse rounded-sm align-middle" />
                              : <span className="text-muted-foreground text-sm">…</span>
                          )}
                          {msg.streaming && msg.content && (
                            <span className="inline-block w-1.5 h-4 bg-primary ml-0.5 animate-pulse rounded-sm align-middle" />
                          )}
                          {(msg.inlinePlan || msg.inlineTools) && (
                            <InlineActivityPanel
                              inlinePlan={msg.inlinePlan}
                              inlineTools={msg.inlineTools}
                              streaming={msg.streaming}
                            />
                          )}
                          {msg.fileRequests && msg.fileRequests.length > 0 && (
                            <div className="mt-3 flex flex-col gap-2">
                              {msg.fileRequests.map(freq => (
                                <FileRequestCard
                                  key={freq.id}
                                  request={freq}
                                  onUpload={(file) => {
                                    setMessages(prev => prev.map(m =>
                                      m.id === msg.id
                                        ? { ...m, fileRequests: m.fileRequests?.map(r => r.id === freq.id ? { ...r, fulfilled: true } : r) }
                                        : m
                                    ));
                                    const reader = new FileReader();
                                    const isImage = file.type.startsWith('image/');
                                    reader.onload = (ev) => {
                                      const content = ev.target?.result as string;
                                      const att: Attachment = { id: `att-${Date.now()}`, name: file.name, type: isImage ? 'image' : 'text', mimeType: file.type, content, size: file.size };
                                      const attText = isImage ? `\n\n[图片附件: ${file.name}]\n${content}` : `\n\n[文件附件: ${file.name}]\n\`\`\`\n${content}\n\`\`\``;
                                      handleSend(`已上传文件 ${file.name}，请继续执行任务。${attText}`, false);
                                    };
                                    if (isImage) reader.readAsDataURL(file);
                                    else reader.readAsText(file);
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {!msg.streaming && msg.content && (
                        <div className="flex items-center gap-0.5 self-start ml-1">
                          <CopyButton text={msg.content} />
                          {isLastAi && (
                            <button
                              onClick={handleRegenerate}
                              disabled={isStreaming}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                              title={i18n.t('重新生成')}
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!isLastAi && (
                            <button
                              onClick={() => handleRetryFromMsg(msg.id)}
                              disabled={isStreaming}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                              title={i18n.t('从此处重试')}
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isLastAi && (msg.content.includes(i18n.t('✅ 文件')) || msg.content.includes(i18n.t('✅ 已 patch')) || msg.content.includes(i18n.t('✅ 分支'))) && (
                            <button
                              onClick={() => handleSend(`请帮我从当前分支 \`${selectedBranch}\` 向默认分支提交一个 PR，标题总结刚才的修改内容`)}
                              disabled={isStreaming}
                              className="flex items-center gap-1 p-1 px-2 rounded text-xs text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                              title={i18n.t('一键提交 PR')}
                            >
                              <GitPullRequest className="w-3.5 h-3.5" />
                              {i18n.t('提交 PR')}</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
              {!isStreaming && streamMetrics?.interruptReason === 'completed' && (
                <StreamMetricsBar metrics={streamMetrics} className="mx-3 mb-1" />
              )}
            </div>
          </div>

          {messages.length <= 1 && !isStreaming && (
            <div className="px-3 pb-2 shrink-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Zap className="w-3 h-3 text-primary/70" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{i18n.t('快捷指令')}</span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {QUICK_PROMPTS.map(q => {
                  const Icon = q.icon;
                  return (
                    <button
                      key={q.label}
                      onClick={() => handleSend(q.text)}
                      className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-primary/5 hover:border-primary/30 hover:text-primary text-muted-foreground transition-all duration-150 whitespace-nowrap group"
                    >
                      <Icon className="w-3 h-3 shrink-0 group-hover:text-primary" />
                      <span>{q.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="px-3 py-3 shrink-0 bg-card">
            <div className={cn(
              'rounded-xl border bg-background transition-shadow duration-200',
              isStreaming
                ? 'border-primary/40 shadow-sm shadow-primary/10'
                : 'border-border hover:border-border/80 focus-within:border-primary/50 focus-within:shadow-sm focus-within:shadow-primary/10'
            )}>
              <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowModelSettings(true)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-primary hover:bg-primary/8 transition-colors group"
                    title={i18n.t('切换模型')}
                  >
                    <ModelAvatar modelDef={currentModelDef} size="sm" />
                    <span className="font-medium">{currentModelDef.label}</span>
                    {modelConfig.model && (
                      <span className="hidden sm:inline text-[10px] opacity-70">· {modelConfig.model}</span>
                    )}
                  </button>
                  <button
                    onClick={() => setShowFileBrowser(v => !v)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors',
                      showFileBrowser
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-primary hover:bg-primary/8'
                    )}
                    title={i18n.t('文件浏览器')}
                  >
                    <PanelRight className="w-3 h-3 shrink-0" />
                    <span className="hidden sm:inline">{i18n.t('文件')}</span>
                  </button>
                </div>
                <div className="flex items-center gap-0.5">
                  {sessionId && (
                    <span className="text-[10px] text-green-500 px-1" title={i18n.t('对话已保存')}>●</span>
                  )}
                  <div className="w-px h-3.5 bg-border mx-0.5" />
                  <button
                    onClick={() => setShowHistory(true)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/8 transition-colors"
                    title={i18n.t('历史对话')}
                  >
                    <History className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleClearChat}
                    disabled={isStreaming}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors disabled:opacity-40"
                    title={i18n.t('清空对话')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="mx-3 h-px bg-border/60" />

              {isNetworkInterrupted && !isStreaming && (
                <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="flex-1 min-w-0 text-xs text-amber-700 dark:text-amber-300 truncate">
                    {i18n.t('连接已中断，任务未完成')}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs shrink-0 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                    onClick={() => { setIsNetworkInterrupted(false); handleReconnect(); }}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    {i18n.t('重新连接')}</Button>
                  <button
                    className="text-amber-500/60 hover:text-amber-600 dark:hover:text-amber-400 text-xs shrink-0"
                    onClick={() => setIsNetworkInterrupted(false)}
                    title={i18n.t('忽略')}
                  >✕</button>
                </div>
              )}

              {pendingResumeInfo && !isStreaming && !isNetworkInterrupted && (
                <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="flex-1 min-w-0 text-xs text-amber-700 dark:text-amber-300 truncate">
                    {pendingResumeInfo.workflowId ? i18n.t('任务已超时暂停，可从断点处继续') : i18n.t('任务已停止，可继续执行剩余步骤')}
                  </span>
                  {pendingResumeInfo.workflowId ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-xs shrink-0 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                      onClick={() => {
                        const { workflowId, taskSummary } = pendingResumeInfo;
                        setPendingResumeInfo(null);
                        handleSend(`继续上次未完成的任务：${taskSummary}`, false, workflowId);
                      }}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      {i18n.t('立即恢复')}</Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-xs shrink-0 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                      onClick={() => {
                        setShowToolHistory(true);
                        setSidePanelTab('history');
                        setHistoryRefreshTrigger(v => v + 1);
                        setPendingResumeInfo(null);
                      }}
                    >
                      <ClipboardList className="w-3 h-3 mr-1" />
                      {i18n.t('查看历史')}</Button>
                  )}
                  <button
                    className="text-amber-500/60 hover:text-amber-600 dark:hover:text-amber-400 text-xs shrink-0"
                    onClick={() => setPendingResumeInfo(null)}
                    title={i18n.t('忽略')}
                  >✕</button>
                </div>
              )}

              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-3 pt-2">
                  {attachments.map(att => (
                    <div key={att.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-2 py-1 text-xs text-foreground max-w-[180px]">
                      {att.type === 'image'
                        ? <img src={att.content} alt={att.name} className="w-5 h-5 rounded object-cover shrink-0" />
                        : <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                      }
                      <span className="flex-1 min-w-0 truncate">{att.name}</span>
                      <button
                        onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
                        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        title={i18n.t('移除附件')}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,text/*,.ts,.tsx,.js,.jsx,.json,.yaml,.yml,.md,.py,.go,.kt,.swift,.sh,.env,.xml,.html,.css,.txt"
                className="hidden"
                onChange={handleFileSelect}
              />

              <div className="flex items-end gap-2 px-3 py-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/8 transition-colors disabled:opacity-40"
                  title={i18n.t('上传文件或图片')}
                >
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    setTimeout(() => {
                      textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }, 350);
                  }}
                  placeholder={i18n.t('输入消息… （Enter 发送，Shift+Enter 换行）')}
                  className="flex-1 min-w-0 min-h-[36px] max-h-28 resize-none border-0 shadow-none bg-transparent px-0 py-0.5 text-sm focus-visible:ring-0 placeholder:text-muted-foreground/60 overflow-y-auto"
                  disabled={isStreaming}
                  rows={1}
                  style={{ height: 'auto' }}
                />
                {isStreaming ? (
                  <button
                    onClick={handleStop}
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 transition-colors"
                    title={i18n.t('停止生成')}
                  >
                    <Square className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim()}
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                    title={i18n.t('发送（Enter）')}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {showFileBrowser && selectedRepo && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
              onClick={() => setShowFileBrowser(false)}
            />
            <div className={cn(
              'flex flex-col overflow-hidden border-border bg-background',
              'fixed inset-y-0 right-0 z-50 w-[85%] max-w-xs shadow-2xl border-l',
              'md:static md:w-56 md:shrink-0 md:min-h-0 md:shadow-none md:z-auto'
            )}>
              <FileBrowserPanel
                owner={selectedRepo.owner.login}
                repo={selectedRepo.name}
                branch={selectedBranch}
                onInsert={handleFileBrowserInsert}
                onClose={() => setShowFileBrowser(false)}
              />
            </div>
          </>
        )}

        {showToolHistory && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
              onClick={() => setShowToolHistory(false)}
            />
            <div className={cn(
              'flex flex-col overflow-hidden border-border bg-background',
              'fixed inset-y-0 right-0 z-50 w-[88%] max-w-sm shadow-2xl border-l',
              'md:static md:w-64 md:shrink-0 md:min-h-0 md:shadow-none md:z-auto'
            )}>
              <div className="flex items-stretch border-b border-border shrink-0 bg-muted/20">
                <button
                  onClick={() => setSidePanelTab('plan')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors relative',
                    sidePanelTab === 'plan'
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <ListChecks className="w-3.5 h-3.5 shrink-0" />
                  {i18n.t('任务计划')}{taskPlanSteps.length > 0 && (
                    <span className="text-[9px] font-mono bg-primary/10 text-primary px-1 rounded">
                      {taskPlanSteps.length}
                    </span>
                  )}
                  {sidePanelTab === 'plan' && (
                    <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-primary rounded-t" />
                  )}
                </button>
                <button
                  onClick={() => setSidePanelTab('tools')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors relative',
                    sidePanelTab === 'tools'
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Wrench className="w-3.5 h-3.5 shrink-0" />
                  {i18n.t('工具历史')}{toolHistory.length > 0 && (
                    <span className="text-[9px] font-mono bg-muted text-muted-foreground px-1 rounded">
                      {toolHistory.length}
                    </span>
                  )}
                  {sidePanelTab === 'tools' && (
                    <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-primary rounded-t" />
                  )}
                </button>
                <button
                  onClick={() => setSidePanelTab('runlog')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors relative',
                    sidePanelTab === 'runlog'
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <History className="w-3.5 h-3.5 shrink-0" />
                  {i18n.t('执行日志')}{sidePanelTab === 'runlog' && (
                    <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-primary rounded-t" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setSidePanelTab('history');
                    setHistoryRefreshTrigger(v => v + 1);
                  }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors relative',
                    sidePanelTab === 'history'
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                  {i18n.t('任务历史')}{interruptedWorkflowCount > 0 && sidePanelTab !== 'history' && (
                    <span className="text-[9px] font-mono bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1 rounded">
                      {interruptedWorkflowCount}
                    </span>
                  )}
                  {sidePanelTab === 'history' && (
                    <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-primary rounded-t" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setSidePanelTab('workshop');
                    setPendingProposalCount(0);
                  }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors relative',
                    sidePanelTab === 'workshop'
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  {i18n.t('改进')}{pendingProposalCount > 0 && sidePanelTab !== 'workshop' && (
                    <span className="text-[9px] font-mono bg-primary/15 text-primary px-1 rounded">
                      {pendingProposalCount}
                    </span>
                  )}
                  {sidePanelTab === 'workshop' && (
                    <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-primary rounded-t" />
                  )}
                </button>
                <button
                  onClick={() => setShowToolHistory(false)}
                  className="px-3 text-muted-foreground hover:text-foreground transition-colors min-w-[44px] flex items-center justify-center"
                  title={i18n.t('关闭面板')}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden">
                {sidePanelTab === 'plan' ? (
                  <TaskPlanPanel
                    steps={taskPlanSteps}
                    stepStatuses={stepStatuses}
                    stepRetryCounts={stepRetryCounts}
                    currentStepId={currentStepId}
                  />
                ) : sidePanelTab === 'history' ? (
                  <WorkflowHistoryPanel
                    userId={user?.login ?? 'anonymous'}
                    refreshTrigger={historyRefreshTrigger}
                    onInterruptedCount={setInterruptedWorkflowCount}
                    onResume={(workflowId, taskSummary) => {
                      setSidePanelTab('plan');
                      handleSend(`继续上次未完成的任务：${taskSummary}`, false, workflowId);
                      setTimeout(() => textareaRef.current?.focus(), 100);
                    }}
                  />
                ) : sidePanelTab === 'runlog' ? (
                  <RunHistoryPanel
                    sessionId={sessionId}
                    isStreaming={isStreaming}
                    onRestore={(restored) => {
                      setToolHistory(restored);
                      if (restored.length > 0) setShowToolHistory(true);
                      toast.success(`已从快照恢复 ${restored.length} 条工具记录`);
                    }}
                  />
                ) : sidePanelTab === 'workshop' ? (
                  <ToolWorkshopPanel
                    refreshTrigger={workshopRefreshTrigger}
                    onProposalCount={setPendingProposalCount}
                  />
                ) : (
                  <ToolHistoryPanel items={toolHistory} />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <ModelSettingsDialog
        open={showModelSettings}
        onClose={() => setShowModelSettings(false)}
        config={modelConfig}
        onSave={handleSaveModelConfig}
      />
      <CreateBranchDialog
        open={showCreateBranch}
        onClose={() => setShowCreateBranch(false)}
        branches={branches}
        currentBranch={selectedBranch}
        onCreated={handleBranchCreated}
      />
      <HistoryPanel
        open={showHistory}
        onClose={() => setShowHistory(false)}
        login={user?.login || ''}
        onLoad={handleLoadHistory}
      />
    </div>
  );
}

interface FileRequestCardProps {
  request: FileRequest;
  onUpload: (file: File) => void;
}

function FileRequestCard({ request, onUpload }: FileRequestCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    e.target.value = '';
  };

  if (request.fulfilled) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/8 px-3 py-2 text-xs text-green-700 dark:text-green-400">
        <ImageIcon className="w-3.5 h-3.5 shrink-0" />
        <span>{i18n.t('文件已上传：')}{request.filename}</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
      <div className="flex items-start gap-2 mb-2">
        <Paperclip className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground">{i18n.t('需要上传文件')}</p>
          <p className="text-xs text-muted-foreground mt-0.5 break-words">{request.description}</p>
          {request.filename && (
            <p className="text-[10px] text-primary/70 mt-0.5">{i18n.t('文件名：')}{request.filename}</p>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={request.mime_types || '*/*'}
        className="hidden"
        onChange={handleChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full flex items-center justify-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium py-1.5 transition-colors"
      >
        <Paperclip className="w-3 h-3" />
        {i18n.t('选择文件上传')}</button>
    </div>
  );
}

interface CheckItem {
  id: string;
  text: string;
  done: boolean;
}

interface RepairSection {
  title: string;
  items: CheckItem[];
  isNote?: boolean;
}

function parseRepairSections(content: string): RepairSection[] {
  const sections: RepairSection[] = [];
  const parts = content.split(/^### /m).filter(Boolean);
  for (const part of parts) {
    const lines = part.split('\n');
    const title = lines[0].trim();
    const isNote = title.startsWith('⚠️');
    const items: CheckItem[] = [];
    for (const line of lines.slice(1)) {
      const m = line.match(/^- \[([ xX])\] (.+)/);
      if (m) {
        items.push({ id: crypto.randomUUID(), text: m[2].trim(), done: m[1] !== ' ' });
      } else if (line.match(/^- \*\*/) || (isNote && line.match(/^- /))) {
        items.push({ id: crypto.randomUUID(), text: line.replace(/^- /, '').trim(), done: false });
      }
    }
    if (items.length > 0) sections.push({ title, items, isNote });
  }
  return sections;
}

function RepairChecklist({ content }: { content: string }) {
  const checklistMatch = content.match(/## 🔧 修复清单[\s\S]+/);
  const rest = content.replace(/## 🔧 修复清单[\s\S]+/, '').trim();
  const checklistRaw = checklistMatch ? checklistMatch[0] : '';
  const sections = checklistRaw ? parseRepairSections(checklistRaw) : [];

  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    sections.forEach(s => s.items.forEach(it => { init[it.id] = it.done; }));
    return init;
  });

  if (!checklistMatch) return <>{renderMarkdown(content)}</>;

  const toggle = (id: string) => setChecked(prev => ({ ...prev, [id]: !prev[id] }));

  const totalItems = sections.filter(s => !s.isNote).reduce((acc, s) => acc + s.items.length, 0);
  const doneItems = sections.filter(s => !s.isNote).reduce((acc, s) => acc + s.items.filter(it => checked[it.id]).length, 0);
  const allDone = totalItems > 0 && doneItems === totalItems;

  const introMatch = checklistRaw.match(/## 🔧 修复清单\n+(> [^\n]+\n+)?/);
  const intro = introMatch ? introMatch[0].replace(/## 🔧 修复清单\n+/, '').replace(/^> /, '').trim() : '';

  return (
    <div className="flex flex-col gap-2 min-w-0 w-full">
      {rest && renderMarkdown(rest)}

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/8 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
          <div className="flex items-center gap-2 min-w-0">
            <Wrench className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-300 truncate">{i18n.t('修复清单')}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {allDone
              ? <span className="text-[11px] text-green-600 dark:text-green-400 font-medium">{i18n.t('全部完成 ✓')}</span>
              : <span className="text-[11px] text-amber-600 dark:text-amber-400">{doneItems}/{totalItems} {i18n.t('已完成')}</span>
            }
            <div className="w-16 h-1.5 rounded-full bg-amber-200/60 dark:bg-amber-900/40 overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500 dark:bg-amber-400 transition-all duration-300"
                style={{ width: totalItems ? `${(doneItems / totalItems) * 100}%` : '0%' }}
              />
            </div>
          </div>
        </div>

        {intro && (
          <p className="px-3.5 pt-2.5 pb-0 text-xs text-amber-700 dark:text-amber-400/80 break-words text-pretty">{intro}</p>
        )}

        <div className="px-3.5 py-2.5 flex flex-col gap-3">
          {sections.map((section, si) => (
            <div key={si} className="flex flex-col gap-1.5">
              <p className={`text-xs font-semibold break-words text-balance ${section.isNote ? 'text-muted-foreground' : 'text-foreground'}`}>
                {section.title}
              </p>
              <div className="flex flex-col gap-1">
                {section.items.map(item => (
                  <label
                    key={item.id}
                    className={`flex items-start gap-2.5 min-h-[2rem] cursor-pointer group ${section.isNote ? 'cursor-default' : ''}`}
                    onClick={section.isNote ? undefined : () => toggle(item.id)}
                  >
                    {!section.isNote && (
                      <span className={`mt-[2px] shrink-0 w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-colors
                        ${checked[item.id]
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-amber-400/60 group-hover:border-amber-500'
                        }`}>
                        {checked[item.id] && <span className="text-[9px] font-bold leading-none">✓</span>}
                      </span>
                    )}
                    {section.isNote && (
                      <span className="mt-[3px] shrink-0 text-amber-500/60">•</span>
                    )}
                    <span className={`text-xs leading-relaxed break-words min-w-0 flex-1
                      ${!section.isNote && checked[item.id] ? 'line-through text-muted-foreground/60' : 'text-foreground/90'}
                      ${section.isNote ? 'text-muted-foreground' : ''}
                    `}>
                      {item.text}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-3.5 pb-2.5">
          <p className="text-[11px] text-amber-600/70 dark:text-amber-400/60 text-pretty">
            {i18n.t('修复完成后，回复「重新构建」即可自动触发 CI 验证。')}</p>
        </div>
      </div>
    </div>
  );
}
