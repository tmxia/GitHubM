
import {
   useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Search,
  Plus,
  Star,
  GitFork,
  Lock,
  Globe,
  Filter,
  SortAsc,
  SortDesc,
  ChevronRight,
  BookOpen,
  RefreshCw,
  ExternalLink,
  Copy,
  GitBranch,
  GitPullRequest,
  Code2,
  Trash2,
  AlertTriangle,
  AlertCircle,
  MoreHorizontal,
  Loader2,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import PullToRefresh from '@/components/common/PullToRefresh';
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
  DialogTrigger,
} from '@/components/ui/dialog';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  getUserRepos,
  createRepo,
  formatRelativeTime,
  formatNumber,
  getLanguageColor,
  getGitignoreTemplates,
  getLicenses,
  starRepo,
  unstarRepo,
  checkStarred,
  forkRepo,
  deleteRepo,
  getRepo,
  createFileContent,
  getRepoSecretPublicKey,
  putRepoSecret,
  dispatchWorkflow,
  updateRepo,
  updateRepoTopics,
  getWorkflowRunStatus,
  getPages,
  enablePages,
  deleteFileContent,
  getFileContent,
  invalidateCache,
  clearApiCache,
} from '@/services/github';
import type { GitHubRepo, RepoSortField, SortDirection } from '@/types/types';
import { toast } from 'sonner';
import { useDebounce } from '@/hooks/use-debounce';
import { pageCache } from '@/lib/page-cache';
import { clearListScroll, readListScroll } from '@/lib/scrollRestore';
import { prefetchRepoDetail } from '@/lib/repoPrefetch';
import { copyToClipboard } from '@/lib/utils';
import sealedbox from 'tweetnacl-sealedbox-js';
import i18n from "@/i18n";

