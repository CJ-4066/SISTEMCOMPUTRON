const crypto = require('crypto');
const env = require('../config/env');

const RECEIPT_TOKEN_REGEX = /^[A-Za-z0-9_-]{16,128}$/;
const ENCRYPTED_TOKEN_PATTERN = /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i;

const buildEncryptionKey = () => {
  const source =
    String(env.receiptTokenEncryptionKey || '').trim() ||
    String(env.jwt?.refreshSecret || '').trim() ||
    String(env.jwt?.accessSecret || '').trim() ||
    'computron-receipt-token-default-key';

  return crypto.createHash('sha256').update(source).digest();
};

const ENCRYPTION_KEY = buildEncryptionKey();

const hashReceiptToken = (token) =>
  crypto
    .createHash('sha256')
    .update(String(token || '').trim())
    .digest('hex');

const isReceiptTokenEncrypted = (value) => ENCRYPTED_TOKEN_PATTERN.test(String(value || '').trim());

const encryptReceiptToken = (token) => {
  const normalized = String(token || '').trim();
  if (!RECEIPT_TOKEN_REGEX.test(normalized)) {
    throw new Error('Token de boleta inválido para cifrado.');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

const decryptReceiptToken = (value) => {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';

  if (!isReceiptTokenEncrypted(rawValue)) {
    if (RECEIPT_TOKEN_REGEX.test(rawValue)) return rawValue;
    throw new Error('Formato de token de boleta no soportado.');
  }

  const [ivHex, tagHex, encryptedHex] = rawValue.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');

  if (!RECEIPT_TOKEN_REGEX.test(decrypted)) {
    throw new Error('Token descifrado inválido.');
  }

  return decrypted;
};

module.exports = {
  RECEIPT_TOKEN_REGEX,
  hashReceiptToken,
  isReceiptTokenEncrypted,
  encryptReceiptToken,
  decryptReceiptToken,
};
