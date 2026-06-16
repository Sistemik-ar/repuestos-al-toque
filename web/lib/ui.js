// Helpers de UI compartidos (toasts, sonido, formato)

export function money(n) {
  return '$' + Number(n).toLocaleString('es-AR');
}

export function toast(opts) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rat-toast', { detail: opts }));
  }
}

let audioCtx;
// Un beep. `beeps` repite el tono para llamar la atención (ej: el repartidor llegó).
// Además vibra el teléfono si el navegador lo permite (móvil).
export function ping(beeps = 1) {
  if (typeof window === 'undefined') return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume?.(); // iOS suspende el contexto hasta una interacción
    const n = Math.max(1, Math.min(6, beeps));
    for (let i = 0; i < n; i++) {
      const t0 = audioCtx.currentTime + i * 0.45;
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      o.start(t0); o.stop(t0 + 0.36);
    }
    navigator.vibrate?.(n > 1 ? [200, 120, 200, 120, 200] : 200);
  } catch (e) {}
}

export function fmtTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Fecha+hora de Bariloche (UTC-3 fijo, Argentina no tiene DST) en formato dd/mm/aaaa hh:mm,
// sin importar el huso del dispositivo. Recibe epoch ms (o Date). Devuelve '—' si no hay fecha.
export function fmtDateTime(ms) {
  if (ms == null || ms === '') return '—';
  const d = ms instanceof Date ? ms : new Date(Number(ms));
  if (isNaN(d.getTime())) return '—';
  const p = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

// Reputación / badges (mismas reglas que el mock)
const tiers = {
  mechanic: [
    { min: 0, label: 'Mecánico Nuevo', icon: 'fa-seedling', cls: 'rep-gray' },
    { min: 10, label: 'Mecánico Activo', icon: 'fa-screwdriver-wrench', cls: 'rep-purple' },
    { min: 50, label: 'Mecánico Pro', icon: 'fa-star', cls: 'rep-yellow' },
    { min: 100, label: 'Mecánico Elite', icon: 'fa-bolt', cls: 'rep-elite' },
  ],
  store: [
    { min: 0, label: 'Vendedor Nuevo', icon: 'fa-seedling', cls: 'rep-gray' },
    { min: 25, label: 'Vendedor Confiable', icon: 'fa-shield-halved', cls: 'rep-purple' },
    { min: 100, label: 'Vendedor Destacado', icon: 'fa-star', cls: 'rep-yellow' },
    { min: 250, label: 'Top Vendedor', icon: 'fa-crown', cls: 'rep-elite' },
  ],
};
export function tierFor(role, completed) {
  const list = tiers[role] || tiers.mechanic;
  let t = list[0];
  list.forEach((x) => { if (completed >= x.min) t = x; });
  return t;
}
