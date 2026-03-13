const bcrypt = require('bcryptjs');
const { query, withTransaction, pool } = require('../src/config/db');

const STUDENTS_PER_CAMPUS = 200;
const GUARDIANS_PER_CAMPUS = 200;
const COURSES_PER_CAMPUS = 20;
const TEACHERS_PER_CAMPUS = 2;
const ASSESSMENTS_PER_COURSE = 2;

const DOCENTE_ROLE = 'DOCENTE';
const ALUMNO_ROLE = 'ALUMNO';

const TEACHER_PASSWORD = 'Docente123!';
const STUDENT_PASSWORD = 'Alumno123!';

const DAYS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
const MODALITIES = ['PRESENCIAL', 'VIRTUAL', 'HIBRIDO'];

const FIRST_NAMES = [
  'Andrea',
  'Luis',
  'Camila',
  'Jose',
  'Diana',
  'Carlos',
  'Valeria',
  'Miguel',
  'Sofia',
  'Renato',
  'Lucia',
  'Fabian',
  'Fernanda',
  'Gabriel',
  'Ximena',
];

const LAST_NAMES = [
  'Lopez',
  'Ramirez',
  'Garcia',
  'Flores',
  'Rojas',
  'Quispe',
  'Sanchez',
  'Torres',
  'Guzman',
  'Medina',
  'Mendoza',
  'Castro',
  'Vargas',
  'Paredes',
  'Alarcon',
];

const GUARDIAN_RELATIONSHIPS = ['MADRE', 'PADRE', 'TUTOR', 'APODERADO'];
const COURSE_AREAS = [
  'Ofimatica',
  'Contabilidad',
  'Programacion',
  'Excel',
  'Marketing',
  'Diseño',
  'Redes',
  'Ingles',
  'Soporte',
  'BaseDatos',
];

const randomItem = (items) => items[Math.floor(Math.random() * items.length)];

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const pad = (value, size = 2) => String(value).padStart(size, '0');

const toDateIso = (date) => new Date(date).toISOString().slice(0, 10);

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const getWeekDatesIncludingToday = () => {
  const today = new Date();
  const dates = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    dates.push(toDateIso(addDays(today, -offset)));
  }
  return dates;
};

const randomAttendanceStatus = () => {
  const n = Math.random();
  if (n < 0.78) return 'PRESENTE';
  if (n < 0.88) return 'AUSENTE';
  if (n < 0.95) return 'JUSTIFICADO';
  return 'FALTO';
};

const buildSchedule = () => {
  const day = randomItem(DAYS);
  const startHour = randomInt(7, 19);
  const duration = randomItem([2, 3]);
  const endHour = Math.min(22, startHour + duration);
  const roomPrefix = randomItem(['A', 'B', 'C', 'V']);
  const roomNumber = randomInt(101, 420);
  const room = roomPrefix === 'V' ? `Aula Virtual ${randomInt(1, 8)}` : `Salon ${roomPrefix}-${roomNumber}`;
  return `${day} ${pad(startHour)}:00-${pad(endHour)}:00 | ${room}`;
};

const chunk = (items, size) => {
  const output = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
};

