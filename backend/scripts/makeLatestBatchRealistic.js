const { query, withTransaction, pool } = require('../src/config/db');

const EMAIL_DOMAINS = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com'];

const STUDENT_NAMES = [
  'Luis', 'Carlos', 'Jorge', 'Renzo', 'Diego', 'Mateo', 'Bruno', 'Fabio', 'Kevin', 'Aldair',
  'Andrea', 'Camila', 'Valeria', 'Lucia', 'Daniela', 'Carla', 'Fiorella', 'Ximena', 'Nicole', 'Mia',
  'Jose', 'Miguel', 'Angel', 'Adrian', 'Sebastian', 'Victor', 'Alex', 'Santiago', 'Noa', 'Alvaro',
];

const GUARDIAN_NAMES = [
  'Rosa', 'Mariela', 'Carmen', 'Patricia', 'Silvia', 'Claudia', 'Veronica', 'Martha', 'Julia', 'Gloria',
  'Juan', 'Pedro', 'Javier', 'Raul', 'Manuel', 'Oscar', 'Hector', 'Ricardo', 'Edgar', 'Cesar',
];

const SURNAMES = [
  'Garcia', 'Lopez', 'Ramirez', 'Quispe', 'Torres', 'Sanchez', 'Rojas', 'Mendoza', 'Flores', 'Castro',
  'Vargas', 'Paredes', 'Huaman', 'Medina', 'Chavez', 'Salazar', 'Cruz', 'Palomino', 'Alarcon', 'Romero',
  'Gutierrez', 'Cordero', 'Mamani', 'Nunez', 'Valdez', 'Campos', 'Ayala', 'Rivas', 'Velasquez', 'Poma',
];

const STREET_TYPES = ['Av.', 'Jr.', 'Calle', 'Psje.'];
const STREET_NAMES = [
  'Los Laureles', 'San Martin', 'Micaela Bastidas', 'Tupac Amaru', 'Las Palmeras', 'Los Pinos',
  'Bolivar', 'Sucre', 'Miguel Grau', 'El Sol', 'Los Olivos', 'Primavera', 'Pachacutec', 'Union',
];

const COURSE_TEMPLATES = [
  'Excel Basico',
  'Excel Avanzado',
  'Ofimatica Profesional',
  'Auxiliar de Contabilidad',
  'Asistente Administrativo',
  'Diseño Grafico Digital',
  'Marketing Digital',
  'Programacion Web',
  'Soporte Tecnico de PC',
  'Redes y Cableado Estructurado',
  'Power BI Aplicado',
  'Ingles para Negocios',
  'Atencion al Cliente',
  'Logistica y Almacen',
  'Gestion de Planillas',
];

const ATTENDANCE_WEEK_DAYS = 7;

