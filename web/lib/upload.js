// Subida de fotos a Supabase Storage. Requiere un bucket público llamado "uploads".
// Antes de subir, TODA foto se re-encodea a JPEG en el navegador (canvas): normaliza
// formatos (HEIC de iPhone incluido, si el navegador puede decodificarlo) y reduce peso.
import { supabase } from '@/lib/supabaseClient';

const BUCKET = 'uploads';
const MAX_DIM = 1600;

async function toJpeg(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) throw new Error('no-blob');
    return blob;
  } catch {
    // el navegador no pudo decodificar (ej: HEIC en Chrome/Android)
    const isHeic = /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '');
    if (isHeic) throw new Error('Formato HEIC no soportado. En el iPhone: Ajustes → Cámara → Formatos → "Más compatible", o mandá una captura de la foto.');
    return file; // formato común que no pudo re-encodear: se sube tal cual
  }
}

export async function uploadPhoto(file, folder = 'pedidos') {
  if (!supabase) throw new Error('Supabase no configurado.');
  const body = await toJpeg(file);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    upsert: false,
    contentType: 'image/jpeg',
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
