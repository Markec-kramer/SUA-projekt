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
// ===== METRICS SERVICE FUNCTIONS =====
const METRICS_SERVICE_URL = "http://localhost:4007";

export async function getMetricsLastCalled() {
  try {
    const res = await fetch(`${METRICS_SERVICE_URL}/metrics/last-called`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Error fetching last called metric:', err);
    throw err;
  }
}

export async function getMetricsMostCalled() {
  try {
    const res = await fetch(`${METRICS_SERVICE_URL}/metrics/most-called`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Error fetching most called metric:', err);
    throw err;
  }
}

export async function getMetricsCallCounts() {
  try {
    const res = await fetch(`${METRICS_SERVICE_URL}/metrics/call-counts`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Error fetching call counts:', err);
    throw err;
  }
}

export async function recordMetricCall(klicanaStoritev, method = 'GET', service_name = 'frontend') {
  try {
    const res = await fetch(`${METRICS_SERVICE_URL}/metrics/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ klicanaStoritev, method, service_name })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Error recording metric:', err);
    throw err;
  }
}

export async function getMetricsHealthCheck() {
  try {
    const res = await fetch(`${METRICS_SERVICE_URL}/healthz`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Metrics service health check failed:', err);
    throw err;
  }
}

export async function clearMetricsBacklog() {
  try {
    const res = await fetch(`${METRICS_SERVICE_URL}/metrics/backlog`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Error clearing metrics backlog:', err);
    throw err;
  }
}