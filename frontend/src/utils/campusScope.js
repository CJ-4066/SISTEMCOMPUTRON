const STORAGE_KEY = 'computron_campus_scope_id';

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

export const getCampusScopeId = () => {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

export const setCampusScopeId = (campusId) => {
  if (!canUseStorage()) return;

  if (!campusId) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, String(campusId));
};

