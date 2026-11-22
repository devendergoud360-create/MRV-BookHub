const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (!(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

export async function getHealth() {
  try { return await api('/health'); } catch (e) { return { success: false, message: e.message }; }
}
