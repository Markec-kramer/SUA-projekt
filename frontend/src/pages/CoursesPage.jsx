import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import Button from "../components/Button";
import CreateCourseModal from "../components/CreateCourseModal";
import { fetchWithAuth } from '../api';

const COURSE_API_URL = "http://localhost:4002";

export default function CoursesPage() {
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const [courses, setCourses] = useState([]);
  const [message, setMessage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // naloži tečaje ob prvem renderju
  useEffect(() => {
    async function loadCourses() {
      try {
        const res = await fetchWithAuth(`${COURSE_API_URL}/courses`);
        const data = await res.json();
        setCourses(data);
      } catch (err) {
        console.error(err);
        setMessage("Napaka pri nalaganju tečajev");
      }
    }

    loadCourses();
  }, []);

  async function handleCreateCourse(courseData) {
    setMessage("");

    try {
      const res = await fetchWithAuth(`${COURSE_API_URL}/courses`, {
        method: "POST",
        body: JSON.stringify(courseData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Napaka pri ustvarjanju tečaja");
      }

      // dodamo nov tečaj v lokalni seznam
      setCourses((prev) => [...prev, data]);
      setMessage("Tečaj uspešno ustvarjen!");

      // Clear success message after 3 seconds
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async function handleDeleteCourse(id) {
    setMessage("");
    try {
      const res = await fetchWithAuth(`${COURSE_API_URL}/courses/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        setMessage("Napaka pri brisanju tečaja");
        return;
      }

      setCourses((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error(err);
      setMessage("Napaka pri povezavi s Course Service");
    }
  }

  // If user is not logged, we render a small message in the UI below; do not return early (hooks must run)
  if (!user) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Courses</h1>
        <Card>
          <p>Dostop dovoljen samo prijavljenim uporabnikom.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Courses</h1>
          <p className="text-slate-400">Manage and create your courses</p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Course
        </Button>
      </div>

      {/* User Info Card */}
      <Card className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 border-blue-500/20">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white text-lg font-bold">
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

      {/* Courses List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Your Courses ({courses.length})</h2>
        </div>

        {courses.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-5xl mb-4">📚</div>
            <h3 className="text-xl font-semibold mb-2">No courses yet</h3>
            <p className="text-slate-400 mb-6">Create your first course to get started!</p>
            <Button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700">
              Create Your First Course
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {courses.map((course) => (
              <Card key={course.id} className="hover:shadow-xl transition-all duration-200">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <Link to={`/courses/${course.id}`} className="group">
                      <h3 className="text-lg font-semibold group-hover:text-blue-400 transition-colors mb-1">
                        {course.title}
                      </h3>
                    </Link>
                    {course.description && (
                      <p className="text-slate-300 text-sm mb-3 line-clamp-2">
                        {course.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-sm text-slate-400">
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        ID: {course.id}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Owner: {course.owner_user_id}
                      </span>
                      {course.created_at && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {new Date(course.created_at).toLocaleDateString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/courses/${course.id}`}>
                      <Button variant="secondary" className="whitespace-nowrap">
                        View Details
                      </Button>
                    </Link>
                    <Button
                      variant="danger"
                      onClick={() => handleDeleteCourse(course.id)}
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

      {/* Create Course Modal */}
      <CreateCourseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateCourse}
        user={user}
      />
    </div>
  );
}
