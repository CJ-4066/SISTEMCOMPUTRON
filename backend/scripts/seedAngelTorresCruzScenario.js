const bcrypt = require('bcryptjs');
const { withTransaction, pool } = require('../src/config/db');

const DEMO_TAG = 'ATC-DEMO';
const STUDENT_PROFILE = {
  firstName: 'Angel',
  lastName: 'Torres Cruz',
  email: 'angel.torres.cruz@alumno.local',
  password: 'Alumno123!',
  birthDate: '2005-06-12',
  phone: '987654321',
  address: 'Av. Los Laureles 145, Lima',
};

const COURSE_BLUEPRINTS = [
  { name: 'Ofimatica Integral ATC-DEMO', area: 'Ofimatica' },
  { name: 'Excel Avanzado ATC-DEMO', area: 'Excel' },
  { name: 'Programacion Web ATC-DEMO', area: 'Programacion' },
  { name: 'Marketing Digital ATC-DEMO', area: 'Marketing' },
];

const WEEK_DAYS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'];
const MODALITIES = ['PRESENCIAL', 'VIRTUAL', 'HIBRIDO'];
const PAYMENT_METHODS = ['YAPE', 'TRANSFERENCIA', 'QR', 'EFECTIVO'];

const randomItem = (items) => items[Math.floor(Math.random() * items.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pad = (value) => String(value).padStart(2, '0');

const toDateIso = (date) => new Date(date).toISOString().slice(0, 10);

const addDays = (date, days) => {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
};

const addMonthsSafe = (date, months) => {
  const base = new Date(date);
  const day = base.getDate();
  base.setMonth(base.getMonth() + months);
  if (base.getDate() < day) base.setDate(0);
  return base;
};

const sixMonthsAgoDate = () => addMonthsSafe(new Date(), -6);

const scheduleToTime = (schedule) => {
  const match = schedule.match(/^([A-Z]{3})\s+(\d{2}:\d{2})-(\d{2}:\d{2})\s+\|\s+(.+)$/);
  if (!match) {
    return {
      day: 'LUN',
      start: '08:00',
      end: '10:00',
      room: 'Salon A-101',
    };
  }
  return {
    day: match[1],
    start: match[2],
    end: match[3],
    room: match[4],
  };
};

const buildRandomSchedule = (modality) => {
  const day = randomItem(WEEK_DAYS);
  const startHour = randomItem([8, 10, 14, 16, 18]);
  const endHour = startHour + randomItem([2, 3]);
  const room =
    modality === 'VIRTUAL'
      ? `Aula Virtual ${randomInt(1, 8)}`
      : `Salon ${randomItem(['A', 'B', 'C'])}-${randomInt(101, 420)}`;
  return `${day} ${pad(startHour)}:00-${pad(endHour)}:00 | ${room}`;
};

const dayToJsDay = {
  DOM: 0,
  LUN: 1,
  MAR: 2,
  MIE: 3,
  JUE: 4,
  VIE: 5,
  SAB: 6,
};

const nextDateByDay = (dayCode, offsetWeeks = 0) => {
  const today = new Date();
  const target = dayToJsDay[dayCode] ?? 1;
  const copy = new Date(today);
  const delta = (target - copy.getDay() + 7) % 7;
  copy.setDate(copy.getDate() + delta + offsetWeeks * 7);
  return copy;
};

const resolveActorUser = async (tx) => {
  const admin = await tx.query(
    `SELECT u.id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.name = 'ADMIN'
     ORDER BY u.id
     LIMIT 1`,
  );
  if (admin.rowCount) return Number(admin.rows[0].id);

  const fallback = await tx.query('SELECT id FROM users ORDER BY id LIMIT 1');
  return fallback.rowCount ? Number(fallback.rows[0].id) : null;
};

const ensureRoleId = async (tx, roleName) => {
  const result = await tx.query(`SELECT id FROM roles WHERE name = $1 LIMIT 1`, [roleName]);
  if (!result.rowCount) throw new Error(`No existe el rol requerido: ${roleName}`);
  return Number(result.rows[0].id);
};

const ensureConceptId = async (tx, conceptName, description) => {
  const result = await tx.query(
    `INSERT INTO payment_concepts (name, description)
     VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE
     SET description = EXCLUDED.description
     RETURNING id`,
    [conceptName, description],
  );
  return Number(result.rows[0].id);
};

const resolveCampus = async (tx) => {
  const preferred = await tx.query(
    `SELECT id, name
     FROM campuses
     WHERE name = 'Lima - Lima'
     LIMIT 1`,
  );
  if (preferred.rowCount) {
    return { id: Number(preferred.rows[0].id), name: preferred.rows[0].name };
  }

  const fallback = await tx.query(`SELECT id, name FROM campuses ORDER BY id LIMIT 1`);
  if (!fallback.rowCount) throw new Error('No hay sedes registradas.');
  return { id: Number(fallback.rows[0].id), name: fallback.rows[0].name };
};

const resolveActivePeriod = async (tx) => {
  const period = await tx.query(
    `SELECT id, name
     FROM academic_periods
     WHERE is_active = TRUE
     ORDER BY end_date DESC, id DESC
     LIMIT 1`,
  );
  if (!period.rowCount) throw new Error('No hay periodos activos disponibles.');
  return { id: Number(period.rows[0].id), name: period.rows[0].name };
};

const resolveTeachers = async (tx, campusId, count) => {
  const campusTeachers = await tx.query(
    `SELECT u.id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.name = 'DOCENTE'
       AND u.is_active = TRUE
       AND (u.base_campus_id = $1 OR u.base_campus_id IS NULL)
     ORDER BY u.base_campus_id DESC NULLS LAST, u.id ASC
     LIMIT $2`,
    [campusId, count],
  );

  if (campusTeachers.rowCount >= count) {
    return campusTeachers.rows.map((row) => Number(row.id));
  }

  const fallbackTeachers = await tx.query(
    `SELECT u.id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.name = 'DOCENTE'
       AND u.is_active = TRUE
     ORDER BY u.id ASC
     LIMIT $1`,
    [count],
  );

  if (!fallbackTeachers.rowCount) {
    throw new Error('No hay docentes activos para crear asignaciones.');
  }

  return fallbackTeachers.rows.map((row) => Number(row.id));
};

const resolveDocumentNumber = async (tx, preferredStart = 78000001) => {
  let current = preferredStart;
  while (current <= 79999999) {
    const exists = await tx.query(`SELECT id FROM students WHERE document_number = $1 LIMIT 1`, [String(current)]);
    if (!exists.rowCount) return String(current);
    current += 1;
  }
  throw new Error('No se pudo encontrar un documento libre para el alumno.');
};

const ensureStudentUser = async (tx, campusId, alumnoRoleId) => {
  const passwordHash = await bcrypt.hash(STUDENT_PROFILE.password, 12);
  const existingUser = await tx.query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [STUDENT_PROFILE.email]);

  let userId = null;
  if (existingUser.rowCount) {
    userId = Number(existingUser.rows[0].id);
    await tx.query(
      `UPDATE users
       SET first_name = $1,
           last_name = $2,
           password_hash = $3,
           base_campus_id = $4,
           is_active = TRUE,
           updated_at = NOW()
       WHERE id = $5`,
      [STUDENT_PROFILE.firstName, STUDENT_PROFILE.lastName, passwordHash, campusId, userId],
    );
  } else {
    const created = await tx.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, base_campus_id, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id`,
      [
        STUDENT_PROFILE.firstName,
        STUDENT_PROFILE.lastName,
        STUDENT_PROFILE.email,
        passwordHash,
        campusId,
      ],
    );
    userId = Number(created.rows[0].id);
  }

  await tx.query(
    `INSERT INTO user_roles (user_id, role_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, alumnoRoleId],
  );

  return userId;
};

const ensureStudentEntity = async (tx, userId, actorUserId) => {
  let studentResult = await tx.query(
    `SELECT id, document_number
     FROM students
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );

  if (!studentResult.rowCount) {
    studentResult = await tx.query(
      `SELECT id, document_number, user_id
       FROM students
       WHERE first_name = $1
         AND last_name = $2
       ORDER BY id DESC
       LIMIT 1`,
      [STUDENT_PROFILE.firstName, STUDENT_PROFILE.lastName],
    );
  }

  let studentId = null;
  let documentNumber = null;

  if (studentResult.rowCount) {
    studentId = Number(studentResult.rows[0].id);
    documentNumber = String(studentResult.rows[0].document_number);
    await tx.query(
      `UPDATE students
       SET first_name = $1,
           last_name = $2,
           email = $3,
           phone = $4,
           address = $5,
           birth_date = $6,
           user_id = $7,
           status = 'ACTIVE',
           updated_at = NOW()
       WHERE id = $8`,
      [
        STUDENT_PROFILE.firstName,
        STUDENT_PROFILE.lastName,
        STUDENT_PROFILE.email,
        STUDENT_PROFILE.phone,
        STUDENT_PROFILE.address,
        STUDENT_PROFILE.birthDate,
        userId,
        studentId,
      ],
    );
  } else {
    documentNumber = await resolveDocumentNumber(tx);
    const created = await tx.query(
      `INSERT INTO students (
         first_name, last_name, document_number, birth_date, email, phone, address, user_id, created_by, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE')
       RETURNING id`,
      [
        STUDENT_PROFILE.firstName,
        STUDENT_PROFILE.lastName,
        documentNumber,
        STUDENT_PROFILE.birthDate,
        STUDENT_PROFILE.email,
        STUDENT_PROFILE.phone,
        STUDENT_PROFILE.address,
        userId,
        actorUserId,
      ],
    );
    studentId = Number(created.rows[0].id);
  }

  return { studentId, documentNumber };
};

const ensureGuardian = async (tx, studentId) => {
  const guardianEmail = 'maria.torres.cruz.apoderado@alumno.local';
  let guardian = await tx.query(`SELECT id FROM guardians WHERE email = $1 LIMIT 1`, [guardianEmail]);
  if (!guardian.rowCount) {
    guardian = await tx.query(
      `INSERT INTO guardians (first_name, last_name, email, phone, document_number)
       VALUES ('Maria Elena', 'Torres Cruz', $1, '977665544', '74125478')
       RETURNING id`,
      [guardianEmail],
    );
  }

  const guardianId = Number(guardian.rows[0].id);
  await tx.query(
    `INSERT INTO student_guardian (student_id, guardian_id, relationship)
     VALUES ($1, $2, 'MADRE')
     ON CONFLICT (student_id, guardian_id)
     DO UPDATE SET relationship = EXCLUDED.relationship`,
    [studentId, guardianId],
  );
};

const ensureCoursesAssignmentsAndCalendar = async ({
  tx,
  campus,
  period,
  teacherIds,
  actorUserId,
}) => {
  const results = [];

  for (let i = 0; i < COURSE_BLUEPRINTS.length; i += 1) {
    const blueprint = COURSE_BLUEPRINTS[i];
    const modality = randomItem(MODALITIES);
    const scheduleInfo = buildRandomSchedule(modality);
    const monthlyFee = randomInt(180, 340);
    const duration = randomItem([48, 60, 72]);

    const courseUpsert = await tx.query(
      `INSERT INTO courses (name, description, duration_hours, passing_grade, is_active)
       VALUES ($1, $2, $3, 11, TRUE)
       ON CONFLICT (name)
       DO UPDATE SET
         description = EXCLUDED.description,
         duration_hours = EXCLUDED.duration_hours,
         is_active = TRUE,
         updated_at = NOW()
       RETURNING id, name`,
      [blueprint.name, `${blueprint.area} aplicado para pruebas del alumno ${DEMO_TAG}`, duration],
    );

    const courseId = Number(courseUpsert.rows[0].id);
    const courseName = courseUpsert.rows[0].name;

    const offeringUpsert = await tx.query(
      `INSERT INTO course_campus (course_id, campus_id, modality, monthly_fee, capacity, schedule_info, is_active)
       VALUES ($1, $2, $3, $4, 30, $5, TRUE)
       ON CONFLICT (course_id, campus_id)
       DO UPDATE SET
         modality = EXCLUDED.modality,
         monthly_fee = EXCLUDED.monthly_fee,
         capacity = EXCLUDED.capacity,
         schedule_info = EXCLUDED.schedule_info,
         is_active = TRUE,
         updated_at = NOW()
       RETURNING id, schedule_info, modality, monthly_fee`,
      [courseId, campus.id, modality, monthlyFee, scheduleInfo],
    );

    const offeringId = Number(offeringUpsert.rows[0].id);
    const teacherId = teacherIds[i % teacherIds.length];

    const assignmentUpsert = await tx.query(
      `INSERT INTO teacher_assignments (
         teacher_user_id, course_campus_id, period_id, schedule_info, status, created_by
       )
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)
       ON CONFLICT (teacher_user_id, course_campus_id, period_id)
       DO UPDATE SET
         schedule_info = EXCLUDED.schedule_info,
         status = 'ACTIVE',
         updated_at = NOW()
       RETURNING id, teacher_user_id, course_campus_id, schedule_info`,
      [teacherId, offeringId, period.id, scheduleInfo, actorUserId],
    );

    const assignment = assignmentUpsert.rows[0];
    const assignmentId = Number(assignment.id);

    await tx.query(
      `DELETE FROM teacher_calendar_events
       WHERE assignment_id = $1
         AND notes LIKE $2`,
      [assignmentId, `%[${DEMO_TAG}]%`],
    );

    const parsed = scheduleToTime(String(assignment.schedule_info || scheduleInfo));
    for (let week = 0; week < 3; week += 1) {
      const eventDate = toDateIso(nextDateByDay(parsed.day, week));
      await tx.query(
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
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PROGRAMADA', $10)`,
        [
          Number(assignment.teacher_user_id),
          assignmentId,
          offeringId,
          `${courseName} - Clase programada`,
          eventDate,
          parsed.start,
          parsed.end,
          parsed.room,
          `Clase generada para pruebas del alumno [${DEMO_TAG}]`,
          actorUserId,
        ],
      );
    }

    results.push({
      courseId,
      courseName,
      offeringId,
      assignmentId,
      teacherUserId: Number(assignment.teacher_user_id),
      scheduleInfo: String(assignment.schedule_info || scheduleInfo),
      monthlyFee: Number(offeringUpsert.rows[0].monthly_fee),
    });
  }

  return results;
};

