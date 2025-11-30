import { useEffect, useState } from "react";

const COURSE_API_URL = "http://localhost:4002";

export default function CoursesPage() {
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const [courses, setCourses] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");

  // če ni prijavljen, ne kaže nič, samo info
  if (!user) {
    return <p>Dostop dovoljen samo prijavljenim uporabnikom.</p>;
  }

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

  return (
    <div>
      <h1>Courses</h1>
      <p>Prijavljen si kot <strong>{user.name}</strong> ({user.email})</p>

      <h2>Dodaj nov tečaj</h2>
      <form
        onSubmit={handleCreateCourse}
        style={{ display: "flex", flexDirection: "column", maxWidth: "400px", gap: "8px" }}
      >
        <input
          type="text"
          placeholder="Naslov tečaja"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          placeholder="Opis tečaja (neobvezno)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button type="submit">Ustvari tečaj</button>
      </form>

      {message && <p style={{ marginTop: "10px" }}>{message}</p>}

      <h2 style={{ marginTop: "20px" }}>Seznam tečajev</h2>
      {courses.length === 0 ? (
        <p>Ni še nobenega tečaja.</p>
      ) : (
        <ul>
          {courses.map((course) => (
            <li key={course.id} style={{ marginBottom: "10px" }}>
              <strong>{course.title}</strong>{" "}
              {course.description && <span>- {course.description}</span>}
              <br />
              <small>
                ID: {course.id}, Owner: {course.owner_user_id}
              </small>
              <br />
              <button onClick={() => handleDeleteCourse(course.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
