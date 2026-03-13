const express = require('express');
const { z } = require('zod');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');
const validate = require('../middlewares/validate');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { parseCampusScopeId } = require('../utils/campusScope');

const router = express.Router();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');

router.use(authenticate);

router.post(
  '/attendances',
  authorizePermission('academic.attendance.manage'),
  validate(
    z.object({
      body: z.object({
        enrollment_id: z.number().int().positive(),
        attendance_date: dateString,
        status: z.enum(['PRESENTE', 'AUSENTE', 'FALTO', 'TARDE', 'JUSTIFICADO']),
        notes: z.string().max(300).nullable().optional(),
      }),
      params: z.object({}).optional(),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { enrollment_id, attendance_date, status, notes = null } = req.validated.body;

    const { rows } = await query(
      `INSERT INTO attendances (enrollment_id, attendance_date, status, recorded_by, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (enrollment_id, attendance_date)
       DO UPDATE SET status = EXCLUDED.status,
                     notes = EXCLUDED.notes,
                     recorded_by = EXCLUDED.recorded_by
       RETURNING id, enrollment_id, attendance_date, status, recorded_by, notes, created_at`,
      [enrollment_id, attendance_date, status, req.user.id, notes],
    );

    return res.status(201).json({ message: 'Asistencia registrada.', item: rows[0] });
  }),
);

router.get(
  '/enrollments/:id/attendances',
  authorizePermission('academic.attendance.view'),
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
      `SELECT id, enrollment_id, attendance_date, status, notes, created_at
       FROM attendances
       WHERE enrollment_id = $1
       ORDER BY attendance_date DESC`,
      [enrollmentId],
    );

    return res.json({ items: rows });
  }),
);

router.put(
  '/attendances/:id',
  authorizePermission('academic.attendance.manage'),
  validate(
    z.object({
      body: z.object({
        attendance_date: dateString,
        status: z.enum(['PRESENTE', 'AUSENTE', 'FALTO', 'TARDE', 'JUSTIFICADO']),
        notes: z.string().max(300).nullable().optional(),
      }),
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const { attendance_date, status, notes = null } = req.validated.body;

    const { rows } = await query(
      `UPDATE attendances
       SET attendance_date = $1,
           status = $2,
           notes = $3,
           recorded_by = $4
       WHERE id = $5
       RETURNING id, enrollment_id, attendance_date, status, recorded_by, notes, created_at`,
      [attendance_date, status, notes, req.user.id, id],
    );

    if (rows.length === 0) {
      throw new ApiError(404, 'Asistencia no encontrada.');
    }

    return res.json({ message: 'Asistencia actualizada.', item: rows[0] });
  }),
);

router.delete(
  '/attendances/:id',
  authorizePermission('academic.attendance.manage'),
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const result = await query('DELETE FROM attendances WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      throw new ApiError(404, 'Asistencia no encontrada.');
    }

    return res.json({ message: 'Asistencia eliminada.' });
  }),
);

router.post(
  '/assessments',
  authorizePermission('academic.assessments.manage'),
  validate(
    z.object({
      body: z.object({
        course_campus_id: z.number().int().positive(),
        period_id: z.number().int().positive(),
        title: z.string().min(3).max(120),
        assessment_date: dateString,
        weight: z.number().positive().max(100),
      }),
      params: z.object({}).optional(),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { course_campus_id, period_id, title, assessment_date, weight } = req.validated.body;

    const { rows } = await query(
      `INSERT INTO assessments (course_campus_id, period_id, title, assessment_date, weight, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, course_campus_id, period_id, title, assessment_date, weight, created_at`,
      [course_campus_id, period_id, title, assessment_date, weight, req.user.id],
    );

    return res.status(201).json({ message: 'Evaluación creada.', item: rows[0] });
  }),
);

router.get(
  '/assessments',
  authorizePermission('academic.assessments.view'),
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({}).optional(),
      query: z.object({
        course_campus_id: z.coerce.number().int().positive().optional(),
        period_id: z.coerce.number().int().positive().optional(),
      }),
    }),
  ),
  asyncHandler(async (req, res) => {
    const courseCampusId = req.validated.query?.course_campus_id || null;
    const periodId = req.validated.query?.period_id || null;
    const campusScopeId = parseCampusScopeId(req);
    const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
    const isDocenteProfile = roles.length === 1 && roles.includes('DOCENTE');

    const { rows } = await query(
      `SELECT id, course_campus_id, period_id, title, assessment_date, weight, created_at
       FROM assessments
       WHERE ($1::bigint IS NULL OR course_campus_id = $1)
         AND ($2::bigint IS NULL OR period_id = $2)
         AND (
           $3::bigint IS NULL
           OR EXISTS (
             SELECT 1
             FROM course_campus cc_scope
             WHERE cc_scope.id = assessments.course_campus_id
               AND cc_scope.campus_id = $3
           )
         )
         AND (
           NOT $4::boolean
           OR EXISTS (
             SELECT 1
             FROM teacher_assignments ta_scope
             WHERE ta_scope.teacher_user_id = $5
               AND ta_scope.course_campus_id = assessments.course_campus_id
               AND ta_scope.period_id = assessments.period_id
               AND ta_scope.status = 'ACTIVE'
           )
         )
       ORDER BY assessment_date DESC`,
      [courseCampusId, periodId, campusScopeId, isDocenteProfile, req.user.id],
    );

    return res.json({ items: rows });
  }),
);

