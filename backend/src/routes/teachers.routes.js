const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { query, withTransaction } = require('../config/db');
const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');
const validate = require('../middlewares/validate');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { parseCampusScopeId } = require('../utils/campusScope');
const { normalizeDocumentNumber } = require('../utils/documentNumber');
const {
  buildCacheKey,
  getCachedResponse,
  setCachedResponse,
  invalidateCacheByPrefix,
} = require('../services/responseCache.service');

const router = express.Router();
const TEACHERS_LIST_CACHE_PREFIX = 'teachers:list';
const TEACHER_ASSIGNMENTS_CACHE_PREFIX = 'teachers:assignments:list';
const LIST_CACHE_TTL_MS = env.responseCacheTtlMs;

const invalidateTeacherReadCaches = () => {
  invalidateCacheByPrefix(TEACHERS_LIST_CACHE_PREFIX);
  invalidateCacheByPrefix(TEACHER_ASSIGNMENTS_CACHE_PREFIX);
};

const assignmentCreateSchema = z.object({
  body: z.object({
    teacher_user_id: z.number().int().positive(),
    course_campus_id: z.number().int().positive(),
    period_id: z.number().int().positive(),
    schedule_info: z.string().max(240).nullable().optional(),
    campus_override_reason: z.string().max(300).nullable().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE'),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const teacherUpdateSchema = z.object({
  body: z
    .object({
      first_name: z.string().trim().min(2).max(80).optional(),
      last_name: z.string().trim().min(2).max(80).optional(),
      document_number: z.string().trim().min(6).max(30).optional(),
      phone: z.string().trim().min(6).max(30).nullable().optional(),
      address: z.string().trim().min(6).max(240).nullable().optional(),
      email: z.string().trim().email().optional(),
      password: z.string().min(8).max(72).optional(),
    })
    .refine(
      (payload) =>
        payload.first_name !== undefined ||
        payload.last_name !== undefined ||
        payload.document_number !== undefined ||
        payload.phone !== undefined ||
        payload.address !== undefined ||
        payload.email !== undefined ||
        payload.password !== undefined,
      { message: 'Debe enviar al menos un campo para actualizar.' },
    ),
  params: z.object({ id: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

const assignmentUpdateSchema = z.object({
  body: z
    .object({
      schedule_info: z.string().max(240).nullable().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    })
    .refine((payload) => payload.schedule_info !== undefined || payload.status !== undefined, {
      message: 'Debe enviar status o schedule_info.',
    }),
  params: z.object({ id: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

const optionalPositiveIntArray = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;

  const normalizedValues = (Array.isArray(value) ? value : String(value).split(','))
    .map((item) => String(item).trim())
    .filter(Boolean);

  return normalizedValues.length ? normalizedValues : undefined;
}, z.array(z.coerce.number().int().positive()).max(200).optional());

const assignmentListSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      teacher_user_id: z.coerce.number().int().positive().optional(),
      period_id: z.coerce.number().int().positive().optional(),
      course_campus_ids: optionalPositiveIntArray,
      page: z.coerce.number().int().min(1).optional(),
      page_size: z.coerce.number().int().min(1).max(200).optional(),
    })
    .optional(),
});

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');
const timeString = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Hora inválida (HH:MM)');
const calendarStatusEnum = z.enum(['PROGRAMADA', 'CANCELADA', 'REPROGRAMADA']);

const teacherAssignmentStudentsSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({ assignmentId: z.coerce.number().int().positive() }),
  query: z.object({ date: dateString.optional() }).optional(),
});

const teacherTakeAttendanceSchema = z.object({
  body: z.object({
    attendance_date: dateString,
    attendances: z
      .array(
        z.object({
          enrollment_id: z.number().int().positive(),
          status: z.enum(['PRESENTE', 'AUSENTE', 'FALTO', 'TARDE', 'JUSTIFICADO']),
          notes: z.string().max(300).nullable().optional(),
        }),
      )
      .min(1),
  }),
  params: z.object({ assignmentId: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

const teacherCalendarListSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z.object({
    from: dateString.optional(),
    to: dateString.optional(),
    teacher_user_id: z.coerce.number().int().positive().optional(),
  }),
});

const teacherMyCoursesListSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      teacher_user_id: z.coerce.number().int().positive().optional(),
    })
    .optional(),
});

