const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const getTodayIsoDate = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const normalizeDateOnly = (value) => {
  const normalized = String(value || '').trim().slice(0, 10);
  return DATE_ONLY_PATTERN.test(normalized) ? normalized : '';
};

const parseComparableDate = (value) => {
  const normalized = normalizeDateOnly(value);
  if (!normalized) return 0;
  const parsed = Date.parse(`${normalized}T00:00:00`);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getCertificateEligibility = (enrollment = {}) => {
  const status = String(
    enrollment.status || enrollment.enrollment_status || enrollment.certificate_enrollment_status || '',
  )
    .trim()
    .toUpperCase();
  const completionDate = normalizeDateOnly(
    enrollment.course_end_date ||
      enrollment.certificate_course_end_date ||
      enrollment.period_end_date ||
      enrollment.assigned_course_end_date ||
      '',
  );

  let certificate_eligible = false;
  let certificate_eligibility_reason = 'No existe una matrícula válida para emitir certificado.';

  if (status === 'COMPLETED') {
    certificate_eligible = true;
    certificate_eligibility_reason = completionDate
      ? `Curso culminado el ${completionDate}.`
      : 'Curso culminado.';
  } else if (status === 'CANCELED') {
    certificate_eligibility_reason = 'La matrícula del curso fue cancelada.';
  } else if (status === 'SUSPENDED') {
    certificate_eligibility_reason = 'La matrícula del curso está suspendida.';
  } else if (status === 'TRANSFERRED') {
    certificate_eligibility_reason = 'La matrícula del curso fue trasladada.';
  } else if (!completionDate) {
    certificate_eligibility_reason = 'No hay fecha de culminación registrada para este curso.';
  } else if (completionDate > getTodayIsoDate()) {
    certificate_eligibility_reason = `El curso culmina el ${completionDate}.`;
  } else if (status === 'ACTIVE') {
    certificate_eligible = true;
    certificate_eligibility_reason = `Curso culminado el ${completionDate}.`;
  } else {
    certificate_eligibility_reason = 'El curso todavía no está apto para certificado.';
  }

  return {
    certificate_eligible,
    certificate_override_required: !certificate_eligible,
    certificate_eligibility_reason,
    certificate_completion_date: completionDate || null,
  };
};

const decorateEnrollmentWithCertificateEligibility = (enrollment = {}) => ({
  ...enrollment,
  ...getCertificateEligibility(enrollment),
});

const pickPreferredCertificateEnrollment = (enrollments = [], { allowIneligible = true } = {}) => {
  const decorated = (Array.isArray(enrollments) ? enrollments : []).map((item) =>
    decorateEnrollmentWithCertificateEligibility(item),
  );
  const candidates = allowIneligible ? decorated : decorated.filter((item) => item.certificate_eligible);
  if (!candidates.length) return null;

  return [...candidates].sort((left, right) => {
    const eligibleDifference = Number(right.certificate_eligible) - Number(left.certificate_eligible);
    if (eligibleDifference !== 0) return eligibleDifference;

    const completedDifference =
      Number(String(right.status || '').toUpperCase() === 'COMPLETED') -
      Number(String(left.status || '').toUpperCase() === 'COMPLETED');
    if (completedDifference !== 0) return completedDifference;

    const completionDateDifference =
      parseComparableDate(right.certificate_completion_date || right.course_end_date || right.period_end_date) -
      parseComparableDate(left.certificate_completion_date || left.course_end_date || left.period_end_date);
    if (completionDateDifference !== 0) return completionDateDifference;

    const updateDifference =
      parseComparableDate(right.updated_at || right.enrollment_date) -
      parseComparableDate(left.updated_at || left.enrollment_date);
    if (updateDifference !== 0) return updateDifference;

    return Number(right.id || 0) - Number(left.id || 0);
  })[0];
};

module.exports = {
  decorateEnrollmentWithCertificateEligibility,
  getCertificateEligibility,
  getTodayIsoDate,
  normalizeDateOnly,
  pickPreferredCertificateEnrollment,
};
