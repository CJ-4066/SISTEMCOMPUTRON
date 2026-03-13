const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { query, withTransaction } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');
const validate = require('../middlewares/validate');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { userHasPermission, invalidateUserPermissionCache } = require('../services/permissions.service');
const { parseCampusScopeId } = require('../utils/campusScope');
const { normalizeDocumentNumber } = require('../utils/documentNumber');

const router = express.Router();
const STUDENT_ROLE_NAME = 'ALUMNO';
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');
const enrollmentPayloadSchema = z.object({
  course_campus_id: z.number().int().positive(),
  period_id: z.number().int().positive(),
  enrollment_date: dateString.optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'COMPLETED', 'CANCELED']).optional().default('ACTIVE'),
});

const guardianPayloadSchema = z.object({
  first_name: z.string().trim().min(2).max(80),
  last_name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().min(6).max(30).nullable().optional(),
  document_number: z.string().trim().min(6).max(30).nullable().optional(),
  relationship: z.string().trim().max(60).nullable().optional(),
});

const studentSchema = z.object({
  body: z.object({
    first_name: z.string().min(2).max(80),
    last_name: z.string().min(2).max(80),
    document_number: z.string().min(6).max(30),
    birth_date: dateString,
    email: z.string().email().nullable().optional(),
    phone: z.string().min(6).max(30).nullable().optional(),
    address: z.string().max(240).nullable().optional(),
    guardian_links: z
      .array(
        z.object({
          guardian_id: z.number().int().positive(),
          relationship: z.string().max(60).nullable().optional(),
        }),
      )
      .optional(),
    guardian_payload: guardianPayloadSchema.nullable().optional(),
    no_guardian: z.boolean().optional().default(true),
    enrollment: enrollmentPayloadSchema.optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const studentListSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      q: z.string().trim().max(120).optional(),
      page: z.coerce.number().int().positive().optional(),
      page_size: z.coerce.number().int().min(1).max(100).optional(),
    })
    .optional(),
});

const studentSelfCalendarSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      from: dateString.optional(),
      to: dateString.optional(),
    })
    .optional(),
});

const studentSelfGradesSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      period_id: z.coerce.number().int().positive().optional(),
      assignment_id: z.coerce.number().int().positive().optional(),
    })
    .optional(),
});

const studentSelfAttendanceSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      assignment_id: z.coerce.number().int().positive().optional(),
    })
    .optional(),
});

const normalizeOptionalEmail = (value) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
};