const ensureEnrollments = async ({ tx, studentId, periodId, offerings, actorUserId, enrollmentDate }) => {
  const enrollmentRows = [];

  for (const offering of offerings) {
    const inserted = await tx.query(
      `INSERT INTO enrollments (
         student_id, course_campus_id, period_id, enrollment_date, status, created_by
       )
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)
       ON CONFLICT (student_id, course_campus_id, period_id)
       DO UPDATE SET
         enrollment_date = EXCLUDED.enrollment_date,
         status = 'ACTIVE',
         updated_at = NOW()
       RETURNING id, student_id, course_campus_id, period_id, enrollment_date`,
      [studentId, offering.offeringId, periodId, enrollmentDate, actorUserId],
    );

    enrollmentRows.push({
      ...offering,
      enrollmentId: Number(inserted.rows[0].id),
      enrollmentDate: inserted.rows[0].enrollment_date,
    });
  }

  return enrollmentRows;
};

const recreateAssessmentsAndGrades = async ({ tx, studentId, enrollments, periodId }) => {
  const offeringIds = enrollments.map((row) => row.offeringId);
  await tx.query(
    `DELETE FROM assessments
     WHERE period_id = $1
       AND course_campus_id = ANY($2::bigint[])
       AND title LIKE $3`,
    [periodId, offeringIds, `%[${DEMO_TAG}]%`],
  );

  let assessmentsCreated = 0;
  let gradesCreated = 0;

  for (const enrollment of enrollments) {
    const assessmentDate = toDateIso(addDays(new Date(), -randomInt(15, 45)));
    const assessment = await tx.query(
      `INSERT INTO assessments (course_campus_id, period_id, title, assessment_date, weight, created_by)
       VALUES ($1, $2, $3, $4, 30, $5)
       RETURNING id`,
      [
        enrollment.offeringId,
        periodId,
        `Evaluacion continua - ${enrollment.courseName} [${DEMO_TAG}]`,
        assessmentDate,
        enrollment.teacherUserId,
      ],
    );
    assessmentsCreated += 1;

    await tx.query(
      `INSERT INTO grades (assessment_id, student_id, score, recorded_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (assessment_id, student_id)
       DO UPDATE SET
         score = EXCLUDED.score,
         recorded_by = EXCLUDED.recorded_by,
         recorded_at = NOW()`,
      [Number(assessment.rows[0].id), studentId, randomInt(13, 19), enrollment.teacherUserId],
    );
    gradesCreated += 1;
  }

  return { assessmentsCreated, gradesCreated };
};

