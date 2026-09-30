
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  FilePlus,
  FolderPlus,
  RefreshCw,
  Search,
  X,
  Pencil,
  Trash2,
  MoreHorizontal,
  Download,
  ClipboardCopy,
  Link,
  History,
  Upload,
  GitBranch,
  Eye,
} from 'lucide-react';
import { cn, copyToClipboard } from '@/lib/utils';
import { getFileIconInfo } from '@/components/common/FileIcon';
import { getRepoContents } from '@/services/github';
import type { GitHubContent, GitHubBranch } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import i18n from "@/i18n";

type NodeStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface TreeNode {
  item: GitHubContent;
  children: TreeNode[] | null;
  status: NodeStatus;
}

export interface FileTreeProps {
  owner: string;
  repo: string;
  branch: string;
  branches?: GitHubBranch[];
  onBranchChange?: (branch: string) => void;
  activePath?: string;
  onFileClick?: (item: GitHubContent) => void;
  onNewFile?: (dirPath: string) => void;
  onNewFolder?: (dirPath: string) => void;
  onUpload?: (dirPath: string) => void;
  onRename?: (item: GitHubContent) => void;
  onDelete?: (item: GitHubContent) => void;
  onMove?: (item: GitHubContent) => void;
  onDownload?: (item: GitHubContent) => void;
  refreshKey?: number;
  className?: string;
  commitMap?: Record<string, { date: string; message: string; author: string } | null>;
}

function sortItems(items: GitHubContent[]): GitHubContent[] {
  return [...items].sort((a, b) => {
    if (a.type === 'dir' && b.type !== 'dir') return -1;
    if (a.type !== 'dir' && b.type === 'dir') return 1;
    return a.name.localeCompare(b.name);
  });
}

