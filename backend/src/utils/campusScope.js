const ApiError = require('./apiError');

const parseCampusScopeId = (req) => {
  const raw = req?.query?.campus_id;
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(400, 'Parametro campus_id invalido.');
  }

  return parsed;
};

module.exports = {
  parseCampusScopeId,
};
