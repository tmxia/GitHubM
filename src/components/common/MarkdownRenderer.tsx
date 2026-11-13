

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { useNavigate } from 'react-router-dom';

export interface RepoLinkContext {
  branch?: string;
  owner: string;
  repo: string;

  ref?: string;

  path?: string;
}

interface MarkdownRendererProps {
  onLinkClick?: (href: string) => Promise<boolean>;
  content: string;
  className?: string;

  repoContext?: RepoLinkContext;
}

const ABSOLUTE_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function normalizeRepoPath(input: string): string {
  const out: string[] = [];
  for (const raw of input.split('/')) {
    const seg = raw.trim();
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.join('/');
}

function dirname(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx < 0 ? '' : path.slice(0, idx);
}

export function isReadmeFilePath(path: string | undefined): boolean {
  if (!path) return false;
  const base = path.split('/').pop() || '';
  return /^readme([._-].*)?\.(md|markdown|mdown|mkd|mdx)$/i.test(base);
}

function splitHref(href: string): { pathPart: string; query: string; hash: string } {
  let rest = href;
  let hash = '';
  const hashIdx = rest.indexOf('#');
  if (hashIdx >= 0) {
    hash = rest.slice(hashIdx);
    rest = rest.slice(0, hashIdx);
  }
  let query = '';
  const queryIdx = rest.indexOf('?');
  if (queryIdx >= 0) {
    query = rest.slice(queryIdx);
    rest = rest.slice(0, queryIdx);
  }
  return { pathPart: rest, query, hash };
}

function encodeRepoPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function rawFileUrl(ctx: RepoLinkContext, path: string): string {
  const ref = ctx.ref || 'HEAD';
  return `https://raw.githubusercontent.com/${ctx.owner}/${ctx.repo}/${encodeURIComponent(ref)}/${encodeRepoPath(path)}`;
}

export function resolveMarkdownHref(
  href: string | undefined,
  ctx?: RepoLinkContext
): { kind: 'anchor'; href: string } | { kind: 'internal'; path: string; hash: string } | { kind: 'external'; href: string } | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('#')) return { kind: 'anchor', href: trimmed };

  const { pathPart, query, hash } = splitHref(trimmed);

  if (ABSOLUTE_SCHEME.test(pathPart) || pathPart.startsWith('//')) {
    const absolute = pathPart.startsWith('//') ? `https:${pathPart}` : pathPart;

    if (ctx) {
      try {
        const url = new URL(absolute);
        if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
          const segments = url.pathname.split('/').filter(Boolean);

          if (
            segments.length >= 5 &&
            segments[0].toLowerCase() === ctx.owner.toLowerCase() &&
            segments[1].toLowerCase() === ctx.repo.toLowerCase() &&
            ['blob', 'tree', 'raw'].includes(segments[2])
          ) {
            const targetPath = normalizeRepoPath(segments.slice(4).join('/'));
            if (segments[2] === 'raw') {
              return { kind: 'external', href: rawFileUrl(ctx, targetPath) };
            }
            return { kind: 'internal', path: targetPath, hash };
          }
        }
        if (url.hostname === 'raw.githubusercontent.com') {
          const segments = url.pathname.split('/').filter(Boolean);
          if (
            segments.length >= 4 &&
            segments[0].toLowerCase() === ctx.owner.toLowerCase() &&
            segments[1].toLowerCase() === ctx.repo.toLowerCase()
          ) {
            return { kind: 'internal', path: normalizeRepoPath(segments.slice(3).join('/')), hash };
          }
        }
      } catch {
        // 非法 URL，按普通外链处理
      }
    }
    return { kind: 'external', href: `${absolute}${query}${hash}` };
  }

  if (!ctx) return { kind: 'external', href: trimmed };

  const baseDir = dirname(ctx.path || '');
  const resolved = trimmed.startsWith('/')
    ? normalizeRepoPath(pathPart)
    : normalizeRepoPath(`${baseDir}/${pathPart}`);

  return { kind: 'internal', path: resolved, hash };
}

export function resolveMarkdownImage(src: string | undefined, ctx?: RepoLinkContext): string | undefined {
  if (!src) return src;
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('#')) return trimmed;
  if (ABSOLUTE_SCHEME.test(trimmed) || trimmed.startsWith('//')) {
    return trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
  }
  if (!ctx) return trimmed;

  const baseDir = dirname(ctx.path || '');
  const resolved = trimmed.startsWith('/')
    ? normalizeRepoPath(trimmed)
    : normalizeRepoPath(`${baseDir}/${trimmed}`);
  return rawFileUrl(ctx, resolved);
}

export default function MarkdownRenderer({ content, className, repoContext, onLinkClick }: MarkdownRendererProps) {
  const navigate = useNavigate();

  return (
    <div className={`markdown-body ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeRaw]}
        components={{

          img: ({ src, alt, node: _node, ...props }) => (
            <img
              src={resolveMarkdownImage(typeof src === 'string' ? src : undefined, repoContext)}
              alt={alt || ''}
              {...props}
              loading="lazy"
              className="max-w-full rounded"
            />
          ),

          a: ({ href, children, node: _node, ...props }) => {
            const target = resolveMarkdownHref(typeof href === 'string' ? href : undefined, repoContext);

            if (target?.kind === 'internal') {

              const isReadmeSwitch =
                !!repoContext && isReadmeFilePath(target.path);
              const to = isReadmeSwitch
                ? `/repos/${repoContext!.owner}/${repoContext!.repo}?readme=${encodeURIComponent(target.path || 'README.md')}${target.hash}`
                : `/repos/${repoContext!.owner}/${repoContext!.repo}/code${target.path ? `/${target.path}` : ''}${target.hash}`;
              return (
                <a
                  href={`#${to}`}
                  {...props}
                  onClick={async (e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    
                    // 核心修复：优先调用外部传进来的拦截器（如 RepoDetailPage 里的无缝切换）
                    if (onLinkClick) {
                      const handled = await onLinkClick(href || '');
                      if (handled) return;
                    }
                    
                    // 如果外部没有处理，才执行默认路由跳转
                    navigate(to);
                  }}
                >
                  {children}
                </a>
              );
            }

            const isExternal = target?.kind === 'external';
            return (
              <a
                href={isExternal ? target.href : href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                {...props}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}