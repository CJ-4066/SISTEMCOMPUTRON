const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { query, withTransaction } = require('../config/db');
const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/auth');
const {
  getUserPermissionCodes,
  invalidateUserPermissionCache,
  userHasPermission,
} = require('../services/permissions.service');
const { invalidateCacheByPrefix } = require('../services/responseCache.service');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require('../utils/token');
const { normalizeDocumentNumber } = require('../utils/documentNumber');

const router = express.Router();

const ROLES = ['ADMIN', 'DOCENTE', 'SECRETARIADO', 'DIRECTOR', 'ALUMNO'];

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados intentos de login. Intente más tarde.' },
});

const registerSchema = z.object({
  body: z.object({
    first_name: z.string().min(2).max(80),
    last_name: z.string().min(2).max(80),
    document_number: z.string().min(6).max(30),
    phone: z.string().trim().min(6).max(30).nullable().optional(),
    address: z.string().trim().min(6).max(240).nullable().optional(),
    email: z.string().trim().email(),
    password: z.string().min(8).max(72),
    roles: z.array(z.enum(ROLES)).min(1).max(3).default(['SECRETARIADO']).optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().email(),
    password: z.string().min(1),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const refreshSchema = z.object({
  body: z.object({
    refresh_token: z.string().min(20),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const getUserRoles = async (userId, db = { query }) => {
  const { rows } = await db.query(
    `SELECT r.name
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1`,
    [userId],
  );

  return rows.map((row) => row.name);
};

router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const {
      first_name,
      last_name,
      document_number,
      phone = null,
      address = null,
      email,
      password,
      roles = ['SECRETARIADO'],
    } = req.validated.body;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedDocumentNumber = normalizeDocumentNumber(document_number);
    const normalizedPhone = phone ? String(phone).trim() : null;
    const normalizedAddress = address ? String(address).trim() : null;

    if (roles.includes('DOCENTE')) {
      if (!normalizedPhone) {
        throw new ApiError(400, 'El teléfono del docente es obligatorio.');
      }
      if (!normalizedAddress) {
        throw new ApiError(400, 'La dirección del docente es obligatoria.');
      }
    }

    const { rows: countRows } = await query('SELECT COUNT(*)::int AS count FROM users');
    const userCount = countRows[0].count;

    if (userCount > 0) {
      if (!req.headers.authorization) {
        throw new ApiError(401, 'Debe autenticarse para registrar usuarios.');
      }

      await new Promise((resolve, reject) => {
        authenticate(req, null, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      const canCreateUsers = await userHasPermission(req.user.id, 'users.create');
      if (!canCreateUsers) {
        throw new ApiError(403, 'No tiene permisos para registrar usuarios.');
      }
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rowCount > 0) {
      throw new ApiError(409, 'El correo ya está registrado.');
    }

    const duplicatedDocument = await query(
      `SELECT id
       FROM users
       WHERE UPPER(REGEXP_REPLACE(COALESCE(document_number, ''), '\\s+', '', 'g')) = $1
       LIMIT 1`,
      [normalizedDocumentNumber],
    );
    if (duplicatedDocument.rowCount > 0) {
      throw new ApiError(409, 'El documento ya está registrado por otro usuario.');
    }

    const hash = await bcrypt.hash(password, 12);

    const created = await withTransaction(async (tx) => {
      const userResult = await tx.query(
        `INSERT INTO users (first_name, last_name, document_number, phone, address, email, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, first_name, last_name, document_number, phone, address, email, is_active, created_at`,
        [first_name, last_name, normalizedDocumentNumber, normalizedPhone, normalizedAddress, normalizedEmail, hash],
      );

      const user = userResult.rows[0];

      const roleResult = await tx.query(
        `SELECT id, name FROM roles WHERE name = ANY($1::text[])`,
        [roles],
      );

      if (roleResult.rowCount !== roles.length) {
        throw new ApiError(400, 'Uno o más roles no existen.');
      }

      for (const roleRow of roleResult.rows) {
        await tx.query(
          `INSERT INTO user_roles (user_id, role_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [user.id, roleRow.id],
        );
      }

      return { ...user, roles };
    });

    invalidateUserPermissionCache(created.id);
    invalidateCacheByPrefix('teachers:list');

    return res.status(201).json({ message: 'Usuario registrado.', user: created });
  }),
);

router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.validated.body;
    const normalizedEmail = email.trim().toLowerCase();

    const { rows } = await query(
      `SELECT id, first_name, last_name, email, password_hash, is_active, base_campus_id
       FROM users
       WHERE email = $1`,
      [normalizedEmail],
    );

    if (rows.length === 0) {
      throw new ApiError(401, 'Credenciales inválidas.');
    }

    const user = rows[0];
    if (!user.is_active) {
      throw new ApiError(403, 'La cuenta está desactivada.');
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      throw new ApiError(401, 'Credenciales inválidas.');
    }

    const roles = await getUserRoles(user.id);
    if (roles.length === 0) {
      throw new ApiError(403, 'Usuario sin roles asignados.');
    }
    const permissions = await getUserPermissionCodes(user.id);

    const payload = { sub: user.id, email: user.email, roles };
    const access_token = signAccessToken(payload);
    const refresh_token = signRefreshToken(payload);
    const refresh_hash = hashToken(refresh_token);
    const expires_at = new Date(Date.now() + env.jwt.refreshExpiresDays * 24 * 60 * 60 * 1000);

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, refresh_hash, expires_at],
    );

    return res.json({
      access_token,
      refresh_token,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        base_campus_id: user.base_campus_id || null,
        roles,
        permissions,
      },
    });
  }),
);

router.post(
  '/refresh',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const { refresh_token } = req.validated.body;

    let decoded;
    try {
      decoded = verifyRefreshToken(refresh_token);
    } catch (error) {
      throw new ApiError(401, 'Refresh token inválido.');
    }

    const tokenHash = hashToken(refresh_token);

    const { rows } = await query(
      `SELECT id, user_id
       FROM refresh_tokens
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()`,
      [tokenHash],
    );

    if (rows.length === 0) {
      throw new ApiError(401, 'Refresh token expirado o revocado.');
    }

    const tokenRow = rows[0];
    const userResult = await query(
      `SELECT id, email, is_active
       FROM users
       WHERE id = $1`,
      [decoded.sub],
    );

    if (userResult.rowCount === 0) {
      throw new ApiError(401, 'Usuario no encontrado para este token.');
    }

    const currentUser = userResult.rows[0];
    if (!currentUser.is_active) {
      throw new ApiError(403, 'La cuenta está desactivada.');
    }

    const roles = await getUserRoles(decoded.sub);
    if (roles.length === 0) {
      throw new ApiError(403, 'Usuario sin roles asignados.');
    }

    const payload = { sub: decoded.sub, email: currentUser.email, roles };

    const newAccessToken = signAccessToken(payload);
    const newRefreshToken = signRefreshToken(payload);
    const newHash = hashToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + env.jwt.refreshExpiresDays * 24 * 60 * 60 * 1000);

    await withTransaction(async (tx) => {
      await tx.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE id = $1`,
        [tokenRow.id],
      );

      await tx.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [tokenRow.user_id, newHash, expiresAt],
      );
    });

    return res.json({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    });
  }),
);

router.post(
  '/logout',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const { refresh_token } = req.validated.body;
    const tokenHash = hashToken(refresh_token);

    await query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE token_hash = $1
         AND revoked_at IS NULL`,
      [tokenHash],
    );

    return res.json({ message: 'Sesión cerrada.' });
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, first_name, last_name, email, is_active, base_campus_id
       FROM users
       WHERE id = $1`,
      [req.user.id],
    );

    if (rows.length === 0) {
      throw new ApiError(404, 'Usuario no encontrado.');
    }

    const roles = await getUserRoles(req.user.id);
    const permissions = await getUserPermissionCodes(req.user.id);

    return res.json({
      user: {
        ...rows[0],
        roles,
        permissions,
      },
    });
  }),
);

module.exports = router;
