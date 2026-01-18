import { useEffect, useState } from "react";
import Card from "../components/Card";
import Button from "../components/Button";
import { getMetricsLastCalled, getMetricsMostCalled, getMetricsCallCounts, clearMetricsBacklog } from '../api';

export default function MetricsPage() {
  const [lastCalled, setLastCalled] = useState(null);
  const [mostCalled, setMostCalled] = useState(null);
  const [callCounts, setCallCounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clearingBacklog, setClearingBacklog] = useState(false);

  useEffect(() => {
    loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMetrics() {
    setError("");
    setLoading(true);
    try {
      const [lastCalledData, mostCalledData, callCountsData] = await Promise.all([
        getMetricsLastCalled().catch(e => {
          console.warn('Error getting last called:', e);
          return null;
        }),
        getMetricsMostCalled().catch(e => {
          console.warn('Error getting most called:', e);
          return null;
        }),
        getMetricsCallCounts().catch(e => {
          console.warn('Error getting call counts:', e);
          return [];
        })
      ]);

      setLastCalled(lastCalledData);
      setMostCalled(mostCalledData);
      setCallCounts(Array.isArray(callCountsData) ? callCountsData : []);
    } catch (err) {
      console.error('Failed to load metrics', err);
      setError(String(err.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function handleClearBacklog() {
    if (!window.confirm('Ali res želite obrisati ves backlog API klicev?')) {
      return;
    }
    setClearingBacklog(true);
    setError("");
    try {
      const result = await clearMetricsBacklog();
      setError("");
      // Refresh metrics after clearing
      setTimeout(() => loadMetrics(), 500);
    } catch (err) {
      console.error('Failed to clear backlog:', err);
      setError(`Napaka pri brisanju backlog-a: ${err.message}`);
      setClearingBacklog(false);
    }
  }

  const totalCalls = callCounts.reduce((sum, item) => sum + Number(item.call_count || 0), 0);
  const uniqueEndpoints = callCounts.length;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div>
        <h1 className="text-3xl font-bold mb-2">API Metriki</h1>
        <p className="text-slate-400">Spremljanje API klicev in statistike - Metrics Service</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-600/10 to-blue-800/10 border-blue-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm mb-1">Skupni API Klici</p>
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
              <p className="text-slate-400 text-sm mb-1">Edinstveni Endpointi</p>
              <p className="text-3xl font-bold text-purple-400">{uniqueEndpoints}</p>
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
              <p className="text-slate-400 text-sm mb-1">Zadnje Klican</p>
              <p className="text-lg font-bold text-green-400">
                {lastCalled ? (
                  <code className="text-xs bg-slate-800 px-2 py-1 rounded">{lastCalled.endpoint}</code>
                ) : (
                  <span className="text-slate-500">-</span>
                )}
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-green-600/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
          </div>
        </Card>
      </div>

      {/* Control Buttons */}
      <Card>
        <div className="flex flex-col md:flex-row gap-3">
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
                Nalagam...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Osveži
              </span>
            )}
          </Button>

          <Button
            onClick={handleClearBacklog}
            disabled={clearingBacklog}
            className="bg-red-600 hover:bg-red-700"
          >
            {clearingBacklog ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Brisujem...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Zbriši Backlog
              </span>
            )}
          </Button>
        </div>

        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/50 rounded-lg p-3">
            <p className="text-red-400 text-sm">Napaka: {error}</p>
          </div>
        )}
      </Card>

      {/* Most Called & Last Called Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mostCalled && (
          <Card className="bg-gradient-to-br from-yellow-600/10 to-yellow-800/10 border-yellow-500/20">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              Najpogosteje Klican Endpoint
            </h3>
            <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
              <p className="text-sm text-slate-400 mb-2">Endpoint</p>
              <code className="text-lg font-bold text-yellow-400 bg-slate-800 px-3 py-2 rounded block mb-3">{mostCalled.endpoint}</code>
              <p className="text-sm text-slate-400 mb-1">Metoda</p>
              <span className="inline-block bg-slate-800 px-3 py-1 rounded text-sm font-semibold text-yellow-400 mb-3">{mostCalled.method}</span>
              <p className="text-sm text-slate-400 mb-1">Število Klicev</p>
              <p className="text-3xl font-bold text-yellow-400">{mostCalled.call_count}</p>
            </div>
          </Card>
        )}

        {lastCalled && (
          <Card className="bg-gradient-to-br from-cyan-600/10 to-cyan-800/10 border-cyan-500/20">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Zadnje Klican Endpoint
            </h3>
            <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
              <p className="text-sm text-slate-400 mb-2">Endpoint</p>
              <code className="text-lg font-bold text-cyan-400 bg-slate-800 px-3 py-2 rounded block mb-3">{lastCalled.endpoint}</code>
              <p className="text-sm text-slate-400 mb-1">Metoda</p>
              <span className="inline-block bg-slate-800 px-3 py-1 rounded text-sm font-semibold text-cyan-400 mb-3">{lastCalled.method}</span>
              <p className="text-sm text-slate-400 mb-1">Čas Klica</p>
              <p className="text-sm text-cyan-400">{new Date(lastCalled.timestamp).toLocaleString('sl-SI')}</p>
            </div>
          </Card>
        )}
      </div>
      {/* All Endpoints List */}
      {callCounts.length > 0 && (
        <Card>
          <h2 className="text-xl font-semibold mb-4">Vsi Klici po Endpointih</h2>
          <div className="space-y-2">
            {callCounts.map((item) => {
              const percentage = totalCalls > 0 ? (item.call_count / totalCalls * 100).toFixed(1) : 0;
              return (
                <div key={`${item.endpoint}-${item.method}`} className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <span className="inline-block bg-blue-600 text-white text-xs font-semibold px-2 py-1 rounded">
                        {item.method}
                      </span>
                      <code className="text-sm text-blue-400">{item.endpoint}</code>
                    </div>
                    <div className="text-right min-w-[120px]">
                      <p className="font-bold text-white">{item.call_count}</p>
                      <p className="text-xs text-slate-400">{percentage}%</p>
                    </div>
                  </div>
                  <div className="mt-2 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-blue-500 h-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Empty State */}
      {callCounts.length === 0 && !loading && (
        <Card className="text-center py-12">
          <div className="text-5xl mb-4">📊</div>
          <h3 className="text-xl font-semibold mb-2">Ni podatkov o klicih</h3>
          <p className="text-slate-400">Metriki bodo prikazani, ko bo Metrics Service primal klice.</p>
        </Card>
      )}
    </div>
  );
}
