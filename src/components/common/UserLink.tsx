

import type { ReactNode, MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function userProfilePath(login: string): string {
  return `/users/${encodeURIComponent(login)}/repos`;
}

interface UserLinkProps {
  login: string;
  children: ReactNode;
  className?: string;
  title?: string;

  stopPropagation?: boolean;
}

export function UserLink({
  login,
  children,
  className,
  title,
  stopPropagation = true,
}: UserLinkProps) {
  const navigate = useNavigate();
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (stopPropagation) e.stopPropagation();

    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(userProfilePath(login));
  };
  return (
    <a
      href={`#${userProfilePath(login)}`}
      title={title ?? `@${login}`}
      onClick={handleClick}
      className={cn('cursor-pointer', className)}
    >
      {children}
    </a>
  );
}
