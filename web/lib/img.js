'use client';
// Reduce una imagen elegida a una miniatura liviana (dataURL JPEG) para poder
// compartirla por el almacén sin que pese demasiado. Real cross-device.
export function fileToThumb(file, max = 720, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      try { resolve(c.toDataURL('image/jpeg', quality)); } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = url;
  });
}