const teacherCalendarCreateSchema = z.object({
  body: z
    .object({
      assignment_id: z.number().int().positive().nullable().optional(),
      course_campus_id: z.number().int().positive().nullable().optional(),
      title: z.string().min(3).max(150),
      event_date: dateString,
      start_time: timeString,
      end_time: timeString,
      classroom: z.string().max(120).nullable().optional(),
      notes: z.string().max(300).nullable().optional(),
      status: calendarStatusEnum.optional().default('PROGRAMADA'),
    })
    .refine((payload) => payload.end_time > payload.start_time, {
      message: 'La hora de fin debe ser mayor a la hora de inicio.',
      path: ['end_time'],
    })
    .refine((payload) => Boolean(payload.assignment_id || payload.course_campus_id), {
      message: 'Debes vincular la clase a un curso/sede.',
      path: ['assignment_id'],
    }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const teacherCalendarUpdateSchema = z.object({
  body: z
    .object({
      assignment_id: z.number().int().positive().nullable().optional(),
      course_campus_id: z.number().int().positive().nullable().optional(),
      title: z.string().min(3).max(150),
      event_date: dateString,
      start_time: timeString,
      end_time: timeString,
      classroom: z.string().max(120).nullable().optional(),
      notes: z.string().max(300).nullable().optional(),
      status: calendarStatusEnum,
    })
    .refine((payload) => payload.end_time > payload.start_time, {
      message: 'La hora de fin debe ser mayor a la hora de inicio.',
      path: ['end_time'],
    })
    .refine((payload) => Boolean(payload.assignment_id || payload.course_campus_id), {
      message: 'Debes vincular la clase a un curso/sede.',
      path: ['assignment_id'],
    }),
  params: z.object({ id: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

const assertTeacherCourseCampusLink = async ({
  teacherUserId,
  courseCampusId,
}) => {
  if (!courseCampusId) return;

  const linkResult = await query(
    `SELECT id
     FROM teacher_assignments
     WHERE teacher_user_id = $1
       AND course_campus_id = $2
       AND status = 'ACTIVE'
     LIMIT 1`,
    [teacherUserId, courseCampusId],
  );

  if (linkResult.rowCount === 0) {
    throw new ApiError(
      400,
      'El curso/sede seleccionado no está vinculado activamente a este docente.',
    );
  }
};

const assertNoCalendarOverlap = async ({
  teacherUserId,
  eventDate,
  startTime,
  endTime,
  eventId = null,
  status = 'PROGRAMADA',
}) => {
  if (status === 'CANCELADA') return;

  const overlapResult = await query(
    `SELECT id
     FROM teacher_calendar_events
     WHERE teacher_user_id = $1
       AND event_date = $2
       AND status <> 'CANCELADA'
       AND ($3::bigint IS NULL OR id <> $3)
       AND NOT (end_time <= $4::time OR start_time >= $5::time)
     LIMIT 1`,
    [teacherUserId, eventDate, eventId, startTime, endTime],
  );

  if (overlapResult.rowCount > 0) {
    throw new ApiError(
      409,
      'Ya tienes una clase/evento en ese rango horario. Ajusta la hora o reprograma la clase.',
    );
  }
};

router.use(authenticate);

router.get(
  '/',
  authorizePermission('teachers.view'),
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({}).optional(),
      query: z
        .object({
          q: z.string().max(120).optional(),
          page: z.coerce.number().int().min(1).optional(),
          page_size: z.coerce.number().int().min(1).max(200).optional(),
        })
        .optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const queryParams = req.validated.query || {};
    const search = queryParams.q?.trim() || null;
    const hasPagination = queryParams.page !== undefined || queryParams.page_size !== undefined;
    const page = hasPagination ? Number(queryParams.page || 1) : 1;
    const pageSize = hasPagination ? Number(queryParams.page_size || 20) : 0;
    const offset = hasPagination ? (page - 1) * pageSize : 0;
    const campusScopeId = parseCampusScopeId(req);

    const cacheKey = buildCacheKey(TEACHERS_LIST_CACHE_PREFIX, {
      search,
      campus_scope_id: campusScopeId,
      paginated: hasPagination,
      page,
      page_size: hasPagination ? pageSize : null,
    });
    const cachedPayload = getCachedResponse(cacheKey);
    if (cachedPayload) {
      return res.json(cachedPayload);
    }

    const baseWhereSql = `
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
      LEFT JOIN campuses cp ON cp.id = u.base_campus_id
      WHERE r.name = 'DOCENTE'
        AND (
          $1::text IS NULL
          OR CONCAT_WS(' ', u.first_name, u.last_name, u.document_number, u.phone, u.address, u.email) ILIKE '%' || $1 || '%'
        )
        AND (
          $2::bigint IS NULL
          OR u.base_campus_id = $2
          OR EXISTS (
            SELECT 1
            FROM teacher_assignments ta_scope
            JOIN course_campus cc_scope ON cc_scope.id = ta_scope.course_campus_id
            WHERE ta_scope.teacher_user_id = u.id
              AND cc_scope.campus_id = $2
          )
        )
    `;

    let total = 0;
    if (hasPagination) {
      const totalResult = await query(
        `SELECT COUNT(*)::int AS total
         ${baseWhereSql}`,
        [search, campusScopeId],
      );
      total = Number(totalResult.rows[0]?.total || 0);
    }

    const teacherResult = await query(
      `SELECT
         u.id,
         u.first_name,
         u.last_name,
         u.document_number,
         u.phone,
         u.address,
         u.email,
         u.base_campus_id,
         cp.name AS base_campus_name,
         u.is_active,
         u.created_at
       ${baseWhereSql}
       ORDER BY u.created_at DESC
       ${hasPagination ? 'LIMIT $3 OFFSET $4' : ''}`,
      hasPagination ? [search, campusScopeId, pageSize, offset] : [search, campusScopeId],
    );

    const teacherRows = teacherResult.rows || [];
    const teacherIds = teacherRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
    const assignmentCountMap = new Map();

    if (teacherIds.length > 0) {
      const assignmentCountResult = await query(
        `SELECT
           ta.teacher_user_id,
           COUNT(*)::int AS active_assignments
         FROM teacher_assignments ta
         JOIN course_campus cc ON cc.id = ta.course_campus_id
         WHERE ta.status = 'ACTIVE'
           AND ta.teacher_user_id = ANY($1::bigint[])
           AND ($2::bigint IS NULL OR cc.campus_id = $2)
         GROUP BY ta.teacher_user_id`,
        [teacherIds, campusScopeId],
      );

      for (const row of assignmentCountResult.rows) {
        assignmentCountMap.set(Number(row.teacher_user_id), Number(row.active_assignments || 0));
      }
    }

    const items = teacherRows.map((row) => ({
      ...row,
      active_assignments: assignmentCountMap.get(Number(row.id)) || 0,
    }));

    const normalizedTotal = hasPagination ? total : items.length;
    const payload = {
      items,
      meta: {
        total: normalizedTotal,
        page: hasPagination ? page : 1,
        page_size: hasPagination ? pageSize : Math.max(1, items.length),
        total_pages: hasPagination ? Math.max(1, Math.ceil(normalizedTotal / pageSize)) : 1,
        paginated: hasPagination,
      },
    };

    setCachedResponse(cacheKey, payload, LIST_CACHE_TTL_MS);
    return res.json(payload);
  }),
);

router.patch(
  '/:id',
  authorizePermission('users.status.manage'),
  validate(teacherUpdateSchema),
  asyncHandler(async (req, res) => {
    const teacherUserId = req.validated.params.id;
    const { first_name, last_name, document_number, phone, address, email, password } = req.validated.body;

    const teacherExists = await query(
      `SELECT
         u.id,
         u.first_name,
         u.last_name,
         u.document_number,
         u.phone,
         u.address,
         u.email,
         u.is_active,
         u.base_campus_id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
         AND r.name = 'DOCENTE'
       LIMIT 1`,
      [teacherUserId],
    );

    if (!teacherExists.rowCount) {
      throw new ApiError(404, 'Docente no encontrado.');
    }

    const fields = [];
    const values = [];

    if (first_name !== undefined) {
      values.push(first_name.trim());
      fields.push(`first_name = $${values.length}`);
    }

    if (last_name !== undefined) {
      values.push(last_name.trim());
      fields.push(`last_name = $${values.length}`);
    }

    if (document_number !== undefined) {
      const normalizedDocumentNumber = normalizeDocumentNumber(document_number);
      const duplicatedDocument = await query(
        `SELECT id
         FROM users
         WHERE UPPER(REGEXP_REPLACE(COALESCE(document_number, ''), '\\s+', '', 'g')) = $1
           AND id <> $2
         LIMIT 1`,
        [normalizedDocumentNumber, teacherUserId],
      );

      if (duplicatedDocument.rowCount) {
        throw new ApiError(409, 'El documento ya está registrado por otro usuario.');
      }

      values.push(normalizedDocumentNumber);
      fields.push(`document_number = $${values.length}`);
    }

    if (phone !== undefined) {
      const normalizedPhone = phone ? phone.trim() : null;
      values.push(normalizedPhone);
      fields.push(`phone = $${values.length}`);
    }

    if (address !== undefined) {
      const normalizedAddress = address ? address.trim() : null;
      values.push(normalizedAddress);
      fields.push(`address = $${values.length}`);
    }

    if (email !== undefined) {
      const normalizedEmail = email.trim().toLowerCase();
      const duplicatedEmail = await query(
        `SELECT id
         FROM users
         WHERE email = $1
           AND id <> $2
         LIMIT 1`,
        [normalizedEmail, teacherUserId],
      );

      if (duplicatedEmail.rowCount) {
        throw new ApiError(409, 'El correo ya está registrado por otro usuario.');
      }

      values.push(normalizedEmail);
      fields.push(`email = $${values.length}`);
    }

    if (password !== undefined) {
      const passwordHash = await bcrypt.hash(password, 12);
      values.push(passwordHash);
      fields.push(`password_hash = $${values.length}`);
    }

    values.push(teacherUserId);

    const updated = await query(
      `UPDATE users
       SET ${fields.join(', ')},
           updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING id, first_name, last_name, document_number, phone, address, email, is_active, base_campus_id`,
      values,
    );

    const updatedTeacher = updated.rows[0];
    const campus = updatedTeacher.base_campus_id
      ? await query('SELECT name FROM campuses WHERE id = $1 LIMIT 1', [updatedTeacher.base_campus_id])
      : null;

    invalidateTeacherReadCaches();
    return res.json({
      message: 'Datos del docente actualizados.',
      item: {
        ...updatedTeacher,
        base_campus_name: campus?.rows?.[0]?.name || null,
      },
    });
  }),
);

router.get(
  '/assignments',
  authorizePermission('teachers.assignments.view'),
  validate(assignmentListSchema),
  asyncHandler(async (req, res) => {
    const queryParams = req.validated.query || {};
    const teacherUserId = queryParams.teacher_user_id || null;
    const periodId = queryParams.period_id || null;
    const courseCampusIds =
      Array.isArray(queryParams.course_campus_ids) && queryParams.course_campus_ids.length > 0
        ? queryParams.course_campus_ids.map((value) => Number(value))
        : null;
    const hasPagination = queryParams.page !== undefined || queryParams.page_size !== undefined;
    const page = hasPagination ? Number(queryParams.page || 1) : 1;
    const pageSize = hasPagination ? Number(queryParams.page_size || 20) : 0;
    const offset = hasPagination ? (page - 1) * pageSize : 0;
    const campusScopeId = parseCampusScopeId(req);

    const cacheKey = buildCacheKey(TEACHER_ASSIGNMENTS_CACHE_PREFIX, {
      teacher_user_id: teacherUserId,
      period_id: periodId,
      course_campus_ids: courseCampusIds ? [...courseCampusIds].sort((left, right) => left - right) : null,
      campus_scope_id: campusScopeId,
      paginated: hasPagination,
      page,
      page_size: hasPagination ? pageSize : null,
    });
    const cachedPayload = getCachedResponse(cacheKey);
    if (cachedPayload) {
      return res.json(cachedPayload);
    }

    const baseFromSql = `
      FROM teacher_assignments ta
      JOIN users u ON u.id = ta.teacher_user_id
      JOIN course_campus cc ON cc.id = ta.course_campus_id
      JOIN courses c ON c.id = cc.course_id
      JOIN campuses cp ON cp.id = cc.campus_id
      JOIN academic_periods ap ON ap.id = ta.period_id
      LEFT JOIN users u_override ON u_override.id = ta.campus_override_by
      WHERE ($1::bigint IS NULL OR ta.teacher_user_id = $1)
        AND ($2::bigint IS NULL OR ta.period_id = $2)
        AND ($3::bigint IS NULL OR cc.campus_id = $3)
        AND ($4::bigint[] IS NULL OR ta.course_campus_id = ANY($4))
    `;

    let total = 0;
    if (hasPagination) {
      const totalResult = await query(
        `SELECT COUNT(*)::int AS total
         ${baseFromSql}`,
        [teacherUserId, periodId, campusScopeId, courseCampusIds],
      );
      total = Number(totalResult.rows[0]?.total || 0);
    }

    const { rows } = await query(
      `SELECT
         ta.id,
         ta.teacher_user_id,
         CONCAT(u.first_name, ' ', u.last_name) AS teacher_name,
         u.email AS teacher_email,
         ta.course_campus_id,
         c.name AS course_name,
         cp.name AS campus_name,
         cc.modality,
         ta.period_id,
         ap.name AS period_name,
         COALESCE(ta.schedule_info, cc.schedule_info) AS schedule_info,
         ta.campus_override_reason,
         ta.campus_override_at,
         ta.campus_override_by,
         CONCAT(u_override.first_name, ' ', u_override.last_name) AS campus_override_by_name,
         ta.status,
         ta.created_at,
         ta.updated_at
       ${baseFromSql}
       ORDER BY ta.created_at DESC
       ${hasPagination ? 'LIMIT $5 OFFSET $6' : ''}`,
      hasPagination
        ? [teacherUserId, periodId, campusScopeId, courseCampusIds, pageSize, offset]
        : [teacherUserId, periodId, campusScopeId, courseCampusIds],
    );

    const normalizedTotal = hasPagination ? total : rows.length;
    const payload = {
      items: rows,
      meta: {
        total: normalizedTotal,
        page: hasPagination ? page : 1,
        page_size: hasPagination ? pageSize : Math.max(1, rows.length),
        total_pages: hasPagination ? Math.max(1, Math.ceil(normalizedTotal / pageSize)) : 1,
        paginated: hasPagination,
      },
    };

    setCachedResponse(cacheKey, payload, LIST_CACHE_TTL_MS);
    return res.json(payload);
  }),
);

router.get(
  '/my-courses',
  authorizePermission('teachers.assignments.view'),
  validate(teacherMyCoursesListSchema),
  asyncHandler(async (req, res) => {
    const campusScopeId = parseCampusScopeId(req);
    const requestedTeacherUserId = req.validated.query?.teacher_user_id || null;
    const permissionCodes = Array.isArray(req.user.permissionCodes) ? req.user.permissionCodes : [];
    const canManageAssignments = permissionCodes.includes('teachers.assignments.manage');

    if (
      requestedTeacherUserId &&
      Number(requestedTeacherUserId) !== Number(req.user.id) &&
      !canManageAssignments
    ) {
      throw new ApiError(403, 'No tienes permisos para consultar cursos de otro docente.');
    }

    const effectiveTeacherUserId = requestedTeacherUserId || (canManageAssignments ? null : req.user.id);
    const { rows } = await query(
      `SELECT
         ta.id AS assignment_id,
         ta.teacher_user_id,
         CONCAT(u_t.first_name, ' ', u_t.last_name) AS teacher_name,
         ta.course_campus_id,
         ta.period_id,
         c.id AS course_id,
         c.name AS course_name,
         cp.id AS campus_id,
         cp.name AS campus_name,
         cc.modality,
         COALESCE(ta.schedule_info, cc.schedule_info) AS classroom_info,
         ap.name AS period_name,
         ap.start_date,
         ap.end_date,
         COUNT(e.id) FILTER (WHERE e.status = 'ACTIVE')::int AS active_students
       FROM teacher_assignments ta
       JOIN users u_t ON u_t.id = ta.teacher_user_id
       JOIN course_campus cc ON cc.id = ta.course_campus_id
       JOIN courses c ON c.id = cc.course_id
       JOIN campuses cp ON cp.id = cc.campus_id
       JOIN academic_periods ap ON ap.id = ta.period_id
       LEFT JOIN enrollments e
         ON e.course_campus_id = ta.course_campus_id
        AND e.period_id = ta.period_id
        AND e.status = 'ACTIVE'
       WHERE ($1::bigint IS NULL OR ta.teacher_user_id = $1)
         AND ta.status = 'ACTIVE'
         AND ap.is_active = TRUE
         AND ($2::bigint IS NULL OR cp.id = $2)
       GROUP BY
         ta.id,
         ta.teacher_user_id,
         u_t.first_name,
         u_t.last_name,
         ta.course_campus_id,
         ta.period_id,
         c.id,
         c.name,
         cp.id,
         cp.name,
         cc.modality,
         COALESCE(ta.schedule_info, cc.schedule_info),
         ap.name,
         ap.start_date,
         ap.end_date
       ORDER BY
         LOWER(CONCAT(u_t.first_name, ' ', u_t.last_name)) ASC,
         c.name ASC,
         cp.name ASC,
         ap.start_date DESC`,
      [effectiveTeacherUserId, campusScopeId],
    );

    return res.json({
      items: rows,
      meta: {
        teacher_user_id: effectiveTeacherUserId,
      },
    });
  }),
);

router.get(
  '/my-courses/:assignmentId/students',
  authorizePermission('teachers.assignments.view'),
  validate(teacherAssignmentStudentsSchema),
  asyncHandler(async (req, res) => {
    const { assignmentId } = req.validated.params;
    const attendanceDate = req.validated.query?.date || new Date().toISOString().slice(0, 10);
    const campusScopeId = parseCampusScopeId(req);
    const permissionCodes = Array.isArray(req.user.permissionCodes) ? req.user.permissionCodes : [];
    const canManageAssignments = permissionCodes.includes('teachers.assignments.manage');

    const assignmentResult = await query(
      `SELECT
         ta.id AS assignment_id,
         ta.course_campus_id,
         ta.period_id,
         c.name AS course_name,
         cp.name AS campus_name,
         cc.modality,
         COALESCE(ta.schedule_info, cc.schedule_info) AS classroom_info,
         ap.name AS period_name
       FROM teacher_assignments ta
       JOIN course_campus cc ON cc.id = ta.course_campus_id
       JOIN courses c ON c.id = cc.course_id
       JOIN campuses cp ON cp.id = cc.campus_id
       JOIN academic_periods ap ON ap.id = ta.period_id
       WHERE ta.id = $1
         AND ($2::boolean = TRUE OR ta.teacher_user_id = $3)
         AND ta.status = 'ACTIVE'
         AND ($4::bigint IS NULL OR cp.id = $4)`,
      [assignmentId, canManageAssignments, req.user.id, campusScopeId],
    );

    if (assignmentResult.rowCount === 0) {
      throw new ApiError(404, 'No se encontró el curso/salón asignado para este docente.');
    }

    const assignment = assignmentResult.rows[0];

    const studentsResult = await query(
      `SELECT
         e.id AS enrollment_id,
         s.id AS student_id,
         s.first_name,
         s.last_name,
         s.document_number,
         a.id AS attendance_id,
         a.status AS attendance_status,
         a.notes AS attendance_notes
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       LEFT JOIN attendances a
         ON a.enrollment_id = e.id
        AND a.attendance_date = $3
       WHERE e.course_campus_id = $1
         AND e.period_id = $2
         AND e.status = 'ACTIVE'
       ORDER BY LOWER(s.last_name) ASC, LOWER(s.first_name) ASC, s.document_number ASC`,
      [assignment.course_campus_id, assignment.period_id, attendanceDate],
    );

    return res.json({
      item: {
        ...assignment,
        attendance_date: attendanceDate,
        students: studentsResult.rows,
      },
    });
  }),
);

router.post(
  '/my-courses/:assignmentId/attendance',
  authorizePermission('academic.attendance.manage'),
  validate(teacherTakeAttendanceSchema),
  asyncHandler(async (req, res) => {
    const { assignmentId } = req.validated.params;
    const { attendance_date, attendances } = req.validated.body;
    const campusScopeId = parseCampusScopeId(req);
    const permissionCodes = Array.isArray(req.user.permissionCodes) ? req.user.permissionCodes : [];
    const canManageAssignments = permissionCodes.includes('teachers.assignments.manage');

    const assignmentResult = await query(
      `SELECT
         ta.id,
         ta.course_campus_id,
         ta.period_id,
         cc.campus_id,
         c.id AS course_id,
         c.name AS course_name,
         cp.name AS campus_name,
         COALESCE(ta.schedule_info, cc.schedule_info) AS classroom_info
       FROM teacher_assignments
       ta
       JOIN course_campus cc ON cc.id = ta.course_campus_id
       JOIN courses c ON c.id = cc.course_id
       JOIN campuses cp ON cp.id = cc.campus_id
       WHERE ta.id = $1
         AND ($2::boolean = TRUE OR ta.teacher_user_id = $3)
         AND ta.status = 'ACTIVE'
         AND ($4::bigint IS NULL OR cp.id = $4)`,
      [assignmentId, canManageAssignments, req.user.id, campusScopeId],
    );

    if (assignmentResult.rowCount === 0) {
      throw new ApiError(404, 'No se encontró el curso/salón asignado para este docente.');
    }

    const assignment = assignmentResult.rows[0];

    const enrollmentResult = await query(
      `SELECT id
       FROM enrollments
       WHERE course_campus_id = $1
         AND period_id = $2
         AND status = 'ACTIVE'`,
      [assignment.course_campus_id, assignment.period_id],
    );

    const allowedEnrollmentIds = new Set(enrollmentResult.rows.map((row) => Number(row.id)));
    const statusSummary = attendances.reduce((acc, item) => {
      const status = String(item.status || 'AUSENTE');
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    for (const attendanceRow of attendances) {
      if (!allowedEnrollmentIds.has(Number(attendanceRow.enrollment_id))) {
        throw new ApiError(
          400,
          `La matrícula ${attendanceRow.enrollment_id} no pertenece al curso/salón asignado al docente.`,
        );
      }
    }

    await withTransaction(async (tx) => {
      for (const attendanceRow of attendances) {
        await tx.query(
          `INSERT INTO attendances (enrollment_id, attendance_date, status, recorded_by, notes)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (enrollment_id, attendance_date)
           DO UPDATE SET status = EXCLUDED.status,
                         notes = EXCLUDED.notes,
                         recorded_by = EXCLUDED.recorded_by`,
          [
            attendanceRow.enrollment_id,
            attendance_date,
            attendanceRow.status,
            req.user.id,
            attendanceRow.notes || null,
          ],
        );
      }

      await tx.query(
        `INSERT INTO audit_logs (actor_user_id, entity, entity_id, action, payload)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          req.user.id,
          'attendances',
          String(assignment.id),
          'ATTENDANCE_BATCH_SAVED',
          JSON.stringify({
            assignment_id: Number(assignment.id),
            attendance_date,
            processed: attendances.length,
            campus_id: assignment.campus_id === null ? null : Number(assignment.campus_id),
            campus_name: assignment.campus_name,
            course_id: assignment.course_id === null ? null : Number(assignment.course_id),
            course_name: assignment.course_name,
            classroom_info: assignment.classroom_info || null,
            status_summary: statusSummary,
            recorded_at: new Date().toISOString(),
          }),
        ],
      );
    });

    return res.json({
      message: 'Asistencia guardada correctamente.',
      meta: { processed: attendances.length, attendance_date },
    });
  }),
);

router.get(
  '/calendar',
  authorizePermission('teachers.assignments.view'),
  validate(teacherCalendarListSchema),
  asyncHandler(async (req, res) => {
    const fromDate = req.validated.query?.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toDate = req.validated.query?.to || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const requestedTeacherUserId = req.validated.query?.teacher_user_id || null;
    const campusScopeId = parseCampusScopeId(req);
    const permissionCodes = Array.isArray(req.user.permissionCodes) ? req.user.permissionCodes : [];
    const canManageAssignments = permissionCodes.includes('teachers.assignments.manage');

    if (
      requestedTeacherUserId &&
      Number(requestedTeacherUserId) !== Number(req.user.id) &&
      !canManageAssignments
    ) {
      throw new ApiError(403, 'No tienes permisos para consultar el calendario de otro docente.');
    }

    const effectiveTeacherUserId = requestedTeacherUserId || (canManageAssignments ? null : req.user.id);

    const { rows } = await query(
      `SELECT
         ev.id,
         ev.teacher_user_id,
         CONCAT(u_t.first_name, ' ', u_t.last_name) AS teacher_name,
         ev.assignment_id,
         ev.course_campus_id,
         ev.title,
         ev.event_date,
         TO_CHAR(ev.start_time, 'HH24:MI') AS start_time,
         TO_CHAR(ev.end_time, 'HH24:MI') AS end_time,
         ev.classroom,
         ev.notes,
         ev.status,
         ev.created_at,
         ev.updated_at,
         c.name AS course_name,
         cp.name AS campus_name,
         ap.name AS period_name
       FROM teacher_calendar_events ev
       JOIN users u_t ON u_t.id = ev.teacher_user_id
       LEFT JOIN teacher_assignments ta ON ta.id = ev.assignment_id
       LEFT JOIN course_campus cc ON cc.id = COALESCE(ev.course_campus_id, ta.course_campus_id)
       LEFT JOIN courses c ON c.id = cc.course_id
       LEFT JOIN campuses cp ON cp.id = cc.campus_id
       LEFT JOIN academic_periods ap ON ap.id = ta.period_id
       WHERE ($1::bigint IS NULL OR ev.teacher_user_id = $1)
         AND ev.event_date BETWEEN $2 AND $3
         AND ($4::bigint IS NULL OR cc.campus_id = $4)
       ORDER BY
         ev.event_date ASC,
         ev.start_time ASC,
         LOWER(CONCAT(u_t.first_name, ' ', u_t.last_name)) ASC,
         ev.id ASC`,
      [effectiveTeacherUserId, fromDate, toDate, campusScopeId],
    );

    return res.json({
      items: rows,
      meta: {
        from: fromDate,
        to: toDate,
        teacher_user_id: effectiveTeacherUserId,
      },
    });
  }),
);

router.post(
  '/calendar',
  authorizePermission('teachers.assignments.view'),
  validate(teacherCalendarCreateSchema),
  asyncHandler(async (req, res) => {
    const {
      assignment_id = null,
      course_campus_id = null,
      title,
      event_date,
      start_time,
      end_time,
      classroom = null,
      notes = null,
      status = 'PROGRAMADA',
    } = req.validated.body;

    let linkedAssignment = null;
    if (assignment_id) {
      const assignmentResult = await query(
        `SELECT id, teacher_user_id, course_campus_id
         FROM teacher_assignments
         WHERE id = $1`,
        [assignment_id],
      );

      if (assignmentResult.rowCount === 0) {
        throw new ApiError(404, 'Asignación docente no encontrada.');
      }

      linkedAssignment = assignmentResult.rows[0];
      if (Number(linkedAssignment.teacher_user_id) !== Number(req.user.id)) {
        throw new ApiError(403, 'No puedes crear eventos sobre asignaciones de otro docente.');
      }

      if (
        course_campus_id &&
        Number(course_campus_id) !== Number(linkedAssignment.course_campus_id)
      ) {
        throw new ApiError(
          400,
          'El curso/sede enviado no coincide con la asignación docente seleccionada.',
        );
      }
    }

    const normalizedCourseCampusId = course_campus_id || linkedAssignment?.course_campus_id || null;
    if (!normalizedCourseCampusId) {
      throw new ApiError(400, 'Debes seleccionar un curso/salón para registrar la clase en una sede.');
    }
    await assertTeacherCourseCampusLink({
      teacherUserId: req.user.id,
      courseCampusId: normalizedCourseCampusId,
    });
    await assertNoCalendarOverlap({
      teacherUserId: req.user.id,
      eventDate: event_date,
      startTime: start_time,
      endTime: end_time,
      status,
    });

    const { rows } = await query(
      `INSERT INTO teacher_calendar_events (
         teacher_user_id,
         assignment_id,
         course_campus_id,
         title,
         event_date,
         start_time,
         end_time,
         classroom,
         notes,
         status,
         created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING
         id,
         teacher_user_id,
         assignment_id,
         course_campus_id,
         title,
         event_date,
         TO_CHAR(start_time, 'HH24:MI') AS start_time,
         TO_CHAR(end_time, 'HH24:MI') AS end_time,
         classroom,
         notes,
         status,
         created_at,
         updated_at`,
      [
        req.user.id,
        assignment_id,
        normalizedCourseCampusId,
        title.trim(),
        event_date,
        start_time,
        end_time,
        classroom?.trim() || null,
        notes?.trim() || null,
        status,
        req.user.id,
      ],
    );

    return res.status(201).json({ message: 'Evento de calendario creado.', item: rows[0] });
  }),
);

router.put(
  '/calendar/:id',
  authorizePermission('teachers.assignments.view'),
  validate(teacherCalendarUpdateSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const {
      assignment_id = null,
      course_campus_id = null,
      title,
      event_date,
      start_time,
      end_time,
      classroom = null,
      notes = null,
      status,
    } = req.validated.body;

    const existingResult = await query(
      `SELECT id, teacher_user_id
       FROM teacher_calendar_events
       WHERE id = $1`,
      [id],
    );

    if (existingResult.rowCount === 0) {
      throw new ApiError(404, 'Evento de calendario no encontrado.');
    }

    if (Number(existingResult.rows[0].teacher_user_id) !== Number(req.user.id)) {
      throw new ApiError(403, 'No puedes editar eventos de otro docente.');
    }

    let linkedAssignment = null;
    if (assignment_id) {
      const assignmentResult = await query(
        `SELECT id, teacher_user_id, course_campus_id
         FROM teacher_assignments
         WHERE id = $1`,
        [assignment_id],
      );

      if (assignmentResult.rowCount === 0) {
        throw new ApiError(404, 'Asignación docente no encontrada.');
      }

      linkedAssignment = assignmentResult.rows[0];
      if (Number(linkedAssignment.teacher_user_id) !== Number(req.user.id)) {
        throw new ApiError(403, 'No puedes vincular eventos a asignaciones de otro docente.');
      }

      if (
        course_campus_id &&
        Number(course_campus_id) !== Number(linkedAssignment.course_campus_id)
      ) {
        throw new ApiError(
          400,
          'El curso/sede enviado no coincide con la asignación docente seleccionada.',
        );
      }
    }

    const normalizedCourseCampusId = course_campus_id || linkedAssignment?.course_campus_id || null;
    if (!normalizedCourseCampusId) {
      throw new ApiError(400, 'Debes seleccionar un curso/salón para registrar la clase en una sede.');
    }
    await assertTeacherCourseCampusLink({
      teacherUserId: req.user.id,
      courseCampusId: normalizedCourseCampusId,
    });
    await assertNoCalendarOverlap({
      teacherUserId: req.user.id,
      eventDate: event_date,
      startTime: start_time,
      endTime: end_time,
      eventId: id,
      status,
    });

    const { rows } = await query(
      `UPDATE teacher_calendar_events
       SET assignment_id = $1,
           course_campus_id = $2,
           title = $3,
           event_date = $4,
           start_time = $5,
           end_time = $6,
           classroom = $7,
           notes = $8,
           status = $9,
           updated_at = NOW()
       WHERE id = $10
       RETURNING
         id,
         teacher_user_id,
         assignment_id,
         course_campus_id,
         title,
         event_date,
         TO_CHAR(start_time, 'HH24:MI') AS start_time,
         TO_CHAR(end_time, 'HH24:MI') AS end_time,
         classroom,
         notes,
         status,
         created_at,
         updated_at`,
      [
        assignment_id,
        normalizedCourseCampusId,
        title.trim(),
        event_date,
        start_time,
        end_time,
        classroom?.trim() || null,
        notes?.trim() || null,
        status,
        id,
      ],
    );

    return res.json({ message: 'Evento de calendario actualizado.', item: rows[0] });
  }),
);

router.delete(
  '/calendar/:id',
  authorizePermission('teachers.assignments.view'),
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const result = await query(
      `DELETE FROM teacher_calendar_events
       WHERE id = $1
         AND teacher_user_id = $2`,
      [id, req.user.id],
    );

    if (result.rowCount === 0) {
      throw new ApiError(404, 'Evento de calendario no encontrado.');
    }

    return res.json({ message: 'Evento de calendario eliminado.' });
  }),
);

router.post(
  '/assignments',
  authorizePermission('teachers.assignments.manage'),
  validate(assignmentCreateSchema),
  asyncHandler(async (req, res) => {
    const {
      teacher_user_id,
      course_campus_id,
      period_id,
      schedule_info = null,
      campus_override_reason = null,
      status = 'ACTIVE',
    } = req.validated.body;

    const teacherResult = await query(
      `SELECT
         u.id,
         u.base_campus_id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
         AND r.name = 'DOCENTE'`,
      [teacher_user_id],
    );

    if (teacherResult.rowCount === 0) {
      throw new ApiError(400, 'El usuario seleccionado no tiene rol DOCENTE.');
    }

    const teacherBaseCampusId = teacherResult.rows[0].base_campus_id;

    const courseCampusResult = await query(
      `SELECT id, campus_id
       FROM course_campus
       WHERE id = $1`,
      [course_campus_id],
    );

    if (courseCampusResult.rowCount === 0) {
      throw new ApiError(400, 'La oferta de curso/sede seleccionada no existe.');
    }

    const selectedCampusId = courseCampusResult.rows[0].campus_id;
    const isCampusOverride =
      teacherBaseCampusId !== null && teacherBaseCampusId !== undefined && Number(teacherBaseCampusId) !== Number(selectedCampusId);
    const normalizedOverrideReason = campus_override_reason?.trim() || null;

    if (isCampusOverride && !normalizedOverrideReason) {
      throw new ApiError(
        400,
        'El docente tiene una sede base diferente. Debe indicar el motivo del cambio manual de sede.',
      );
    }

    const overrideReasonToSave = isCampusOverride ? normalizedOverrideReason : null;
    const overrideByToSave = isCampusOverride ? req.user.id : null;
    const overrideAtToSave = isCampusOverride ? new Date().toISOString() : null;

    const { rows } = await query(
      `INSERT INTO teacher_assignments (
         teacher_user_id,
         course_campus_id,
         period_id,
         schedule_info,
         campus_override_reason,
         campus_override_by,
         campus_override_at,
         status,
         created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (teacher_user_id, course_campus_id, period_id)
       DO UPDATE SET
         schedule_info = EXCLUDED.schedule_info,
         campus_override_reason = EXCLUDED.campus_override_reason,
         campus_override_by = EXCLUDED.campus_override_by,
         campus_override_at = EXCLUDED.campus_override_at,
         status = EXCLUDED.status,
         updated_at = NOW()
       RETURNING
         id,
         teacher_user_id,
         course_campus_id,
         period_id,
         schedule_info,
         campus_override_reason,
         campus_override_by,
         campus_override_at,
         status,
         created_at,
         updated_at`,
      [
        teacher_user_id,
        course_campus_id,
        period_id,
        schedule_info,
        overrideReasonToSave,
        overrideByToSave,
        overrideAtToSave,
        status,
        req.user.id,
      ],
    );

    if (isCampusOverride) {
      await query(
        `INSERT INTO audit_logs (actor_user_id, entity, entity_id, action, payload)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          req.user.id,
          'teacher_assignments',
          String(rows[0].id),
          'CAMPUS_OVERRIDE',
          JSON.stringify({
            teacher_user_id,
            course_campus_id,
            period_id,
            teacher_base_campus_id: teacherBaseCampusId,
            selected_campus_id: selectedCampusId,
            reason: normalizedOverrideReason,
          }),
        ],
      );
    }

    invalidateTeacherReadCaches();
    return res.status(201).json({ message: 'Asignación docente guardada.', item: rows[0] });
  }),
);

router.patch(
  '/:id/base-campus',
  authorizePermission('teachers.assignments.manage'),
  validate(
    z.object({
      body: z.object({
        base_campus_id: z.number().int().positive().nullable(),
        reason: z.string().max(300).nullable().optional(),
      }),
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const teacherUserId = req.validated.params.id;
    const { base_campus_id, reason = null } = req.validated.body;

    const teacherResult = await query(
      `SELECT
         u.id,
         u.first_name,
         u.last_name,
         u.base_campus_id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
         AND r.name = 'DOCENTE'`,
      [teacherUserId],
    );

    if (teacherResult.rowCount === 0) {
      throw new ApiError(404, 'Docente no encontrado.');
    }

    if (base_campus_id !== null) {
      const campusResult = await query('SELECT id FROM campuses WHERE id = $1', [base_campus_id]);
      if (campusResult.rowCount === 0) {
        throw new ApiError(400, 'La sede seleccionada no existe.');
      }
    }

    const previousBaseCampusId = teacherResult.rows[0].base_campus_id;

    const updateResult = await query(
      `UPDATE users
       SET base_campus_id = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, first_name, last_name, base_campus_id`,
      [base_campus_id, teacherUserId],
    );

    const updatedTeacher = updateResult.rows[0];

    await query(
      `INSERT INTO audit_logs (actor_user_id, entity, entity_id, action, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        req.user.id,
        'users',
        String(updatedTeacher.id),
        'TEACHER_BASE_CAMPUS_UPDATED',
        JSON.stringify({
          teacher_user_id: updatedTeacher.id,
          previous_base_campus_id: previousBaseCampusId,
          new_base_campus_id: updatedTeacher.base_campus_id,
          reason: reason?.trim() || null,
        }),
      ],
    );

    invalidateTeacherReadCaches();
    return res.json({ message: 'Sede base del docente actualizada.', item: updatedTeacher });
  }),
);

router.patch(
  '/assignments/:id',
  authorizePermission('teachers.assignments.manage'),
  validate(assignmentUpdateSchema),
  asyncHandler(async (req, res) => {
    const assignmentId = req.validated.params.id;
    const { schedule_info, status } = req.validated.body;

    const { rows } = await query(
      `UPDATE teacher_assignments
       SET schedule_info = CASE WHEN $1::text IS NULL THEN schedule_info ELSE $1 END,
           status = COALESCE($2, status),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, teacher_user_id, course_campus_id, period_id, schedule_info, status, updated_at`,
      [schedule_info === undefined ? null : schedule_info, status || null, assignmentId],
    );

    if (rows.length === 0) {
      throw new ApiError(404, 'Asignación no encontrada.');
    }

    invalidateTeacherReadCaches();
    return res.json({ message: 'Asignación docente actualizada.', item: rows[0] });
  }),
);

module.exports = router;
