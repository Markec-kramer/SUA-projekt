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
          <Button type="submit">Save</Button>
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
      </Card>
    </div>
  );
}
