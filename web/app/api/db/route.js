import { getDb } from '@/lib/server-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(getDb());
}
