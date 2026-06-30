export default function CampusMultiSelect({
  campuses = [],
  selectedIds = [],
  onChange,
  loading = false,
  disabled = false,
  allowGlobal = false,
}) {
  const normalizedSelectedIds = selectedIds.map(Number).filter(Number.isFinite);
  const selectedSet = new Set(normalizedSelectedIds);

  const toggleCampus = (campusId) => {
    const normalizedId = Number(campusId);
    if (selectedSet.has(normalizedId)) {
      onChange(normalizedSelectedIds.filter((id) => id !== normalizedId));
      return;
    }
    onChange([...normalizedSelectedIds, normalizedId]);
  };

  return (
    <fieldset
      disabled={disabled || loading}
      className="space-y-2 rounded-xl border border-primary-200 bg-white p-3 md:col-span-2"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <legend className="text-sm font-semibold text-primary-900">Sedes autorizadas</legend>
          <p className="text-xs text-primary-600">
            El usuario solo podrá consultar y gestionar información de las sedes marcadas.
          </p>
        </div>
        <span className="rounded-full border border-primary-200 px-2.5 py-1 text-xs font-semibold text-primary-700">
          {normalizedSelectedIds.length} seleccionada{normalizedSelectedIds.length === 1 ? '' : 's'}
        </span>
      </div>

      {allowGlobal ? (
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-primary-200 px-3 py-2">
          <input
            type="checkbox"
            checked={normalizedSelectedIds.length === 0}
            onChange={() => onChange([])}
            className="mt-0.5 h-4 w-4 rounded border-primary-300 text-primary-700"
          />
          <span>
            <span className="block text-sm font-semibold text-primary-900">Acceso global</span>
            <span className="block text-xs text-primary-600">Disponible únicamente para administradores.</span>
          </span>
        </label>
      ) : null}

      {loading ? (
        <p className="py-3 text-sm text-primary-600">Cargando sedes...</p>
      ) : campuses.length === 0 ? (
        <p className="py-3 text-sm text-primary-600">No hay sedes disponibles para asignar.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {campuses.map((campus) => {
            const checked = selectedSet.has(Number(campus.id));
            return (
              <label
                key={campus.id}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  checked
                    ? 'border-primary-400 bg-primary-50 text-primary-900'
                    : 'border-primary-100 text-primary-700 hover:border-primary-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCampus(campus.id)}
                  className="h-4 w-4 rounded border-primary-300 text-primary-700"
                />
                <span className="font-medium">{campus.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
