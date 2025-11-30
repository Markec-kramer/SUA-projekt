import { useState } from "react";
import { useNavigate } from "react-router-dom";

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
      <h2>Registracija</h2>
      <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", maxWidth: "300px", gap: "8px" }}>
        <input
          type="text"
          placeholder="Ime"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Geslo"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">Registriraj se</button>
      </form>
      {message && <p style={{ marginTop: "10px" }}>{message}</p>}
    </div>
  );
}
