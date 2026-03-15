const express = require('express');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();
app.set('etag', false);
const allowedOrigins = new Set(env.frontendUrls.map((origin) => String(origin).toLowerCase()));
const createOriginPatternRegex = (pattern) => {
  const normalized = String(pattern || '').trim().toLowerCase();
  if (!normalized) return null;

  const escapedPattern = normalized.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escapedPattern}$`, 'i');
};
const allowedOriginPatternRegexes = env.frontendUrlPatterns
  .map(createOriginPatternRegex)
  .filter(Boolean);
const isDevelopment = env.nodeEnv !== 'production';
const privateIpv4Pattern =
  /^(10(?:\.\d{1,3}){3}|127(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|0\.0\.0\.0)$/;
const uploadPublicDir = path.resolve(__dirname, '..', 'uploads');
const defaultJsonParser = express.json({ limit: '1mb' });
const largeJsonParser = express.json({ limit: '12mb' });
const largeJsonPathPrefixes = ['/api/forum'];

const isHealthRoute = (req) => req.path === '/api/health';
const isUploadAssetRoute = (req) => req.path.startsWith('/api/uploads/');
const isDevelopmentLocalOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = String(parsed.hostname || '').toLowerCase();
    return host === 'localhost' || host === '::1' || privateIpv4Pattern.test(host);
  } catch (_error) {
    return false;
  }
};

const isAllowedCorsOrigin = (origin) => {
  if (!origin) return true;
  const normalizedOrigin = String(origin).toLowerCase();
  if (allowedOrigins.has(normalizedOrigin)) return true;
  if (allowedOriginPatternRegexes.some((regex) => regex.test(normalizedOrigin))) return true;
  if (isDevelopment && (origin === 'null' || isDevelopmentLocalOrigin(origin))) return true;
  return false;
};

morgan.token('request_id', (req) => req.id || '-');

app.use(helmet());
app.use((req, res, next) => {
  const providedRequestId = req.headers['x-request-id'];
  req.id =
    typeof providedRequestId === 'string' && providedRequestId.trim()
      ? providedRequestId.trim()
      : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedCorsOrigin(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS bloqueado para el origen: ${origin}`));
    },
    credentials: true,
  }),
);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'computron-api' });
});

app.use('/api/uploads', express.static(uploadPublicDir, { maxAge: '1d' }));

app.use((req, res, next) => {
  const useLargeLimit = largeJsonPathPrefixes.some((prefix) => req.path.startsWith(prefix));
  const parser = useLargeLimit ? largeJsonParser : defaultJsonParser;
  return parser(req, res, next);
});

app.use(
  morgan((tokens, req, res) =>
    JSON.stringify({
      time: new Date().toISOString(),
      request_id: tokens.request_id(req, res),
      method: tokens.method(req, res),
      path: tokens.url(req, res),
      status: Number(tokens.status(req, res) || 0),
      response_time_ms: Number(tokens['response-time'](req, res) || 0),
      content_length: Number(tokens.res(req, res, 'content-length') || 0),
      user_agent: tokens['user-agent'](req, res),
    }),
    {
      skip: (req) => req.method === 'OPTIONS' || isHealthRoute(req) || isUploadAssetRoute(req),
    },
  ),
);

app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use('/api', routes);

app.use((req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada', request_id: req.id || null });
});

app.use(errorHandler);

module.exports = app;
