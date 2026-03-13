const express = require('express');
const { z } = require('zod');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { userHasPermission } = require('../services/permissions.service');
const { parseCampusScopeId } = require('../utils/campusScope');

const router = express.Router();

router.use(authenticate);

router.get(
  '/summary',
  authorizePermission('dashboard.view'),
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({}).optional(),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const campusScopeId = parseCampusScopeId(req);
    const [canViewStudents, canViewCourses, canViewPayments, canViewReports] = await Promise.all([
      userHasPermission(req.user.id, 'students.view'),
      userHasPermission(req.user.id, 'courses.view'),
      userHasPermission(req.user.id, 'payments.view'),
      userHasPermission(req.user.id, 'reports.view'),
    ]);

    const summary = {
      totals: {
        students: 0,
        courses: 0,
        payments: 0,
        income: '0.00',
      },
      recent_payments: [],
      morosity: [],
      visibility: {
        students: canViewStudents,
        courses: canViewCourses,
        payments: canViewPayments,
        reports: canViewReports,
      },
    };

    const tasks = [];

    if (canViewStudents) {
      tasks.push(
        query(
          `SELECT COUNT(DISTINCT s.id)::int AS total
           FROM students s
           LEFT JOIN enrollments e
             ON e.student_id = s.id
            AND e.status = 'ACTIVE'
           LEFT JOIN course_campus cc ON cc.id = e.course_campus_id
           WHERE s.status = 'ACTIVE'
             AND ($1::bigint IS NULL OR cc.campus_id = $1)`,
          [campusScopeId],
        ).then((result) => {
          summary.totals.students = result.rows[0]?.total || 0;
        }),
      );
    }

    if (canViewCourses) {
      tasks.push(
        query(
          `SELECT COUNT(DISTINCT c.id)::int AS total
           FROM courses c
           LEFT JOIN course_campus cc ON cc.course_id = c.id
           WHERE c.is_active = TRUE
             AND ($1::bigint IS NULL OR cc.campus_id = $1)`,
          [campusScopeId],
        ).then((result) => {
          summary.totals.courses = result.rows[0]?.total || 0;
        }),
      );
    }

    if (canViewPayments) {
      tasks.push(
        query(
          `SELECT
             COUNT(*)::int AS total,
             COALESCE(SUM(CASE WHEN p.status = 'COMPLETED' THEN p.total_amount ELSE 0 END), 0)::numeric(12,2) AS income
           FROM payments p
           JOIN enrollments e ON e.id = p.enrollment_id
           JOIN course_campus cc ON cc.id = e.course_campus_id
           WHERE ($1::bigint IS NULL OR cc.campus_id = $1)`,
          [campusScopeId],
        ).then((result) => {
          summary.totals.payments = result.rows[0]?.total || 0;
          summary.totals.income = result.rows[0]?.income || '0.00';
        }),
      );

      tasks.push(
        query(
          `SELECT
             p.id,
             p.student_id,
             CONCAT(s.first_name, ' ', s.last_name) AS student_name,
             p.total_amount,
             p.method,
             p.status,
             p.payment_date
           FROM payments p
           JOIN students s ON s.id = p.student_id
           JOIN enrollments e ON e.id = p.enrollment_id
           JOIN course_campus cc ON cc.id = e.course_campus_id
           WHERE ($1::bigint IS NULL OR cc.campus_id = $1)
           ORDER BY p.payment_date DESC
           LIMIT 7`,
          [campusScopeId],
        ).then((result) => {
          summary.recent_payments = result.rows;
        }),
      );
    }

    if (canViewReports) {
      tasks.push(
        query(
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
             AND ($1::bigint IS NULL OR cc.campus_id = $1)
           ORDER BY i.due_date ASC
           LIMIT 6`,
          [campusScopeId],
        ).then((result) => {
          summary.morosity = result.rows;
        }),
      );
    }

    await Promise.all(tasks);

    return res.json(summary);
  }),
);

module.exports = router;
