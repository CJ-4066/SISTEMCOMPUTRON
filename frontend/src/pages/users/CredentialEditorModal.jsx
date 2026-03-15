import { DOCUMENT_TYPE_OPTIONS } from '../../utils/document';
import {
  AVAILABLE_ROLES,
  MANAGEMENT_ACCESS_GROUPS,
  MENU_ACCESS_GROUPS,
  ROLE_ADMIN,
} from './constants';
import { getPermissionGroupState, getPrimaryRole } from './helpers';

const resolvePermissionCardClassName = (state) => {
  if (state === 'all') return 'border-primary-300 bg-primary-50';
  if (state === 'partial') return 'border-amber-200 bg-amber-50';
  return 'border-primary-100 bg-white';
};

const EyeOpenIcon = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <path d="M1.5 12s3.5-6 10.5-6 10.5 6 10.5 6-3.5 6-10.5 6S1.5 12 1.5 12Z" />
    <circle cx="12" cy="12" r="3.5" />
  </svg>
);

const EyeClosedIcon = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <path d="M3 3l18 18" />
    <path d="M1.5 12s3.5-6 10.5-6c2.2 0 4.1.6 5.7 1.5" />
    <path d="M9.9 9.9A3.5 3.5 0 0 0 14.1 14.1" />
    <path d="M22.5 12s-3.5 6-10.5 6c-2.2 0-4.1-.6-5.7-1.5" />
  </svg>
);

