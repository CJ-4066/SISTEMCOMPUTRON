const express = require('express');
const { z } = require('zod');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');
const validate = require('../middlewares/validate');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { parseCampusScopeId } = require('../utils/campusScope');
const {
  buildReceiptHtml,
  normalizeReceiptFormat,
} = require('../services/receiptTemplate.service');

const router = express.Router();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');

const enrollmentSchema = z.object({
  body: z.object({
    student_id: z.number().int().positive(),
    course_campus_id: z.number().int().positive(),
    period_id: z.number().int().positive(),
    enrollment_date: dateString.optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'COMPLETED', 'CANCELED']).optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const installmentSchema = z.object({
  body: z.object({
    concept_id: z.number().int().positive(),
    description: z.string().max(160).nullable().optional(),
    due_date: dateString,
    total_amount: z.number().positive(),
  }),
  params: z.object({ id: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

const enrollmentReceiptSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({ id: z.coerce.number().int().positive() }),
  query: z
    .object({
      campus_id: z.coerce.number().int().positive().optional(),
      download: z.string().optional(),
      format: z.string().optional(),
    })
    .optional(),
});

router.use(authenticate);

router.get(
  '/',
  authorizePermission('enrollments.view'),
  asyncHandler(async (req, res) => {
    const campusScopeId = parseCampusScopeId(req);
    const { rows } = await query(
      `SELECT
        e.id,
        e.student_id,
        CONCAT(s.first_name, ' ', s.last_name) AS student_name,
        e.course_campus_id,
        c.name AS course_name,
        cp.name AS campus_name,
        e.period_id,
        p.name AS period_name,
        e.status,
        e.enrollment_date,
        e.created_at,
        e.created_by,
        TRIM(CONCAT(COALESCE(u.first_name, ''), CASE WHEN u.last_name IS NULL OR u.last_name = '' THEN '' ELSE ' ' END, COALESCE(u.last_name, ''))) AS created_by_name
      FROM enrollments e
      JOIN students s ON s.id = e.student_id
      JOIN course_campus cc ON cc.id = e.course_campus_id
      JOIN courses c ON c.id = cc.course_id
      JOIN campuses cp ON cp.id = cc.campus_id
      JOIN academic_periods p ON p.id = e.period_id
      LEFT JOIN users u ON u.id = e.created_by
      WHERE ($1::bigint IS NULL OR cc.campus_id = $1)
      ORDER BY e.created_at DESC`,
      [campusScopeId],
    );

    return res.json({ items: rows });
  }),
);

router.post(
  '/',
  authorizePermission('enrollments.manage'),
  validate(enrollmentSchema),
  asyncHandler(async (req, res) => {
    const {
      student_id,
      course_campus_id,
      period_id,
      enrollment_date = new Date().toISOString().slice(0, 10),
      status = 'ACTIVE',
    } = req.validated.body;

    const { rows } = await query(
      `INSERT INTO enrollments (student_id, course_campus_id, period_id, enrollment_date, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, student_id, course_campus_id, period_id, enrollment_date, status, created_at`,
      [student_id, course_campus_id, period_id, enrollment_date, status, req.user.id],
    );

    return res.status(201).json({ message: 'Matrícula creada.', item: rows[0] });
  }),
);

router.post(
  '/:id/installments',
  authorizePermission('installments.manage'),
  validate(installmentSchema),
  asyncHandler(async (req, res) => {
    const enrollmentId = req.validated.params.id;
    const { concept_id, description = null, due_date, total_amount } = req.validated.body;

    const exists = await query('SELECT id FROM enrollments WHERE id = $1', [enrollmentId]);
    if (exists.rowCount === 0) {
      throw new ApiError(404, 'Matrícula no encontrada.');
    }

    const { rows } = await query(
      `INSERT INTO installments (enrollment_id, concept_id, description, due_date, total_amount)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, enrollment_id, concept_id, description, due_date, total_amount, paid_amount, status`,
      [enrollmentId, concept_id, description, due_date, total_amount],
    );

    return res.status(201).json({ message: 'Cuota creada.', item: rows[0] });
  }),
);

router.get(
  '/:id/installments',
  authorizePermission('installments.view'),
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const enrollmentId = req.validated.params.id;

    const { rows } = await query(
      `SELECT
         i.id,
         i.enrollment_id,
         pc.name AS concept,
         i.description,
         i.due_date,
         i.total_amount,
         i.paid_amount,
         i.status,
         i.created_at
       FROM installments i
       JOIN payment_concepts pc ON pc.id = i.concept_id
       WHERE i.enrollment_id = $1
       ORDER BY i.due_date`,
      [enrollmentId],
    );

    return res.json({ items: rows });
  }),
);

router.get(
  '/:id/receipt',
  authorizePermission('enrollments.view', 'enrollments.manage'),
  validate(enrollmentReceiptSchema),
  asyncHandler(async (req, res) => {
    const enrollmentId = req.validated.params.id;
    const campusScopeId = parseCampusScopeId(req);
    const rawDownload = String(req.validated.query?.download || '')
      .trim()
      .toLowerCase();
    const shouldDownload = rawDownload === '1' || rawDownload === 'true' || rawDownload === 'si';
    const receiptFormat = normalizeReceiptFormat(req.validated.query?.format);

    const enrollmentResult = await query(
      `SELECT
         e.id,
         e.status,
         e.enrollment_date,
         e.created_at,
         CONCAT(s.first_name, ' ', s.last_name) AS student_name,
         s.document_number AS student_document,
         c.name AS course_name,
         cp.name AS campus_name,
         p.name AS period_name,
         cc.modality,
         cc.schedule_info,
         cc.monthly_fee,
         CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       JOIN course_campus cc ON cc.id = e.course_campus_id
       JOIN courses c ON c.id = cc.course_id
       JOIN campuses cp ON cp.id = cc.campus_id
       JOIN academic_periods p ON p.id = e.period_id
       LEFT JOIN users u ON u.id = e.created_by
       WHERE e.id = $1
         AND ($2::bigint IS NULL OR cc.campus_id = $2)
       LIMIT 1`,
      [enrollmentId, campusScopeId],
    );

    if (enrollmentResult.rowCount === 0) {
      throw new ApiError(404, 'Matrícula no encontrada.');
    }

    const enrollment = enrollmentResult.rows[0];

    const installmentsResult = await query(
      `SELECT
         i.id,
         i.due_date,
         i.total_amount,
         i.paid_amount,
         i.status,
         pc.name AS concept_name,
         i.description
       FROM installments i
       LEFT JOIN payment_concepts pc ON pc.id = i.concept_id
       WHERE i.enrollment_id = $1
       ORDER BY i.due_date ASC, i.id ASC`,
      [enrollmentId],
    );

    const hasInstallments = installmentsResult.rowCount > 0;
    const totalProgrammed = installmentsResult.rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
    const totalPaid = installmentsResult.rows.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0);
    const saldoAmount = Math.max(totalProgrammed - totalPaid, 0);

    const detailRows = hasInstallments
      ? installmentsResult.rows.map((installment) => {
          return {
            description: installment.concept_name || `Cuota #${installment.id}`,
            quantity: 1,
            unit_price: Number(installment.total_amount || 0),
            total: Number(installment.total_amount || 0),
          };
        })
      : [
          {
            description: 'Matricula',
            quantity: 1,
            unit_price: Number(enrollment.monthly_fee || 0),
            total: Number(enrollment.monthly_fee || 0),
          },
        ];

    const html = buildReceiptHtml({
      format: receiptFormat,
      documentNumber: `BM-${String(enrollment.id).padStart(7, '0')}`,
      issueDate: enrollment.enrollment_date || enrollment.created_at,
      classroomLabel: [
        enrollment.course_name,
        enrollment.period_name,
        enrollment.modality,
        enrollment.campus_name,
      ]
        .filter(Boolean)
        .join(' - '),
      customerName: enrollment.student_name,
      studentName: enrollment.student_name,
      studentDocument: enrollment.student_document,
      details: detailRows,
      totalAmount: hasInstallments ? totalProgrammed : enrollment.monthly_fee || 0,
      aCuentaAmount: hasInstallments ? totalPaid : 0,
      saldoAmount: hasInstallments ? saldoAmount : enrollment.monthly_fee || 0,
    });

    const fileName = `boleta_matricula_${enrollment.id}.html`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `${shouldDownload ? 'attachment' : 'inline'}; filename="${fileName}"`);
    return res.send(html);
  }),
);

module.exports = router;
