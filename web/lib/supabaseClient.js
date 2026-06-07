// Cliente de Supabase (browser). Usa las claves públicas. Para realtime,
// storage y auth del lado del cliente. Las queries de datos van por Prisma/Server.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase = url && key ? createClient(url, key) : null;
