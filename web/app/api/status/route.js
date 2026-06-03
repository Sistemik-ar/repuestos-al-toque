import { setStatus } from '@/lib/server-db';

export async function POST(req) {
  const { id, status } = await req.json();
  setStatus(id, status);
  return Response.json({ ok: true });
}
