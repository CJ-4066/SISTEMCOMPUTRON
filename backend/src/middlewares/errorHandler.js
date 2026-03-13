module.exports = (error, req, res, _next) => {
  if (error.code === '23505') {
    return res.status(409).json({
      message: 'Conflicto de datos: registro duplicado.',
      details: null,
      request_id: req.id || null,
    });
  }

  if (error.code === '23503') {
    return res.status(400).json({
      message: 'Relación inválida: clave foránea no encontrada.',
      details: null,
      request_id: req.id || null,
    });
  }

  if (error.code === '22P02') {
    return res.status(400).json({
      message: 'Formato de dato inválido.',
      details: null,
      request_id: req.id || null,
    });
  }

  const statusCode = error.statusCode || 500;
  const safeMessage = statusCode >= 500 ? 'Error interno del servidor' : error.message || 'Error interno del servidor';
  const safeDetails = statusCode >= 500 ? null : error.details || null;

  if (statusCode >= 500) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'Unhandled error',
        request_id: req.id || null,
        method: req.method,
        path: req.originalUrl,
        error: error.message,
        stack: error.stack,
      }),
    );
  }

  return res.status(statusCode).json({
    message: safeMessage,
    details: safeDetails,
    request_id: req.id || null,
  });
};
