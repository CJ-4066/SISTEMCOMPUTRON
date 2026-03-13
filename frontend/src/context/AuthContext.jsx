import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api, { clearAuthToken, configureAuthHandlers, setAuthToken } from '../services/api';
import { getCampusScopeId, setCampusScopeId } from '../utils/campusScope';

const AuthContext = createContext(null);

const STORAGE_KEY = 'computron_auth';
const emptyAuth = { accessToken: '', refreshToken: '', user: null };

const readStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export function AuthProvider({ children }) {
  const stored = readStorage();

  const [auth, setAuth] = useState(stored || { ...emptyAuth });
  const authRef = useRef(auth);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authRef.current = auth;
    setAuthToken(auth.accessToken);
    if (auth.accessToken || auth.refreshToken || auth.user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [auth]);

  useEffect(() => {
    configureAuthHandlers({
      getRefreshToken: () => authRef.current.refreshToken,
      onTokensUpdated: ({ accessToken, refreshToken }) => {
        setAuth((prev) => ({
          ...prev,
          accessToken: accessToken || prev.accessToken,
          refreshToken: refreshToken || prev.refreshToken,
        }));
      },
      onAuthFailure: () => {
        setAuth({ ...emptyAuth });
        clearAuthToken();
        setCampusScopeId(null);
      },
    });
  }, []);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const currentAuth = authRef.current;
      if (!currentAuth.accessToken && !currentAuth.refreshToken) {
        if (active) setLoading(false);
        return;
      }

      try {
        if (!currentAuth.accessToken && currentAuth.refreshToken) {
          const refreshResponse = await api.post(
            '/auth/refresh',
            { refresh_token: currentAuth.refreshToken },
            { _skipAuthRefresh: true },
          );

          const refreshedAccessToken = refreshResponse.data?.access_token || '';
          const refreshedRefreshToken = refreshResponse.data?.refresh_token || currentAuth.refreshToken;

          if (!refreshedAccessToken) {
            throw new Error('No se pudo refrescar la sesión');
          }

          setAuthToken(refreshedAccessToken);

          if (active) {
            setAuth((prev) => ({
              ...prev,
              accessToken: refreshedAccessToken,
              refreshToken: refreshedRefreshToken,
            }));
          }
        }

        const meResponse = await api.get('/auth/me');
        if (active) {
          setAuth((prev) => ({ ...prev, user: meResponse.data.user }));
          if (!getCampusScopeId() && meResponse.data?.user?.base_campus_id) {
            setCampusScopeId(meResponse.data.user.base_campus_id);
          }
        }
      } catch {
        if (active) {
          setAuth({ ...emptyAuth });
          clearAuthToken();
          setCampusScopeId(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const response = await api.post('/auth/login', {
        email: email.trim().toLowerCase(),
        password,
      });
      setAuth({
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        user: response.data.user,
      });
      setAuthToken(response.data.access_token);
      if (!getCampusScopeId() && response.data?.user?.base_campus_id) {
        setCampusScopeId(response.data.user.base_campus_id);
      }
      return { ok: true };
    } catch (error) {
      const statusCode = error?.response?.status;
      const retryAfterSeconds = Number(error?.response?.headers?.['retry-after'] || 0);
      const responseData = error?.response?.data;
      const responseMessage =
        (typeof responseData === 'string' && responseData.trim()) ||
        (typeof responseData?.message === 'string' && responseData.message.trim()) ||
        '';
      const rateLimitMessage =
        statusCode === 429
          ? `Demasiadas solicitudes al servidor. ${
              retryAfterSeconds > 0
                ? `Intenta nuevamente en ~${Math.max(1, Math.ceil(retryAfterSeconds / 60))} minuto(s).`
                : 'Intenta nuevamente en unos minutos.'
            }`
          : '';
      const message =
        rateLimitMessage ||
        responseMessage ||
        'No se pudo conectar con la API. Verifica que el backend esté activo y que el proxy de Vite apunte a http://localhost:4000';
      return { ok: false, message };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (authRef.current.refreshToken) {
        await api.post(
          '/auth/logout',
          { refresh_token: authRef.current.refreshToken },
          { _skipAuthRefresh: true },
        );
      }
    } catch {
      // no-op
    } finally {
      setAuth({ ...emptyAuth });
      clearAuthToken();
      setCampusScopeId(null);
    }
  };

  const permissions = useMemo(() => auth.user?.permissions || [], [auth.user]);
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);

  const hasPermission = (permissionCode) => {
    if (!permissionCode) return false;
    return permissionSet.has(permissionCode);
  };

  const hasAnyPermission = (permissionCodes = []) => {
    if (!permissionCodes.length) return true;
    return permissionCodes.some((permissionCode) => permissionSet.has(permissionCode));
  };

  const value = {
    user: auth.user,
    permissions,
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    loading,
    isAuthenticated: Boolean(auth.accessToken && auth.user),
    hasPermission,
    hasAnyPermission,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
};