const buildStudentEmailFromDocument = (documentNumber) => {
  const safeDocument = String(documentNumber || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const fallback = safeDocument || String(Date.now());
  return `alumno.${fallback}@computron.local`;
};

const buildStudentInitialPassword = (documentNumber) => {
  const safeDocument = String(documentNumber || '').replace(/\s+/g, '');
  const suffix = safeDocument.slice(-6) || String(Date.now()).slice(-6);
  return `Alumno${suffix}!`;
};

const buildEmailWithSuffix = (baseEmail, suffix) => {
  const atIndex = baseEmail.indexOf('@');
  if (atIndex < 0) {
    return `${baseEmail}+${suffix}`;
  }
  const local = baseEmail.slice(0, atIndex);
  const domain = baseEmail.slice(atIndex + 1);
  return `${local}+${suffix}@${domain}`;
};

const ensureUniqueUserEmail = async (tx, desiredEmail, excludeUserId = null) => {
  let suffix = 0;
  while (suffix < 1000) {
    const candidate = suffix === 0 ? desiredEmail : buildEmailWithSuffix(desiredEmail, suffix);
    const params = excludeUserId ? [candidate, excludeUserId] : [candidate];
    const conflictResult = await tx.query(
      `SELECT id
       FROM users
       WHERE email = $1
         ${excludeUserId ? 'AND id <> $2' : ''}`,
      params,
    );
    if (conflictResult.rowCount === 0) {
      return candidate;
    }
    suffix += 1;
  }

  throw new ApiError(409, 'No se pudo generar un correo único para la cuenta del alumno.');
};

const getCurrentStudentProfile = async (req) => {
  const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  if (!roles.includes('ALUMNO')) {
    throw new ApiError(403, 'Esta vista está disponible solo para perfiles de alumno.');
  }

  const profileResult = await query(
    `SELECT id, first_name, last_name, document_number, email, status, user_id
     FROM students
     WHERE status = 'ACTIVE'
       AND (
         user_id = $1
        OR (
          user_id IS NULL
          AND email IS NOT NULL
          AND LOWER(email) = LOWER($2)
        )
      )
     ORDER BY
       CASE WHEN user_id = $1 THEN 0 ELSE 1 END,
       updated_at DESC,
       id DESC
     LIMIT 1`,
    [req.user.id, req.user.email || null],
  );

  if (!profileResult.rowCount) {
    throw new ApiError(404, 'No se encontró un perfil de alumno vinculado al usuario.');
  }

  const profile = profileResult.rows[0];

  // Autorreparación segura: si el correo coincide y el perfil aún no tenía user_id, lo vinculamos al usuario actual.
  if (!profile.user_id) {
    await query(
      `UPDATE students
       SET user_id = $1,
           updated_at = NOW()
       WHERE id = $2
         AND user_id IS NULL`,
      [req.user.id, profile.id],
    );
    profile.user_id = req.user.id;
  }

  return profile;
};

router.use(authenticate);

router.get(
  '/',
  authorizePermission('students.view'),
  validate(studentListSchema),
  asyncHandler(async (req, res) => {
    const queryParams = req.validated.query || {};
    const search = queryParams.q?.trim() || null;
    const campusScopeId = parseCampusScopeId(req);
    const hasPagination = queryParams.page !== undefined || queryParams.page_size !== undefined;

    const pageSize = queryParams.page_size || 20;
    const page = queryParams.page || 1;
    const offset = (page - 1) * pageSize;

    const baseFilter = `
      FROM students s
      LEFT JOIN users u_creator ON u_creator.id = s.created_by
      LEFT JOIN users u_student ON u_student.id = s.user_id
      WHERE (
        $1::text IS NULL
        OR CONCAT_WS(
          ' ',
          s.first_name,
          s.last_name,
          s.document_number,
          COALESCE(s.email, ''),
          COALESCE(s.phone, ''),
          COALESCE(s.address, '')
        ) ILIKE '%' || $1 || '%'
        OR EXISTS (
          SELECT 1
          FROM student_guardian sgx
          JOIN guardians gx ON gx.id = sgx.guardian_id
          WHERE sgx.student_id = s.id
            AND CONCAT_WS(
              ' ',
              gx.first_name,
              gx.last_name,
              COALESCE(gx.email, ''),
              COALESCE(gx.phone, ''),
              COALESCE(gx.document_number, '')
            ) ILIKE '%' || $1 || '%'
        )
      )
      AND s.status = 'ACTIVE'
      AND (
        $2::bigint IS NULL
        OR EXISTS (
          SELECT 1
          FROM enrollments e_scope
          JOIN course_campus cc_scope ON cc_scope.id = e_scope.course_campus_id
          WHERE e_scope.student_id = s.id
            AND cc_scope.campus_id = $2
        )
      )
    `;

    let total = 0;
    let rows = [];

    if (hasPagination) {
      const totalResult = await query(`SELECT COUNT(*)::int AS total ${baseFilter}`, [search, campusScopeId]);
      total = totalResult.rows[0]?.total || 0;

      const dataResult = await query(
        `WITH filtered_students AS (
           SELECT
             s.id,
             s.first_name,
             s.last_name,
             s.document_number,
             s.birth_date,
             s.email,
           s.phone,
           s.address,
           s.status,
           s.user_id,
           COALESCE(u_student.is_active, FALSE) AS access_is_active,
           s.created_by,
           CONCAT_WS(' ', u_creator.first_name, u_creator.last_name) AS created_by_name,
           s.created_at
           ${baseFilter}
         ORDER BY s.created_at DESC
           LIMIT $3
           OFFSET $4
         )
         SELECT
           fs.id,
           fs.first_name,
           fs.last_name,
           fs.document_number,
           fs.birth_date,
           fs.email,
           fs.phone,
           fs.address,
           fs.status,
           fs.user_id,
           fs.access_is_active,
           fs.created_by,
           fs.created_by_name,
           fs.created_at,
           COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'guardian_id', g.id,
                 'name', CONCAT(g.first_name, ' ', g.last_name),
                 'email', g.email,
                 'phone', g.phone,
                 'relationship', sg.relationship
               )
               ORDER BY g.last_name, g.first_name
             ) FILTER (WHERE g.id IS NOT NULL),
             '[]'::json
           ) AS guardians
         FROM filtered_students fs
         LEFT JOIN student_guardian sg ON sg.student_id = fs.id
         LEFT JOIN guardians g ON g.id = sg.guardian_id
         GROUP BY
           fs.id,
           fs.first_name,
           fs.last_name,
           fs.document_number,
           fs.birth_date,
           fs.email,
           fs.phone,
           fs.address,
           fs.status,
           fs.user_id,
           fs.access_is_active,
           fs.created_by,
           fs.created_by_name,
           fs.created_at
         ORDER BY fs.created_at DESC`,
        [search, campusScopeId, pageSize, offset],
      );

      rows = dataResult.rows;
    } else {
      const dataResult = await query(
        `WITH filtered_students AS (
           SELECT
             s.id,
             s.first_name,
             s.last_name,
             s.document_number,
             s.birth_date,
             s.email,
           s.phone,
           s.address,
           s.status,
           s.user_id,
           COALESCE(u_student.is_active, FALSE) AS access_is_active,
           s.created_by,
           CONCAT_WS(' ', u_creator.first_name, u_creator.last_name) AS created_by_name,
           s.created_at
           ${baseFilter}
           ORDER BY s.created_at DESC
         )
         SELECT
           fs.id,
           fs.first_name,
           fs.last_name,
           fs.document_number,
           fs.birth_date,
           fs.email,
           fs.phone,
           fs.address,
           fs.status,
           fs.user_id,
           fs.access_is_active,
           fs.created_by,
           fs.created_by_name,
           fs.created_at,
           COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'guardian_id', g.id,
                 'name', CONCAT(g.first_name, ' ', g.last_name),
                 'email', g.email,
                 'phone', g.phone,
                 'relationship', sg.relationship
               )
               ORDER BY g.last_name, g.first_name
             ) FILTER (WHERE g.id IS NOT NULL),
             '[]'::json
           ) AS guardians
         FROM filtered_students fs
         LEFT JOIN student_guardian sg ON sg.student_id = fs.id
         LEFT JOIN guardians g ON g.id = sg.guardian_id
         GROUP BY
           fs.id,
           fs.first_name,
           fs.last_name,
           fs.document_number,
           fs.birth_date,
           fs.email,
           fs.phone,
           fs.address,
           fs.status,
           fs.user_id,
           fs.access_is_active,
           fs.created_by,
           fs.created_by_name,
           fs.created_at
         ORDER BY fs.created_at DESC`,
        [search, campusScopeId],
      );

      rows = dataResult.rows;
      total = rows.length;
    }

    const totalPages = hasPagination ? Math.max(1, Math.ceil(total / pageSize)) : 1;

    return res.json({
      items: rows,
      meta: {
        total,
        page: hasPagination ? page : 1,
        page_size: hasPagination ? pageSize : rows.length,
        total_pages: totalPages,
      },
    });
  }),
);

router.get(
  '/me/courses',
  asyncHandler(async (req, res) => {
    const student = await getCurrentStudentProfile(req);

    const { rows } = await query(
      `SELECT
         e.id AS enrollment_id,
         e.course_campus_id,
         e.period_id,
         e.enrollment_date,
         e.status AS enrollment_status,
         c.id AS course_id,
         c.name AS course_name,
         cp.id AS campus_id,
         cp.name AS campus_name,
         cc.modality,
         COALESCE(ta.schedule_info, cc.schedule_info) AS schedule_info,
         ap.name AS period_name,
         ap.start_date,
         ap.end_date,
         ta.id AS assignment_id,
         CONCAT(COALESCE(u_t.first_name, ''), ' ', COALESCE(u_t.last_name, '')) AS teacher_name,
         u_t.email AS teacher_email
       FROM enrollments e
       JOIN course_campus cc ON cc.id = e.course_campus_id
       JOIN courses c ON c.id = cc.course_id
       JOIN campuses cp ON cp.id = cc.campus_id
       JOIN academic_periods ap ON ap.id = e.period_id
       LEFT JOIN LATERAL (
         SELECT ta1.id, ta1.teacher_user_id, ta1.schedule_info
         FROM teacher_assignments ta1
         WHERE ta1.course_campus_id = e.course_campus_id
           AND ta1.period_id = e.period_id
           AND ta1.status = 'ACTIVE'
         ORDER BY ta1.updated_at DESC, ta1.id DESC
         LIMIT 1
       ) ta ON TRUE
       LEFT JOIN users u_t ON u_t.id = ta.teacher_user_id
       WHERE e.student_id = $1
         AND e.status = 'ACTIVE'
       ORDER BY ap.start_date DESC, c.name ASC, cp.name ASC`,
      [student.id],
    );

    return res.json({
      student: {
        id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        document_number: student.document_number,
      },
      items: rows,
    });
  }),
);

router.get(
  '/me/calendar',
  validate(studentSelfCalendarSchema),
  asyncHandler(async (req, res) => {
    const student = await getCurrentStudentProfile(req);
    const fromDate =
      req.validated.query?.from ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toDate =
      req.validated.query?.to ||
      new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { rows } = await query(
      `WITH student_events AS (
         SELECT DISTINCT ON (ev.id)
           ev.id,
           ev.assignment_id,
           ev.course_campus_id,
           ev.title,
           ev.event_date,
           TO_CHAR(ev.start_time, 'HH24:MI') AS start_time,
           TO_CHAR(ev.end_time, 'HH24:MI') AS end_time,
           ev.classroom,
           ev.notes,
           ev.status,
           c.name AS course_name,
           cp.name AS campus_name,
           ap.name AS period_name,
           CONCAT(COALESCE(u_t.first_name, ''), ' ', COALESCE(u_t.last_name, '')) AS teacher_name
         FROM teacher_calendar_events ev
         JOIN teacher_assignments ta ON ta.id = ev.assignment_id
         JOIN enrollments e
           ON e.course_campus_id = ta.course_campus_id
          AND e.period_id = ta.period_id
         JOIN course_campus cc ON cc.id = COALESCE(ev.course_campus_id, ta.course_campus_id)
         JOIN courses c ON c.id = cc.course_id
         JOIN campuses cp ON cp.id = cc.campus_id
         JOIN academic_periods ap ON ap.id = ta.period_id
         LEFT JOIN users u_t ON u_t.id = ta.teacher_user_id
         WHERE e.student_id = $1
           AND e.status = 'ACTIVE'
           AND ta.status = 'ACTIVE'
           AND ev.event_date BETWEEN $2 AND $3
         ORDER BY ev.id, ev.updated_at DESC, ev.created_at DESC
       )
       SELECT *
       FROM student_events
       ORDER BY event_date ASC, start_time ASC, id ASC`,
      [student.id, fromDate, toDate],
    );

    return res.json({
      items: rows,
      meta: {
        from: fromDate,
        to: toDate,
      },
    });
  }),
);

router.get(
  '/me/grades',
  validate(studentSelfGradesSchema),
  asyncHandler(async (req, res) => {
    const student = await getCurrentStudentProfile(req);
    const periodId = req.validated.query?.period_id || null;
    const assignmentId = req.validated.query?.assignment_id || null;

    const { rows } = await query(
      `SELECT
         g.id,
         g.assessment_id,
         a.title AS assessment_title,
         a.assessment_date,
         a.weight,
         g.score,
         g.recorded_at,
         c.name AS course_name,
         cp.name AS campus_name,
         p.name AS period_name,
         ta.id AS assignment_id
       FROM grades g
       JOIN assessments a ON a.id = g.assessment_id
       JOIN course_campus cc ON cc.id = a.course_campus_id
       JOIN courses c ON c.id = cc.course_id
       JOIN campuses cp ON cp.id = cc.campus_id
       JOIN academic_periods p ON p.id = a.period_id
       LEFT JOIN LATERAL (
         SELECT ta1.id
         FROM teacher_assignments ta1
         WHERE ta1.course_campus_id = a.course_campus_id
           AND ta1.period_id = a.period_id
           AND ta1.status = 'ACTIVE'
         ORDER BY ta1.updated_at DESC, ta1.id DESC
         LIMIT 1
       ) ta ON TRUE
       WHERE g.student_id = $1
         AND ($2::bigint IS NULL OR a.period_id = $2)
         AND ($3::bigint IS NULL OR ta.id = $3)
       ORDER BY a.assessment_date DESC, g.recorded_at DESC, g.id DESC`,
      [student.id, periodId, assignmentId],
    );

    return res.json({ items: rows });
  }),
);

router.get(
  '/me/payments',
  asyncHandler(async (req, res) => {
    const student = await getCurrentStudentProfile(req);

    const [installmentsResult, paymentsResult] = await Promise.all([
      query(
        `SELECT
           i.id,
           i.enrollment_id,
           pc.name AS concept_name,
           i.description,
           i.due_date,
           i.total_amount,
           i.paid_amount,
           i.status,
           (i.total_amount - i.paid_amount) AS pending_amount,
           c.name AS course_name,
           cp.name AS campus_name,
           ap.name AS period_name
         FROM installments i
         JOIN enrollments e ON e.id = i.enrollment_id
         JOIN course_campus cc ON cc.id = e.course_campus_id
         JOIN courses c ON c.id = cc.course_id
         JOIN campuses cp ON cp.id = cc.campus_id
         JOIN academic_periods ap ON ap.id = e.period_id
         JOIN payment_concepts pc ON pc.id = i.concept_id
         WHERE e.student_id = $1
         ORDER BY i.due_date ASC, i.id ASC`,
        [student.id],
      ),
      query(
        `SELECT
           p.id,
           p.enrollment_id,
           p.total_amount,
           p.method,
           p.reference_code,
           p.status,
           p.payment_date,
           p.notes,
           c.name AS course_name,
           cp.name AS campus_name,
           ap.name AS period_name
         FROM payments p
         JOIN enrollments e ON e.id = p.enrollment_id
         JOIN course_campus cc ON cc.id = e.course_campus_id
         JOIN courses c ON c.id = cc.course_id
         JOIN campuses cp ON cp.id = cc.campus_id
         JOIN academic_periods ap ON ap.id = e.period_id
         WHERE p.student_id = $1
         ORDER BY p.payment_date DESC, p.id DESC`,
        [student.id],
      ),
    ]);

    const installments = installmentsResult.rows.map((row) => ({
      ...row,
      pending_amount: Number(row.pending_amount || 0),
    }));

    const pendingInstallments = installments.filter((item) => Number(item.pending_amount || 0) > 0);

    return res.json({
      installments,
      payments: paymentsResult.rows,
      summary: {
        total_installments: installments.length,
        pending_installments: pendingInstallments.length,
        next_due_date: pendingInstallments[0]?.due_date || null,
      },
    });
  }),
);

router.get(
  '/me/attendance',
  validate(studentSelfAttendanceSchema),
  asyncHandler(async (req, res) => {
    const student = await getCurrentStudentProfile(req);
    const assignmentId = req.validated.query?.assignment_id || null;

    let assignment = null;
    let courseCampusId = null;
    let periodId = null;

    if (assignmentId) {
      const assignmentResult = await query(
        `SELECT
           ta.id,
           ta.course_campus_id,
           ta.period_id,
           c.name AS course_name,
           cp.name AS campus_name,
           ap.name AS period_name
         FROM teacher_assignments ta
         JOIN course_campus cc ON cc.id = ta.course_campus_id
         JOIN courses c ON c.id = cc.course_id
         JOIN campuses cp ON cp.id = cc.campus_id
         JOIN academic_periods ap ON ap.id = ta.period_id
         WHERE ta.id = $1
           AND ta.status = 'ACTIVE'
           AND EXISTS (
             SELECT 1
             FROM enrollments e
             WHERE e.student_id = $2
               AND e.course_campus_id = ta.course_campus_id
               AND e.period_id = ta.period_id
               AND e.status = 'ACTIVE'
           )
         LIMIT 1`,
        [assignmentId, student.id],
      );

      if (!assignmentResult.rowCount) {
        throw new ApiError(404, 'No se encontró el salón seleccionado para este alumno.');
      }

      assignment = assignmentResult.rows[0];
      courseCampusId = assignment.course_campus_id;
      periodId = assignment.period_id;
    }

    const { rows } = await query(
      `SELECT
         a.id,
         a.enrollment_id,
         a.attendance_date,
         a.status,
         a.notes,
         c.name AS course_name,
         cp.name AS campus_name,
         ap.name AS period_name
       FROM attendances a
       JOIN enrollments e ON e.id = a.enrollment_id
       JOIN course_campus cc ON cc.id = e.course_campus_id
       JOIN courses c ON c.id = cc.course_id
       JOIN campuses cp ON cp.id = cc.campus_id
       JOIN academic_periods ap ON ap.id = e.period_id
       WHERE e.student_id = $1
         AND e.status = 'ACTIVE'
         AND ($2::bigint IS NULL OR e.course_campus_id = $2)
         AND ($3::bigint IS NULL OR e.period_id = $3)
       ORDER BY a.attendance_date DESC, a.id DESC`,
      [student.id, courseCampusId, periodId],
    );

    return res.json({
      item: {
        assignment,
        attendances: rows,
      },
    });
  }),
);

router.get(
  '/:id',
  authorizePermission('students.view'),
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;

    const studentResult = await query(
      `SELECT
          s.id,
          s.first_name,
          s.last_name,
          s.document_number,
          s.birth_date,
          s.email,
          s.phone,
          s.address,
          s.user_id,
          COALESCE(u_access.is_active, FALSE) AS access_is_active,
          s.created_by,
          CONCAT_WS(' ', u_creator.first_name, u_creator.last_name) AS created_by_name,
          s.status,
          s.created_at
       FROM students s
       LEFT JOIN users u_creator ON u_creator.id = s.created_by
       LEFT JOIN users u_access ON u_access.id = s.user_id
       WHERE s.id = $1`,
      [id],
    );

    if (studentResult.rowCount === 0) {
      throw new ApiError(404, 'Alumno no encontrado.');
    }

    const guardianResult = await query(
      `SELECT g.id, g.first_name, g.last_name, g.email, g.phone, sg.relationship
       FROM student_guardian sg
       JOIN guardians g ON g.id = sg.guardian_id
       WHERE sg.student_id = $1`,
      [id],
    );

    const enrollmentResult = await query(
      `SELECT
          e.id,
          e.status,
          e.enrollment_date,
          p.name AS period_name,
          c.name AS course_name,
          cp.name AS campus_name,
          cc.modality
       FROM enrollments e
       JOIN academic_periods p ON p.id = e.period_id
       JOIN course_campus cc ON cc.id = e.course_campus_id
       JOIN courses c ON c.id = cc.course_id
       JOIN campuses cp ON cp.id = cc.campus_id
       WHERE e.student_id = $1
       ORDER BY e.created_at DESC`,
      [id],
    );

    return res.json({
      item: {
        ...studentResult.rows[0],
        guardians: guardianResult.rows,
        enrollments: enrollmentResult.rows,
      },
    });
  }),
);

