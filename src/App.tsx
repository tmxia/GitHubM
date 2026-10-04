import React, { useEffect, Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layouts/MainLayout';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { NetworkStatusBanner } from '@/components/NetworkStatusBanner';
import { routes } from './routes';
import { recordVisit } from '@/lib/visitStats';
import { startPolling } from '@/lib/compilePoller';

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function VisitTracker() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname || '/';
    recordVisit(path);
  }, [location.pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        const path = location.pathname || '/';
        recordVisit(path);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [location.pathname]);

  return null;
}

function AppContent() {
  const { loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    startPolling();
  }, [loading]);

  useEffect(() => {
    if (!loading) {
      (window as any).AndroidBridge?.notifyReady();
    }
  }, [loading]);

  return (
    <>
      <VisitTracker />
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-screen bg-background">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground">加载中…</span>
            </div>
          </div>
        }
      >
      <Routes>
        {routes
          .filter((r) => r.public)
          .map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}

        {routes
          .filter((r) => !r.public)
          .map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={
                <RouteGuard>
                  <MainLayout>{route.element}</MainLayout>
                </RouteGuard>
              }
            />
          ))}

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      <NetworkStatusBanner />
      <Toaster richColors position="top-right" />
    </>
  );
}

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
};

export default App;
