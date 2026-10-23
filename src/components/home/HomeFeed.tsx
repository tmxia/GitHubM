import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getReceivedEvents, formatRelativeTime } from '@/services/github';
import { gqlGetDashboardFeed } from '@/services/github-graphql';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GitPullRequest, Tag, Star, Sparkles } from 'lucide-react';
import MarkdownRenderer from '@/components/common/MarkdownRenderer';
import { useAuth } from '@/contexts/AuthContext';
import { saveListScroll, readListScroll } from '@/lib/scrollRestore';

export default function HomeFeed({ onlyStarred = false, limit = 40 }: { onlyStarred?: boolean, limit?: number }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [activeRelease, setActiveRelease] = useState<any>(null);

  useEffect(() => {
    if (!user?.login) return;

    async function load() {
      try {

        let starredRepos = new Set<string>();
        if (onlyStarred) {
          try {
            const token = localStorage.getItem('github_token') || '';
            const r = await fetch(`https://api.github.com/user/starred?per_page=100`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const arr = await r.json();
            if (Array.isArray(arr)) {
              arr.forEach(repo => starredRepos.add(repo.full_name));
            }
          } catch (e) { console.error('Fetch starred error', e); }
        }

        const [rawEvents, gqlData] = await Promise.all([
          getReceivedEvents(user?.login || '', 100).catch(() => []),
          onlyStarred ? Promise.resolve({ releases: [], prs: [] }) : gqlGetDashboardFeed().catch(() => ({ releases: [], prs: [] }))
        ]);

        const feedItems: any[] = [];
        const seenIds = new Set();

        gqlData.releases.forEach((r: any) => {
          const key = `release-${r.repoName}-${r.release.tagName}`;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            feedItems.push({
              type: 'release', date: new Date(r.release.publishedAt),
              user: r.owner, repoName: r.repoName,
              data: { ...r.release, content: r.release.description }
            });
          }
        });

        gqlData.prs.forEach((p: any) => {
          const key = `pr-${p.pr.id}`;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            feedItems.push({ type: 'pr', date: new Date(p.pr.createdAt), user: p.user, repoName: p.pr.repository.nameWithOwner, data: p.pr });
          }
        });

        rawEvents.forEach((e: any) => {
          const payload = e.payload;
          const actor = { login: e.actor.login, avatarUrl: e.actor.avatar_url };
          const date = new Date(e.created_at);
          const key = `event-${e.id}`;

          if (seenIds.has(key)) return;

          if (e.type === 'PullRequestEvent' && payload.action === 'closed' && payload.pull_request?.merged) {
            seenIds.add(key);
            feedItems.push({ type: 'pr', date, user: actor, repoName: e.repo.name, data: payload.pull_request });
          } else if (e.type === 'ReleaseEvent' && payload.action === 'published') {
            seenIds.add(key);
            feedItems.push({ type: 'release', date, user: actor, repoName: e.repo.name, data: { ...payload.release, content: payload.release.body } });
          } else if (e.type === 'WatchEvent' && payload.action === 'started') {
            seenIds.add(key);
            feedItems.push({ type: 'star', date, user: actor, repoName: e.repo.name, data: null });
          } else if (e.type === 'PushEvent' && payload.commits?.length > 0) {
            seenIds.add(key);
            feedItems.push({ type: 'push', date, user: actor, repoName: e.repo.name, data: payload });
          }
        });

        feedItems.sort((a, b) => b.date.getTime() - a.date.getTime());

        setTimeline(feedItems.slice(0, limit));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  useEffect(() => {
    if (!loading) {
      const savedY = readListScroll('home-feed-scroll');
      if (savedY) {
        setTimeout(() => window.scrollTo({ top: savedY, behavior: 'instant' }), 100);
      }
    }
  }, [loading]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[150px] w-full rounded-xl" />
        <Skeleton className="h-[150px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {timeline.map((item, idx) => {
        if (item.type === 'popular') {
          const repo = item.data;
          return (
            <div key={idx} className="border border-border rounded-xl bg-card p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="w-4 h-4" /> Popular projects among people you follow
              </div>
              <div className="pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar className="w-6 h-6">
                      <AvatarImage src={repo.owner.avatar_url} />
                    </Avatar>
                    <Link to={`/repos/${repo.full_name}`} className="font-semibold hover:underline text-sm text-foreground">
                      {repo.full_name}
                    </Link>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs px-2 rounded-md">
                    <Star className="w-3 h-3 mr-1" /> Star
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{repo.description}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                  {repo.language && (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: repo.language === 'TypeScript' ? '#3178c6' : '#f1e05a' }} />
                      {repo.language}
                    </span>
                  )}
                  <span className="flex items-center gap-1"><Star className="w-3 h-3" /> {repo.stargazers_count}</span>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={idx} className="border border-border rounded-xl bg-card p-4 shadow-sm flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <Avatar className="w-10 h-10 border border-border shrink-0">
                <AvatarImage src={item.user.avatarUrl} />
                <AvatarFallback>{item.user?.login[0]?.toUpperCase() || 'U'}</AvatarFallback>
              </Avatar>
              <div>
                <div className="text-sm text-muted-foreground leading-tight">
                  <span className="font-semibold text-foreground">{item.user?.login}</span>
                  {item.type === 'release' && ' released in '}
                  {item.type === 'pr' && ' contributed to '}
                  {item.type === 'star' && ' starred '}
                  {item.type === 'push' && ' pushed to '}
                  <Link to={`/repos/${item.repoName}`} className="font-semibold text-foreground hover:underline break-all">
                    {item.repoName}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatRelativeTime(item.date.toISOString())}
                  </div>
                </div>
              </div>
            </div>

            <div className="pl-[52px]">
              {item.type === 'pr' && (
                <div className="space-y-3">
                  <h3 className="text-base font-bold text-foreground leading-snug break-words">{item.data.title}</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-xs text-white bg-[#8250df] px-2 py-0.5 rounded-full font-medium shrink-0">
                      <GitPullRequest className="w-3 h-3" /> Merged
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {item.user?.login} merged {item.data.commits || 1} commit
                    </span>
                  </div>
                  {item.data.body && (
                    <div className="text-sm text-muted-foreground bg-secondary/40 p-3 rounded-md line-clamp-4 overflow-hidden relative">
                      <MarkdownRenderer content={item.data.body} />
                      <div className="absolute bottom-0 left-0 w-full h-6 bg-gradient-to-t from-card to-transparent" />
                    </div>
                  )}
                  <Button variant="ghost" size="sm" className="px-0 text-primary h-auto py-1 font-semibold" onClick={() => {
                    const [owner, repo] = item.repoName.split('/');
                    let num = item.data.number;

                    if (!num && item.data.url) {
                      const match = item.data.url.match(/\/pull\/(\d+)/);
                      if (match) num = match[1];
                    }

                    if (num) {
                      saveListScroll('home-feed-scroll');
                      saveListScroll('home-feed-scroll');
                      navigate(`/repos/${owner}/${repo}/pulls/${num}`);
                    } else {
                      window.open(item.data.html_url || item.data.url, '_blank');
                    }
                  }}>
                    Read more
                  </Button>
                </div>
              )}

              {item.type === 'release' && (
                <div className="space-y-3">
                  <h3 className="text-base font-bold text-foreground leading-snug break-words">{item.data.name || item.data.tag_name}</h3>
                  <div className="text-sm text-muted-foreground bg-secondary/40 p-3 rounded-md line-clamp-5 overflow-hidden relative">
                    <MarkdownRenderer content={item.data.content || 'No description provided.'} />
                    <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-card to-transparent" />
                  </div>
                  <Button variant="ghost" size="sm" className="px-0 text-primary h-auto py-1 font-semibold" onClick={() => setActiveRelease(item.data)}>
                    Read more
                  </Button>
                </div>
              )}

              {item.type === 'push' && (
                <div className="text-sm text-muted-foreground bg-secondary/40 p-3 rounded-md space-y-2">
                  {item.data.commits.slice(0, 3).map((c: any, i: number) => (
                    <div key={i} className="truncate">
                      <span className="font-mono text-xs text-primary mr-2">{c.sha.substring(0, 7)}</span>
                      {c.message}
                    </div>
                  ))}
                  {item.data.commits.length > 3 && (
                    <div className="text-xs italic mt-1 text-muted-foreground/70">...及其他 {item.data.commits.length - 3} 次提交</div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <Dialog open={!!activeRelease} onOpenChange={(open) => !open && setActiveRelease(null)}>
        <DialogContent className="w-[90vw] max-w-lg flex flex-col bg-background border-border p-0 overflow-hidden rounded-xl shadow-xl max-h-[80vh]">
          <DialogHeader className="px-5 py-4 border-b border-border bg-muted/30 shrink-0">
            <DialogTitle className="text-base font-bold flex items-center gap-2 truncate">
              <Tag className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">{activeRelease?.name || activeRelease?.tag_name}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-5 min-h-0">
            <div className="prose dark:prose-invert max-w-none text-sm text-foreground/90">
              <MarkdownRenderer content={activeRelease?.content || activeRelease?.body || 'No description provided.'} />
            </div>
          </div>
          <div className="p-4 border-t border-border bg-muted/30 flex justify-end gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setActiveRelease(null)}>关闭</Button>

            <a href={activeRelease?.html_url || activeRelease?.url} target="_blank" rel="noopener noreferrer">
              <Button size="sm">在浏览器打开</Button>
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
