const express = require('express');
const { z } = require('zod');
const { query } = require('../config/db');
const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');
const validate = require('../middlewares/validate');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { parseCampusScopeId } = require('../utils/campusScope');
const {
  buildCacheKey,
  getCachedResponse,
  setCachedResponse,
  invalidateCacheByPrefix,
} = require('../services/responseCache.service');

const router = express.Router();
const COURSES_LIST_CACHE_PREFIX = 'courses:list';
const TEACHER_ASSIGNMENTS_CACHE_PREFIX = 'teachers:assignments:list';
const LIST_CACHE_TTL_MS = env.responseCacheTtlMs;

const invalidateCourseReadCaches = () => {
  invalidateCacheByPrefix(COURSES_LIST_CACHE_PREFIX);
  invalidateCacheByPrefix(TEACHER_ASSIGNMENTS_CACHE_PREFIX);
};

const courseSchema = z.object({
  body: z.object({
    name: z.string().min(3).max(120),
    description: z.string().max(500).nullable().optional(),
    duration_hours: z.number().int().positive(),
    passing_grade: z.number().min(0).max(20).optional().default(11),
    is_active: z.boolean().optional().default(true),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const offeringSchema = z.object({
  body: z.object({
    campus_id: z.number().int().positive(),
    modality: z.enum(['PRESENCIAL', 'VIRTUAL', 'HIBRIDO']).optional().default('PRESENCIAL'),
    monthly_fee: z.number().nonnegative(),
    capacity: z.number().int().positive().nullable().optional(),
    schedule_info: z.string().max(240).nullable().optional(),
  }),
  params: z.object({ id: z.coerce.number().int().positive() }),
  query: z.object({}).optional(),
});

router.use(authenticate);

router.get(
  '/',
  authorizePermission('courses.view'),
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({}).optional(),
      query: z
        .object({
          q: z.string().max(120).optional(),
          campus_id: z.coerce.number().int().positive().optional(),
          sort: z.enum(['NAME_ASC', 'CREATED_DESC']).optional(),
          page: z.coerce.number().int().min(1).optional(),
          page_size: z.coerce.number().int().min(1).max(200).optional(),
        })
        .optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const queryParams = req.validated.query || {};
    const search = queryParams.q?.trim() || null;
    const requestedCampusId = queryParams.campus_id || null;
    const sort = queryParams.sort || 'NAME_ASC';
    const hasPagination = queryParams.page !== undefined || queryParams.page_size !== undefined;
    const page = hasPagination ? Number(queryParams.page || 1) : 1;
    const pageSize = hasPagination ? Number(queryParams.page_size || 20) : 0;
    const offset = hasPagination ? (page - 1) * pageSize : 0;
    const campusScopeId = parseCampusScopeId(req);

    const cacheKey = buildCacheKey(COURSES_LIST_CACHE_PREFIX, {
      search,
      campus_scope_id: campusScopeId,
      campus_id: requestedCampusId,
      sort,
      paginated: hasPagination,
      page,
      page_size: hasPagination ? pageSize : null,
    });
    const cachedPayload = getCachedResponse(cacheKey);
    if (cachedPayload) {
      return res.json(cachedPayload);
    }

    const baseWhereSql = `
      FROM courses c
      WHERE (
        $1::text IS NULL
        OR CONCAT_WS(' ', c.name, c.description, c.duration_hours::text) ILIKE '%' || $1 || '%'
      )
      AND (
        $2::bigint IS NULL
        OR EXISTS (
          SELECT 1
          FROM course_campus cc_scope
          WHERE cc_scope.course_id = c.id
            AND cc_scope.campus_id = $2
        )
      )
      AND (
        $3::bigint IS NULL
        OR EXISTS (
          SELECT 1
          FROM course_campus cc_filter
          WHERE cc_filter.course_id = c.id
            AND cc_filter.campus_id = $3
        )
      )
    `;

    let total = 0;
    if (hasPagination) {
      const totalResult = await query(
        `SELECT COUNT(*)::int AS total
         ${baseWhereSql}`,
        [search, campusScopeId, requestedCampusId],
      );
      total = Number(totalResult.rows[0]?.total || 0);
    }

    const courseResult = await query(
      `SELECT
         c.id,
         c.name,
         c.description,
         c.duration_hours,
         c.passing_grade,
         c.is_active,
         c.created_at
       ${baseWhereSql}
       ORDER BY ${sort === 'CREATED_DESC' ? 'c.created_at DESC, c.id DESC' : 'c.name'}
       ${hasPagination ? 'LIMIT $4 OFFSET $5' : ''}`,
      hasPagination
        ? [search, campusScopeId, requestedCampusId, pageSize, offset]
        : [search, campusScopeId, requestedCampusId],
    );

    const courseRows = courseResult.rows || [];
    const courseIds = courseRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
    const offeringsByCourseId = new Map();

    if (courseIds.length > 0) {
      const offeringResult = await query(
        `SELECT
           cc.course_id,
           cc.id AS offering_id,
           cp.id AS campus_id,
           cp.name AS campus_name,
           cc.modality,
           cc.monthly_fee,
           cc.capacity,
           cc.schedule_info,
           cc.is_active
         FROM course_campus cc
         JOIN campuses cp ON cp.id = cc.campus_id
         WHERE cc.course_id = ANY($1::bigint[])
           AND ($2::bigint IS NULL OR cc.campus_id = $2)
           AND ($3::bigint IS NULL OR cc.campus_id = $3)
         ORDER BY cp.name`,
        [courseIds, campusScopeId, requestedCampusId],
      );

      for (const row of offeringResult.rows) {
        const key = Number(row.course_id);
        if (!offeringsByCourseId.has(key)) {
          offeringsByCourseId.set(key, []);
        }
        offeringsByCourseId.get(key).push({
          offering_id: Number(row.offering_id),
          campus_id: Number(row.campus_id),
          campus_name: row.campus_name,
          modality: row.modality,
          monthly_fee: row.monthly_fee,
          capacity: row.capacity,
          schedule_info: row.schedule_info,
          is_active: row.is_active,
        });
      }
    }

    const items = courseRows.map((row) => ({
      ...row,
      offerings: offeringsByCourseId.get(Number(row.id)) || [],
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

router.post(
  '/',
  authorizePermission('courses.manage'),
  validate(courseSchema),
  asyncHandler(async (req, res) => {
    const { name, description = null, duration_hours, passing_grade = 11, is_active = true } =
      req.validated.body;

    const { rows } = await query(
      `INSERT INTO courses (name, description, duration_hours, passing_grade, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, description, duration_hours, passing_grade, is_active, created_at`,
      [name, description, duration_hours, passing_grade, is_active],
    );

    invalidateCourseReadCaches();
    return res.status(201).json({ message: 'Curso creado.', item: rows[0] });
  }),
);

router.put(
  '/:id',
  authorizePermission('courses.manage'),
  validate(
    z.object({
      body: courseSchema.shape.body,
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const { name, description = null, duration_hours, passing_grade = 11, is_active = true } =
      req.validated.body;

    const { rows } = await query(
      `UPDATE courses
       SET name = $1,
           description = $2,
           duration_hours = $3,
           passing_grade = $4,
           is_active = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, name, description, duration_hours, passing_grade, is_active, created_at, updated_at`,
      [name, description, duration_hours, passing_grade, is_active, id],
    );

    if (rows.length === 0) {
      throw new ApiError(404, 'Curso no encontrado.');
    }

    invalidateCourseReadCaches();
    return res.json({ message: 'Curso actualizado.', item: rows[0] });
  }),
);

router.delete(
  '/:id',
  authorizePermission('courses.manage'),
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;

    try {
      const result = await query('DELETE FROM courses WHERE id = $1', [id]);
      if (result.rowCount === 0) {
        throw new ApiError(404, 'Curso no encontrado.');
      }
    } catch (error) {
      if (error.code === '23503') {
        throw new ApiError(409, 'No se puede eliminar el curso porque tiene registros relacionados.');
      }
      throw error;
    }

    invalidateCourseReadCaches();
    return res.json({ message: 'Curso eliminado.' });
  }),
);

router.post(
  '/:id/offerings',
  authorizePermission('courses.manage'),
  validate(offeringSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const {
      campus_id,
      modality = 'PRESENCIAL',
      monthly_fee,
      capacity = null,
      schedule_info = null,
    } = req.validated.body;

    const { rows } = await query(
      `INSERT INTO course_campus (course_id, campus_id, modality, monthly_fee, capacity, schedule_info)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, course_id, campus_id, modality, monthly_fee, capacity, schedule_info, is_active`,
      [id, campus_id, modality, monthly_fee, capacity, schedule_info],
    );

    invalidateCourseReadCaches();
    return res.status(201).json({ message: 'Oferta de curso creada.', item: rows[0] });
  }),
);

router.put(
  '/offerings/:offeringId',
  authorizePermission('courses.manage'),
  validate(
    z.object({
      body: z.object({
        campus_id: z.number().int().positive().optional(),
        modality: z.enum(['PRESENCIAL', 'VIRTUAL', 'HIBRIDO']).optional(),
        monthly_fee: z.number().nonnegative(),
        capacity: z.number().int().positive().nullable().optional(),
        schedule_info: z.string().max(240).nullable().optional(),
        is_active: z.boolean().optional(),
      }),
      params: z.object({ offeringId: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { offeringId } = req.validated.params;
    const {
      campus_id,
      modality,
      monthly_fee,
      capacity = null,
      schedule_info = null,
      is_active = true,
    } = req.validated.body;

    const { rows } = await query(
      `UPDATE course_campus
       SET campus_id = COALESCE($1, campus_id),
           modality = COALESCE($2, modality),
           monthly_fee = $3,
           capacity = $4,
           schedule_info = $5,
           is_active = $6,
           updated_at = NOW()
       WHERE id = $7
       RETURNING id, course_id, campus_id, modality, monthly_fee, capacity, schedule_info, is_active, updated_at`,
      [campus_id || null, modality || null, monthly_fee, capacity, schedule_info, is_active, offeringId],
    );

    if (rows.length === 0) {
      throw new ApiError(404, 'Oferta no encontrada.');
    }

    invalidateCourseReadCaches();
    return res.json({ message: 'Oferta actualizada.', item: rows[0] });
  }),
);

router.delete(
  '/offerings/:offeringId',
  authorizePermission('courses.manage'),
  validate(
    z.object({
      body: z.object({}).optional(),
      params: z.object({ offeringId: z.coerce.number().int().positive() }),
      query: z.object({}).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { offeringId } = req.validated.params;

    try {
      const result = await query('DELETE FROM course_campus WHERE id = $1', [offeringId]);
      if (result.rowCount === 0) {
        throw new ApiError(404, 'Oferta no encontrada.');
      }
    } catch (error) {
      if (error.code === '23503') {
        throw new ApiError(409, 'No se puede eliminar la oferta porque tiene registros relacionados.');
      }
      throw error;
    }

    invalidateCourseReadCaches();
    return res.json({ message: 'Oferta eliminada.' });
  }),
);

module.exports = router;
