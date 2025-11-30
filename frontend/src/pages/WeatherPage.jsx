import { useState } from "react";
import Card from "../components/Card";
import Button from "../components/Button";

const WEATHER_API_URL = "http://localhost:4004";

export default function WeatherPage() {
  const [city, setCity] = useState("");
  const [tempC, setTempC] = useState("");
  const [conditions, setConditions] = useState("");
  const [ttl, setTtl] = useState("");
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const sampleCities = ["oslo", "ljubljana", "maribor"];
  const [allWeathers, setAllWeathers] = useState([]);
  const [bulkJson, setBulkJson] = useState('[{"city":"testcity","tempC":10,"conditions":"sunny","ttl":120}]');
  const [bulkDeleteInput, setBulkDeleteInput] = useState('["testcity"]');

  // optional cityParam lets buttons fetch without changing the input first
  async function handleGet(e, cityParam) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    setMessage("");
    setResult(null);
    const target = cityParam ?? city;
    if (!target) {
      setMessage("Enter a city name.");
      return;
    }
    try {
      const res = await fetch(`${WEATHER_API_URL}/weather/${encodeURIComponent(target)}`);
      if (res.status === 404) {
        setMessage("No data for that city.");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage(err.message || "Error fetching data");
        return;
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      setMessage("Could not reach weather service");
    }
  }

  async function handlePut(e) {
    e.preventDefault();
    setMessage("");
    if (!city || tempC === "" || !conditions) {
      setMessage("City, temp and conditions are required.");
      return;
    }
    const body = { tempC: Number(tempC), conditions };
    if (ttl) body.ttl = Number(ttl);
    try {
      const res = await fetch(`${WEATHER_API_URL}/weather/${encodeURIComponent(city)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.message || "Error storing data");
        return;
      }
      setMessage(`Stored ${city} (ttl=${data.ttl})`);
      // Refresh the saved record from server so we show ttl/expiresAt as computed by backend
      try {
        const getRes = await fetch(`${WEATHER_API_URL}/weather/${encodeURIComponent(city)}`);
        if (getRes.ok) {
          const saved = await getRes.json();
          setResult(saved);
        } else {
          // fallback to minimal info if GET fails
          setResult({ city, tempC: Number(tempC), conditions, timestamp: data.timestamp, ttl: data.ttl });
        }
      } catch (err) {
        console.error(err);
        setResult({ city, tempC: Number(tempC), conditions, timestamp: data.timestamp, ttl: data.ttl });
      }
    } catch (err) {
      console.error(err);
      setMessage("Could not reach weather service");
    }
  }

  async function handleDelete() {
    setMessage("");
    setResult(null);
    if (!city) {
      setMessage("Enter a city name.");
      return;
    }
    try {
      const res = await fetch(`${WEATHER_API_URL}/weather/${encodeURIComponent(city)}`, {
        method: "DELETE",
      });
      if (res.status === 404) {
        setMessage("No data to delete for that city.");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage(err.message || "Error deleting data");
        return;
      }
      setMessage("Deleted");
    } catch (err) {
      console.error(err);
      setMessage("Could not reach weather service");
    }
  }

  // New: list all cached weather entries
  async function handleListAll() {
    setMessage("");
    try {
      const res = await fetch(`${WEATHER_API_URL}/weather`);
      if (!res.ok) {
        setMessage('Error listing weather');
        return;
      }
      const data = await res.json();
      setAllWeathers(data);
    } catch (err) {
      console.error(err);
      setMessage('Could not reach weather service');
    }
  }

  // New: POST /weather (create single)
  async function handlePostSingle() {
    setMessage("");
    if (!city || tempC === "" || !conditions) {
      setMessage('City, temp and conditions required');
      return;
    }
    try {
      const res = await fetch(`${WEATHER_API_URL}/weather`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, tempC: Number(tempC), conditions, ttl: ttl ? Number(ttl) : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.message || 'Error creating weather');
        return;
      }
      setMessage(`Created ${data.city} (ttl=${data.ttl})`);
    } catch (err) {
      console.error(err);
      setMessage('Could not reach weather service');
    }
  }

  // New: POST /weather/bulk
  async function handlePostBulk() {
    setMessage("");
    try {
      const payload = JSON.parse(bulkJson);
      const res = await fetch(`${WEATHER_API_URL}/weather/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.message || 'Error posting bulk');
        return;
      }
      setMessage(`Bulk created ${data.length} items`);
    } catch (err) {
      console.error(err);
      setMessage('Invalid JSON for bulk');
    }
  }

  // New: PUT /weather/bulk
  async function handlePutBulk() {
    setMessage("");
    try {
      const payload = JSON.parse(bulkJson);
      const res = await fetch(`${WEATHER_API_URL}/weather/bulk`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.message || 'Error updating bulk');
        return;
      }
      setMessage(`Bulk updated ${data.length} items`);
    } catch (err) {
      console.error(err);
      setMessage('Invalid JSON for bulk');
    }
  }

  // New: DELETE /weather (bulk) - provide cities array or use ?all=1
  async function handleBulkDelete(all = false) {
    setMessage("");
    try {
      if (all) {
        const res = await fetch(`${WEATHER_API_URL}/weather?all=1`, { method: 'DELETE' });
        if (!res.ok && res.status !== 204) {
          const data = await res.json().catch(() => ({}));
          setMessage(data.message || 'Error deleting all');
          return;
        }
        setMessage('Deleted all weather entries');
        return;
      }
      const cities = JSON.parse(bulkDeleteInput);
      const res = await fetch(`${WEATHER_API_URL}/weather`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cities }),
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        setMessage(data.message || 'Error deleting cities');
        return;
      }
      setMessage('Deleted specified cities');
    } catch (err) {
      console.error(err);
      setMessage('Invalid JSON for delete list or request failed');
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Weather</h1>
      <Card>
        <p className="mb-3">Simple UI to store and retrieve weather data (cached in Redis).</p>

        <div className="flex items-center gap-3 mb-3">
          <input className="p-2 rounded bg-slate-700" placeholder="city" value={city} onChange={(e) => setCity(e.target.value)} />
          <Button onClick={(e) => handleGet(e)}>Get</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </div>

        <div className="mb-4">
          <span className="mr-3 text-sm text-slate-300">Quick cities:</span>
          {sampleCities.map((c) => (
            <Button key={c} variant="ghost" onClick={() => { setCity(c); handleGet(null, c); }} className="mr-2">{c}</Button>
          ))}
        </div>

        <h2 className="font-semibold">Store / Update</h2>
        <form onSubmit={handlePut} className="flex flex-col max-w-md gap-3">
          <input className="p-2 rounded bg-slate-700" placeholder="city" value={city} onChange={(e) => setCity(e.target.value)} />
          <input className="p-2 rounded bg-slate-700" type="number" placeholder="tempC" value={tempC} onChange={(e) => setTempC(e.target.value)} />
          <input className="p-2 rounded bg-slate-700" placeholder="conditions" value={conditions} onChange={(e) => setConditions(e.target.value)} />
          <input className="p-2 rounded bg-slate-700" type="number" placeholder="ttl (seconds, optional)" value={ttl} onChange={(e) => setTtl(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit">Save</Button>
            <Button type="button" variant="secondary" onClick={handlePostSingle}>POST</Button>
          </div>
        </form>

        {message && <p className="mt-3">{message}</p>}

        {result && (
          <div className="mt-4">
            <h3 className="font-semibold">Result</h3>
            <div>City: <strong>{result.city}</strong></div>
            <div>TempC: <strong>{String(result.tempC)}</strong></div>
            <div>Conditions: <strong>{result.conditions}</strong></div>
            <div>Timestamp: <strong>{result.timestamp}</strong></div>
            {result.ttl !== undefined && result.ttl !== null ? (
              result.expiresAt ? (
                <div>Expires in: <strong>{result.ttl} seconds</strong> (<strong>{result.expiresAt}</strong>)</div>
              ) : (
                <div>Expires in: <strong>{result.ttl} seconds</strong></div>
              )
            ) : (
              <div>Expiry: <strong>persistent</strong></div>
            )}
            {result.source && <div>Source: <strong>{result.source}</strong></div>}
          </div>
        )}

        <div className="mt-6">
          <h3 className="font-semibold">List all cached weather</h3>
          <div className="flex gap-3 items-center my-3">
            <Button onClick={handleListAll}>List all</Button>
            <Button variant="ghost" onClick={() => setAllWeathers([])}>Clear list</Button>
          </div>
          {allWeathers.length > 0 && (
            <ul className="space-y-2">
              {allWeathers.map((w) => (
                <li key={w.city} className="p-2 bg-slate-700 rounded">{w.city} — {w.tempC}°C — {w.conditions} — ttl: {w.ttl ?? 'persistent'}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6">
          <h3 className="font-semibold">Bulk operations</h3>
          <label className="block text-sm mt-2">Bulk JSON (array)</label>
          <textarea className="w-full p-2 rounded bg-slate-800" rows={5} value={bulkJson} onChange={(e) => setBulkJson(e.target.value)} />
          <div className="flex gap-3 mt-2">
            <Button onClick={handlePostBulk}>POST bulk</Button>
            <Button onClick={handlePutBulk}>PUT bulk</Button>
          </div>

          <label className="block text-sm mt-4">Bulk delete (JSON array of city names)</label>
          <input className="w-full p-2 rounded bg-slate-800" value={bulkDeleteInput} onChange={(e) => setBulkDeleteInput(e.target.value)} />
          <div className="flex gap-3 mt-2">
            <Button variant="danger" onClick={() => handleBulkDelete(false)}>Delete listed</Button>
            <Button variant="danger" onClick={() => handleBulkDelete(true)}>Delete all</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
