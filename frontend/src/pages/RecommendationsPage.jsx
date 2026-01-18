import { useState, useEffect } from "react";
import Card from "../components/Card";
import Button from "../components/Button";
import { fetchWithAuth } from '../api';

const RECO_API_URL = "http://localhost:4005";

export default function RecommendationsPage() {
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const [userId, setUserId] = useState(user?.id?.toString() || "");
  const [courseId, setCourseId] = useState("");
  const [score, setScore] = useState("8");
  const [reason, setReason] = useState("");
  const [ttl, setTtl] = useState("86400");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [userRecs, setUserRecs] = useState([]);
  const [allRecs, setAllRecs] = useState([]);

  useEffect(() => {
    if (user) {
      setUserId(user.id.toString());
      handleListForUser(null, user.id.toString());
      handleListAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleListForUser(e, userIdParam) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    setMessage("");
    setLoading(true);
    const target = userIdParam ?? userId;
    if (!target) {
      setMessage("Enter a user ID");
      setLoading(false);
      return;
    }
    try {
      const res = await fetchWithAuth(
        `${RECO_API_URL}/recommendations/${encodeURIComponent(target)}`
      );
      if (res.status === 404) {
        setUserRecs([]);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage(err.message || "Error fetching recommendations");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setUserRecs(data);
    } catch (err) {
      console.error(err);
      setMessage("Could not reach recommendation service");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    if (!userId || courseId === "") {
      setMessage("User ID and Course ID are required.");
      setLoading(false);
      return;
    }
    const body = {
      userId: Number(userId),
      courseId: Number(courseId),
      score: Number(score),
      reason: reason || `Recommended course ${courseId}`
    };
    if (ttl) body.ttl = Number(ttl);

    try {
      const res = await fetchWithAuth(`${RECO_API_URL}/recommendations`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.message || "Error creating recommendation");
        setLoading(false);
        return;
      }
      setMessage(`✓ Recommendation created successfully!`);

      // Refresh lists
      handleListForUser(null, userId);
      handleListAll();

      // Clear form
      setTimeout(() => {
        setCourseId("");
        setScore("8");
        setReason("");
        setMessage("");
      }, 2000);
    } catch (err) {
      console.error(err);
      setMessage("Could not reach recommendation service");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(targetUserId) {
    setMessage("");
    const target = targetUserId || userId;
    if (!target) {
      setMessage("Enter a user ID");
      return;
    }
    if (!window.confirm(`Delete all recommendations for user ${target}?`)) {
      return;
    }
    try {
      const res = await fetchWithAuth(
        `${RECO_API_URL}/recommendations/${encodeURIComponent(target)}`,
        { method: "DELETE" }
      );
      if (res.status === 404) {
        setMessage("No recommendations to delete");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage(err.message || "Error deleting");
        return;
      }
      setMessage(`✓ Deleted recommendations for user ${target}`);
      handleListForUser(null, userId);
      handleListAll();
      setTimeout(() => setMessage(""), 2000);
    } catch (err) {
      console.error(err);
      setMessage("Could not reach recommendation service");
    }
  }

  async function handleListAll() {
    try {
      const res = await fetchWithAuth(`${RECO_API_URL}/recommendations`);
      if (!res.ok) return;
      const data = await res.json();
      setAllRecs(data);
    } catch (err) {
      console.error(err);
    }
  }

  if (!user) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Recommendations</h1>
        <Card>
          <p>Dostop dovoljen samo prijavljenim uporabnikom.</p>
        </Card>
      </div>
    );
  }

  // Get score color
  const getScoreColor = (score) => {
    if (score >= 9) return 'text-green-400';
    if (score >= 7) return 'text-blue-400';
    if (score >= 5) return 'text-yellow-400';
    return 'text-red-400';
  };

  // Get score badge
  const getScoreBadge = (score) => {
    if (score >= 9) return 'bg-green-500/20 text-green-400 border-green-500/50';
    if (score >= 7) return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    if (score >= 5) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
    return 'bg-red-500/20 text-red-400 border-red-500/50';
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Course Recommendations</h1>
        <p className="text-slate-400">Manage personalized course recommendations for users</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-purple-600/10 to-pink-600/10 border-purple-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm mb-1">Your Recommendations</p>
              <p className="text-3xl font-bold text-purple-400">{userRecs.length}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-purple-600/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-blue-600/10 to-cyan-600/10 border-blue-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm mb-1">Total in System</p>
              <p className="text-3xl font-bold text-blue-400">{allRecs.length}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-blue-600/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-green-600/10 to-emerald-600/10 border-green-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm mb-1">Avg Score</p>
              <p className="text-3xl font-bold text-green-400">
                {userRecs.length > 0
                  ? (userRecs.reduce((sum, r) => sum + (r.score || 0), 0) / userRecs.length).toFixed(1)
                  : '0.0'}
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-green-600/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
        </Card>
      </div>

      {/* Messages */}
      {message && (
        <div className={`rounded-lg p-4 ${message.includes('✓') ? 'bg-green-500/10 border border-green-500/50' : 'bg-red-500/10 border border-red-500/50'}`}>
          <p className={message.includes('✓') ? 'text-green-400' : 'text-red-400'}>{message}</p>
        </div>
      )}

      {/* Create Recommendation Form */}
      <Card>
        <h3 className="text-lg font-semibold mb-4">Create New Recommendation</h3>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                User ID <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g., 1"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Course ID <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                placeholder="e.g., 5"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Score (0-10) <span className="text-slate-500">(Default: 8)</span>
            </label>
            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="8"
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="text-sm text-slate-500 mt-1">Recommendation strength (higher is better)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Reason <span className="text-slate-500">(Optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why this course is recommended..."
              rows={3}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Cache TTL (seconds) <span className="text-slate-500">(Optional)</span>
            </label>
            <input
              type="number"
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
              placeholder="Default: 86400"
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="text-sm text-slate-500 mt-1">How long to cache this recommendation (default: 24 hours)</p>
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={loading} className="bg-purple-600 hover:bg-purple-700">
              {loading ? 'Creating...' : 'Create Recommendation'}
            </Button>
            <Button
              type="button"
              onClick={() => { setCourseId(''); setScore('8'); setReason(''); setTtl('86400'); }}
              variant="ghost"
            >
              Clear Form
            </Button>
          </div>
        </form>
      </Card>

      {/* User Recommendations */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Your Recommendations ({userRecs.length})</h2>
          <div className="flex gap-2">
            <Button onClick={() => handleListForUser(null, userId)} variant="secondary">
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </span>
            </Button>
            {userRecs.length > 0 && (
              <Button onClick={() => handleDelete(userId)} variant="danger">
                Delete All
              </Button>
            )}
          </div>
        </div>

        {userRecs.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-5xl mb-4">💡</div>
            <h3 className="text-xl font-semibold mb-2">No recommendations yet</h3>
            <p className="text-slate-400">Create your first recommendation above</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {userRecs.map((rec) => (
              <Card key={rec.id} className="hover:shadow-xl transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-600 flex items-center justify-center text-white font-bold">
                      {rec.courseId}
                    </div>
                    <div>
                      <h3 className="font-semibold">Course #{rec.courseId}</h3>
                      <p className="text-xs text-slate-400">ID: {rec.id}</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-bold border ${getScoreBadge(rec.score || 0)}`}>
                    ★ {(rec.score || 0).toFixed(1)}
                  </span>
                </div>

                {rec.reason && (
                  <p className="text-sm text-slate-300 mb-3 line-clamp-2">{rec.reason}</p>
                )}

                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>User: {rec.userId}</span>
                  {rec.timestamp && (
                    <span>{new Date(rec.timestamp).toLocaleDateString()}</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* All Recommendations in System */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">All Recommendations ({allRecs.length})</h2>
          <Button onClick={handleListAll} variant="secondary">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </span>
          </Button>
        </div>

        {allRecs.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-5xl mb-4">📚</div>
            <h3 className="text-xl font-semibold mb-2">No recommendations in system</h3>
            <p className="text-slate-400">All recommendations will appear here</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {allRecs.map((rec) => (
              <Card key={`${rec.userId}-${rec.id}`} className="hover:shadow-lg transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="text-slate-400 text-sm">User {rec.userId}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      <span className="font-semibold">Course #{rec.courseId}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-bold ${getScoreColor(rec.score || 0)}`}>
                      ★ {(rec.score || 0).toFixed(1)}
                    </span>
                    {rec.reason && (
                      <span className="text-sm text-slate-400 max-w-xs truncate">{rec.reason}</span>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
