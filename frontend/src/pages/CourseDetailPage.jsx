import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import Button from '../components/Button';
import { fetchWithAuth } from '../api';

const COURSE_API_URL = "http://localhost:4002";

export default function CourseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  useEffect(() => {
    async function loadCourse() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetchWithAuth(`${COURSE_API_URL}/courses/${id}`);

        if (!res.ok) {
          if (res.status === 404) {
            setError('Course not found');
          } else {
            setError('Failed to load course');
          }
          setLoading(false);
          return;
        }

        const data = await res.json();
        setCourse(data);
      } catch (err) {
        console.error('Error loading course:', err);
        setError('Failed to load course');
      } finally {
        setLoading(false);
      }
    }

    loadCourse();
  }, [id, user]);

  async function handleDelete() {
    if (!window.confirm('Are you sure you want to delete this course?')) {
      return;
    }

    try {
      const res = await fetchWithAuth(`${COURSE_API_URL}/courses/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        navigate('/courses');
      } else {
        alert('Failed to delete course');
      }
    } catch (err) {
      console.error('Error deleting course:', err);
      alert('Failed to delete course');
    }
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-slate-300 mb-4">Please log in to view course details.</p>
          <Link to="/login" className="text-blue-400 hover:text-blue-300">
            Go to Login
          </Link>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <div className="text-center py-12">
            <div className="text-4xl mb-4">📚</div>
            <p className="text-slate-400">Loading course details...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <div className="text-center py-12">
            <div className="text-4xl mb-4">❌</div>
            <h1 className="text-2xl font-bold mb-2">Course Not Found</h1>
            <p className="text-slate-400 mb-6">{error || 'The course you are looking for does not exist.'}</p>
            <Link to="/courses">
              <Button>Back to Courses</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const isOwner = user && course.owner_user_id === user.id;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Link to="/" className="hover:text-slate-200">Home</Link>
        <span>›</span>
        <Link to="/courses" className="hover:text-slate-200">Courses</Link>
        <span>›</span>
        <span className="text-white">{course.title}</span>
      </div>

      {/* Main Course Card */}
      <Card className="relative">
        {/* Header Section */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="text-5xl">📚</div>
              <div>
                <h1 className="text-3xl font-bold">{course.title}</h1>
                <div className="flex items-center gap-3 text-sm text-slate-400 mt-1">
                  <span>Course ID: {course.id}</span>
                  {isOwner && (
                    <>
                      <span>•</span>
                      <span className="text-green-400">You own this course</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {isOwner && (
            <Button variant="danger" onClick={handleDelete}>
              Delete Course
            </Button>
          )}
        </div>

        {/* Description */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-3">Description</h2>
          <p className="text-slate-300 leading-relaxed">
            {course.description || 'No description available for this course.'}
          </p>
        </div>

        {/* Course Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
            <div className="text-slate-400 text-sm mb-1">Owner ID</div>
            <div className="text-lg font-semibold">{course.owner_user_id}</div>
          </div>

          <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
            <div className="text-slate-400 text-sm mb-1">Created At</div>
            <div className="text-lg font-semibold">
              {new Date(course.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </div>
          </div>

          <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
            <div className="text-slate-400 text-sm mb-1">Time Created</div>
            <div className="text-lg font-semibold">
              {new Date(course.created_at).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>

          <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
            <div className="text-slate-400 text-sm mb-1">Status</div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span className="text-lg font-semibold">Active</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-slate-700">
          <Link to="/courses" className="flex-1">
            <Button variant="secondary" className="w-full">
              Back to All Courses
            </Button>
          </Link>
          <Link to="/" className="flex-1">
            <Button className="w-full">
              Go to Home
            </Button>
          </Link>
        </div>
      </Card>

      {/* Additional Info Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-lg font-semibold mb-3">Course Progress</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Completion</span>
              <span className="font-semibold">0%</span>
            </div>
            <div className="bg-slate-700 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-600 h-full" style={{ width: '0%' }}></div>
            </div>
            <p className="text-sm text-slate-400 mt-2">Start learning to track your progress!</p>
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold mb-3">Quick Actions</h3>
          <div className="space-y-2">
            <button className="w-full text-left px-4 py-3 bg-slate-900 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700">
              <div className="flex items-center gap-3">
                <span className="text-2xl">▶️</span>
                <span>Start Learning</span>
              </div>
            </button>
            <button className="w-full text-left px-4 py-3 bg-slate-900 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📝</span>
                <span>View Materials</span>
              </div>
            </button>
            <button className="w-full text-left px-4 py-3 bg-slate-900 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700">
              <div className="flex items-center gap-3">
                <span className="text-2xl">💬</span>
                <span>Join Discussion</span>
              </div>
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