function RepoContextMenu({ repo, onDeleteRequest, onDeleteSuccess }: {
  repo: GitHubRepo;
  onDeleteRequest: () => void;
  onDeleteSuccess: (name: string) => void;
}) {
  const navigate = useNavigate();

  const handleToggleStar = async () => {
    try {
      const starred = await checkStarred(repo.owner.login, repo.name);
      if (starred) {
        await unstarRepo(repo.owner.login, repo.name);
        clearApiCache();
        toast.success(`已取消 ${repo.name} 的 Star`);
      } else {
        await starRepo(repo.owner.login, repo.name);
        clearApiCache();
        toast.success(`已为 ${repo.name} 加 Star ⭐`);
      }
    } catch {
      toast.error(i18n.t('操作失败'));
    }
  };

  const handleFork = async () => {
    try {
      toast.info(i18n.t('正在 Fork 仓库...'));
      await forkRepo(repo.owner.login, repo.name);
      toast.success(i18n.t('Fork 成功！'));
    } catch {
      toast.error(i18n.t('Fork 失败'));
    }
  };

  const handleCopyUrl = () => {
    copyToClipboard(repo.clone_url || repo.html_url);
    toast.success(i18n.t('仓库地址已复制'));
  };

  return (
    <ContextMenuContent className="bg-popover border-border w-52">
      <ContextMenuItem className="text-foreground cursor-pointer text-sm"
        onClick={(e) => { e.stopPropagation(); navigate(`/repos/${repo.full_name}`); }}>
        <BookOpen className="w-3.5 h-3.5 mr-2" />{i18n.t('查看仓库详情')}</ContextMenuItem>
      <ContextMenuItem className="text-foreground cursor-pointer text-sm"
        onClick={(e) => { e.stopPropagation(); navigate(`/repos/${repo.full_name}/code`); }}>
        <Code2 className="w-3.5 h-3.5 mr-2" />{i18n.t('浏览代码')}</ContextMenuItem>
      <ContextMenuItem className="text-foreground cursor-pointer text-sm"
        onClick={(e) => { e.stopPropagation(); navigate(`/repos/${repo.full_name}/commits/${repo.default_branch}`); }}>
        <GitBranch className="w-3.5 h-3.5 mr-2" />{i18n.t('查看提交记录')}</ContextMenuItem>
      <ContextMenuItem className="text-foreground cursor-pointer text-sm"
        onClick={(e) => { e.stopPropagation(); navigate(`/repos/${repo.full_name}/issues`); }}>
        <AlertCircle className="w-3.5 h-3.5 mr-2" />{i18n.t('查看 Issues')}</ContextMenuItem>
      <ContextMenuItem className="text-foreground cursor-pointer text-sm"
        onClick={(e) => { e.stopPropagation(); navigate(`/repos/${repo.full_name}/pulls`); }}>
        <GitPullRequest className="w-3.5 h-3.5 mr-2" />{i18n.t('查看 Pull Requests')}</ContextMenuItem>
      <ContextMenuSeparator className="bg-border" />
      <ContextMenuItem className="text-foreground cursor-pointer text-sm" onClick={(e) => { e.stopPropagation(); handleToggleStar(); }}>
        <Star className="w-3.5 h-3.5 mr-2" />{i18n.t('Star / 取消 Star')}</ContextMenuItem>
      <ContextMenuItem className="text-foreground cursor-pointer text-sm" onClick={(e) => { e.stopPropagation(); handleFork(); }}>
        <GitFork className="w-3.5 h-3.5 mr-2" />{i18n.t('Fork 仓库')}</ContextMenuItem>
      <ContextMenuSeparator className="bg-border" />
      <ContextMenuItem className="text-foreground cursor-pointer text-sm" onClick={(e) => { e.stopPropagation(); handleCopyUrl(); }}>
        <Copy className="w-3.5 h-3.5 mr-2" />{i18n.t('复制仓库地址')}</ContextMenuItem>
      <ContextMenuItem className="text-foreground cursor-pointer text-sm" asChild>
        <a href={repo.html_url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="w-3.5 h-3.5 mr-2" />{i18n.t('在 GitHub 中打开')}</a>
      </ContextMenuItem>
      <ContextMenuSeparator className="bg-border" />
      <ContextMenuItem
        className="text-destructive cursor-pointer text-sm focus:text-destructive"
        onClick={onDeleteRequest}
      >
        <Trash2 className="w-3.5 h-3.5 mr-2" />{i18n.t('删除仓库')}</ContextMenuItem>
    </ContextMenuContent>
  );
}

function RepoDeleteDialog({ repo, open, onOpenChange, onDeleteSuccess }: {
  repo: GitHubRepo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleteSuccess: (name: string) => void;
}) {
  const [confirmName, setConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleOpenChange = (v: boolean) => {
    if (!v) setConfirmName('');
    onOpenChange(v);
  };

  const handleDelete = async () => {
    if (!repo) return;
    if (confirmName !== repo.name) { toast.error(i18n.t('仓库名称不一致')); return; }
    setDeleting(true);
    try {
      await deleteRepo(repo.owner.login, repo.name);
      toast.success(`已删除仓库 ${repo.name}`);
      handleOpenChange(false);
      onDeleteSuccess(repo.name);
    } catch {
      toast.error(i18n.t('删除失败，请确认你有足够权限'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />{i18n.t('删除仓库')}</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground text-sm space-y-2">
            <span>{i18n.t('此操作将永久删除')}</span>
            <code className="font-mono text-foreground bg-secondary px-1.5 py-0.5 rounded text-xs">{repo?.full_name}</code>
            <span>{i18n.t('，包括所有代码、Issues、PR 等，且不可恢复。')}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="px-1 py-2 space-y-1.5">
          <Label className="text-sm font-normal text-foreground">
            {i18n.t('请输入仓库名称')}<code className="font-mono bg-secondary px-1 rounded text-xs">{repo?.name}</code> {i18n.t('确认删除')}</Label>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={repo?.name ?? ''}
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-mono"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-border hover:bg-secondary">{i18n.t('取消')}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleDelete}
            disabled={deleting || confirmName !== (repo?.name ?? '')}
          >
            {deleting ? i18n.t('删除中...') : i18n.t('确认删除')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RepoCardDropdown({ repo, onDeleteRequest, onDeleteSuccess }: { repo: GitHubRepo; onDeleteRequest: () => void; onDeleteSuccess: (name: string) => void }) {
  const navigate = useNavigate();

  const handleToggleStar = async () => {
    try {
      const isStarred = await checkStarred(repo.owner.login, repo.name);
      if (isStarred) {
        await unstarRepo(repo.owner.login, repo.name);
        clearApiCache();
        toast.success(`已取消 ${repo.name} 的 Star`);
      } else {
        await starRepo(repo.owner.login, repo.name);
        clearApiCache();
        toast.success(`已为 ${repo.name} 加 Star ⭐`);
      }
    } catch { toast.error(i18n.t('操作失败')); }
  };

  const handleFork = async () => {
    try {
      toast.info(i18n.t('正在 Fork...'));
      await forkRepo(repo.owner.login, repo.name);
      toast.success(i18n.t('Fork 成功！'));
    } catch { toast.error(i18n.t('Fork 失败')); }
  };

  const handleCopyUrl = () => {
    copyToClipboard(repo.clone_url || repo.html_url);
    toast.success(i18n.t('仓库地址已复制'));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden w-8 h-8 text-muted-foreground hover:bg-secondary shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover border-border w-52">
        <DropdownMenuItem className="text-foreground cursor-pointer text-sm"
          onClick={(e) => { e.stopPropagation(); navigate(`/repos/${repo.full_name}`); }}>
          <BookOpen className="w-3.5 h-3.5 mr-2" />{i18n.t('查看仓库详情')}</DropdownMenuItem>
        <DropdownMenuItem className="text-foreground cursor-pointer text-sm"
          onClick={(e) => { e.stopPropagation(); navigate(`/repos/${repo.full_name}/code`); }}>
          <Code2 className="w-3.5 h-3.5 mr-2" />{i18n.t('浏览代码')}</DropdownMenuItem>
        <DropdownMenuItem className="text-foreground cursor-pointer text-sm"
          onClick={(e) => { e.stopPropagation(); navigate(`/repos/${repo.full_name}/issues`); }}>
          <AlertCircle className="w-3.5 h-3.5 mr-2" />{i18n.t('查看 Issues')}</DropdownMenuItem>
        <DropdownMenuItem className="text-foreground cursor-pointer text-sm"
          onClick={(e) => { e.stopPropagation(); navigate(`/repos/${repo.full_name}/pulls`); }}>
          <GitPullRequest className="w-3.5 h-3.5 mr-2" />{i18n.t('查看 Pull Requests')}</DropdownMenuItem>
        <DropdownMenuSeparator className="bg-border" />
        <DropdownMenuItem className="text-foreground cursor-pointer text-sm" onClick={(e) => { e.stopPropagation(); handleToggleStar(); }}>
          <Star className="w-3.5 h-3.5 mr-2" />{i18n.t('Star / 取消 Star')}</DropdownMenuItem>
        <DropdownMenuItem className="text-foreground cursor-pointer text-sm" onClick={(e) => { e.stopPropagation(); handleFork(); }}>
          <GitFork className="w-3.5 h-3.5 mr-2" />{i18n.t('Fork 仓库')}</DropdownMenuItem>
        <DropdownMenuSeparator className="bg-border" />
        <DropdownMenuItem className="text-foreground cursor-pointer text-sm" onClick={(e) => { e.stopPropagation(); handleCopyUrl(); }}>
          <Copy className="w-3.5 h-3.5 mr-2" />{i18n.t('复制仓库地址')}</DropdownMenuItem>
        <DropdownMenuItem className="text-foreground cursor-pointer text-sm" asChild>
          <a href={repo.html_url} target="_blank" rel="noopener noreferrer"
             onClick={(e) => e.stopPropagation()}>
            <ExternalLink className="w-3.5 h-3.5 mr-2" />{i18n.t('在 GitHub 中打开')}</a>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-border" />
        <DropdownMenuItem
          className="text-destructive cursor-pointer text-sm focus:text-destructive"
          onClick={(e) => { e.stopPropagation(); onDeleteRequest(); }}
        >
          <Trash2 className="w-3.5 h-3.5 mr-2" />{i18n.t('删除仓库')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const REPOS_SORT_PREF = 'repos_sort_pref';

function loadReposSortPref(): RepoSortField {
  try {
    const v = localStorage.getItem(REPOS_SORT_PREF);
    if (v === 'pushed' || v === 'created' || v === 'updated' || v === 'full_name') return v as RepoSortField;
  } catch {}
  return 'pushed' as RepoSortField;
}

function saveReposSortPref(v: RepoSortField): void {
  try { localStorage.setItem(REPOS_SORT_PREF, v); } catch {}
}


async function ensureFreshWorkflow(
  owner: string,
  repo: string,
  branch: string,
  yaml: string,
): Promise<void> {
  const wfPath = '.github/workflows/sync.yml';
  let existingSha = '';
  try {
    const existing = await getFileContent(owner, repo, wfPath, branch);
    existingSha = (existing as { sha?: string }).sha || '';
  } catch { /* 不存在 */ }
  if (existingSha) {
    try {
      await deleteFileContent(owner, repo, wfPath, {
        message: 'chore: remove old workflow for re-index',
        sha: existingSha,
        branch,
      });
      await new Promise((r) => setTimeout(r, 2500));
    } catch { /* 忽略 */ }
  }
  await createFileContent(owner, repo, wfPath, {
    message: 'Setup mirror workflow',
    content: b64EncodeUtf8(yaml),
    branch,
  });
}

async function dispatchWithAutoFix(
  owner: string,
  repo: string,
  branch: string,
  yaml: string,
  maxAttempts = 4,
): Promise<{ ok: boolean; lastError: string }> {
  let lastError = '';
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    try {
      await dispatchWorkflow(owner, repo, 'sync.yml', branch);
      return { ok: true, lastError: '' };
    } catch (e) {
      lastError = e instanceof Error ? e.message : '未知错误';
      
      if (/422|workflow_dispatch|not have|not found/i.test(lastError) && attempt < maxAttempts - 1) {
        try {
          await ensureFreshWorkflow(owner, repo, branch, yaml);
        } catch { /* 忽略 */ }
      }
    }
  }
  return { ok: false, lastError };
}

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

async function inspectToken(token: string): Promise<{
  ok: boolean;
  scopes: string[];
  hasWorkflow: boolean;
  isClassic: boolean;
  login: string;
} | null> {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const scopesHeader = res.headers.get('x-oauth-scopes');
    const isClassic = scopesHeader !== null;
    const scopes = (scopesHeader || '').split(',').map((x) => x.trim()).filter(Boolean);
    const data = await res.json();
    
    const hasWorkflow = isClassic ? scopes.includes('workflow') : true;
    return { ok: true, scopes, hasWorkflow, isClassic, login: data.login };
  } catch {
    return null;
  }
}

async function probeSourcePrivacy(owner: string, repo: string): Promise<boolean | null> {
  try {
    const tk = localStorage.getItem('github_manager_token') || '';
    const headers: Record<string, string> = { 'Accept': 'application/vnd.github+json' };
    if (tk) headers['Authorization'] = `Bearer ${tk}`;
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return !!data.private;
  } catch {
    return null;
  }
}

function makeMirrorYaml(freq: '6h' | '12h' | '1d', scheduled = true, sourceRepo = ''): string {
  const cron = freq === '6h' ? '0 */6 * * *' : freq === '12h' ? '0 */12 * * *' : '0 3 * * *';
  const trigger = scheduled ? `\n  schedule:\n    - cron: '${cron}'` : '';
  const srcComment = sourceRepo ? `# mirror-source: ${sourceRepo}\n# mirror-frequency: ${freq}\n` : '';

  const restoreStep = scheduled ? `
      - name: Restore mirror workflow
        env:
          GH_TOKEN: \${{ secrets.MIRROR_PUSH_TOKEN }}
          WF_B64: \${{ secrets.MIRROR_WORKFLOW_B64 }}
        run: |
          REPO="\${{ github.repository }}"
          BRANCH="\${{ github.event.repository.default_branch }}"
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" \\
            -H "Authorization: Bearer $GH_TOKEN" \\
            "https://api.github.com/repos/$REPO/contents/.github/workflows/sync.yml?ref=$BRANCH")
          if [ "$STATUS" = "200" ]; then
            echo "workflow 已存在，跳过恢复"
            exit 0
          fi
          echo "workflow 缺失，正在恢复..."
          cat > /tmp/restore.json <<JSONEOF
          {"message":"chore: restore mirror workflow","content":"$WF_B64","branch":"$BRANCH"}
          JSONEOF
          curl -sS -X PUT \\
            -H "Authorization: Bearer $GH_TOKEN" \\
            -H "Accept: application/vnd.github+json" \\
            -d @/tmp/restore.json \\
            "https://api.github.com/repos/$REPO/contents/.github/workflows/sync.yml"
` : '';

  return `${srcComment}name: Auto Sync Source

on:
  workflow_dispatch:${trigger}
  push:
    branches: ['__never__']

permissions:
  contents: write

jobs:
  mirror:
    runs-on: ubuntu-latest
    steps:
      - name: Mirror source repo
        env:
          SRC_URL: \${{ secrets.MIRROR_SOURCE_URL }}
          PUSH_TOKEN: \${{ secrets.MIRROR_PUSH_TOKEN }}
          REPO: \${{ github.repository }}
        run: |
          TARGET_URL="https://x-access-token:$PUSH_TOKEN@github.com/$REPO.git"

          # 智能检测 LFS：任何分支的 .gitattributes 含 filter=lfs 即视为使用 LFS
          git clone --bare "$SRC_URL" repo.git
          cd repo.git
          HAS_LFS=0
          if git show HEAD:.gitattributes 2>/dev/null | grep -q "filter=lfs"; then HAS_LFS=1; fi
          if [ "$HAS_LFS" = "0" ]; then
            for br in $(git for-each-ref --format="%(refname:short)" refs/heads/); do
              if git show "$br:.gitattributes" 2>/dev/null | grep -q "filter=lfs"; then HAS_LFS=1; break; fi
            done
          fi

          if [ "$HAS_LFS" = "1" ]; then
            echo "🔍 检测到 Git LFS，启用 LFS 镜像流程"
            git lfs install --local --skip-smudge >/dev/null 2>&1 || true
            git lfs fetch --all origin 2>&1 || echo "⚠️ LFS fetch 失败，继续"
          else
            echo "✅ 未使用 Git LFS，普通镜像流程"
          fi

          # 显式 refspec：只覆盖同名分支/tags，不删除目标多余 refs
          git push --force "$TARGET_URL" \
            "refs/heads/*:refs/heads/*" \
            "refs/tags/*:refs/tags/*"

          if [ "$HAS_LFS" = "1" ]; then
            echo "📤 推送 LFS 对象..."
            git lfs push --all "$TARGET_URL" 2>&1 || echo "⚠️ LFS push 失败"
          fi

          SRC_DEFAULT=$(git symbolic-ref HEAD 2>/dev/null | sed 's|refs/heads/||' | tr -d '[:space:]')
          [ -z "$SRC_DEFAULT" ] && SRC_DEFAULT=main
          echo "源默认分支: $SRC_DEFAULT"
          CUR_DEFAULT="\${{ github.event.repository.default_branch }}"
          if [ "$SRC_DEFAULT" != "$CUR_DEFAULT" ]; then
            echo "切换目标默认分支: $CUR_DEFAULT -> $SRC_DEFAULT"
            curl -sS -X PATCH \\
              -H "Authorization: Bearer $PUSH_TOKEN" \\
              -H "Accept: application/vnd.github+json" \\
              -d "{\\"default_branch\\":\\"$SRC_DEFAULT\\"}" \\
              "https://api.github.com/repos/$REPO"
          fi
${restoreStep}`;
}

export default function ReposPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [sortField, setSortField] = useState<RepoSortField>(() => loadReposSortPref());
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [typeFilter, setTypeFilter] = useState<'all' | 'owner' | 'member' | 'public' | 'private'>('all');
  const REPOS_SCROLL_KEY = `repos:scroll:${sortField}:${typeFilter}`;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<GitHubRepo | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDesc, setNewRepoDesc] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [newRepoAutoInit, setNewRepoAutoInit] = useState(true);
  const [newRepoGitignore, setNewRepoGitignore] = useState('');
  const [newRepoLicense, setNewRepoLicense] = useState('');
  const [createMode, setCreateMode] = useState<'blank' | 'clone'>('blank');
  const [mirrorMode, setMirrorMode] = useState(false);
  const [keepForkMark, setKeepForkMark] = useState(false);
  const [copySource, setCopySource] = useState('');
  const [mirrorToken, setMirrorToken] = useState('');
  const [pushToken, setPushToken] = useState('');
  const [pushTokenInfo, setPushTokenInfo] = useState<{ ok: boolean; hasWorkflow: boolean; login: string; isClassic: boolean } | null>(null);
  const [checkingPush, setCheckingPush] = useState(false);
  const [autoFilledPush, setAutoFilledPush] = useState(false);
  const [mirrorFreq, setMirrorFreq] = useState<'6h' | '12h' | '1d'>('6h');
  const [sourceIsPrivate, setSourceIsPrivate] = useState<boolean | null>(null);
  const lastAutoFilledName = useRef('');
  const [probingSource, setProbingSource] = useState(false);
  const [gitignoreTemplates, setGitignoreTemplates] = useState<string[]>([]);
  const [licenses, setLicenses] = useState<Array<{ key: string; name: string }>>([]);
  const [creating, setCreating] = useState(false);

  
  const loadRepos = useCallback(async (pageNum = 1, append = false, force = false) => {
    
    if (force) {
      invalidateCache('/user/repos');
      pageCache.invalidate('repos:');
    }

    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);

    const cacheKey = `repos:${sortField}:${sortDirection}:${typeFilter}:p1`;
    if (pageNum === 1 && !append && !force) {
      const cached = pageCache.get<{ repos: GitHubRepo[]; hasNextPage: boolean }>(cacheKey);
      if (cached) {
        setRepos(cached.repos);
        setHasNextPage(cached.hasNextPage);
        setPage(1);
        setLoading(false);
        return;
      }
    }

    try {
      const result = await getUserRepos({
        sort: sortField,
        direction: sortDirection,
        per_page: 100,
        page: pageNum,
        type: typeFilter,
      });
      if (append) {
        setRepos((prev) => [...prev, ...result.data]);
      } else {
        setRepos(result.data);
        pageCache.set(cacheKey, { repos: result.data, hasNextPage: result.hasNextPage });
      }
      setHasNextPage(result.hasNextPage);
      setPage(pageNum);
    } catch (err) {
      toast.error(i18n.t('加载仓库列表失败'));
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [sortField, sortDirection, typeFilter]);

  useEffect(() => {
    loadRepos(1, false);
  }, [loadRepos]);

  const restoredRef = useRef(false);
  useEffect(() => {
    if (loading || repos.length === 0 || restoredRef.current) return;
    restoredRef.current = true;
    const y = readListScroll(REPOS_SCROLL_KEY);
    if (y <= 0) return;
    let attempts = 0;
    const tryScroll = () => {
      window.scrollTo(0, y);
      document.documentElement.scrollTop = y;
      document.body.scrollTop = y;
      const actual = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      if (Math.abs(actual - y) <= 2 || attempts >= 60) {
        clearListScroll(REPOS_SCROLL_KEY);
      } else {
        attempts++;
        setTimeout(tryScroll, 30);
      }
    };
    setTimeout(tryScroll, 50);
  }, [loading, repos.length]);

  useEffect(() => {
    if (!createDialogOpen) return;
    Promise.all([getGitignoreTemplates(), getLicenses()])
      .then(([templates, licenseList]) => {
        setGitignoreTemplates(templates);
        setLicenses(licenseList);
      })
      .catch(console.error);
  }, [createDialogOpen]);

  const filteredRepos = repos.filter((repo) =>
    debouncedSearch
      ? repo.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (repo.description || '').toLowerCase().includes(debouncedSearch.toLowerCase())
      : true
  );

  const resetCreateForm = () => {
    setNewRepoName('');
    setNewRepoDesc('');
    setNewRepoPrivate(false);
    setNewRepoAutoInit(true);
    setNewRepoGitignore('');
    setNewRepoLicense('');
    setCopySource('');
    setMirrorToken('');
    setPushToken('');
    setPushTokenInfo(null);
    setAutoFilledPush(false);
    setMirrorFreq('6h');
    setMirrorMode(false);
    setKeepForkMark(false);
    setSourceIsPrivate(null);
    setProbingSource(false);
    lastAutoFilledName.current = '';
    setCreateMode('blank');
  };

  const handleCreateRepo = async () => {
    
    const willCreateNew = createMode === 'blank' || (createMode === 'clone' && !keepForkMark);
    if (willCreateNew && newRepoName.trim()) {
      const login = currentUser?.login;
      if (login) {
        try {
          await getRepo(login, newRepoName.trim());
          toast.error(
            i18n.t('仓库') + ` ${login}/${newRepoName.trim()} ` + i18n.t('已存在，请换一个名称')
          );
          return;
        } catch {
          // 404 = 不存在，继续；其他错误也继续（让 GitHub 处理）
        }
      }
    }
    
    if (createMode === 'clone') {
      const src = copySource.trim();
      if (!src.includes('/')) { toast.error(i18n.t('源仓库格式：owner/repo')); return; }
      const [srcOwner, srcRepo] = src.split('/');
      if (!srcOwner || !srcRepo) { toast.error(i18n.t('源仓库格式错误')); return; }

      
      if (!mirrorMode && keepForkMark) {
        setCreating(true);
        try {
          const forked = await forkRepo(srcOwner, srcRepo, newRepoName.trim() || undefined);
          toast.success(i18n.t('复刻成功') + `：${forked.full_name}`);
          setCreateDialogOpen(false);
          resetCreateForm();
          pageCache.invalidate('repos:');
          loadRepos(1, false, true);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : i18n.t('复刻失败'));
        } finally {
          setCreating(false);
        }
        return;
      }

      
      if (!newRepoName.trim()) { toast.error(i18n.t('请输入仓库名称')); return; }
      if (sourceIsPrivate === true && !mirrorToken.trim()) { toast.error(i18n.t('该源仓库为私有，必须填写 Token')); return; }
      if (mirrorMode && !pushToken.trim()) { toast.error(i18n.t('持续镜像需要推送 Token')); return; }
      setCreating(true);
      try {
        
        const srcInfo = await getRepo(srcOwner, srcRepo).catch(() => null);
        const srcDefault = srcInfo?.default_branch || 'main';

        const created = await createRepo({
          name: newRepoName.trim(),
          description: srcInfo?.description || newRepoDesc.trim() || undefined,
          private: newRepoPrivate,
          auto_init: false,
        });
        const [login, repoNameNew] = created.full_name.split('/');

        
        if (srcInfo) {
          await updateRepo(login, repoNameNew, {
            description: srcInfo.description || '',
            homepage: srcInfo.homepage || '',
          }).catch(() => {});
          if (srcInfo.topics && srcInfo.topics.length > 0) {
            await updateRepoTopics(login, repoNameNew, srcInfo.topics).catch(() => {});
          }
        }

        await new Promise((r) => setTimeout(r, 5000));

        const yaml = makeMirrorYaml(mirrorFreq, mirrorMode, src);
        
        await ensureFreshWorkflow(login, repoNameNew, srcDefault, yaml);

        const pub = await getRepoSecretPublicKey(login, repoNameNew);
        const tok = mirrorToken.trim();
        const srcUrl = tok
          ? `https://x-access-token:${tok}@github.com/${src}.git`
          : `https://github.com/${src}.git`;
        const encSrc = encryptSecretValue(srcUrl, pub.key);
        await putRepoSecret(login, repoNameNew, 'MIRROR_SOURCE_URL', encSrc, pub.key_id);

        const pushTok = pushToken.trim() || (localStorage.getItem('github_manager_token') || '');
        if (!pushTok) throw new Error(i18n.t('请填写推送 Token（需要有 workflow 权限）'));
        const encPush = encryptSecretValue(pushTok, pub.key);
        await putRepoSecret(login, repoNameNew, 'MIRROR_PUSH_TOKEN', encPush, pub.key_id);

        const encWf = encryptSecretValue(b64EncodeUtf8(yaml), pub.key);
        await putRepoSecret(login, repoNameNew, 'MIRROR_WORKFLOW_B64', encWf, pub.key_id);

        
        const dispatchRef = srcDefault;
        const dispatchResult = await dispatchWithAutoFix(login, repoNameNew, dispatchRef, yaml);
        if (!dispatchResult.ok) {
          toast.warning(i18n.t('触发同步失败：') + dispatchResult.lastError);
        }

        
        try {
          const srcPages = await getPages(srcOwner, srcRepo).catch(() => null);
          if (srcPages) {
            const enabled = (srcPages as { html_url?: string }).html_url;
            if (enabled) {
              await new Promise((r) => setTimeout(r, 2000));
              const buildType = (srcPages as { build_type?: 'legacy' | 'workflow' }).build_type || 'legacy';
              if (buildType === 'workflow') {
                await enablePages(login, repoNameNew, { build_type: 'workflow' });
              } else {
                const src = (srcPages as { source?: { branch: string; path?: '/' | '/docs' } }).source;
                if (src?.branch) {
                  await enablePages(login, repoNameNew, {
                    branch: src.branch,
                    path: (src.path === '/docs' ? '/docs' : '/'),
                  });
                }
              }
              toast.success(i18n.t('已自动配置 GitHub Pages'));
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : '未知错误';
          toast.warning(i18n.t('Pages 配置同步失败：') + msg);
        }

        
        
        let lastRun: { conclusion: string | null; status: string; html_url: string } | null = null;
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          lastRun = await getWorkflowRunStatus(login, repoNameNew, 'sync.yml');
          if (lastRun?.status === 'completed') break;
        }

        if (lastRun?.status === 'completed') {
          if (lastRun.conclusion === 'success') {
            toast.success(mirrorMode ? i18n.t('镜像复制完成') : i18n.t('复制完成'));
          } else {
            toast.error(i18n.t('同步失败，请去 Actions 页面查看'));
          }
        }
        

        setCreateDialogOpen(false);
        resetCreateForm();
        pageCache.invalidate('repos:');
        loadRepos(1, false, true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : i18n.t('创建失败'));
      } finally {
        setCreating(false);
      }
      return;
    }

    
    if (!newRepoName.trim()) { toast.error(i18n.t('请输入仓库名称')); return; }
    setCreating(true);
    try {
      const newRepo = await createRepo({
        name: newRepoName.trim(),
        description: newRepoDesc.trim() || undefined,
        private: newRepoPrivate,
        auto_init: newRepoAutoInit,
        gitignore_template: newRepoGitignore || undefined,
        license_template: newRepoLicense || undefined,
      });
      toast.success(`仓库 ${newRepo.name} 创建成功！`);
      setCreateDialogOpen(false);
      resetCreateForm();
      pageCache.invalidate('repos:');
      loadRepos(1, false, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('创建仓库失败'));
    } finally {
      setCreating(false);
    }
  };

  const canSubmit = () => {
    if (createMode === 'blank') return !!newRepoName.trim();
    if (createMode === 'clone') {
      if (!copySource.includes('/')) return false;
      if (!mirrorMode && keepForkMark) return true;
      if (sourceIsPrivate === true && !mirrorToken.trim()) return false;
      return !!newRepoName.trim();
    }
    return false;
  };

  const submitLabel = () => {
    if (createMode === 'blank') return i18n.t('创建仓库');
    if (createMode === 'clone') {
      if (mirrorMode) return i18n.t('创建镜像');
      if (keepForkMark) return i18n.t('复刻');
      return i18n.t('复制');
    }
    return i18n.t('创建');
  };

  
  useEffect(() => {
    if (!mirrorMode) { setAutoFilledPush(false); return; }
    if (pushToken.trim()) return;  

    const loginPat = typeof localStorage !== 'undefined'
      ? (localStorage.getItem('github_manager_token') || '') : '';
    if (!loginPat) return;

    let alive = true;
    setCheckingPush(true);
    inspectToken(loginPat).then((result) => {
      if (!alive) return;
      if (result?.ok && result.hasWorkflow) {
        setPushToken(loginPat);
        setPushTokenInfo(result);
        setAutoFilledPush(true);
      } else if (result) {
        setPushTokenInfo(result);
      }
      setCheckingPush(false);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mirrorMode]);

  
  useEffect(() => {
    const tok = pushToken.trim();
    if (!tok) { setPushTokenInfo(null); setAutoFilledPush(false); return; }
    
    if (autoFilledPush) return;

    let alive = true;
    setCheckingPush(true);
    const t = setTimeout(async () => {
      const result = await inspectToken(tok);
      if (alive) {
        setPushTokenInfo(result);
        setCheckingPush(false);
      }
    }, 600);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushToken]);

  
  useEffect(() => {
    if (createMode !== 'clone' || (!mirrorMode && keepForkMark)) {
      setSourceIsPrivate(null); setProbingSource(false); return;
    }
    const src = copySource.trim();
    if (!src.includes('/')) { setSourceIsPrivate(null); setProbingSource(false); return; }
    const [o, r] = src.split('/');
    if (!o || !r) { setSourceIsPrivate(null); setProbingSource(false); return; }
    let alive = true;
    setProbingSource(true);
    const t = setTimeout(async () => {
      const result = await probeSourcePrivacy(o, r);
      if (alive) { setSourceIsPrivate(result); setProbingSource(false); }
    }, 500);
    return () => { alive = false; clearTimeout(t); };
  }, [copySource, createMode, mirrorMode, keepForkMark]);

  
  useEffect(() => {
    if (createMode !== 'clone') return;
    if (!mirrorMode && keepForkMark) return;
    const src = copySource.trim();
    if (!src.includes('/')) return;
    const [, r] = src.split('/');
    if (!r) return;
    if (!newRepoName || newRepoName === lastAutoFilledName.current) {
      setNewRepoName(r);
      lastAutoFilledName.current = r;
    }
  }, [copySource, createMode, mirrorMode, keepForkMark]);
;

  return (
    <PullToRefresh onRefresh={() => loadRepos(1, false, true)}>
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{i18n.t('仓库')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{i18n.t('管理您的 GitHub 仓库')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:bg-secondary"
            onClick={() => loadRepos(1, false, true)}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" />
                <span className="hidden md:inline">{i18n.t('新建仓库')}</span>
                <span className="md:hidden">{i18n.t('新建')}</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border p-0 gap-0 flex flex-col h-[560px] max-h-[85vh]">
              <DialogHeader className="px-6 pt-5 pb-3 border-b border-border shrink-0">
                <DialogTitle className="text-foreground">{i18n.t('创建新仓库')}</DialogTitle>
              </DialogHeader>

              <Tabs value={createMode} onValueChange={(v) => setCreateMode(v as 'blank' | 'clone')} className="flex flex-col flex-1 min-h-0">
                <TabsList className="grid grid-cols-2 mx-6 mt-4 shrink-0 bg-secondary">
                  <TabsTrigger value="blank">{i18n.t('空白')}</TabsTrigger>
                  <TabsTrigger value="clone">{i18n.t('复制 / 镜像')}</TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
                  {/* ── 空白 ── */}
                  <TabsContent value="blank" className="space-y-4 mt-0">
                    <div className="space-y-1">
                      <Label className="text-sm font-normal text-foreground">{i18n.t('仓库名称 *')}</Label>
                      <Input value={newRepoName} onChange={(e) => setNewRepoName(e.target.value)} placeholder="my-awesome-project" className="bg-secondary border-border text-foreground placeholder:text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm font-normal text-foreground">{i18n.t('描述（可选）')}</Label>
                      <Textarea value={newRepoDesc} onChange={(e) => setNewRepoDesc(e.target.value)} placeholder={i18n.t('项目简介...')} className="bg-secondary border-border text-foreground placeholder:text-muted-foreground resize-none" rows={2} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-normal text-foreground">{i18n.t('私有仓库')}</Label>
                        <p className="text-xs text-muted-foreground">{i18n.t('只有您有权访问此仓库')}</p>
                      </div>
                      <Switch checked={newRepoPrivate} onCheckedChange={setNewRepoPrivate} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-normal text-foreground">{i18n.t('初始化 README')}</Label>
                        <p className="text-xs text-muted-foreground">{i18n.t('自动创建 README 文件')}</p>
                      </div>
                      <Switch checked={newRepoAutoInit} onCheckedChange={setNewRepoAutoInit} />
                    </div>
                    {newRepoAutoInit && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-sm font-normal text-foreground">{i18n.t('.gitignore')}</Label>
                          <Select value={newRepoGitignore} onValueChange={setNewRepoGitignore}>
                            <SelectTrigger className="bg-secondary border-border text-foreground h-9"><SelectValue placeholder={i18n.t('选择模板')} /></SelectTrigger>
                            <SelectContent className="bg-popover border-border max-h-48">
                              <SelectItem value="none" className="text-foreground">{i18n.t('无')}</SelectItem>
                              {gitignoreTemplates.map((t) => <SelectItem key={t} value={t} className="text-foreground">{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-sm font-normal text-foreground">{i18n.t('许可证')}</Label>
                          <Select value={newRepoLicense} onValueChange={setNewRepoLicense}>
                            <SelectTrigger className="bg-secondary border-border text-foreground h-9"><SelectValue placeholder={i18n.t('选择许可证')} /></SelectTrigger>
                            <SelectContent className="bg-popover border-border max-h-48">
                              <SelectItem value="none" className="text-foreground">{i18n.t('无')}</SelectItem>
                              {licenses.map((l) => <SelectItem key={l.key} value={l.key} className="text-foreground">{l.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {/* ── 复制 / 镜像 ── */}
                  <TabsContent value="clone" className="space-y-4 mt-0">
                    <div className="space-y-1">
                      <Label className="text-sm font-normal text-foreground">{i18n.t('源仓库 *')}</Label>
                      <Input value={copySource} onChange={(e) => setCopySource(e.target.value)} placeholder="owner/repo" className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-mono" />
                      <p className="text-xs text-muted-foreground">{i18n.t('支持 GitHub 仓库，格式：owner/repo')}</p>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-normal text-foreground">{i18n.t('持续镜像')}</Label>
                        <p className="text-xs text-muted-foreground">{i18n.t('开启后定时同步源仓库；关闭仅复制一次')}</p>
                      </div>
                      <Switch checked={mirrorMode} onCheckedChange={(v) => { setMirrorMode(v); if (v) setKeepForkMark(false); }} />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className={`text-sm font-normal ${mirrorMode ? 'text-muted-foreground' : 'text-foreground'}`}>{i18n.t('保留 Fork 标记')}</Label>
                        <p className="text-xs text-muted-foreground">{i18n.t('开启后 GitHub 显示 "forked from" 标记；关闭则干净复制')}</p>
                      </div>
                      <Switch checked={keepForkMark} onCheckedChange={setKeepForkMark} disabled={mirrorMode} />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-sm font-normal text-foreground">{i18n.t('新仓库名')}{(!mirrorMode && keepForkMark) ? '' : ' *'}</Label>
                      <Input value={newRepoName} onChange={(e) => setNewRepoName(e.target.value)} placeholder={(!mirrorMode && keepForkMark) ? i18n.t('留空则继承源仓库名') : 'my-mirror'} className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-mono" />
                    </div>

                    {(mirrorMode || !keepForkMark) && (
                      <>
                        {probingSource && copySource.includes('/') && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />{i18n.t('正在识别源仓库可见性...')}
                          </p>
                        )}
                        {!probingSource && sourceIsPrivate === false && copySource.includes('/') && (
                          <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                            <Check className="w-3 h-3" />{i18n.t('已识别为公开仓库，无需 Token')}
                          </p>
                        )}
                        {sourceIsPrivate !== false && !probingSource && (
                          <div className="space-y-1">
                            <Label className="text-sm font-normal text-foreground">
                              {i18n.t('源仓库 Token')}{sourceIsPrivate === true ? ' *' : ''}
                            </Label>
                            <Input value={mirrorToken} onChange={(e) => setMirrorToken(e.target.value)} type="password" placeholder="ghp_xxxxxxxxxxxx" className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-mono" />
                            <p className="text-xs text-muted-foreground">
                              {sourceIsPrivate === true
                                ? i18n.t('该源仓库为私有，必须填写有 repo 权限的 Token')
                                : i18n.t('未能识别源仓库（可能私有），私有仓库需填 Token')}
                            </p>
                          </div>
                        )}
                      </>
                    )}

                    {mirrorMode && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-sm font-normal text-foreground">{i18n.t('推送 Token *')}</Label>
                          <Input value={pushToken} onChange={(e) => setPushToken(e.target.value)} type="password" placeholder="ghp_xxxxxxxxxxxx" className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-mono" />
                          {checkingPush && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />{i18n.t('正在验证 Token 权限...')}
                            </p>
                          )}
                          {!checkingPush && pushTokenInfo?.ok && pushTokenInfo.hasWorkflow && (
                            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              {autoFilledPush
                                ? i18n.t('已自动使用登录 Token（具备 workflow 权限）')
                                : i18n.t('Token 有效，具备 workflow 权限')}
                            </p>
                          )}
                          {!checkingPush && pushTokenInfo?.ok && !pushTokenInfo.hasWorkflow && (
                            <p className="text-xs text-yellow-600 dark:text-yellow-500 flex items-start gap-1">
                              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                              <span>{i18n.t('Token 缺少 workflow 权限，恢复 workflow 步骤会失败。请去 GitHub 重新生成带 workflow 的 Token')}</span>
                            </p>
                          )}
                          {!checkingPush && pushToken.trim() && !pushTokenInfo && (
                            <p className="text-xs text-destructive flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />{i18n.t('Token 无效或验证失败')}
                            </p>
                          )}
                          {!checkingPush && !pushToken.trim() && (
                            <p className="text-xs text-muted-foreground">{i18n.t('必须有 repo + workflow 权限，用于推送镜像和恢复 workflow 文件')}</p>
                          )}
                        </div>
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
                      </>
                    )}

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-normal text-foreground">{i18n.t('私有仓库')}</Label>
                        <p className="text-xs text-muted-foreground">
                          {mirrorMode ? i18n.t('镜像通常设为私有') : keepForkMark ? i18n.t('复刻后默认公开') : i18n.t('复制后按需设置')}
                        </p>
                      </div>
                      <Switch checked={newRepoPrivate} onCheckedChange={setNewRepoPrivate} />
                    </div>

                    {!mirrorMode && keepForkMark && (
                      <p className="text-xs text-muted-foreground">{i18n.t('复刻通过 Fork API 秒级完成；如需去除标记，关闭上方开关走复制流程')}</p>
                    )}
                  </TabsContent>
                </div>
              </Tabs>

              <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
                <Button variant="outline" className="flex-1 border-border hover:bg-secondary" onClick={() => setCreateDialogOpen(false)} disabled={creating}>
                  {i18n.t('取消')}
                </Button>
                <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleCreateRepo} disabled={creating || !canSubmit()}>
                  {creating ? i18n.t('创建中...') : submitLabel()}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={i18n.t('搜索仓库...')}
            className="pl-9 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex gap-2 shrink-0">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
            <SelectTrigger className="bg-secondary border-border text-foreground w-28 h-10">
              <Filter className="w-3 h-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all" className="text-foreground">{i18n.t('全部')}</SelectItem>
              <SelectItem value="owner" className="text-foreground">{i18n.t('我的')}</SelectItem>
              <SelectItem value="public" className="text-foreground">{i18n.t('公开')}</SelectItem>
              <SelectItem value="private" className="text-foreground">{i18n.t('私有')}</SelectItem>
              <SelectItem value="member" className="text-foreground">{i18n.t('参与的')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortField} onValueChange={(v) => { const nv = v as RepoSortField; setSortField(nv); saveReposSortPref(nv); }}>
            <SelectTrigger className="bg-secondary border-border text-foreground w-28 h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="pushed" className="text-foreground">{i18n.t('最近推送')}</SelectItem>
              <SelectItem value="updated" className="text-foreground">{i18n.t('最近更新')}</SelectItem>
              <SelectItem value="created" className="text-foreground">{i18n.t('创建时间')}</SelectItem>
              <SelectItem value="full_name" className="text-foreground">{i18n.t('名称')}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="border-border hover:bg-secondary h-10 w-10"
            onClick={() => setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')}
          >
            {sortDirection === 'desc' ? <SortDesc className="w-4 h-4" /> : <SortAsc className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div className="space-y-0 bg-card border border-border rounded-lg overflow-hidden">
        {loading && repos.length === 0 ? (
          <div className="divide-y divide-border">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-4">
                <Skeleton className="h-5 w-48 bg-muted mb-2" />
                <Skeleton className="h-4 w-full bg-muted mb-2" />
                <Skeleton className="h-4 w-32 bg-muted" />
              </div>
            ))}
          </div>
        ) : filteredRepos.length === 0 ? (
          <div className="py-16 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium">{i18n.t('暂无仓库')}</p>
            <p className="text-muted-foreground text-sm mt-1">
              {searchQuery ? i18n.t('没有找到匹配的仓库') : i18n.t('创建您的第一个仓库')}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredRepos.map((repo) => (
              <ContextMenu key={repo.id}>
                <ContextMenuTrigger asChild>
                  <div
                    role="button"
                    tabIndex={0}
                    className="cv-auto w-full p-4 hover:bg-secondary/50 transition-colors text-left group cursor-pointer"
                    onClick={() => navigate(`/repos/${repo.full_name}`)}
                    onTouchStart={() => {
                      const isOwner = !!(currentUser && repo.owner.login.toLowerCase() === currentUser.login.toLowerCase());
                      prefetchRepoDetail(repo.owner.login, repo.name, isOwner);
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/repos/${repo.full_name}`); }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-semibold text-accent group-hover:underline truncate min-w-0">
                            {currentUser && repo.owner.login.toLowerCase() !== currentUser.login.toLowerCase() && (
                              <>
                                <span className="text-muted-foreground font-normal">{repo.owner.login}</span>
                                <span className="text-muted-foreground font-normal mx-1">/</span>
                              </>
                            )}
                            {repo.name}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-xs h-4 px-1.5 border-border text-muted-foreground shrink-0"
                          >
                            {repo.private ? (
                              <><Lock className="w-2.5 h-2.5 mr-0.5" />{i18n.t('私有')}</>
                            ) : (
                              <><Globe className="w-2.5 h-2.5 mr-0.5" />{i18n.t('公开')}</>
                            )}
                          </Badge>
                          {repo.fork && (
                            <Badge variant="outline" className="text-xs h-4 px-1.5 border-border text-muted-foreground">
                              Fork
                            </Badge>
                          )}
                          {repo.archived && (
                            <Badge variant="outline" className="text-xs h-4 px-1.5 border-border text-muted-foreground">
                              {i18n.t('已归档')}</Badge>
                          )}
                        </div>
                        {repo.description && (
                          <p className="text-sm text-muted-foreground mt-1 text-pretty line-clamp-2">
                            {repo.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                          {repo.language && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: getLanguageColor(repo.language) }}
                              />
                              {repo.language}
                            </span>
                          )}
                          {repo.stargazers_count > 0 && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Star className="w-3 h-3" />
                              {formatNumber(repo.stargazers_count)}
                            </span>
                          )}
                          {repo.forks_count > 0 && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <GitFork className="w-3 h-3" />
                              {formatNumber(repo.forks_count)}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(repo.pushed_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                        <RepoCardDropdown
                          repo={repo}
                          onDeleteRequest={() => {
                            setDeleteTarget(repo);
                            setDeleteDialogOpen(true);
                          }}
                          onDeleteSuccess={(name) => {
                            setRepos(prev => prev.filter(r => r.name !== name));
                            pageCache.invalidate('repos:');
                            loadRepos(1, false, true);
                          }}
                        />
                        <ChevronRight className="w-4 h-4 text-muted-foreground hidden md:block group-hover:text-foreground transition-colors" />
                      </div>
                    </div>
                  </div>
                </ContextMenuTrigger>
                <RepoContextMenu
                  repo={repo}
                  onDeleteRequest={() => {
                    setDeleteTarget(repo);
                    setDeleteDialogOpen(true);
                  }}
                  onDeleteSuccess={(name) => {
                    setRepos(prev => prev.filter(r => r.name !== name));
                    pageCache.invalidate('repos:');
                    loadRepos(1, false, true);
                  }}
                />
              </ContextMenu>
            ))}
          </div>
        )}
      </div>

      {hasNextPage && !loading && !searchQuery && (
        <div className="text-center">
          <Button
            variant="outline"
            className="border-border hover:bg-secondary"
            onClick={() => loadRepos(page + 1, true)}
            disabled={loadingMore}
          >
            {loadingMore ? i18n.t('加载中...') : i18n.t('加载更多')}
          </Button>
        </div>
      )}

      <RepoDeleteDialog
        repo={deleteTarget}
        open={deleteDialogOpen}
        onOpenChange={(v) => {
          setDeleteDialogOpen(v);
          if (!v) setDeleteTarget(null);
        }}
        onDeleteSuccess={(name) => {
          setRepos(prev => prev.filter(r => r.name !== name));
          pageCache.invalidate('repos:');
          loadRepos(1, false, true);
        }}
      />
    </div>
    </PullToRefresh>
  );
}
