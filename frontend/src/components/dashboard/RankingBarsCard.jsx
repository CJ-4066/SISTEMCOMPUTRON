import { useEffect, useMemo, useState } from 'react';
import { formatCurrency } from './dashboardUtils';

export default function RankingBarsCard({
  items,
  title = 'Morosidad por sede',
  subtitle = 'Ranking visual de deuda vencida segun monto pendiente.',
  emptyMessage = 'No hay morosidad agregada para mostrar.',
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!items.length) {
      setActiveIndex(0);
      return;
    }

    setActiveIndex((current) => Math.min(current, items.length - 1));
  }, [items]);

  const maxValue = useMemo(
    () => Math.max(...items.map((item) => Number(item.pending_amount || 0)), 0),
    [items],
  );

  return (
    <article className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-primary-900">{title}</h2>
        <p className="text-sm text-primary-700">{subtitle}</p>
      </div>

      {!items.length ? (
        <p className="text-sm text-primary-700">{emptyMessage}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => {
            const value = Number(item.pending_amount || 0);
            const width = maxValue > 0 ? Math.max(12, (value / maxValue) * 100) : 12;
            const isActive = index === activeIndex;

            return (
              <button
                key={item.campus_id || item.campus_name}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => setActiveIndex(index)}
                className={`w-full rounded-2xl border p-3 text-left transition ${
                  isActive
                    ? 'border-accent-300 bg-accent-50'
                    : 'border-primary-200 bg-white hover:border-primary-300 hover:bg-primary-50/40'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-primary-900">{item.campus_name}</p>
                    <p className="text-xs text-primary-600">{Number(item.installments || 0)} cuota(s) vencida(s)</p>
                  </div>
                  <span className="text-sm font-semibold text-accent-900">{formatCurrency(value)}</span>
                </div>
                <div className="mt-3 h-3 rounded-full bg-primary-100">
                  <div
                    className={`h-full rounded-full transition-all ${isActive ? 'bg-accent-500' : 'bg-primary-500'}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
}