router.post(
  '/',
  authorizePermission('students.manage'),
  validate(studentSchema),
  asyncHandler(async (req, res) => {
    const {
      first_name,
      last_name,
      document_number,
      birth_date,
      email = null,
      phone = null,
      address = null,
      guardian_links = [],
      guardian_payload = null,
      no_guardian = true,
      enrollment = null,
    } = req.validated.body;
    const normalizedEmail = normalizeOptionalEmail(email);
    const normalizedDocumentNumber = normalizeDocumentNumber(document_number);

    if (enrollment) {
      const canManageEnrollments = await userHasPermission(req.user.id, 'enrollments.manage');
      if (!canManageEnrollments) {
        throw new ApiError(403, 'No tiene permisos para registrar una matrícula al crear alumno.');
      }
    }

    const created = await withTransaction(async (tx) => {
      const roleResult = await tx.query(`SELECT id FROM roles WHERE name = $1`, [STUDENT_ROLE_NAME]);
      if (roleResult.rowCount === 0) {
        throw new ApiError(500, `No existe el rol ${STUDENT_ROLE_NAME}.`);
      }

      const duplicatedDocumentResult = await tx.query(
        `SELECT id
         FROM students
         WHERE UPPER(REGEXP_REPLACE(document_number, '\\s+', '', 'g')) =
               UPPER(REGEXP_REPLACE($1, '\\s+', '', 'g'))
         LIMIT 1`,
        [normalizedDocumentNumber],
      );
      if (duplicatedDocumentResult.rowCount > 0) {
        throw new ApiError(409, 'El documento ya está registrado en otro alumno.');
      }

      const duplicatedUserDocumentResult = await tx.query(
        `SELECT id
         FROM users
         WHERE UPPER(REGEXP_REPLACE(COALESCE(document_number, ''), '\\s+', '', 'g')) = $1
         LIMIT 1`,
        [normalizedDocumentNumber],
      );
      if (duplicatedUserDocumentResult.rowCount > 0) {
        throw new ApiError(409, 'El documento ya está registrado por otro usuario.');
      }

      if (normalizedEmail) {
        const emailExistsResult = await tx.query(`SELECT id FROM users WHERE email = $1`, [normalizedEmail]);
        if (emailExistsResult.rowCount > 0) {
          throw new ApiError(409, 'El correo del alumno ya está registrado en usuarios.');
        }
      }

      const studentUserBaseEmail = normalizedEmail || buildStudentEmailFromDocument(normalizedDocumentNumber);
      const studentUserEmail = await ensureUniqueUserEmail(tx, studentUserBaseEmail);
      const studentInitialPassword = buildStudentInitialPassword(normalizedDocumentNumber);
      const studentPasswordHash = await bcrypt.hash(studentInitialPassword, 12);

      const studentUserResult = await tx.query(
        `INSERT INTO users (first_name, last_name, document_number, email, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email`,
        [first_name, last_name, normalizedDocumentNumber, studentUserEmail, studentPasswordHash],
      );
      const studentUser = studentUserResult.rows[0];

      await tx.query(
        `INSERT INTO user_roles (user_id, role_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [studentUser.id, roleResult.rows[0].id],
      );

      const studentResult = await tx.query(
        `INSERT INTO students (first_name, last_name, document_number, birth_date, email, phone, address, created_by, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, first_name, last_name, document_number, birth_date, email, phone, address, created_by, user_id, status, created_at`,
        [
          first_name,
          last_name,
          normalizedDocumentNumber,
          birth_date,
          studentUserEmail,
          phone,
          address,
          req.user.id,
          studentUser.id,
        ],
      );

      const student = studentResult.rows[0];

      const effectiveGuardianLinks = guardian_links.slice();

      if (!no_guardian && guardian_payload) {
        const guardianInsertResult = await tx.query(
          `INSERT INTO guardians (first_name, last_name, email, phone, document_number)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [
            guardian_payload.first_name.trim(),
            guardian_payload.last_name.trim(),
            normalizeOptionalEmail(guardian_payload.email),
            guardian_payload.phone ? guardian_payload.phone.trim() : null,
            guardian_payload.document_number ? guardian_payload.document_number.trim() : null,
          ],
        );

        effectiveGuardianLinks.push({
          guardian_id: guardianInsertResult.rows[0].id,
          relationship: guardian_payload.relationship || 'APODERADO',
        });
      }

      if (!no_guardian && effectiveGuardianLinks.length === 0) {
        throw new ApiError(
          400,
          'Debe registrar al menos un apoderado/persona a cargo o marcar la opción "Sin apoderado".',
        );
      }

      for (const link of effectiveGuardianLinks) {
        await tx.query(
          `INSERT INTO student_guardian (student_id, guardian_id, relationship)
           VALUES ($1, $2, $3)
           ON CONFLICT (student_id, guardian_id)
           DO UPDATE SET relationship = EXCLUDED.relationship`,
          [student.id, link.guardian_id, link.relationship || null],
        );
      }

      const guardianResult = await tx.query(
        `SELECT g.id, g.first_name, g.last_name, g.email, g.phone, sg.relationship
         FROM student_guardian sg
         JOIN guardians g ON g.id = sg.guardian_id
         WHERE sg.student_id = $1`,
        [student.id],
      );

      let createdEnrollment = null;
      if (enrollment) {
        const enrollmentResult = await tx.query(
          `INSERT INTO enrollments (student_id, course_campus_id, period_id, enrollment_date, status, created_by)
           VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5, $6)
           RETURNING id`,
          [
            student.id,
            enrollment.course_campus_id,
            enrollment.period_id,
            enrollment.enrollment_date || null,
            enrollment.status || 'ACTIVE',
            req.user.id,
          ],
        );

        const createdEnrollmentId = enrollmentResult.rows[0].id;
        const enrollmentDetailResult = await tx.query(
          `SELECT
              e.id,
              e.status,
              e.enrollment_date,
              e.student_id,
              e.course_campus_id,
              e.period_id,
              p.name AS period_name,
              c.name AS course_name,
              cp.name AS campus_name,
              cc.modality
           FROM enrollments e
           JOIN academic_periods p ON p.id = e.period_id
           JOIN course_campus cc ON cc.id = e.course_campus_id
           JOIN courses c ON c.id = cc.course_id
           JOIN campuses cp ON cp.id = cc.campus_id
           WHERE e.id = $1`,
          [createdEnrollmentId],
        );

        createdEnrollment = enrollmentDetailResult.rows[0] || null;
      }

      const creatorResult = await tx.query(
        `SELECT CONCAT_WS(' ', first_name, last_name) AS created_by_name
         FROM users
         WHERE id = $1`,
        [student.created_by],
      );

      return {
        ...student,
        created_by_name: creatorResult.rows[0]?.created_by_name || null,
        guardians: guardianResult.rows,
        enrollment: createdEnrollment,
        access_user: {
          user_id: studentUser.id,
          email: studentUser.email,
          initial_password: studentInitialPassword,
          role: STUDENT_ROLE_NAME,
        },
      };
    });

    return res.status(201).json({ message: 'Alumno creado.', item: created });
  }),
);

