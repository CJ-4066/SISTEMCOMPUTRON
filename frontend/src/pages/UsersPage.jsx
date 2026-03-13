import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import PaginationControls from '../components/PaginationControls';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import { downloadCsv } from '../utils/csv';
import { fetchAllPages } from '../utils/paginatedFetch';
import { buildDocumentValue, DOCUMENT_TYPE_OPTIONS, parseDocumentValue } from '../utils/document';

const availableRoles = ['ADMIN', 'DIRECTOR', 'SECRETARIADO', 'DOCENTE', 'ALUMNO'];
const USER_PAGE_SIZE = 8;
const ROLE_ADMIN = 'ADMIN';

const INITIAL_CREDENTIAL_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  document_type: 'DNI',
  document_number: '',
  phone: '',
  address: '',
  role: '',
};

const MANAGEMENT_ACCESS_GROUPS = [
  {
    key: 'enrollments',
    label: 'Matrícula',
    permissions: [
      PERMISSIONS.STUDENTS_VIEW,
      PERMISSIONS.STUDENTS_MANAGE,
      PERMISSIONS.ENROLLMENTS_VIEW,
      PERMISSIONS.ENROLLMENTS_MANAGE,
    ],
  },
  {
    key: 'students',
    label: 'Alumnos',
    permissions: [PERMISSIONS.STUDENTS_VIEW, PERMISSIONS.STUDENTS_MANAGE],
  },
  {
    key: 'teachers',
    label: 'Docentes',
    permissions: [PERMISSIONS.TEACHERS_VIEW, PERMISSIONS.USERS_CREATE, PERMISSIONS.USERS_STATUS_MANAGE],
  },
  {
    key: 'courses',
    label: 'Cursos',
    permissions: [PERMISSIONS.COURSES_VIEW, PERMISSIONS.COURSES_MANAGE],
  },
  {
    key: 'campuses',
    label: 'Sedes',
    permissions: [PERMISSIONS.CAMPUSES_VIEW, PERMISSIONS.CAMPUSES_MANAGE],
  },
  {
    key: 'periods',
    label: 'Periodos',
    permissions: [PERMISSIONS.PERIODS_VIEW, PERMISSIONS.PERIODS_MANAGE],
  },
  {
    key: 'payments',
    label: 'Pagos',
    permissions: [PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.PAYMENTS_MANAGE],
  },
  {
    key: 'certificates',
    label: 'Certificados',
    permissions: [PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.PAYMENTS_MANAGE],
  },
];

const MANAGEMENT_ACCESS_CODES = Array.from(
  new Set(MANAGEMENT_ACCESS_GROUPS.flatMap((group) => group.permissions)),
).sort();

const MENU_ACCESS_GROUPS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    permissions: [PERMISSIONS.DASHBOARD_VIEW],
  },
  {
    key: 'management',
    label: 'Gestión académica',
    permissions: MANAGEMENT_ACCESS_CODES,
  },
  {
    key: 'courses',
    label: 'Cursos',
    permissions: [PERMISSIONS.COURSES_VIEW, PERMISSIONS.COURSES_MANAGE],
  },
  {
    key: 'calendar',
    label: 'Calendario',
    permissions: [PERMISSIONS.TEACHERS_ASSIGNMENTS_VIEW],
  },
  {
    key: 'payments',
    label: 'Reporte de pagos',
    permissions: [PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.PAYMENTS_MANAGE],
  },
  {
    key: 'users',
    label: 'Usuarios',
    permissions: [PERMISSIONS.USERS_VIEW],
  },
];

const ROLE_FILTER_OPTIONS = [{ value: ROLE_ADMIN, label: 'ADMIN' }, ...availableRoles.filter((role) => role !== ROLE_ADMIN).map((role) => ({ value: role, label: role })), { value: '', label: 'Todos los roles' }];

const sortUnique = (items = []) => Array.from(new Set(items.filter(Boolean))).sort();

const arraysEqual = (left = [], right = []) => {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
};

const getPermissionGroupState = (currentPermissions, requiredPermissions) => {
  const matched = requiredPermissions.filter((code) => currentPermissions.includes(code)).length;
  if (matched <= 0) return 'none';
  if (matched >= requiredPermissions.length) return 'all';
  return 'partial';
};