function TreeNodeRow({
  node,
  depth,
  isExpanded,
  isActive,
  onToggle,
  onFileClick,
  onNewFile,
  onNewFolder,
  onUpload,
  onRename,
  onDelete,
  onMove,
  onDownload,
  onCopyPath,
  onCopyRaw,
  onViewHistory,
  owner,
  repo,
  branch,
  filterText,
  commitMap,}: {
  node: TreeNode;
  depth: number;
  isExpanded: boolean;
  isActive: boolean;
  onToggle: (path: string) => void;
  onFileClick?: (item: GitHubContent) => void;
  onNewFile?: (dirPath: string) => void;
  onNewFolder?: (dirPath: string) => void;
  onUpload?: (dirPath: string) => void;
  onRename?: (item: GitHubContent) => void;
  onDelete?: (item: GitHubContent) => void;
  onMove?: (item: GitHubContent) => void;
  onDownload?: (item: GitHubContent) => void;
  onCopyPath?: (path: string) => void;
  onCopyRaw?: (path: string) => void;
  onViewHistory?: (item: GitHubContent) => void;
  owner: string;
  repo: string;
  branch: string;
  filterText: string;
  commitMap?: Record<string, { date: string; message: string; author: string } | null>;
}) {
  const navigate = useNavigate();
  const { item, status } = node;
  const isDir = item.type === 'dir';
  const { Icon, color } = getFileIconInfo(item.name, isDir, isExpanded);

  const handleClick = () => {
    if (isDir) {
      onToggle(item.path);
    } else {
      onFileClick?.(item);
    }
  };

  const nameNode = useMemo(() => {
    if (!filterText) return <span>{item.name}</span>;
    const idx = item.name.toLowerCase().indexOf(filterText.toLowerCase());
    if (idx === -1) return <span>{item.name}</span>;
    return (
      <span>
        {item.name.slice(0, idx)}
        <mark className="bg-yellow-400/40 text-foreground rounded-[2px]">
          {item.name.slice(idx, idx + filterText.length)}
        </mark>
        {item.name.slice(idx + filterText.length)}
      </span>
    );
  }, [item.name, filterText]);

  const dirContextContent = (
    <ContextMenuContent className="w-48">
      <ContextMenuItem onClick={() => onToggle(item.path)}>
        {isExpanded
          ? <><ChevronDown className="w-3.5 h-3.5 mr-2" />{i18n.t('收起文件夹')}</>
          : <><ChevronRight className="w-3.5 h-3.5 mr-2" />{i18n.t('展开文件夹')}</>
        }
      </ContextMenuItem>
      <ContextMenuItem onClick={() => navigate(`/repos/${owner}/${repo}/code/${item.path}`)}>
        <Eye className="w-3.5 h-3.5 mr-2" />{i18n.t('在主区域打开')}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onNewFile?.(item.path)}>
        <FilePlus className="w-3.5 h-3.5 mr-2" />{i18n.t('新建文件')}</ContextMenuItem>
      <ContextMenuItem onClick={() => onNewFolder?.(item.path)}>
        <FolderPlus className="w-3.5 h-3.5 mr-2" />{i18n.t('新建子文件夹')}</ContextMenuItem>
      <ContextMenuItem onClick={() => onUpload?.(item.path)}>
        <Upload className="w-3.5 h-3.5 mr-2" />{i18n.t('上传文件到此')}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onCopyPath?.(item.path)}>
        <ClipboardCopy className="w-3.5 h-3.5 mr-2" />{i18n.t('复制路径')}</ContextMenuItem>
      <ContextMenuItem onClick={() => onRename?.(item)}>
        <Pencil className="w-3.5 h-3.5 mr-2" />{i18n.t('重命名')}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={() => onDelete?.(item)}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className="w-3.5 h-3.5 mr-2" />{i18n.t('删除文件夹')}</ContextMenuItem>
    </ContextMenuContent>
  );

  const fileContextContent = (
    <ContextMenuContent className="w-48">
      <ContextMenuItem onClick={() => onFileClick?.(item)}>
        <Eye className="w-3.5 h-3.5 mr-2" />{i18n.t('查看 / 编辑')}</ContextMenuItem>
      {onDownload && (
        <ContextMenuItem onClick={() => onDownload(item)}>
          <Download className="w-3.5 h-3.5 mr-2" />{i18n.t('下载文件')}</ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onCopyPath?.(item.path)}>
        <ClipboardCopy className="w-3.5 h-3.5 mr-2" />{i18n.t('复制路径')}</ContextMenuItem>
      <ContextMenuItem onClick={() => onCopyRaw?.(item.path)}>
        <Link className="w-3.5 h-3.5 mr-2" />{i18n.t('复制 Raw 链接')}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onRename?.(item)}>
        <Pencil className="w-3.5 h-3.5 mr-2" />{i18n.t('重命名')}</ContextMenuItem>
      <ContextMenuItem onClick={() => onMove?.(item)}>
        <MoveIcon className="w-3.5 h-3.5 mr-2" />{i18n.t('移动到...')}</ContextMenuItem>
      <ContextMenuItem onClick={() => onViewHistory?.(item)}>
        <History className="w-3.5 h-3.5 mr-2" />{i18n.t('查看历史')}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={() => onDelete?.(item)}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className="w-3.5 h-3.5 mr-2" />{i18n.t('删除文件')}</ContextMenuItem>
    </ContextMenuContent>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-tree-path={item.path}
          className={cn(
            'group flex items-center gap-0.5 py-[3px] pr-1 rounded-md cursor-pointer select-none',
            'hover:bg-secondary/60 transition-colors',
            isActive && 'bg-primary/10 hover:bg-primary/15',
          )}
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
          onClick={handleClick}
        >
          <span className="w-4 h-4 flex items-center justify-center shrink-0">
            {isDir && (
              status === 'loading' ? (
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              ) : isExpanded ? (
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              )
            )}
          </span>

          <Icon className={cn('w-4 h-4 shrink-0', color)} />

          <span
            className={cn(
              'flex-1 min-w-0 truncate text-sm ml-1.5',
              isActive ? 'text-primary font-medium' : 'text-foreground/85',
            )}
          >
            {nameNode}
          </span>

          <span className="transition-colors flex items-center gap-0.5 shrink-0">
            {isDir ? (
              <>
                <button
                  type="button"
                  className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/70"
                  title={i18n.t('新建文件')}
                  onClick={e => { e.stopPropagation(); onNewFile?.(item.path); }}
                >
                  <FilePlus className="w-3 h-3 text-muted-foreground" />
                </button>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/70"
                      onClick={e => e.stopPropagation()}
                    >
                      <MoreHorizontal className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => onNewFolder?.(item.path)}>
                      <FolderPlus className="w-3.5 h-3.5 mr-2" />{i18n.t('新建子文件夹')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onUpload?.(item.path)}>
                      <Upload className="w-3.5 h-3.5 mr-2" />{i18n.t('上传文件到此')}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onCopyPath?.(item.path)}>
                      <ClipboardCopy className="w-3.5 h-3.5 mr-2" />{i18n.t('复制路径')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onRename?.(item)}>
                      <Pencil className="w-3.5 h-3.5 mr-2" />{i18n.t('重命名')}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete?.(item)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-2" />{i18n.t('删除')}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/70"
                    onClick={e => e.stopPropagation()}
                  >
                    <MoreHorizontal className="w-3 h-3 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  {onDownload && (
                    <DropdownMenuItem onClick={() => onDownload(item)}>
                      <Download className="w-3.5 h-3.5 mr-2" />{i18n.t('下载')}</DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onCopyPath?.(item.path)}>
                    <ClipboardCopy className="w-3.5 h-3.5 mr-2" />{i18n.t('复制路径')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onCopyRaw?.(item.path)}>
                    <Link className="w-3.5 h-3.5 mr-2" />{i18n.t('复制 Raw 链接')}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onRename?.(item)}>
                    <Pencil className="w-3.5 h-3.5 mr-2" />{i18n.t('重命名')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onMove?.(item)}>
                    <MoveIcon className="w-3.5 h-3.5 mr-2" />{i18n.t('移动到...')}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete?.(item)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" />{i18n.t('删除')}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </span>
        {!isDir && commitMap?.[item.path] && (
              <span className="ml-auto text-[10px] text-muted-foreground shrink-0 tabular-nums pl-2">
                {(() => {
                  const c = commitMap[item.path];
                  if (!c) return null;
                  const diff = Date.now() - new Date(c.date).getTime();
                  const mins = Math.floor(diff / 60000);
                  if (mins < 1) return i18n.t('刚刚');
                  if (mins < 60) return `${mins}${i18n.t('分钟前')}`;
                  const hrs = Math.floor(mins / 60);
                  if (hrs < 24) return `${hrs}${i18n.t('小时前')}`;
                  const days = Math.floor(hrs / 24);
                  if (days < 30) return `${days}${i18n.t('天前')}`;
                  const months = Math.floor(days / 30);
                  if (months < 12) return `${months}${i18n.t('个月前')}`;
                  return `${Math.floor(months / 12)}${i18n.t('年前')}`;
                })()}
              </span>
            )}
            </div>
      </ContextMenuTrigger>
      {isDir ? dirContextContent : fileContextContent}
    </ContextMenu>
  );
}

function MoveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function TreeNodeList({
  nodes,
  depth,
  expandedPaths,
  activePath,
  onToggle,
  onFileClick,
  onNewFile,
  onNewFolder,
  onUpload,
  onRename,
  onDelete,
  onMove,
  onDownload,
  onCopyPath,
  onCopyRaw,
  onViewHistory,
  owner,
  repo,
  branch,
  filterText,
  commitMap,
}: {
  nodes: TreeNode[];
  depth: number;
  expandedPaths: Set<string>;
  activePath?: string;
  onToggle: (path: string) => void;
  onFileClick?: (item: GitHubContent) => void;
  onNewFile?: (dirPath: string) => void;
  onNewFolder?: (dirPath: string) => void;
  onUpload?: (dirPath: string) => void;
  onRename?: (item: GitHubContent) => void;
  onDelete?: (item: GitHubContent) => void;
  onMove?: (item: GitHubContent) => void;
  onDownload?: (item: GitHubContent) => void;
  onCopyPath?: (path: string) => void;
  onCopyRaw?: (path: string) => void;
  onViewHistory?: (item: GitHubContent) => void;
  owner: string;
  repo: string;
  branch: string;
  filterText: string;
  commitMap?: Record<string, { date: string; message: string; author: string } | null>;
}) {
  return (
    <>
      {nodes.map(node => {
        const isExpanded = expandedPaths.has(node.item.path);
        const isActive = activePath === node.item.path;
        return (
          <div key={node.item.path}>
            <TreeNodeRow
              commitMap={commitMap}
              node={node}
              depth={depth}
              isExpanded={isExpanded}
              isActive={isActive}
              onToggle={onToggle}
              onFileClick={onFileClick}
              onNewFile={onNewFile}
              onNewFolder={onNewFolder}
              onUpload={onUpload}
              onRename={onRename}
              onDelete={onDelete}
              onMove={onMove}
              onDownload={onDownload}
              onCopyPath={onCopyPath}
              onCopyRaw={onCopyRaw}
              onViewHistory={onViewHistory}
              owner={owner}
              repo={repo}
              branch={branch}
              filterText={filterText}
            />
            {node.item.type === 'dir' && isExpanded && node.children && node.children.length > 0 && (
              <TreeNodeList
                commitMap={commitMap}
                nodes={node.children}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                activePath={activePath}
                onToggle={onToggle}
                onFileClick={onFileClick}
                onNewFile={onNewFile}
                onNewFolder={onNewFolder}
                onUpload={onUpload}
                onRename={onRename}
                onDelete={onDelete}
                onMove={onMove}
                onDownload={onDownload}
                onCopyPath={onCopyPath}
                onCopyRaw={onCopyRaw}
                onViewHistory={onViewHistory}
                owner={owner}
                repo={repo}
                branch={branch}
                filterText={filterText}
              />
            )}
            {node.item.type === 'dir' && isExpanded && node.children?.length === 0 && (
              <div
                className="text-xs text-muted-foreground/60 py-1 italic"
                style={{ paddingLeft: `${(depth + 1) * 12 + 22}px` }}
              >
                {i18n.t('空文件夹')}</div>
            )}
          </div>
        );
      })}
    </>
  );
}

