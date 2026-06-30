const express = require('express');
const { z } = require('zod');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');
const validate = require('../middlewares/validate');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { normalizeCampusIds } = require('../services/userCampuses.service');

const router = express.Router();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');

const campusSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(120),
    address: z.string().min(5).max(250),
    city: z.string().min(2).max(120),
    phone: z.string().min(6).max(30).nullable().optional(),
    email: z.string().email().nullable().optional(),
    registration_date: dateString.nullable().optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const campusIdSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({ id: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

router.use(authenticate);

router.get(
  '/',
  authorizePermission('campuses.view'),
  asyncHandler(async (req, res) => {
    const campusIds = normalizeCampusIds(req.user.campus_ids);
    const { rows } = await query(
      `SELECT id, name, address, city, phone, email, created_at
       FROM campuses
       WHERE $1::boolean = TRUE
          OR id = ANY($2::bigint[])
       ORDER BY name`,
      [req.user.is_global_campus_access, campusIds],
    );

    return res.json({ items: rows });
  }),
);

router.post(
  '/',
  authorizePermission('campuses.manage'),
  validate(campusSchema),
  asyncHandler(async (req, res) => {
    if (!req.user.is_global_campus_access) {
      throw new ApiError(403, 'Solo un administrador global puede crear nuevas sedes.');
    }

    const { name, address, city, phone = null, email = null, registration_date = null } = req.validated.body;

    const { rows } = await query(
      `INSERT INTO campuses (name, address, city, phone, email, created_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date::timestamp, NOW()))
       RETURNING id, name, address, city, phone, email, created_at`,
      [name, address, city, phone, email, registration_date],
    );

    return res.status(201).json({ message: 'Sede creada.', item: rows[0] });
  }),
);

router.put(
  '/:id',
  authorizePermission('campuses.manage'),
  validate(
    z.object({
      body: campusSchema.shape.body,
      params: campusIdSchema.shape.params,
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    if (
      !req.user.is_global_campus_access &&
      !normalizeCampusIds(req.user.campus_ids).includes(Number(id))
    ) {
      throw new ApiError(403, 'No tiene acceso para modificar esta sede.');
    }
    const { name, address, city, phone = null, email = null } = req.validated.body;

    const { rows } = await query(
      `UPDATE campuses
       SET name = $1,
           address = $2,
           city = $3,
           phone = $4,
           email = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, name, address, city, phone, email, created_at, updated_at`,
      [name, address, city, phone, email, id],
    );

    if (rows.length === 0) {
      throw new ApiError(404, 'Sede no encontrada.');
    }

    return res.json({ message: 'Sede actualizada.', item: rows[0] });
  }),
);

router.delete(
  '/:id',
  authorizePermission('campuses.manage'),
  validate(campusIdSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    if (
      !req.user.is_global_campus_access &&
      !normalizeCampusIds(req.user.campus_ids).includes(Number(id))
    ) {
      throw new ApiError(403, 'No tiene acceso para eliminar esta sede.');
    }

    const result = await query('DELETE FROM campuses WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      throw new ApiError(404, 'Sede no encontrada.');
    }

    return res.json({ message: 'Sede eliminada.' });
  }),
);

module.exports = router;
