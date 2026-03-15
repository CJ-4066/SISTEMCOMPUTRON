import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import { DASHBOARD_SECTION_ITEMS } from '../constants/dashboardSections';
import DashboardCampusScopeCard from '../components/dashboard/DashboardCampusScopeCard';
import DashboardMorositySection from '../components/dashboard/DashboardMorositySection';
import DashboardOverviewSection from '../components/dashboard/DashboardOverviewSection';
import DashboardPaymentsSection from '../components/dashboard/DashboardPaymentsSection';
import DashboardSectionTabs from '../components/dashboard/DashboardSectionTabs';
import { createDashboardViewModel } from '../components/dashboard/dashboardUtils';
import useDashboardSections from '../hooks/useDashboardSections';
import useDashboardState from '../hooks/useDashboardState';

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [hideIncome, setHideIncome] = useState(false);
  const canViewDashboard = hasPermission(PERMISSIONS.DASHBOARD_VIEW);
  const canViewCampuses = hasPermission(PERMISSIONS.CAMPUSES_VIEW);
  const canViewPayments = hasPermission(PERMISSIONS.PAYMENTS_VIEW);
  const canViewReports = hasPermission(PERMISSIONS.REPORTS_VIEW);
  const isTeacher2222 = user?.email?.trim().toLowerCase() === '2222@gmail.com';
  const isDocente = (user?.roles || []).includes('DOCENTE');
  const isAlumnoProfile = (user?.roles || []).length === 1 && (user?.roles || []).includes('ALUMNO');
  const dashboardSections = useMemo(
    () =>
      DASHBOARD_SECTION_ITEMS.filter((item) => {
        if (item.key === 'overview') return canViewDashboard;
        if (item.key === 'payments') return canViewPayments;
        if (item.key === 'morosity') return canViewReports;
        return false;
      }),
    [canViewDashboard, canViewPayments, canViewReports],
  );
  const { activeSection, changeSection } = useDashboardSections(dashboardSections);
  const {
    loading,
    error,
    summary,
    campuses,
    showCampusSelector,
    campusDraftId,
    selectedCampusName,
    setCampusDraftId,
    toggleCampusSelector,
    applyCampusScope,
    clearCampusScope,
  } = useDashboardState({ canViewDashboard, canViewCampuses });
  const dashboardViewModel = useMemo(
    () => createDashboardViewModel({ summary, hideIncome }),
    [hideIncome, summary],
  );

  if (isTeacher2222 && isDocente) {
    return <Navigate to="/courses" replace />;
  }

  if (isAlumnoProfile) {
    return <Navigate to="/courses" replace />;
  }

  if (!canViewDashboard) {
    return (
      <section className="card">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-sm text-primary-700">No tienes permisos para acceder a este modulo.</p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <DashboardCampusScopeCard
        canViewCampuses={canViewCampuses}
        campuses={campuses}
        showCampusSelector={showCampusSelector}
        selectedCampusName={selectedCampusName}
        campusDraftId={campusDraftId}
        onToggleSelector={toggleCampusSelector}
        onCampusDraftChange={setCampusDraftId}
        onApply={applyCampusScope}
        onClear={clearCampusScope}
      />

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <DashboardSectionTabs sections={dashboardSections} activeSection={activeSection} onChange={changeSection} />

      {activeSection === 'overview' ? (
        <DashboardOverviewSection
          totals={dashboardViewModel.totals}
          visibility={dashboardViewModel.visibility}
          incomeValue={dashboardViewModel.incomeValue}
          incomeHint={dashboardViewModel.incomeHint}
          hideIncome={hideIncome}
          selectedCampusName={selectedCampusName}
          latestPayment={dashboardViewModel.latestPayment}
          topMorosityCampus={dashboardViewModel.topMorosityCampus}
          paymentMethodsChart={dashboardViewModel.paymentMethodsChart}
          paymentStatusChart={dashboardViewModel.paymentStatusChart}
          paymentsByDayChart={dashboardViewModel.paymentsByDayChart}
          morosityByCampusChart={dashboardViewModel.morosityByCampusChart}
          onToggleIncome={() => setHideIncome((current) => !current)}
          onOpenSection={changeSection}
        />
      ) : null}

      {activeSection === 'payments' ? (
        <DashboardPaymentsSection
          visibility={dashboardViewModel.visibility}
          paymentStatusChart={dashboardViewModel.paymentStatusChart}
          paymentMethodsChart={dashboardViewModel.paymentMethodsChart}
          paymentsByDayChart={dashboardViewModel.paymentsByDayChart}
          recentPayments={dashboardViewModel.recentPayments}
          loading={loading}
        />
      ) : null}

      {activeSection === 'morosity' ? (
        <DashboardMorositySection
          visibility={dashboardViewModel.visibility}
          morosityByCampusChart={dashboardViewModel.morosityByCampusChart}
          morosity={dashboardViewModel.morosity}
          loading={loading}
        />
      ) : null}
    </section>
  );
}
