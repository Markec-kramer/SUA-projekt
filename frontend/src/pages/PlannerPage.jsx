import { useEffect, useState } from "react";
import Card from "../components/Card";
import Button from "../components/Button";
import CreateSessionModal from "../components/CreateSessionModal";
import { fetchWithAuth } from '../api';

const PLANNER_API_URL = "http://localhost:4003";

export default function PlannerPage() {
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const [sessions, setSessions] = useState([]);
  const [message, setMessage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
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
        const res = await fetchWithAuth(`${PLANNER_API_URL}/study-sessions?user_id=${userId}`);
        const data = await res.json();
        setSessions(data);
      } catch (err) {
        console.error(err);
        setMessage("Napaka pri nalaganju sessionov");
      }
    }

    loadSessions();
  }, [userId]);

  async function handleCreate(sessionData) {
    setMessage("");

    try {
      const res = await fetchWithAuth(`${PLANNER_API_URL}/study-sessions`, {
        method: "POST",
        body: JSON.stringify(sessionData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Napaka pri ustvarjanju sessiona");
      }

      setSessions((prev) => [...prev, data]);
      setMessage("Session uspešno ustvarjen!");

      // Clear success message after 3 seconds
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async function handleComplete(id) {
    try {
      const res = await fetchWithAuth(`${PLANNER_API_URL}/study-sessions/${id}/complete`, {
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
      const res = await fetchWithAuth(`${PLANNER_API_URL}/study-sessions/${id}`, {
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

  // Helper function to format date/time
  const formatDateTime = (dateTimeString) => {
    const date = new Date(dateTimeString);
    return date.toLocaleString('sl-SI', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Helper function to get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'PLANNED':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      case 'IN_PROGRESS':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  const renderWeather = (ws) => {
    if (!ws) return null;
    const cond = ws.conditions || ws.condition || 'unknown';
    const temp = ws.tempC ?? ws.temp ?? null;
    return `${cond}${temp !== null ? `, ${temp}°C` : ''}`;
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Study Planner</h1>
          <p className="text-slate-400">Schedule and manage your study sessions</p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Schedule Session
        </Button>
      </div>

      {/* User Info Card */}
      <Card className="bg-gradient-to-r from-purple-600/10 to-blue-600/10 border-purple-500/20">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-white text-lg font-bold">
            {user.name[0].toUpperCase()}
          </div>
          <div>
            <p className="font-semibold">Logged in as <strong>{user.name}</strong></p>
            <p className="text-sm text-slate-400">{user.email}</p>
          </div>
        </div>
      </Card>

      {/* Success/Error Message */}
      {message && (
        <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-4">
          <p className="text-green-400">{message}</p>
        </div>
      )}

      {/* Sessions List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Your Study Sessions ({sessions.length})</h2>
        </div>

        {sessions.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-5xl mb-4">📅</div>
            <h3 className="text-xl font-semibold mb-2">No study sessions yet</h3>
            <p className="text-slate-400 mb-6">Schedule your first study session to get started!</p>
            <Button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700">
              Schedule Your First Session
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <Card key={session.id} className="hover:shadow-xl transition-all duration-200">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold">{session.title}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(session.status)}`}>
                        {session.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-400 mb-3">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        <span>Course ID: {session.course_id}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        <span>ID: {session.id}</span>
                      </div>
                      {session.city && (
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 12.414a2 2 0 00-2.828 0L6.343 16.657A8 8 0 1117.657 16.657z" />
                          </svg>
                          <span>City: {session.city}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 text-sm">
                      <div className="flex items-center gap-2 text-slate-300">
                        <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-medium">Start:</span>
                        <span>{formatDateTime(session.start_time)}</span>
                        {session.weather_snapshot && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/30 text-green-400">
                            {renderWeather(session.weather_snapshot)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-slate-300">
                        <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-medium">End:</span>
                        <span>{formatDateTime(session.end_time)}</span>
                        {session.weather_snapshot && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400">
                            {renderWeather(session.weather_snapshot)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {session.status !== "COMPLETED" && (
                      <Button
                        variant="secondary"
                        onClick={() => handleComplete(session.id)}
                        className="whitespace-nowrap"
                      >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Complete
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      onClick={() => handleDelete(session.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Session Modal */}
      <CreateSessionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreate}
        user={user}
      />
    </div>
  );
}
