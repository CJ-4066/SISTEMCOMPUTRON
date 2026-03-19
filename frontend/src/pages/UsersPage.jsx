import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/permissions';
import { downloadCsv } from '../utils/csv';
import { buildDocumentValue } from '../utils/document';
import { fetchAllPages } from '../utils/paginatedFetch';
import CredentialEditorModal from './users/CredentialEditorModal';
import UserCreateModal from './users/UserCreateModal';
import UsersListCard from './users/UsersListCard';
import {
  DEFAULT_CREATE_ROLE,
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
  createNewUserForm,
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

  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [createUserForm, setCreateUserForm] = useState(createNewUserForm());
  const [creatingUser, setCreatingUser] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createAccessPermissions, setCreateAccessPermissions] = useState([]);
  const [createAccessMenuLevel, setCreateAccessMenuLevel] = useState('MAIN');
  const [campuses, setCampuses] = useState([]);
  const [loadingCampuses, setLoadingCampuses] = useState(false);
  const [rolePermissionTemplates, setRolePermissionTemplates] = useState(null);
  const [loadingRolePermissionTemplates, setLoadingRolePermissionTemplates] = useState(false);

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

  const canCreateUsers = hasPermission(PERMISSIONS.USERS_CREATE);
  const canViewUsers = hasPermission(PERMISSIONS.USERS_VIEW);
  const canManageRoles = hasPermission(PERMISSIONS.USERS_ROLES_MANAGE);
  const canManageStatus = hasPermission(PERMISSIONS.USERS_STATUS_MANAGE);
  const canManagePermissions = hasPermission(PERMISSIONS.USERS_PERMISSIONS_MANAGE);
  const canReadCampuses = hasPermission(PERMISSIONS.CAMPUSES_VIEW) || hasPermission(PERMISSIONS.CAMPUSES_MANAGE);
  const isRootAdmin = (user?.roles || []).includes(ROLE_ADMIN) && !user?.base_campus_id;
  const creatorHasCampusScope = Boolean(user?.base_campus_id);

  const canOpenEditor = canManageStatus || canManagePermissions || (canManageRoles && isRootAdmin);
  const canConfigureCreateAccess = canManagePermissions && rolePermissionTemplates !== null;

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

  const resetCreateUserState = useCallback(() => {
    setShowCreateUserModal(false);
    setCreateUserForm(createNewUserForm());
    setCreatingUser(false);
    setShowCreatePassword(false);
    setCreateAccessPermissions([]);
    setCreateAccessMenuLevel('MAIN');
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

  const loadRolePermissionTemplates = useCallback(async () => {
    if (!canManagePermissions) {
      setRolePermissionTemplates(null);
      return;
    }

    setLoadingRolePermissionTemplates(true);
    try {
      const response = await api.get('/users/permissions', { _skipCampusScope: true });
      const nextTemplates = Object.fromEntries(
        (response.data?.roles || []).map((role) => [role.name, sortUnique(role.permissions || [])]),
      );
      setRolePermissionTemplates(nextTemplates);
    } catch (requestError) {
      setRolePermissionTemplates(null);
      setError(
        requestError.response?.data?.message || 'No se pudieron cargar las vistas base de los roles.',
      );
    } finally {
      setLoadingRolePermissionTemplates(false);
    }
  }, [canManagePermissions]);

  const loadCampuses = useCallback(async () => {
    if (!canReadCampuses) {
      setCampuses([]);
      return;
    }

    setLoadingCampuses(true);
    try {
      const response = await api.get('/campuses', { _skipCampusScope: true });
      setCampuses(response.data?.items || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudieron cargar las sedes.');
    } finally {
      setLoadingCampuses(false);
    }
  }, [canReadCampuses]);

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

  useEffect(() => {
    if (!canManagePermissions) {
      setRolePermissionTemplates(null);
      setLoadingRolePermissionTemplates(false);
      return;
    }

    loadRolePermissionTemplates();
  }, [canManagePermissions, loadRolePermissionTemplates]);

  const getRolePermissionTemplate = useCallback(
    (roleName) => sortUnique(rolePermissionTemplates?.[roleName] || []),
    [rolePermissionTemplates],
  );

  useEffect(() => {
    if (!showCreateUserModal || !canConfigureCreateAccess) return;

    const nextRole = createUserForm.role || DEFAULT_CREATE_ROLE;
    setCreateAccessPermissions(getRolePermissionTemplate(nextRole));
    setCreateAccessMenuLevel('MAIN');
  }, [showCreateUserModal, canConfigureCreateAccess, createUserForm.role, getRolePermissionTemplate]);

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
          { key: 'sede', label: 'Sede' },
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

  const openCreateUserModal = () => {
    if (!canCreateUsers) return;

    resetFeedback();
    setShowCreateUserModal(true);
    setCreateUserForm(createNewUserForm());
    setShowCreatePassword(false);
    setCreateAccessPermissions(canConfigureCreateAccess ? getRolePermissionTemplate(DEFAULT_CREATE_ROLE) : []);
    setCreateAccessMenuLevel('MAIN');

    if (canManagePermissions && rolePermissionTemplates === null && !loadingRolePermissionTemplates) {
      loadRolePermissionTemplates();
    }
    if (canManageRoles && isRootAdmin && canReadCampuses && campuses.length === 0 && !loadingCampuses) {
      loadCampuses();
    }
  };

  const closeCreateUserModal = useCallback(() => {
    resetCreateUserState();
  }, [resetCreateUserState]);

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

  useEffect(() => {
    if (!showCreateUserModal) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !creatingUser) {
        closeCreateUserModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [showCreateUserModal, creatingUser, closeCreateUserModal]);

  const handleCreateUserFieldChange = useCallback((field, value) => {
    setCreateUserForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'role' && value !== ROLE_ADMIN ? { base_campus_id: '' } : {}),
    }));
  }, []);

  const handleCredentialFieldChange = useCallback((field, value) => {
    setCredentialForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const setCreateAccessGroup = useCallback((group, enabled) => {
    setCreateAccessPermissions((prev) => updatePermissions(prev, group.permissions, enabled));
  }, []);

  const setAllCreateAccess = useCallback((enabled) => {
    setCreateAccessPermissions((prev) => updatePermissions(prev, MENU_ACCESS_CODES, enabled));
  }, []);

  const setAllCreateManagementAccess = useCallback((enabled) => {
    setCreateAccessPermissions((prev) => updatePermissions(prev, MANAGEMENT_ACCESS_CODES, enabled));
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

  const createRoleTemplatePermissions = useMemo(
    () => getRolePermissionTemplate(createUserForm.role || DEFAULT_CREATE_ROLE),
    [createUserForm.role, getRolePermissionTemplate],
  );

  const createAccessMatchesRole = useMemo(() => {
    if (!canConfigureCreateAccess) return true;
    return arraysEqual(sortUnique(createAccessPermissions), createRoleTemplatePermissions);
  }, [canConfigureCreateAccess, createAccessPermissions, createRoleTemplatePermissions]);

  const saveNewUser = async () => {
    if (!canCreateUsers) return;

    const normalizedFirstName = createUserForm.first_name.trim();
    const normalizedLastName = createUserForm.last_name.trim();
    const normalizedEmail = createUserForm.email.trim().toLowerCase();
    const normalizedDocumentNumber = createUserForm.document_number.trim();
    const normalizedPhone = createUserForm.phone.trim();
    const normalizedAddress = createUserForm.address.trim();
    const normalizedRole =
      canManageRoles ? (createUserForm.role || DEFAULT_CREATE_ROLE).trim() : DEFAULT_CREATE_ROLE;
    const adminBaseCampusId =
      normalizedRole === ROLE_ADMIN && canManageRoles && isRootAdmin && createUserForm.base_campus_id
        ? Number(createUserForm.base_campus_id)
        : null;
    const useEmailAsPassword = Boolean(createUserForm.use_email_as_password);
    const resolvedPassword = useEmailAsPassword ? normalizedEmail : createUserForm.password;

    if (!normalizedFirstName || !normalizedLastName) {
      setError('Nombre y apellido son obligatorios.');
      return;
    }

    if (!normalizedDocumentNumber) {
      setError('El número de documento es obligatorio.');
      return;
    }

    if (!normalizedEmail) {
      setError('El correo es obligatorio.');
      return;
    }

    if (useEmailAsPassword && normalizedEmail.length < 8) {
      setError('El correo debe tener al menos 8 caracteres para usarlo como contraseña temporal.');
      return;
    }

    if (!useEmailAsPassword && createUserForm.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (normalizedRole === 'DOCENTE') {
      if (!normalizedPhone) {
        setError('El teléfono del docente es obligatorio.');
        return;
      }
      if (!normalizedAddress) {
        setError('La dirección del docente es obligatoria.');
        return;
      }
    }

    const registerPayload = {
      first_name: normalizedFirstName,
      last_name: normalizedLastName,
      document_number: buildDocumentValue(createUserForm.document_type, normalizedDocumentNumber),
      phone: normalizedPhone || null,
      address: normalizedAddress || null,
      email: normalizedEmail,
      password: resolvedPassword,
      roles: [normalizedRole],
      ...(normalizedRole === ROLE_ADMIN && canManageRoles && isRootAdmin ? { base_campus_id: adminBaseCampusId } : {}),
      must_change_password: useEmailAsPassword,
    };
    const normalizedCreateAccess = sortUnique(createAccessPermissions);
    const shouldSaveCustomAccess = canConfigureCreateAccess && !createAccessMatchesRole;

    setCreatingUser(true);
    resetFeedback();

    try {
      const response = await api.post('/auth/register', registerPayload);
      const createdUserId = response.data?.user?.id;

      if (shouldSaveCustomAccess && createdUserId) {
        try {
          await api.put(
            `/users/permissions/user/${createdUserId}`,
            {
              permission_mode: 'PERSONAL',
              permissions: normalizedCreateAccess,
            },
            { _skipCampusScope: true },
          );
        } catch (accessError) {
          closeCreateUserModal();
          setError(
            accessError.response?.data?.message ||
              'El usuario fue creado, pero no se pudieron guardar las vistas personalizadas.',
          );
          await loadUsers();
          return;
        }
      }

      closeCreateUserModal();
      setMessage(
        useEmailAsPassword
          ? shouldSaveCustomAccess
            ? 'Usuario creado con vistas personalizadas. Su contraseña temporal es el correo y deberá cambiarla en el primer ingreso.'
            : 'Usuario creado correctamente. Su contraseña temporal es el correo y deberá cambiarla en el primer ingreso.'
          : shouldSaveCustomAccess
            ? 'Usuario creado con rol y vistas personalizadas.'
            : 'Usuario creado correctamente.',
      );
      await loadUsers();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo crear el usuario.');
    } finally {
      setCreatingUser(false);
    }
  };

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

  const createEnabledMenuCount = useMemo(
    () =>
      MENU_ACCESS_GROUPS.filter(
        (group) => getPermissionGroupState(createAccessPermissions, group.permissions) === 'all',
      ).length,
    [createAccessPermissions],
  );

  const createEnabledManagementCount = useMemo(
    () =>
      MANAGEMENT_ACCESS_GROUPS.filter(
        (group) => getPermissionGroupState(createAccessPermissions, group.permissions) === 'all',
      ).length,
    [createAccessPermissions],
  );

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
        canCreateUsers={canCreateUsers}
        onOpenCreateUser={openCreateUserModal}
        statusUpdatingUserId={statusUpdatingUserId}
        canManageStatus={canManageStatus}
        onToggleStatus={toggleStatus}
        onOpenCredentialEditor={openCredentialEditor}
        canOpenEditor={canOpenEditor}
        showReadOnlyNote={!canManageStatus && !canManagePermissions && !canCreateUsers}
      />

      <UserCreateModal
        isOpen={showCreateUserModal}
        creatingUser={creatingUser}
        onClose={closeCreateUserModal}
        form={createUserForm}
        onFieldChange={handleCreateUserFieldChange}
        onSave={saveNewUser}
        canManageRoles={canManageRoles}
        isRootAdmin={isRootAdmin}
        creatorHasCampusScope={creatorHasCampusScope}
        campuses={campuses}
        loadingCampuses={loadingCampuses}
        showPassword={showCreatePassword}
        onTogglePassword={() => setShowCreatePassword((prev) => !prev)}
        canManagePermissions={canManagePermissions}
        permissionTemplatesReady={canConfigureCreateAccess}
        loadingPermissionTemplates={loadingRolePermissionTemplates}
        accessPermissions={createAccessPermissions}
        accessMenuLevel={createAccessMenuLevel}
        onAccessMenuLevelChange={setCreateAccessMenuLevel}
        onAccessGroupChange={setCreateAccessGroup}
        onAllAccessChange={setAllCreateAccess}
        onAllManagementAccessChange={setAllCreateManagementAccess}
        enabledMenuCount={createEnabledMenuCount}
        enabledManagementCount={createEnabledManagementCount}
        accessMatchesRole={createAccessMatchesRole}
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
