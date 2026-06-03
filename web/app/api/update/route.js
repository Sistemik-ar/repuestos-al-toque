import { updateRequest } from '@/lib/server-db';

export async function POST(req) {
  const { id, patch } = await req.json();
  updateRequest(id, patch);
  return Response.json({ ok: true });
}
