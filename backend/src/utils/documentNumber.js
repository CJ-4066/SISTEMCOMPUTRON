const normalizeDocumentNumber = (value) => {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
};

module.exports = {
  normalizeDocumentNumber,
};