export default function CredentialEditorModal({
  editingCredentialUser,
  savingCredentials,
  onClose,
  credentialForm,
  onCredentialFieldChange,
  canManageStatus,
  canManageRoles,
  isRootAdmin,
  showPassword,
  onTogglePassword,
  enabledMenuCount,
  enabledManagementCount,
  canManagePermissions,
  loadingCredentialAccess,
  credentialAccessPermissions,
  accessMenuLevel,
  onAccessMenuLevelChange,
  onCredentialGroupAccessChange,
  onAllCredentialAccessChange,
  onAllManagementAccessChange,
  credentialPermissionMode,
  onSave,
}) {
  if (!editingCredentialUser) return null;

  const bindField = (field) => (event) => onCredentialFieldChange(field, event.target.value);
  const isAdminUser = getPrimaryRole(editingCredentialUser.roles) === ROLE_ADMIN;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar editor de usuario"
        onClick={onClose}
        disabled={savingCredentials}
        className="absolute inset-0 bg-black/45"
      />

      <article
        role="dialog"
        aria-modal="true"
        aria-label="Editar acceso y datos del usuario"
        className="relative z-10 w-full max-w-5xl rounded-2xl border border-primary-100 bg-white p-4 shadow-2xl md:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-primary-900">Editar acceso y datos</h2>
            <p className="text-sm text-primary-700">
              {editingCredentialUser.first_name} {editingCredentialUser.last_name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={savingCredentials}
            className="rounded-lg border border-primary-200 px-3 py-1 text-sm text-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cerrar
          </button>
        </div>

        <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-1">
          <div className="rounded-xl border border-primary-100 p-3">
            <p className="text-sm font-semibold text-primary-900">Datos generales</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm text-primary-800">
                <span className="font-medium">Nombres</span>
                <input
                  className="app-input"
                  value={credentialForm.first_name}
                  disabled={!canManageStatus}
                  onChange={bindField('first_name')}
                  placeholder="Nombres"
                />
              </label>

              <label className="space-y-1 text-sm text-primary-800">
                <span className="font-medium">Apellidos</span>
                <input
                  className="app-input"
                  value={credentialForm.last_name}
                  disabled={!canManageStatus}
                  onChange={bindField('last_name')}
                  placeholder="Apellidos"
                />
              </label>

              <label className="space-y-1 text-sm text-primary-800">
                <span className="font-medium">Tipo de documento</span>
                <select
                  className="app-input"
                  value={credentialForm.document_type}
                  disabled={!canManageStatus}
                  onChange={bindField('document_type')}
                >
                  {DOCUMENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm text-primary-800">
                <span className="font-medium">Número de documento</span>
                <input
                  className="app-input"
                  value={credentialForm.document_number}
                  disabled={!canManageStatus}
                  onChange={bindField('document_number')}
                  placeholder="Número de documento"
                />
              </label>

              <label className="space-y-1 text-sm text-primary-800">
                <span className="font-medium">Correo</span>
                <input
                  type="email"
                  className="app-input"
                  value={credentialForm.email}
                  disabled={!canManageStatus}
                  onChange={bindField('email')}
                  placeholder="correo@dominio.com"
                />
              </label>

              <label className="space-y-1 text-sm text-primary-800">
                <span className="font-medium">Nueva contraseña</span>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="app-input pr-12"
                    value={credentialForm.password}
                    disabled={!canManageStatus}
                    onChange={bindField('password')}
                    placeholder="Mínimo 8 caracteres"
                  />
                  <button
                    type="button"
                    onClick={onTogglePassword}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-primary-700 hover:bg-primary-100"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeClosedIcon /> : <EyeOpenIcon />}
                  </button>
                </div>
              </label>

              <label className="space-y-1 text-sm text-primary-800">
                <span className="font-medium">Rol</span>
                <select
                  className="app-input"
                  value={credentialForm.role}
                  onChange={bindField('role')}
                  disabled={!canManageRoles || !isRootAdmin}
                >
                  <option value="">Sin rol asignado</option>
                  {AVAILABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                {!canManageRoles ? (
                  <span className="block text-xs text-primary-600">No tienes permiso para gestionar roles.</span>
                ) : null}
                {canManageRoles && !isRootAdmin ? (
                  <span className="block text-xs text-primary-600">Solo el admin raíz puede cambiar el rol.</span>
                ) : null}
              </label>

              <label className="space-y-1 text-sm text-primary-800">
                <span className="font-medium">Teléfono</span>
                <input
                  className="app-input"
                  value={credentialForm.phone}
                  disabled={!canManageStatus}
                  onChange={bindField('phone')}
                  placeholder="Teléfono (opcional)"
                />
              </label>

              <label className="space-y-1 text-sm text-primary-800 md:col-span-2">
                <span className="font-medium">Dirección</span>
                <input
                  className="app-input"
                  value={credentialForm.address}
                  disabled={!canManageStatus}
                  onChange={bindField('address')}
                  placeholder="Dirección (opcional)"
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-primary-100 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-primary-900">Acceso por pestañas</h3>
                <p className="text-xs text-primary-600">
                  Configura qué vistas puede ver este usuario en el sistema.
                </p>
              </div>
              <span className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-semibold text-primary-800">
                {enabledMenuCount}/{MENU_ACCESS_GROUPS.length} menús activos
              </span>
            </div>

            {!canManagePermissions ? (
              <p className="mt-3 rounded-xl bg-primary-50 p-3 text-xs text-primary-700">
                No tienes permiso para gestionar accesos personalizados de usuarios.
              </p>
            ) : loadingCredentialAccess ? (
              <p className="mt-3 text-sm text-primary-700">Cargando accesos del usuario...</p>
            ) : (
              <>
                {isAdminUser ? (
                  <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                    El usuario ADMIN mantiene acceso total por diseño del sistema.
                  </p>
                ) : null}

                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {accessMenuLevel === 'MAIN'
                    ? MENU_ACCESS_GROUPS.map((group) => {
                        const state = getPermissionGroupState(credentialAccessPermissions, group.permissions);
                        const checked = state === 'all';
                        const isManagementMenu = group.key === 'management';

                        return (
                          <div
                            key={group.key}
                            className={`rounded-lg border p-2 ${resolvePermissionCardClassName(state)}`}
                          >
                            <label className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) =>
                                  onCredentialGroupAccessChange(group, event.target.checked)
                                }
                              />
                              <span className="text-xs font-semibold text-primary-900">
                                {group.label}
                                {state === 'partial' ? ' (parcial)' : ''}
                              </span>
                            </label>

                            {isManagementMenu ? (
                              <button
                                type="button"
                                onClick={() => onAccessMenuLevelChange('MANAGEMENT')}
                                className="mt-2 rounded-lg border border-primary-200 px-2 py-1 text-[11px] font-semibold text-primary-700 hover:bg-primary-100"
                              >
                                Ver submenú ({enabledManagementCount}/{MANAGEMENT_ACCESS_GROUPS.length})
                              </button>
                            ) : null}
                          </div>
                        );
                      })
                    : null}
                </div>

                {accessMenuLevel === 'MAIN' ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onAllCredentialAccessChange(true)}
                      className="rounded-lg border border-primary-300 px-3 py-1.5 text-xs font-semibold text-primary-800"
                    >
                      Activar todos los menús
                    </button>
                    <button
                      type="button"
                      onClick={() => onAllCredentialAccessChange(false)}
                      className="rounded-lg border border-primary-300 px-3 py-1.5 text-xs font-semibold text-primary-800"
                    >
                      Quitar todos los menús
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-primary-100 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-primary-900">Submenú: Gestión académica</h4>
                        <p className="text-xs text-primary-600">
                          Selecciona vistas específicas y usa el botón para volver al menú anterior.
                        </p>
                      </div>
                      <span className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-semibold text-primary-800">
                        {enabledManagementCount}/{MANAGEMENT_ACCESS_GROUPS.length} secciones activas
                      </span>
                    </div>

                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => onAccessMenuLevelChange('MAIN')}
                        className="rounded-lg border border-primary-300 px-3 py-1.5 text-xs font-semibold text-primary-800 hover:bg-primary-50"
                      >
                        Volver al menú anterior
                      </button>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      {MANAGEMENT_ACCESS_GROUPS.map((group) => {
                        const state = getPermissionGroupState(credentialAccessPermissions, group.permissions);
                        const checked = state === 'all';

                        return (
                          <label
                            key={group.key}
                            className={`flex items-start gap-2 rounded-lg border p-2 ${resolvePermissionCardClassName(state)}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => onCredentialGroupAccessChange(group, event.target.checked)}
                            />
                            <span className="text-xs font-semibold text-primary-900">
                              {group.label}
                              {state === 'partial' ? ' (parcial)' : ''}
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onAllManagementAccessChange(true)}
                        className="rounded-lg border border-primary-300 px-3 py-1.5 text-xs font-semibold text-primary-800"
                      >
                        Activar todas las secciones
                      </button>
                      <button
                        type="button"
                        onClick={() => onAllManagementAccessChange(false)}
                        className="rounded-lg border border-primary-300 px-3 py-1.5 text-xs font-semibold text-primary-800"
                      >
                        Quitar secciones
                      </button>
                    </div>
                  </div>
                )}

                <p className="mt-3 text-xs text-primary-700">
                  Modo actual del usuario: {credentialPermissionMode}. Al guardar desde esta pantalla se aplicará modo
                  PERSONAL para usar esta configuración.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={onSave}
            disabled={savingCredentials || (canManagePermissions && loadingCredentialAccess)}
            className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingCredentials ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </article>
    </div>
  );
}
