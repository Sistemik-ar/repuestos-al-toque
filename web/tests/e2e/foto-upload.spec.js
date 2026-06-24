import { test, expect } from '@playwright/test';
import { login, pickVehiculo, uniquePlate } from './helpers';

// Lleva el wizard del pedido hasta el paso 3 (Descripción), donde está el campo de foto.
async function gotoPhotoStep(page) {
  await page.goto('/mecanico/pedido');
  await pickVehiculo(page);
  await page.getByPlaceholder('ABC123 o AB123CD').fill(uniquePlate());
  await page.getByPlaceholder(/Multijet/i).fill('1.4');
  await page.getByRole('button', { name: /Continuar/i }).click(); // -> paso 2 (categoría)
  await page.locator('text=Frenos').first().click(); // elegir categoría -> paso 3 (con el campo foto)
  const zone = page.locator('label.upload-area[for="reqPhoto"]');
  await expect(zone).toBeVisible({ timeout: 10000 });
  return zone;
}

// En test no hay Supabase configurado, así que la subida termina en "No se pudo subir" — eso
// igual prueba el cableado: el evento (drop/paste) llegó al hook y disparó uploadPhoto.
const ATTEMPTED = /No se pudo subir la foto|Foto subida/i;

test('mecánico/pedido: arrastrar (drag&drop) una foto la resalta y dispara la subida', async ({ page }) => {
  await login(page, 'mecanico@repuestosaltoque.com.ar');
  const zone = await gotoPhotoStep(page);

  // dragover: la zona se resalta y cambia el texto a "Soltá la foto acá"
  await page.evaluate(() => {
    document.querySelector('label.upload-area[for="reqPhoto"]')
      .dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
  });
  await expect(zone).toHaveClass(/dragover/);
  await expect(page.getByText(/Soltá la foto acá/i)).toBeVisible();

  // drop: dispara la subida
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([255, 216, 255, 224])], 'pieza.jpg', { type: 'image/jpeg' }));
    document.querySelector('label.upload-area[for="reqPhoto"]')
      .dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await expect(page.getByText(ATTEMPTED)).toBeVisible({ timeout: 10000 });
});

test('mecánico/pedido: pegar (Ctrl/Cmd+V) una imagen del portapapeles dispara la subida', async ({ page }) => {
  await login(page, 'mecanico@repuestosaltoque.com.ar');
  await gotoPhotoStep(page); // el listener de "pegar" está activo en el paso 3

  const hasClipboardData = await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'captura.png', { type: 'image/png' }));
    const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
    window.dispatchEvent(ev);
    return !!ev.clipboardData; // por si el navegador no soporta clipboardData en el constructor
  });
  test.skip(!hasClipboardData, 'el navegador no expone clipboardData en ClipboardEvent construido');
  await expect(page.getByText(ATTEMPTED)).toBeVisible({ timeout: 10000 });
});
