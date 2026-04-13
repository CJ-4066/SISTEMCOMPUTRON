import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const PAYMENT_STATUS_LABELS = {
  COMPLETED: 'Completado',
  PENDING: 'Pendiente',
  REJECTED: 'Rechazado',
};

const PAYMENT_METHOD_LABELS = {
  YAPE: 'Yape',
  TRANSFERENCIA: 'Transferencia',
  QR: 'QR',
  TARJETA: 'Tarjeta',
  CANJE: 'Canje',
  EFECTIVO: 'Efectivo',
  OTRO: 'Otro',
};

const toPaymentStatusLabel = (status) => {
  const key = String(status || '').toUpperCase();
  return PAYMENT_STATUS_LABELS[key] || status || '-';
};

const toPaymentMethodLabel = (method) => {
  const key = String(method || '').toUpperCase();
  return PAYMENT_METHOD_LABELS[key] || method || '-';
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function StudentPaymentsPage() {
  const [installments, setInstallments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState({
    total_installments: 0,
    pending_installments: 0,
    next_due_date: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/students/me/payments');
      setInstallments(response.data.installments || []);
      setPayments(response.data.payments || []);
      setSummary(
        response.data.summary || {
          total_installments: 0,
          pending_installments: 0,
          next_due_date: null,
        },
      );
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo cargar tu información de pagos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalPending = useMemo(
    () =>
      installments.reduce((sum, installment) => {
        const pending = Number(installment.pending_amount || 0);
        return sum + (pending > 0 ? pending : 0);
      }, 0),
    [installments],
  );

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary-900">Mis pagos</h1>
        <p className="text-sm text-primary-700">Consulta tus cuotas, fechas de vencimiento y pagos realizados.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <article className="module-card animate-rise">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Cuotas registradas</p>
          <p className="module-stat-value">{Number(summary.total_installments || 0)}</p>
          <p className="text-xs text-primary-700">En tus matrículas activas.</p>
        </article>
        <article className="module-card animate-rise" style={{ animationDelay: '60ms' }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Cuotas pendientes</p>
          <p className="module-stat-value">{Number(summary.pending_installments || 0)}</p>
          <p className="text-xs text-primary-700">Próximas por regularizar.</p>
        </article>
        <article className="module-card animate-rise" style={{ animationDelay: '120ms' }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Saldo pendiente</p>
          <p className="module-stat-value">S/ {Number(totalPending || 0).toFixed(2)}</p>
          <p className="text-xs text-primary-700">Próximo vencimiento: {formatDate(summary.next_due_date)}</p>
        </article>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-primary-700">Cargando información de pagos...</p> : null}

      <article className="card overflow-x-auto">
        <h2 className="text-lg font-semibold text-primary-900">Fechas de pago (cuotas)</h2>
        <table className="mt-3 min-w-full text-sm">
          <thead>
            <tr className="text-left text-primary-600">
              <th className="pb-2 pr-3">Concepto</th>
              <th className="pb-2 pr-3">Curso</th>
              <th className="pb-2 pr-3">Periodo</th>
              <th className="pb-2 pr-3">Vencimiento</th>
              <th className="pb-2 pr-3">Total</th>
              <th className="pb-2 pr-3">Pagado</th>
              <th className="pb-2">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {installments.map((installment) => (
              <tr key={installment.id} className="border-t border-primary-100">
                <td className="py-2 pr-3">{installment.concept_name}</td>
                <td className="py-2 pr-3">{installment.course_name}</td>
                <td className="py-2 pr-3">{installment.period_name}</td>
                <td className="py-2 pr-3">{formatDate(installment.due_date)}</td>
                <td className="py-2 pr-3">S/ {Number(installment.total_amount || 0).toFixed(2)}</td>
                <td className="py-2 pr-3">S/ {Number(installment.paid_amount || 0).toFixed(2)}</td>
                <td className="py-2 font-semibold">S/ {Number(installment.pending_amount || 0).toFixed(2)}</td>
              </tr>
            ))}

            {!loading && !installments.length ? (
              <tr>
                <td colSpan={7} className="py-4 text-center text-sm text-primary-700">
                  No tienes cuotas registradas.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-primary-900 mb-4">Historial de pagos</h2>
        
        {!loading && !payments.length ? (
          <div className="py-10 text-center text-sm text-primary-600 bg-white border border-primary-100 rounded-2xl shadow-sm">
            No tienes pagos registrados.
          </div>
        ) : (
          <div className="grid gap-4 mt-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {payments.map((payment) => (
              <div key={payment.id} className="flex flex-col rounded-2xl border border-primary-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md hover:border-primary-300">
                <div className="flex justify-between items-start mb-3 gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-primary-900 text-base leading-tight truncate" title={payment.course_name}>
                      {payment.course_name}
                    </h3>
                    <p className="text-xs text-primary-600 mt-1 truncate">
                      {formatDate(payment.payment_date)}
                    </p>
                  </div>
                </div>

                <div className="bg-primary-50/50 rounded-xl p-3 border border-primary-50 mb-4 space-y-2 mt-auto">
                  <div className="flex justify-between items-center text-xs gap-2">
                    <span className="text-gray-500 font-medium whitespace-nowrap">Estado</span>
                    <span className="font-bold text-primary-800 text-right">{toPaymentStatusLabel(payment.status)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs gap-2">
                    <span className="text-gray-500 font-medium whitespace-nowrap">Método</span>
                    <span className="text-gray-900 font-semibold truncate text-right">{toPaymentMethodLabel(payment.method)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs gap-2">
                    <span className="text-gray-500 font-medium whitespace-nowrap">Monto Total</span>
                    <span className="text-gray-900 font-bold text-right pt-1 border-t border-primary-50">S/ {Number(payment.total_amount || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
