const QRCode = require('qrcode');

const qrCache = new Map();
const MAX_CACHE_ITEMS = 500;

const trimCacheIfNeeded = () => {
  while (qrCache.size > MAX_CACHE_ITEMS) {
    const firstKey = qrCache.keys().next().value;
    if (!firstKey) break;
    qrCache.delete(firstKey);
  }
};

const buildQrDataUrl = async (value, options = {}) => {
  const content = String(value || '').trim();
  if (!content) return '';

  const width = Number(options.width || 180);
  const margin = Number(options.margin || 1);
  const key = `${width}:${margin}:${content}`;

  if (qrCache.has(key)) {
    return qrCache.get(key);
  }

  const dataUrl = await QRCode.toDataURL(content, {
    width,
    margin,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#111111',
      light: '#FFFFFFFF',
    },
  });

  qrCache.set(key, dataUrl);
  trimCacheIfNeeded();
  return dataUrl;
};

module.exports = {
  buildQrDataUrl,
};
