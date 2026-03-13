const express = require('express');
const { z } = require('zod');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/auth');
const { getUserPermissionCodes } = require('../services/permissions.service');

const router = express.Router();
const attachmentUrlSchema = z.string().trim().min(5).max(2500000);

const topicListSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z.object({
    assignment_id: z.coerce.number().int().positive(),
  }),
});

const topicCreateSchema = z.object({
  body: z.object({
    assignment_id: z.number().int().positive(),
    title: z.string().min(3).max(180),
    content: z.string().min(3).max(3000),
    attachment_name: z.string().trim().max(180).nullable().optional(),
    attachment_url: attachmentUrlSchema.nullable().optional(),
    is_pinned: z.boolean().optional().default(false),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const topicUpdateSchema = z.object({
  body: z
    .object({
      title: z.string().min(3).max(180).optional(),
      content: z.string().min(3).max(3000).optional(),
      attachment_name: z.string().trim().max(180).nullable().optional(),
      attachment_url: attachmentUrlSchema.nullable().optional(),
      is_pinned: z.boolean().optional(),
      is_locked: z.boolean().optional(),
      grade_score: z.number().min(0).max(20).nullable().optional(),
      grade_feedback: z.string().trim().max(300).nullable().optional(),
    })
    .refine(
      (payload) =>
        payload.title !== undefined ||
        payload.content !== undefined ||
        payload.attachment_name !== undefined ||
        payload.attachment_url !== undefined ||
        payload.is_pinned !== undefined ||
        payload.is_locked !== undefined ||
        payload.grade_score !== undefined ||
        payload.grade_feedback !== undefined,
      { message: 'Debes enviar al menos un campo para actualizar.' },
    ),
  params: z.object({ topicId: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

const topicDeleteSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({ topicId: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

const commentListSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({ topicId: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

const commentCreateSchema = z.object({
  body: z.object({
    content: z.string().min(1).max(2000),
    attachment_name: z.string().trim().max(180).nullable().optional(),
    attachment_url: attachmentUrlSchema.nullable().optional(),
  }),
  params: z.object({ topicId: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

const commentDeleteSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({ commentId: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

const normalizeOptionalText = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const getForumAccessContext = async (req) => {
  if (req.forumAccessContext) return req.forumAccessContext;

  const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  const isStudent = roles.includes('ALUMNO');

  let permissionCodes = req.user?.permissionCodes;
  if (!Array.isArray(permissionCodes) && !isStudent) {
    permissionCodes = await getUserPermissionCodes(req.user.id);
    req.user.permissionCodes = permissionCodes;
  }

  const permissionSet = new Set(permissionCodes || []);
  const canViewForum = isStudent || permissionSet.has('teachers.assignments.view');
  if (!canViewForum) {
    throw new ApiError(403, 'No tiene permisos para acceder al foro.');
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

    // Autorreparación segura: si el correo coincide y no estaba vinculado, enlaza student.user_id al usuario actual.
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

  req.forumAccessContext = context;
  return context;
};

const authorizeForumAccess = asyncHandler(async (req, _res, next) => {
  await getForumAccessContext(req);
  return next();
});

const canManageAssignments = (req) =>
  Boolean(req.forumAccessContext?.allowAll);

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
    throw new ApiError(404, 'No se encontro el salon para este foro.');
  }

  return rows[0];
};

const getTopicForAccess = async ({ topicId, userId, allowAll, studentId }) => {
  const { rows } = await query(
    `SELECT
       t.id,
       t.assignment_id,
       t.title,
       t.content,
       t.attachment_name,
       t.attachment_url,
       t.is_pinned,
       t.is_locked,
       t.grade_score,
       t.grade_feedback,
       t.graded_by,
       t.graded_at,
       t.author_user_id,
       t.created_at,
       t.updated_at,
       ta.teacher_user_id
     FROM course_forum_topics t
     JOIN teacher_assignments ta ON ta.id = t.assignment_id
     WHERE t.id = $1
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
    [topicId, allowAll, userId, studentId],
  );

  if (!rows.length) {
    throw new ApiError(404, 'Tema del foro no encontrado.');
  }

  return rows[0];
};

router.use(authenticate);

router.get(
  '/topics',
  authorizeForumAccess,
  validate(topicListSchema),
  asyncHandler(async (req, res) => {
    const { studentId } = await getForumAccessContext(req);
    const allowAll = canManageAssignments(req);
    const assignmentId = req.validated.query.assignment_id;
    await getAssignmentForAccess({ assignmentId, userId: req.user.id, allowAll, studentId });

    const { rows } = await query(
      `SELECT
         t.id,
         t.assignment_id,
         t.title,
         t.content,
         t.attachment_name,
         t.attachment_url,
         t.is_pinned,
         t.is_locked,
         t.grade_score,
         t.grade_feedback,
         t.graded_by,
         t.graded_at,
         t.author_user_id,
         t.created_at,
         t.updated_at,
         CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS author_name,
         CONCAT(COALESCE(u_grader.first_name, ''), ' ', COALESCE(u_grader.last_name, '')) AS graded_by_name,
         COUNT(cm.id)::int AS comments_count,
         MAX(cm.created_at) AS last_comment_at
       FROM course_forum_topics t
       LEFT JOIN users u ON u.id = t.author_user_id
       LEFT JOIN users u_grader ON u_grader.id = t.graded_by
       LEFT JOIN course_forum_comments cm ON cm.topic_id = t.id
       WHERE t.assignment_id = $1
       GROUP BY t.id, u.first_name, u.last_name, u_grader.first_name, u_grader.last_name
       ORDER BY
         t.is_pinned DESC,
         COALESCE(MAX(cm.created_at), t.created_at) DESC,
         t.id DESC`,
      [assignmentId],
    );

    return res.json({ items: rows });
  }),
);

router.post(
  '/topics',
  authorizeForumAccess,
  validate(topicCreateSchema),
  asyncHandler(async (req, res) => {
    const { studentId, isStudent } = await getForumAccessContext(req);
    const allowAll = canManageAssignments(req);
    const {
      assignment_id,
      title,
      content,
      attachment_name = null,
      attachment_url = null,
      is_pinned = false,
    } = req.validated.body;

    const assignment = await getAssignmentForAccess({
      assignmentId: assignment_id,
      userId: req.user.id,
      allowAll,
      studentId,
    });

    const normalizedAttachmentName = normalizeOptionalText(attachment_name);
    const normalizedAttachmentUrl = normalizeOptionalText(attachment_url);

    const { rows } = await query(
      `INSERT INTO course_forum_topics (
         assignment_id,
         course_campus_id,
         period_id,
         author_user_id,
         title,
         content,
         attachment_name,
         attachment_url,
         is_pinned
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING
         id,
         assignment_id,
         title,
         content,
         attachment_name,
         attachment_url,
         is_pinned,
         is_locked,
         grade_score,
         grade_feedback,
         graded_by,
         graded_at,
         author_user_id,
         created_at,
         updated_at`,
      [
        assignment.id,
        assignment.course_campus_id,
        assignment.period_id,
        req.user.id,
        title.trim(),
        content.trim(),
        normalizedAttachmentName,
        normalizedAttachmentUrl,
        isStudent ? false : is_pinned,
      ],
    );

    return res.status(201).json({ message: 'Publicacion creada.', item: rows[0] });
  }),
);

router.put(
  '/topics/:topicId',
  authorizeForumAccess,
  validate(topicUpdateSchema),
  asyncHandler(async (req, res) => {
    const { studentId } = await getForumAccessContext(req);
    const allowAll = canManageAssignments(req);
    const { topicId } = req.validated.params;
    const existingTopic = await getTopicForAccess({
      topicId,
      userId: req.user.id,
      allowAll,
      studentId,
    });
    const isAuthor = Number(existingTopic.author_user_id) === Number(req.user.id);
    const isTeacherInCharge = Number(existingTopic.teacher_user_id) === Number(req.user.id);

    if (!allowAll && !isAuthor && !isTeacherInCharge) {
      throw new ApiError(403, 'No puedes editar esta publicacion.');
    }

    const teacherOnlyPayload =
      req.validated.body.is_pinned !== undefined ||
      req.validated.body.is_locked !== undefined ||
      req.validated.body.grade_score !== undefined ||
      req.validated.body.grade_feedback !== undefined;

    if (teacherOnlyPayload && !allowAll && !isTeacherInCharge) {
      throw new ApiError(403, 'Solo el docente del salón puede fijar/cerrar o calificar publicaciones.');
    }

    const title = req.validated.body.title ?? existingTopic.title;
    const content = req.validated.body.content ?? existingTopic.content;

    const attachmentName =
      req.validated.body.attachment_name !== undefined
        ? normalizeOptionalText(req.validated.body.attachment_name)
        : existingTopic.attachment_name;
    const attachmentUrl =
      req.validated.body.attachment_url !== undefined
        ? normalizeOptionalText(req.validated.body.attachment_url)
        : existingTopic.attachment_url;

    const isPinned =
      req.validated.body.is_pinned !== undefined
        ? req.validated.body.is_pinned
        : existingTopic.is_pinned;
    const isLocked =
      req.validated.body.is_locked !== undefined
        ? req.validated.body.is_locked
        : existingTopic.is_locked;

    const gradeScore =
      req.validated.body.grade_score !== undefined
        ? req.validated.body.grade_score
        : existingTopic.grade_score;
    const gradeFeedback =
      req.validated.body.grade_feedback !== undefined
        ? normalizeOptionalText(req.validated.body.grade_feedback)
        : existingTopic.grade_feedback;

    const touchedGrade =
      req.validated.body.grade_score !== undefined || req.validated.body.grade_feedback !== undefined;

    let gradedBy = existingTopic.graded_by;
    let gradedAt = existingTopic.graded_at;

    if (touchedGrade) {
      const hasGrade = gradeScore !== null || Boolean(gradeFeedback);
      gradedBy = hasGrade ? req.user.id : null;
      gradedAt = hasGrade ? new Date().toISOString() : null;
    }

    const { rows } = await query(
      `UPDATE course_forum_topics
       SET title = $1,
           content = $2,
           attachment_name = $3,
           attachment_url = $4,
           is_pinned = $5,
           is_locked = $6,
           grade_score = $7,
           grade_feedback = $8,
           graded_by = $9,
           graded_at = $10,
           updated_at = NOW()
       WHERE id = $11
       RETURNING
         id,
         assignment_id,
         title,
         content,
         attachment_name,
         attachment_url,
         is_pinned,
         is_locked,
         grade_score,
         grade_feedback,
         graded_by,
         graded_at,
         author_user_id,
         created_at,
         updated_at`,
      [
        title.trim(),
        content.trim(),
        attachmentName,
        attachmentUrl,
        isPinned,
        isLocked,
        gradeScore,
        gradeFeedback,
        gradedBy,
        gradedAt,
        topicId,
      ],
    );

    return res.json({ message: 'Publicacion actualizada.', item: rows[0] });
  }),
);

router.delete(
  '/topics/:topicId',
  authorizeForumAccess,
  validate(topicDeleteSchema),
  asyncHandler(async (req, res) => {
    const { studentId } = await getForumAccessContext(req);
    const allowAll = canManageAssignments(req);
    const { topicId } = req.validated.params;
    const existingTopic = await getTopicForAccess({
      topicId,
      userId: req.user.id,
      allowAll,
      studentId,
    });
    const isAuthor = Number(existingTopic.author_user_id) === Number(req.user.id);
    const isTeacherInCharge = Number(existingTopic.teacher_user_id) === Number(req.user.id);

    if (!allowAll && !isAuthor && !isTeacherInCharge) {
      throw new ApiError(403, 'No puedes eliminar esta publicacion.');
    }

    await query(`DELETE FROM course_forum_topics WHERE id = $1`, [topicId]);
    return res.json({ message: 'Publicacion eliminada.' });
  }),
);

router.get(
  '/topics/:topicId/comments',
  authorizeForumAccess,
  validate(commentListSchema),
  asyncHandler(async (req, res) => {
    const { studentId } = await getForumAccessContext(req);
    const allowAll = canManageAssignments(req);
    const { topicId } = req.validated.params;
    await getTopicForAccess({
      topicId,
      userId: req.user.id,
      allowAll,
      studentId,
    });

    const { rows } = await query(
      `SELECT
         cm.id,
         cm.topic_id,
         cm.content,
         cm.attachment_name,
         cm.attachment_url,
         cm.author_user_id,
         cm.created_at,
         cm.updated_at,
         CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS author_name
       FROM course_forum_comments cm
       LEFT JOIN users u ON u.id = cm.author_user_id
       WHERE cm.topic_id = $1
       ORDER BY cm.created_at ASC, cm.id ASC`,
      [topicId],
    );

    return res.json({ items: rows });
  }),
);

router.post(
  '/topics/:topicId/comments',
  authorizeForumAccess,
  validate(commentCreateSchema),
  asyncHandler(async (req, res) => {
    const { studentId } = await getForumAccessContext(req);
    const allowAll = canManageAssignments(req);
    const { topicId } = req.validated.params;
    const { content, attachment_name = null, attachment_url = null } = req.validated.body;

    const topic = await getTopicForAccess({
      topicId,
      userId: req.user.id,
      allowAll,
      studentId,
    });

    if (topic.is_locked) {
      throw new ApiError(409, 'Este tema esta cerrado para nuevos comentarios.');
    }

    const normalizedAttachmentName = normalizeOptionalText(attachment_name);
    const normalizedAttachmentUrl = normalizeOptionalText(attachment_url);

    const { rows } = await query(
      `INSERT INTO course_forum_comments (topic_id, author_user_id, content, attachment_name, attachment_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, topic_id, content, attachment_name, attachment_url, author_user_id, created_at, updated_at`,
      [topicId, req.user.id, content.trim(), normalizedAttachmentName, normalizedAttachmentUrl],
    );

    return res.status(201).json({ message: 'Comentario publicado.', item: rows[0] });
  }),
);

router.delete(
  '/comments/:commentId',
  authorizeForumAccess,
  validate(commentDeleteSchema),
  asyncHandler(async (req, res) => {
    const { studentId } = await getForumAccessContext(req);
    const allowAll = canManageAssignments(req);
    const { commentId } = req.validated.params;

    const { rows } = await query(
      `SELECT
         cm.id,
         cm.author_user_id,
         ta.teacher_user_id
       FROM course_forum_comments cm
       JOIN course_forum_topics t ON t.id = cm.topic_id
       JOIN teacher_assignments ta ON ta.id = t.assignment_id
       WHERE cm.id = $1
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
      [commentId, allowAll, req.user.id, studentId],
    );

    if (!rows.length) {
      throw new ApiError(404, 'Comentario no encontrado.');
    }

    const comment = rows[0];
    const isAuthor = Number(comment.author_user_id) === Number(req.user.id);
    const isTeacherInCharge = Number(comment.teacher_user_id) === Number(req.user.id);

    if (!allowAll && !isAuthor && !isTeacherInCharge) {
      throw new ApiError(403, 'No puedes eliminar este comentario.');
    }

    await query(`DELETE FROM course_forum_comments WHERE id = $1`, [commentId]);
    return res.json({ message: 'Comentario eliminado.' });
  }),
);

module.exports = router;
