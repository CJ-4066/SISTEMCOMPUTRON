const ApiError = require('./apiError');
const { normalizeCampusIds } = require('../services/userCampuses.service');

const parseCampusScopeId = (req) => {
  const raw = req?.query?.campus_id;
  const hasRequestedCampus = raw !== undefined && raw !== null && raw !== '';
  let requestedCampusId = null;

  if (hasRequestedCampus) {
    requestedCampusId = Number(raw);
    if (!Number.isInteger(requestedCampusId) || requestedCampusId <= 0) {
      throw new ApiError(400, 'Parametro campus_id invalido.');
    }
  }

  if (req?.user?.is_global_campus_access) {
    return requestedCampusId;
  }

  const allowedCampusIds = normalizeCampusIds(req?.user?.campus_ids);
  if (allowedCampusIds.length === 0) {
    throw new ApiError(403, 'El usuario no tiene sedes asignadas.');
  }

  if (requestedCampusId && !allowedCampusIds.includes(requestedCampusId)) {
    throw new ApiError(403, 'No tiene acceso a la sede solicitada.');
  }

  if (requestedCampusId) return requestedCampusId;

  const primaryCampusId = Number(req?.user?.base_campus_id);
  if (allowedCampusIds.includes(primaryCampusId)) return primaryCampusId;
  return allowedCampusIds[0];
};

module.exports = {
  parseCampusScopeId,
};
