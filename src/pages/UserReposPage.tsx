import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight, Globe, Lock, Star, GitFork, Clock, BookOpen,
  AlertCircle, Users, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  getReposByLogin, getUserByLogin, formatRelativeTime, formatNumber, getLanguageColor,
} from '@/services/github';
import type { GitHubRepo, GitHubUser } from '@/types/types';
import i18n from '@/i18n';
import PullToRefresh from '@/components/common/PullToRefresh';

export default function UserReposPage() {
  const { login } = useParams<{ login: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const loadUser = useCallback(async () => {
    if (!login) return;
    try {
      const u = await getUserByLogin(login);
      setUser(u);
    } catch {
    }
  }, [login]);

  const loadRepos = useCallback(async (p = 1, append = false) => {
    if (!login) return;
    if (p === 1) setLoading(true);
    else setLoadingMore(true);
    setError('');
    try {
      const res = await getReposByLogin(login, { per_page: 100, page: p });
      if (append) setRepos((prev) => [...prev, ...res.data]);
      else setRepos(res.data);
      setHasMore(res.hasNextPage);
      setPage(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : i18n.t('加载失败'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [login]);

  useEffect(() => {
    loadUser();
    loadRepos(1);
  }, [loadUser, loadRepos]);

  return (
    <PullToRefresh onRefresh={async () => { await Promise.all([loadUser(), loadRepos(1, false)]); }}>
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <button type="button" className="hover:text-accent" onClick={() => navigate('/')}>{i18n.t('首页')}</button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">@{login}</span>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">{i18n.t('公开仓库')}</span>
      </div>

      {user && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-4 flex items-start gap-4">
            <Avatar className="w-16 h-16 shrink-0">
              <AvatarImage src={user.avatar_url} alt={user.login} loading="lazy" />
              <AvatarFallback className="bg-primary/20 text-primary text-lg font-bold">
                {user.login.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 space-y-1">
              <div>
                <p className="text-base font-bold text-foreground">{user.name || user.login}</p>
                <p className="text-sm text-muted-foreground">@{user.login}</p>
              </div>
              {user.bio && <p className="text-sm text-muted-foreground text-pretty">{user.bio}</p>}
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                {user.company && <span>{user.company}</span>}
                {user.location && <span>📍 {user.location}</span>}
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />{formatNumber(user.followers)} {i18n.t('关注者')}
                </span>
                <span>{i18n.t('公开仓库')}: {formatNumber(user.public_repos)}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="border border-border text-muted-foreground hover:bg-secondary h-8 shrink-0"
              onClick={() => window.open(user.html_url, '_blank', 'noopener,noreferrer')}
            >
              {i18n.t('GitHub 主页')}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          {i18n.t('公开仓库')}
          {!loading && (
            <Badge variant="outline" className="text-xs border-border text-muted-foreground font-normal">
              {repos.length}{hasMore ? '+' : ''}
            </Badge>
          )}
        </h1>
      </div>

      {loading ? (
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="p-4">
              <Skeleton className="h-5 w-48 bg-muted mb-2" />
              <Skeleton className="h-4 w-full bg-muted mb-2" />
              <Skeleton className="h-4 w-32 bg-muted" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12 text-destructive border border-border rounded-lg bg-card">
          <AlertCircle className="w-10 h-10 mx-auto mb-3" />
          <p>{error}</p>
          <Button variant="ghost" size="sm" className="mt-3 border border-border text-muted-foreground hover:bg-secondary h-9" onClick={() => loadRepos(1)}>
            {i18n.t('重试')}
          </Button>
        </div>
      ) : repos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-border rounded-lg bg-card">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">{i18n.t('该用户暂无公开仓库')}</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg divide-y divide-border overflow-hidden">
          {repos.map((repo) => (
            <button
              key={repo.id}
              type="button"
              className="w-full p-4 hover:bg-secondary/50 transition-colors text-left group"
              onClick={() => navigate(`/repos/${repo.full_name}`)}
            >
              <div className="flex items-center gap-2 flex-wrap">
                {repo.private
                  ? <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  : <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                <span className="text-sm font-semibold text-accent group-hover:underline truncate">{repo.name}</span>
                {repo.fork && <Badge variant="outline" className="text-xs border-border text-muted-foreground h-4 px-1">Fork</Badge>}
                {repo.archived && <Badge variant="outline" className="text-xs border-border text-muted-foreground h-4 px-1">{i18n.t('已归档')}</Badge>}
              </div>
              {repo.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 text-pretty">{repo.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                {repo.language && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getLanguageColor(repo.language) }} />
                    {repo.language}
                  </span>
                )}
                {repo.stargazers_count > 0 && <span className="flex items-center gap-1"><Star className="w-3 h-3" />{formatNumber(repo.stargazers_count)}</span>}
                {repo.forks_count > 0 && <span className="flex items-center gap-1"><GitFork className="w-3 h-3" />{formatNumber(repo.forks_count)}</span>}
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatRelativeTime(repo.pushed_at)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {hasMore && !loading && (
        <Button
          variant="ghost"
          className="w-full border border-border text-muted-foreground hover:bg-secondary"
          disabled={loadingMore}
          onClick={() => loadRepos(page + 1, true)}
        >
          {loadingMore ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />{i18n.t('加载中…')}</> : i18n.t('加载更多')}
        </Button>
      )}
    </div>
    </PullToRefresh>
  );
}
