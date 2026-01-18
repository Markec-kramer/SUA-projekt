import { useEffect, useState } from "react";
import Card from "../components/Card";
import Button from "../components/Button";
import { fetchWithAuth } from '../api';

const LOG_SERVICE_URL = "http://localhost:4006";

function formatDateYYYYMMDD(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function MetricsPage() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return formatDateYYYYMMDD(d);
  });
  const [to, setTo] = useState(() => formatDateYYYYMMDD(new Date()));

  const [metrics, setMetrics] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMetrics() {
    setError("");
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${LOG_SERVICE_URL}/logs/${from}/${to}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Status ${res.status}`);
      }
      const data = await res.json();
      const byService = {};

      (data.logs || []).forEach((log) => {
        // try to extract endpoint from the formatted message
        // message format: "2026-01-04 11:03:08,610 INFO /healthz Correlation: ..."
        const msg = log.message || '';
        const levelMatch = msg.match(/\b(INFO|ERROR|WARN|DEBUG)\s+([^\s]+)\s+Correlation:/);
        let endpoint = '(unknown)';
        if (levelMatch && levelMatch[2]) endpoint = levelMatch[2];
        // fallback: maybe url is in raw_data.path or raw_data.url
        if (endpoint === '(unknown)' && log.raw_data) {
          endpoint = log.raw_data.path || log.raw_data.url || endpoint;
        }

        const svc = log.service || (log.raw_data && log.raw_data.service) || '(unknown)';
        if (!byService[svc]) byService[svc] = {};
        byService[svc][endpoint] = (byService[svc][endpoint] || 0) + 1;
      });

      setMetrics(byService);
    } catch (err) {
      console.error('Failed to load metrics', err);
      setError(String(err.message || err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Metrics / Število klicev po endpointih</h1>

      <Card>
        <div className="flex gap-3 items-end">
          <div>
            <label className="block text-sm text-slate-300">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="p-2 rounded bg-slate-700" />
          </div>
          <div>
            <label className="block text-sm text-slate-300">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="p-2 rounded bg-slate-700" />
          </div>

          <div className="ml-auto flex gap-2">
            <Button onClick={loadMetrics} disabled={loading}>{loading ? 'Nalagam...' : 'Osveži'}</Button>
            <Button onClick={() => { setFrom(formatDateYYYYMMDD(new Date())); setTo(formatDateYYYYMMDD(new Date())); }} variant="ghost">Dnes</Button>
          </div>
        </div>

        {error && <p className="mt-4 text-red-400">Napaka: {error}</p>}

        <div className="mt-6">
          {Object.keys(metrics).length === 0 ? (
            <p>Ni podatkov za prikaz.</p>
          ) : (
            Object.entries(metrics).map(([service, endpoints]) => {
              const rows = Object.entries(endpoints).sort((a, b) => b[1] - a[1]);
              const total = rows.reduce((s, r) => s + r[1], 0);
              return (
                <div key={service} className="mb-6">
                  <h2 className="font-semibold text-lg">{service} <span className="text-sm text-slate-400">(skupaj: {total})</span></h2>

                  <div className="overflow-x-auto mt-2">
                    <table className="min-w-full text-left">
                      <thead>
                        <tr className="text-slate-400 text-sm">
                          <th className="pb-2 pr-6">Endpoint</th>
                          <th className="pb-2">Klicev</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(([endpoint, count]) => (
                          <tr key={endpoint} className="border-t border-slate-700">
                            <td className="py-2 pr-6"><code className="bg-slate-800 p-1 rounded">{endpoint}</code></td>
                            <td className="py-2">{count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
