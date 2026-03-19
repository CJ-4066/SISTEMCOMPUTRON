import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BookOpenText,
  CalendarRange,
  ClipboardCheck,
  FileBadge,
  House,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Menu,
  NotebookTabs,
  ReceiptText,
  School,
  ShieldCheck,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import { MANAGEMENT_SECTION_ITEMS, buildManagementSectionPath } from '../constants/managementSections';
import { DASHBOARD_SECTION_ITEMS, buildDashboardSectionPath } from '../constants/dashboardSections';
import { preloadCoreRoutes, preloadRoute } from '../utils/routePreload';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, permissions: [PERMISSIONS.DASHBOARD_VIEW] },
  {
    to: '/courses',
    label: 'Salones',
    icon: BookOpenText,
    permissions: [PERMISSIONS.TEACHERS_ASSIGNMENTS_VIEW],
  },
  {
    to: '/students?tab=transfers',
    label: 'Traslados',
    icon: ArrowLeftRight,
    permissions: [PERMISSIONS.STUDENTS_VIEW, PERMISSIONS.ENROLLMENTS_MANAGE],
    roles: ['ADMIN'],
  },
  {
    to: '/courses?tab=attendance',
    label: 'Asistencias',
    icon: ClipboardCheck,
    permissions: [PERMISSIONS.TEACHERS_ASSIGNMENTS_VIEW, PERMISSIONS.ACADEMIC_ATTENDANCE_MANAGE],
  },
  {
    to: '/calendar',
    label: 'Calendario',
    icon: CalendarRange,
    permissions: [PERMISSIONS.TEACHERS_ASSIGNMENTS_VIEW],
  },
  {
    to: '/virtual-library',
    label: 'Biblioteca virtual',
    icon: LibraryBig,
    permissions: [PERMISSIONS.TEACHERS_ASSIGNMENTS_VIEW],
    adminOnly: true,
  },
  { to: '/payments', label: 'Reporte de pagos', icon: ReceiptText, permissions: [PERMISSIONS.PAYMENTS_VIEW] },
  {
    to: '/certificate-library',
    label: 'Biblioteca de certificados',
    icon: FileBadge,
    permissions: [PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.PAYMENTS_MANAGE],
  },
  { to: '/certificates', label: 'Certificados', icon: ShieldCheck, permissions: [PERMISSIONS.PAYMENTS_VIEW] },
  { to: '/users', label: 'Usuarios', icon: UsersRound, permissions: [PERMISSIONS.USERS_VIEW] },
];

const ChevronIcon = ({ className = '' }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
    <path d="m6 8 4 4 4-4" />
  </svg>
);

