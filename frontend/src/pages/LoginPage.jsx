import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from 'react-toastify';
import { fetchWithAuth } from '../api';
import Card from "../components/Card";
import Button from "../components/Button";

const API_URL = "http://localhost:4001";

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
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || 'Napaka pri prijavi');
        setMessage(data.message || 'Napaka pri prijavi');
        return;
      }

      // shrani token posebej in osnovne podatke
      if (data.token) localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify({ id: data.id, email: data.email, name: data.name }));
      toast.success('Prijava uspešna');
      setMessage('Prijava uspešna! Preusmerjam na Home...');
      setTimeout(() => navigate('/'), 800);
    } catch (err) {
      console.error(err);
      toast.error('Napaka pri povezavi s strežnikom');
      setMessage('Napaka pri povezavi s strežnikom');
    }
  }

  return (
    <div>
      <Card>
        <h2 className="text-xl font-semibold mb-3">Prijava</h2>
        <form onSubmit={handleLogin} className="flex flex-col max-w-xs gap-3">
          <input
            className="p-2 rounded bg-slate-700"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="p-2 rounded bg-slate-700"
            type="password"
            placeholder="Geslo"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit">Prijava</Button>
        </form>
        {message && <p className="mt-3">{message}</p>}
      </Card>
    </div>
  );
}
