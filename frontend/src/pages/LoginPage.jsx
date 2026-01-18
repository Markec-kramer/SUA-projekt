import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from 'react-toastify';
import { fetchWithAuth } from '../api';
import Card from "../components/Card";
import Button from "../components/Button";

const API_URL = import.meta.env.VITE_API_BASE || "http://localhost:4001";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setMessage("");

    try {
      const res = await fetch(`${API_URL}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: 'include',
      });

      // Read raw text first so we can log non-JSON error bodies
      const raw = await res.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch (err) {
        console.warn('Login response was not JSON:', raw);
      }

      console.log('Login response status:', res.status);
      console.log('Login response body (parsed):', data);
      console.log('Login response raw body:', raw);

      if (!res.ok) {
        const errMsg = (data && data.message) || raw || `HTTP ${res.status}`;
        toast.error(errMsg || 'Napaka pri prijavi');
        setMessage(errMsg || 'Napaka pri prijavi');
        return;
      }

      // shrani token posebej in osnovne podatke
      if (data && data.token) localStorage.setItem('token', data.token);
      if (data) localStorage.setItem('user', JSON.stringify({ id: data.id, email: data.email, name: data.name }));
      toast.success('Prijava uspešna');
      setMessage('Prijava uspešna! Preusmerjam na Home...');
      setTimeout(() => navigate('/'), 800);
    } catch (err) {
      console.error('Network/login error:', err);
      toast.error('Napaka pri povezavi s strežnikom');
      setMessage('Napaka pri povezavi s strežnikom');
    }
  }

  return (
    <div className="h-full flex items-center justify-center p-4 relative">

      <Card className="w-full max-w-md">
        <h2 className="text-center text-2xl font-bold mb-6">Log in</h2>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Email</label>
            <input
              className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              type="email"
              placeholder="ime@primer.si"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm text-slate-400">Geslo</label>
              <a href="#" className="text-xs text-slate-400 hover:text-slate-300">FORGOT?</a>
            </div>
            <input
              className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
            LOG IN
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-2">
            <div className="h-px flex-1 bg-slate-700" />
            <span className="text-xs text-slate-400">OR</span>
            <div className="h-px flex-1 bg-slate-700" />
          </div>

          <Link to="/register">
            <Button type="submit" className="w-full p-5 mt-5 bg-blue-600 hover:bg-blue-700">
            Sign Up
            </Button>
          </Link>

          {message && (
            <div className="mt-3 text-center text-slate-300 text-sm">{message}</div>
          )}

          <p className="mt-4 text-center text-xs text-slate-500">
            By signing in you agree to our Terms and Privacy Policy.
          </p>
        </form>
      </Card>
    </div>
  );
}
