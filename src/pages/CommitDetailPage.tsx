

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Copy, ExternalLink, FileText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserLink } from '@/components/common/UserLink';
import { getCommit, formatRelativeTime } from '@/services/github';
import { openExternalUrl } from '@/lib/open-external';
import { copyToClipboard } from '@/lib/utils';
import type { GitHubCommit, GitHubFile } from '@/types/types';
import { toast } from 'sonner';
import i18n from '@/i18n';

const SHORT_SHA_LENGTH = 7;
const shortSha = (sha: string) => (sha || '').substring(0, SHORT_SHA_LENGTH);

function PatchBlock({ patch }: { patch: string }) {
  const lines = patch.split('\n');
  return (
    <pre className="overflow-x-auto text-[11px] leading-5 font-mono bg-secondary/40 rounded-lg p-3">
      {lines.map((line, index) => {
        let cls = 'text-muted-foreground';
        if (line.startsWith('+') && !line.startsWith('+++')) {
          cls = 'text-emerald-600 dark:text-emerald-400';
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          cls = 'text-red-600 dark:text-red-400';
        } else if (line.startsWith('@@')) {
          cls = 'text-primary';
        }
        return (
          <div key={index} className={cls}>
            {line === '' ? ' ' : line}
          </div>
        );
      })}
    </pre>
  );
}

function FileCard({ file }: { file: GitHubFile }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        className="w-full px-4 py-3 flex items-center gap-2 text-left"
        onClick={() => setOpen((prev) => !prev)}
      >
        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="flex-1 min-w-0 truncate font-mono text-xs text-foreground">{file.filename}</span>
        <Badge variant="secondary" className="shrink-0 text-[10px]">{file.status}</Badge>
        <span className="shrink-0 text-[11px] font-mono">
          <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>{' '}
          <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
        </span>
      </button>
      {open && file.patch ? (
        <div className="px-3 pb-3">
          <PatchBlock patch={file.patch} />
        </div>
      ) : null}
      {open && !file.patch ? (
        <div className="px-4 pb-3 text-xs text-muted-foreground">
          {i18n.t('该文件差异过大，请在 GitHub 查看')}
        </div>
      ) : null}
    </div>
  );
}

export default function CommitDetailPage() {
  const { owner, repo, sha } = useParams<{ owner: string; repo: string; sha: string }>();
  const navigate = useNavigate();
  const [commit, setCommit] = useState<GitHubCommit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!owner || !repo || !sha) {
      setLoading(false);
      setError(i18n.t('缺少必要的提交参数'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getCommit(owner, repo, sha);
      setCommit(data);
    } catch (err) {
      console.error(err);
      setError(i18n.t('加载提交详情失败'));
    } finally {
      setLoading(false);
    }
  }, [owner, repo, sha]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  const messageParts = useMemo(() => {
    const message = commit?.commit?.message || '';
    const [subject, ...rest] = message.split('\n');
    return { subject, body: rest.join('\n').trim() };
  }, [commit]);

  const totals = useMemo(() => {
    if (!commit) return null;
    const files = commit.files || [];
    const additions = commit.stats?.additions ?? files.reduce((sum, file) => sum + file.additions, 0);
    const deletions = commit.stats?.deletions ?? files.reduce((sum, file) => sum + file.deletions, 0);
    return { additions, deletions, files: files.length };
  }, [commit]);

  const displaySha = useMemo(() => shortSha(commit?.sha ?? ''), [commit?.sha]);

  const handleCopySha = useCallback(async () => {
    if (!displaySha) return;
    const ok = await copyToClipboard(displaySha);
    if (!ok) {
      toast.error(i18n.t('复制失败'));
      return;
    }
    toast.success(i18n.t('已复制 SHA'));
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      copyTimerRef.current = null;
      setCopied(false);
    }, 1500);
  }, [displaySha]);

  const handleBack = () => {
    if (owner && repo) {
      navigate(`/repos/${owner}/${repo}/commits`);
      return;
    }
    navigate(-1);
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-6 w-1/3 bg-muted" />
        <Skeleton className="h-24 w-full bg-muted rounded-xl" />
        <Skeleton className="h-16 w-full bg-muted rounded-xl" />
      </div>
    );
  }

  if (error || !commit) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">{error || i18n.t('提交不存在')}</p>
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={handleBack}>{i18n.t('返回')}</Button>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" />
            {i18n.t('重试')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 px-2 gap-1.5" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4" />
          {i18n.t('提交历史')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 gap-1.5 ml-auto"
          title={commit.html_url}
          onClick={() => openExternalUrl(commit.html_url)}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          {i18n.t('打开')}
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h1 className="text-base font-semibold text-foreground break-words">{messageParts.subject}</h1>
        {messageParts.body ? (
          <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground font-sans">
            {messageParts.body}
          </pre>
        ) : null}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {commit.author ? (
            <>
              <UserLink login={commit.author.login} className="inline-flex shrink-0 items-center">
                <Avatar className="w-5 h-5">
                  <AvatarImage src={commit.author.avatar_url} alt={commit.author.login} />
                  <AvatarFallback>{commit.author.login?.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
              </UserLink>
              <UserLink login={commit.author.login} className="text-xs">
                {commit.author.login}
              </UserLink>
            </>
          ) : (
            <span>{commit.commit.author?.name || i18n.t('未知作者')}</span>
          )}
          <span>·</span>
          <span>{formatRelativeTime(commit.commit.author?.date || '')}</span>
        </div>

        <button
          type="button"
          onClick={handleCopySha}
          title={commit.sha}
          aria-label={i18n.t('点击复制提交 SHA')}
          className="inline-flex items-center gap-1.5 self-start rounded-lg bg-secondary/60 px-2.5 py-1 font-mono text-xs text-primary transition-colors active:bg-secondary"
        >
          {displaySha}
          {copied ? (
            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>
        {copied ? (
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400">{i18n.t('已复制')}</span>
        ) : null}

        {totals ? (
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <Badge variant="secondary">{totals.files} {i18n.t('个文件')}</Badge>
            <span className="text-emerald-600 dark:text-emerald-400">+{totals.additions}</span>
            <span className="text-red-600 dark:text-red-400">-{totals.deletions}</span>
          </div>
        ) : null}
      </div>

      {commit.files && commit.files.length > 0 ? (
        <div className="space-y-2">
          {commit.files.map((file) => (
            <FileCard key={file.filename} file={file} />
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl py-10 text-center text-xs text-muted-foreground">
          {i18n.t('暂无文件差异')}
        </div>
      )}
    </div>
  );
}
