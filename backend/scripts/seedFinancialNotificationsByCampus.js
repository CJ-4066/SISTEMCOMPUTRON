const { query, withTransaction, pool } = require('../src/config/db');

const PAYMENT_METHODS = ['YAPE', 'TRANSFERENCIA', 'QR', 'EFECTIVO', 'OTRO'];
const NOTIFICATION_STATUS_WEIGHTS = [
  { status: 'SENT', weight: 0.68 },
  { status: 'PENDING', weight: 0.22 },
  { status: 'FAILED', weight: 0.1 },
];

const SIM_ATTEMPT_RATE = 0.16;
const SIM_REJECT_RATE = 0.08;

const randomItem = (items) => items[Math.floor(Math.random() * items.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const toDateIso = (date) => new Date(date).toISOString().slice(0, 10);

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const clampDate = (date, minDate, maxDate) => {
  const value = new Date(date).getTime();
  const min = new Date(minDate).getTime();
  const max = new Date(maxDate).getTime();
  return new Date(Math.min(max, Math.max(min, value)));
};

const weightedStatus = () => {
  const n = Math.random();
  let acc = 0;
  for (const row of NOTIFICATION_STATUS_WEIGHTS) {
    acc += row.weight;
    if (n <= acc) return row.status;
  }
  return 'PENDING';
};

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

const bulkInsert = async ({
  tx,
  table,
  columns,
  rows,
  onConflict = '',
  returning = '',
}) => {
  if (!rows.length) return { rowCount: 0, rows: [] };

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

const buildRuntimeTag = () => new Date().toISOString().replace(/\D/g, '').slice(2, 14);

const getActorUserId = async () => {
  const admin = await query(`
    SELECT u.id
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE r.name = 'ADMIN'
    ORDER BY u.id
    LIMIT 1
  `);
  if (admin.rowCount) return Number(admin.rows[0].id);

  const fallback = await query('SELECT id FROM users ORDER BY id LIMIT 1');
  return fallback.rowCount ? Number(fallback.rows[0].id) : null;
};

const getMensualidadConceptId = async () => {
  const concept = await query(
    `SELECT id
     FROM payment_concepts
     WHERE name = 'MENSUALIDAD'
     LIMIT 1`,
  );

  if (!concept.rowCount) {
    const created = await query(
      `INSERT INTO payment_concepts (name, description)
       VALUES ('MENSUALIDAD', 'Pago mensual del curso')
       RETURNING id`,
    );
    return Number(created.rows[0].id);
  }

  return Number(concept.rows[0].id);
};

const enrollmentPlan = () => {
  const roll = Math.random();
  if (roll < 0.45) return 'GOOD';
  if (roll < 0.72) return 'PARTIAL';
  if (roll < 0.9) return 'LATE';
  return 'DEBT';
};

const generateInstallmentsForEnrollment = ({
  enrollment,
  conceptId,
  tag,
  today,
}) => {
  const startOffset = randomItem([-50, -40, -30, -20]);
  const due1 = addDays(today, startOffset);
  const due2 = addDays(due1, 30);
  const due3 = addDays(due2, 30);
  const baseFee = Math.max(120, Number(enrollment.monthly_fee || 180));

  const amount1 = Math.round(baseFee);
  const amount2 = Math.round(baseFee * randomItem([1, 1, 1.05]));
  const amount3 = Math.round(baseFee * randomItem([1, 1.1]));

  return [
    {
      enrollmentId: Number(enrollment.enrollment_id),
      studentId: Number(enrollment.student_id),
      courseCampusId: Number(enrollment.course_campus_id),
      campusId: Number(enrollment.campus_id),
      dueDate: toDateIso(due1),
      totalAmount: amount1,
      conceptId,
      description: `Cuota 1 - ${enrollment.course_name} [SIMFIN ${tag}]`,
    },
    {
      enrollmentId: Number(enrollment.enrollment_id),
      studentId: Number(enrollment.student_id),
      courseCampusId: Number(enrollment.course_campus_id),
      campusId: Number(enrollment.campus_id),
      dueDate: toDateIso(due2),
      totalAmount: amount2,
      conceptId,
      description: `Cuota 2 - ${enrollment.course_name} [SIMFIN ${tag}]`,
    },
    {
      enrollmentId: Number(enrollment.enrollment_id),
      studentId: Number(enrollment.student_id),
      courseCampusId: Number(enrollment.course_campus_id),
      campusId: Number(enrollment.campus_id),
      dueDate: toDateIso(due3),
      totalAmount: amount3,
      conceptId,
      description: `Cuota 3 - ${enrollment.course_name} [SIMFIN ${tag}]`,
    },
  ];
};

const resolvePaidAmountByPlan = ({ plan, installmentIndex, dueDate, totalAmount, today }) => {
  const due = new Date(dueDate);
  const isDue = due <= today;

  if (plan === 'GOOD') {
    if (installmentIndex === 0) return totalAmount;
    if (installmentIndex === 1) return isDue ? totalAmount : Math.random() < 0.25 ? totalAmount : 0;
    return Math.random() < 0.08 ? Math.round(totalAmount * 0.5) : 0;
  }

  if (plan === 'PARTIAL') {
    if (installmentIndex === 0) return totalAmount;
    if (installmentIndex === 1) return isDue ? Math.round(totalAmount * randomItem([0.4, 0.5, 0.65, 0.75])) : 0;
    return 0;
  }

  if (plan === 'LATE') {
    if (installmentIndex === 0) return Math.round(totalAmount * randomItem([0.35, 0.45, 0.6]));
    return 0;
  }

  return 0;
};

const buildNotificationRows = ({
  overdueInstallments,
  actorUserId,
  tag,
}) => {
  const rows = [];
  const now = new Date();

  for (const item of overdueInstallments) {
    const pending = Number(item.pending_amount || 0);
    if (pending <= 0) continue;

    const subject = `Recordatorio de pago - ${item.course_name} (${item.campus_name})`;
    const body = `<p>Hola ${item.student_name || 'estudiante'},</p><p>Tienes una cuota pendiente de <strong>S/ ${pending.toFixed(
      2,
    )}</strong> del curso ${item.course_name}.</p><p>Sede: ${item.campus_name}</p><p>Vencimiento: ${toDateIso(
      item.due_date,
    )}</p><p>Referencia: SIMFIN-${tag}</p>`;

    const status = weightedStatus();
    const schedule = addDays(now, -randomInt(0, 5));
    const sentAt = status === 'SENT' ? addDays(schedule, 0) : null;
    const errorMessage = status === 'FAILED' ? 'SMTP timeout simulado.' : null;

    rows.push([
      Number(item.student_id),
      null,
      'EMAIL',
      item.student_email,
      subject,
      body,
      status,
      schedule.toISOString(),
      sentAt ? sentAt.toISOString() : null,
      errorMessage,
      actorUserId,
    ]);

    if (item.guardian_email && Math.random() < 0.72) {
      const guardianStatus = weightedStatus();
      const guardianSchedule = addDays(now, -randomInt(0, 5));
      const guardianSent = guardianStatus === 'SENT' ? guardianSchedule : null;
      const guardianError = guardianStatus === 'FAILED' ? 'Mailbox unavailable simulado.' : null;
      const guardianBody = `<p>Estimado(a) apoderado(a),</p><p>El alumno ${
        item.student_name || ''
      } tiene una deuda pendiente de <strong>S/ ${pending.toFixed(
        2,
      )}</strong> en ${item.course_name} (${item.campus_name}).</p><p>Vencimiento: ${toDateIso(
        item.due_date,
      )}</p><p>Referencia: SIMFIN-${tag}</p>`;

      rows.push([
        Number(item.student_id),
        null,
        'EMAIL',
        item.guardian_email,
        `Aviso a apoderado - ${item.course_name}`,
        guardianBody,
        guardianStatus,
        guardianSchedule.toISOString(),
        guardianSent ? guardianSent.toISOString() : null,
        guardianError,
        actorUserId,
      ]);
    }
  }

  return rows;
};

const run = async () => {
  const detectedTag = await detectLatestBatchTag();
  const tag = detectedTag || buildRuntimeTag();

  const actorUserId = await getActorUserId();
  const conceptId = await getMensualidadConceptId();
  const today = new Date();
  const todayIso = toDateIso(today);

  const enrollmentsResult = await query(
    `SELECT
       e.id AS enrollment_id,
       e.student_id,
       e.course_campus_id,
       cc.campus_id,
       cp.name AS campus_name,
       c.name AS course_name,
       COALESCE(cc.monthly_fee, 180)::numeric(10,2) AS monthly_fee,
       s.email AS student_email,
       CONCAT(s.first_name, ' ', s.last_name) AS student_name,
       guardian.email AS guardian_email
     FROM enrollments e
     JOIN course_campus cc ON cc.id = e.course_campus_id
     JOIN campuses cp ON cp.id = cc.campus_id
     JOIN courses c ON c.id = cc.course_id
     JOIN students s ON s.id = e.student_id
     LEFT JOIN LATERAL (
       SELECT g.email
       FROM student_guardian sg
       JOIN guardians g ON g.id = sg.guardian_id
       WHERE sg.student_id = s.id
         AND g.email IS NOT NULL
       ORDER BY sg.created_at ASC
       LIMIT 1
     ) guardian ON TRUE
     WHERE e.status = 'ACTIVE'
     ORDER BY cc.campus_id, e.id`,
  );

  if (!enrollmentsResult.rowCount) {
    throw new Error('No hay matriculas activas para generar cuotas/pagos.');
  }

  const installmentsMeta = [];
  for (const enrollment of enrollmentsResult.rows) {
    installmentsMeta.push(
      ...generateInstallmentsForEnrollment({
        enrollment,
        conceptId,
        tag,
        today,
      }),
    );
  }

  const summaryByCampus = new Map();
  const ensureCampusSummary = (campusId, campusName) => {
    const key = Number(campusId);
    if (!summaryByCampus.has(key)) {
      summaryByCampus.set(key, {
        campus_id: key,
        campus_name: campusName,
        installments: 0,
        completed_payments: 0,
        pending_or_rejected_payments: 0,
        notifications: 0,
      });
    }
    return summaryByCampus.get(key);
  };

  const result = await withTransaction(async (tx) => {
    const installmentRowsWithMeta = [];
    let installmentsCreatedCount = 0;
    for (const metaBlock of chunk(installmentsMeta, 1000)) {
      const installmentInsert = await bulkInsert({
        tx,
        table: 'installments',
        columns: ['enrollment_id', 'concept_id', 'description', 'due_date', 'total_amount', 'paid_amount', 'status'],
        rows: metaBlock.map((row) => [
          row.enrollmentId,
          row.conceptId,
          row.description,
          row.dueDate,
          row.totalAmount,
          0,
          'PENDING',
        ]),
        returning: 'RETURNING id, enrollment_id, due_date, total_amount',
      });

      installmentsCreatedCount += installmentInsert.rowCount;
      for (let i = 0; i < installmentInsert.rows.length; i += 1) {
        installmentRowsWithMeta.push({
          installmentRow: installmentInsert.rows[i],
          meta: metaBlock[i],
        });
      }
    }

    const enrollmentInfoById = new Map(
      enrollmentsResult.rows.map((row) => [
        Number(row.enrollment_id),
        {
          campusId: Number(row.campus_id),
          campusName: row.campus_name,
          studentId: Number(row.student_id),
        },
      ]),
    );

    const paymentRows = [];
    const paymentDetailsSeed = [];
    const paymentAuditRows = [];
    let paymentSeq = 1;

    for (let idx = 0; idx < installmentRowsWithMeta.length; idx += 1) {
      const installmentRow = installmentRowsWithMeta[idx].installmentRow;
      const meta = installmentRowsWithMeta[idx].meta;
      const enrollmentInfo = enrollmentInfoById.get(Number(installmentRow.enrollment_id));
      const campusSummary = ensureCampusSummary(enrollmentInfo.campusId, enrollmentInfo.campusName);
      campusSummary.installments += 1;

      const plan = enrollmentPlan();
      const installmentIndex = idx % 3;
      const paidAmount = resolvePaidAmountByPlan({
        plan,
        installmentIndex,
        dueDate: installmentRow.due_date,
        totalAmount: Number(installmentRow.total_amount),
        today,
      });

      if (paidAmount > 0) {
        const payDate = clampDate(
          addDays(new Date(installmentRow.due_date), randomInt(-4, 9)),
          addDays(today, -120),
          addDays(today, 0),
        );
        const referenceCode = `SIMFIN-${tag}-${paymentSeq++}`;
        const method = randomItem(PAYMENT_METHODS);
        paymentRows.push([
          enrollmentInfo.studentId,
          Number(installmentRow.enrollment_id),
          paidAmount,
          payDate.toISOString(),
          method,
          referenceCode,
          'COMPLETED',
          `Pago simulado realista ${tag}`,
          actorUserId,
        ]);

        paymentDetailsSeed.push({
          referenceCode,
          installmentId: Number(installmentRow.id),
          amount: paidAmount,
        });

        paymentAuditRows.push([referenceCode, null, 'COMPLETED', method, actorUserId, `Seed financiero ${tag}`]);
        campusSummary.completed_payments += 1;
      }

      if (installmentIndex === 0 && Math.random() < SIM_ATTEMPT_RATE) {
        const refAttempt = `SIMFIN-${tag}-P-${paymentSeq++}`;
        const methodAttempt = randomItem(PAYMENT_METHODS);
        paymentRows.push([
          enrollmentInfo.studentId,
          Number(installmentRow.enrollment_id),
          0,
          addDays(today, -randomInt(0, 5)).toISOString(),
          methodAttempt,
          refAttempt,
          'PENDING',
          `Intento pendiente simulado ${tag}`,
          actorUserId,
        ]);
        paymentAuditRows.push([refAttempt, null, 'PENDING', methodAttempt, actorUserId, `Seed financiero ${tag}`]);
        campusSummary.pending_or_rejected_payments += 1;
      } else if (installmentIndex === 1 && Math.random() < SIM_REJECT_RATE) {
        const refRejected = `SIMFIN-${tag}-R-${paymentSeq++}`;
        const methodRejected = randomItem(PAYMENT_METHODS);
        paymentRows.push([
          enrollmentInfo.studentId,
          Number(installmentRow.enrollment_id),
          0,
          addDays(today, -randomInt(0, 8)).toISOString(),
          methodRejected,
          refRejected,
          'REJECTED',
          `Pago rechazado simulado ${tag}`,
          actorUserId,
        ]);
        paymentAuditRows.push([refRejected, null, 'REJECTED', methodRejected, actorUserId, `Seed financiero ${tag}`]);
        campusSummary.pending_or_rejected_payments += 1;
      }
    }

    const insertedPayments = [];
    for (const block of chunk(paymentRows, 900)) {
      const inserted = await bulkInsert({
        tx,
        table: 'payments',
        columns: [
          'student_id',
          'enrollment_id',
          'total_amount',
          'payment_date',
          'method',
          'reference_code',
          'status',
          'notes',
          'processed_by',
        ],
        rows: block,
        returning: 'RETURNING id, reference_code, status, method',
      });
      insertedPayments.push(...inserted.rows);
    }

    const paymentIdByReference = new Map(
      insertedPayments.map((row) => [String(row.reference_code), Number(row.id)]),
    );

    const paymentDetailRows = paymentDetailsSeed
      .map((detail) => {
        const paymentId = paymentIdByReference.get(detail.referenceCode);
        if (!paymentId) return null;
        return [paymentId, detail.installmentId, detail.amount];
      })
      .filter(Boolean);

    for (const block of chunk(paymentDetailRows, 900)) {
      await bulkInsert({
        tx,
        table: 'payment_details',
        columns: ['payment_id', 'installment_id', 'amount'],
        rows: block,
      });
    }

    const paymentAuditInsertRows = paymentAuditRows
      .map((row) => {
        const paymentId = paymentIdByReference.get(row[0]);
        if (!paymentId) return null;
        return [paymentId, row[1], row[2], row[3], row[4], row[5]];
      })
      .filter(Boolean);

    for (const block of chunk(paymentAuditInsertRows, 900)) {
      await bulkInsert({
        tx,
        table: 'payment_audit',
        columns: ['payment_id', 'old_status', 'new_status', 'method', 'changed_by', 'notes'],
        rows: block,
      });
    }

    await tx.query(
      `UPDATE installments i
       SET paid_amount = LEAST(i.total_amount, COALESCE(paid.total_paid, 0)),
           status = CASE
             WHEN COALESCE(paid.total_paid, 0) <= 0 THEN 'PENDING'
             WHEN COALESCE(paid.total_paid, 0) >= i.total_amount THEN 'PAID'
             ELSE 'PARTIAL'
           END,
           updated_at = NOW()
       FROM (
         SELECT pd.installment_id, SUM(pd.amount)::numeric(10,2) AS total_paid
         FROM payment_details pd
         JOIN payments p ON p.id = pd.payment_id
         WHERE p.reference_code LIKE $1
           AND p.status = 'COMPLETED'
         GROUP BY pd.installment_id
       ) paid
       WHERE i.id = paid.installment_id`,
      [`SIMFIN-${tag}%`],
    );

    const overdueInstallments = await tx.query(
      `SELECT
         i.id AS installment_id,
         i.enrollment_id,
         i.due_date,
         (i.total_amount - i.paid_amount)::numeric(10,2) AS pending_amount,
         e.student_id,
         s.email AS student_email,
         CONCAT(s.first_name, ' ', s.last_name) AS student_name,
         guardian.email AS guardian_email,
         c.name AS course_name,
         cp.name AS campus_name,
         cc.campus_id
       FROM installments i
       JOIN enrollments e ON e.id = i.enrollment_id
       JOIN students s ON s.id = e.student_id
       JOIN course_campus cc ON cc.id = e.course_campus_id
       JOIN courses c ON c.id = cc.course_id
       JOIN campuses cp ON cp.id = cc.campus_id
       LEFT JOIN LATERAL (
         SELECT g.email
         FROM student_guardian sg
         JOIN guardians g ON g.id = sg.guardian_id
         WHERE sg.student_id = s.id
           AND g.email IS NOT NULL
         ORDER BY sg.created_at ASC
         LIMIT 1
       ) guardian ON TRUE
       WHERE i.description LIKE $1
         AND i.due_date < $2::date
         AND i.status IN ('PENDING', 'PARTIAL')
         AND s.email IS NOT NULL`,
      [`%[SIMFIN ${tag}]%`, todayIso],
    );

    const notificationRows = buildNotificationRows({
      overdueInstallments: overdueInstallments.rows,
      actorUserId,
      tag,
    });

    const campusIdByRecipient = new Map();
    for (const item of overdueInstallments.rows) {
      if (item.student_email) campusIdByRecipient.set(item.student_email, Number(item.campus_id));
      if (item.guardian_email) campusIdByRecipient.set(item.guardian_email, Number(item.campus_id));
    }

    for (const row of notificationRows) {
      const campusId = Number(campusIdByRecipient.get(row[3]) || 0);
      if (campusId && summaryByCampus.has(campusId)) {
        summaryByCampus.get(campusId).notifications += 1;
      }
    }

    for (const block of chunk(notificationRows, 700)) {
      await bulkInsert({
        tx,
        table: 'notifications',
        columns: [
          'student_id',
          'guardian_id',
          'channel',
          'recipient',
          'subject',
          'body',
          'status',
          'scheduled_at',
          'sent_at',
          'error_message',
          'created_by',
        ],
        rows: block,
      });
    }

    return {
      enrollments: enrollmentsResult.rowCount,
      installments: installmentsCreatedCount,
      payments: insertedPayments.length,
      payment_details: paymentDetailRows.length,
      payment_audit: paymentAuditInsertRows.length,
      notifications: notificationRows.length,
      campuses: Array.from(summaryByCampus.values()).sort((a, b) => a.campus_id - b.campus_id),
    };
  });

  console.log(`Seed financiero/notificaciones aplicado. Lote: ${tag}`);
  console.log(
    JSON.stringify(
      {
        enrollments_scoped: result.enrollments,
        installments_created: result.installments,
        payments_created: result.payments,
        payment_details_created: result.payment_details,
        payment_audit_created: result.payment_audit,
        notifications_created: result.notifications,
      },
      null,
      2,
    ),
  );
  console.log('Resumen por sede (primeras 12):');
  console.table(result.campuses.slice(0, 12));
}

run()
  .catch((error) => {
    console.error('Error en seed financiero/notificaciones:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