router.put(
  '/:id',
  authorizePermission('students.manage'),
  validate(
    z.object({
      body: studentSchema.shape.body.omit({
        guardian_links: true,
        guardian_payload: true,
        no_guardian: true,
        enrollment: true,
      }),
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const { first_name, last_name, document_number, birth_date, email = null, phone = null, address = null } =
      req.validated.body;
    const normalizedEmail = normalizeOptionalEmail(email);
    const normalizedDocumentNumber = normalizeDocumentNumber(document_number);

    const updated = await withTransaction(async (tx) => {
      const studentResult = await tx.query(
        `SELECT id, user_id, email
         FROM students
         WHERE id = $1`,
        [id],
      );

      if (studentResult.rowCount === 0) {
        throw new ApiError(404, 'Alumno no encontrado.');
      }

      const student = studentResult.rows[0];
      let resolvedEmail = normalizedEmail;

      const duplicatedDocumentResult = await tx.query(
        `SELECT id
         FROM students
         WHERE id <> $2
           AND UPPER(REGEXP_REPLACE(document_number, '\\s+', '', 'g')) =
               UPPER(REGEXP_REPLACE($1, '\\s+', '', 'g'))
         LIMIT 1`,
        [normalizedDocumentNumber, id],
      );
      if (duplicatedDocumentResult.rowCount > 0) {
        throw new ApiError(409, 'El documento ya está registrado en otro alumno.');
      }

      const duplicatedUserDocumentResult = await tx.query(
        `SELECT id
         FROM users
         WHERE UPPER(REGEXP_REPLACE(COALESCE(document_number, ''), '\\s+', '', 'g')) = $1
           AND ($2::bigint IS NULL OR id <> $2)
         LIMIT 1`,
        [normalizedDocumentNumber, student.user_id || null],
      );
      if (duplicatedUserDocumentResult.rowCount > 0) {
        throw new ApiError(409, 'El documento ya está registrado por otro usuario.');
      }

      if (student.user_id) {
        const userResult = await tx.query(`SELECT id, email FROM users WHERE id = $1`, [student.user_id]);
        if (userResult.rowCount > 0) {
          const baseEmail =
            normalizedEmail || userResult.rows[0].email || buildStudentEmailFromDocument(normalizedDocumentNumber);
          resolvedEmail = await ensureUniqueUserEmail(tx, baseEmail, student.user_id);

          await tx.query(
            `UPDATE users
             SET first_name = $1,
                 last_name = $2,
                 document_number = $3,
                 email = $4,
                 updated_at = NOW()
             WHERE id = $5`,
            [first_name, last_name, normalizedDocumentNumber, resolvedEmail, student.user_id],
          );
        }
      }

      if (!resolvedEmail) {
        resolvedEmail = student.email || buildStudentEmailFromDocument(normalizedDocumentNumber);
      }

      const updateResult = await tx.query(
        `UPDATE students
         SET first_name = $1,
             last_name = $2,
             document_number = $3,
             birth_date = $4,
             email = $5,
             phone = $6,
             address = $7,
             updated_at = NOW()
         WHERE id = $8
         RETURNING id, first_name, last_name, document_number, birth_date, email, phone, address, user_id, status, updated_at`,
        [first_name, last_name, normalizedDocumentNumber, birth_date, resolvedEmail, phone, address, id],
      );

      return updateResult.rows[0];
    });

    return res.json({ message: 'Alumno actualizado.', item: updated });
  }),
);

router.post(
  '/:id/guardians',
  authorizePermission('students.manage'),
  validate(
    z.object({
      body: z.object({
        guardian_id: z.number().int().positive(),
        relationship: z.string().max(60).nullable().optional(),
      }),
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const { guardian_id, relationship = null } = req.validated.body;

    const studentExists = await query('SELECT id FROM students WHERE id = $1', [id]);
    if (studentExists.rowCount === 0) {
      throw new ApiError(404, 'Alumno no encontrado.');
    }

    await query(
      `INSERT INTO student_guardian (student_id, guardian_id, relationship)
       VALUES ($1, $2, $3)
       ON CONFLICT (student_id, guardian_id)
       DO UPDATE SET relationship = EXCLUDED.relationship`,
      [id, guardian_id, relationship],
    );

    return res.status(201).json({ message: 'Apoderado vinculado al alumno.' });
  }),
);

router.delete(
  '/:id',
  authorizePermission('students.manage'),
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;

    const deleteMode = await withTransaction(async (tx) => {
      const studentResult = await tx.query(
        `SELECT id, user_id
         FROM students
         WHERE id = $1
         FOR UPDATE`,
        [id],
      );
      if (studentResult.rowCount === 0) {
        throw new ApiError(404, 'Alumno no encontrado.');
      }

      const student = studentResult.rows[0];
      let mode = 'hard';

      try {
        await tx.query(`DELETE FROM students WHERE id = $1`, [id]);
      } catch (error) {
        if (error.code !== '23503') {
          throw error;
        }

        mode = 'soft';

        await tx.query(
          `UPDATE students
           SET status = 'INACTIVE',
               updated_at = NOW()
           WHERE id = $1`,
          [id],
        );

        await tx.query(
          `UPDATE enrollments
           SET status = 'CANCELED',
               updated_at = NOW()
           WHERE student_id = $1
             AND status = 'ACTIVE'`,
          [id],
        );
      }

      if (student.user_id) {
        const studentRoleResult = await tx.query(`SELECT id FROM roles WHERE name = $1 LIMIT 1`, [STUDENT_ROLE_NAME]);
        if (studentRoleResult.rowCount > 0) {
          await tx.query(
            `DELETE FROM user_roles
             WHERE user_id = $1
               AND role_id = $2`,
            [student.user_id, studentRoleResult.rows[0].id],
          );
        }

        const remainingRolesResult = await tx.query(
          `SELECT COUNT(*)::int AS total
           FROM user_roles
           WHERE user_id = $1`,
          [student.user_id],
        );
        const remainingRoles = Number(remainingRolesResult.rows[0]?.total || 0);

        if (remainingRoles === 0) {
          await tx.query(
            `UPDATE users
             SET is_active = FALSE,
                 updated_at = NOW()
             WHERE id = $1`,
            [student.user_id],
          );
        }

        await tx.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [student.user_id]);
        invalidateUserPermissionCache(student.user_id);
      }

      return mode;
    });

    return res.json({
      message:
        deleteMode === 'hard'
          ? 'Alumno eliminado.'
          : 'Alumno inactivado y matrículas activas canceladas por tener registros relacionados.',
    });
  }),
);

module.exports = router;
