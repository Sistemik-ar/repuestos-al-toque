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
export function ping() {
  if (typeof window === 'undefined') return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
    o.start(); o.stop(audioCtx.currentTime + 0.36);
  } catch (e) {}
}

export function fmtTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
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
