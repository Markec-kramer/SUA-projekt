import { useState } from "react";
import Card from "../components/Card";
import Button from "../components/Button";

const RECO_API_URL = "http://localhost:4005";

export default function RecommendationsPage() {
  const [userId, setUserId] = useState("");
  const [recs, setRecs] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [score, setScore] = useState("");
  const [reason, setReason] = useState("");
  const [ttl, setTtl] = useState("");
  const [message, setMessage] = useState("");

  // list recommendations; optional userIdParam overrides the current input
  async function handleList(e, userIdParam) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    setMessage("");
    setRecs([]);
    const target = userIdParam ?? userId;
    if (!target) {
      setMessage("Enter a userId to list recommendations.");
      return;
    }
    try {
      const res = await fetch(`${RECO_API_URL}/recommendations/${encodeURIComponent(target)}`);
      if (res.status === 404) {
        setMessage("No recommendations for that user.");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage(err.message || "Error fetching recommendations");
        return;
      }
      const data = await res.json();
      setRecs(data);
    } catch (err) {
      console.error(err);
      setMessage("Could not reach recommendation service");
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setMessage("");
    if (!userId || courseId === "") {
      setMessage("userId and courseId are required.");
      return;
    }
    const body = { courseId: Number(courseId) };
    if (score) body.score = Number(score);
    if (reason) body.reason = reason;
    if (ttl) body.ttl = Number(ttl);
    try {
      const res = await fetch(`${RECO_API_URL}/recommendations/${encodeURIComponent(userId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.message || "Error creating recommendation");
        return;
      }
      setMessage(`Created recommendation ${data.id}`);
      // refresh list
      await handleList();
      setCourseId("");
      setScore("");
      setReason("");
      setTtl("");
    } catch (err) {
      console.error(err);
      setMessage("Could not reach recommendation service");
    }
  }

  async function handleDelete() {
    setMessage("");
    if (!userId) {
      setMessage("Enter a userId first.");
      return;
    }
    try {
      const res = await fetch(`${RECO_API_URL}/recommendations/${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      if (res.status === 404) {
        setMessage("No recommendations to delete for that user.");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage(err.message || "Error deleting recommendations");
        return;
      }
      setMessage("Deleted recommendations for user");
      setRecs([]);
    } catch (err) {
      console.error(err);
      setMessage("Could not reach recommendation service");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Recommendations</h1>
      <Card>
        <p>View and manage course recommendations for a user.</p>

        <div className="my-3">
          <form className="flex gap-3 items-center" onSubmit={(e) => e.preventDefault()}>
            <input className="p-2 rounded bg-slate-700" placeholder="userId" value={userId} onChange={(e) => setUserId(e.target.value)} />
            <Button onClick={(e) => handleList(e)}>List</Button>
            <Button variant="danger" onClick={handleDelete}>Delete all</Button>
          </form>
        </div>

        <h2 className="font-semibold">Create recommendation</h2>
        <form onSubmit={handleCreate} className="flex flex-col max-w-md gap-3">
          <input className="p-2 rounded bg-slate-700" placeholder="userId" value={userId} onChange={(e) => setUserId(e.target.value)} />
          <input className="p-2 rounded bg-slate-700" type="number" placeholder="courseId" value={courseId} onChange={(e) => setCourseId(e.target.value)} />
          <input className="p-2 rounded bg-slate-700" type="number" step="0.01" placeholder="score (0-1)" value={score} onChange={(e) => setScore(e.target.value)} />
          <input className="p-2 rounded bg-slate-700" placeholder="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <input className="p-2 rounded bg-slate-700" type="number" placeholder="ttl (seconds, optional)" value={ttl} onChange={(e) => setTtl(e.target.value)} />
          <Button type="submit">Create</Button>
        </form>

        {message && <p className="mt-3">{message}</p>}

        <h2 className="mt-6 font-semibold">Recommendations</h2>
        {recs.length === 0 ? (
          <p>No recommendations to show.</p>
        ) : (
          <ul>
            {recs.map((r) => (
              <li key={r.id} className="mb-4">
                <div>
                  <strong>Course {r.courseId}</strong> (score: {r.score ?? 'n/a'})<br />
                  Reason: {r.reason ?? 'n/a'}<br />
                  <small className="text-slate-400">CreatedAt: {r.createdAt}</small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
