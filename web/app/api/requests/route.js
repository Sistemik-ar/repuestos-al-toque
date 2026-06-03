import { addRequest } from '@/lib/server-db';

export async function POST(req) {
  const body = await req.json();
  const id = addRequest(body);
  return Response.json({ id });
}
