import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [users, categories] = await Promise.all([
      prisma.user.count(),
      prisma.category.count(),
    ]);
    return Response.json({ ok: true, users, categories });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
