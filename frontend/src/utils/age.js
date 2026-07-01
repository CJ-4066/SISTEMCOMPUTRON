const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const normalizeDateOnly = (dateValue) => {
  if (!dateValue) return '';

  const match = String(dateValue).match(/^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/);
  return match?.[1] || '';
};

export const calculateAgeFromBirthDate = (birthDateValue, referenceDate = new Date()) => {
  const normalizedBirthDate = normalizeDateOnly(birthDateValue);
  if (!DATE_ONLY_PATTERN.test(normalizedBirthDate)) {
    return null;
  }

  const [yearText, monthText, dayText] = normalizedBirthDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const birthDate = new Date(year, month - 1, day);
  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  let age = referenceDate.getFullYear() - year;
  const monthDiff = referenceDate.getMonth() - (month - 1);
  const dayDiff = referenceDate.getDate() - day;

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  if (!Number.isFinite(age) || age < 0) {
    return null;
  }

  return age;
};

export const formatAgeLabel = (age) => {
  if (age === null || age === undefined) return '';
  return `${age} año${age === 1 ? '' : 's'}`;
};
