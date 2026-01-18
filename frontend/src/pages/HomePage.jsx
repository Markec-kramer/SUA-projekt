import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Card from '../components/Card';
import { fetchWithAuth } from '../api';

const COURSE_API_URL = "http://localhost:4002";

export default function HomePage() {
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const [recommendedCourses, setRecommendedCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Get user initials for avatar
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name[0].toUpperCase();
  };

  // Fetch real courses from course-service
  useEffect(() => {
    async function loadCourses() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetchWithAuth(`${COURSE_API_URL}/courses`);
        const data = await res.json();
        // Take only first 3 courses for recommended section
        setRecommendedCourses(data.slice(0, 3));
      } catch (err) {
        console.error('Error loading courses:', err);
        setRecommendedCourses([]);
      } finally {
        setLoading(false);
      }
    }

    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Mock data for current course progress
  const currentCourse = {
    title: 'System Design Foundations',
    progress: 45,
    timeLeft: '3 hours left',
    icon: '📚'
  };

  const streakDays = 5;

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto mt-12 text-center">
        <Card>
          <h1 className="text-3xl font-bold mb-4">Welcome to Learning Platform</h1>
          <p className="text-slate-300 mb-6">Please log in to access your personalized learning dashboard.</p>
          <Link to="/login" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors">
            Log In
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex items-start gap-6 mb-8">
        <div className="flex-shrink-0">
          <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
            {getInitials(user.name)}
          </div>
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold mb-2">Welcome back, {user.name.split(' ')[0]}!</h1>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-3 h-3 rounded-full bg-green-500"></span>
            <span>Portfolio 0% complete</span>
            <span className="text-slate-500">›</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Left Side */}
        <div className="lg:col-span-2 space-y-6">
          {/* Continue Learning Section */}
          <section>
            <h2 className="text-2xl font-bold mb-4">Continue learning</h2>
            <Card className="hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-4">
                <div className="text-4xl">{currentCourse.icon}</div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2">{currentCourse.title}</h3>
                  <div className="flex items-center gap-3 text-sm text-slate-400">
                    <span>{currentCourse.progress}% complete</span>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{currentCourse.timeLeft}</span>
                    </div>
                  </div>
                  <div className="mt-3 bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-600 h-full transition-all duration-300"
                      style={{ width: `${currentCourse.progress}%` }}
                    ></div>
                  </div>
                </div>
                <Link
                  to="/courses"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
                >
                  Resume course
                </Link>
              </div>
            </Card>
          </section>

          {/* Recommended Courses */}
          <section>
            <h2 className="text-2xl font-bold mb-4">Recommended for you</h2>
            {loading ? (
              <div className="text-center py-8 text-slate-400">Loading courses...</div>
            ) : recommendedCourses.length === 0 ? (
              <Card>
                <p className="text-slate-400 text-center py-4">
                  No courses available yet. <Link to="/courses" className="text-blue-400 hover:text-blue-300">Create your first course!</Link>
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recommendedCourses.map((course, index) => {
                  // Assign icons based on index for variety
                  const icons = ['💡', '🚀', '📚', '⚛️', '🔧', '💾'];
                  const icon = icons[index % icons.length];

                  return (
                    <Card key={course.id} className="hover:shadow-lg transition-shadow cursor-pointer">
                      <Link to={`/courses/${course.id}`} className="block">
                        <div className="text-4xl mb-4">{icon}</div>
                        <h3 className="text-lg font-semibold mb-2">{course.title}</h3>
                        <p className="text-slate-400 text-sm mb-4 line-clamp-2">
                          {course.description || 'Learn and master new skills with this comprehensive course.'}
                        </p>
                        <div className="flex items-center gap-3 text-sm text-slate-400">
                          <span>Course ID: {course.id}</span>
                          {course.created_at && (
                            <>
                              <span>•</span>
                              <span>{new Date(course.created_at).toLocaleDateString()}</span>
                            </>
                          )}
                        </div>
                      </Link>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* Quick Links Section */}
          <section>
            <h2 className="text-2xl font-bold mb-4">Your Learning Tools</h2>
            <div className="grid grid-cols-2 gap-4">
              <Link to="/planner">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer text-center py-8">
                  <div className="text-4xl mb-2">📅</div>
                  <h3 className="font-semibold">Study Planner</h3>
                </Card>
              </Link>
              <Link to="/recommendations">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer text-center py-8">
                  <div className="text-4xl mb-2">💡</div>
                  <h3 className="font-semibold">Recommendations</h3>
                </Card>
              </Link>
            </div>
          </section>
        </div>

        {/* Sidebar - Right Side */}
        <div className="space-y-6">
          {/* Streak Card */}
          <Card className="bg-gradient-to-br from-blue-600 to-purple-600">
            <div className="flex items-start gap-3">
              <div className="text-3xl">⚡</div>
              <div>
                <h3 className="font-semibold text-lg mb-1">You're on a {streakDays} days streak</h3>
                <p className="text-sm text-blue-100">Practice each day so your streak won't reset</p>
              </div>
            </div>
          </Card>

          {/* Ranking Card */}
          <Card>
            <div className="mb-3">
              <span className="text-xs text-slate-400 uppercase tracking-wide">QUARTZ LEAGUE</span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-xl font-bold">You're ranked <span className="text-green-400">#12</span></h3>
              <div className="text-2xl">💎</div>
            </div>
            <p className="text-sm text-slate-400 mb-4">You moved up to the promotion zone!</p>
            <Link
              to="/metrics"
              className="text-blue-400 hover:text-blue-300 text-sm font-medium inline-flex items-center gap-1"
            >
              Go to Leaderboards
              <span>→</span>
            </Link>
          </Card>

          {/* Stats Card */}
          <Card>
            <h3 className="font-semibold text-lg mb-4">Your Progress</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Courses completed</span>
                <span className="font-semibold">8</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Hours learned</span>
                <span className="font-semibold">42</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Current streak</span>
                <span className="font-semibold">{streakDays} days</span>
              </div>
            </div>
          </Card>

          {/* Weather Widget */}
          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Today's Weather</h3>
              <Link to="/weather" className="text-blue-400 hover:text-blue-300 text-sm">
                View →
              </Link>
            </div>
            <p className="text-slate-400 text-sm">Check the weather for your study session</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
