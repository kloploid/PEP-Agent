const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET() {
  const res = await fetch(`${BACKEND_URL}/courses`, { cache: "no-store" });
  if (!res.ok) {
    return Response.json({ error: await res.text() }, { status: res.status });
  }
  return Response.json(await res.json());
}
