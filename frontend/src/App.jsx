import { Routes, Route, Link, useNavigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import HomePage from "./pages/HomePage";
import CoursesPage from "./pages/CoursesPage";
import PlannerPage from "./pages/PlannerPage";
import WeatherPage from "./pages/WeatherPage";

function App() {
  const navigate = useNavigate();
  const user = localStorage.getItem("user");

  function handleLogout() {
    localStorage.removeItem("user");
    navigate("/login");
  }

  return (
    <div>
      <nav style={{ padding: "10px", borderBottom: "1px solid #ccc" }}>
        <Link to="/" style={{ marginRight: "10px" }}>Home</Link>
        <Link to="/courses" style={{ marginRight: "10px" }}>Courses</Link>
        <Link to="/planner" style={{ marginRight: "10px" }}>Planner</Link>
        <Link to="/weather" style={{ marginRight: "10px" }}>Weather</Link>

        {!user ? (
          <>
            <Link to="/login" style={{ marginRight: "10px" }}>Login</Link>
            <Link to="/register">Register</Link>
          </>
        ) : (
          <button 
            onClick={handleLogout} 
            style={{ marginLeft: "20px", padding: "5px 10px" }}
          >
            Logout
          </button>
        )}
      </nav>

      <div style={{ padding: "20px" }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/weather" element={<WeatherPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