const getPrimaryRole = (roles = []) => {
  if (!Array.isArray(roles) || roles.length === 0) return '';
  return availableRoles.find((role) => roles.includes(role)) || roles[0] || '';
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

export default function UsersPage() {
  const { user, hasPermission } = useAuth();
  const [users, setUsers] = useState([]);
  const [userSearchInput, setUserSearchInput] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState(ROLE_ADMIN);
  const [userPage, setUserPage] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [exportingUsers, setExportingUsers] = useState(false);
  const [statusUpdatingUserId, setStatusUpdatingUserId] = useState(null);

  const [editingCredentialUser, setEditingCredentialUser] = useState(null);
  const [credentialForm, setCredentialForm] = useState({ ...INITIAL_CREDENTIAL_FORM });
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [loadingCredentialAccess, setLoadingCredentialAccess] = useState(false);
  const [credentialAccessPermissions, setCredentialAccessPermissions] = useState([]);
  const [initialCredentialAccessPermissions, setInitialCredentialAccessPermissions] = useState([]);
  const [credentialPermissionMode, setCredentialPermissionMode] = useState('ROLE');
  const [accessMenuLevel, setAccessMenuLevel] = useState('MAIN');

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const canViewUsers = hasPermission(PERMISSIONS.USERS_VIEW);
  const canManageRoles = hasPermission(PERMISSIONS.USERS_ROLES_MANAGE);
  const canManageStatus = hasPermission(PERMISSIONS.USERS_STATUS_MANAGE);
  const canManagePermissions = hasPermission(PERMISSIONS.USERS_PERMISSIONS_MANAGE);
  const isRootAdmin = (user?.roles || []).includes(ROLE_ADMIN);

  const canOpenEditor = canManageStatus || canManagePermissions || (canManageRoles && isRootAdmin);

  const loadUsers = useCallback(
    async ({ q = userSearch, role = userRoleFilter, page = userPage, pageSize = USER_PAGE_SIZE } = {}) => {
      if (!canViewUsers) {
        setUsers([]);
        setUserTotal(0);
        return;
      }

      setLoadingUsers(true);
      try {
        const response = await api.get('/users', {
          params: {
            q: q || undefined,
            role: role || undefined,
            page,
            page_size: pageSize,
          },
        });

        const items = response.data.items || [];
        const meta = response.data.meta || {};
        const total = Number(meta.total || items.length);
        const totalPages = Math.max(1, Math.ceil(total / pageSize));

        if (page > totalPages) {
          setUserPage(totalPages);
          return;
        }

        setUsers(items);
        setUserTotal(total);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'No se pudieron cargar los usuarios.');
      } finally {
        setLoadingUsers(false);
      }
    },
    [canViewUsers, userPage, userRoleFilter, userSearch],
  );

  const loadCredentialAccess = useCallback(
    async (targetUserId) => {
      if (!canManagePermissions || !targetUserId) {
        setCredentialAccessPermissions([]);
        setInitialCredentialAccessPermissions([]);
        setCredentialPermissionMode('ROLE');
        return;
      }

      setLoadingCredentialAccess(true);
      try {
        const response = await api.get(`/users/permissions/user/${targetUserId}`, { _skipCampusScope: true });
        const detail = response.data?.item || {};
        const sourcePermissions =
          detail.permission_mode === 'PERSONAL'
            ? detail.personal_permissions || []
            : detail.effective_permissions || [];
        const normalizedPermissions = sortUnique(sourcePermissions);

        setCredentialAccessPermissions(normalizedPermissions);
        setInitialCredentialAccessPermissions(normalizedPermissions);
        setCredentialPermissionMode(detail.permission_mode || 'ROLE');
      } catch (requestError) {
        setCredentialAccessPermissions([]);
        setInitialCredentialAccessPermissions([]);
        setCredentialPermissionMode('ROLE');
        setError(
          requestError.response?.data?.message || 'No se pudieron cargar los accesos del usuario seleccionado.',
        );
      } finally {
        setLoadingCredentialAccess(false);
      }
    },
    [canManagePermissions],
  );

  useEffect(() => {
    const debounce = setTimeout(() => {
      setUserPage(1);
      setUserSearch(userSearchInput.trim());
    }, 250);

    return () => clearTimeout(debounce);
  }, [userSearchInput]);

  useEffect(() => {
    setUserPage(1);
  }, [userRoleFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const clearUserFilters = () => {
    setUserSearchInput('');
    setUserSearch('');
    setUserRoleFilter(ROLE_ADMIN);
    setUserPage(1);
  };

  const exportUsersCsv = async () => {
    if (!canViewUsers) return;

    setExportingUsers(true);
    setMessage('');
    setError('');

    try {
      const allUsers = await fetchAllPages({
        path: '/users',
        params: {
          q: userSearch || undefined,
          role: userRoleFilter || undefined,
        },
      });

      const rows = allUsers.map((item) => ({
        id: item.id,
        usuario: `${item.first_name || ''} ${item.last_name || ''}`.trim(),
        documento: item.document_number || '',
        correo: item.email || '',
        activo: item.is_active ? 'SI' : 'NO',
        roles: (item.roles || []).join(' | '),
        creado_en: item.created_at ? new Date(item.created_at).toLocaleString() : '',
      }));

      await downloadCsv({
        filename: `usuarios_${new Date().toISOString().slice(0, 10)}.xlsx`,
        headers: [
          { key: 'id', label: 'ID' },
          { key: 'usuario', label: 'Usuario' },
          { key: 'documento', label: 'Documento' },
          { key: 'correo', label: 'Correo' },
          { key: 'activo', label: 'Activo' },
          { key: 'roles', label: 'Roles' },
          { key: 'creado_en', label: 'Creado en' },
        ],
        rows,
      });

      setMessage(`Exportación completada: ${rows.length} usuarios.`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo exportar el Excel de usuarios.');
    } finally {
      setExportingUsers(false);
    }
  };

  const toggleStatus = async (targetUser) => {
    if (!canManageStatus) return;

    setMessage('');
    setError('');
    setStatusUpdatingUserId(targetUser.id);

    try {
      await api.patch(`/users/${targetUser.id}/status`, { is_active: !targetUser.is_active });
      setMessage('Estado de usuario actualizado.');
      await loadUsers();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo actualizar el estado.');
    } finally {
      setStatusUpdatingUserId(null);
    }
  };

  const openCredentialEditor = (targetUser) => {
    const parsedDocument = parseDocumentValue(targetUser.document_number);
    setEditingCredentialUser(targetUser);
    setCredentialForm({
      first_name: targetUser.first_name || '',
      last_name: targetUser.last_name || '',
      email: targetUser.email || '',
      password: '',
      document_type: parsedDocument.document_type,
      document_number: parsedDocument.document_number,
      phone: targetUser.phone || '',
      address: targetUser.address || '',
      role: getPrimaryRole(targetUser.roles),
    });
    setShowPassword(false);
    setLoadingCredentialAccess(false);
    setCredentialAccessPermissions([]);
    setInitialCredentialAccessPermissions([]);
    setCredentialPermissionMode('ROLE');
    setAccessMenuLevel('MAIN');
    setMessage('');
    setError('');

    if (canManagePermissions) {
      loadCredentialAccess(targetUser.id);
    }
  };

  const closeCredentialEditor = useCallback(() => {
    setEditingCredentialUser(null);
    setCredentialForm({ ...INITIAL_CREDENTIAL_FORM });
    setShowPassword(false);
    setLoadingCredentialAccess(false);
    setCredentialAccessPermissions([]);
    setInitialCredentialAccessPermissions([]);
    setCredentialPermissionMode('ROLE');
    setAccessMenuLevel('MAIN');
  }, []);

  useEffect(() => {
    if (!editingCredentialUser) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !savingCredentials) {
        closeCredentialEditor();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [editingCredentialUser, savingCredentials, closeCredentialEditor]);

  const setCredentialGroupAccess = (group, enabled) => {
    setCredentialAccessPermissions((prev) => {
      const next = new Set(prev);
      for (const code of group.permissions) {
        if (enabled) next.add(code);
        else next.delete(code);
      }
      return Array.from(next).sort();
    });
  };

  const setAllCredentialAccess = (enabled) => {
    setCredentialAccessPermissions((prev) => {
      const next = new Set(prev);
      for (const group of MENU_ACCESS_GROUPS) {
        for (const code of group.permissions) {
          if (enabled) next.add(code);
          else next.delete(code);
        }
      }
      return Array.from(next).sort();
    });
  };

  const setAllManagementAccess = (enabled) => {
    setCredentialAccessPermissions((prev) => {
      const next = new Set(prev);
      for (const code of MANAGEMENT_ACCESS_CODES) {
        if (enabled) next.add(code);
        else next.delete(code);
      }
      return Array.from(next).sort();
    });
  };

  const saveUserCredentials = async () => {
    if (!editingCredentialUser) return;

    const normalizedFirstName = credentialForm.first_name.trim();
    const normalizedLastName = credentialForm.last_name.trim();
    const normalizedEmail = credentialForm.email.trim().toLowerCase();
    const normalizedPhone = credentialForm.phone.trim();
    const normalizedAddress = credentialForm.address.trim();
    const password = credentialForm.password;
    const normalizedDocumentNumber = credentialForm.document_number.trim();
    const nextDocumentValue = normalizedDocumentNumber
      ? buildDocumentValue(credentialForm.document_type, normalizedDocumentNumber)
      : '';
    const currentRole = getPrimaryRole(editingCredentialUser.roles);
    const nextRole = (credentialForm.role || '').trim() || currentRole;

    const roleChanged = canManageRoles && isRootAdmin && Boolean(nextRole) && nextRole !== currentRole;

    if ((canManageStatus || canManageRoles) && (!normalizedFirstName || !normalizedLastName)) {
      setError('Nombre y apellido son obligatorios.');
      return;
    }

    if (canManageRoles && !isRootAdmin && nextRole !== currentRole) {
      setError('Solo el admin raiz puede cambiar roles.');
      return;
    }

    const payload = {};

    if (canManageStatus) {
      if (normalizedFirstName !== (editingCredentialUser.first_name || '').trim()) {
        payload.first_name = normalizedFirstName;
      }
      if (normalizedLastName !== (editingCredentialUser.last_name || '').trim()) {
        payload.last_name = normalizedLastName;
      }
      if (normalizedEmail && normalizedEmail !== (editingCredentialUser.email || '').trim().toLowerCase()) {
        payload.email = normalizedEmail;
      }
      if (password) {
        payload.password = password;
      }
      if (nextDocumentValue && nextDocumentValue !== (editingCredentialUser.document_number || '').trim()) {
        payload.document_number = nextDocumentValue;
      }
      if (normalizedPhone !== (editingCredentialUser.phone || '').trim()) {
        payload.phone = normalizedPhone || null;
      }
      if (normalizedAddress !== (editingCredentialUser.address || '').trim()) {
        payload.address = normalizedAddress || null;
      }
    }

    const normalizedAccess = sortUnique(credentialAccessPermissions);
    const normalizedInitialAccess = sortUnique(initialCredentialAccessPermissions);
    const accessChanged = canManagePermissions && !arraysEqual(normalizedAccess, normalizedInitialAccess);

    if (Object.keys(payload).length === 0 && !roleChanged && !accessChanged) {
      setError('No hay cambios para guardar.');
      return;
    }

    setSavingCredentials(true);
    setMessage('');
    setError('');

    try {
      if (Object.keys(payload).length > 0) {
        await api.patch(`/users/${editingCredentialUser.id}/credentials`, payload);
      }

      if (roleChanged) {
        await api.patch(`/users/${editingCredentialUser.id}/role`, {
          role: nextRole,
        });
      }

      if (accessChanged) {
        await api.put(
          `/users/permissions/user/${editingCredentialUser.id}`,
          {
            permission_mode: 'PERSONAL',
            permissions: normalizedAccess,
          },
          { _skipCampusScope: true },
        );
        setInitialCredentialAccessPermissions(normalizedAccess);
        setCredentialPermissionMode('PERSONAL');
      }

      if (accessChanged && roleChanged) {
        setMessage('Datos, rol y accesos actualizados.');
      } else if (accessChanged) {
        setMessage('Accesos personalizados actualizados.');
      } else if (roleChanged) {
        setMessage('Acceso, datos y rol actualizados.');
      } else {
        setMessage('Acceso y datos actualizados.');
      }

      closeCredentialEditor();
      await loadUsers();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudieron actualizar los datos del usuario.');
    } finally {
      setSavingCredentials(false);
    }
  };

  const enabledMenuCount = useMemo(
    () =>
      MENU_ACCESS_GROUPS.filter(
        (group) => getPermissionGroupState(credentialAccessPermissions, group.permissions) === 'all',
      ).length,
    [credentialAccessPermissions],
  );

  const enabledManagementCount = useMemo(
    () =>
      MANAGEMENT_ACCESS_GROUPS.filter(
        (group) => getPermissionGroupState(credentialAccessPermissions, group.permissions) === 'all',
      ).length,
    [credentialAccessPermissions],
  );

  const userTotalPages = Math.max(1, Math.ceil(userTotal / USER_PAGE_SIZE));

  if (!canViewUsers) {
    return (
      <section className="card">
        <h1 className="text-xl font-semibold">Usuarios</h1>
        <p className="mt-2 text-sm text-primary-700">No tienes permisos para acceder a este modulo.</p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary-900">Usuarios y accesos</h1>
        <p className="text-sm text-primary-700">
          Gestiona usuarios por rol, estado y accesos por pestañas del sistema.
        </p>
      </div>

      {message ? <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-800">{message}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <article className="card overflow-x-auto">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Usuarios registrados</h2>
            <p className="text-sm text-primary-700">
              {users.length} en pagina / {userTotal} total
            </p>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
            <input
              className="app-input w-full lg:w-72"
              placeholder="Buscar por nombre, documento o correo"
              value={userSearchInput}
              onChange={(event) => setUserSearchInput(event.target.value)}
            />
            <select
              className="app-input w-full lg:w-48"
              value={userRoleFilter}
              onChange={(event) => setUserRoleFilter(event.target.value)}
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
              onClick={clearUserFilters}
              disabled={loadingUsers || (!userSearch && !userSearchInput && userRoleFilter === ROLE_ADMIN)}
              className="rounded-lg border border-primary-200 px-3 py-2 text-sm text-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={exportUsersCsv}
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
                        onClick={() => toggleStatus(targetUser)}
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
                      onClick={() => openCredentialEditor(targetUser)}
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
          onPageChange={setUserPage}
          disabled={loadingUsers}
          label="usuarios"
        />

        {!canManageStatus && !canManagePermissions ? (
          <p className="mt-3 text-xs text-primary-600">
            Tienes acceso de solo lectura. Para editar estado, datos o accesos del usuario, habilita los permisos
            correspondientes.
          </p>
        ) : null}
      </article>

      {editingCredentialUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cerrar editor de usuario"
            onClick={closeCredentialEditor}
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
                onClick={closeCredentialEditor}
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
                      onChange={(event) =>
                        setCredentialForm((prev) => ({
                          ...prev,
                          first_name: event.target.value,
                        }))
                      }
                      placeholder="Nombres"
                    />
                  </label>

                  <label className="space-y-1 text-sm text-primary-800">
                    <span className="font-medium">Apellidos</span>
                    <input
                      className="app-input"
                      value={credentialForm.last_name}
                      disabled={!canManageStatus}
                      onChange={(event) =>
                        setCredentialForm((prev) => ({
                          ...prev,
                          last_name: event.target.value,
                        }))
                      }
                      placeholder="Apellidos"
                    />
                  </label>

                  <label className="space-y-1 text-sm text-primary-800">
                    <span className="font-medium">Tipo de documento</span>
                    <select
                      className="app-input"
                      value={credentialForm.document_type}
                      disabled={!canManageStatus}
                      onChange={(event) =>
                        setCredentialForm((prev) => ({
                          ...prev,
                          document_type: event.target.value,
                        }))
                      }
                    >
                      {DOCUMENT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1 text-sm text-primary-800">
                    <span className="font-medium">Numero de documento</span>
                    <input
                      className="app-input"
                      value={credentialForm.document_number}
                      disabled={!canManageStatus}
                      onChange={(event) =>
                        setCredentialForm((prev) => ({
                          ...prev,
                          document_number: event.target.value,
                        }))
                      }
                      placeholder="Numero de documento"
                    />
                  </label>

                  <label className="space-y-1 text-sm text-primary-800">
                    <span className="font-medium">Correo</span>
                    <input
                      type="email"
                      className="app-input"
                      value={credentialForm.email}
                      disabled={!canManageStatus}
                      onChange={(event) =>
                        setCredentialForm((prev) => ({
                          ...prev,
                          email: event.target.value,
                        }))
                      }
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
                        onChange={(event) =>
                          setCredentialForm((prev) => ({
                            ...prev,
                            password: event.target.value,
                          }))
                        }
                        placeholder="Minimo 8 caracteres"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
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
                      onChange={(event) =>
                        setCredentialForm((prev) => ({
                          ...prev,
                          role: event.target.value,
                        }))
                      }
                      disabled={!canManageRoles || !isRootAdmin}
                    >
                      <option value="">Sin rol asignado</option>
                      {availableRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    {!canManageRoles ? (
                      <span className="block text-xs text-primary-600">No tienes permiso para gestionar roles.</span>
                    ) : null}
                    {canManageRoles && !isRootAdmin ? (
                      <span className="block text-xs text-primary-600">Solo el admin raiz puede cambiar el rol.</span>
                    ) : null}
                  </label>

                  <label className="space-y-1 text-sm text-primary-800">
                    <span className="font-medium">Telefono</span>
                    <input
                      className="app-input"
                      value={credentialForm.phone}
                      disabled={!canManageStatus}
                      onChange={(event) =>
                        setCredentialForm((prev) => ({
                          ...prev,
                          phone: event.target.value,
                        }))
                      }
                      placeholder="Telefono (opcional)"
                    />
                  </label>

                  <label className="space-y-1 text-sm text-primary-800 md:col-span-2">
                    <span className="font-medium">Direccion</span>
                    <input
                      className="app-input"
                      value={credentialForm.address}
                      disabled={!canManageStatus}
                      onChange={(event) =>
                        setCredentialForm((prev) => ({
                          ...prev,
                          address: event.target.value,
                        }))
                      }
                      placeholder="Direccion (opcional)"
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
                    {getPrimaryRole(editingCredentialUser.roles) === ROLE_ADMIN ? (
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
                                className={`rounded-lg border p-2 ${
                                  checked
                                    ? 'border-primary-300 bg-primary-50'
                                    : state === 'partial'
                                      ? 'border-amber-200 bg-amber-50'
                                      : 'border-primary-100 bg-white'
                                }`}
                              >
                                <label className="flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) => setCredentialGroupAccess(group, event.target.checked)}
                                  />
                                  <span className="text-xs font-semibold text-primary-900">
                                    {group.label}
                                    {state === 'partial' ? ' (parcial)' : ''}
                                  </span>
                                </label>

                                {isManagementMenu ? (
                                  <button
                                    type="button"
                                    onClick={() => setAccessMenuLevel('MANAGEMENT')}
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
                          onClick={() => setAllCredentialAccess(true)}
                          className="rounded-lg border border-primary-300 px-3 py-1.5 text-xs font-semibold text-primary-800"
                        >
                          Activar todos los menús
                        </button>
                        <button
                          type="button"
                          onClick={() => setAllCredentialAccess(false)}
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
                            onClick={() => setAccessMenuLevel('MAIN')}
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
                                className={`flex items-start gap-2 rounded-lg border p-2 ${
                                  checked
                                    ? 'border-primary-300 bg-primary-50'
                                    : state === 'partial'
                                      ? 'border-amber-200 bg-amber-50'
                                      : 'border-primary-100 bg-white'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => setCredentialGroupAccess(group, event.target.checked)}
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
                            onClick={() => setAllManagementAccess(true)}
                            className="rounded-lg border border-primary-300 px-3 py-1.5 text-xs font-semibold text-primary-800"
                          >
                            Activar todas las secciones
                          </button>
                          <button
                            type="button"
                            onClick={() => setAllManagementAccess(false)}
                            className="rounded-lg border border-primary-300 px-3 py-1.5 text-xs font-semibold text-primary-800"
                          >
                            Quitar secciones
                          </button>
                        </div>
                      </div>
                    )}

                    <p className="mt-3 text-xs text-primary-700">
                      Modo actual del usuario: {credentialPermissionMode}. Al guardar desde esta pantalla se aplicará
                      modo PERSONAL para usar esta configuración.
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={saveUserCredentials}
                disabled={savingCredentials || (canManagePermissions && loadingCredentialAccess)}
                className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingCredentials ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
