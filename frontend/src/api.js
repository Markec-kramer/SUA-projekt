const DEFAULT_BASE = import.meta.env.VITE_API_BASE || '';

export async function fetchWithAuth(url, opts = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...(opts.headers || {}), 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const finalUrl = url.startsWith('http') ? url : `${DEFAULT_BASE}${url}`;
  let res = await fetch(finalUrl, { ...opts, headers, credentials: 'include' });

  if (res.status === 401 || res.status === 403) {
    // try to refresh access token using refresh cookie
    try {
      const refreshRes = await fetch('http://localhost:4001/token/refresh', { method: 'POST', credentials: 'include' });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
          // retry original request with new token
          const retryHeaders = { ...(opts.headers || {}), 'Content-Type': 'application/json', 'Authorization': `Bearer ${data.token}` };
          const retry = await fetch(finalUrl, { ...opts, headers: retryHeaders, credentials: 'include' });
          return retry;
        }
      }
    } catch (err) {
      console.error('Refresh attempt failed', err);
    }

    // failed to refresh - clear auth and notify
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    import('react-toastify').then(({ toast }) => {
      toast.error('Neveljaven ali potečen token. Prosimo prijavite se znova.');
    });
    if (window.location.pathname !== '/login') {
      setTimeout(() => (window.location.pathname = '/login'), 800);
    }
  }

  return res;
}
