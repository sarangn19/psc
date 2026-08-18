import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import OnboardingPage from './pages/OnboardingPage';
import AdaptivePage from './pages/AdaptivePage';
import HomePage from './pages/HomePage';
import LearningPage from './pages/LearningPage';
import ChaptersPage from './pages/ChaptersPage';
import NewsPage from './pages/NewsPage';
import PerformancePage from './pages/PerformancePage';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminUserDetail from './pages/admin/AdminUserDetail';
import AdminReports from './pages/admin/AdminReports';
import AdminQuestions from './pages/admin/AdminQuestions';
import AdminNews from './pages/admin/AdminNews';
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (user?.role === 'ADMIN') return <Navigate to="/admin" replace />;
  if (user && user.hasExams === false) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (user && user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { token, user, fetchMe } = useAuthStore();

  useEffect(() => {
    if (token && !user) fetchMe();
  }, [token]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />

        {/* Student routes */}
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<AdaptivePage />} />
          <Route path="adaptive" element={<AdaptivePage />} />
          <Route path="learning" element={<LearningPage />} />
          <Route path="chapters" element={<ChaptersPage />} />
          <Route path="news" element={<NewsPage />} />
          <Route path="performance" element={<PerformancePage />} />
        </Route>

        {/* Admin routes */}
        <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="users/:userId" element={<AdminUserDetail />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="questions" element={<AdminQuestions />} />
          <Route path="news" element={<AdminNews />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
