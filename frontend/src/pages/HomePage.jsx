export default function HomePage() {
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  return (
    <div>
      <h1>Online Learning Platform</h1>
      {user ? (
        <p>Prijavljen si kot <strong>{user.name}</strong> ({user.email})</p>
      ) : (
        <p>Nisi prijavljen.</p>
      )}
    </div>
  );
}
