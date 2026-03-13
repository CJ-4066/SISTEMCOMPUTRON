import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../services/api';
import StatCard from '../components/StatCard';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import { getCampusScopeId, setCampusScopeId } from '../utils/campusScope';

const PAYMENT_STATUS_LABELS = {
  COMPLETED: 'Completado',
  PENDING: 'Pendiente',
  REJECTED: 'Rechazado',
};

const toPaymentStatusLabel = (status) => {
  const key = String(status || '').toUpperCase();
  return PAYMENT_STATUS_LABELS[key] || status || '-';
};

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hideIncome, setHideIncome] = useState(false);
  const [campuses, setCampuses] = useState([]);
  const [showCampusSelector, setShowCampusSelector] = useState(false);
  const [campusScopeId, setCampusScopeIdState] = useState(() => getCampusScopeId());
  const [campusDraftId, setCampusDraftId] = useState(() => String(getCampusScopeId() || ''));
  const [summary, setSummary] = useState({
    totals: {
      students: 0,
      courses: 0,
      payments: 0,
      income: '0.00',
    },
    recent_payments: [],
    morosity: [],
    visibility: {
      students: false,
      courses: false,
      payments: false,
      reports: false,
    },
  });

  const canViewDashboard = hasPermission(PERMISSIONS.DASHBOARD_VIEW);
  const canViewCampuses = hasPermission(PERMISSIONS.CAMPUSES_VIEW);
  const isTeacher2222 = user?.email?.trim().toLowerCase() === '2222@gmail.com';
  const isDocente = (user?.roles || []).includes('DOCENTE');
  const isAlumnoProfile = (user?.roles || []).length === 1 && (user?.roles || []).includes('ALUMNO');
  const selectedCampusName = useMemo(() => {
    if (!campusScopeId) return 'Todas las sedes';
    return campuses.find((campus) => Number(campus.id) === Number(campusScopeId))?.name || `Sede #${campusScopeId}`;
  }, [campusScopeId, campuses]);

  useEffect(() => {
    if (!canViewDashboard) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.get('/dashboard/summary');
        setSummary(response.data || {});
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'No se pudo cargar el dashboard.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [canViewDashboard, campusScopeId]);

  useEffect(() => {
    if (!canViewCampuses) {
      setCampuses([]);
      return;
    }

    const loadCampuses = async () => {
      try {
        const response = await api.get('/campuses', { _skipCampusScope: true });
        setCampuses(response.data.items || []);
      } catch {
        setCampuses([]);
      }
    };

    loadCampuses();
  }, [canViewCampuses]);

  useEffect(() => {
    setCampusDraftId(String(campusScopeId || ''));
  }, [campusScopeId]);

  const applyCampusScope = () => {
    const nextValue = campusDraftId ? Number(campusDraftId) : null;
    setCampusScopeId(nextValue);
    setCampusScopeIdState(nextValue);
    setShowCampusSelector(false);
  };

  const clearCampusScope = () => {
    setCampusScopeId(null);
    setCampusScopeIdState(null);
    setCampusDraftId('');
    setShowCampusSelector(false);
  };

  const totals = summary.totals || {};
  const recentPayments = summary.recent_payments || [];
  const morosity = summary.morosity || [];
  const visibility = summary.visibility || {};
  const incomeValue = visibility.payments
    ? hideIncome
      ? '••••••'
      : `S/ ${Number(totals.income || 0).toFixed(2)}`
    : '-';
  const incomeHint = visibility.payments
    ? hideIncome
      ? 'Monto facturado oculto'
      : 'Acumulado total'
    : 'Sin permiso';

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-primary-900">Panel de control</h1>
          <p className="text-sm text-primary-700">Resumen operativo y financiero del instituto.</p>
        </div>
        {canViewCampuses ? (
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setShowCampusSelector((prev) => !prev)}
              className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
            >
              Seleccionar sede
            </button>
            <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-800">
              Sede activa: {selectedCampusName}
            </span>
          </div>
        ) : null}
      </div>

      {showCampusSelector && canViewCampuses ? (
        <article className="card flex flex-wrap items-end gap-2">
          <div className="min-w-72 flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-700">
              Sedes disponibles
            </label>
            <select
              className="app-input"
              value={campusDraftId}
              onChange={(event) => setCampusDraftId(event.target.value)}
            >
              <option value="">Todas las sedes</option>
              {campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={applyCampusScope}
            className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
          >
            Aplicar sede
          </button>
          <button
            type="button"
            onClick={clearCampusScope}
            className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
          >
            Ver todo
          </button>
        </article>
      ) : null}

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Alumnos"
          value={visibility.students ? Number(totals.students || 0) : '-'}
          hint={visibility.students ? 'Registros activos' : 'Sin permiso'}
        />
        <StatCard
          title="Cursos"
          value={visibility.courses ? Number(totals.courses || 0) : '-'}
          hint={visibility.courses ? 'Catalogo institucional' : 'Sin permiso'}
        />
        <StatCard
          title="Pagos"
          value={visibility.payments ? Number(totals.payments || 0) : '-'}
          hint={visibility.payments ? 'Transacciones registradas' : 'Sin permiso'}
          tone="accent"
        />
        <StatCard
          title="Ingresos"
          value={incomeValue}
          hint={incomeHint}
          tone="accent"
          action={
            visibility.payments ? (
              <button
                type="button"
                onClick={() => setHideIncome((prev) => !prev)}
                className="rounded-lg border border-primary-200 p-1 text-primary-700 hover:bg-primary-50"
                title={hideIncome ? 'Mostrar monto facturado' : 'Ocultar monto facturado'}
                aria-label={hideIncome ? 'Mostrar monto facturado' : 'Ocultar monto facturado'}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  {hideIncome ? (
                    <>
                      <path d="M3 3L21 21" />
                      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                      <path d="M9.9 4.2A10.4 10.4 0 0 1 12 4c5.5 0 9.7 3.4 11 8-0.4 1.5-1.2 2.9-2.3 4.1" />
                      <path d="M6.1 6.1C4 7.6 2.6 9.7 2 12c1.3 4.6 5.5 8 11 8 1.6 0 3.1-0.3 4.4-0.8" />
                    </>
                  ) : (
                    <>
                      <path d="M2 12c1.3-4.6 5.5-8 10-8s8.7 3.4 10 8c-1.3 4.6-5.5 8-10 8s-8.7-3.4-10-8Z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            ) : null
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="card">
          <h2 className="text-lg font-semibold text-primary-900">Ultimos pagos</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-primary-600">
                  <th className="pb-2 pr-3">Alumno</th>
                  <th className="pb-2 pr-3">Monto</th>
                  <th className="pb-2 pr-3">Metodo</th>
                  <th className="pb-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((payment) => (
                  <tr key={payment.id} className="border-t border-primary-100">
                    <td className="py-2 pr-3">{payment.student_name}</td>
                    <td className="py-2 pr-3">S/ {Number(payment.total_amount).toFixed(2)}</td>
                    <td className="py-2 pr-3">{payment.method}</td>
                    <td className="py-2">{toPaymentStatusLabel(payment.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && recentPayments.length === 0 ? (
              <p className="mt-2 text-sm text-primary-700">No hay pagos registrados.</p>
            ) : null}
          </div>
        </article>

        <article className="card">
          <h2 className="text-lg font-semibold text-primary-900">Morosidad vencida</h2>
          <div className="mt-3 space-y-2">
            {morosity.slice(0, 6).map((item) => (
              <div key={item.installment_id} className="rounded-xl border border-accent-100 bg-accent-50 p-3">
                <p className="text-sm font-semibold text-accent-800">{item.student_name}</p>
                <p className="text-xs text-accent-700">
                  {item.course_name} - {item.campus_name}
                </p>
                <p className="text-sm text-accent-900">
                  Pendiente: <strong>S/ {Number(item.pending_amount).toFixed(2)}</strong>
                </p>
              </div>
            ))}
            {!loading && morosity.length === 0 ? (
              <p className="text-sm text-primary-700">No hay cuotas vencidas pendientes.</p>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
}
