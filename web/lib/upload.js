// Subida de fotos a Supabase Storage. Requiere un bucket público llamado "uploads"
// (crear en Supabase → Storage → New bucket → Public). Devuelve la URL pública.
import { supabase } from '@/lib/supabaseClient';

const BUCKET = 'uploads';

export async function uploadPhoto(file, folder = 'pedidos') {
  if (!supabase) throw new Error('Supabase no configurado.');
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || 'image/jpeg',
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
