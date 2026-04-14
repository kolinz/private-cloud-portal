// packages/frontend/src/App.tsx

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.tsx';
import AppLayout from './components/layout/AppLayout.tsx';
import LoginPage from './pages/LoginPage.tsx';
import DashboardPage from './pages/DashboardPage.tsx';
import InstancesPage from './pages/InstancesPage.tsx';
import InstanceDetailPage from './pages/InstanceDetailPage.tsx';
import StorageVolumesPage from './pages/StorageVolumesPage.tsx';
import TemplatesPage from './pages/TemplatesPage.tsx';
import UsersPage from './pages/UsersPage.tsx';
import ProxyPage from './pages/ProxyPage.tsx';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/instances" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/"
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            {/* デフォルト: admin は /dashboard、user は /instances */}
            <Route index element={<DefaultRedirect />} />

            {/* Admin 専用 */}
            <Route path="dashboard" element={
              <RequireAdmin><DashboardPage /></RequireAdmin>
            } />
            <Route path="templates" element={
              <RequireAdmin><TemplatesPage /></RequireAdmin>
            } />
            <Route path="users" element={
              <RequireAdmin><UsersPage /></RequireAdmin>
            } />
            <Route path="proxy" element={
              <RequireAdmin><ProxyPage /></RequireAdmin>
            } />

            {/* 全ユーザー */}
            <Route path="instances"    element={<InstancesPage />} />
            <Route path="instances/:id" element={<InstanceDetailPage />} />
            <Route path="storage"      element={<StorageVolumesPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function DefaultRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.role === 'admin' ? '/dashboard' : '/instances'} replace />;
}
