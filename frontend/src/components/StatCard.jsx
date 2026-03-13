export default function StatCard({ title, value, hint, tone = 'primary', action = null }) {
  const toneClasses = {
    primary: 'border-primary-200 bg-white text-primary-900',
    accent: 'border-accent-200 bg-white text-accent-900',
  };

  return (
    <article className={`card border ${toneClasses[tone] || toneClasses.primary}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-primary-600">{title}</p>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-primary-700">{hint}</p>
    </article>
  );
}
