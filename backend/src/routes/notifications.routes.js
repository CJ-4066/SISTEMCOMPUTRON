const express = require('express');
const { z } = require('zod');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');
const validate = require('../middlewares/validate');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { parseCampusScopeId } = require('../utils/campusScope');
const {
  getReminderJob,
  listReminderJobs,
  queueReminderJob,
} = require('../services/notificationJobs.service');

const router = express.Router();
const NOTIFICATION_STATUS = ['PENDING', 'SENT', 'FAILED'];

router.use(authenticate);

const notificationsListSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      page: z.coerce.number().int().positive().optional(),
      page_size: z.coerce.number().int().min(1).max(100).optional(),
      status: z.enum(NOTIFICATION_STATUS).optional(),
      q: z.string().trim().max(120).optional(),
    })
    .optional(),
});

router.get(
  '/',
  authorizePermission('notifications.view'),
  validate(notificationsListSchema),
  asyncHandler(async (req, res) => {
    const queryParams = req.validated.query || {};
    const status = queryParams.status || null;
    const search = queryParams.q?.trim() || null;
    const campusScopeId = parseCampusScopeId(req);
    const pageSize = queryParams.page_size || 20;
    const page = queryParams.page || 1;
    const offset = (page - 1) * pageSize;

    const whereClause = `
      WHERE ($1::text IS NULL OR n.status = $1)
        AND (
          $2::text IS NULL
          OR n.recipient ILIKE '%' || $2 || '%'
          OR n.subject ILIKE '%' || $2 || '%'
          OR COALESCE(n.error_message, '') ILIKE '%' || $2 || '%'
        )
        AND (
          $3::bigint IS NULL
          OR EXISTS (
            SELECT 1
            FROM enrollments e_scope
            JOIN course_campus cc_scope ON cc_scope.id = e_scope.course_campus_id
            WHERE e_scope.student_id = n.student_id
              AND cc_scope.campus_id = $3
          )
        )
    `;

    const totalResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM notifications n
       ${whereClause}`,
      [status, search, campusScopeId],
    );
    const total = totalResult.rows[0]?.total || 0;

    const { rows } = await query(
      `SELECT id, student_id, guardian_id, channel, recipient, subject, status, scheduled_at, sent_at, error_message
       FROM notifications n
       ${whereClause}
       ORDER BY n.scheduled_at DESC
       LIMIT $4
       OFFSET $5`,
      [status, search, campusScopeId, pageSize, offset],
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
  '/reminders/run',
  authorizePermission('notifications.manage'),
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({}).optional(),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const job = queueReminderJob({ requestedBy: req.user.id });
    return res.status(202).json({
      message: 'Proceso de recordatorios en cola.',
      job,
    });
  }),
);

router.get(
  '/jobs',
  authorizePermission('notifications.manage'),
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({}).optional(),
      query: z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const limit = req.validated.query?.limit || 25;
    const items = listReminderJobs(limit);
    return res.json({ items });
  }),
);

router.get(
  '/jobs/:id',
  authorizePermission('notifications.manage'),
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({ id: z.string().min(3).max(80) }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const job = getReminderJob(req.validated.params.id);
    if (!job) {
      throw new ApiError(404, 'Job de recordatorios no encontrado.');
    }

    return res.json({ item: job });
  }),
);

module.exports = router;