const bulkInsert = async ({
  tx,
  table,
  columns,
  rows,
  returning = '',
  onConflict = '',
}) => {
  if (!rows.length) return { rows: [], rowCount: 0 };

  const values = rows.flat();
  const cols = columns.length;
  const placeholders = rows
    .map((_, rowIndex) => {
      const base = rowIndex * cols;
      const params = columns.map((__col, colIndex) => `$${base + colIndex + 1}`);
      return `(${params.join(', ')})`;
    })
    .join(', ');

  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders} ${onConflict} ${returning}`.trim();
  return tx.query(sql, values);
};

const ensureRequiredData = async () => {
  const [campusResult, periodResult, roleResult] = await Promise.all([
    query('SELECT id, name FROM campuses ORDER BY id'),
    query(
      `SELECT id, name
       FROM academic_periods
       WHERE is_active = TRUE
       ORDER BY id DESC
       LIMIT 1`,
    ),
    query(
      `SELECT id, name
       FROM roles
       WHERE name = ANY($1::text[])`,
      [[DOCENTE_ROLE, ALUMNO_ROLE]],
    ),
  ]);

  if (campusResult.rowCount === 0) {
    throw new Error('No hay sedes registradas.');
  }

  if (periodResult.rowCount === 0) {
    throw new Error('No hay periodos activos para generar matriculas y evaluaciones.');
  }

  const roleMap = new Map(roleResult.rows.map((row) => [row.name, Number(row.id)]));
  if (!roleMap.get(DOCENTE_ROLE) || !roleMap.get(ALUMNO_ROLE)) {
    throw new Error(`Faltan roles requeridos: ${DOCENTE_ROLE} y/o ${ALUMNO_ROLE}.`);
  }

  const adminUserResult = await query(
    `SELECT u.id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.name = 'ADMIN'
     ORDER BY u.id
     LIMIT 1`,
  );

  const fallbackUserResult = await query(`SELECT id FROM users ORDER BY id LIMIT 1`);

  return {
    campuses: campusResult.rows.map((row) => ({ id: Number(row.id), name: row.name })),
    periodId: Number(periodResult.rows[0].id),
    periodName: periodResult.rows[0].name,
    docenteRoleId: roleMap.get(DOCENTE_ROLE),
    alumnoRoleId: roleMap.get(ALUMNO_ROLE),
    actorUserId: adminUserResult.rows[0]?.id ? Number(adminUserResult.rows[0].id) : Number(fallbackUserResult.rows[0]?.id || 0) || null,
  };
};

const generateCampusPayload = ({
  campus,
  batchTag,
  periodId,
}) => {
  const today = new Date();
  const enrollmentDate = toDateIso(today);
  const weekDates = getWeekDatesIncludingToday();
  const futureDates = [toDateIso(addDays(today, 3)), toDateIso(addDays(today, 10))];

  const teachers = Array.from({ length: TEACHERS_PER_CAMPUS }, (_, idx) => {
    const n = idx + 1;
    return {
      firstName: `Docente${pad(campus.id)}${n}`,
      lastName: `Sede${pad(campus.id)}`,
      email: `docente.${batchTag}.${campus.id}.${n}@computron.local`,
      baseCampusId: campus.id,
    };
  });

  const guardians = Array.from({ length: GUARDIANS_PER_CAMPUS }, (_, idx) => {
    const n = idx + 1;
    const firstName = randomItem(FIRST_NAMES);
    const lastName = randomItem(LAST_NAMES);
    return {
      firstName,
      lastName,
      email: `apoderado.${batchTag}.${campus.id}.${n}@computron.local`,
      phone: `9${pad(campus.id, 2)}${pad(n, 6)}`,
      document: `7${batchTag.slice(-4)}${pad(campus.id, 2)}${pad(n, 3)}`,
    };
  });

  const students = Array.from({ length: STUDENTS_PER_CAMPUS }, (_, idx) => {
    const n = idx + 1;
    const firstName = randomItem(FIRST_NAMES);
    const lastName = randomItem(LAST_NAMES);
    const document = `9${batchTag.slice(-4)}${pad(campus.id, 2)}${pad(n, 4)}`;
    return {
      firstName,
      lastName,
      email: `alumno.${batchTag}.${campus.id}.${n}@computron.local`,
      document,
      birthDate: toDateIso(addDays(today, -(17 * 365 + randomInt(0, 6 * 365)))),
      phone: `9${pad(campus.id, 2)}${pad(5000 + n, 6)}`,
      address: `Av. Principal ${n}, ${campus.name}`,
      enrollmentDate,
    };
  });

  const courses = Array.from({ length: COURSES_PER_CAMPUS }, (_, idx) => {
    const n = idx + 1;
    const area = randomItem(COURSE_AREAS);
    return {
      name: `${area} SEDE-${pad(campus.id)} LOTE-${batchTag}-${pad(n, 2)}`,
      description: `Curso generado para ${campus.name} (lote ${batchTag})`,
      durationHours: randomItem([36, 48, 60, 72, 84]),
      passingGrade: 11,
      monthlyFee: randomInt(120, 450),
      capacity: randomInt(20, 40),
      modality: randomItem(MODALITIES),
      scheduleInfo: buildSchedule(),
      assessmentDates: futureDates,
      periodId,
    };
  });

  return {
    teachers,
    guardians,
    students,
    courses,
    weekDates,
  };
};

const runCampusSeed = async ({
  campus,
  periodId,
  docenteRoleId,
  alumnoRoleId,
  actorUserId,
  teacherPasswordHash,
  studentPasswordHash,
  batchTag,
}) => {
  const payload = generateCampusPayload({ campus, batchTag, periodId });

  const created = await withTransaction(async (tx) => {
    const teacherUsersInsert = await bulkInsert({
      tx,
      table: 'users',
      columns: ['first_name', 'last_name', 'email', 'password_hash', 'base_campus_id'],
      rows: payload.teachers.map((item) => [
        item.firstName,
        item.lastName,
        item.email,
        teacherPasswordHash,
        item.baseCampusId,
      ]),
      returning: 'RETURNING id',
    });

    await bulkInsert({
      tx,
      table: 'user_roles',
      columns: ['user_id', 'role_id'],
      rows: teacherUsersInsert.rows.map((user) => [Number(user.id), docenteRoleId]),
      onConflict: 'ON CONFLICT DO NOTHING',
    });

    const guardianInsert = await bulkInsert({
      tx,
      table: 'guardians',
      columns: ['first_name', 'last_name', 'email', 'phone', 'document_number'],
      rows: payload.guardians.map((item) => [
        item.firstName,
        item.lastName,
        item.email,
        item.phone,
        item.document,
      ]),
      returning: 'RETURNING id',
    });

    const studentUsersInsert = await bulkInsert({
      tx,
      table: 'users',
      columns: ['first_name', 'last_name', 'email', 'password_hash', 'base_campus_id'],
      rows: payload.students.map((item) => [
        item.firstName,
        item.lastName,
        item.email,
        studentPasswordHash,
        campus.id,
      ]),
      returning: 'RETURNING id, email',
    });

    await bulkInsert({
      tx,
      table: 'user_roles',
      columns: ['user_id', 'role_id'],
      rows: studentUsersInsert.rows.map((user) => [Number(user.id), alumnoRoleId]),
      onConflict: 'ON CONFLICT DO NOTHING',
    });

    const studentInsert = await bulkInsert({
      tx,
      table: 'students',
      columns: [
        'first_name',
        'last_name',
        'document_number',
        'birth_date',
        'email',
        'phone',
        'address',
        'created_by',
        'user_id',
        'status',
      ],
      rows: payload.students.map((item, index) => [
        item.firstName,
        item.lastName,
        item.document,
        item.birthDate,
        item.email,
        item.phone,
        item.address,
        actorUserId,
        Number(studentUsersInsert.rows[index].id),
        'ACTIVE',
      ]),
      returning: 'RETURNING id',
    });

    await bulkInsert({
      tx,
      table: 'student_guardian',
      columns: ['student_id', 'guardian_id', 'relationship'],
      rows: studentInsert.rows.map((student, index) => [
        Number(student.id),
        Number(guardianInsert.rows[index].id),
        randomItem(GUARDIAN_RELATIONSHIPS),
      ]),
      onConflict: 'ON CONFLICT (student_id, guardian_id) DO UPDATE SET relationship = EXCLUDED.relationship',
    });

    const courseInsert = await bulkInsert({
      tx,
      table: 'courses',
      columns: ['name', 'description', 'duration_hours', 'passing_grade', 'is_active'],
      rows: payload.courses.map((course) => [
        course.name,
        course.description,
        course.durationHours,
        course.passingGrade,
        true,
      ]),
      returning: 'RETURNING id',
    });

    const offeringInsert = await bulkInsert({
      tx,
      table: 'course_campus',
      columns: ['course_id', 'campus_id', 'modality', 'monthly_fee', 'capacity', 'schedule_info', 'is_active'],
      rows: payload.courses.map((course, index) => [
        Number(courseInsert.rows[index].id),
        campus.id,
        course.modality,
        course.monthlyFee,
        course.capacity,
        course.scheduleInfo,
        true,
      ]),
      returning: 'RETURNING id, schedule_info',
    });

    const assignmentRows = offeringInsert.rows.map((offering, index) => {
      const teacherIndex = index % TEACHERS_PER_CAMPUS;
      const teacherUserId = Number(teacherUsersInsert.rows[teacherIndex].id);
      return [
        teacherUserId,
        Number(offering.id),
        periodId,
        offering.schedule_info || payload.courses[index].scheduleInfo,
        'ACTIVE',
        actorUserId,
      ];
    });

    await bulkInsert({
      tx,
      table: 'teacher_assignments',
      columns: ['teacher_user_id', 'course_campus_id', 'period_id', 'schedule_info', 'status', 'created_by'],
      rows: assignmentRows,
      onConflict: `ON CONFLICT (teacher_user_id, course_campus_id, period_id)
                   DO UPDATE SET
                     schedule_info = EXCLUDED.schedule_info,
                     status = EXCLUDED.status,
                     updated_at = NOW()`,
    });

    const enrollmentRows = studentInsert.rows.map((student, index) => {
      const offeringIndex = index % COURSES_PER_CAMPUS;
      return [
        Number(student.id),
        Number(offeringInsert.rows[offeringIndex].id),
        periodId,
        payload.students[index].enrollmentDate,
        'ACTIVE',
        actorUserId,
      ];
    });

    const enrollmentInsert = await bulkInsert({
      tx,
      table: 'enrollments',
      columns: ['student_id', 'course_campus_id', 'period_id', 'enrollment_date', 'status', 'created_by'],
      rows: enrollmentRows,
      returning: 'RETURNING id, course_campus_id',
      onConflict: `ON CONFLICT (student_id, course_campus_id, period_id)
                   DO UPDATE SET
                     status = EXCLUDED.status,
                     enrollment_date = EXCLUDED.enrollment_date,
                     updated_at = NOW()`,
    });

    const assessmentsRows = [];
    for (let courseIndex = 0; courseIndex < payload.courses.length; courseIndex += 1) {
      const course = payload.courses[courseIndex];
      const offeringId = Number(offeringInsert.rows[courseIndex].id);
      for (let assessmentIndex = 0; assessmentIndex < ASSESSMENTS_PER_COURSE; assessmentIndex += 1) {
        assessmentsRows.push([
          offeringId,
          course.periodId,
          `Evaluacion pendiente ${assessmentIndex + 1} - ${batchTag} - ${pad(courseIndex + 1, 2)}`,
          course.assessmentDates[assessmentIndex],
          assessmentIndex === 0 ? 40 : 60,
          actorUserId,
        ]);
      }
    }

    await bulkInsert({
      tx,
      table: 'assessments',
      columns: ['course_campus_id', 'period_id', 'title', 'assessment_date', 'weight', 'created_by'],
      rows: assessmentsRows,
    });

    const offeringTeacherMap = new Map(
      offeringInsert.rows.map((offering, index) => {
        const teacherIndex = index % TEACHERS_PER_CAMPUS;
        return [Number(offering.id), Number(teacherUsersInsert.rows[teacherIndex].id)];
      }),
    );

    const attendanceRows = [];
    for (const enrollment of enrollmentInsert.rows) {
      const enrollmentId = Number(enrollment.id);
      const offeringId = Number(enrollment.course_campus_id);
      const recorderUserId = offeringTeacherMap.get(offeringId) || actorUserId;

      for (const attendanceDate of payload.weekDates) {
        attendanceRows.push([
          enrollmentId,
          attendanceDate,
          randomAttendanceStatus(),
          recorderUserId,
          null,
        ]);
      }
    }

    for (const attendanceChunk of chunk(attendanceRows, 700)) {
      await bulkInsert({
        tx,
        table: 'attendances',
        columns: ['enrollment_id', 'attendance_date', 'status', 'recorded_by', 'notes'],
        rows: attendanceChunk,
        onConflict: `ON CONFLICT (enrollment_id, attendance_date)
                     DO UPDATE SET
                       status = EXCLUDED.status,
                       recorded_by = EXCLUDED.recorded_by,
                       notes = EXCLUDED.notes`,
      });
    }

    return {
      teachers: teacherUsersInsert.rowCount,
      guardians: guardianInsert.rowCount,
      students: studentInsert.rowCount,
      courses: courseInsert.rowCount,
      offerings: offeringInsert.rowCount,
      enrollments: enrollmentInsert.rowCount,
      assessments: assessmentsRows.length,
      attendances: attendanceRows.length,
      weekDates: payload.weekDates,
    };
  });

  return created;
};

const run = async () => {
  const batchTag = new Date().toISOString().replace(/\D/g, '').slice(2, 14);
  const { campuses, periodId, periodName, docenteRoleId, alumnoRoleId, actorUserId } =
    await ensureRequiredData();

  console.log('Seed masivo por sedes');
  console.log(`Lote: ${batchTag}`);
  console.log(`Periodo activo: ${periodName} (#${periodId})`);
  console.log(`Sedes: ${campuses.length}`);

  const [teacherPasswordHash, studentPasswordHash] = await Promise.all([
    bcrypt.hash(TEACHER_PASSWORD, 12),
    bcrypt.hash(STUDENT_PASSWORD, 12),
  ]);

  const totals = {
    teachers: 0,
    guardians: 0,
    students: 0,
    courses: 0,
    offerings: 0,
    enrollments: 0,
    assessments: 0,
    attendances: 0,
  };

  for (const campus of campuses) {
    const created = await runCampusSeed({
      campus,
      periodId,
      docenteRoleId,
      alumnoRoleId,
      actorUserId,
      teacherPasswordHash,
      studentPasswordHash,
      batchTag,
    });

    totals.teachers += created.teachers;
    totals.guardians += created.guardians;
    totals.students += created.students;
    totals.courses += created.courses;
    totals.offerings += created.offerings;
    totals.enrollments += created.enrollments;
    totals.assessments += created.assessments;
    totals.attendances += created.attendances;

    console.log(
      `[${campus.id}] ${campus.name} -> docentes:${created.teachers}, apoderados:${created.guardians}, alumnos:${created.students}, cursos:${created.courses}, matriculas:${created.enrollments}, evaluaciones:${created.assessments}, asistencias:${created.attendances}`,
    );
  }

  console.log('TOTAL_CREADO', totals);
  console.log('Credenciales docentes generadas:');
  console.log(`  password = ${TEACHER_PASSWORD}`);
  console.log('Credenciales alumnos generadas:');
  console.log(`  password = ${STUDENT_PASSWORD}`);
};

run()
  .catch((error) => {
    console.error('Error en seed masivo:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
