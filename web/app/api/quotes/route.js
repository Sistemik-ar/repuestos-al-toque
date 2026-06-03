import { addQuote } from '@/lib/server-db';

export async function POST(req) {
  const q = await req.json();
  addQuote(q);
  return Response.json({ ok: true });
}
