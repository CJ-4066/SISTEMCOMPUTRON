import { PERMISSIONS } from './permissions';

export const DASHBOARD_SECTION_ITEMS = [
  {
    key: 'overview',
    label: 'Resumen',
    permissions: [PERMISSIONS.DASHBOARD_VIEW],
  },
  {
    key: 'payments',
    label: 'Pagos',
    permissions: [PERMISSIONS.PAYMENTS_VIEW],
  },
  {
    key: 'morosity',
    label: 'Morosidad',
    permissions: [PERMISSIONS.REPORTS_VIEW],
  },
];

export const buildDashboardSectionPath = (sectionKey) => {
  const params = new URLSearchParams();
  if (sectionKey) {
    params.set('section', sectionKey);
  }

  const query = params.toString();
  return query ? `/?${query}` : '/';
};
