import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import { preloadCoreRoutes, preloadRoute } from '../utils/routePreload';

const navItems = [
  { to: '/', label: 'Dashboard', permissions: [PERMISSIONS.DASHBOARD_VIEW] },
  {
    to: '/management',
    label: 'Gestión académica',
    permissions: [
      PERMISSIONS.STUDENTS_VIEW,
      PERMISSIONS.STUDENTS_MANAGE,
      PERMISSIONS.TEACHERS_VIEW,
      PERMISSIONS.COURSES_VIEW,
      PERMISSIONS.COURSES_MANAGE,
      PERMISSIONS.CAMPUSES_VIEW,
      PERMISSIONS.CAMPUSES_MANAGE,
      PERMISSIONS.PERIODS_VIEW,
      PERMISSIONS.PERIODS_MANAGE,
      PERMISSIONS.PAYMENTS_VIEW,
      PERMISSIONS.PAYMENTS_MANAGE,
    ],
  },
  {
    to: '/courses?tab=attendance',
    label: 'Asistencias',
    permissions: [PERMISSIONS.TEACHERS_ASSIGNMENTS_VIEW, PERMISSIONS.ACADEMIC_ATTENDANCE_MANAGE],
  },
  {
    to: '/calendar',
    label: 'Calendario',
    permissions: [PERMISSIONS.TEACHERS_ASSIGNMENTS_VIEW],
  },
  { to: '/payments', label: 'Reporte de pagos', permissions: [PERMISSIONS.PAYMENTS_VIEW] },
  {
    to: '/certificate-library',
    label: 'Biblioteca de certificados',
    permissions: [PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.PAYMENTS_MANAGE],
  },
  { to: '/certificates', label: 'Certificados', permissions: [PERMISSIONS.PAYMENTS_VIEW] },
  { to: '/users', label: 'Usuarios', permissions: [PERMISSIONS.USERS_VIEW] },
];

const studentNavItems = [
  { to: '/courses', label: 'Mis cursos' },
  { to: '/my-grades', label: 'Mis notas' },
  { to: '/calendar', label: 'Mi calendario' },
  { to: '/payments', label: 'Mis pagos' },
  { to: '/certificates', label: 'Certificados' },
];

export default function AppShell() {
  const [open, setOpen] = useState(false);
  const { user, logout, hasAnyPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelPreload = null;

    const startPreload = () => {
      if (cancelPreload) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      cancelPreload = preloadCoreRoutes();
    };

    const timeoutId = window.setTimeout(startPreload, 2200);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !cancelPreload) {
        startPreload();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelPreload?.();
    };
  }, []);

  const roles = useMemo(() => user?.roles || [], [user]);
  const isDocenteProfile = roles.length === 1 && roles.includes('DOCENTE');
  const isAlumnoProfile = roles.length === 1 && roles.includes('ALUMNO');
  const isTeacher2222 =
    user?.email?.trim().toLowerCase() === '2222@gmail.com' && roles.includes('DOCENTE');
  const activeCoursesTab = location.pathname === '/courses' ? new URLSearchParams(location.search).get('tab') : null;
  const isAttendanceTabActive = activeCoursesTab === 'attendance';
  const isCourseWorkspaceRoute = location.pathname.startsWith('/courses/salon/');

  const isNavItemActive = (itemPath, pathActive) => {
    if (itemPath === '/courses?tab=attendance') {
      if (isCourseWorkspaceRoute) return true;
      return location.pathname === '/courses' && isAttendanceTabActive;
    }
    return pathActive;
  };

  const visibleItems = navItems.filter((item) => {
    if (isAlumnoProfile) {
      return false;
    }
    if (item.to === '/certificates') return false;
    if (!hasAnyPermission(item.permissions || [])) return false;
    if (isDocenteProfile && item.to === '/management') return false;
    if (isTeacher2222 && item.to === '/') return false;
    if (isDocenteProfile && item.to === '/teachers') return false;
    return true;
  });
  const resolvedItems = isAlumnoProfile ? studentNavItems : visibleItems;

  const isCertificatesRoute = location.pathname === '/certificates';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside
        className={`fixed left-0 top-0 z-20 h-full w-[260px] transform border-r border-primary-200 bg-primary-900 text-primary-50 transition lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b border-primary-700 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-primary-200">Instituto</p>
          <h1 className="text-xl font-semibold">Computron</h1>
          <p className="mt-2 text-sm text-primary-200">{user?.first_name} {user?.last_name}</p>
          <p className="text-xs text-primary-300">{roles.join(' · ')}</p>
        </div>

        <nav className="space-y-1 p-3">
          {resolvedItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              onMouseEnter={() => preloadRoute(item.to)}
              onFocus={() => preloadRoute(item.to)}
              className={({ isActive }) =>
                `block rounded-xl px-3 py-2 text-sm font-medium transition ${
                  isNavItemActive(item.to, isActive)
                    ? 'bg-primary-500 text-white'
                    : 'text-primary-100 hover:bg-primary-800 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 w-full border-t border-primary-700 p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-xl border border-primary-300 px-3 py-2 text-sm font-medium text-primary-50 transition hover:bg-primary-800"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="min-h-screen lg:ml-0">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-primary-100 bg-white/90 px-4 py-3 backdrop-blur">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-lg border border-primary-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide lg:hidden"
          >
            Menú
          </button>
          <h2 className="text-lg font-semibold text-primary-800">Sistema de Gestión</h2>
          <span className="rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold text-accent-700">
            Online
          </span>
        </header>

        <main className={isCertificatesRoute ? 'w-full p-2 md:p-3' : 'mx-auto w-full max-w-7xl p-4 md:p-6'}>
          <Outlet />
        </main>
      </div>

      {open ? (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-10 bg-primary-950/30 lg:hidden"
        />
      ) : null}
    </div>
  );
}
