
import { useState, useEffect, type KeyboardEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  GitPullRequest,
  GitMerge,
  XCircle,
  MessageSquare,
  Send,
  Edit2,
  ChevronRight,
  FileDiff,
  GitBranch,
  Plus,
  Minus,
  AlertCircle,
  UserCheck,
  CheckCircle2,
  XCircle as XCircleIcon,
  MessageCircle,
  Clock,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  getPullRequest,
  getPullRequestFiles,
  getPullRequestComments,
  createPullRequestComment,
  formatRelativeTime,
} from '@/services/github';
import { gqlGetPRReviews } from '@/services/github-graphql';
import type {
  GitHubPullRequest,
  GitHubComment,
  GitHubFile,
  GQL_PRReview,
  GQL_ReviewDecision,
} from '@/types/types';
import MarkdownRenderer from '@/components/common/MarkdownRenderer';
import { PullActions } from '@/components/repo/PullActions';
import { useAuth } from '@/contexts/AuthContext';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { toast } from 'sonner';
import i18n from "@/i18n";

function ReviewStateIcon({ state }: { state: GQL_PRReview['state'] }) {
  switch (state) {
    case 'APPROVED':
      return <CheckCircle2 className="w-4 h-4 text-success" />;
    case 'CHANGES_REQUESTED':
      return <XCircleIcon className="w-4 h-4 text-destructive" />;
    case 'COMMENTED':
      return <MessageCircle className="w-4 h-4 text-muted-foreground" />;
    case 'DISMISSED':
      return <XCircleIcon className="w-4 h-4 text-muted-foreground" />;
    default:
      return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
}

function reviewStateText(state: GQL_PRReview['state']): string {
  switch (state) {
    case 'APPROVED': return i18n.t('已批准');
    case 'CHANGES_REQUESTED': return i18n.t('请求更改');
    case 'COMMENTED': return i18n.t('留下评论');
    case 'DISMISSED': return i18n.t('已忽略');
    default: return i18n.t('待审查');
  }
}

function ReviewDecisionBanner({ decision }: { decision: GQL_ReviewDecision | null }) {
  if (!decision) return null;
  if (decision === 'APPROVED') {
    return (
      <div className="flex items-center gap-2 bg-success/10 border border-success/30 rounded-lg px-4 py-2.5">
        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
        <span className="text-sm text-success font-medium">{i18n.t('所有审查者已批准，可以合并')}</span>
      </div>
    );
  }
  if (decision === 'CHANGES_REQUESTED') {
    return (
      <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-2.5">
        <XCircleIcon className="w-4 h-4 text-destructive shrink-0" />
        <span className="text-sm text-destructive font-medium">{i18n.t('有审查者请求更改，需要修复后才能合并')}</span>
      </div>
    );
  }
  if (decision === 'REVIEW_REQUIRED') {
    return (
      <div className="flex items-center gap-2 bg-warning/10 border border-warning/30 rounded-lg px-4 py-2.5">
        <Shield className="w-4 h-4 text-warning shrink-0" />
        <span className="text-sm text-warning font-medium">{i18n.t('需要至少一个审查批准才能合并')}</span>
      </div>
    );
  }
  return null;
}

function PullCommentComposer({ value, submitting, onChange, onSubmit }: {
  value: string;
  submitting: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const native = Boolean((window as Window & { AndroidBridge?: unknown }).AndroidBridge);
  const inset = useKeyboardInset(!native);
  const label = i18n.t('撰写评论（支持 Markdown）...');
  const canSubmit = !submitting && !!value.trim();
  const bottom = inset > 0 ? inset : (native ? 'env(safe-area-inset-bottom)' : 'calc(4rem + env(safe-area-inset-bottom))');

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    if (canSubmit) onSubmit();
  };

  return (
    <>
      {/* 为悬浮栏预留滚动空间，保证最后一条评论可见。 */}
      <div className="h-36" aria-hidden="true" />
      <form
        aria-label={i18n.t('发布评论')}
        aria-busy={submitting}
        className="fixed left-[var(--layout-sidebar-width,0px)] right-0 z-30 border-t border-border bg-background/95 px-4 py-2 backdrop-blur-md md:px-6"
        style={{ bottom }}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onSubmit();
        }}
      >
        <div className="mx-auto max-w-[61rem] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <Textarea
            aria-label={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={label}
            className="min-h-16 resize-none rounded-none border-0 bg-transparent font-mono text-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            rows={2}
          />
          <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/20 px-2 py-1.5">
            <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
              <Edit2 aria-hidden="true" className="h-3 w-3" />{i18n.t('Ctrl+Enter 提交')}
            </span>
            <Button type="submit" size="sm" className="h-9 gap-1.5 px-3" disabled={!canSubmit}>
              {!submitting && <Send aria-hidden="true" className="h-3.5 w-3.5" />}
              {submitting ? i18n.t('发布中...') : i18n.t('发布评论')}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}

export default function PullDetailPage() {
  const { owner, repo, number } = useParams<{ owner: string; repo: string; number: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [pr, setPr] = useState<GitHubPullRequest | null>(null);
  const [comments, setComments] = useState<GitHubComment[]>([]);
  const [files, setFiles] = useState<GitHubFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [reviews, setReviews] = useState<GQL_PRReview[]>([]);
  const [reviewDecision, setReviewDecision] = useState<GQL_ReviewDecision | null>(null);
  const [requestedReviewers, setRequestedReviewers] = useState<Array<{ login: string; avatarUrl: string }>>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  useEffect(() => {
    if (!owner || !repo || !number) return;
    const load = async () => {
      setLoading(true);
      try {
        const [prData, commentsData, filesData] = await Promise.all([
          getPullRequest(owner, repo, Number(number)),
          getPullRequestComments(owner, repo, Number(number)),
          getPullRequestFiles(owner, repo, Number(number)),
        ]);
        setPr(prData);
        setComments((previous) => {
          const ids = new Set(commentsData.map((comment) => comment.id));
          return [...commentsData, ...previous.filter((comment) => !ids.has(comment.id))];
        });
        setFiles(filesData);
      } catch (err) {
        toast.error(i18n.t('加载 PR 详情失败'));
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [owner, repo, number]);

  useEffect(() => {
    if (!owner || !repo || !number) return;
    setReviewsLoading(true);
    gqlGetPRReviews(owner, repo, Number(number))
      .then(({ reviews: r, reviewDecision: rd, requestedReviewers: rr }) => {
        setReviews(r);
        setReviewDecision(rd);
        setRequestedReviewers(rr);
      })
      .catch(() => {
      })
      .finally(() => setReviewsLoading(false));
  }, [owner, repo, number]);

  const handleComment = async () => {
    const body = newComment.trim();
    if (submitting || !owner || !repo || !number || !body) return;
    setSubmitting(true);
    try {
      const comment = await createPullRequestComment(owner, repo, Number(number), body);
      setComments((prev) => prev.some(({ id }) => id === comment.id) ? prev : [...prev, comment]);
      setNewComment((current) => (current === newComment ? '' : current));
      toast.success(i18n.t('评论已发布'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('发布失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const getPrIcon = () => {
    if (!pr) return null;
    if (pr.merged) return <GitMerge className="w-5 h-5 text-chart-4" />;
    if (pr.state === 'closed') return <XCircle className="w-5 h-5 text-destructive" />;
    return <GitPullRequest className="w-5 h-5 text-primary" />;
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-full bg-muted" />
        <Skeleton className="h-32 w-full bg-muted" />
      </div>
    );
  }

  if (!pr) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
        <p className="text-foreground">{i18n.t('PR 不存在')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <button type="button" className="hover:text-accent" onClick={() => navigate('/repos')}>{i18n.t('仓库')}</button>
        <ChevronRight className="w-3 h-3" />
        <button type="button" className="hover:text-accent" onClick={() => navigate(`/repos/${owner}/${repo}`)}>{owner}/{repo}</button>
        <ChevronRight className="w-3 h-3" />
        <button type="button" className="hover:text-accent" onClick={() => navigate(`/repos/${owner}/${repo}/pulls`)}>Pull Requests</button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">#{pr.number}</span>
      </div>

      <div className="flex items-start gap-3">
        <div className="mt-1 shrink-0">{getPrIcon()}</div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground text-balance">
            {pr.title}
            <span className="text-muted-foreground font-normal ml-2">#{pr.number}</span>
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-sm text-muted-foreground">
            <span>{pr.user.login}</span>
            <span>·</span>
            <span>{formatRelativeTime(pr.created_at)} {i18n.t('创建')}</span>
            <div className="flex items-center gap-1">
              <GitBranch className="w-3.5 h-3.5" />
              <code className="font-mono text-xs">{pr.head.ref}</code>
              <span>→</span>
              <code className="font-mono text-xs">{pr.base.ref}</code>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm items-center">
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
          <FileDiff className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">{pr.changed_files} {i18n.t('个文件')}</span>
          <span className="text-primary">+{pr.additions}</span>
          <span className="text-destructive">-{pr.deletions}</span>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">{pr.comments + pr.review_comments} {i18n.t('条评论')}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 border border-border text-muted-foreground hover:bg-secondary text-xs"
          onClick={() => navigate(`/repos/${owner}/${repo}/pulls/${number}/diff`, { state: { pr } })}
        >
          <FileDiff className="w-3.5 h-3.5" />
          {i18n.t('查看 Diff')}</Button>
      </div>

      {!reviewsLoading && <ReviewDecisionBanner decision={reviewDecision} />}

      <div className="flex flex-wrap gap-3 bg-card border border-border rounded-lg p-4">
        <PullActions
          owner={owner ?? ''}
          repo={repo ?? ''}
          pr={pr}
          repository={null}
          login={user?.login}
          onUpdate={setPr}
        />
      </div>

      <Tabs defaultValue="description">
        <TabsList className="bg-secondary border border-border">
          <TabsTrigger value="description" className="data-[state=active]:bg-card data-[state=active]:text-foreground text-muted-foreground">
            {i18n.t('描述与评论')}</TabsTrigger>
          <TabsTrigger value="reviews" className="data-[state=active]:bg-card data-[state=active]:text-foreground text-muted-foreground">
            {i18n.t('审查')}{reviews.length > 0 ? `(${reviews.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="files" className="data-[state=active]:bg-card data-[state=active]:text-foreground text-muted-foreground">
            {i18n.t('文件变更 (')}{files.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="description" className="space-y-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-secondary/30">
              <Avatar className="w-6 h-6">
                <AvatarImage src={pr.user.avatar_url} loading="lazy" />
                <AvatarFallback className="bg-secondary text-xs">{pr.user.login[0]}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-foreground">{pr.user.login}</span>
              <span className="text-xs text-muted-foreground">{formatRelativeTime(pr.created_at)}</span>
              <Badge variant="outline" className="ml-auto text-xs border-border text-muted-foreground">{i18n.t('作者')}</Badge>
            </div>
            <div className="p-4">
              {pr.body ? (
                <MarkdownRenderer content={pr.body} />
              ) : (
                <p className="text-muted-foreground text-sm italic">{i18n.t('无描述')}</p>
              )}
            </div>
          </div>

          {comments.map((comment) => (
            <div key={comment.id} className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-secondary/30">
                <Avatar className="w-6 h-6">
                  <AvatarImage src={comment.user.avatar_url} loading="lazy" />
                  <AvatarFallback className="bg-secondary text-xs">{comment.user.login[0]}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-foreground">{comment.user.login}</span>
                <span className="text-xs text-muted-foreground">{formatRelativeTime(comment.created_at)}</span>
              </div>
              <div className="p-4">
                <MarkdownRenderer content={comment.body} />
              </div>
            </div>
          ))}

          {user && (
            <PullCommentComposer
              value={newComment}
              submitting={submitting}
              onChange={setNewComment}
              onSubmit={handleComment}
            />
          )}
        </TabsContent>

        <TabsContent value="reviews" className="space-y-4">
          {reviewsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-full bg-muted" />
                    <Skeleton className="h-4 w-32 bg-muted" />
                    <Skeleton className="h-5 w-16 bg-muted ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {requestedReviewers.length > 0 && (
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <UserCheck className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{i18n.t('待审查')}</span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {requestedReviewers.map((r) => (
                      <div key={r.login} className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2">
                        <Avatar className="w-5 h-5">
                          <AvatarImage src={r.avatarUrl} loading="lazy" />
                          <AvatarFallback className="text-[10px] bg-muted">{r.login[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-foreground">{r.login}</span>
                        <Clock className="w-3 h-3 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {reviews.length === 0 && requestedReviewers.length === 0 ? (
                <div className="bg-card border border-border rounded-lg py-12 text-center">
                  <UserCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">{i18n.t('该 PR 暂无 Code Review 记录')}</p>
                </div>
              ) : (
                reviews.map((review) => (
                  <div
                    key={review.id}
                    className={`bg-card border rounded-lg overflow-hidden ${
                      review.state === 'APPROVED' ? 'border-success/40' :
                      review.state === 'CHANGES_REQUESTED' ? 'border-destructive/40' :
                      'border-border'
                    }`}
                  >
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-secondary/30">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={review.author?.avatarUrl} loading="lazy" />
                        <AvatarFallback className="text-xs bg-muted">{review.author?.login?.[0] || '?'}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium text-foreground">{review.author?.login}</span>
                      <span className="text-xs text-muted-foreground">{formatRelativeTime(review.submittedAt)}</span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <ReviewStateIcon state={review.state} />
                        <span className={`text-xs font-medium ${
                          review.state === 'APPROVED' ? 'text-success' :
                          review.state === 'CHANGES_REQUESTED' ? 'text-destructive' :
                          'text-muted-foreground'
                        }`}>{reviewStateText(review.state)}</span>
                      </div>
                    </div>
                    {review.body && (
                      <div className="p-4">
                        <MarkdownRenderer content={review.body} />
                      </div>
                    )}
                  </div>
                ))
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="files" className="space-y-3">
          {files.map((file) => (
            <div key={file.filename} className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-secondary/30">
                <code className="text-xs text-foreground font-mono flex-1 min-w-0 truncate">{file.filename}</code>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="flex items-center gap-1 text-xs text-primary">
                    <Plus className="w-3 h-3" />{file.additions}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-destructive">
                    <Minus className="w-3 h-3" />{file.deletions}
                  </span>
                  <Badge variant="outline" className="text-xs border-border text-muted-foreground">{file.status}</Badge>
                </div>
              </div>
              {file.patch && (
                <div className="overflow-x-auto">
                  <pre className="text-xs p-4 font-mono leading-relaxed whitespace-pre-wrap text-foreground">
                    {file.patch.split('\n').map((line, i) => (
                      <span
                        key={i}
                        className={`block ${
                          line.startsWith('+') ? 'bg-primary/10 text-primary' :
                          line.startsWith('-') ? 'bg-destructive/10 text-destructive' :
                          line.startsWith('@@') ? 'text-accent' :
                          'text-muted-foreground'
                        }`}
                      >
                        {line}
                      </span>
                    ))}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
