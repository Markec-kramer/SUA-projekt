import { Routes, Route, Link, useNavigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import HomePage from "./pages/HomePage";
import CoursesPage from "./pages/CoursesPage";
import PlannerPage from "./pages/PlannerPage";
import WeatherPage from "./pages/WeatherPage";
import RecommendationsPage from "./pages/RecommendationsPage";
import Button from "./components/Button";
import ThemeToggle from "./components/ThemeToggle";

function App() {
  const navigate = useNavigate();
  const user = localStorage.getItem("user");

  function handleLogout() {
    localStorage.removeItem("user");
    navigate("/login");
  }

  return (
    <div className="min-h-screen">
      <nav className="bg-slate-900 border-b border-slate-700">
        <div className="app-shell flex items-center gap-4">
          <Link to="/" className="text-white">Home</Link>
          <Link to="/courses" className="text-slate-200">Courses</Link>
          <Link to="/planner" className="text-slate-200">Planner</Link>
          <Link to="/weather" className="text-slate-200">Weather</Link>
          <Link to="/recommendations" className="text-slate-200">Recommendations</Link>

          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            {!user ? (
              <>
                <Link to="/login" className="mr-4 text-slate-200">Login</Link>
                <Link to="/register" className="text-slate-200">Register</Link>
              </>
            ) : (
              <Button onClick={handleLogout}>Logout</Button>
            )}
          </div>
        </div>
      </nav>

      <main className="app-shell py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/weather" element={<WeatherPage />} />
          <Route path="/recommendations" element={<RecommendationsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