router.put(
  '/assessments/:id',
  authorizePermission('academic.assessments.manage'),
  validate(
    z.object({
      body: z.object({
        course_campus_id: z.number().int().positive(),
        period_id: z.number().int().positive(),
        title: z.string().min(3).max(120),
        assessment_date: dateString,
        weight: z.number().positive().max(100),
      }),
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const { course_campus_id, period_id, title, assessment_date, weight } = req.validated.body;

    const { rows } = await query(
      `UPDATE assessments
       SET course_campus_id = $1,
           period_id = $2,
           title = $3,
           assessment_date = $4,
           weight = $5
       WHERE id = $6
       RETURNING id, course_campus_id, period_id, title, assessment_date, weight, created_at`,
      [course_campus_id, period_id, title, assessment_date, weight, id],
    );

    if (rows.length === 0) {
      throw new ApiError(404, 'Evaluación no encontrada.');
    }

    return res.json({ message: 'Evaluación actualizada.', item: rows[0] });
  }),
);

router.delete(
  '/assessments/:id',
  authorizePermission('academic.assessments.manage'),
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const result = await query('DELETE FROM assessments WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      throw new ApiError(404, 'Evaluación no encontrada.');
    }

    return res.json({ message: 'Evaluación eliminada.' });
  }),
);

router.post(
  '/grades',
  authorizePermission('academic.grades.manage'),
  validate(
    z.object({
      body: z.object({
        assessment_id: z.number().int().positive(),
        student_id: z.number().int().positive(),
        score: z.number().min(0).max(20),
      }),
      params: z.object({}).optional(),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { assessment_id, student_id, score } = req.validated.body;

    const { rows } = await query(
      `INSERT INTO grades (assessment_id, student_id, score, recorded_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (assessment_id, student_id)
       DO UPDATE SET score = EXCLUDED.score,
                     recorded_by = EXCLUDED.recorded_by,
                     recorded_at = NOW()
       RETURNING id, assessment_id, student_id, score, recorded_at`,
      [assessment_id, student_id, score, req.user.id],
    );

    return res.status(201).json({ message: 'Nota registrada.', item: rows[0] });
  }),
);

router.get(
  '/students/:id/grades',
  authorizePermission('academic.grades.view'),
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({ period_id: z.coerce.number().int().positive().optional() }).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const studentId = req.validated.params.id;
    const periodId = req.validated.query?.period_id || null;
    const campusScopeId = parseCampusScopeId(req);
    const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
    const isDocenteProfile = roles.length === 1 && roles.includes('DOCENTE');

    const { rows } = await query(
      `SELECT
         g.id,
         g.assessment_id,
         a.title AS assessment_title,
         a.assessment_date,
         a.weight,
         g.score,
         c.name AS course_name,
         cp.name AS campus_name,
         p.name AS period_name
       FROM grades g
       JOIN assessments a ON a.id = g.assessment_id
       JOIN course_campus cc ON cc.id = a.course_campus_id
       JOIN courses c ON c.id = cc.course_id
       JOIN campuses cp ON cp.id = cc.campus_id
       JOIN academic_periods p ON p.id = a.period_id
       WHERE g.student_id = $1
         AND ($2::bigint IS NULL OR a.period_id = $2)
         AND ($3::bigint IS NULL OR cc.campus_id = $3)
         AND (
           NOT $4::boolean
           OR EXISTS (
             SELECT 1
             FROM teacher_assignments ta_scope
             WHERE ta_scope.teacher_user_id = $5
               AND ta_scope.course_campus_id = a.course_campus_id
               AND ta_scope.period_id = a.period_id
               AND ta_scope.status = 'ACTIVE'
           )
         )
       ORDER BY a.assessment_date DESC`,
      [studentId, periodId, campusScopeId, isDocenteProfile, req.user.id],
    );

    return res.json({ items: rows });
  }),
);

router.put(
  '/grades/:id',
  authorizePermission('academic.grades.manage'),
  validate(
    z.object({
      body: z.object({
        score: z.number().min(0).max(20),
      }),
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const { score } = req.validated.body;

    const { rows } = await query(
      `UPDATE grades
       SET score = $1,
           recorded_by = $2,
           recorded_at = NOW()
       WHERE id = $3
       RETURNING id, assessment_id, student_id, score, recorded_at`,
      [score, req.user.id, id],
    );

    if (rows.length === 0) {
      throw new ApiError(404, 'Nota no encontrada.');
    }

    return res.json({ message: 'Nota actualizada.', item: rows[0] });
  }),
);

router.delete(
  '/grades/:id',
  authorizePermission('academic.grades.manage'),
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const result = await query('DELETE FROM grades WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      throw new ApiError(404, 'Nota no encontrada.');
    }

    return res.json({ message: 'Nota eliminada.' });
  }),
);

module.exports = router;
