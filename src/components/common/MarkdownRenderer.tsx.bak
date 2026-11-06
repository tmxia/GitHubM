
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import ImageLightbox from './ImageLightbox';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  repoContext?: { owner: string; repo: string; branch: string };
  onLinkClick?: (href: string) => boolean | Promise<boolean>;
}

export default function MarkdownRenderer({ content, className, repoContext, onLinkClick }: MarkdownRendererProps) {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  return (
    <div className={`markdown-body break-words [&_a]:break-all [&_p]:break-all ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeRaw]}
        components={{
          table: ({ children, ...props }) => (
            <div className="md-table-wrapper">
              <table {...props}>{children}</table>
            </div>
          ),
          img: ({ src, alt, ...props }) => {
            let realSrc = src || '';
            
            if (repoContext && realSrc && !realSrc.startsWith('http') && !realSrc.startsWith('data:') && !realSrc.startsWith('file:')) {
              const cleanPath = realSrc.replace(/^\.\//, '').replace(/^\//, '');
              realSrc = `https://raw.githubusercontent.com/${repoContext.owner}/${repoContext.repo}/${repoContext.branch}/${cleanPath}`;
            }
            return (
              <img
                src={realSrc}
                alt={alt || ''}
                {...props}
                loading="lazy"
                className="max-w-full rounded cursor-zoom-in"
                onClick={(e) => {
                  if (realSrc) {
                    e.preventDefault();
                    e.stopPropagation();
                    setPreviewSrc(realSrc);
                  }
                }}
              />
            );
          },
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target={href?.startsWith('http') ? '_blank' : undefined}
              rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
              onClick={(e) => {
                if (onLinkClick && href && onLinkClick(href)) {
                  e.preventDefault();
                }
              }}
              {...props}
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {previewSrc && (
        <ImageLightbox src={previewSrc} alt="" onClose={() => setPreviewSrc(null)} />
      )}
    </div>
  );
}
