import { useEffect, useState } from "react";
import Card from "../components/Card";
import Button from "../components/Button";

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
  const userId = user?.id;

  // Load sessions on mount
  useEffect(() => {
    async function loadSessions() {
      if (!userId) {
        // nothing to load when no user
        setSessions([]);
        return;
      }
      try {
        const res = await fetch(`${PLANNER_API_URL}/study-sessions?user_id=${userId}`);
        const data = await res.json();
        setSessions(data);
      } catch (err) {
        console.error(err);
        setMessage("Napaka pri nalaganju sessionov");
      }
    }

    loadSessions();
  }, [userId]);

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

  if (!user) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Study Planner</h1>
        <Card>
          <p>Dostop dovoljen samo prijavljenim uporabnikom.</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Study Planner</h1>
      <Card>
        <p>Prijavljen si kot <strong>{user.name}</strong></p>

        <h2 className="mt-4 font-semibold">Dodaj nov study session</h2>
        <form onSubmit={handleCreate} className="flex flex-col max-w-lg gap-3">
          <input className="p-2 rounded bg-slate-700" type="text" placeholder="Naslov sessiona" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="p-2 rounded bg-slate-700" type="number" placeholder="Course ID" value={courseId} onChange={(e) => setCourseId(e.target.value)} />
          <label className="text-sm">Začetni čas:</label>
          <input className="p-2 rounded bg-slate-700" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <label className="text-sm">Končni čas:</label>
          <input className="p-2 rounded bg-slate-700" type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          <Button type="submit">Dodaj session</Button>
        </form>

        {message && <p className="mt-3">{message}</p>}

        <h2 className="mt-6 font-semibold">Moji sessioni</h2>
        {sessions.length === 0 ? (
          <p>Ni še nobenega sessiona.</p>
        ) : (
          <ul>
            {sessions.map((s) => (
              <li key={s.id} className="mb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <strong>{s.title}</strong> ({s.status}) <br />
                    Course ID: {s.course_id}<br />
                    Od: {s.start_time}<br />
                    Do: {s.end_time}
                  </div>
                  <div className="flex gap-2">
                    {s.status !== "COMPLETED" && (
                      <Button variant="ghost" onClick={() => handleComplete(s.id)}>Complete</Button>
                    )}
                    <Button variant="danger" onClick={() => handleDelete(s.id)}>Delete</Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
