import { useEffect, useMemo, useState } from 'react';
import { formatCurrency, formatShortDate } from './dashboardUtils';

export default function PaymentsTrendCard({
  items,
  title = 'Tendencia de pagos',
  subtitle = 'Ultimos 7 dias con foco en montos completados.',
  emptyMessage = 'No hay datos recientes para graficar.',
}) {
  const [activeIndex, setActiveIndex] = useState(Math.max(0, items.length - 1));

  useEffect(() => {
    if (!items.length) {
      setActiveIndex(0);
      return;
    }

    setActiveIndex((current) => Math.min(current, items.length - 1));
  }, [items]);

  const maxAmount = useMemo(
    () => Math.max(...items.map((item) => Number(item.completed_amount || 0)), 0),
    [items],
  );
  const activeItem = items[activeIndex] || null;

  return (
    <article className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-primary-900">{title}</h2>
          <p className="text-sm text-primary-700">{subtitle}</p>
        </div>
        {activeItem ? (
          <div className="w-full rounded-2xl bg-primary-50 px-4 py-2 text-left sm:w-auto sm:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-500">
              {formatShortDate(activeItem.payment_date)}
            </p>
            <p className="text-lg font-semibold text-primary-900">
              {formatCurrency(activeItem.completed_amount)}
            </p>
            <p className="text-xs text-primary-600">{Number(activeItem.total || 0)} pago(s)</p>
          </div>
        ) : null}
      </div>

      {!items.length ? (
        <p className="text-sm text-primary-700">{emptyMessage}</p>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto pb-2">
            <div className="flex h-56 min-w-[32rem] items-end gap-3 sm:h-64 sm:min-w-0">
              {items.map((item, index) => {
                const amount = Number(item.completed_amount || 0);
                const height = maxAmount > 0 ? Math.max(14, (amount / maxAmount) * 100) : 14;
                const isActive = index === activeIndex;

                return (
                  <button
                    key={`${item.payment_date}-${index}`}
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onFocus={() => setActiveIndex(index)}
                    onClick={() => setActiveIndex(index)}
                    className="flex h-full min-w-[3.5rem] flex-1 flex-col justify-end gap-2"
                  >
                    <div
                      className={`relative rounded-t-3xl transition-all ${
                        isActive ? 'bg-primary-700 shadow-soft' : 'bg-primary-200 hover:bg-primary-300'
                      }`}
                      style={{ height: `${height}%` }}
                    >
                      <span className="absolute -top-6 left-1/2 hidden -translate-x-1/2 text-[11px] font-semibold text-primary-700 sm:block">
                        {amount > 0 && isActive ? formatCurrency(amount) : ''}
                      </span>
                    </div>
                    <span
                      className={`text-center text-xs font-semibold ${
                        isActive ? 'text-primary-900' : 'text-primary-600'
                      }`}
                    >
                      {formatShortDate(item.payment_date)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            {items.map((item, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={`meta-${item.payment_date}`}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`rounded-2xl border px-3 py-2 text-left transition ${
                    isActive
                      ? 'border-primary-400 bg-primary-50'
                      : 'border-primary-200 bg-white hover:border-primary-300 hover:bg-primary-50/40'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-500">
                    {formatShortDate(item.payment_date)}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-primary-900">
                    {formatCurrency(item.completed_amount)}
                  </p>
                  <p className="text-xs text-primary-600">{Number(item.total || 0)} operaciones</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}
