import { useEffect, useMemo, useState } from 'react';
import { buildConicSegments, CHART_COLORS } from './dashboardUtils';

export default function InteractiveDonutCard({
  title,
  subtitle,
  items,
  emptyMessage,
  totalFormatter = (value) => value,
  activeValueFormatter = (value) => value,
  activeDetailFormatter = () => '',
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!items.length) {
      setActiveIndex(0);
      return;
    }

    setActiveIndex((current) => Math.min(current, items.length - 1));
  }, [items]);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.value || 0), 0),
    [items],
  );
  const activeItem = items[activeIndex] || null;

  return (
    <article className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-primary-900">{title}</h2>
        <p className="text-sm text-primary-700">{subtitle}</p>
      </div>

      {!items.length ? (
        <p className="text-sm text-primary-700">{emptyMessage}</p>
      ) : (
        <div className="grid gap-5">
          <div className="flex items-center justify-center">
            <div
              className="relative h-40 w-40 rounded-full shadow-inner sm:h-48 sm:w-48"
              style={{ background: buildConicSegments(items) }}
            >
              <div className="absolute inset-[16px] rounded-full bg-white/95 shadow-soft sm:inset-[18px]" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-500">
                  Total
                </span>
                <span className="mt-1 text-xl font-semibold text-primary-900 sm:text-2xl">
                  {totalFormatter(total)}
                </span>
                {activeItem ? (
                  <>
                    <span className="mt-3 text-xs font-semibold text-primary-500">{activeItem.label}</span>
                    <span className="text-base font-semibold text-primary-900 sm:text-lg">
                      {activeValueFormatter(activeItem.value)}
                    </span>
                    <span className="px-4 text-[11px] text-primary-600 sm:px-5">
                      {activeDetailFormatter(activeItem)}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {items.map((item, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex w-full flex-col items-start justify-between gap-2 rounded-2xl border px-4 py-3 text-left transition sm:flex-row sm:items-center ${
                    isActive
                      ? 'border-primary-400 bg-primary-50 shadow-soft'
                      : 'border-primary-200 bg-white hover:border-primary-300 hover:bg-primary-50/50'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color || CHART_COLORS[index % CHART_COLORS.length] }}
                    />
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-primary-900">{item.label}</p>
                      <p className="break-words text-xs text-primary-600">{item.detail}</p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-sm font-semibold text-primary-900">{activeValueFormatter(item.value)}</p>
                    <p className="text-[11px] text-primary-600">{item.shareLabel}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}
