export const DOCUMENT_TYPE_OPTIONS = [
  { value: 'DNI', label: 'DNI' },
  { value: 'CE', label: 'Carnet de extranjeria' },
];

const normalizeType = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'CE' ? 'CE' : 'DNI';
};

export const parseDocumentValue = (value) => {
  const raw = String(value || '').trim();
  const prefixed = raw.match(/^(DNI|CE)\s*[-:]\s*(.+)$/i);
  if (prefixed) {
    return {
      document_type: normalizeType(prefixed[1]),
      document_number: prefixed[2].trim(),
    };
  }

  return {
    document_type: 'DNI',
    document_number: raw,
  };
};

export const buildDocumentValue = (documentType, documentNumber) => {
  const normalizedType = normalizeType(documentType);
  const normalizedNumber = String(documentNumber || '').trim();
  return normalizedNumber ? `${normalizedType}-${normalizedNumber}` : '';
};
