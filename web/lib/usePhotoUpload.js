import { useState, useEffect, useRef, useCallback } from 'react';
import { uploadPhoto } from '@/lib/upload';
import { toast } from '@/lib/ui';

// Sube fotos a Supabase desde tres orígenes, con un solo flujo: input de archivo,
// arrastrar y soltar (drag&drop) o pegar del portapapeles (Ctrl/Cmd+V · click derecho → Pegar).
//
//   const up = usePhotoUpload({ folder: 'pedidos', onUploaded: (url) => ..., remaining, enabled });
//   <input type="file" onChange={(e) => { up.addFiles(e.target.files); e.target.value = ''; }} />
//   <label className={`upload-area ${up.dragging ? 'dragover' : ''}`} {...up.dropProps}>…</label>
//
// - `remaining`: cupo restante (número o función). Recorta la tanda y avisa si ya está lleno.
// - `enabled`: si el listener global de "pegar" está activo (p. ej. solo cuando la zona es visible).
export function usePhotoUpload({ folder = 'pedidos', onUploaded, remaining, enabled = true } = {}) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  // refs para que addFiles sea estable (no re-suscribir el listener de "pegar" en cada render).
  const cfg = useRef({ folder, onUploaded, remaining });
  cfg.current = { folder, onUploaded, remaining };

  const addFiles = useCallback(async (fileList) => {
    const { folder, onUploaded, remaining } = cfg.current;
    const all = [...(fileList || [])].filter((f) => f && f.type?.startsWith('image/'));
    if (!all.length) return;
    const slots = typeof remaining === 'function' ? remaining() : (remaining == null ? Infinity : remaining);
    const files = all.slice(0, Math.max(0, slots));
    if (!files.length) { toast({ title: 'Ya llegaste al máximo de fotos', icon: 'fa-image', type: 'yellow' }); return; }
    setUploading(true);
    for (const f of files) {
      try {
        const url = await uploadPhoto(f, folder);
        onUploaded?.(url);
        toast({ title: 'Foto subida', icon: 'fa-image', type: 'green' });
      } catch (err) {
        toast({ title: 'No se pudo subir la foto', sub: String(err?.message || err), icon: 'fa-triangle-exclamation', type: 'yellow' });
      }
    }
    setUploading(false);
  }, []);

  // Pegar una imagen del portapapeles (Ctrl/Cmd+V o click derecho → Pegar) mientras la zona esté visible.
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgs = [...items]
        .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
        .map((it) => it.getAsFile())
        .filter(Boolean);
      if (imgs.length) { e.preventDefault(); addFiles(imgs); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [enabled, addFiles]);

  const dropProps = {
    onDragOver: (e) => { e.preventDefault(); if (!dragging) setDragging(true); },
    onDragEnter: (e) => { e.preventDefault(); if (!dragging) setDragging(true); },
    onDragLeave: (e) => { if (e.currentTarget.contains(e.relatedTarget)) return; setDragging(false); },
    onDrop: (e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer?.files); },
  };

  return { uploading, dragging, addFiles, dropProps };
}
