const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/auth');
const { getUserPermissionCodes } = require('../services/permissions.service');

const router = express.Router();
const attachmentUrlSchema = z.string().trim().min(5).max(2500000);

const nullableText = (max = 3000) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional();

const nullableDateTime = z.string().trim().max(60).nullable().optional();

const practiceListSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z.object({
    assignment_id: z.coerce.number().int().positive(),
  }),
});

const practiceCreateSchema = z.object({
  body: z.object({
    assignment_id: z.number().int().positive(),
    title: z.string().trim().min(3).max(180),
    description: nullableText(3000),
    starts_at: nullableDateTime,
    ends_at: nullableDateTime,
    is_enabled: z.boolean().optional().default(false),
    max_attempts: z.number().int().min(1).max(20).optional().default(1),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const practiceUpdateSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(3).max(180).optional(),
      description: nullableText(3000),
      starts_at: nullableDateTime,
      ends_at: nullableDateTime,
      is_enabled: z.boolean().optional(),
      max_attempts: z.number().int().min(1).max(20).optional(),
    })
    .refine(
      (payload) =>
        payload.title !== undefined ||
        payload.description !== undefined ||
        payload.starts_at !== undefined ||
        payload.ends_at !== undefined ||
        payload.is_enabled !== undefined ||
        payload.max_attempts !== undefined,
      { message: 'Debes enviar al menos un campo para actualizar.' },
    ),
  params: z.object({ practiceId: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

const practiceDeleteSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({ practiceId: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

const practiceDetailSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({ practiceId: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

const practiceResultsSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({ practiceId: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

const questionCreateSchema = z.object({
  body: z
    .object({
      prompt: z.string().trim().min(3).max(3000),
      points: z.number().min(0.1).max(100).optional().default(1),
      image_name: z.string().trim().max(180).nullable().optional(),
      image_url: attachmentUrlSchema.nullable().optional(),
      options: z
        .array(
          z.object({
            text: z.string().trim().min(1).max(500),
            is_correct: z.boolean(),
          }),
        )
        .min(4)
        .max(5),
    })
    .refine((payload) => payload.options.filter((option) => option.is_correct).length === 1, {
      message: 'Debes marcar exactamente una opción correcta.',
      path: ['options'],
    }),
  params: z.object({ practiceId: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

const questionUpdateSchema = z.object({
  body: z
    .object({
      prompt: z.string().trim().min(3).max(3000).optional(),
      points: z.number().min(0.1).max(100).optional(),
      image_name: z.string().trim().max(180).nullable().optional(),
      image_url: attachmentUrlSchema.nullable().optional(),
      is_active: z.boolean().optional(),
      options: z
        .array(
          z.object({
            id: z.number().int().positive().optional(),
            text: z.string().trim().min(1).max(500),
            is_correct: z.boolean(),
          }),
        )
        .min(4)
        .max(5)
        .optional(),
    })
    .refine(
      (payload) =>
        payload.prompt !== undefined ||
        payload.points !== undefined ||
        payload.image_name !== undefined ||
        payload.image_url !== undefined ||
        payload.is_active !== undefined ||
        payload.options !== undefined,
      { message: 'Debes enviar al menos un campo para actualizar.' },
    )
    .refine(
      (payload) =>
        !payload.options || payload.options.filter((option) => option.is_correct).length === 1,
      {
        message: 'Debes marcar exactamente una opción correcta.',
        path: ['options'],
      },
    ),
  params: z.object({ questionId: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

const questionDeleteSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({ questionId: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

const practiceSubmitSchema = z.object({
  body: z.object({
    answers: z
      .array(
        z.object({
          question_id: z.number().int().positive(),
          option_id: z.number().int().positive(),
        }),
      )
      .optional()
      .default([]),
  }),
  params: z.object({ practiceId: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

const normalizeOptionalText = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const parseNullableTimestamp = (value, fieldName) => {
  const normalized = normalizeOptionalText(value);
  if (normalized === undefined) return undefined;
  if (normalized === null) return null;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, `El campo ${fieldName} tiene un formato de fecha/hora inválido.`);
  }

  return parsed.toISOString();
};

const ensureDateRange = ({ startsAt, endsAt }) => {
  if (!startsAt || !endsAt) return;
  if (new Date(endsAt) <= new Date(startsAt)) {
    throw new ApiError(400, 'La fecha/hora de cierre debe ser posterior a la de inicio.');
  }
};

const shuffleArray = (items = []) => {
  const next = items.slice();
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = next[index];
    next[index] = next[swapIndex];
    next[swapIndex] = current;
  }
  return next;
};

const getPracticeAccessContext = async (req) => {
  if (req.practiceAccessContext) return req.practiceAccessContext;

  const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  const isStudent = roles.includes('ALUMNO');

  let permissionCodes = req.user?.permissionCodes;
  if (!Array.isArray(permissionCodes) && !isStudent) {
    permissionCodes = await getUserPermissionCodes(req.user.id);
    req.user.permissionCodes = permissionCodes;
  }

  const permissionSet = new Set(permissionCodes || []);
  const canViewAssignments = isStudent || permissionSet.has('teachers.assignments.view');
  if (!canViewAssignments) {
    throw new ApiError(403, 'No tiene permisos para acceder a prácticas.');
  }

  let studentId = null;
  if (isStudent) {
    const studentResult = await query(
      `SELECT id, user_id
       FROM students
       WHERE user_id = $1
          OR (
            user_id IS NULL
            AND email IS NOT NULL
            AND LOWER(email) = LOWER($2)
          )
       ORDER BY
         CASE WHEN user_id = $1 THEN 0 ELSE 1 END,
         updated_at DESC,
         id DESC
       LIMIT 1`,
      [req.user.id, req.user.email || null],
    );

    if (!studentResult.rowCount) {
      throw new ApiError(404, 'No se encontró un perfil de alumno vinculado al usuario actual.');
    }

    const student = studentResult.rows[0];
    studentId = Number(student.id);

    if (!student.user_id) {
      await query(
        `UPDATE students
         SET user_id = $1,
             updated_at = NOW()
         WHERE id = $2
           AND user_id IS NULL`,
        [req.user.id, studentId],
      );
    }
  }

  const context = {
    allowAll: permissionSet.has('teachers.assignments.manage'),
    isStudent,
    studentId,
  };

  req.practiceAccessContext = context;
  return context;
};

const authorizePracticeAccess = asyncHandler(async (req, _res, next) => {
  await getPracticeAccessContext(req);
  return next();
});

const canManageAssignments = (req) => Boolean(req.practiceAccessContext?.allowAll);

const getAssignmentForAccess = async ({ assignmentId, userId, allowAll, studentId }) => {
  const { rows } = await query(
    `SELECT
       ta.id,
       ta.teacher_user_id,
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
       AND (
         $2::bool
         OR ta.teacher_user_id = $3
         OR (
           $4::bigint IS NOT NULL
           AND EXISTS (
             SELECT 1
             FROM enrollments e
             WHERE e.student_id = $4
               AND e.course_campus_id = ta.course_campus_id
               AND e.period_id = ta.period_id
               AND e.status = 'ACTIVE'
           )
         )
       )
     LIMIT 1`,
    [assignmentId, allowAll, userId, studentId],
  );

  if (!rows.length) {
    throw new ApiError(404, 'No se encontró el salón para esta práctica.');
  }

  return rows[0];
};

const getPracticeForAccess = async ({ practiceId, userId, allowAll, studentId }) => {
  const { rows } = await query(
    `SELECT
       p.id,
       p.assignment_id,
       p.course_campus_id,
       p.period_id,
       p.title,
       p.description,
       p.starts_at,
       p.ends_at,
       p.is_enabled,
       p.max_attempts,
       p.created_by,
       p.created_at,
       p.updated_at,
       ta.teacher_user_id,
       c.name AS course_name,
       cp.name AS campus_name,
       ap.name AS period_name
     FROM course_practices p
     JOIN teacher_assignments ta ON ta.id = p.assignment_id
     JOIN course_campus cc ON cc.id = p.course_campus_id
     JOIN courses c ON c.id = cc.course_id
     JOIN campuses cp ON cp.id = cc.campus_id
     JOIN academic_periods ap ON ap.id = p.period_id
     WHERE p.id = $1
       AND (
         $2::bool
         OR ta.teacher_user_id = $3
         OR (
           $4::bigint IS NOT NULL
           AND EXISTS (
             SELECT 1
             FROM enrollments e
             WHERE e.student_id = $4
               AND e.course_campus_id = ta.course_campus_id
               AND e.period_id = ta.period_id
               AND e.status = 'ACTIVE'
           )
         )
       )
     LIMIT 1`,
    [practiceId, allowAll, userId, studentId],
  );

  if (!rows.length) {
    throw new ApiError(404, 'Práctica no encontrada.');
  }

  return rows[0];
};

const getQuestionForAccess = async ({ questionId, userId, allowAll, studentId }) => {
  const { rows } = await query(
    `SELECT
       q.id,
       q.practice_id,
       q.prompt,
       q.points,
       q.image_name,
       q.image_url,
       q.sort_order,
       q.is_active,
       p.assignment_id,
       ta.teacher_user_id
     FROM course_practice_questions q
     JOIN course_practices p ON p.id = q.practice_id
     JOIN teacher_assignments ta ON ta.id = p.assignment_id
     WHERE q.id = $1
       AND (
         $2::bool
         OR ta.teacher_user_id = $3
         OR (
           $4::bigint IS NOT NULL
           AND EXISTS (
             SELECT 1
             FROM enrollments e
             WHERE e.student_id = $4
               AND e.course_campus_id = ta.course_campus_id
               AND e.period_id = ta.period_id
               AND e.status = 'ACTIVE'
           )
         )
       )
     LIMIT 1`,
    [questionId, allowAll, userId, studentId],
  );

  if (!rows.length) {
    throw new ApiError(404, 'Pregunta no encontrada.');
  }

  return rows[0];
};

const mapPracticeAvailability = (practice) => {
  const now = new Date();
  const startsAt = practice.starts_at ? new Date(practice.starts_at) : null;
  const endsAt = practice.ends_at ? new Date(practice.ends_at) : null;
  const enabled = Boolean(practice.is_enabled);
  const isOpen = enabled && (!startsAt || startsAt <= now) && (!endsAt || endsAt >= now);

  let availabilityLabel = 'DISABLED';
  if (!enabled) {
    availabilityLabel = 'DISABLED';
  } else if (startsAt && startsAt > now) {
    availabilityLabel = 'UPCOMING';
  } else if (endsAt && endsAt < now) {
    availabilityLabel = 'CLOSED';
  } else {
    availabilityLabel = 'OPEN';
  }

  return {
    ...practice,
    is_open: isOpen,
    availability_label: availabilityLabel,
  };
};

router.use(authenticate);

router.get(
  '/practices',
  authorizePracticeAccess,
  validate(practiceListSchema),
  asyncHandler(async (req, res) => {
    const { studentId } = await getPracticeAccessContext(req);
    const allowAll = canManageAssignments(req);
    const assignmentId = req.validated.query.assignment_id;
    await getAssignmentForAccess({ assignmentId, userId: req.user.id, allowAll, studentId });

    const practicesResult = await query(
      `SELECT
         p.id,
         p.assignment_id,
         p.title,
         p.description,
         p.starts_at,
         p.ends_at,
         p.is_enabled,
         p.max_attempts,
         p.created_at,
         p.updated_at,
         COUNT(DISTINCT q.id)::int AS question_count,
         COUNT(DISTINCT a.id)::int AS attempts_count
       FROM course_practices p
       LEFT JOIN course_practice_questions q
         ON q.practice_id = p.id
        AND q.is_active = TRUE
       LEFT JOIN course_practice_attempts a
         ON a.practice_id = p.id
        AND a.status = 'SUBMITTED'
       WHERE p.assignment_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC, p.id DESC`,
      [assignmentId],
    );

    const items = practicesResult.rows.map(mapPracticeAvailability);

    if (!studentId || !items.length) {
      return res.json({ items });
    }

    const practiceIds = items.map((item) => Number(item.id));
    const attemptsResult = await query(
      `SELECT
         a.practice_id,
         COUNT(*)::int AS attempts_used,
         MAX(a.submitted_at) AS latest_submitted_at,
         (
           ARRAY_AGG(a.score ORDER BY a.submitted_at DESC NULLS LAST, a.id DESC)
         )[1] AS latest_score,
         (
           ARRAY_AGG(a.max_score ORDER BY a.submitted_at DESC NULLS LAST, a.id DESC)
         )[1] AS latest_max_score
       FROM course_practice_attempts a
       WHERE a.student_id = $1
         AND a.practice_id = ANY($2::bigint[])
         AND a.status = 'SUBMITTED'
       GROUP BY a.practice_id`,
      [studentId, practiceIds],
    );

    const attemptsByPractice = new Map(
      attemptsResult.rows.map((row) => [Number(row.practice_id), row]),
    );

    const enrichedItems = items.map((item) => {
      const attemptInfo = attemptsByPractice.get(Number(item.id));
      const attemptsUsed = Number(attemptInfo?.attempts_used || 0);
      const maxAttempts = Number(item.max_attempts || 1);
      const remainingAttempts = Math.max(maxAttempts - attemptsUsed, 0);

      return {
        ...item,
        attempts_used: attemptsUsed,
        remaining_attempts: remainingAttempts,
        latest_submitted_at: attemptInfo?.latest_submitted_at || null,
        latest_score:
          attemptInfo?.latest_score === null || attemptInfo?.latest_score === undefined
            ? null
            : Number(attemptInfo.latest_score),
        latest_max_score:
          attemptInfo?.latest_max_score === null || attemptInfo?.latest_max_score === undefined
            ? null
            : Number(attemptInfo.latest_max_score),
      };
    });

    return res.json({ items: enrichedItems });
  }),
);

router.post(
  '/practices',
  authorizePracticeAccess,
  validate(practiceCreateSchema),
  asyncHandler(async (req, res) => {
    const { studentId, isStudent } = await getPracticeAccessContext(req);
    if (isStudent) {
      throw new ApiError(403, 'Solo el docente puede crear prácticas.');
    }

    const allowAll = canManageAssignments(req);
    const {
      assignment_id,
      title,
      description = null,
      starts_at = null,
      ends_at = null,
      is_enabled = false,
      max_attempts = 1,
    } = req.validated.body;

    const assignment = await getAssignmentForAccess({
      assignmentId: assignment_id,
      userId: req.user.id,
      allowAll,
      studentId,
    });
    const isTeacherInCharge = Number(assignment.teacher_user_id) === Number(req.user.id);
    if (!allowAll && !isTeacherInCharge) {
      throw new ApiError(403, 'No puedes crear prácticas en este salón.');
    }

    const startsAt = parseNullableTimestamp(starts_at, 'starts_at');
    const endsAt = parseNullableTimestamp(ends_at, 'ends_at');
    ensureDateRange({ startsAt, endsAt });

    const { rows } = await query(
      `INSERT INTO course_practices (
         assignment_id,
         course_campus_id,
         period_id,
         title,
         description,
         starts_at,
         ends_at,
         is_enabled,
         max_attempts,
         created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING
         id,
         assignment_id,
         course_campus_id,
         period_id,
         title,
         description,
         starts_at,
         ends_at,
         is_enabled,
         max_attempts,
         created_by,
         created_at,
         updated_at`,
      [
        assignment.id,
        assignment.course_campus_id,
        assignment.period_id,
        title.trim(),
        normalizeOptionalText(description),
        startsAt,
        endsAt,
        Boolean(is_enabled),
        Number(max_attempts),
        req.user.id,
      ],
    );

    return res.status(201).json({ message: 'Práctica creada.', item: mapPracticeAvailability(rows[0]) });
  }),
);

router.put(
  '/practices/:practiceId',
  authorizePracticeAccess,
  validate(practiceUpdateSchema),
  asyncHandler(async (req, res) => {
    const { studentId, isStudent } = await getPracticeAccessContext(req);
    if (isStudent) {
      throw new ApiError(403, 'Solo el docente puede actualizar prácticas.');
    }

    const allowAll = canManageAssignments(req);
    const { practiceId } = req.validated.params;
    const existingPractice = await getPracticeForAccess({
      practiceId,
      userId: req.user.id,
      allowAll,
      studentId,
    });

    const isTeacherInCharge = Number(existingPractice.teacher_user_id) === Number(req.user.id);
    if (!allowAll && !isTeacherInCharge) {
      throw new ApiError(403, 'No puedes actualizar esta práctica.');
    }

    const nextTitle =
      req.validated.body.title !== undefined ? req.validated.body.title.trim() : existingPractice.title;
    const nextDescription =
      req.validated.body.description !== undefined
        ? normalizeOptionalText(req.validated.body.description)
        : existingPractice.description;
    const nextStartsAt =
      req.validated.body.starts_at !== undefined
        ? parseNullableTimestamp(req.validated.body.starts_at, 'starts_at')
        : existingPractice.starts_at;
    const nextEndsAt =
      req.validated.body.ends_at !== undefined
        ? parseNullableTimestamp(req.validated.body.ends_at, 'ends_at')
        : existingPractice.ends_at;
    const nextEnabled =
      req.validated.body.is_enabled !== undefined
        ? Boolean(req.validated.body.is_enabled)
        : Boolean(existingPractice.is_enabled);
    const nextMaxAttempts =
      req.validated.body.max_attempts !== undefined
        ? Number(req.validated.body.max_attempts)
        : Number(existingPractice.max_attempts);

    ensureDateRange({ startsAt: nextStartsAt, endsAt: nextEndsAt });

    const { rows } = await query(
      `UPDATE course_practices
       SET title = $1,
           description = $2,
           starts_at = $3,
           ends_at = $4,
           is_enabled = $5,
           max_attempts = $6,
           updated_at = NOW()
       WHERE id = $7
       RETURNING
         id,
         assignment_id,
         course_campus_id,
         period_id,
         title,
         description,
         starts_at,
         ends_at,
         is_enabled,
         max_attempts,
         created_by,
         created_at,
         updated_at`,
      [
        nextTitle,
        nextDescription,
        nextStartsAt,
        nextEndsAt,
        nextEnabled,
        nextMaxAttempts,
        practiceId,
      ],
    );

    return res.json({ message: 'Práctica actualizada.', item: mapPracticeAvailability(rows[0]) });
  }),
);

router.delete(
  '/practices/:practiceId',
  authorizePracticeAccess,
  validate(practiceDeleteSchema),
  asyncHandler(async (req, res) => {
    const { studentId, isStudent } = await getPracticeAccessContext(req);
    if (isStudent) {
      throw new ApiError(403, 'Solo el docente puede eliminar prácticas.');
    }

    const allowAll = canManageAssignments(req);
    const { practiceId } = req.validated.params;
    const existingPractice = await getPracticeForAccess({
      practiceId,
      userId: req.user.id,
      allowAll,
      studentId,
    });
    const isTeacherInCharge = Number(existingPractice.teacher_user_id) === Number(req.user.id);
    if (!allowAll && !isTeacherInCharge) {
      throw new ApiError(403, 'No puedes eliminar esta práctica.');
    }

    await query(`DELETE FROM course_practices WHERE id = $1`, [practiceId]);
    return res.json({ message: 'Práctica eliminada.' });
  }),
);

router.post(
  '/practices/:practiceId/questions',
  authorizePracticeAccess,
  validate(questionCreateSchema),
  asyncHandler(async (req, res) => {
    const { studentId, isStudent } = await getPracticeAccessContext(req);
    if (isStudent) {
      throw new ApiError(403, 'Solo el docente puede crear preguntas.');
    }

    const allowAll = canManageAssignments(req);
    const { practiceId } = req.validated.params;
    const { prompt, points = 1, image_name = null, image_url = null, options } = req.validated.body;
    const practice = await getPracticeForAccess({
      practiceId,
      userId: req.user.id,
      allowAll,
      studentId,
    });

    const isTeacherInCharge = Number(practice.teacher_user_id) === Number(req.user.id);
    if (!allowAll && !isTeacherInCharge) {
      throw new ApiError(403, 'No puedes crear preguntas en esta práctica.');
    }

    const item = await withTransaction(async (tx) => {
      const orderResult = await tx.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
         FROM course_practice_questions
         WHERE practice_id = $1`,
        [practiceId],
      );
      const nextOrder = Number(orderResult.rows[0]?.next_order || 1);

      const questionResult = await tx.query(
        `INSERT INTO course_practice_questions (
           practice_id,
           prompt,
           points,
           image_name,
           image_url,
           sort_order,
           is_active
         )
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)
         RETURNING
           id,
           practice_id,
           prompt,
           points,
           image_name,
           image_url,
           sort_order,
           is_active,
           created_at,
           updated_at`,
        [
          practiceId,
          prompt.trim(),
          Number(points),
          normalizeOptionalText(image_name),
          normalizeOptionalText(image_url),
          nextOrder,
        ],
      );
      const question = questionResult.rows[0];

      const createdOptions = [];
      for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        const optionResult = await tx.query(
          `INSERT INTO course_practice_options (question_id, option_text, is_correct, sort_order)
           VALUES ($1, $2, $3, $4)
           RETURNING id, question_id, option_text, is_correct, sort_order`,
          [question.id, option.text.trim(), Boolean(option.is_correct), index + 1],
        );
        createdOptions.push(optionResult.rows[0]);
      }

      return {
        ...question,
        options: createdOptions,
      };
    });

    return res.status(201).json({ message: 'Pregunta creada.', item });
  }),
);

router.put(
  '/questions/:questionId',
  authorizePracticeAccess,
  validate(questionUpdateSchema),
  asyncHandler(async (req, res) => {
    const { studentId, isStudent } = await getPracticeAccessContext(req);
    if (isStudent) {
      throw new ApiError(403, 'Solo el docente puede actualizar preguntas.');
    }

    const allowAll = canManageAssignments(req);
    const { questionId } = req.validated.params;
    const existingQuestion = await getQuestionForAccess({
      questionId,
      userId: req.user.id,
      allowAll,
      studentId,
    });

    const isTeacherInCharge = Number(existingQuestion.teacher_user_id) === Number(req.user.id);
    if (!allowAll && !isTeacherInCharge) {
      throw new ApiError(403, 'No puedes actualizar esta pregunta.');
    }

    const nextPrompt =
      req.validated.body.prompt !== undefined ? req.validated.body.prompt.trim() : existingQuestion.prompt;
    const nextPoints =
      req.validated.body.points !== undefined ? Number(req.validated.body.points) : Number(existingQuestion.points);
    const nextImageName =
      req.validated.body.image_name !== undefined
        ? normalizeOptionalText(req.validated.body.image_name)
        : existingQuestion.image_name;
    const nextImageUrl =
      req.validated.body.image_url !== undefined
        ? normalizeOptionalText(req.validated.body.image_url)
        : existingQuestion.image_url;
    const nextIsActive =
      req.validated.body.is_active !== undefined
        ? Boolean(req.validated.body.is_active)
        : Boolean(existingQuestion.is_active);

    const item = await withTransaction(async (tx) => {
      const updatedQuestion = await tx.query(
        `UPDATE course_practice_questions
         SET prompt = $1,
             points = $2,
             image_name = $3,
             image_url = $4,
             is_active = $5,
             updated_at = NOW()
         WHERE id = $6
         RETURNING
           id,
           practice_id,
           prompt,
           points,
           image_name,
           image_url,
           sort_order,
           is_active,
           created_at,
           updated_at`,
        [nextPrompt, nextPoints, nextImageName, nextImageUrl, nextIsActive, questionId],
      );

      if (req.validated.body.options) {
        await tx.query(`DELETE FROM course_practice_options WHERE question_id = $1`, [questionId]);
        for (let index = 0; index < req.validated.body.options.length; index += 1) {
          const option = req.validated.body.options[index];
          await tx.query(
            `INSERT INTO course_practice_options (question_id, option_text, is_correct, sort_order)
             VALUES ($1, $2, $3, $4)`,
            [questionId, option.text.trim(), Boolean(option.is_correct), index + 1],
          );
        }
      }

      const optionsResult = await tx.query(
        `SELECT id, question_id, option_text, is_correct, sort_order
         FROM course_practice_options
         WHERE question_id = $1
         ORDER BY sort_order ASC, id ASC`,
        [questionId],
      );

      return {
        ...updatedQuestion.rows[0],
        options: optionsResult.rows,
      };
    });

    return res.json({ message: 'Pregunta actualizada.', item });
  }),
);

router.delete(
  '/questions/:questionId',
  authorizePracticeAccess,
  validate(questionDeleteSchema),
  asyncHandler(async (req, res) => {
    const { studentId, isStudent } = await getPracticeAccessContext(req);
    if (isStudent) {
      throw new ApiError(403, 'Solo el docente puede eliminar preguntas.');
    }

    const allowAll = canManageAssignments(req);
    const { questionId } = req.validated.params;
    const existingQuestion = await getQuestionForAccess({
      questionId,
      userId: req.user.id,
      allowAll,
      studentId,
    });

    const isTeacherInCharge = Number(existingQuestion.teacher_user_id) === Number(req.user.id);
    if (!allowAll && !isTeacherInCharge) {
      throw new ApiError(403, 'No puedes eliminar esta pregunta.');
    }

    await query(`DELETE FROM course_practice_questions WHERE id = $1`, [questionId]);
    return res.json({ message: 'Pregunta eliminada.' });
  }),
);

router.get(
  '/practices/:practiceId',
  authorizePracticeAccess,
  validate(practiceDetailSchema),
  asyncHandler(async (req, res) => {
    const context = await getPracticeAccessContext(req);
    const allowAll = canManageAssignments(req);
    const { practiceId } = req.validated.params;
    const practice = await getPracticeForAccess({
      practiceId,
      userId: req.user.id,
      allowAll,
      studentId: context.studentId,
    });

    const questionsResult = await query(
      `SELECT
         q.id,
         q.practice_id,
         q.prompt,
         q.points,
         q.image_name,
         q.image_url,
         q.sort_order,
         q.is_active
       FROM course_practice_questions q
       WHERE q.practice_id = $1
       ORDER BY q.sort_order ASC, q.id ASC`,
      [practiceId],
    );

    const questionIds = questionsResult.rows.map((row) => Number(row.id));
    const optionsResult = questionIds.length
      ? await query(
          `SELECT
             o.id,
             o.question_id,
             o.option_text,
             o.is_correct,
             o.sort_order
           FROM course_practice_options o
           WHERE o.question_id = ANY($1::bigint[])
           ORDER BY o.question_id ASC, o.sort_order ASC, o.id ASC`,
          [questionIds],
        )
      : { rows: [] };

    const optionsByQuestion = new Map();
    for (const option of optionsResult.rows) {
      const key = Number(option.question_id);
      if (!optionsByQuestion.has(key)) optionsByQuestion.set(key, []);
      optionsByQuestion.get(key).push(
        context.isStudent
          ? {
              id: option.id,
              question_id: option.question_id,
              option_text: option.option_text,
              sort_order: option.sort_order,
            }
          : option,
      );
    }

    const questions = questionsResult.rows
      .filter((question) => !context.isStudent || Boolean(question.is_active))
      .map((question) => {
        const currentOptions = optionsByQuestion.get(Number(question.id)) || [];
        return {
          ...question,
          options: context.isStudent ? shuffleArray(currentOptions) : currentOptions,
        };
      });

    let studentProgress = null;
    if (context.studentId) {
      const progressResult = await query(
        `SELECT
           COUNT(*)::int AS attempts_used,
           MAX(submitted_at) AS latest_submitted_at,
           (
             ARRAY_AGG(score ORDER BY submitted_at DESC NULLS LAST, id DESC)
           )[1] AS latest_score,
           (
             ARRAY_AGG(max_score ORDER BY submitted_at DESC NULLS LAST, id DESC)
           )[1] AS latest_max_score
         FROM course_practice_attempts
         WHERE practice_id = $1
           AND student_id = $2
           AND status = 'SUBMITTED'`,
        [practiceId, context.studentId],
      );

      const progress = progressResult.rows[0] || {};
      const attemptsUsed = Number(progress.attempts_used || 0);
      const maxAttempts = Number(practice.max_attempts || 1);
      studentProgress = {
        attempts_used: attemptsUsed,
        remaining_attempts: Math.max(maxAttempts - attemptsUsed, 0),
        latest_submitted_at: progress.latest_submitted_at || null,
        latest_score:
          progress.latest_score === null || progress.latest_score === undefined
            ? null
            : Number(progress.latest_score),
        latest_max_score:
          progress.latest_max_score === null || progress.latest_max_score === undefined
            ? null
            : Number(progress.latest_max_score),
      };
    }

    return res.json({
      item: mapPracticeAvailability(practice),
      questions,
      student_progress: studentProgress,
    });
  }),
);

router.get(
  '/practices/:practiceId/results',
  authorizePracticeAccess,
  validate(practiceResultsSchema),
  asyncHandler(async (req, res) => {
    const { studentId, isStudent } = await getPracticeAccessContext(req);
    if (isStudent) {
      throw new ApiError(403, 'Solo el docente puede consultar resultados globales.');
    }

    const allowAll = canManageAssignments(req);
    const { practiceId } = req.validated.params;
    const practice = await getPracticeForAccess({
      practiceId,
      userId: req.user.id,
      allowAll,
      studentId,
    });

    const isTeacherInCharge = Number(practice.teacher_user_id) === Number(req.user.id);
    if (!allowAll && !isTeacherInCharge) {
      throw new ApiError(403, 'No puedes consultar resultados de esta práctica.');
    }

    const { rows } = await query(
      `SELECT
         a.id,
         a.practice_id,
         a.student_id,
         a.enrollment_id,
         a.attempt_number,
         a.submitted_at,
         a.score,
         a.max_score,
         a.percentage,
         s.first_name,
         s.last_name,
         s.document_number
       FROM course_practice_attempts a
       JOIN students s ON s.id = a.student_id
       WHERE a.practice_id = $1
         AND a.status = 'SUBMITTED'
       ORDER BY a.submitted_at DESC NULLS LAST, a.id DESC`,
      [practiceId],
    );

    return res.json({ items: rows });
  }),
);

router.post(
  '/practices/:practiceId/submit',
  authorizePracticeAccess,
  validate(practiceSubmitSchema),
  asyncHandler(async (req, res) => {
    const context = await getPracticeAccessContext(req);
    if (!context.isStudent || !context.studentId) {
      throw new ApiError(403, 'Solo el alumno puede enviar prácticas.');
    }

    const allowAll = canManageAssignments(req);
    const { practiceId } = req.validated.params;
    const { answers = [] } = req.validated.body;
    const practice = await getPracticeForAccess({
      practiceId,
      userId: req.user.id,
      allowAll,
      studentId: context.studentId,
    });
    const practiceWithState = mapPracticeAvailability(practice);

    if (!practiceWithState.is_open) {
      throw new ApiError(409, 'La práctica no está habilitada en este momento.');
    }

    const enrollmentResult = await query(
      `SELECT id
       FROM enrollments
       WHERE student_id = $1
         AND course_campus_id = $2
         AND period_id = $3
         AND status = 'ACTIVE'
       ORDER BY id DESC
       LIMIT 1`,
      [context.studentId, practice.course_campus_id, practice.period_id],
    );

    if (!enrollmentResult.rowCount) {
      throw new ApiError(403, 'No tienes matrícula activa para enviar esta práctica.');
    }
    const enrollmentId = Number(enrollmentResult.rows[0].id);

    const attemptsCountResult = await query(
      `SELECT COUNT(*)::int AS attempts_used
       FROM course_practice_attempts
       WHERE practice_id = $1
         AND student_id = $2
         AND status = 'SUBMITTED'`,
      [practiceId, context.studentId],
    );
    const attemptsUsed = Number(attemptsCountResult.rows[0]?.attempts_used || 0);
    const maxAttempts = Number(practice.max_attempts || 1);
    if (attemptsUsed >= maxAttempts) {
      throw new ApiError(409, 'Ya alcanzaste el número máximo de intentos para esta práctica.');
    }

    const questionsResult = await query(
      `SELECT id, points
       FROM course_practice_questions
       WHERE practice_id = $1
         AND is_active = TRUE
       ORDER BY sort_order ASC, id ASC`,
      [practiceId],
    );

    if (!questionsResult.rowCount) {
      throw new ApiError(409, 'La práctica no tiene preguntas activas para resolver.');
    }

    const questionIds = questionsResult.rows.map((row) => Number(row.id));
    const optionsResult = await query(
      `SELECT id, question_id, is_correct
       FROM course_practice_options
       WHERE question_id = ANY($1::bigint[])`,
      [questionIds],
    );

    const optionsByQuestion = new Map();
    for (const option of optionsResult.rows) {
      const key = Number(option.question_id);
      if (!optionsByQuestion.has(key)) optionsByQuestion.set(key, []);
      optionsByQuestion.get(key).push(option);
    }

    const answerByQuestion = new Map();
    for (const answer of answers) {
      answerByQuestion.set(Number(answer.question_id), Number(answer.option_id));
    }

    let maxScore = 0;
    let totalScore = 0;
    const answerRows = [];

    for (const question of questionsResult.rows) {
      const questionId = Number(question.id);
      const points = Number(question.points || 0);
      const questionOptions = optionsByQuestion.get(questionId) || [];
      const correctOption = questionOptions.find((option) => Boolean(option.is_correct));
      if (!correctOption) {
        throw new ApiError(409, `La pregunta ${questionId} no tiene opción correcta configurada.`);
      }

      const selectedOptionId = answerByQuestion.get(questionId) || null;
      if (selectedOptionId) {
        const belongsToQuestion = questionOptions.some((option) => Number(option.id) === Number(selectedOptionId));
        if (!belongsToQuestion) {
          throw new ApiError(400, `La opción enviada para la pregunta ${questionId} no es válida.`);
        }
      }

      const isCorrect = selectedOptionId !== null && Number(selectedOptionId) === Number(correctOption.id);
      const pointsAwarded = isCorrect ? points : 0;
      maxScore += points;
      totalScore += pointsAwarded;
      answerRows.push({
        question_id: questionId,
        selected_option_id: selectedOptionId,
        is_correct: isCorrect,
        points_awarded: pointsAwarded,
      });
    }

    const percentage = maxScore > 0 ? Number(((totalScore / maxScore) * 100).toFixed(2)) : 0;
    const submittedAt = new Date().toISOString();

    const item = await withTransaction(async (tx) => {
      const attemptResult = await tx.query(
        `INSERT INTO course_practice_attempts (
           practice_id,
           student_id,
           enrollment_id,
           attempt_number,
           started_at,
           submitted_at,
           status,
           score,
           max_score,
           percentage,
           graded_at
         )
         VALUES ($1, $2, $3, $4, NOW(), $5, 'SUBMITTED', $6, $7, $8, $5)
         RETURNING
           id,
           practice_id,
           student_id,
           enrollment_id,
           attempt_number,
           started_at,
           submitted_at,
           status,
           score,
           max_score,
           percentage,
           graded_at`,
        [
          practiceId,
          context.studentId,
          enrollmentId,
          attemptsUsed + 1,
          submittedAt,
          totalScore,
          maxScore,
          percentage,
        ],
      );

      const attempt = attemptResult.rows[0];
      for (const answerRow of answerRows) {
        await tx.query(
          `INSERT INTO course_practice_attempt_answers (
             attempt_id,
             question_id,
             selected_option_id,
             is_correct,
             points_awarded
           )
           VALUES ($1, $2, $3, $4, $5)`,
          [
            attempt.id,
            answerRow.question_id,
            answerRow.selected_option_id,
            answerRow.is_correct,
            answerRow.points_awarded,
          ],
        );
      }

      return attempt;
    });

    return res.status(201).json({
      message: 'Práctica enviada y calificada automáticamente.',
      item,
    });
  }),
);

module.exports = router;
