import { useState, useEffect } from "react";
import Card from "../components/Card";
import Button from "../components/Button";
import { fetchWithAuth } from '../api';

const WEATHER_API_URL = "http://localhost:4004";

export default function WeatherPage() {
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const [city, setCity] = useState("");
  const [tempC, setTempC] = useState("");
  const [conditions, setConditions] = useState("");
  const [ttl, setTtl] = useState("3600");
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [allWeathers, setAllWeathers] = useState([]);
  const [loading, setLoading] = useState(false);

  const sampleCities = ["Oslo", "Ljubljana", "Maribor", "London", "Paris"];

  useEffect(() => {
    if (user) {
      handleListAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleGet(e, cityParam) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    setMessage("");
    setResult(null);
    setLoading(true);
    const target = cityParam ?? city;
    if (!target) {
      setMessage("Enter a city name.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetchWithAuth(
        `${WEATHER_API_URL}/weather/${encodeURIComponent(target)}`
      );
      if (res.status === 404) {
        setMessage("No weather data found for that city.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage(err.message || "Error fetching data");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setResult(data);
      setCity(data.city);
    } catch (err) {
      console.error(err);
      setMessage("Could not reach weather service");
    } finally {
      setLoading(false);
    }
  }

  async function handlePut(e) {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    if (!city || tempC === "" || !conditions) {
      setMessage("City, temperature and conditions are required.");
      setLoading(false);
      return;
    }
    const body = { tempC: Number(tempC), conditions };
    if (ttl) body.ttl = Number(ttl);
    try {
      const res = await fetchWithAuth(
        `${WEATHER_API_URL}/weather/${encodeURIComponent(city)}`,
        {
          method: "PUT",
          body: JSON.stringify(body),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.message || "Error storing data");
        setLoading(false);
        return;
      }
      setMessage(`✓ Weather data saved for ${city}`);

      // Refresh data
      try {
        const getRes = await fetchWithAuth(
          `${WEATHER_API_URL}/weather/${encodeURIComponent(city)}`
        );
        if (getRes.ok) {
          const saved = await getRes.json();
          setResult(saved);
        }
      } catch (err) {
        console.error(err);
      }

      // Refresh list
      handleListAll();

      // Clear form
      setTimeout(() => {
        setTempC("");
        setConditions("");
        setMessage("");
      }, 2000);
    } catch (err) {
      console.error(err);
      setMessage("Could not reach weather service");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(cityToDelete) {
    setMessage("");
    const target = cityToDelete || city;
    if (!target) {
      setMessage("Enter a city name.");
      return;
    }
    try {
      const res = await fetchWithAuth(
        `${WEATHER_API_URL}/weather/${encodeURIComponent(target)}`,
        { method: "DELETE" }
      );
      if (res.status === 404) {
        setMessage("No data to delete for that city.");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage(err.message || "Error deleting data");
        return;
      }
      setMessage(`✓ Deleted weather data for ${target}`);
      setResult(null);
      handleListAll();
      setTimeout(() => setMessage(""), 2000);
    } catch (err) {
      console.error(err);
      setMessage("Could not reach weather service");
    }
  }

  async function handleListAll() {
    try {
      const res = await fetchWithAuth(`${WEATHER_API_URL}/weather`);
      if (!res.ok) return;
      const data = await res.json();
      setAllWeathers(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function generateSampleData() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetchWithAuth(`${WEATHER_API_URL}/test/seed-data`, {
        method: 'POST'
      });

      if (!res.ok) {
        setMessage("Failed to generate sample data");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setMessage(`✓ Generated sample data for: ${data.cities.join(', ')}`);

      // Refresh list
      await handleListAll();

      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error(err);
      setMessage("Could not reach weather service");
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Weather</h1>
        <Card>
          <p>Dostop dovoljen samo prijavljenim uporabnikom.</p>
        </Card>
      </div>
    );
  }

  // Weather icon mapper
  const getWeatherIcon = (conditions) => {
    const cond = conditions?.toLowerCase() || '';
    if (cond.includes('sun') || cond.includes('clear')) return '☀️';
    if (cond.includes('cloud')) return '☁️';
    if (cond.includes('rain')) return '🌧️';
    if (cond.includes('snow')) return '❄️';
    if (cond.includes('storm') || cond.includes('thunder')) return '⛈️';
    if (cond.includes('fog') || cond.includes('mist')) return '🌫️';
    return '🌤️';
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Weather Forecast</h1>
        <p className="text-slate-400">Check and manage weather data for cities</p>
      </div>

      {/* Quick Access Cities */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Quick Access Cities</h3>
          <Button
            onClick={generateSampleData}
            disabled={loading}
            className="bg-green-600 hover:bg-green-700 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Generate Sample Data
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {sampleCities.map((c) => (
            <Button
              key={c}
              onClick={() => handleGet(null, c)}
              variant="secondary"
              disabled={loading}
              className="flex items-center gap-2"
            >
              <span>{getWeatherIcon(allWeathers.find(w => w.city.toLowerCase() === c.toLowerCase())?.conditions)}</span>
              {c}
            </Button>
          ))}
        </div>
      </Card>

      {/* Search Section */}
      <Card>
        <h3 className="text-lg font-semibold mb-4">Search Weather</h3>
        <form onSubmit={handleGet} className="flex gap-3">
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Enter city name..."
            className="flex-1 px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </form>
      </Card>

      {/* Messages */}
      {message && (
        <div className={`rounded-lg p-4 ${message.includes('✓') ? 'bg-green-500/10 border border-green-500/50' : 'bg-red-500/10 border border-red-500/50'}`}>
          <p className={message.includes('✓') ? 'text-green-400' : 'text-red-400'}>{message}</p>
        </div>
      )}

      {/* Weather Result */}
      {result && (
        <Card className="bg-gradient-to-br from-blue-600/10 to-cyan-600/10 border-blue-500/20">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-4">
                <span className="text-6xl">{getWeatherIcon(result.conditions)}</span>
                <div>
                  <h2 className="text-3xl font-bold">{result.city}</h2>
                  <p className="text-slate-400">Weather Information</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-sm text-slate-400 mb-1">Temperature</p>
                  <p className="text-3xl font-bold text-blue-400">{result.tempC}°C</p>
                </div>

                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-sm text-slate-400 mb-1">Conditions</p>
                  <p className="text-xl font-semibold capitalize">{result.conditions}</p>
                </div>

                {result.timestamp && (
                  <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                    <p className="text-sm text-slate-400 mb-1">Last Updated</p>
                    <p className="text-sm">{new Date(result.timestamp).toLocaleString()}</p>
                  </div>
                )}

                {result.ttl && (
                  <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                    <p className="text-sm text-slate-400 mb-1">Cache TTL</p>
                    <p className="text-sm">{result.ttl} seconds</p>
                  </div>
                )}
              </div>
            </div>

            <Button
              onClick={() => handleDelete(result.city)}
              variant="danger"
              className="ml-4"
            >
              Delete
            </Button>
          </div>
        </Card>
      )}

      {/* Add/Update Weather Form */}
      <Card>
        <h3 className="text-lg font-semibold mb-4">Add or Update Weather Data</h3>
        <form onSubmit={handlePut} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                City Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g., Ljubljana"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Temperature (°C) <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                value={tempC}
                onChange={(e) => setTempC(e.target.value)}
                placeholder="e.g., 15"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Conditions <span className="text-red-400">*</span>
            </label>
            <select
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select conditions...</option>
              <option value="Sunny">☀️ Sunny</option>
              <option value="Cloudy">☁️ Cloudy</option>
              <option value="Rainy">🌧️ Rainy</option>
              <option value="Snowy">❄️ Snowy</option>
              <option value="Stormy">⛈️ Stormy</option>
              <option value="Foggy">🌫️ Foggy</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Cache TTL (seconds) <span className="text-slate-500">(Optional)</span>
            </label>
            <input
              type="number"
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
              placeholder="Default: 3600"
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-slate-500 mt-1">How long to cache this data</p>
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
              {loading ? 'Saving...' : 'Save Weather Data'}
            </Button>
            <Button
              type="button"
              onClick={() => { setCity(''); setTempC(''); setConditions(''); setTtl('3600'); setResult(null); }}
              variant="ghost"
            >
              Clear Form
            </Button>
          </div>
        </form>
      </Card>

      {/* All Cached Weather Data */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Cached Weather Data ({allWeathers.length})</h2>
          <Button onClick={handleListAll} variant="secondary">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </span>
          </Button>
        </div>

        {allWeathers.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-5xl mb-4">🌤️</div>
            <h3 className="text-xl font-semibold mb-2">No weather data cached</h3>
            <p className="text-slate-400">Add weather data for cities to see them here</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allWeathers.map((weather) => (
              <Card key={weather.city} className="hover:shadow-xl transition-all cursor-pointer" onClick={() => handleGet(null, weather.city)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">{getWeatherIcon(weather.conditions)}</span>
                    <div>
                      <h3 className="font-semibold text-lg">{weather.city}</h3>
                      <p className="text-sm text-slate-400 capitalize">{weather.conditions}</p>
                    </div>
                  </div>
                </div>

                <div className="text-3xl font-bold text-blue-400 mb-2">
                  {weather.tempC}°C
                </div>

                {weather.timestamp && (
                  <p className="text-xs text-slate-400">
                    Updated: {new Date(weather.timestamp).toLocaleString()}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
