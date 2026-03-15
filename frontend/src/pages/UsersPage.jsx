import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import { downloadCsv } from '../utils/csv';
import { fetchAllPages } from '../utils/paginatedFetch';
import CredentialEditorModal from './users/CredentialEditorModal';
import UsersListCard from './users/UsersListCard';
import {
  INITIAL_CREDENTIAL_FORM,
  MANAGEMENT_ACCESS_CODES,
  MANAGEMENT_ACCESS_GROUPS,
  MENU_ACCESS_CODES,
  MENU_ACCESS_GROUPS,
  ROLE_ADMIN,
  USER_PAGE_SIZE,
} from './users/constants';
import {
  arraysEqual,
  buildCredentialUpdateState,
  buildUserExportRows,
  createCredentialForm,
  getCredentialSaveSuccessMessage,
  getPermissionGroupState,
  sortUnique,
  updatePermissions,
} from './users/helpers';

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

  const resetFeedback = useCallback(() => {
    setMessage('');
    setError('');
  }, []);

  const resetCredentialAccessState = useCallback(() => {
    setLoadingCredentialAccess(false);
    setCredentialAccessPermissions([]);
    setInitialCredentialAccessPermissions([]);
    setCredentialPermissionMode('ROLE');
    setAccessMenuLevel('MAIN');
  }, []);

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
        resetCredentialAccessState();
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
        resetCredentialAccessState();
        setError(
          requestError.response?.data?.message || 'No se pudieron cargar los accesos del usuario seleccionado.',
        );
      } finally {
        setLoadingCredentialAccess(false);
      }
    },
    [canManagePermissions, resetCredentialAccessState],
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
    resetFeedback();

    try {
      const allUsers = await fetchAllPages({
        path: '/users',
        params: {
          q: userSearch || undefined,
          role: userRoleFilter || undefined,
        },
      });
      const rows = buildUserExportRows(allUsers);

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

    resetFeedback();
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
    setEditingCredentialUser(targetUser);
    setCredentialForm(createCredentialForm(targetUser));
    setShowPassword(false);
    resetCredentialAccessState();
    resetFeedback();

    if (canManagePermissions) {
      loadCredentialAccess(targetUser.id);
    }
  };

  const closeCredentialEditor = useCallback(() => {
    setEditingCredentialUser(null);
    setCredentialForm({ ...INITIAL_CREDENTIAL_FORM });
    setShowPassword(false);
    resetCredentialAccessState();
  }, [resetCredentialAccessState]);

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

  const handleCredentialFieldChange = useCallback((field, value) => {
    setCredentialForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const setCredentialGroupAccess = useCallback((group, enabled) => {
    setCredentialAccessPermissions((prev) => updatePermissions(prev, group.permissions, enabled));
  }, []);

  const setAllCredentialAccess = useCallback((enabled) => {
    setCredentialAccessPermissions((prev) => updatePermissions(prev, MENU_ACCESS_CODES, enabled));
  }, []);

  const setAllManagementAccess = useCallback((enabled) => {
    setCredentialAccessPermissions((prev) => updatePermissions(prev, MANAGEMENT_ACCESS_CODES, enabled));
  }, []);

  const saveUserCredentials = async () => {
    if (!editingCredentialUser) return;

    const { payload, normalizedFirstName, normalizedLastName, currentRole, nextRole, roleChanged } =
      buildCredentialUpdateState({
        credentialForm,
        editingCredentialUser,
        canManageStatus,
        canManageRoles,
        isRootAdmin,
      });

    if ((canManageStatus || canManageRoles) && (!normalizedFirstName || !normalizedLastName)) {
      setError('Nombre y apellido son obligatorios.');
      return;
    }

    if (canManageRoles && !isRootAdmin && nextRole !== currentRole) {
      setError('Solo el admin raiz puede cambiar roles.');
      return;
    }

    const normalizedAccess = sortUnique(credentialAccessPermissions);
    const normalizedInitialAccess = sortUnique(initialCredentialAccessPermissions);
    const accessChanged = canManagePermissions && !arraysEqual(normalizedAccess, normalizedInitialAccess);

    if (Object.keys(payload).length === 0 && !roleChanged && !accessChanged) {
      setError('No hay cambios para guardar.');
      return;
    }

    setSavingCredentials(true);
    resetFeedback();

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

      setMessage(getCredentialSaveSuccessMessage({ accessChanged, roleChanged }));

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

      <UsersListCard
        users={users}
        userTotal={userTotal}
        userPage={userPage}
        userTotalPages={userTotalPages}
        onUserPageChange={setUserPage}
        userSearchInput={userSearchInput}
        onUserSearchInputChange={setUserSearchInput}
        userRoleFilter={userRoleFilter}
        onUserRoleFilterChange={setUserRoleFilter}
        onClearUserFilters={clearUserFilters}
        clearFiltersDisabled={loadingUsers || (!userSearch && !userSearchInput && userRoleFilter === ROLE_ADMIN)}
        loadingUsers={loadingUsers}
        exportingUsers={exportingUsers}
        onExportUsers={exportUsersCsv}
        statusUpdatingUserId={statusUpdatingUserId}
        canManageStatus={canManageStatus}
        onToggleStatus={toggleStatus}
        onOpenCredentialEditor={openCredentialEditor}
        canOpenEditor={canOpenEditor}
        showReadOnlyNote={!canManageStatus && !canManagePermissions}
      />

      <CredentialEditorModal
        editingCredentialUser={editingCredentialUser}
        savingCredentials={savingCredentials}
        onClose={closeCredentialEditor}
        credentialForm={credentialForm}
        onCredentialFieldChange={handleCredentialFieldChange}
        canManageStatus={canManageStatus}
        canManageRoles={canManageRoles}
        isRootAdmin={isRootAdmin}
        showPassword={showPassword}
        onTogglePassword={() => setShowPassword((prev) => !prev)}
        enabledMenuCount={enabledMenuCount}
        enabledManagementCount={enabledManagementCount}
        canManagePermissions={canManagePermissions}
        loadingCredentialAccess={loadingCredentialAccess}
        credentialAccessPermissions={credentialAccessPermissions}
        accessMenuLevel={accessMenuLevel}
        onAccessMenuLevelChange={setAccessMenuLevel}
        onCredentialGroupAccessChange={setCredentialGroupAccess}
        onAllCredentialAccessChange={setAllCredentialAccess}
        onAllManagementAccessChange={setAllManagementAccess}
        credentialPermissionMode={credentialPermissionMode}
        onSave={saveUserCredentials}
      />
    </section>
  );
}
