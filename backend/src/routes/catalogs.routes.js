const express = require('express');
const { z } = require('zod');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate');
const { authenticate, authorizePermission } = require('../middlewares/auth');

const router = express.Router();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');

router.use(authenticate);

router.get(
  '/periods',
  authorizePermission('periods.view'),
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT id, name, start_date, end_date, is_active, created_at
       FROM academic_periods
       ORDER BY start_date DESC`,
    );

    return res.json({ items: rows });
  }),
);

router.post(
  '/periods',
  authorizePermission('periods.manage'),
  validate(
    z.object({
      body: z.object({
        name: z.string().min(3).max(50),
        start_date: dateString,
        end_date: dateString,
        is_active: z.boolean().optional().default(true),
      }),
      params: z.object({}).optional(),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { name, start_date, end_date, is_active = true } = req.validated.body;

    const { rows } = await query(
      `INSERT INTO academic_periods (name, start_date, end_date, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, start_date, end_date, is_active, created_at`,
      [name, start_date, end_date, is_active],
    );

    return res.status(201).json({ message: 'Periodo académico creado.', item: rows[0] });
  }),
);

router.get(
  '/payment-concepts',
  authorizePermission('payment_concepts.view'),
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT id, name, description
       FROM payment_concepts
       ORDER BY name`,
    );

    return res.json({ items: rows });
  }),
);

module.exports = router;
