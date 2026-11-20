

import React, { useState } from 'react';
import { lsSet } from '@/lib/storage';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ChevronDown, Globe } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

const TOKEN_URL = 'https://github.com/settings/tokens/new';

function BrandMark({ label }: { label: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      role="img"
      aria-label={label}
      className="h-20 w-20 text-primary"
    >
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59c.4.07.55-.17.55-.38c0-.19-.01-.82-.01-1.49c-2.01.37-2.53-.49-2.69-.94c-.09-.23-.48-.94-.82-1.13c-.28-.15-.68-.52-.01-.53c.63-.01 1.08.58 1.23.82c.72 1.21 1.87.87 2.33.66c.07-.52.28-.87.51-1.07c-1.78-.2-3.64-.89-3.64-3.95c0-.87.31-1.59.82-2.15c-.08-.2-.36-1.02.08-2.12c0 0 .67-.21 2.2.82c.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82c.44 1.1.16 1.92.08 2.12c.51.56.82 1.27.82 2.15c0 3.07-1.87 3.75-3.65 3.95c.29.25.54.73.54 1.48c0 1.07-.01 1.93-.01 2.2c0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    lsSet('app_language', lng);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError(t('login.errorEmpty'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(token.trim());
      toast.success(t('login.success'));
      navigate('/');
    } catch (err) {
      const status = (err as Error & { status?: number })?.status;
      const message = err instanceof Error ? err.message : 'Login failed';

      if (status === 401 || message.includes('Bad credentials') || message.includes('Requires authentication')) {
        setError(t('login.errInvalid'));
      } else if (status === 403) {
        setError(t('login.errPerm'));
      } else if (status === 404) {
        setError(t('login.errFetch'));
      } else if (
        message.includes('Failed to fetch') ||
        message.includes('NetworkError') ||
        message.includes('Network request failed') ||
        !window.navigator.onLine
      ) {
        setError(t('login.errNetwork'));
      } else {
        setError(t('login.errFail', { message }));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[400px] flex-col px-5">

        <div className="flex justify-end pt-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 rounded-md px-1.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Globe className="h-3.5 w-3.5" />
                {i18n.language === 'en' ? 'EN' : '中文'}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={() => changeLanguage('zh-CN')} className={i18n.language === 'zh-CN' ? 'bg-secondary' : ''}>
                简体中文
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => changeLanguage('en')} className={i18n.language === 'en' ? 'bg-secondary' : ''}>
                English
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-1 items-center justify-center pb-10 pt-4">
          <div className="w-full">

            <div className="mb-6 flex flex-col items-center text-center">
              <BrandMark label={t('login.title')} />
              <h1 className="mt-4 text-[21px] font-semibold tracking-tight text-foreground">
                {t('login.title')}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">{t('login.subtitle')}</p>
            </div>

            <div className="login-card w-full">

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Label htmlFor="token" className="block text-center text-xs font-normal text-foreground">
                  {t('login.tokenLabel')}
                </Label>
                <div className="relative mt-1.5">
                  <Input
                    id="token"
                    type="text"
                    inputMode="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="login-underline h-11 text-[15px] font-mono text-foreground"
                    style={showToken ? undefined : ({ WebkitTextSecurity: 'disc' } as React.CSSProperties)}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    aria-label={showToken ? 'Hide token' : 'Show token'}
                    className="absolute bottom-0 right-0 h-11 w-8"
                  />
                </div>
              </div>

              {error && (
                <p className="flex items-start gap-1.5 text-[13px] leading-relaxed text-destructive">
                  <AlertCircle className="mt-[2px] h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !token.trim()}
                className="login-cta flex h-12 w-full items-center justify-center gap-2 text-[15px] font-medium disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    {t('login.loading')}
                  </span>
                ) : (
                  t('login.button')
                )}
              </button>
            </form>
            </div>

            <div className="mt-6 text-center">
              <a
                href={TOKEN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary"
              >
                {t('login.getToken')}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
