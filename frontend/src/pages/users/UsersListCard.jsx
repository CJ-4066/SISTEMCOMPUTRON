import PaginationControls from '../../components/PaginationControls';
import { ROLE_FILTER_OPTIONS, USER_PAGE_SIZE } from './constants';
import { getPrimaryRole } from './helpers';

export default function UsersListCard({
  users,
  userTotal,
  userPage,
  userTotalPages,
  onUserPageChange,
  userSearchInput,
  onUserSearchInputChange,
  userRoleFilter,
  onUserRoleFilterChange,
  onClearUserFilters,
  clearFiltersDisabled,
  loadingUsers,
  exportingUsers,
  onExportUsers,
  statusUpdatingUserId,
  canManageStatus,
  onToggleStatus,
  onOpenCredentialEditor,
  canOpenEditor,
  showReadOnlyNote,
}) {
  return (
    <article className="card overflow-x-auto">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Usuarios registrados</h2>
          <p className="text-sm text-primary-700">
            {users.length} en página / {userTotal} total
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <input
            className="app-input w-full lg:w-72"
            placeholder="Buscar por nombre, documento o correo"
            value={userSearchInput}
            onChange={(event) => onUserSearchInputChange(event.target.value)}
          />
          <select
            className="app-input w-full lg:w-48"
            value={userRoleFilter}
            onChange={(event) => onUserRoleFilterChange(event.target.value)}
            aria-label="Filtrar por rol"
          >
            {ROLE_FILTER_OPTIONS.map((option) => (
              <option key={`${option.value || 'all'}-${option.label}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onClearUserFilters}
            disabled={clearFiltersDisabled}
            className="rounded-lg border border-primary-200 px-3 py-2 text-sm text-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={onExportUsers}
            disabled={loadingUsers || exportingUsers}
            className="rounded-lg border border-primary-300 bg-white px-3 py-2 text-sm font-semibold text-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exportingUsers ? 'Exportando...' : 'Exportar Excel'}
          </button>
        </div>
      </div>

      <table className="mt-3 min-w-full text-sm">
        <thead>
          <tr className="text-left text-primary-600">
            <th className="pb-2 pr-3">Usuario</th>
            <th className="pb-2 pr-3">Documento</th>
            <th className="pb-2 pr-3">Correo</th>
            <th className="pb-2 pr-3">Activo</th>
            <th className="pb-2">Rol</th>
            <th className="pb-2 pl-3">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.map((targetUser) => {
            const statusBusy = statusUpdatingUserId === targetUser.id;

            return (
              <tr key={targetUser.id} className="border-t border-primary-100 align-top">
                <td className="py-2 pr-3">
                  {targetUser.first_name} {targetUser.last_name}
                </td>
                <td className="py-2 pr-3">{targetUser.document_number || '-'}</td>
                <td className="py-2 pr-3">{targetUser.email}</td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={targetUser.is_active}
                      aria-label={`Cambiar estado de ${targetUser.first_name} ${targetUser.last_name}`}
                      onClick={() => onToggleStatus(targetUser)}
                      disabled={!canManageStatus || statusBusy}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                        targetUser.is_active ? 'bg-primary-700' : 'bg-primary-200'
                      } ${!canManageStatus || statusBusy ? 'cursor-not-allowed opacity-60' : 'hover:opacity-90'}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                          targetUser.is_active ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className="text-xs font-semibold text-primary-700">
                      {targetUser.is_active ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </div>
                </td>
                <td className="py-2">
                  <span className="rounded-lg border border-primary-200 px-2 py-1 text-xs text-primary-700">
                    {getPrimaryRole(targetUser.roles) || '-'}
                  </span>
                </td>
                <td className="py-2 pl-3">
                  <button
                    type="button"
                    onClick={() => onOpenCredentialEditor(targetUser)}
                    disabled={!canOpenEditor}
                    className={`rounded-lg border border-primary-300 px-2 py-1 text-xs font-semibold text-primary-800 ${
                      !canOpenEditor ? 'cursor-not-allowed opacity-60' : 'hover:bg-primary-50'
                    }`}
                  >
                    Editar acceso y datos
                  </button>
                </td>
              </tr>
            );
          })}

          {!loadingUsers && users.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-4 text-center text-sm text-primary-600">
                No se encontraron usuarios con ese criterio.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <PaginationControls
        page={userPage}
        totalPages={userTotalPages}
        total={userTotal}
        pageSize={USER_PAGE_SIZE}
        onPageChange={onUserPageChange}
        disabled={loadingUsers}
        label="usuarios"
      />

      {showReadOnlyNote ? (
        <p className="mt-3 text-xs text-primary-600">
          Tienes acceso de solo lectura. Para editar estado, datos o accesos del usuario, habilita los permisos
          correspondientes.
        </p>
      ) : null}
    </article>
  );
}
