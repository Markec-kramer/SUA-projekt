import { useEffect, useState } from "react";
import Card from "../components/Card";
import Button from "../components/Button";

const COURSE_API_URL = "http://localhost:4002";

export default function CoursesPage() {
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const [courses, setCourses] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");

  // naloži tečaje ob prvem renderju
  useEffect(() => {
    async function loadCourses() {
      try {
        const res = await fetch(`${COURSE_API_URL}/courses`);
        const data = await res.json();
        setCourses(data);
      } catch (err) {
        console.error(err);
        setMessage("Napaka pri nalaganju tečajev");
      }
    }

    loadCourses();
  }, []);

  async function handleCreateCourse(e) {
    e.preventDefault();
    setMessage("");

    if (!title.trim()) {
      setMessage("Naslov je obvezen");
      return;
    }

    try {
      const res = await fetch(`${COURSE_API_URL}/courses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          owner_user_id: user.id, // zelo pomembno!
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "Napaka pri ustvarjanju tečaja");
        return;
      }

      // dodamo nov tečaj v lokalni seznam
      setCourses((prev) => [...prev, data]);
      setTitle("");
      setDescription("");
      setMessage("Tečaj uspešno ustvarjen");
    } catch (err) {
      console.error(err);
      setMessage("Napaka pri povezavi s Course Service");
    }
  }

  async function handleDeleteCourse(id) {
    setMessage("");
    try {
      const res = await fetch(`${COURSE_API_URL}/courses/${id}`, {
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
    <div>
      <h1 className="text-2xl font-bold mb-4">Courses</h1>
      <Card>
        <p>Prijavljen si kot <strong>{user.name}</strong> ({user.email})</p>

        <h2 className="mt-4 font-semibold">Dodaj nov tečaj</h2>
        <form onSubmit={handleCreateCourse} className="flex flex-col max-w-lg gap-3">
          <input className="p-2 rounded bg-slate-700" type="text" placeholder="Naslov tečaja" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="p-2 rounded bg-slate-700" placeholder="Opis tečaja (neobvezno)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Button type="submit">Ustvari tečaj</Button>
        </form>

        {message && <p className="mt-3">{message}</p>}

        <h2 className="mt-6 font-semibold">Seznam tečajev</h2>
        {courses.length === 0 ? (
          <p>Ni še nobenega tečaja.</p>
        ) : (
          <ul>
            {courses.map((course) => (
              <li key={course.id} className="mb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <strong>{course.title}</strong>{" "}
                    {course.description && <span>- {course.description}</span>}
                    <div className="text-sm text-slate-400">ID: {course.id}, Owner: {course.owner_user_id}</div>
                  </div>
                  <div>
                    <Button variant="danger" onClick={() => handleDeleteCourse(course.id)}>Delete</Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