const recreateFinancialData = async ({
  tx,
  studentId,
  enrollments,
  actorUserId,
  enrollmentDate,
  matriculaConceptId,
  mensualidadConceptId,
}) => {
  await tx.query(
    `DELETE FROM payments
     WHERE student_id = $1
       AND reference_code LIKE $2`,
    [studentId, `${DEMO_TAG}-%`],
  );

  const enrollmentIds = enrollments.map((row) => row.enrollmentId);
  await tx.query(
    `DELETE FROM installments
     WHERE enrollment_id = ANY($1::bigint[])
       AND description LIKE $2`,
    [enrollmentIds, `%[${DEMO_TAG}]%`],
  );

  let installmentsCreated = 0;
  let paymentsCreated = 0;
  let pendingInstallments = 0;
  let paymentSeq = 1;
  let pendingInstallmentInfo = null;

  for (let enrollmentIndex = 0; enrollmentIndex < enrollments.length; enrollmentIndex += 1) {
    const enrollment = enrollments[enrollmentIndex];
    const monthlyAmount = Math.max(120, Math.round(Number(enrollment.monthlyFee || 180)));
    const matriculaAmount = Math.round(monthlyAmount * 0.65);

    const installmentsPlan = [
      {
        conceptId: matriculaConceptId,
        label: 'Matricula',
        dueDate: enrollmentDate,
        amount: matriculaAmount,
      },
      ...Array.from({ length: 6 }, (_, idx) => ({
        conceptId: mensualidadConceptId,
        label: `Mensualidad ${idx + 1}`,
        dueDate: toDateIso(addMonthsSafe(new Date(enrollmentDate), idx + 1)),
        amount: monthlyAmount,
      })),
    ];

    for (let idx = 0; idx < installmentsPlan.length; idx += 1) {
      const plan = installmentsPlan[idx];
      const isPending =
        pendingInstallments === 0 &&
        enrollmentIndex === 0 &&
        plan.label === 'Mensualidad 6';
      const paidAmount = isPending ? 0 : plan.amount;
      const installmentStatus = isPending ? 'PENDING' : 'PAID';

      const installmentInsert = await tx.query(
        `INSERT INTO installments (
           enrollment_id, concept_id, description, due_date, total_amount, paid_amount, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, due_date, total_amount, status`,
        [
          enrollment.enrollmentId,
          plan.conceptId,
          `${plan.label} - ${enrollment.courseName} [${DEMO_TAG}]`,
          plan.dueDate,
          plan.amount,
          paidAmount,
          installmentStatus,
        ],
      );
      installmentsCreated += 1;

      if (isPending) {
        pendingInstallments += 1;
        pendingInstallmentInfo = {
          installmentId: Number(installmentInsert.rows[0].id),
          dueDate: installmentInsert.rows[0].due_date,
          amount: Number(installmentInsert.rows[0].total_amount),
          courseName: enrollment.courseName,
        };
        continue;
      }

      const dueDate = new Date(plan.dueDate);
      const paymentDate = toDateIso(addDays(dueDate, randomInt(-3, 4)));
      const referenceCode = `${DEMO_TAG}-${Date.now()}-${paymentSeq++}`;
      const method = randomItem(PAYMENT_METHODS);

      const paymentInsert = await tx.query(
        `INSERT INTO payments (
           student_id,
           enrollment_id,
           total_amount,
           payment_date,
           method,
           reference_code,
           status,
           processed_by,
           notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', $7, $8)
         RETURNING id`,
        [
          studentId,
          enrollment.enrollmentId,
          plan.amount,
          paymentDate,
          method,
          referenceCode,
          actorUserId,
          `Pago generado automaticamente [${DEMO_TAG}]`,
        ],
      );

      const paymentId = Number(paymentInsert.rows[0].id);
      await tx.query(
        `INSERT INTO payment_details (payment_id, installment_id, amount)
         VALUES ($1, $2, $3)`,
        [paymentId, Number(installmentInsert.rows[0].id), plan.amount],
      );

      await tx.query(
        `INSERT INTO payment_audit (payment_id, old_status, new_status, method, changed_by, notes)
         VALUES ($1, NULL, 'COMPLETED', $2, $3, $4)`,
        [paymentId, method, actorUserId, `Registro automatico [${DEMO_TAG}]`],
      );

      paymentsCreated += 1;
    }
  }

  return {
    installmentsCreated,
    paymentsCreated,
    pendingInstallments,
    pendingInstallmentInfo,
  };
};

