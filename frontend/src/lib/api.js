import axios from 'axios';

const STORAGE_KEY = 'faceattend.auth';

export function loadAuth() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

export function saveAuth(auth) {
  if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  else localStorage.removeItem(STORAGE_KEY);
}

export const api = axios.create({ baseURL: '/api', timeout: 60000 });

api.interceptors.request.use((config) => {
  const auth = loadAuth();
  if (auth?.accessToken) config.headers.Authorization = `Bearer ${auth.accessToken}`;
  return config;
});

let refreshing = null;
async function refreshTokens() {
  const auth = loadAuth();
  if (!auth?.refreshToken) throw new Error('No refresh token');
  const { data } = await axios.post('/api/auth/refresh', { refreshToken: auth.refreshToken });
  const next = { ...auth, accessToken: data.data.accessToken, refreshToken: data.data.refreshToken || auth.refreshToken };
  saveAuth(next);
  return next;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;
    if (status === 401 && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true;
      try {
        refreshing = refreshing || refreshTokens();
        await refreshing;
        refreshing = null;
        return api(original);
      } catch {
        refreshing = null;
        saveAuth(null);
        window.dispatchEvent(new Event('auth:logout'));
      }
    }
    return Promise.reject(error);
  }
);

/** Unwraps { success, message, data } envelopes. */
export async function get(url, params) {
  const { data } = await api.get(url, { params });
  return data.data !== undefined ? data.data : data;
}
export async function post(url, body, config) {
  const { data } = await api.post(url, body, config);
  return data.data !== undefined ? data.data : data;
}
export async function put(url, body) {
  const { data } = await api.put(url, body);
  return data.data;
}
export async function patch(url, body) {
  const { data } = await api.patch(url, body);
  return data.data;
}
export async function del(url) {
  const { data } = await api.delete(url);
  return data.data;
}

export function errMsg(err) {
  const d = err?.response?.data;
  if (d?.errors?.length) return `${d.message}: ${d.errors.map((e) => `${e.field} ${e.message}`).join(', ')}`;
  return d?.message || d?.error || err?.message || 'Something went wrong';
}

/** URL with ?token= for <img>/EventSource (they cannot send headers). */
export function authedUrl(path) {
  const t = loadAuth()?.accessToken || '';
  return `/api${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(t)}`;
}

/**
 * Uploaded media (student photos, snapshots) is no longer public - the
 * backend requires auth on /uploads. Appends the access token.
 */
export function media(url) {
  if (!url) return '';
  if (/^(data:|blob:|https?:)/.test(url)) return url;
  const t = loadAuth()?.accessToken || '';
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(t)}`;
}

/** Downloads a file from an authenticated endpoint. */
export async function download(url, params, filename) {
  const res = await api.get(url, { params, responseType: 'blob' });
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  const cd = res.headers['content-disposition'] || '';
  a.download = filename || (cd.match(/filename="?([^"]+)"?/) || [])[1] || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}

export const asList = (d) => (Array.isArray(d) ? d : d?.items || []);
