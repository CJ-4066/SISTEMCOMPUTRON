import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ManagementPage = lazy(() => import('./pages/ManagementPage'));
const StudentsPage = lazy(() => import('./pages/StudentsPage'));
const CoursesPage = lazy(() => import('./pages/CoursesPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const TeachersPage = lazy(() => import('./pages/TeachersPage'));
const CourseWorkspacePage = lazy(() => import('./pages/CourseWorkspacePage'));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage'));
const CertificateLibraryPage = lazy(() => import('./pages/CertificateLibraryPage'));
const CertificatesPage = lazy(() => import('./pages/CertificatesPage'));
const StudentGradesPage = lazy(() => import('./pages/StudentGradesPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const VirtualLibraryPage = lazy(() => import('./pages/VirtualLibraryPage'));

const routeFallback = (
  <section className="card">
    <p className="text-sm text-primary-700">Cargando módulo...</p>
  </section>
);

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <Suspense fallback={routeFallback}>
                <LoginPage />
              </Suspense>
            }
          />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route
                path="/"
                element={
                  <Suspense fallback={routeFallback}>
                    <DashboardPage />
                  </Suspense>
                }
              />
              <Route
                path="/management"
                element={
                  <Suspense fallback={routeFallback}>
                    <ManagementPage />
                  </Suspense>
                }
              />
              <Route
                path="/students"
                element={
                  <Suspense fallback={routeFallback}>
                    <StudentsPage />
                  </Suspense>
                }
              />
              <Route
                path="/teachers"
                element={
                  <Suspense fallback={routeFallback}>
                    <TeachersPage />
                  </Suspense>
                }
              />
              <Route
                path="/courses"
                element={
                  <Suspense fallback={routeFallback}>
                    <CoursesPage />
                  </Suspense>
                }
              />
              <Route
                path="/courses/salon/:assignmentId"
                element={
                  <Suspense fallback={routeFallback}>
                    <CourseWorkspacePage />
                  </Suspense>
                }
              />
              <Route
                path="/calendar"
                element={
                  <Suspense fallback={routeFallback}>
                    <CalendarPage />
                  </Suspense>
                }
              />
              <Route path="/grades" element={<Navigate to="/management" replace />} />
              <Route
                path="/my-grades"
                element={
                  <Suspense fallback={routeFallback}>
                    <StudentGradesPage />
                  </Suspense>
                }
              />
              <Route path="/enrollments" element={<Navigate to="/management" replace />} />
              <Route
                path="/payments"
                element={
                  <Suspense fallback={routeFallback}>
                    <PaymentsPage />
                  </Suspense>
                }
              />
              <Route
                path="/certificate-library"
                element={
                  <Suspense fallback={routeFallback}>
                    <CertificateLibraryPage />
                  </Suspense>
                }
              />
              <Route
                path="/virtual-library"
                element={
                  <Suspense fallback={routeFallback}>
                    <VirtualLibraryPage />
                  </Suspense>
                }
              />
              <Route
                path="/certificates"
                element={
                  <Suspense fallback={routeFallback}>
                    <CertificatesPage />
                  </Suspense>
                }
              />
              <Route path="/reports" element={<Navigate to="/management" replace />} />
              <Route path="/notifications" element={<Navigate to="/management" replace />} />
              <Route
                path="/users"
                element={
                  <Suspense fallback={routeFallback}>
                    <UsersPage />
                  </Suspense>
                }
              />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
