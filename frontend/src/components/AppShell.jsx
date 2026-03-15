import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import { MANAGEMENT_SECTION_ITEMS, buildManagementSectionPath } from '../constants/managementSections';
import { DASHBOARD_SECTION_ITEMS, buildDashboardSectionPath } from '../constants/dashboardSections';
import { preloadCoreRoutes, preloadRoute } from '../utils/routePreload';

const navItems = [
  { to: '/', label: 'Dashboard', permissions: [PERMISSIONS.DASHBOARD_VIEW] },
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
  {
    to: '/virtual-library',
    label: 'Biblioteca virtual',
    permissions: [PERMISSIONS.TEACHERS_ASSIGNMENTS_VIEW],
    adminOnly: true,
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

const ChevronIcon = ({ className = '' }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
    <path d="m6 8 4 4 4-4" />
  </svg>
);

const studentNavItems = [
  { to: '/courses', label: 'Mis cursos' },
  { to: '/my-grades', label: 'Mis notas' },
  { to: '/calendar', label: 'Mi calendario' },
  { to: '/payments', label: 'Mis pagos' },
  { to: '/certificates', label: 'Certificados' },
];

export default function AppShell() {
  const [open, setOpen] = useState(false);
  const [isDashboardExpanded, setIsDashboardExpanded] = useState(false);
  const [isManagementExpanded, setIsManagementExpanded] = useState(false);
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
  const isDashboardRoute = location.pathname === '/';
  const isManagementRoute = location.pathname === '/management';
  const activeCoursesTab = location.pathname === '/courses' ? new URLSearchParams(location.search).get('tab') : null;
  const isAttendanceTabActive = activeCoursesTab === 'attendance';
  const isCourseWorkspaceRoute = location.pathname.startsWith('/courses/salon/');
  const requestedDashboardSection = isDashboardRoute
    ? new URLSearchParams(location.search).get('section')
    : null;
  const requestedManagementSection = isManagementRoute
    ? new URLSearchParams(location.search).get('section')
    : null;

  const isNavItemActive = (itemPath, pathActive) => {
    if (itemPath === '/courses?tab=attendance') {
      if (isCourseWorkspaceRoute) return true;
      return location.pathname === '/courses' && isAttendanceTabActive;
    }
    return pathActive;
  };

  const visibleManagementItems = useMemo(() => {
    if (isAlumnoProfile || isDocenteProfile) {
      return [];
    }

    return MANAGEMENT_SECTION_ITEMS.filter((item) => hasAnyPermission(item.permissions || []));
  }, [hasAnyPermission, isAlumnoProfile, isDocenteProfile]);

  const visibleDashboardItems = useMemo(() => {
    if (isAlumnoProfile || isTeacher2222) {
      return [];
    }

    return DASHBOARD_SECTION_ITEMS.filter((item) => hasAnyPermission(item.permissions || []));
  }, [hasAnyPermission, isAlumnoProfile, isTeacher2222]);

  const activeDashboardSection = useMemo(() => {
    if (!visibleDashboardItems.length) return null;
    const requested = String(requestedDashboardSection || '').trim();
    if (requested && visibleDashboardItems.some((item) => item.key === requested)) {
      return requested;
    }
    return visibleDashboardItems[0]?.key || null;
  }, [requestedDashboardSection, visibleDashboardItems]);

  const activeManagementSection = useMemo(() => {
    if (!visibleManagementItems.length) return null;
    const requested = String(requestedManagementSection || '').trim();
    if (requested && visibleManagementItems.some((item) => item.key === requested)) {
      return requested;
    }
    return visibleManagementItems[0]?.key || null;
  }, [requestedManagementSection, visibleManagementItems]);

  const visibleItems = navItems.filter((item) => {
    if (isAlumnoProfile) {
      return false;
    }
    if (item.adminOnly && isDocenteProfile) return false;
    if (item.to === '/certificates') return false;
    if (!hasAnyPermission(item.permissions || [])) return false;
    if (isTeacher2222 && item.to === '/') return false;
    if (isDocenteProfile && item.to === '/teachers') return false;
    return true;
  });
  const secondaryItems = visibleItems.filter((item) => item.to !== '/');
  const resolvedItems = isAlumnoProfile ? studentNavItems : secondaryItems;

  const isCertificatesRoute = location.pathname === '/certificates';

  useEffect(() => {
    if (!isDashboardRoute) {
      setIsDashboardExpanded(false);
    }
  }, [isDashboardRoute]);

  useEffect(() => {
    if (!isManagementRoute) {
      setIsManagementExpanded(false);
    }
  }, [isManagementRoute]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handlePrimaryNavClick = () => {
    setIsDashboardExpanded(false);
    setIsManagementExpanded(false);
    setOpen(false);
  };

  const handleDashboardClick = () => {
    const nextExpanded = !isDashboardExpanded;
    setIsDashboardExpanded(nextExpanded);
    setIsManagementExpanded(false);

    if (nextExpanded) {
      const defaultSectionKey = activeDashboardSection || visibleDashboardItems[0]?.key;
      if (defaultSectionKey && !isDashboardRoute) {
        navigate(buildDashboardSectionPath(defaultSectionKey));
      }
    }
  };

  const handleManagementClick = () => {
    const nextExpanded = !isManagementExpanded;
    setIsManagementExpanded(nextExpanded);
    setIsDashboardExpanded(false);

    if (nextExpanded) {
      const defaultSectionKey = activeManagementSection || visibleManagementItems[0]?.key;
      if (defaultSectionKey && !isManagementRoute) {
        navigate(buildManagementSectionPath(defaultSectionKey));
      }
    }
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
          {isAlumnoProfile ? (
            resolvedItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={handlePrimaryNavClick}
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
            ))
          ) : (
            <>
              {visibleDashboardItems.length ? (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={handleDashboardClick}
                    onMouseEnter={() => preloadRoute('/')}
                    onFocus={() => preloadRoute('/')}
                    className={
                      `block rounded-xl px-3 py-2 text-sm font-medium transition ${
                        isDashboardRoute || isDashboardExpanded
                          ? 'bg-primary-500 text-white'
                          : 'text-primary-100 hover:bg-primary-800 hover:text-white'
                      }`
                    }
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span>Dashboard</span>
                      <ChevronIcon className={`h-4 w-4 transition ${isDashboardExpanded ? 'rotate-180' : ''}`} />
                    </span>
                  </button>

                  <div
                    className={`overflow-hidden transition-all duration-200 ${
                      isDashboardExpanded ? 'max-h-[220px] opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="ml-3 space-y-1 border-l border-primary-700/80 pl-3 pt-1">
                      {visibleDashboardItems.map((item) => {
                        const isSubItemActive = activeDashboardSection === item.key;
                        return (
                          <NavLink
                            key={item.key}
                            to={buildDashboardSectionPath(item.key)}
                            onClick={() => setOpen(false)}
                            onMouseEnter={() => preloadRoute('/')}
                            onFocus={() => preloadRoute('/')}
                            className={() =>
                              `block rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] transition ${
                                isSubItemActive
                                  ? 'bg-primary-800 text-white'
                                  : 'text-primary-200 hover:bg-primary-800 hover:text-white'
                              }`
                            }
                          >
                            {item.label}
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              {visibleManagementItems.length ? (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={handleManagementClick}
                    onMouseEnter={() => preloadRoute('/management')}
                    onFocus={() => preloadRoute('/management')}
                    className={
                      `block rounded-xl px-3 py-2 text-sm font-medium transition ${
                        isManagementRoute || isManagementExpanded
                          ? 'bg-primary-500 text-white'
                          : 'text-primary-100 hover:bg-primary-800 hover:text-white'
                      }`
                    }
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span>Gestión académica</span>
                      <ChevronIcon className={`h-4 w-4 transition ${isManagementExpanded ? 'rotate-180' : ''}`} />
                    </span>
                  </button>

                  <div
                    className={`overflow-hidden transition-all duration-200 ${
                      isManagementExpanded ? 'max-h-[420px] opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="ml-3 space-y-1 border-l border-primary-700/80 pl-3 pt-1">
                      {visibleManagementItems.map((item) => {
                        const isSubItemActive = activeManagementSection === item.key;
                        return (
                          <NavLink
                            key={item.key}
                            to={buildManagementSectionPath(item.key)}
                            onClick={() => setOpen(false)}
                            onMouseEnter={() => preloadRoute('/management')}
                            onFocus={() => preloadRoute('/management')}
                            className={() =>
                              `block rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] transition ${
                                isSubItemActive
                                  ? 'bg-primary-800 text-white'
                                  : 'text-primary-200 hover:bg-primary-800 hover:text-white'
                              }`
                            }
                          >
                            {item.label}
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              {resolvedItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={handlePrimaryNavClick}
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
            </>
          )}
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
