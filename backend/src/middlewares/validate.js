const ApiError = require('../utils/apiError');

const validate = (schema) => (req, _res, next) => {
  const parsed = schema.safeParse({
    body: req.body,
    params: req.params,
    query: req.query,
  });

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join(', ');
    return next(new ApiError(400, `Validación fallida: ${message}`, parsed.error.issues));
  }

  req.validated = parsed.data;
  return next();
};

module.exports = validate;
