const ApiError = require('../utils/apiError');
const { verifyAccessToken } = require('../utils/token');
const { getUserPermissionCodes } = require('../services/permissions.service');

const authenticate = (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new ApiError(401, 'No autorizado. Token no enviado.'));
  }

  const token = authHeader.slice(7);

  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      roles: decoded.roles || [],
    };
    return next();
  } catch (error) {
    return next(new ApiError(401, 'Token inválido o expirado.'));
  }
};

const authorize = (...allowedRoles) => (req, _res, next) => {
  if (!req.user) {
    return next(new ApiError(401, 'No autenticado.'));
  }

  const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));

  if (!hasRole) {
    return next(new ApiError(403, 'No tiene permisos para esta acción.'));
  }

  return next();
};

const authorizePermission = (...permissionCodes) => async (req, _res, next) => {
  if (!req.user) {
    return next(new ApiError(401, 'No autenticado.'));
  }

  if (!permissionCodes.length) {
    return next(new ApiError(500, 'Permiso no configurado para esta ruta.'));
  }

  try {
    const grantedCodes = await getUserPermissionCodes(req.user.id);
    const grantedSet = new Set(grantedCodes);
    const hasAnyRequiredPermission = permissionCodes.some((permissionCode) =>
      grantedSet.has(permissionCode),
    );

    if (hasAnyRequiredPermission) {
      req.user.permissionCodes = grantedCodes;
      return next();
    }

    return next(new ApiError(403, 'No tiene permisos para esta acción.'));
  } catch (error) {
    return next(error);
  }
};

module.exports = { authenticate, authorize, authorizePermission };