const studentNavItems = [
  { to: '/courses', label: 'Mis cursos', icon: BookOpenText },
  { to: '/my-grades', label: 'Mis notas', icon: NotebookTabs },
  { to: '/calendar', label: 'Mi calendario', icon: CalendarRange },
  { to: '/payments', label: 'Mis pagos', icon: Wallet },
  { to: '/certificates', label: 'Certificados', icon: FileBadge },
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
  const isAdminProfile = roles.includes('ADMIN');
  const isDocenteProfile = roles.length === 1 && roles.includes('DOCENTE');
  const isAlumnoProfile = roles.length === 1 && roles.includes('ALUMNO');
  const isTeacher2222 =
    user?.email?.trim().toLowerCase() === '2222@gmail.com' && roles.includes('DOCENTE');
  const isDashboardRoute = location.pathname === '/';
  const isManagementRoute = location.pathname === '/management';
  const activeStudentTab = location.pathname === '/students' ? new URLSearchParams(location.search).get('tab') : null;
  const isStudentTransfersRoute = location.pathname === '/students' && activeStudentTab === 'transfers';
  const activeCoursesTab = location.pathname === '/courses' ? new URLSearchParams(location.search).get('tab') : null;
  const isAttendanceTabActive = activeCoursesTab === 'attendance';
  const isCourseWorkspaceRoute = location.pathname.startsWith('/courses/salon/');
  const isCoursesOverviewRoute =
    (location.pathname === '/courses' && activeCoursesTab !== 'attendance') || isCourseWorkspaceRoute;
  const requestedDashboardSection = isDashboardRoute
    ? new URLSearchParams(location.search).get('section')
    : null;
  const requestedManagementSection = isManagementRoute
    ? new URLSearchParams(location.search).get('section')
    : null;
  const canUseTransfersShortcut =
    isAdminProfile && hasAnyPermission([PERMISSIONS.STUDENTS_VIEW, PERMISSIONS.ENROLLMENTS_MANAGE]);

  const isNavItemActive = (itemPath, pathActive) => {
    if (itemPath === '/courses') {
      return isCoursesOverviewRoute;
    }
    if (itemPath === '/students?tab=transfers') {
      return location.pathname === '/students' && activeStudentTab === 'transfers';
    }
    if (itemPath === '/courses?tab=attendance') {
      return location.pathname === '/courses' && isAttendanceTabActive;
    }
    return pathActive;
  };

  const visibleManagementItems = useMemo(() => {
    if (isAlumnoProfile || isDocenteProfile) {
      return [];
    }

    return MANAGEMENT_SECTION_ITEMS.filter((item) => {
      if (item.key === 'transfers' && canUseTransfersShortcut) return false;
      return hasAnyPermission(item.permissions || []);
    });
  }, [canUseTransfersShortcut, hasAnyPermission, isAlumnoProfile, isDocenteProfile]);

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
    if (Array.isArray(item.roles) && item.roles.length > 0 && !item.roles.some((role) => roles.includes(role))) {
      return false;
    }
    if (isTeacher2222 && item.to === '/') return false;
    if (isDocenteProfile && item.to === '/teachers') return false;
    return true;
  });
  const secondaryItems = visibleItems.filter((item) => item.to !== '/');
  const resolvedItems = isAlumnoProfile ? studentNavItems : secondaryItems;

  const isCertificatesRoute = location.pathname === '/certificates';
  const dashboardMenuActive = isDashboardRoute || isDashboardExpanded;
  const managementMenuActive =
    isManagementRoute || (!canUseTransfersShortcut && isStudentTransfersRoute) || isManagementExpanded;

  const renderSidebarLabel = (label, Icon, active, { trailing = null, compact = false } = {}) => (
    <span className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <span
            className={`flex shrink-0 items-center justify-center ${
              compact ? 'h-7 w-7 rounded-lg' : 'h-8 w-8 rounded-xl'
            } transition ${
              active
                ? 'bg-white/15 text-white'
                : 'bg-primary-800/90 text-accent-100 group-hover:bg-primary-700 group-hover:text-white'
            }`}
          >
            <Icon className={compact ? 'h-4 w-4' : 'h-4 w-4'} />
          </span>
        ) : null}
        <span className={compact ? 'truncate text-xs font-semibold uppercase tracking-[0.08em]' : 'truncate'}>
          {label}
        </span>
      </span>
      {trailing}
    </span>
  );

  useEffect(() => {
    if (!isDashboardRoute) {
      setIsDashboardExpanded(false);
    }
  }, [isDashboardRoute]);

  useEffect(() => {
    if (!isManagementRoute && !isStudentTransfersRoute) {
      setIsManagementExpanded(false);
    }
  }, [isManagementRoute, isStudentTransfersRoute]);

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
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside
        className={`fixed left-0 top-0 z-20 flex h-full w-[260px] transform flex-col overflow-y-auto border-r border-primary-200 bg-primary-900 text-primary-50 transition lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b border-primary-700 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-primary-200">Instituto</p>
          <h1 className="text-xl font-semibold">Computron</h1>
          <p className="mt-2 text-sm text-primary-200">{user?.first_name} {user?.last_name}</p>
          <p className="text-xs text-primary-300">{roles.join(' · ')}</p>
        </div>

        <nav className="flex-1 space-y-1 p-3 pb-5">
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
                  `group block rounded-xl px-3 py-2 text-sm font-medium transition ${
                    isNavItemActive(item.to, isActive)
                      ? 'bg-primary-500 text-white'
                      : 'text-primary-100 hover:bg-primary-800 hover:text-white'
                  }`
                }
              >
                {({ isActive }) => renderSidebarLabel(item.label, item.icon, isNavItemActive(item.to, isActive))}
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
                      `group block w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                        dashboardMenuActive
                          ? 'bg-primary-500 text-white'
                          : 'text-primary-100 hover:bg-primary-800 hover:text-white'
                      }`
                    }
                  >
                    {renderSidebarLabel('Dashboard', House, dashboardMenuActive, {
                      trailing: <ChevronIcon className={`h-4 w-4 transition ${isDashboardExpanded ? 'rotate-180' : ''}`} />,
                    })}
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
                              `group block rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] transition ${
                                isSubItemActive
                                  ? 'bg-primary-800 text-white'
                                  : 'text-primary-200 hover:bg-primary-800 hover:text-white'
                              }`
                            }
                          >
                            {renderSidebarLabel(item.label, item.icon, isSubItemActive, { compact: true })}
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
                      `group block w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                        managementMenuActive
                          ? 'bg-primary-500 text-white'
                          : 'text-primary-100 hover:bg-primary-800 hover:text-white'
                      }`
                    }
                  >
                    {renderSidebarLabel('Gestión académica', School, managementMenuActive, {
                      trailing: <ChevronIcon className={`h-4 w-4 transition ${isManagementExpanded ? 'rotate-180' : ''}`} />,
                    })}
                  </button>

                  <div
                    className={`overflow-hidden transition-all duration-200 ${
                      isManagementExpanded ? 'max-h-[420px] opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="ml-3 space-y-1 border-l border-primary-700/80 pl-3 pt-1">
                      {visibleManagementItems.map((item) => {
                        const isSubItemActive =
                          item.key === 'transfers' ? isStudentTransfersRoute : activeManagementSection === item.key;
                        const itemPath = buildManagementSectionPath(item.key);
                        return (
                          <NavLink
                            key={item.key}
                            to={itemPath}
                            onClick={() => setOpen(false)}
                            onMouseEnter={() => preloadRoute(itemPath)}
                            onFocus={() => preloadRoute(itemPath)}
                            className={() =>
                              `group block rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] transition ${
                                isSubItemActive
                                  ? 'bg-primary-800 text-white'
                                  : 'text-primary-200 hover:bg-primary-800 hover:text-white'
                              }`
                            }
                          >
                            {renderSidebarLabel(item.label, item.icon, isSubItemActive, { compact: true })}
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
                    `group block rounded-xl px-3 py-2 text-sm font-medium transition ${
                      isNavItemActive(item.to, isActive)
                        ? 'bg-primary-500 text-white'
                        : 'text-primary-100 hover:bg-primary-800 hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => renderSidebarLabel(item.label, item.icon, isNavItemActive(item.to, isActive))}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="mt-auto border-t border-primary-700 p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-xl border border-primary-300 px-3 py-2 text-sm font-medium text-primary-50 transition hover:bg-primary-800"
          >
            <span className="flex items-center justify-center gap-2">
              <LogOut className="h-4 w-4" />
              <span>Cerrar sesión</span>
            </span>
          </button>
        </div>
      </aside>

      <div className="min-h-screen min-w-0 lg:ml-0">
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-primary-100 bg-white/90 px-4 py-3 backdrop-blur">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-lg border border-primary-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide lg:hidden"
          >
            <span className="flex items-center gap-2">
              <Menu className="h-4 w-4" />
              <span>Menú</span>
            </span>
          </button>
          <h2 className="text-lg font-semibold text-primary-800">Sistema de Gestión</h2>
          <span className="rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold text-accent-700">
            Online
          </span>
        </header>

        <main className={isCertificatesRoute ? 'w-full min-w-0 p-2 md:p-3' : 'mx-auto w-full max-w-7xl min-w-0 p-3 sm:p-4 md:p-6'}>
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
