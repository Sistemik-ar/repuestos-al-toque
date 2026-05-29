/* ============================================================
   RepuestosAlToque — Shared mock logic & helpers
   ============================================================ */

const RAT = (() => {

  /* ---------- Seed data ---------- */
  const data = {
    mechanics: ['Taller Patagonia', 'MotorSur', 'Bariloche Diesel'],
    stores: ['Repuestos Centro', 'Andina Parts', 'Patagonia Frenos'],
    // Listado exhaustivo de las 24 marcas comercializadas en Argentina (1996-2026): sedanes,
    // hatchbacks, SUVs, utilitarios y deportivos. "Otro" al final permite texto libre.
    brands: [
      'Alfa Romeo', 'Audi', 'BMW', 'Chery', 'Chevrolet', 'Chrysler', 'Citroën', 'Dodge',
      'Fiat', 'Ford', 'Honda', 'Hyundai', 'Jeep', 'Kia', 'Mercedes-Benz', 'Mitsubishi',
      'Nissan', 'Peugeot', 'Ram', 'Renault', 'Seat', 'Suzuki', 'Toyota', 'Volkswagen', 'Otro'
    ],
    models: {
      'Alfa Romeo': ['145', '146', '147', '155', '156', '159', '164', '166', 'GT', 'GTV', 'Spider', 'Brera', 'MiTo', 'Giulietta', 'Giulia', 'Stelvio', '4C', '8C Competizione', 'Tonale'],
      'Audi': ['A1', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q2', 'Q3', 'Q4 e-tron', 'Q5', 'Q7', 'Q8', 'TT', 'R8', 'S3', 'S4', 'S5', 'RS3', 'RS4', 'RS5', 'RS6', 'RS Q3', 'e-tron', 'e-tron GT'],
      'BMW': ['Serie 1', 'Serie 2', 'Serie 3', 'Serie 4', 'Serie 5', 'Serie 6', 'Serie 7', 'Serie 8', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z3', 'Z4', 'Z8', 'M2', 'M3', 'M4', 'M5', 'M6', 'i3', 'i4', 'iX', 'iX1', 'iX3'],
      'Chery': ['QQ', 'Face', 'Fulwin', 'Cielo', 'A1', 'A3', 'A5', 'Celer', 'Tiggo', 'Tiggo 2', 'Tiggo 2 Pro', 'Tiggo 3', 'Tiggo 4', 'Tiggo 4 Pro', 'Tiggo 5', 'Tiggo 7', 'Tiggo 7 Pro', 'Tiggo 8', 'Tiggo 8 Pro', 'Arrizo 5', 'Arrizo 6'],
      'Chevrolet': ['Corsa', 'Corsa Classic', 'Classic', 'Celta', 'Prisma', 'Kadett', 'Astra', 'Vectra', 'Omega', 'Calibra', 'Cobalt', 'Onix', 'Onix Plus', 'Aveo', 'Sonic', 'Cruze', 'Malibu', 'Camaro', 'Agile', 'Spin', 'Meriva', 'Zafira', 'Montana', 'Combo', 'S10', 'D-20', 'Silverado', 'Blazer', 'TrailBlazer', 'Tracker', 'Captiva', 'Equinox', 'Grand Blazer', 'Tahoe', 'Suburban', 'Vivant', 'Bonanza'],
      'Chrysler': ['Neon', 'Stratus', 'Cirrus', 'Sebring', '300C', '300M', 'PT Cruiser', 'Town & Country', 'Grand Caravan', 'Voyager', 'Caravan', 'Crossfire'],
      'Citroën': ['AX', 'Saxo', 'ZX', 'Xantia', 'Xsara', 'Xsara Picasso', 'Evasion', 'Berlingo', 'C2', 'C3', 'C3 Picasso', 'C3 Aircross', 'C4', 'C4 Picasso', 'Grand C4 Picasso', 'C4 Lounge', 'C4 Cactus', 'C4 Aircross', 'C5', 'C5 Aircross', 'C6', 'C8', 'Jumpy', 'Jumper', 'DS3', 'DS4', 'DS5'],
      'Dodge': ['Neon', 'Stratus', 'Caliber', 'Avenger', 'Journey', 'Dakota', 'Durango', 'Grand Caravan', 'Ram 1500', 'Charger', 'Challenger', 'Viper'],
      'Fiat': ['147', 'Uno', 'Duna', 'Fiorino', 'Tipo', 'Tempra', 'Marea', 'Palio', 'Palio Weekend', 'Siena', 'Albea', 'Idea', 'Punto', 'Grande Punto', 'Linea', 'Bravo', 'Brava', 'Stilo', 'Strada', 'Doblo', 'Ducato', 'Scudo', 'Qubo', 'Multipla', 'Sedici', 'Freemont', '500', '500L', '500X', 'Mobi', 'Argo', 'Cronos', 'Toro', 'Pulse', 'Fastback', 'Coupe', 'Barchetta'],
      'Ford': ['Escort', 'Orion', 'Sierra', 'Fiesta', 'Ka', 'Ka+', 'Focus', 'Mondeo', 'Fusion', 'EcoSport', 'Kuga', 'Edge', 'Escape', 'Explorer', 'Territory', 'Bronco', 'Bronco Sport', 'Ranger', 'Ranger Raptor', 'Courier', 'Transit', 'F-100', 'F-150', 'F-250', 'F-1000', 'Maverick', 'Mustang', 'Galaxy'],
      'Honda': ['Civic', 'City', 'Fit', 'Accord', 'CR-V', 'HR-V', 'WR-V', 'Pilot', 'Odyssey', 'CR-Z', 'Legend', 'Prelude', 'Integra', 'S2000'],
      'Hyundai': ['Atos', 'Excel', 'Accent', 'Elantra', 'Sonata', 'Azera', 'Getz', 'i10', 'Grand i10', 'i20', 'i30', 'HB20', 'HB20S', 'Veloster', 'Tiburon', 'Coupe', 'Genesis', 'Tucson', 'ix35', 'Santa Fe', 'Grand Santa Fe', 'Creta', 'Kona', 'Veracruz', 'Terracan', 'Galloper', 'Santamo', 'H1', 'H100', 'Starex', 'Porter'],
      'Jeep': ['Cherokee', 'Grand Cherokee', 'Wrangler', 'Compass', 'Renegade', 'Commander', 'Patriot', 'Liberty', 'Gladiator'],
      'Kia': ['Rio', 'Picanto', 'Sephia', 'Clarus', 'Cerato', 'Cerato Forte', 'Magentis', 'Optima', 'Carens', 'Carnival', 'Grand Carnival', 'Soul', 'Sportage', 'Sorento', 'Mohave', 'Seltos', 'Stonic', 'Niro', 'Stinger', 'Pregio', 'Bongo', 'Besta'],
      'Mercedes-Benz': ['Clase A', 'Clase B', 'Clase C', 'Clase E', 'Clase S', 'CLA', 'CLK', 'CLS', 'SLK', 'SL', 'GLA', 'GLB', 'GLC', 'GLE', 'GLK', 'GLS', 'ML', 'GL', 'Clase G', 'Clase R', 'Clase V', 'Vito', 'Viano', 'Sprinter', 'Citan', '190'],
      'Mitsubishi': ['Lancer', 'Lancer Evolution', 'Mirage', 'Colt', 'Galant', 'Eclipse', 'Eclipse Cross', '3000GT', 'ASX', 'Outlander', 'Montero', 'Montero Sport', 'Pajero', 'Pajero Sport', 'Pajero Dakar', 'Nativa', 'L200', 'Triton', 'Space Wagon', 'Space Star', 'Grandis', 'Endeavor'],
      'Nissan': ['Sentra', 'Almera', 'Tiida', 'Versa', 'Note', 'March', 'Micra', 'Primera', 'Maxima', 'Altima', 'Pathfinder', 'Murano', 'X-Trail', 'Qashqai', 'Kicks', 'Juke', 'Terrano', 'Frontier', 'NP300', 'Navara', 'Pickup', 'Patrol', 'Xterra', '350Z', '370Z', 'GT-R', 'Livina', 'Platina', 'Tsuru', 'Urvan', 'NV200'],
      'Peugeot': ['106', '205', '206', '206 CC', '207', '207 Compact', '208', '2008', '306', '307', '307 CC', '308', '3008', '405', '406', '407', '408', '5008', '504', '505', '605', '607', '301', '508', 'RCZ', 'Partner', 'Expert', 'Boxer', 'Rifter', 'Traveller', 'Hoggar'],
      'Ram': ['700', '1000', '1200', '1500', '2500', '3500', 'Rampage', 'ProMaster', 'Dakota'],
      'Renault': ['9', '11', '12', '18', '19', '21', 'Clio', 'Clio Mio', 'Twingo', 'Megane', 'Megane RS', 'Scenic', 'Grand Scenic', 'Laguna', 'Safrane', 'Symbol', 'Logan', 'Sandero', 'Sandero RS', 'Stepway', 'Fluence', 'Latitude', 'Kangoo', 'Express', 'Trafic', 'Master', 'Duster', 'Oroch', 'Captur', 'Koleos', 'Kwid', 'Alaskan'],
      'Seat': ['Ibiza', 'Cordoba', 'Cordoba Vario', 'Leon', 'Toledo', 'Altea', 'Alhambra', 'Arosa', 'Inca', 'Malaga'],
      'Suzuki': ['Fun', 'Maruti', 'Swift', 'Baleno', 'Celerio', 'Alto', 'SX4', 'S-Cross', 'Vitara', 'Grand Vitara', 'Grand Nomade', 'Jimny', 'Samurai', 'Sidekick', 'Ignis', 'Kizashi', 'Liana', 'Aerio', 'APV', 'Carry', 'Super Carry', 'Fun Truck'],
      'Toyota': ['Corolla', 'Corolla Cross', 'Etios', 'Yaris', 'Camry', 'Avensis', 'Corona', 'Tercel', 'Paseo', 'Celica', 'Supra', '86', 'GR86', 'GR Yaris', 'Prius', 'RAV4', 'C-HR', 'SW4', '4Runner', 'Land Cruiser', 'Land Cruiser Prado', 'Hilux', 'Hiace', 'Innova', 'FJ Cruiser', 'Previa', 'Spacio'],
      'Volkswagen': ['1500', 'Gol', 'Gol Country', 'Gol Trend', 'Senda', 'Saveiro', 'Polo', 'Polo Classic', 'Polo Track', 'Virtus', 'Voyage', 'Parati', 'Bora', 'Vento', 'Jetta', 'Golf', 'Passat', 'CC', 'Suran', 'SpaceFox', 'CrossFox', 'Fox', 'Up', 'Nivus', 'T-Cross', 'Taos', 'Tiguan', 'Tiguan Allspace', 'Touareg', 'Amarok', 'Caddy', 'Transporter', 'Crafter', 'Sharan', 'Scirocco', 'New Beetle', 'Beetle', 'Eos'],
      'Otro': []
    },
    categories: [
      { id: 'frenos', label: 'Frenos', icon: 'fa-record-vinyl' },
      { id: 'motor', label: 'Motor', icon: 'fa-gear' },
      { id: 'electricidad', label: 'Electricidad', icon: 'fa-bolt' },
      { id: 'suspension', label: 'Suspensión', icon: 'fa-car-burst' },
      { id: 'embrague', label: 'Embrague', icon: 'fa-gears' },
      { id: 'refrigeracion', label: 'Refrigeración', icon: 'fa-snowflake' },
      { id: 'lubricacion', label: 'Lubricación', icon: 'fa-oil-can' },
      { id: 'carroceria', label: 'Carrocería', icon: 'fa-car-side' },
      { id: 'otros', label: 'Otros', icon: 'fa-ellipsis' }
    ],
    // Anonymous quote pool used on the live quotes screen
    quotePool: [
      { alias: 'Proveedor #12', zone: 'Centro', rating: 4.9, partBrand: 'Bosch', price: 48500, warranty: '6 meses', real: { name: 'Repuestos Centro', phone: '+54 9 294 4123-456', address: 'Av. Bustillo 1240, Bariloche' } },
      { alias: 'Distribuidor Centro', zone: 'Centro', rating: 4.7, partBrand: 'TRW', price: 44900, warranty: '3 meses', real: { name: 'Andina Parts', phone: '+54 9 294 4567-890', address: 'Onelli 530, Bariloche' } },
      { alias: 'Zona Oeste Parts', zone: 'Oeste', rating: 4.8, partBrand: 'Ferodo', price: 39900, warranty: '12 meses', real: { name: 'Patagonia Frenos', phone: '+54 9 294 4789-012', address: 'Km 5 Av. Bustillo, Bariloche' } },
      { alias: 'AutoPartes Sur', zone: 'Sur', rating: 4.6, partBrand: 'Fras-le', price: 37500, warranty: '6 meses', real: { name: 'Sur Repuestos', phone: '+54 9 294 4222-333', address: 'Elordi 870, Bariloche' } }
    ],
    // Sponsored promos. While the mechanic WAITS we show only brand + discount (no contact,
    // so they don't leave before buying). WhatsApp contact is unlocked only AFTER payment.
    // These are paid ads — independent from who is quoting — so they never reveal an anonymous quoter.
    ads: [
      { store: 'Repuestos Centro',   discount: '20% OFF',   icon: 'fa-record-vinyl', color: 'linear-gradient(135deg,#6D28D9,#8B5CF6)', phone: '5492944123456' },
      { store: 'Andina Parts',       discount: '15% OFF',   icon: 'fa-oil-can',      color: 'linear-gradient(135deg,#EAB308,#FACC15)', phone: '5492944567890' },
      { store: 'Lubricentro Andino', discount: '2x1 filtros', icon: 'fa-gear',       color: 'linear-gradient(135deg,#22C55E,#16A34A)', phone: '5492944333222' }
    ]
  };

  /* ---------- Storage (session-like, survives nav) ---------- */
  const store = {
    get(k, fallback) { try { return JSON.parse(sessionStorage.getItem('rat_' + k)) ?? fallback; } catch { return fallback; } },
    set(k, v) { sessionStorage.setItem('rat_' + k, JSON.stringify(v)); },
    clear() { Object.keys(sessionStorage).filter(x => x.startsWith('rat_')).forEach(x => sessionStorage.removeItem(x)); }
  };

  /* ---------- Money ---------- */
  const money = n => '$' + n.toLocaleString('es-AR');

  /* ---------- Toasts ---------- */
  function ensureToastContainer() {
    let c = document.querySelector('.toast-container');
    if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
    return c;
  }
  function toast({ title, sub = '', icon = 'fa-bell', type = 'purple', duration = 3800 }) {
    const c = ensureToastContainer();
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `
      <div class="toast-icon ${type}"><i class="fa-solid ${icon}"></i></div>
      <div style="flex:1">
        <div class="toast-title">${title}</div>
        ${sub ? `<div class="toast-sub">${sub}</div>` : ''}
      </div>`;
    c.appendChild(el);
    if (window.navigator && navigator.vibrate) navigator.vibrate(30);
    setTimeout(() => { el.classList.add('exit'); setTimeout(() => el.remove(), 300); }, duration);
  }

  /* ---------- Optional notification "ping" via WebAudio ---------- */
  let audioCtx;
  function ping() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
      o.start(); o.stop(audioCtx.currentTime + 0.36);
    } catch (e) { /* silent */ }
  }

  /* ---------- Countdown timer ---------- */
  // duration in seconds; el gets text mm:ss; calls onTick/onEnd
  function countdown(el, durationSec, { onTick, onEnd, urgentAt = 60, pillEl } = {}) {
    let remaining = durationSec;
    const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const render = () => {
      if (el) el.textContent = fmt(remaining);
      if (pillEl) {
        if (remaining <= urgentAt) pillEl.classList.add('urgent'); else pillEl.classList.remove('urgent');
      }
      if (onTick) onTick(remaining);
    };
    render();
    const id = setInterval(() => {
      remaining--;
      if (remaining <= 0) { remaining = 0; render(); clearInterval(id); onEnd && onEnd(); return; }
      render();
    }, 1000);
    return () => clearInterval(id);
  }

  /* ---------- Stars helper ---------- */
  function stars(rating) {
    const full = Math.floor(rating);
    const half = rating - full >= 0.5;
    let s = '';
    for (let i = 0; i < full; i++) s += '<i class="fa-solid fa-star"></i>';
    if (half) s += '<i class="fa-solid fa-star-half-stroke"></i>';
    for (let i = full + (half ? 1 : 0); i < 5; i++) s += '<i class="fa-regular fa-star"></i>';
    return `<span class="stars">${s}</span>`;
  }

  /* ---------- Active nav highlight ---------- */
  function highlightNav() {
    const page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('[data-nav]').forEach(a => {
      if (a.getAttribute('data-nav') === page) a.classList.add('active');
    });
  }

  /* ---------- Searchable select builder ---------- */
  function fillSelect(sel, options, placeholder) {
    if (!sel) return;
    sel.innerHTML = `<option value="">${placeholder}</option>` + options.map(o => `<option>${o}</option>`).join('');
  }

  /* ---------- Reputation, points & badges ---------- */
  // Tiers unlock by COMPLETED OPERATIONS. Top tier = the "Superhost"-style badge.
  const tiers = {
    mechanic: [
      { min: 0,   label: 'Mecánico Nuevo',  icon: 'fa-seedling',            cls: 'rep-gray' },
      { min: 10,  label: 'Mecánico Activo', icon: 'fa-screwdriver-wrench',  cls: 'rep-purple' },
      { min: 50,  label: 'Mecánico Pro',    icon: 'fa-star',                cls: 'rep-yellow' },
      { min: 100, label: 'Mecánico Elite',  icon: 'fa-bolt',                cls: 'rep-elite' }
    ],
    store: [
      { min: 0,   label: 'Vendedor Nuevo',      icon: 'fa-seedling',     cls: 'rep-gray' },
      { min: 25,  label: 'Vendedor Confiable',  icon: 'fa-shield-halved', cls: 'rep-purple' },
      { min: 100, label: 'Vendedor Destacado',  icon: 'fa-star',         cls: 'rep-yellow' },
      { min: 250, label: 'Top Vendedor',        icon: 'fa-crown',        cls: 'rep-elite' }
    ]
  };

  const reputation = {
    mechanic: { name: 'Taller Patagonia', completed: 127, rating: 4.9, points: 2540, reviews: 96 },
    store:    { name: 'Repuestos Centro', completed: 312, rating: 4.8, points: 6180, reviews: 240 }
  };

  function tierFor(role, completed) {
    const list = tiers[role] || tiers.mechanic;
    let t = list[0];
    list.forEach(x => { if (completed >= x.min) t = x; });
    const idx = list.indexOf(t);
    return { ...t, idx, next: list[idx + 1] || null, total: list.length };
  }

  function badgeHTML(role, completed) {
    const t = tierFor(role, completed);
    return `<span class="rep-badge ${t.cls}"><i class="fa-solid ${t.icon}"></i> ${t.label}</span>`;
  }

  /* ---------- Bidirectional rating modal (awards reputation points) ---------- */
  function openRating({ role = 'store', who = 'tu contraparte', subjectName = '', onDone } = {}) {
    document.getElementById('ratingModalDyn')?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop open';
    backdrop.id = 'ratingModalDyn';
    backdrop.innerHTML = `
      <div class="modal text-center">
        <div class="modal-handle"></div>
        <div class="store-avatar" style="width:54px;height:54px;margin:0 auto 12px;background:rgba(250,204,21,0.18);color:var(--yellow);"><i class="fa-solid fa-star"></i></div>
        <h2 class="h-md mb-4">Calificá a ${who}</h2>
        <p class="text-sm muted mb-16">${subjectName ? subjectName + ' · ' : ''}Tu opinión sostiene la reputación de la plataforma</p>
        <div class="rating-stars mb-16" id="ratingStars">
          ${[1,2,3,4,5].map(i => `<i class="fa-regular fa-star" data-v="${i}"></i>`).join('')}
        </div>
        <textarea class="textarea mb-16" placeholder="Comentario (opcional): ¿llegó a tiempo? ¿la pieza era la correcta?"></textarea>
        <button class="btn btn-yellow btn-block" id="ratingSend" disabled><i class="fa-solid fa-paper-plane"></i> Enviar calificación</button>
        <button class="btn btn-ghost btn-block mt-12" id="ratingCancel">Ahora no</button>
      </div>`;
    document.body.appendChild(backdrop);

    let selected = 0;
    const starEls = [...backdrop.querySelectorAll('#ratingStars i')];
    const paint = v => starEls.forEach(s => { const on = +s.dataset.v <= v; s.className = (on ? 'fa-solid' : 'fa-regular') + ' fa-star' + (on ? ' on' : ''); });
    starEls.forEach(s => {
      s.onmouseenter = () => paint(+s.dataset.v);
      s.onclick = () => { selected = +s.dataset.v; paint(selected); backdrop.querySelector('#ratingSend').disabled = false; };
    });
    backdrop.querySelector('#ratingStars').onmouseleave = () => paint(selected);
    const close = () => { backdrop.classList.remove('open'); setTimeout(() => backdrop.remove(), 200); };
    backdrop.querySelector('#ratingCancel').onclick = close;
    backdrop.querySelector('#ratingSend').onclick = () => {
      close(); ping();
      toast({ title: '¡Gracias por calificar!', sub: `${selected}★ · ${who} sumó +50 puntos de reputación`, icon: 'fa-star', type: 'yellow' });
      onDone && onDone(selected);
    };
  }

  document.addEventListener('DOMContentLoaded', highlightNav);

  return { data, store, money, toast, ping, countdown, stars, fillSelect, reputation, tierFor, badgeHTML, openRating };
})();
