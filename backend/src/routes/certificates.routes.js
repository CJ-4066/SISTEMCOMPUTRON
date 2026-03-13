const express = require('express');
const { z } = require('zod');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');
const validate = require('../middlewares/validate');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { parseCampusScopeId } = require('../utils/campusScope');

const router = express.Router();

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toNullableTrimmedString = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const nullableString = (maxLength) =>
  z.preprocess(
    (value) => toNullableTrimmedString(value),
    z.string().max(maxLength).nullable(),
  );

const nullableDateString = z.preprocess(
  (value) => toNullableTrimmedString(value),
  z.string().regex(DATE_PATTERN, 'Fecha inválida. Use formato YYYY-MM-DD.').nullable(),
);

const nullableInteger = (min, max) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return value;
    return Math.trunc(numberValue);
  }, z.number().int().min(min).max(max).nullable());

const certificatesListSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      q: z.string().trim().max(180).optional(),
      page: z.coerce.number().int().positive().optional(),
      page_size: z.coerce.number().int().min(1).max(100).optional(),
    })
    .optional(),
});

const certificateCreateSchema = z.object({
  body: z.object({
    certificate_code: nullableString(120).optional(),
    student_name: z.string().trim().min(2).max(180),
    student_document: nullableString(60).optional(),
    course_name: nullableString(180).optional(),
    hours_academic: nullableInteger(1, 4000).optional(),
    modality: nullableString(40).optional(),
    start_date: nullableDateString.optional(),
    end_date: nullableDateString.optional(),
    issue_date: nullableDateString.optional(),
    city: nullableString(120).optional(),
    organization: nullableString(180).optional(),
    campus_id: z.coerce.number().int().positive().nullable().optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

router.use(authenticate);

router.get(
  '/library',
  authorizePermission('payments.view', 'payments.manage'),
  validate(certificatesListSchema),
  asyncHandler(async (req, res) => {
    const queryParams = req.validated.query || {};
    const search = queryParams.q?.trim() || null;
    const pageSize = queryParams.page_size || 20;
    const page = queryParams.page || 1;
    const offset = (page - 1) * pageSize;
    const campusScopeId = parseCampusScopeId(req);

    const whereClause = `
      WHERE (
        $1::text IS NULL
        OR cl.certificate_code ILIKE '%' || $1 || '%'
        OR cl.student_name ILIKE '%' || $1 || '%'
        OR COALESCE(cl.student_document, '') ILIKE '%' || $1 || '%'
        OR COALESCE(cl.course_name, '') ILIKE '%' || $1 || '%'
      )
        AND ($2::bigint IS NULL OR cl.campus_id = $2)
    `;

    const totalResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM certificate_library cl
       ${whereClause}`,
      [search, campusScopeId],
    );
    const total = totalResult.rows[0]?.total || 0;

    const { rows } = await query(
      `SELECT
         cl.id,
         cl.certificate_code,
         cl.student_name,
         cl.student_document,
         cl.course_name,
         cl.hours_academic,
         cl.modality,
         cl.start_date,
         cl.end_date,
         cl.issue_date,
         cl.city,
         cl.organization,
         cl.campus_id,
         cp.name AS campus_name,
         cl.created_by,
         CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS created_by_name,
         cl.created_at
       FROM certificate_library cl
       LEFT JOIN campuses cp ON cp.id = cl.campus_id
       LEFT JOIN users u ON u.id = cl.created_by
       ${whereClause}
       ORDER BY cl.created_at DESC
       LIMIT $3
       OFFSET $4`,
      [search, campusScopeId, pageSize, offset],
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
  '/library',
  authorizePermission('payments.view', 'payments.manage'),
  validate(certificateCreateSchema),
  asyncHandler(async (req, res) => {
    const payload = req.validated.body;
    const campusScopeId = parseCampusScopeId(req);

    let campusId = payload.campus_id ?? req.user.base_campus_id ?? null;
    if (campusScopeId && !campusId) {
      campusId = campusScopeId;
    }

    if (campusScopeId && campusId && Number(campusId) !== Number(campusScopeId)) {
      throw new ApiError(403, 'No puedes registrar certificados fuera de tu sede activa.');
    }

    if (campusId) {
      const campusResult = await query(`SELECT id FROM campuses WHERE id = $1 LIMIT 1`, [campusId]);
      if (campusResult.rowCount === 0) {
        throw new ApiError(404, 'La sede indicada no existe.');
      }
    }

    const insertResult = await query(
      `INSERT INTO certificate_library (
         certificate_code,
         student_name,
         student_document,
         course_name,
         hours_academic,
         modality,
         start_date,
         end_date,
         issue_date,
         city,
         organization,
         campus_id,
         created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, certificate_code, student_name, student_document, course_name, hours_academic, modality, start_date, end_date, issue_date, city, organization, campus_id, created_by, created_at`,
      [
        payload.certificate_code || null,
        payload.student_name.trim(),
        payload.student_document || null,
        payload.course_name || null,
        payload.hours_academic ?? null,
        payload.modality || null,
        payload.start_date || null,
        payload.end_date || null,
        payload.issue_date || null,
        payload.city || null,
        payload.organization || null,
        campusId,
        req.user.id,
      ],
    );

    const item = insertResult.rows[0];
    return res.status(201).json({
      message: 'Certificado registrado en biblioteca.',
      item,
    });
  }),
);

module.exports = router;
