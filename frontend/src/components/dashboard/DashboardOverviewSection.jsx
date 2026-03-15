import StatCard from '../StatCard';
import InteractiveDonutCard from './InteractiveDonutCard';
import PaymentsTrendCard from './PaymentsTrendCard';
import RankingBarsCard from './RankingBarsCard';
import { formatCurrency } from './dashboardUtils';

const EyeToggleIcon = ({ hidden }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    {hidden ? (
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
);

export default function DashboardOverviewSection({
  totals,
  visibility,
  incomeValue,
  incomeHint,
  hideIncome,
  selectedCampusName,
  latestPayment,
  topMorosityCampus,
  paymentMethodsChart,
  paymentStatusChart,
  paymentsByDayChart,
  morosityByCampusChart,
  onToggleIncome,
  onOpenSection,
}) {
  return (
    <>
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
                onClick={onToggleIncome}
                className="rounded-lg border border-primary-200 p-1 text-primary-700 hover:bg-primary-50"
                title={hideIncome ? 'Mostrar monto facturado' : 'Ocultar monto facturado'}
                aria-label={hideIncome ? 'Mostrar monto facturado' : 'Ocultar monto facturado'}
              >
                <EyeToggleIcon hidden={hideIncome} />
              </button>
            ) : null
          }
        />
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-primary-900">Panorama visual</h2>
            <p className="text-sm text-primary-700">
              Los indicadores clave vuelven a estar visibles desde el resumen principal.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onOpenSection('payments')}
              className="rounded-full border border-primary-200 px-3 py-1.5 text-xs font-semibold text-primary-800 hover:bg-primary-50"
            >
              Ver pagos
            </button>
            <button
              type="button"
              onClick={() => onOpenSection('morosity')}
              className="rounded-full border border-accent-200 px-3 py-1.5 text-xs font-semibold text-accent-900 hover:bg-accent-50"
            >
              Ver morosidad
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <PaymentsTrendCard
            items={visibility.payments ? paymentsByDayChart : []}
            title="Tendencia de pagos"
            subtitle="Comportamiento reciente de cobros completados."
            emptyMessage={visibility.payments ? 'No hay datos recientes para graficar.' : 'Sin permiso para ver pagos.'}
          />

          <InteractiveDonutCard
            title="Estados de pago"
            subtitle="Distribucion operativa visible desde el resumen."
            items={visibility.payments ? paymentStatusChart : []}
            emptyMessage={visibility.payments ? 'No hay pagos para mostrar.' : 'Sin permiso para ver pagos.'}
            totalFormatter={(value) => `${value}`}
            activeValueFormatter={(value) => `${value}`}
            activeDetailFormatter={(item) => item?.detail || ''}
          />

          <InteractiveDonutCard
            title="Metodos de cobro"
            subtitle="Participacion de cada canal en el monto recaudado."
            items={visibility.payments ? paymentMethodsChart : []}
            emptyMessage={visibility.payments ? 'No hay metodos para mostrar.' : 'Sin permiso para ver pagos.'}
            totalFormatter={(value) => formatCurrency(value)}
            activeValueFormatter={(value) => formatCurrency(value)}
            activeDetailFormatter={(item) => item?.detail || ''}
          />

          <RankingBarsCard
            items={visibility.reports ? morosityByCampusChart : []}
            title="Morosidad por sede"
            subtitle="Ranking resumido de deuda vencida por sede."
            emptyMessage={
              visibility.reports ? 'No hay morosidad agregada para mostrar.' : 'Sin permiso para ver morosidad.'
            }
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-primary-900">Pulso general</h2>
              <p className="text-sm text-primary-700">
                Vista rapida para saltar a pagos o morosidad sin recorrer toda la pantalla.
              </p>
            </div>
            <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-800">
              {selectedCampusName}
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => onOpenSection('payments')}
              className="rounded-2xl border border-primary-200 bg-primary-50 p-4 text-left transition hover:border-primary-300 hover:bg-primary-100/70"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-500">Pagos</p>
              <p className="mt-2 text-xl font-semibold text-primary-900">
                {visibility.payments ? incomeValue : 'Sin permiso'}
              </p>
              <p className="mt-1 text-sm text-primary-700">
                {visibility.payments
                  ? latestPayment
                    ? `Ultimo movimiento: ${latestPayment.student_name}`
                    : 'Sin movimientos recientes'
                  : 'No puedes acceder al detalle de cobros'}
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenSection('morosity')}
              className="rounded-2xl border border-accent-200 bg-accent-50 p-4 text-left transition hover:border-accent-300 hover:bg-accent-100/70"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-700">Morosidad</p>
              <p className="mt-2 text-xl font-semibold text-accent-900">
                {visibility.reports
                  ? topMorosityCampus
                    ? `S/ ${Number(topMorosityCampus.pending_amount || 0).toFixed(2)}`
                    : 'S/ 0.00'
                  : 'Sin permiso'}
              </p>
              <p className="mt-1 text-sm text-accent-800">
                {visibility.reports
                  ? topMorosityCampus
                    ? `Sede con mayor deuda: ${topMorosityCampus.campus_name}`
                    : 'Sin deuda vencida agregada'
                  : 'No puedes acceder al detalle de morosidad'}
              </p>
            </button>
          </div>
        </article>

        <article className="card space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-primary-900">Indicadores destacados</h2>
            <p className="text-sm text-primary-700">
              Resumen breve de lo mas relevante dentro del alcance actual de sede.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-primary-100 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-500">
                Metodo dominante
              </p>
              <p className="mt-2 text-lg font-semibold text-primary-900">
                {visibility.payments ? paymentMethodsChart[0]?.label || 'Sin datos' : 'Sin permiso'}
              </p>
              <p className="text-sm text-primary-700">
                {visibility.payments
                  ? paymentMethodsChart[0]
                    ? `${paymentMethodsChart[0].shareLabel} del monto cobrado`
                    : 'No hay registros de pago'
                  : 'No puedes acceder al detalle de cobros'}
              </p>
            </div>

            <div className="rounded-2xl border border-primary-100 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-500">
                Estado dominante
              </p>
              <p className="mt-2 text-lg font-semibold text-primary-900">
                {visibility.payments ? paymentStatusChart[0]?.label || 'Sin datos' : 'Sin permiso'}
              </p>
              <p className="text-sm text-primary-700">
                {visibility.payments
                  ? paymentStatusChart[0]
                    ? `${paymentStatusChart[0].shareLabel} de transacciones`
                    : 'No hay transacciones registradas'
                  : 'No puedes acceder al detalle de transacciones'}
              </p>
            </div>
          </div>
        </article>
      </div>
    </>
  );
}
