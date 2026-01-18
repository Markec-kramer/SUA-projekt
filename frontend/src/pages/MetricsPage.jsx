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
  const [totalCalls, setTotalCalls] = useState(0);
  const [totalEndpoints, setTotalEndpoints] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generateTestData() {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${LOG_SERVICE_URL}/test/generate-logs?count=150`, {
        method: 'POST'
      });

      if (!res.ok) {
        throw new Error('Failed to generate test data');
      }

      setMessage('Test data generated! Refreshing metrics...');
      setTimeout(() => {
        loadMetrics();
        setMessage('');
      }, 1000);
    } catch (err) {
      console.error('Error generating test data:', err);
      setError('Failed to generate test data: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

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
      let totalCallsCount = 0;
      const uniqueEndpoints = new Set();

      (data.logs || []).forEach((log) => {
        // Extract endpoint from message
        const msg = log.message || '';
        const levelMatch = msg.match(/\b(INFO|ERROR|WARN|DEBUG)\s+([^\s]+)\s+Correlation:/);
        let endpoint = '(unknown)';
        if (levelMatch && levelMatch[2]) endpoint = levelMatch[2];

        // Fallback to raw_data
        if (endpoint === '(unknown)' && log.raw_data) {
          endpoint = log.raw_data.path || log.raw_data.url || endpoint;
        }

        const svc = log.service || (log.raw_data && log.raw_data.service) || '(unknown)';
        if (!byService[svc]) byService[svc] = {};
        byService[svc][endpoint] = (byService[svc][endpoint] || 0) + 1;

        totalCallsCount++;
        uniqueEndpoints.add(`${svc}:${endpoint}`);
      });

      setMetrics(byService);
      setTotalCalls(totalCallsCount);
      setTotalEndpoints(uniqueEndpoints.size);
    } catch (err) {
      console.error('Failed to load metrics', err);
      setError(String(err.message || err));
    } finally {
      setLoading(false);
    }
  }

  // Calculate top endpoints across all services
  const getTopEndpoints = () => {
    const allEndpoints = [];
    Object.entries(metrics).forEach(([service, endpoints]) => {
      Object.entries(endpoints).forEach(([endpoint, count]) => {
        allEndpoints.push({ service, endpoint, count });
      });
    });
    return allEndpoints.sort((a, b) => b.count - a.count).slice(0, 5);
  };

  const topEndpoints = getTopEndpoints();

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div>
        <h1 className="text-3xl font-bold mb-2">API Metrics</h1>
        <p className="text-slate-400">Monitor endpoint usage and track API calls</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-600/10 to-blue-800/10 border-blue-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm mb-1">Total API Calls</p>
              <p className="text-3xl font-bold text-blue-400">{totalCalls.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-blue-600/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-purple-600/10 to-purple-800/10 border-purple-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm mb-1">Unique Endpoints</p>
              <p className="text-3xl font-bold text-purple-400">{totalEndpoints}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-purple-600/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-green-600/10 to-green-800/10 border-green-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm mb-1">Active Services</p>
              <p className="text-3xl font-bold text-green-400">{Object.keys(metrics).length}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-green-600/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
          </div>
        </Card>
      </div>

      {/* Date Range Filter */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-300 mb-2">Date Range</label>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">From</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">To</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={loadMetrics}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </span>
              )}
            </Button>
            <Button
              onClick={() => {
                setFrom(formatDateYYYYMMDD(new Date()));
                setTo(formatDateYYYYMMDD(new Date()));
              }}
              variant="secondary"
            >
              Today
            </Button>
            <Button
              onClick={generateTestData}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Generate Test Data
              </span>
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/50 rounded-lg p-3">
            <p className="text-red-400 text-sm">Error: {error}</p>
          </div>
        )}

        {message && (
          <div className="mt-4 bg-green-500/10 border border-green-500/50 rounded-lg p-3">
            <p className="text-green-400 text-sm">{message}</p>
          </div>
        )}
      </Card>

      {/* Top 5 Endpoints */}
      {topEndpoints.length > 0 && (
        <Card>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Top 5 Most Called Endpoints
          </h2>
          <div className="space-y-2">
            {topEndpoints.map((item, index) => {
              const percentage = totalCalls > 0 ? (item.count / totalCalls * 100).toFixed(1) : 0;
              return (
                <div key={`${item.service}-${item.endpoint}`} className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold text-slate-500">#{index + 1}</span>
                      <div>
                        <p className="font-semibold text-white">
                          <code className="bg-slate-800 px-2 py-1 rounded text-sm">{item.endpoint}</code>
                        </p>
                        <p className="text-sm text-slate-400">{item.service}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-400">{item.count}</p>
                      <p className="text-xs text-slate-400">{percentage}% of total</p>
                    </div>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-600 h-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Detailed Metrics by Service */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Detailed Metrics by Service</h2>
        {Object.keys(metrics).length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-5xl mb-4">📊</div>
            <h3 className="text-xl font-semibold mb-2">No metrics data available</h3>
            <p className="text-slate-400 mb-6">Try adjusting the date range or check if services are logging data.</p>
            <Button onClick={loadMetrics} className="bg-blue-600 hover:bg-blue-700">
              Refresh Data
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(metrics).map(([service, endpoints]) => {
              const rows = Object.entries(endpoints).sort((a, b) => b[1] - a[1]);
              const total = rows.reduce((s, r) => s + r[1], 0);
              const percentage = totalCalls > 0 ? (total / totalCalls * 100).toFixed(1) : 0;

              return (
                <Card key={service} className="overflow-hidden">
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-700">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">{service}</h3>
                        <p className="text-sm text-slate-400">{rows.length} endpoints • {total} total calls • {percentage}% of traffic</p>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-sm text-slate-400 border-b border-slate-700">
                          <th className="pb-3 pr-4 font-medium">Endpoint</th>
                          <th className="pb-3 pr-4 font-medium text-right">Calls</th>
                          <th className="pb-3 font-medium">Usage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(([endpoint, count]) => {
                          const endpointPercentage = total > 0 ? (count / total * 100).toFixed(1) : 0;
                          return (
                            <tr key={endpoint} className="border-b border-slate-700/50 last:border-0">
                              <td className="py-3 pr-4">
                                <code className="bg-slate-900 px-2 py-1 rounded text-sm text-blue-400">{endpoint}</code>
                              </td>
                              <td className="py-3 pr-4 text-right font-semibold">{count}</td>
                              <td className="py-3">
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 bg-slate-900 rounded-full h-2 overflow-hidden">
                                    <div
                                      className="bg-gradient-to-r from-blue-600 to-purple-600 h-full transition-all duration-500"
                                      style={{ width: `${endpointPercentage}%` }}
                                    ></div>
                                  </div>
                                  <span className="text-sm text-slate-400 min-w-[3rem] text-right">{endpointPercentage}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
