const express = require('express');
const { z } = require('zod');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');
const validate = require('../middlewares/validate');
const { authenticate, authorizePermission } = require('../middlewares/auth');

const router = express.Router();

const guardianSchema = z.object({
  body: z.object({
    first_name: z.string().min(2).max(80),
    last_name: z.string().min(2).max(80),
    email: z.string().email().nullable().optional(),
    phone: z.string().min(6).max(30).nullable().optional(),
    document_number: z.string().min(6).max(30).nullable().optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const guardianListSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      q: z.string().max(120).optional(),
      has_students: z.enum(['all', 'yes', 'no']).optional().default('all'),
      page: z.coerce.number().int().positive().optional(),
      page_size: z.coerce.number().int().min(1).max(100).optional(),
    })
    .optional(),
});

router.use(authenticate);

router.get(
  '/',
  authorizePermission('guardians.view'),
  validate(guardianListSchema),
  asyncHandler(async (req, res) => {
    const queryParams = req.validated.query || {};
    const search = queryParams.q ? queryParams.q.trim() : null;
    const hasStudents = queryParams.has_students || 'all';
    const pageSize = queryParams.page_size || 20;
    const page = queryParams.page || 1;
    const offset = (page - 1) * pageSize;

    const totalResult = await query(
      `WITH base AS (
         SELECT
           g.id,
           COUNT(DISTINCT sg.student_id)::int AS student_count
         FROM guardians g
         LEFT JOIN student_guardian sg ON sg.guardian_id = g.id
         WHERE (
           $1::text IS NULL
           OR CONCAT_WS(
             ' ',
             g.first_name,
             g.last_name,
             COALESCE(g.email, ''),
             COALESCE(g.phone, ''),
             COALESCE(g.document_number, '')
           ) ILIKE '%' || $1 || '%'
         )
         GROUP BY g.id
         HAVING (
           $2::text = 'all'
           OR ($2::text = 'yes' AND COUNT(DISTINCT sg.student_id) > 0)
           OR ($2::text = 'no' AND COUNT(DISTINCT sg.student_id) = 0)
         )
       )
       SELECT COUNT(*)::int AS total
       FROM base`,
      [search || null, hasStudents],
    );
    const total = totalResult.rows[0]?.total || 0;

    const { rows } = await query(
      `WITH base AS (
         SELECT
           g.id,
           g.first_name,
           g.last_name,
           g.email,
           g.phone,
           g.document_number,
           g.created_at,
           COUNT(DISTINCT sg.student_id)::int AS student_count
         FROM guardians g
         LEFT JOIN student_guardian sg ON sg.guardian_id = g.id
         WHERE (
           $1::text IS NULL
           OR CONCAT_WS(
             ' ',
             g.first_name,
             g.last_name,
             COALESCE(g.email, ''),
             COALESCE(g.phone, ''),
             COALESCE(g.document_number, '')
           ) ILIKE '%' || $1 || '%'
         )
         GROUP BY g.id
         HAVING (
           $2::text = 'all'
           OR ($2::text = 'yes' AND COUNT(DISTINCT sg.student_id) > 0)
           OR ($2::text = 'no' AND COUNT(DISTINCT sg.student_id) = 0)
         )
       )
       SELECT
         id,
         first_name,
         last_name,
         email,
         phone,
         document_number,
         created_at,
         student_count
       FROM base
       ORDER BY created_at DESC
       LIMIT $3
       OFFSET $4`,
      [search || null, hasStudents, pageSize, offset],
    );

    return res.json({
      items: rows,
      meta: {
        total,
        page,
        page_size: pageSize,
        total_pages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  }),
);

router.post(
  '/',
  authorizePermission('guardians.manage'),
  validate(guardianSchema),
  asyncHandler(async (req, res) => {
    const { first_name, last_name, email = null, phone = null, document_number = null } = req.validated.body;

    const { rows } = await query(
      `INSERT INTO guardians (first_name, last_name, email, phone, document_number)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, first_name, last_name, email, phone, document_number, created_at`,
      [first_name, last_name, email, phone, document_number],
    );

    return res.status(201).json({ message: 'Apoderado creado.', item: rows[0] });
  }),
);

router.put(
  '/:id',
  authorizePermission('guardians.manage'),
  validate(
    z.object({
      body: guardianSchema.shape.body,
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const { first_name, last_name, email = null, phone = null, document_number = null } = req.validated.body;

    const { rows } = await query(
      `UPDATE guardians
       SET first_name = $1,
           last_name = $2,
           email = $3,
           phone = $4,
           document_number = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, first_name, last_name, email, phone, document_number, updated_at`,
      [first_name, last_name, email, phone, document_number, id],
    );

    if (rows.length === 0) {
      throw new ApiError(404, 'Apoderado no encontrado.');
    }

    return res.json({ message: 'Apoderado actualizado.', item: rows[0] });
  }),
);

router.delete(
  '/:id',
  authorizePermission('guardians.manage'),
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const result = await query('DELETE FROM guardians WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      throw new ApiError(404, 'Apoderado no encontrado.');
    }

    return res.json({ message: 'Apoderado eliminado.' });
  }),
);

module.exports = router;
