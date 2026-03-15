import { PERMISSIONS } from './permissions';

export const MANAGEMENT_SECTION_ITEMS = [
  {
    key: 'students',
    label: 'Matrícula',
    permissions: [PERMISSIONS.STUDENTS_VIEW, PERMISSIONS.STUDENTS_MANAGE],
  },
  {
    key: 'students_list',
    label: 'Alumnos',
    permissions: [PERMISSIONS.STUDENTS_VIEW, PERMISSIONS.STUDENTS_MANAGE],
  },
  {
    key: 'teachers',
    label: 'Docentes',
    permissions: [PERMISSIONS.TEACHERS_VIEW, PERMISSIONS.USERS_CREATE, PERMISSIONS.USERS_STATUS_MANAGE],
  },
  {
    key: 'courses',
    label: 'Cursos',
    permissions: [PERMISSIONS.COURSES_VIEW, PERMISSIONS.COURSES_MANAGE],
  },
  {
    key: 'campuses',
    label: 'Sedes',
    permissions: [PERMISSIONS.CAMPUSES_VIEW, PERMISSIONS.CAMPUSES_MANAGE],
  },
  {
    key: 'periods',
    label: 'Periodos',
    permissions: [PERMISSIONS.PERIODS_VIEW, PERMISSIONS.PERIODS_MANAGE],
  },
  {
    key: 'payments',
    label: 'Pagos',
    permissions: [PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.PAYMENTS_MANAGE],
  },
  {
    key: 'certificates',
    label: 'Certificados',
    permissions: [PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.PAYMENTS_MANAGE],
  },
];

export const buildManagementSectionPath = (sectionKey) => {
  const params = new URLSearchParams();
  if (sectionKey) {
    params.set('section', sectionKey);
  }

  const query = params.toString();
  return query ? `/management?${query}` : '/management';
};