const run = async () => {
  const summary = await withTransaction(async (tx) => {
    const [alumnoRoleId, actorUserId, campus, period] = await Promise.all([
      ensureRoleId(tx, 'ALUMNO'),
      resolveActorUser(tx),
      resolveCampus(tx),
      resolveActivePeriod(tx),
    ]);

    if (!actorUserId) {
      throw new Error('No existe usuario actor para registrar trazabilidad.');
    }

    const teacherIds = await resolveTeachers(tx, campus.id, COURSE_BLUEPRINTS.length);
    const userId = await ensureStudentUser(tx, campus.id, alumnoRoleId);
    const { studentId, documentNumber } = await ensureStudentEntity(tx, userId, actorUserId);
    await ensureGuardian(tx, studentId);

    const offerings = await ensureCoursesAssignmentsAndCalendar({
      tx,
      campus,
      period,
      teacherIds,
      actorUserId,
    });

    const enrollmentDate = toDateIso(sixMonthsAgoDate());
    const enrollments = await ensureEnrollments({
      tx,
      studentId,
      periodId: period.id,
      offerings,
      actorUserId,
      enrollmentDate,
    });

    const [matriculaConceptId, mensualidadConceptId] = await Promise.all([
      ensureConceptId(tx, 'MATRICULA', 'Pago de matricula'),
      ensureConceptId(tx, 'MENSUALIDAD', 'Pago mensual del curso'),
    ]);

    const gradesSummary = await recreateAssessmentsAndGrades({
      tx,
      studentId,
      enrollments,
      periodId: period.id,
    });

    const financialSummary = await recreateFinancialData({
      tx,
      studentId,
      enrollments,
      actorUserId,
      enrollmentDate,
      matriculaConceptId,
      mensualidadConceptId,
    });

    return {
      student: {
        id: studentId,
        user_id: userId,
        full_name: `${STUDENT_PROFILE.firstName} ${STUDENT_PROFILE.lastName}`,
        document_number: documentNumber,
        email: STUDENT_PROFILE.email,
        password: STUDENT_PROFILE.password,
      },
      campus: campus.name,
      period: period.name,
      enrollment_date: enrollmentDate,
      courses: enrollments.map((row) => ({
        course: row.courseName,
        assignment_id: row.assignmentId,
        schedule: row.scheduleInfo,
      })),
      totals: {
        courses_assigned: enrollments.length,
        assessments_created: gradesSummary.assessmentsCreated,
        grades_created: gradesSummary.gradesCreated,
        installments_created: financialSummary.installmentsCreated,
        payments_created: financialSummary.paymentsCreated,
        pending_installments: financialSummary.pendingInstallments,
      },
      pending_installment: financialSummary.pendingInstallmentInfo,
    };
  });

  console.log('SCENARIO_OK');
  console.log(JSON.stringify(summary, null, 2));
};

run()
  .catch((error) => {
    console.error('SCENARIO_ERROR', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
