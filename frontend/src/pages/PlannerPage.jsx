import { useEffect, useState } from "react";

const PLANNER_API_URL = "http://localhost:4003";

export default function PlannerPage() {
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const [sessions, setSessions] = useState([]);
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [message, setMessage] = useState("");

  if (!user) {
    return <p>Dostop dovoljen samo prijavljenim uporabnikom.</p>;
  }

  // Load sessions on mount
  useEffect(() => {
    async function loadSessions() {
      try {
        const res = await fetch(`${PLANNER_API_URL}/study-sessions?user_id=${user.id}`);
        const data = await res.json();
        setSessions(data);
      } catch (err) {
        console.error(err);
        setMessage("Napaka pri nalaganju sessionov");
      }
    }

    loadSessions();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setMessage("");

    if (!title || !courseId || !startTime || !endTime) {
      setMessage("Vsa polja so obvezna.");
      return;
    }

    try {
      const res = await fetch(`${PLANNER_API_URL}/study-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          course_id: Number(courseId),
          title,
          start_time: startTime,
          end_time: endTime,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.detail || "Napaka pri ustvarjanju sessiona");
        return;
      }

      setSessions((prev) => [...prev, data]);
      setTitle("");
      setCourseId("");
      setStartTime("");
      setEndTime("");
      setMessage("Session uspešno ustvarjen!");
    } catch (err) {
      console.error(err);
      setMessage("Napaka pri povezavi s Planner Service");
    }
  }

  async function handleComplete(id) {
    try {
      const res = await fetch(`${PLANNER_API_URL}/study-sessions/${id}/complete`, {
        method: "POST",
      });

      if (res.ok) {
        setSessions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: "COMPLETED" } : s))
        );
      }
    } catch (err) {
      console.error(err);
      setMessage("Napaka pri označevanju kot completed");
    }
  }

  async function handleDelete(id) {
    try {
      const res = await fetch(`${PLANNER_API_URL}/study-sessions/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
      }
    } catch (err) {
      console.error(err);
      setMessage("Napaka pri brisanju sessiona");
    }
  }

  return (
    <div>
      <h1>Study Planner</h1>
      <p>Prijavljen si kot <strong>{user.name}</strong></p>

      <h2>Dodaj nov study session</h2>
      <form
        onSubmit={handleCreate}
        style={{ display: "flex", flexDirection: "column", maxWidth: "400px", gap: "8px" }}
      >
        <input
          type="text"
          placeholder="Naslov sessiona"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <input
          type="number"
          placeholder="Course ID"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
        />

        <label>Začetni čas:</label>
        <input
          type="datetime-local"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />

        <label>Končni čas:</label>
        <input
          type="datetime-local"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
        />

        <button type="submit">Dodaj session</button>
      </form>

      {message && <p style={{ marginTop: "10px" }}>{message}</p>}

      <h2 style={{ marginTop: "20px" }}>Moji sessioni</h2>
      {sessions.length === 0 ? (
        <p>Ni še nobenega sessiona.</p>
      ) : (
        <ul>
          {sessions.map((s) => (
            <li key={s.id} style={{ marginBottom: "12px" }}>
              <strong>{s.title}</strong> ({s.status}) <br />
              Course ID: {s.course_id}<br />
              Od: {s.start_time}<br />
              Do: {s.end_time}<br />

              {s.status !== "COMPLETED" && (
                <button
                  style={{ marginRight: "10px" }}
                  onClick={() => handleComplete(s.id)}
                >
                  Complete
                </button>
              )}

              <button onClick={() => handleDelete(s.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
