import { useState } from "react";
import Card from "../components/Card";
import Button from "../components/Button";

const RECO_API_URL = "http://localhost:4005";

export default function RecommendationsPage() {
  const [userId, setUserId] = useState("");
  const [recs, setRecs] = useState([]);
  const [allRecs, setAllRecs] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [score, setScore] = useState("");
  const [reason, setReason] = useState("");
  const [ttl, setTtl] = useState("");
  const [singleId, setSingleId] = useState("");
  const [postUserId, setPostUserId] = useState("");
  const [postCourseId, setPostCourseId] = useState("");
  const [postScore, setPostScore] = useState("");
  const [postReason, setPostReason] = useState("");
  const [postTtl, setPostTtl] = useState("");
  const [updateId, setUpdateId] = useState("");
  const [updateCourseId, setUpdateCourseId] = useState("");
  const [updateScore, setUpdateScore] = useState("");
  const [updateReason, setUpdateReason] = useState("");
  const [updateTtl, setUpdateTtl] = useState("");
  const [bulkDeleteInput, setBulkDeleteInput] = useState('[{"userId":"1","id":"seed-1-101"}]');
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

  // New: list all recommendations (no user filter)
  async function handleListAll() {
    setMessage("");
    try {
      const res = await fetch(`${RECO_API_URL}/recommendations`);
      if (!res.ok) {
        setMessage('Error listing recommendations');
        return;
      }
      const data = await res.json();
      setAllRecs(data);
    } catch (err) {
      console.error(err);
      setMessage('Could not reach recommendation service');
    }
  }

  // New: get single recommendation by userId + id
  async function handleGetById() {
    setMessage("");
    if (!userId || !singleId) {
      setMessage('Provide userId and id');
      return;
    }
    try {
      const res = await fetch(`${RECO_API_URL}/recommendations/${encodeURIComponent(userId)}/${encodeURIComponent(singleId)}`);
      if (res.status === 404) {
        setMessage('Not found');
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage(err.message || 'Error fetching');
        return;
      }
      const data = await res.json();
      setRecs([data]);
    } catch (err) {
      console.error(err);
      setMessage('Could not reach recommendation service');
    }
  }

  // New: generic POST /recommendations (body contains userId)
  async function handlePostGeneric() {
    setMessage("");
    if (!postUserId || postCourseId === "") {
      setMessage('userId and courseId required');
      return;
    }
    try {
      const body = { userId: postUserId, courseId: Number(postCourseId) };
      if (postScore) body.score = Number(postScore);
      if (postReason) body.reason = postReason;
      if (postTtl) body.ttl = Number(postTtl);
      const res = await fetch(`${RECO_API_URL}/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.message || 'Error creating recommendation');
        return;
      }
      setMessage(`Created ${data.id}`);
    } catch (err) {
      console.error(err);
      setMessage('Could not reach recommendation service');
    }
  }

  // New: PUT update by id (PUT /recommendations/id/:id)
  async function handlePutById() {
    setMessage("");
    if (!updateId) {
      setMessage('Provide id to update');
      return;
    }
    try {
      const body = {};
      if (updateCourseId) body.courseId = Number(updateCourseId);
      if (updateScore) body.score = Number(updateScore);
      if (updateReason) body.reason = updateReason;
      if (updateTtl) body.ttl = Number(updateTtl);
      const res = await fetch(`${RECO_API_URL}/recommendations/id/${encodeURIComponent(updateId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.message || 'Error updating');
        return;
      }
      setMessage(`Updated ${data.id}`);
    } catch (err) {
      console.error(err);
      setMessage('Could not reach recommendation service');
    }
  }

  // New: bulk delete
  async function handleBulkDelete(all = false) {
    setMessage("");
    try {
      if (all) {
        const res = await fetch(`${RECO_API_URL}/recommendations?all=1`, { method: 'DELETE' });
        if (!res.ok && res.status !== 204) {
          const data = await res.json().catch(() => ({}));
          setMessage(data.message || 'Error deleting all');
          return;
        }
        setMessage('Deleted all recommendations');
        return;
      }
      const ids = JSON.parse(bulkDeleteInput);
      const res = await fetch(`${RECO_API_URL}/recommendations`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        setMessage(data.message || 'Error bulk delete');
        return;
      }
      setMessage('Deleted specified recommendations');
    } catch (err) {
      console.error(err);
      setMessage('Invalid JSON or request failed');
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
          <div className="mt-3">
            <h4 className="font-semibold">Advanced</h4>
            <div className="flex gap-3 items-center mt-2">
              <Button onClick={handleListAll}>List all</Button>
              <Button variant="ghost" onClick={() => setAllRecs([])}>Clear all list</Button>
            </div>
            {allRecs.length > 0 && (
              <ul className="mt-2 space-y-2">
                {allRecs.map((r) => (
                  <li key={r.id} className="p-2 bg-slate-700 rounded">{r.userId}:{r.id} — course {r.courseId} — score: {r.score ?? 'n/a'}</li>
                ))}
              </ul>
            )}
          </div>
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

        <div className="mt-6">
          <h3 className="font-semibold">Create (generic)</h3>
          <div className="flex gap-2 mt-2">
            <input className="p-2 rounded bg-slate-700" placeholder="userId" value={postUserId} onChange={(e) => setPostUserId(e.target.value)} />
            <input className="p-2 rounded bg-slate-700" placeholder="courseId" value={postCourseId} onChange={(e) => setPostCourseId(e.target.value)} />
            <input className="p-2 rounded bg-slate-700" placeholder="score" value={postScore} onChange={(e) => setPostScore(e.target.value)} />
            <input className="p-2 rounded bg-slate-700" placeholder="reason" value={postReason} onChange={(e) => setPostReason(e.target.value)} />
            <input className="p-2 rounded bg-slate-700" placeholder="ttl" value={postTtl} onChange={(e) => setPostTtl(e.target.value)} />
            <Button onClick={handlePostGeneric}>POST</Button>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="font-semibold">Get / Update by ID</h3>
          <div className="flex gap-2 items-center mt-2">
            <input className="p-2 rounded bg-slate-700" placeholder="id" value={singleId} onChange={(e) => setSingleId(e.target.value)} />
            <Button onClick={handleGetById}>Get by id</Button>
          </div>

          <div className="mt-3">
            <h4 className="font-medium">Update by id</h4>
            <div className="flex gap-2 mt-2">
              <input className="p-2 rounded bg-slate-700" placeholder="id" value={updateId} onChange={(e) => setUpdateId(e.target.value)} />
              <input className="p-2 rounded bg-slate-700" placeholder="courseId" value={updateCourseId} onChange={(e) => setUpdateCourseId(e.target.value)} />
              <input className="p-2 rounded bg-slate-700" placeholder="score" value={updateScore} onChange={(e) => setUpdateScore(e.target.value)} />
              <input className="p-2 rounded bg-slate-700" placeholder="reason" value={updateReason} onChange={(e) => setUpdateReason(e.target.value)} />
              <input className="p-2 rounded bg-slate-700" placeholder="ttl" value={updateTtl} onChange={(e) => setUpdateTtl(e.target.value)} />
              <Button onClick={handlePutById}>PUT by id</Button>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="font-semibold">Bulk Delete</h3>
          <label className="block text-sm mt-2">IDs JSON (array of {`{userId,id}`})</label>
          <textarea className="w-full p-2 rounded bg-slate-800" rows={3} value={bulkDeleteInput} onChange={(e) => setBulkDeleteInput(e.target.value)} />
          <div className="flex gap-3 mt-2">
            <Button variant="danger" onClick={() => handleBulkDelete(false)}>Delete listed</Button>
            <Button variant="danger" onClick={() => handleBulkDelete(true)}>Delete all</Button>
          </div>
        </div>

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
