const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const parsePositiveNumber = (rawValue, fallback, envName) => {
  const parsed = Number(rawValue ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`ENV inválido: ${envName} debe ser un número positivo.`);
  }
  return parsed;
};

const rawFrontendUrls = process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:8100';

const frontendUrls = rawFrontendUrls
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if ((process.env.NODE_ENV || 'development') !== 'production') {
  frontendUrls.push(
    'http://localhost:8100',
    'http://localhost:8101',
    'http://127.0.0.1:8100',
    'http://127.0.0.1:8101',
  );
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parsePositiveNumber(process.env.PORT, 4010, 'PORT'),
  frontendUrl: frontendUrls[0] || 'http://localhost:8100',
  frontendUrls: Array.from(new Set(frontendUrls)),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parsePositiveNumber(process.env.DB_PORT, 5432, 'DB_PORT'),
    database: process.env.DB_NAME || 'computron',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'change-me-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    refreshExpiresDays: parsePositiveNumber(process.env.JWT_REFRESH_EXPIRES_DAYS, 7, 'JWT_REFRESH_EXPIRES_DAYS'),
  },
  receiptTokenEncryptionKey: process.env.RECEIPT_TOKEN_ENCRYPTION_KEY || '',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parsePositiveNumber(process.env.SMTP_PORT, 587, 'SMTP_PORT'),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'no-reply@computron.local',
  },
  permissionCacheTtlMs: parsePositiveNumber(process.env.PERMISSION_CACHE_TTL_MS, 30000, 'PERMISSION_CACHE_TTL_MS'),
  responseCacheTtlMs: parsePositiveNumber(process.env.RESPONSE_CACHE_TTL_MS, 900000, 'RESPONSE_CACHE_TTL_MS'),
  responseCacheMaxEntries: parsePositiveNumber(
    process.env.RESPONSE_CACHE_MAX_ENTRIES,
    500,
    'RESPONSE_CACHE_MAX_ENTRIES',
  ),
  notificationWorkerConcurrency: parsePositiveNumber(
    process.env.NOTIFICATION_WORKER_CONCURRENCY,
    5,
    'NOTIFICATION_WORKER_CONCURRENCY',
  ),
  notificationWorkerMaxQueue: parsePositiveNumber(
    process.env.NOTIFICATION_WORKER_MAX_QUEUE,
    200,
    'NOTIFICATION_WORKER_MAX_QUEUE',
  ),
};

const failIfInvalid = (condition, message) => {
  if (!condition) {
    throw new Error(`ENV inválido: ${message}`);
  }
};

const isProduction = env.nodeEnv === 'production';
const insecureJwtSecrets = new Set([
  'change-me-access-secret',
  'change-me-refresh-secret',
  'replace_with_secure_access_secret',
  'replace_with_secure_refresh_secret',
]);

if (isProduction) {
  failIfInvalid(Boolean(process.env.FRONTEND_URLS || process.env.FRONTEND_URL), 'FRONTEND_URLS/FRONTEND_URL es requerido en producción.');
  failIfInvalid(Boolean(process.env.DB_HOST), 'DB_HOST es requerido en producción.');
  failIfInvalid(Boolean(process.env.DB_NAME), 'DB_NAME es requerido en producción.');
  failIfInvalid(Boolean(process.env.DB_USER), 'DB_USER es requerido en producción.');
  failIfInvalid(Boolean(process.env.DB_PASSWORD), 'DB_PASSWORD es requerido en producción.');
  failIfInvalid(
    Boolean(env.jwt.accessSecret) &&
      env.jwt.accessSecret.length >= 24 &&
      !insecureJwtSecrets.has(env.jwt.accessSecret),
    'JWT_ACCESS_SECRET debe ser robusto (>=24 caracteres y no default).',
  );
  failIfInvalid(
    Boolean(env.jwt.refreshSecret) &&
      env.jwt.refreshSecret.length >= 24 &&
      !insecureJwtSecrets.has(env.jwt.refreshSecret),
    'JWT_REFRESH_SECRET debe ser robusto (>=24 caracteres y no default).',
  );
}

const hasPartialSmtp =
  Boolean(env.smtp.host) || Boolean(env.smtp.user) || Boolean(env.smtp.pass);

if (hasPartialSmtp) {
  failIfInvalid(Boolean(env.smtp.host), 'SMTP_HOST es requerido cuando SMTP está habilitado.');
  failIfInvalid(Boolean(env.smtp.user), 'SMTP_USER es requerido cuando SMTP está habilitado.');
  failIfInvalid(Boolean(env.smtp.pass), 'SMTP_PASS es requerido cuando SMTP está habilitado.');
}

module.exports = env;
