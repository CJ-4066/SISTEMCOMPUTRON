const normalizeFileName = (filename = 'reporte.xlsx') => {
  const trimmed = String(filename || '').trim();
  if (!trimmed) return 'reporte.xlsx';
  if (trimmed.toLowerCase().endsWith('.xlsx')) return trimmed;
  return `${trimmed.replace(/\.[^.]+$/, '')}.xlsx`;
};

export const downloadExcel = async ({ filename, headers, rows, sheetName = 'Reporte' }) => {
  const { utils, writeFile } = await import('xlsx');

  const headerLabels = headers.map((column) => column.label);
  const bodyRows = rows.map((row) =>
    headers.map((column) => {
      const value = row[column.key];
      return value === null || value === undefined ? '' : value;
    }),
  );

  const worksheet = utils.aoa_to_sheet([headerLabels, ...bodyRows]);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, String(sheetName || 'Reporte').slice(0, 31));
  writeFile(workbook, normalizeFileName(filename));
};

export const downloadCsv = downloadExcel;
