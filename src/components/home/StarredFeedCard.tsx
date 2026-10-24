import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gqlGetDashboardFeed } from '@/services/github-graphql';
import { getDashboardFeedLimit } from '@/lib/preferences';
import { Tag, Download, Clock } from 'lucide-react';
import { formatRelativeTime } from '@/services/github';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import MarkdownRenderer from '@/components/common/MarkdownRenderer';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function StarredFeedCard({ refreshTrigger }: { refreshTrigger?: number }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState<any[]>([]);
  const [activeItem, setActiveItem] = useState<any>(null);

    useEffect(() => {
    let mounted = true;
    async function load() {

      if (feed.length === 0) setLoading(true);
      try {
        const data = await gqlGetDashboardFeed();

        const releases = Array.isArray(data) ? data : (data as any).releases || [];
        if (mounted) {
          setFeed(releases.slice(0, getDashboardFeedLimit()));
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) {
          setLoading(false);

          setTimeout(() => {
            const savedY = sessionStorage.getItem('home_scroll_pos');
            if (savedY) {
              window.scrollTo({ top: parseInt(savedY, 10), behavior: 'instant' });
            }
          }, 100);
        }
      }
    }
    load();
    return () => { mounted = false; };
  }, [refreshTrigger]);

  if (loading) return <div className="text-center text-sm text-muted-foreground p-4">加载中...</div>;
  if (feed.length === 0) return <div className="text-center text-sm text-muted-foreground p-4">暂无收藏仓库的发布动态</div>;

  return (
    <div className="space-y-3">
      {feed.map((item, i) => (
        <div
          key={i}
          className="border border-border rounded-xl bg-card p-4 shadow-sm flex flex-col gap-2 relative cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => setActiveItem(item)}
        >

          <div className="flex items-center gap-2 mb-1 group cursor-pointer" onClick={(e) => { e.stopPropagation(); sessionStorage.setItem('home_scroll_pos', String(window.scrollY)); navigate(`/repos/${item.repoName}`); }}>
            <img src={item.avatarUrl} className="w-5 h-5 rounded-full shrink-0" alt="" />
            <span className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{item.repoName}</span>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground">{formatRelativeTime(item.date)}</span>

            </div>
          </div>

          <div className="flex items-center justify-between gap-2 mt-1">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground min-w-0">
              <Tag className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="truncate">{item.title}</span>
            </div>
            <button
              className="p-1 -mr-1 rounded-md text-muted-foreground hover:bg-secondary hover:text-primary transition-colors shrink-0"
              title="查看仓库产物"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                sessionStorage.setItem('home_scroll_pos', String(window.scrollY));
                navigate(`/repos/${item.repoName}/artifacts`);
              }}
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          {item.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.description}</p>
          )}
        </div>
      ))}

      <Dialog open={!!activeItem} onOpenChange={(open) => !open && setActiveItem(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg rounded-xl border-border bg-card p-0 gap-0 max-h-[300px] flex flex-col">
          <DialogHeader className="p-4 border-b border-border shrink-0">
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">{activeItem?.repoName}</span>
            </DialogTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
              <Badge variant="outline" className="text-[10px] text-primary border-primary/30 shrink-0">
                {activeItem?.title}
              </Badge>
              <span className="flex items-center gap-1 shrink-0">
                <Clock className="w-3 h-3" />
                {activeItem && formatRelativeTime(activeItem.date)}
              </span>
            </div>
          </DialogHeader>

          <div className="p-4 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex-1">
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
              <MarkdownRenderer content={activeItem?.description || '暂无更新说明'} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