const randomItem = (items) => items[Math.floor(Math.random() * items.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

const toDateIso = (date) => new Date(date).toISOString().slice(0, 10);

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const weekDatesIncludingToday = () => {
  const today = new Date();
  const out = [];
  for (let i = ATTENDANCE_WEEK_DAYS - 1; i >= 0; i -= 1) {
    out.push(toDateIso(addDays(today, -i)));
  }
  return out;
};

const randomFullName = (namePool) => {
  const first = randomItem(namePool);
  const second = Math.random() < 0.35 ? ` ${randomItem(namePool)}` : '';
  const last = `${randomItem(SURNAMES)} ${randomItem(SURNAMES)}`;
  return {
    firstName: `${first}${second}`.trim(),
    lastName: last,
  };
};

const buildAddress = (campusName) => {
  const streetType = randomItem(STREET_TYPES);
  const streetName = randomItem(STREET_NAMES);
  const number = randomInt(100, 1899);
  return `${streetType} ${streetName} ${number}, ${campusName}`;
};

const buildSchedule = (isVirtual) => {
  const multiDayPatterns = ['LUN-MIE-VIE', 'MAR-JUE', 'LUN-MIE', 'MIE-VIE', 'LUN-JUE'];
  const saturdayPatterns = ['SAB'];
  const isSaturday = Math.random() < 0.18;
  const dayPart = isSaturday ? randomItem(saturdayPatterns) : randomItem(multiDayPatterns);

  const timeOptions = isSaturday
    ? ['08:00-12:00', '09:00-13:00', '14:00-18:00']
    : ['07:30-09:30', '09:30-11:30', '14:00-16:00', '16:00-18:00', '18:00-20:00', '20:00-22:00'];
  const timePart = randomItem(timeOptions);

  const roomPart = isVirtual
    ? `Aula Virtual ${randomInt(1, 8)}`
    : `Aula ${String.fromCharCode(65 + randomInt(0, 3))}-${randomInt(101, 420)}`;

  return `${dayPart} ${timePart} | ${roomPart}`;
};

const nextUniqueEmail = (fullName, usedEmails) => {
  const parts = fullName.firstName.split(' ').filter(Boolean);
  const first = normalizeText(parts[0] || 'usuario');
  const last = normalizeText(fullName.lastName.split(' ')[0] || 'usuario');
  const domain = randomItem(EMAIL_DOMAINS);

  let attempt = 0;
  while (attempt < 1000) {
    const suffix = attempt === 0 ? '' : String(attempt + randomInt(1, 19));
    const candidate = `${first}.${last}${suffix}@${domain}`.toLowerCase();
    if (!usedEmails.has(candidate)) {
      usedEmails.add(candidate);
      return candidate;
    }
    attempt += 1;
  }

  const fallback = `${first}.${last}.${Date.now()}@${domain}`.toLowerCase();
  usedEmails.add(fallback);
  return fallback;
};

const nextUniqueDocument = (usedDocs, startSeed) => {
  let candidate = startSeed;
  while (usedDocs.has(String(candidate)) || String(candidate).length !== 8) {
    candidate += 1;
    if (candidate > 99999999) candidate = 10000000 + randomInt(0, 89999999);
  }
  usedDocs.add(String(candidate));
  return String(candidate);
};

const nextPhone = () => `9${String(randomInt(10000000, 99999999))}`;

const chunk = (items, size) => {
  const output = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
};

const bulkInsert = async ({ tx, table, columns, rows, onConflict = '', returning = '' }) => {
  if (!rows.length) return { rowCount: 0, rows: [] };

  const values = rows.flat();
  const perRow = columns.length;
  const placeholders = rows
    .map((_, rowIdx) => {
      const start = rowIdx * perRow;
      const params = columns.map((__c, colIdx) => `$${start + colIdx + 1}`);
      return `(${params.join(', ')})`;
    })
    .join(', ');

  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders} ${onConflict} ${returning}`.trim();
  return tx.query(sql, values);
};

const updateByRows = async ({
  tx,
  table,
  idColumn = 'id',
  columns,
  rows,
  touchUpdatedAt = true,
  casts = {},
}) => {
  if (!rows.length) return;

  const blocks = chunk(rows, 250);
  for (const block of blocks) {
    const rowColumns = [idColumn, ...columns];
    const values = [];
    const placeholders = block
      .map((row, rowIdx) => {
        const base = rowIdx * rowColumns.length;
        const params = rowColumns.map((col, colIdx) => {
          values.push(row[col]);
          return `$${base + colIdx + 1}`;
        });
        return `(${params.join(', ')})`;
      })
      .join(', ');

    const setParts = columns.map((col) => `${col} = v.${col}${casts[col] || ''}`);
    if (touchUpdatedAt) {
      setParts.push('updated_at = NOW()');
    }

    const sql = `
      UPDATE ${table} t
      SET ${setParts.join(', ')}
      FROM (VALUES ${placeholders}) AS v(${rowColumns.join(', ')})
      WHERE t.${idColumn} = (v.${idColumn})::bigint
    `;

    await tx.query(sql, values);
  }
};

const detectLatestBatchTag = async () => {
  const result = await query(`
    SELECT (regexp_match(email, '^docente\\.([0-9]{12})\\.'))[1] AS batch_tag
    FROM users
    WHERE email ~ '^docente\\.[0-9]{12}\\.[0-9]+\\.[0-9]+@computron\\.local$'
    ORDER BY batch_tag DESC
    LIMIT 1
  `);

  return result.rows[0]?.batch_tag || null;
};

const run = async () => {
  const batchTag = await detectLatestBatchTag();
  if (!batchTag) {
    throw new Error('No se encontro lote de seed masivo docente.*.computron.local.');
  }

  const today = new Date();
  const weekDates = weekDatesIncludingToday();

  const [
    campusesResult,
    teachersResult,
    studentsResult,
    guardiansResult,
    courseOfferingsResult,
    assessmentsResult,
    usedEmailResult,
    usedStudentDocResult,
    usedGuardianDocResult,
  ] = await Promise.all([
    query(`SELECT id, name FROM campuses`),
    query(
      `SELECT id, base_campus_id
       FROM users
       WHERE email LIKE $1
       ORDER BY id`,
      [`docente.${batchTag}.%@computron.local`],
    ),
    query(
      `SELECT
         s.id AS student_id,
         s.user_id,
         e.course_campus_id,
         cc.campus_id
       FROM students s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
       LEFT JOIN course_campus cc ON cc.id = e.course_campus_id
       WHERE u.email LIKE $1
       ORDER BY s.id`,
      [`alumno.${batchTag}.%@computron.local`],
    ),
    query(
      `SELECT id
       FROM guardians
       WHERE email LIKE $1
       ORDER BY id`,
      [`apoderado.${batchTag}.%@computron.local`],
    ),
    query(
      `SELECT
         cc.id AS offering_id,
         cc.course_id,
         cc.campus_id,
         cp.name AS campus_name,
         cc.modality
       FROM course_campus cc
       JOIN courses c ON c.id = cc.course_id
       JOIN campuses cp ON cp.id = cc.campus_id
       WHERE c.name LIKE $1
       ORDER BY cc.id`,
      [`%LOTE-${batchTag}%`],
    ),
    query(
      `SELECT
         a.id,
         a.course_campus_id
       FROM assessments a
       JOIN course_campus cc ON cc.id = a.course_campus_id
       JOIN courses c ON c.id = cc.course_id
       WHERE c.name LIKE $1
       ORDER BY a.course_campus_id, a.id`,
      [`%LOTE-${batchTag}%`],
    ),
    query('SELECT LOWER(email) AS email FROM users'),
    query('SELECT document_number FROM students'),
    query('SELECT document_number FROM guardians WHERE document_number IS NOT NULL'),
  ]);

  const campusById = new Map(campusesResult.rows.map((row) => [Number(row.id), row.name]));

  const usedEmails = new Set(usedEmailResult.rows.map((row) => row.email));
  const usedStudentDocs = new Set(usedStudentDocResult.rows.map((row) => String(row.document_number)));
  const usedGuardianDocs = new Set(usedGuardianDocResult.rows.map((row) => String(row.document_number)));

  const teacherUserUpdates = [];
  for (const teacher of teachersResult.rows) {
    const fullName = randomFullName(STUDENT_NAMES);
    const email = nextUniqueEmail(fullName, usedEmails);
    teacherUserUpdates.push({
      id: Number(teacher.id),
      first_name: fullName.firstName,
      last_name: fullName.lastName,
      email,
    });
  }

  const studentUserUpdates = [];
  const studentEntityUpdates = [];
  let studentDocSeed = 91000000;
  for (const student of studentsResult.rows) {
    const fullName = randomFullName(STUDENT_NAMES);
    const email = nextUniqueEmail(fullName, usedEmails);
    const document = nextUniqueDocument(usedStudentDocs, studentDocSeed);
    studentDocSeed = Number(document) + 1;
    const campusName = campusById.get(Number(student.campus_id)) || 'Lima';
    const birthDate = toDateIso(addDays(today, -randomInt(18 * 365, 37 * 365)));

    studentUserUpdates.push({
      id: Number(student.user_id),
      first_name: fullName.firstName,
      last_name: fullName.lastName,
      email,
    });

    studentEntityUpdates.push({
      id: Number(student.student_id),
      first_name: fullName.firstName,
      last_name: fullName.lastName,
      document_number: document,
      birth_date: birthDate,
      email,
      phone: nextPhone(),
      address: buildAddress(campusName),
    });
  }

  const guardianUpdates = [];
  let guardianDocSeed = 76000000;
  for (const guardian of guardiansResult.rows) {
    const fullName = randomFullName(GUARDIAN_NAMES);
    const doc = nextUniqueDocument(usedGuardianDocs, guardianDocSeed);
    guardianDocSeed = Number(doc) + 1;

    guardianUpdates.push({
      id: Number(guardian.id),
      first_name: fullName.firstName,
      last_name: fullName.lastName,
      email: nextUniqueEmail(fullName, new Set()), // guardian email no unique constraint
      phone: nextPhone(),
      document_number: doc,
    });
  }

  const courseUpdates = [];
  const offeringUpdates = [];
  const assignmentOfferingIds = [];

  for (const offering of courseOfferingsResult.rows) {
    const offeringId = Number(offering.offering_id);
    const courseId = Number(offering.course_id);
    const campusName = String(offering.campus_name || 'Lima');
    const campusToken = normalizeText(campusName).slice(0, 6).toUpperCase() || 'SEDE';
    const template = randomItem(COURSE_TEMPLATES);
    const level = randomItem(['Basico', 'Intermedio', 'Avanzado', 'Intensivo']);

    courseUpdates.push({
      id: courseId,
      name: `${template} ${level} ${campusToken}-${courseId}`,
      description: `Programa tecnico orientado a empleabilidad en ${campusName}.`,
    });

    const virtualChance = Math.random();
    const modality = virtualChance < 0.68 ? 'PRESENCIAL' : virtualChance < 0.88 ? 'VIRTUAL' : 'HIBRIDO';
    offeringUpdates.push({
      id: offeringId,
      modality,
      monthly_fee: randomInt(140, 520),
      capacity: randomInt(22, 38),
      schedule_info: buildSchedule(modality === 'VIRTUAL'),
    });
    assignmentOfferingIds.push(offeringId);
  }

  // Deduplicate repeated course updates (because each course has one offering in seed, but guard anyway)
  const uniqueCourseUpdatesMap = new Map();
  for (const course of courseUpdates) uniqueCourseUpdatesMap.set(course.id, course);
  const uniqueCourseUpdates = Array.from(uniqueCourseUpdatesMap.values());

  const assessmentsByOffering = new Map();
  for (const assessment of assessmentsResult.rows) {
    const key = Number(assessment.course_campus_id);
    if (!assessmentsByOffering.has(key)) assessmentsByOffering.set(key, []);
    assessmentsByOffering.get(key).push(Number(assessment.id));
  }

  const assessmentUpdates = [];
  for (const [offeringId, assessmentIds] of assessmentsByOffering.entries()) {
    const sorted = [...assessmentIds].sort((a, b) => a - b);
    sorted.forEach((assessmentId, idx) => {
      const sequence = idx + 1;
      const title =
        sequence === 1
          ? 'Practica Calificada 1'
          : sequence === 2
            ? 'Examen Parcial'
            : sequence === 3
              ? 'Proyecto Integrador'
              : `Evaluacion ${sequence}`;

      const daysAhead = 4 + (offeringId % 5) + idx * 8;
      assessmentUpdates.push({
        id: assessmentId,
        title,
        assessment_date: toDateIso(addDays(today, daysAhead)),
        weight: sequence === 1 ? 35 : sequence === 2 ? 65 : 100 / sequence,
      });
    });
  }

  const studentIds = studentEntityUpdates.map((row) => row.id);
  const enrollmentResult = await query(
    `SELECT id, course_campus_id
     FROM enrollments
     WHERE student_id = ANY($1::bigint[])
       AND status = 'ACTIVE'`,
    [studentIds],
  );

  const enrollmentRows = enrollmentResult.rows.map((row) => ({
    id: Number(row.id),
    courseCampusId: Number(row.course_campus_id),
  }));

  const teacherMapResult = await query(
    `SELECT course_campus_id, MIN(teacher_user_id)::bigint AS teacher_user_id
     FROM teacher_assignments
     WHERE course_campus_id = ANY($1::bigint[])
       AND status = 'ACTIVE'
     GROUP BY course_campus_id`,
    [assignmentOfferingIds],
  );
  const teacherByOffering = new Map(
    teacherMapResult.rows.map((row) => [Number(row.course_campus_id), Number(row.teacher_user_id)]),
  );

  const attendanceRows = [];
  const profileByEnrollment = new Map();
  for (const enrollment of enrollmentRows) {
    const profileRoll = Math.random();
    const profile =
      profileRoll < 0.62 ? { p: 0.9, t: 0.06 } : profileRoll < 0.9 ? { p: 0.78, t: 0.04 } : { p: 0.63, t: 0.02 };
    profileByEnrollment.set(enrollment.id, profile);
  }

  for (const enrollment of enrollmentRows) {
    const teacherId = teacherByOffering.get(enrollment.courseCampusId) || null;
    const profile = profileByEnrollment.get(enrollment.id);

    for (const date of weekDates) {
      const n = Math.random();
      let status = 'PRESENTE';
      if (n > profile.p) {
        const m = Math.random();
        if (m < 0.52) status = 'AUSENTE';
        else if (m < 0.77) status = 'FALTO';
        else status = 'JUSTIFICADO';
      } else if (Math.random() < profile.t) {
        status = 'TARDE';
      }

      attendanceRows.push([
        enrollment.id,
        date,
        status,
        teacherId,
        status === 'JUSTIFICADO' ? 'Justificacion presentada' : null,
      ]);
    }
  }

  await withTransaction(async (tx) => {
    await updateByRows({
      tx,
      table: 'users',
      columns: ['first_name', 'last_name', 'email'],
      rows: [...teacherUserUpdates, ...studentUserUpdates],
      touchUpdatedAt: true,
    });

    await updateByRows({
      tx,
      table: 'students',
      columns: ['first_name', 'last_name', 'document_number', 'birth_date', 'email', 'phone', 'address'],
      rows: studentEntityUpdates,
      touchUpdatedAt: true,
      casts: {
        birth_date: '::date',
      },
    });

    await updateByRows({
      tx,
      table: 'guardians',
      columns: ['first_name', 'last_name', 'email', 'phone', 'document_number'],
      rows: guardianUpdates,
      touchUpdatedAt: true,
    });

    await updateByRows({
      tx,
      table: 'courses',
      columns: ['name', 'description'],
      rows: uniqueCourseUpdates,
      touchUpdatedAt: true,
    });

    await updateByRows({
      tx,
      table: 'course_campus',
      columns: ['modality', 'monthly_fee', 'capacity', 'schedule_info'],
      rows: offeringUpdates,
      touchUpdatedAt: true,
      casts: {
        monthly_fee: '::numeric',
        capacity: '::integer',
      },
    });

    await tx.query(
      `UPDATE teacher_assignments ta
       SET schedule_info = cc.schedule_info,
           updated_at = NOW()
       FROM course_campus cc
       WHERE ta.course_campus_id = cc.id
         AND ta.course_campus_id = ANY($1::bigint[])`,
      [assignmentOfferingIds],
    );

    await updateByRows({
      tx,
      table: 'assessments',
      columns: ['title', 'assessment_date', 'weight'],
      rows: assessmentUpdates,
      touchUpdatedAt: false,
      casts: {
        assessment_date: '::date',
        weight: '::numeric',
      },
    });

    await tx.query(
      `DELETE FROM attendances
       WHERE enrollment_id = ANY($1::bigint[])
         AND attendance_date = ANY($2::date[])`,
      [enrollmentRows.map((row) => row.id), weekDates],
    );

    for (const block of chunk(attendanceRows, 800)) {
      await bulkInsert({
        tx,
        table: 'attendances',
        columns: ['enrollment_id', 'attendance_date', 'status', 'recorded_by', 'notes'],
        rows: block,
        onConflict: `ON CONFLICT (enrollment_id, attendance_date)
                     DO UPDATE SET
                       status = EXCLUDED.status,
                       recorded_by = EXCLUDED.recorded_by,
                       notes = EXCLUDED.notes`,
      });
    }
  });

  console.log(`Lote realista aplicado: ${batchTag}`);
  console.log(
    JSON.stringify(
      {
        teachers_updated: teacherUserUpdates.length,
        students_updated: studentEntityUpdates.length,
        guardians_updated: guardianUpdates.length,
        courses_updated: uniqueCourseUpdates.length,
        offerings_updated: offeringUpdates.length,
        assessments_updated: assessmentUpdates.length,
        attendance_rows_regenerated: attendanceRows.length,
      },
      null,
      2,
    ),
  );
}

run()
  .catch((error) => {
    console.error('Error aplicando realismo:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
