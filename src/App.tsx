import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layouts/MainLayout';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { NetworkStatusBanner } from '@/components/NetworkStatusBanner';
import { routes } from './routes';
import { recordVisit } from '@/lib/visitStats';

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
    if (!loading) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).AndroidBridge?.notifyReady();
    }
  }, [loading]);

  return (
    <>
      <VisitTracker />
      <Routes>
        {/* 公开路由（登录页） */}
        {routes
          .filter((r) => r.public)
          .map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}

        {/* 受保护路由（需要登录） */}
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

        {/* 404 重定向 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
