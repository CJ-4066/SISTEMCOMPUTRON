const express = require('express');
const { z } = require('zod');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { parseCampusScopeId } = require('../utils/campusScope');

const router = express.Router();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');
const paginationSchema = {
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
};

router.use(authenticate);
router.use(authorizePermission('reports.view'));

router.get(
  '/student-balances',
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({}).optional(),
      query: z
        .object({
          student_id: z.coerce.number().int().positive().optional(),
          ...paginationSchema,
        })
        .optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const studentId = req.validated.query?.student_id;
    const campusScopeId = parseCampusScopeId(req);
    const pageSize = req.validated.query?.page_size || 20;
    const page = req.validated.query?.page || 1;
    const offset = (page - 1) * pageSize;

    const totalResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM (
         SELECT s.id
         FROM students s
         LEFT JOIN enrollments e ON e.student_id = s.id
         LEFT JOIN course_campus cc ON cc.id = e.course_campus_id
         WHERE ($1::bigint IS NULL OR s.id = $1)
           AND ($2::bigint IS NULL OR cc.campus_id = $2)
         GROUP BY s.id
       ) scoped_students`,
      [studentId || null, campusScopeId],
    );
    const total = totalResult.rows[0]?.total || 0;

    const { rows } = await query(
      `SELECT
         s.id AS student_id,
         CONCAT(s.first_name, ' ', s.last_name) AS student_name,
         s.document_number,
         COALESCE(SUM(i.total_amount), 0)::numeric(12,2) AS total_amount,
         COALESCE(SUM(i.paid_amount), 0)::numeric(12,2) AS total_paid,
         COALESCE(SUM(i.total_amount - i.paid_amount), 0)::numeric(12,2) AS balance_pending
       FROM students s
       LEFT JOIN enrollments e ON e.student_id = s.id
       LEFT JOIN course_campus cc ON cc.id = e.course_campus_id
       LEFT JOIN installments i ON i.enrollment_id = e.id
       WHERE ($1::bigint IS NULL OR s.id = $1)
         AND ($2::bigint IS NULL OR cc.campus_id = $2)
       GROUP BY s.id, s.first_name, s.last_name, s.document_number
       ORDER BY balance_pending DESC
       LIMIT $3
       OFFSET $4`,
      [studentId || null, campusScopeId, pageSize, offset],
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

router.get(
  '/payments-by-campus',
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({}).optional(),
      query: z
        .object({
          date_from: dateString.optional(),
          date_to: dateString.optional(),
          campus_id: z.coerce.number().int().positive().optional(),
          ...paginationSchema,
        })
        .optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const dateFrom = req.validated.query?.date_from || '2000-01-01';
    const dateTo = req.validated.query?.date_to || '2100-12-31';
    const campusScopeId = parseCampusScopeId(req);
    const pageSize = req.validated.query?.page_size || 20;
    const page = req.validated.query?.page || 1;
    const offset = (page - 1) * pageSize;

    const totalResult = await query(
      `WITH grouped AS (
         SELECT campus_id, campus_name, payment_status
         FROM vw_payments_with_campus
         WHERE payment_date::date BETWEEN $1 AND $2
           AND ($3::bigint IS NULL OR campus_id = $3)
         GROUP BY campus_id, campus_name, payment_status
       )
       SELECT COUNT(*)::int AS total
       FROM grouped`,
      [dateFrom, dateTo, campusScopeId],
    );
    const total = totalResult.rows[0]?.total || 0;

    const { rows } = await query(
      `WITH grouped AS (
         SELECT
           campus_id,
           campus_name,
           payment_status,
           SUM(total_amount)::numeric(12,2) AS total_amount,
           COUNT(*)::int AS payment_count
         FROM vw_payments_with_campus
         WHERE payment_date::date BETWEEN $1 AND $2
           AND ($3::bigint IS NULL OR campus_id = $3)
         GROUP BY campus_id, campus_name, payment_status
       )
       SELECT *
       FROM grouped
       ORDER BY campus_name, payment_status
       LIMIT $4
       OFFSET $5`,
      [dateFrom, dateTo, campusScopeId, pageSize, offset],
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

router.get(
  '/morosity',
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({}).optional(),
      query: z.object({ ...paginationSchema }).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const campusScopeId = parseCampusScopeId(req);
    const pageSize = req.validated.query?.page_size || 20;
    const page = req.validated.query?.page || 1;
    const offset = (page - 1) * pageSize;

    const totalResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM installments i
       JOIN enrollments e ON e.id = i.enrollment_id
       JOIN course_campus cc ON cc.id = e.course_campus_id
       WHERE i.due_date < CURRENT_DATE
         AND i.status IN ('PENDING', 'PARTIAL')
         AND ($1::bigint IS NULL OR cc.campus_id = $1)`,
      [campusScopeId],
    );
    const total = totalResult.rows[0]?.total || 0;

    const { rows } = await query(
      `SELECT
         i.id AS installment_id,
         i.enrollment_id,
         i.due_date,
         i.total_amount,
         i.paid_amount,
         (i.total_amount - i.paid_amount) AS pending_amount,
         CONCAT(s.first_name, ' ', s.last_name) AS student_name,
         s.email AS student_email,
         c.name AS course_name,
         cp.name AS campus_name
       FROM installments i
       JOIN enrollments e ON e.id = i.enrollment_id
       JOIN students s ON s.id = e.student_id
       JOIN course_campus cc ON cc.id = e.course_campus_id
       JOIN courses c ON c.id = cc.course_id
       JOIN campuses cp ON cp.id = cc.campus_id
       WHERE i.due_date < CURRENT_DATE
         AND i.status IN ('PENDING', 'PARTIAL')
         AND ($3::bigint IS NULL OR cc.campus_id = $3)
       ORDER BY i.due_date ASC
       LIMIT $1
       OFFSET $2`,
      [pageSize, offset, campusScopeId],
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

module.exports = router;
