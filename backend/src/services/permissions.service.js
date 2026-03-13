const { query } = require('../config/db');
const env = require('../config/env');

const permissionCache = new Map();

const getCacheKey = (userId) => String(userId);

const getCachedPermissions = (userId) => {
  const key = getCacheKey(userId);
  const cached = permissionCache.get(key);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    permissionCache.delete(key);
    return null;
  }

  return cached.codes;
};

const setCachedPermissions = (userId, codes) => {
  const key = getCacheKey(userId);
  permissionCache.set(key, {
    codes,
    expiresAt: Date.now() + env.permissionCacheTtlMs,
  });
};

const getUserPermissionCodes = async (userId, db = { query }) => {
  const cached = getCachedPermissions(userId);
  if (cached) {
    return cached;
  }

  const { rows } = await db.query(
    `SELECT DISTINCT permission_code
     FROM (
       SELECT p_all.code AS permission_code
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       JOIN permissions p_all ON TRUE
       WHERE u.id = $1
         AND u.is_active = TRUE
         AND r.name = 'ADMIN'

       UNION

       SELECT p.code AS permission_code
       FROM users u
       JOIN user_permissions up ON up.user_id = u.id
       JOIN permissions p ON p.id = up.permission_id
       WHERE u.id = $1
         AND u.is_active = TRUE
         AND COALESCE(u.permission_mode, 'ROLE') = 'PERSONAL'

       UNION

       SELECT p.code AS permission_code
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE u.id = $1
         AND u.is_active = TRUE
         AND COALESCE(u.permission_mode, 'ROLE') = 'ROLE'
     ) AS granted
     ORDER BY permission_code`,
    [userId],
  );

  const codes = rows.map((row) => row.permission_code);
  setCachedPermissions(userId, codes);

  return codes;
};

const userHasPermission = async (userId, permissionCode, db = { query }) => {
  const codes = await getUserPermissionCodes(userId, db);
  return codes.includes(permissionCode);
};

const invalidateUserPermissionCache = (userId) => {
  permissionCache.delete(getCacheKey(userId));
};

const invalidateAllPermissionCache = () => {
  permissionCache.clear();
};

module.exports = {
  getUserPermissionCodes,
  userHasPermission,
  invalidateUserPermissionCache,
  invalidateAllPermissionCache,
};
