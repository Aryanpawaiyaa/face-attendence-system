import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, loadAuth, saveAuth } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(loadAuth);

  useEffect(() => {
    const onLogout = () => setAuth(null);
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    const next = { user: data.data.user, accessToken: data.data.accessToken, refreshToken: data.data.refreshToken };
    saveAuth(next);
    setAuth(next);
    return next.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', { refreshToken: auth?.refreshToken });
    } catch {
      /* ignore */
    }
    saveAuth(null);
    setAuth(null);
  }, [auth]);

  const value = useMemo(
    () => ({
      user: auth?.user || null,
      isAuthed: !!auth?.accessToken,
      isAdmin: ['SUPER_ADMIN', 'ADMIN'].includes(auth?.user?.role),
      login,
      logout,
    }),
    [auth, login, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