export default function FileTree({
  owner,
  repo,
  branch,
  branches,
  onBranchChange,
  activePath,
  onFileClick,
  onNewFile,
  onNewFolder,
  onUpload,
  onRename,
  onDelete,
  onMove,
  onDownload,
  refreshKey,
  className,
  commitMap,}: FileTreeProps) {
  const navigate = useNavigate();

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollKey = `code-tree-scroll:${owner}/${repo}@${branch}`;
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [rootStatus, setRootStatus] = useState<NodeStatus>('idle');

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [diag, setDiag] = useState<string>('init');
  const lastActivePathRef = useRef<string | undefined>(undefined);

  const nodeMapRef = useRef<Map<string, TreeNode>>(new Map());

  useEffect(() => {
    if (rootStatus !== 'loaded') return;
    let cancelled = false;
    let viewport: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onScroll = () => {
      if (!viewport) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try { localStorage.setItem(scrollKey, String(viewport!.scrollTop)); } catch {}
      }, 200);
    };

    let retries = 0;
    const tryBind = () => {
      if (cancelled) return;
      const root = scrollAreaRef.current;
      viewport = root?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
      if (viewport) {
        viewport.addEventListener('scroll', onScroll, { passive: true });
      } else if (retries < 30) {
        retries++;
        setTimeout(tryBind, 50);
      }
    };
    tryBind();

    return () => {
      cancelled = true;
      if (viewport) viewport.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [scrollKey, rootStatus]);

  useEffect(() => {
    if (rootStatus !== 'loaded') return;
    let saved = 0;
    try { saved = parseInt(localStorage.getItem(scrollKey) || '0', 10); } catch {}
    if (!saved || saved <= 0) return;

    let cancelled = false;
    let attempts = 0;
    let viewport: HTMLElement | null = null;

    const tryScroll = () => {
      if (cancelled || attempts >= 60) return;
      attempts++;
      const root = scrollAreaRef.current;
      viewport = root?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
      if (!viewport) {
        setTimeout(tryScroll, 50);
        return;
      }
      try { viewport.scrollTop = saved; } catch {}
      if (Math.abs(viewport.scrollTop - saved) > 2 && attempts < 60) {
        setTimeout(tryScroll, 50);
      }
    };
    const t = setTimeout(tryScroll, 60);

    return () => { cancelled = true; clearTimeout(t); };
  }, [rootStatus, scrollKey, expandedPaths]);

  const [searchText, setSearchText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadDir = useCallback(async (path: string): Promise<TreeNode[]> => {
    const data = await getRepoContents(owner, repo, path, branch);
    const items = Array.isArray(data) ? sortItems(data as GitHubContent[]) : [];
    return items.map(item => {
      const existing = nodeMapRef.current.get(item.path);
      if (existing) return existing;
      const node: TreeNode = { item, children: null, status: 'idle' };
      nodeMapRef.current.set(item.path, node);
      return node;
    });
  }, [owner, repo, branch]);

  const loadRoot = useCallback(async () => {
    setRootStatus('loading');
    nodeMapRef.current.clear();
    try {
      const nodes = await loadDir('');
      setRoots(nodes);
      setRootStatus('loaded');
    } catch {
      setRootStatus('error');
    }
  }, [loadDir]);

  useEffect(() => {
    if (owner && repo && branch) loadRoot();
  }, [loadRoot, refreshKey]);

  useEffect(() => {
    const last = lastActivePathRef.current;

    let targetPath: string | undefined;
    if (activePath && last && last.startsWith(activePath + '/')) {
      targetPath = last;
    } else {
      if (activePath) lastActivePathRef.current = activePath;
      targetPath = activePath || last;
    }

    if (!targetPath || rootStatus !== 'loaded') {
      setDiag(`skip: active=${activePath ?? 'null'} last=${last ?? 'null'} target=${targetPath ?? 'null'} status=${rootStatus}`);
      return;
    }
    setDiag(`start: target=${targetPath}`);

    const parts = targetPath.split('/');
    if (parts.length > 1) {
      const ancestors = parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
      setExpandedPaths(prev => {
        let changed = false;
        const next = new Set(prev);
        ancestors.forEach(p => { if (!next.has(p)) { next.add(p); changed = true; } });
        return changed ? next : prev;
      });
    }

    let cancelled = false;
    let attempts = 0;
    const tryScroll = () => {
      if (cancelled || attempts >= 40) return;
      attempts++;
      const root = scrollAreaRef.current;
      if (!root) { setTimeout(tryScroll, 60); return; }
      const viewport = root.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
      if (!viewport) { setTimeout(tryScroll, 60); return; }
      let el: HTMLElement | null = null;
      const all = viewport.querySelectorAll('[data-tree-path]');
      setDiag(`try${attempts}: total=${all.length} target=${targetPath}`);
      for (let i = 0; i < all.length; i++) {
        const h = all[i] as HTMLElement;
        if (h.dataset.treePath === targetPath) { el = h; break; }
      }
      if (!el) { setDiag(`try${attempts}: NOT FOUND target=${targetPath} total=${all.length}`); setTimeout(tryScroll, 80); return; }
      el.scrollIntoView({ block: 'center' });
      setDiag(`OK: scrolled to ${targetPath} attempts=${attempts}`);
    };
    const t = setTimeout(tryScroll, 80);
    return () => { cancelled = true; clearTimeout(t); };
  }, [activePath, rootStatus, expandedPaths]);

  const handleToggle = useCallback(async (path: string) => {
    const isExpanded = expandedPaths.has(path);
    if (isExpanded) {
      setExpandedPaths(prev => { const n = new Set(prev); n.delete(path); return n; });
      return;
    }
    const node = nodeMapRef.current.get(path);
    if (!node) return;

    setExpandedPaths(prev => new Set([...prev, path]));

    if (node.children !== null) return;

    node.status = 'loading';
    setRoots(prev => [...prev]);

    try {
      const children = await loadDir(path);
      node.children = children;
      node.status = 'loaded';
    } catch {
      node.status = 'error';
      node.children = [];
    }
    setRoots(prev => [...prev]);
  }, [expandedPaths, loadDir]);

  const handleFileClick = useCallback((item: GitHubContent) => {
    if (onFileClick) {
      onFileClick(item);
    } else {
      navigate(`/repos/${owner}/${repo}/code/${item.path}`);
    }
  }, [onFileClick, navigate, owner, repo]);

  const handleCopyPath = useCallback((path: string) => {
    copyToClipboard(path);
  }, []);

  const handleCopyRaw = useCallback((path: string) => {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    copyToClipboard(rawUrl);
  }, [owner, repo, branch]);

  const handleViewHistory = useCallback((item: GitHubContent) => {
    navigate(`/repos/${owner}/${repo}/commits/${branch}?path=${item.path}`);
  }, [navigate, owner, repo, branch]);

  const filteredRoots = useMemo(() => {
    if (!searchText.trim()) return roots;
    const q = searchText.toLowerCase();
    function collect(nodes: TreeNode[]): TreeNode[] {
      const result: TreeNode[] = [];
      for (const n of nodes) {
        const matches = n.item.name.toLowerCase().includes(q);
        if (matches) result.push(n);
        if (n.children) result.push(...collect(n.children));
      }
      return result;
    }
    return collect(roots);
  }, [roots, searchText]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border shrink-0">
        <span className="flex-1 text-xs font-semibold text-muted-foreground truncate uppercase tracking-wide px-1 select-none">
          {repo}
        </span>
        <button
          type="button"
          className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted/70 transition-colors"
          title={i18n.t('在根目录新建文件')}
          onClick={() => onNewFile?.('')}
        >
          <FilePlus className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button
          type="button"
          className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted/70 transition-colors"
          title={i18n.t('搜索文件')}
          onClick={() => {
            setShowSearch(v => !v);
            setTimeout(() => searchInputRef.current?.focus(), 50);
          }}
        >
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button
          type="button"
          className={cn('h-6 w-6 flex items-center justify-center rounded hover:bg-muted/70 transition-colors', rootStatus === 'loading' && 'pointer-events-none')}
          title={i18n.t('刷新')}
          onClick={loadRoot}
        >
          <RefreshCw className={cn('w-3.5 h-3.5 text-muted-foreground', rootStatus === 'loading' && 'animate-spin')} />
        </button>
      </div>

      {branches && branches.length > 0 && onBranchChange && (
        <div className="px-2 py-1.5 border-b border-border shrink-0">
          <Select value={branch} onValueChange={onBranchChange}>
            <SelectTrigger className="h-7 text-xs bg-secondary border-border text-foreground w-full gap-1">
              <GitBranch className="w-3 h-3 text-muted-foreground shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border max-h-48">
              {branches.map(b => (
                <SelectItem key={b.name} value={b.name} className="text-foreground font-mono text-xs">
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showSearch && (
        <div className="px-2 py-1.5 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder={i18n.t('搜索文件名...')}
              className="h-7 pl-6 pr-6 text-xs bg-secondary border-border"
            />
            {searchText && (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 -translate-y-1/2"
                onClick={() => setSearchText('')}
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="px-2 py-1 text-[9px] text-orange-500 bg-orange-500/10 font-mono break-all">
        DBG: {diag}
      </div>
      <ScrollArea ref={scrollAreaRef} className="flex-1">
        <div className="py-1 px-1">
          {rootStatus === 'loading' && roots.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {rootStatus === 'error' && (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <p className="text-xs">{i18n.t('加载失败')}</p>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={loadRoot}>
                <RefreshCw className="w-3 h-3 mr-1" />{i18n.t('重试')}</Button>
            </div>
          )}
          {rootStatus === 'loaded' && (
            <TreeNodeList
                commitMap={commitMap}
              nodes={searchText.trim() ? filteredRoots : roots}
              depth={0}
              expandedPaths={searchText.trim() ? new Set(filteredRoots.map(n => n.item.path)) : expandedPaths}
              activePath={activePath}
              onToggle={handleToggle}
              onFileClick={handleFileClick}
              onNewFile={onNewFile}
              onNewFolder={onNewFolder}
              onUpload={onUpload}
              onRename={onRename}
              onDelete={onDelete}
              onMove={onMove}
              onDownload={onDownload}
              onCopyPath={handleCopyPath}
              onCopyRaw={handleCopyRaw}
              onViewHistory={handleViewHistory}
              owner={owner}
              repo={repo}
              branch={branch}
              filterText={searchText}
            />
          )}
          {rootStatus === 'loaded' && filteredRoots.length === 0 && searchText && (
            <p className="text-xs text-muted-foreground text-center py-6">
              {i18n.t('没有匹配的文件')}</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

