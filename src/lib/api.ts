export const fetchHealth = async () => {
  const res = await fetch("http://127.0.0.1:8000/api/v1/system/health");
  if (!res.ok) throw new Error("Network response was not ok");
  return res.json();
};

export const fetchGame = async (id: number) => {
  const res = await fetch(`http://127.0.0.1:8000/api/v1/games/${id}`);
  if (!res.ok) throw new Error("Network response was not ok");
  return res.json();
};
