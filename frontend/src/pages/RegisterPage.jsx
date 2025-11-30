import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import Button from "../components/Button";

const API_URL = "http://localhost:4001";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  async function handleRegister(e) {
    e.preventDefault();
    setMessage("");

    try {
      const res = await fetch(`${API_URL}/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "Napaka pri registraciji");
        return;
      }

      setMessage("Registracija uspešna! Preusmerjam na login...");
      setTimeout(() => {
        navigate("/login");
      }, 1000);
    } catch (err) {
      console.error(err);
      setMessage("Napaka pri povezavi s strežnikom");
    }
  }

  return (
    <div>
      <Card>
        <h2 className="text-xl font-semibold mb-3">Registracija</h2>
        <form onSubmit={handleRegister} className="flex flex-col max-w-xs gap-3">
          <input
            className="p-2 rounded bg-slate-700"
            type="text"
            placeholder="Ime"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
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
          <Button type="submit">Registriraj se</Button>
        </form>
        {message && <p className="mt-3">{message}</p>}
      </Card>
    </div>
  );
}
