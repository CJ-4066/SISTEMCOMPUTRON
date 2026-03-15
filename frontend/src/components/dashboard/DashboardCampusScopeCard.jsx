export default function DashboardCampusScopeCard({
  canViewCampuses,
  campuses,
  showCampusSelector,
  selectedCampusName,
  campusDraftId,
  onToggleSelector,
  onCampusDraftChange,
  onApply,
  onClear,
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-primary-900">Panel de control</h1>
          <p className="text-sm text-primary-700">Resumen operativo y financiero del instituto.</p>
        </div>
        {canViewCampuses ? (
          <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
            <button
              type="button"
              onClick={onToggleSelector}
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
          <div className="min-w-0 flex-1 sm:min-w-72">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-700">
              Sedes disponibles
            </label>
            <select
              className="app-input"
              value={campusDraftId}
              onChange={(event) => onCampusDraftChange(event.target.value)}
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
            onClick={onApply}
            className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
          >
            Aplicar sede
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded-xl border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
          >
            Ver todo
          </button>
        </article>
      ) : null}
    </>
  );
}
