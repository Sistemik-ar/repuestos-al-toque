/* ============================================================
   RepuestosAlToque — app.js (prototipo navegable)
   Datos mock, helpers, toasts, navegación responsive
   ============================================================ */
(function () {
  'use strict';

  // ---------- Catálogo (portado de web/lib/data.js, recortado) ----------
  const data = {
    brands: ["Alfa Romeo","Audi","BMW","Chery","Chevrolet","Chrysler","Citroën","Dodge","Fiat","Ford","Honda","Hyundai","Jeep","Kia","Mercedes-Benz","Mitsubishi","Nissan","Peugeot","Ram","Renault","Seat","Suzuki","Toyota","Volkswagen","Otro"],
    models: {
      "Toyota": ["Corolla","Corolla Cross","Etios","Yaris","Camry","Hilux","SW4","RAV4","Land Cruiser","Hiace","86","Prius"],
      "Volkswagen": ["Gol","Gol Trend","Polo","Virtus","Vento","Bora","Golf","Suran","Amarok","Saveiro","T-Cross","Nivus","Taos","Tiguan"],
      "Ford": ["Ka","Fiesta","Focus","EcoSport","Territory","Ranger","Ranger Raptor","F-100","Mondeo","Kuga","Bronco Sport"],
      "Chevrolet": ["Corsa","Classic","Celta","Prisma","Onix","Onix Plus","Cruze","Agile","Spin","Tracker","S10","Camaro"],
      "Renault": ["Clio","Clio Mio","Kwid","Sandero","Stepway","Logan","Megane","Fluence","Duster","Oroch","Captur","Kangoo","Master"],
      "Fiat": ["Uno","Palio","Siena","Punto","Argo","Cronos","Mobi","Toro","Strada","Fiorino","Ducato","500"],
      "Peugeot": ["206","207","208","2008","3008","307","308","405","408","508","Partner","Expert","Boxer"],
      "Honda": ["Civic","City","Fit","HR-V","WR-V","CR-V","Accord"],
      "Nissan": ["Sentra","March","Versa","Note","Kicks","Frontier","X-Trail","Murano"],
      "Hyundai": ["Atos","Accent","Elantra","i10","Tucson","Santa Fe","Creta","Kona","H1"],
      "Otro": []
    },
    categories: [
      { id: "frenos", label: "Frenos", icon: "fa-record-vinyl" },
      { id: "motor", label: "Motor", icon: "fa-gear" },
      { id: "electricidad", label: "Electricidad", icon: "fa-bolt" },
      { id: "suspension", label: "Suspensión", icon: "fa-car-burst" },
      { id: "embrague", label: "Embrague", icon: "fa-gears" },
      { id: "refrigeracion", label: "Refrigeración", icon: "fa-snowflake" },
      { id: "lubricacion", label: "Lubricación", icon: "fa-oil-can" },
      { id: "carroceria", label: "Carrocería", icon: "fa-car-side" },
      { id: "otros", label: "Otros", icon: "fa-ellipsis" }
    ],
    quotePool: [
      { alias: "Proveedor #12", zone: "Centro", rating: 4.9, partBrand: "Bosch", price: 48500, warranty: "6 meses", real: { name: "Repuestos Centro", phone: "+54 9 294 4123-456", address: "Av. Bustillo 1240, Bariloche", whatsapp: "5492944123456" } },
      { alias: "Distribuidor Centro", zone: "Centro", rating: 4.7, partBrand: "TRW", price: 44900, warranty: "3 meses", real: { name: "Andina Parts", phone: "+54 9 294 4567-890", address: "Onelli 530, Bariloche", whatsapp: "5492944567890" } },
      { alias: "Zona Oeste Parts", zone: "Oeste", rating: 4.8, partBrand: "Ferodo", price: 39900, warranty: "12 meses", real: { name: "Patagonia Frenos", phone: "+54 9 294 4789-012", address: "Km 5 Av. Bustillo, Bariloche", whatsapp: "5492944789012" } },
      { alias: "AutoPartes Sur", zone: "Sur", rating: 4.6, partBrand: "Fras-le", price: 37500, warranty: "6 meses", real: { name: "Sur Repuestos", phone: "+54 9 294 4222-333", address: "Elordi 870, Bariloche", whatsapp: "5492944222333" } }
    ],
    ads: [
      { store: "Repuestos Centro", discount: "20% OFF en frenos", icon: "fa-record-vinyl", color: "linear-gradient(135deg,#6D28D9,#8B5CF6)" },
      { store: "Andina Parts", discount: "15% OFF en lubricantes", icon: "fa-oil-can", color: "linear-gradient(135deg,#EAB308,#FACC15)" },
      { store: "Lubricentro Andino", discount: "2x1 en filtros", icon: "fa-gear", color: "linear-gradient(135deg,#22C55E,#16A34A)" }
    ]
  };

  // ---------- Helpers ----------
  const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const tiers = {
    mechanic: [
      { min: 0, label: 'Mecánico Nuevo', icon: 'fa-seedling', cls: 'rep-gray' },
      { min: 10, label: 'Mecánico Activo', icon: 'fa-screwdriver-wrench', cls: 'rep-purple' },
      { min: 50, label: 'Mecánico Pro', icon: 'fa-star', cls: 'rep-yellow' },
      { min: 100, label: 'Mecánico Elite', icon: 'fa-bolt', cls: 'rep-elite' }
    ],
    store: [
      { min: 0, label: 'Vendedor Nuevo', icon: 'fa-seedling', cls: 'rep-gray' },
      { min: 25, label: 'Vendedor Confiable', icon: 'fa-shield-halved', cls: 'rep-purple' },
      { min: 100, label: 'Vendedor Destacado', icon: 'fa-star', cls: 'rep-yellow' },
      { min: 250, label: 'Top Vendedor', icon: 'fa-crown', cls: 'rep-elite' }
    ]
  };
  function tierFor(role, completed) {
    const list = tiers[role] || tiers.mechanic;
    let t = list[0];
    list.forEach((x) => { if (completed >= x.min) t = x; });
    return t;
  }
  function starsHtml(rating) {
    const full = Math.floor(rating);
    const half = rating - full >= 0.5;
    let s = '';
    for (let i = 0; i < full; i++) s += '★';
    if (half) s += '⯪';
    return '<span class="stars">' + s + '</span>';
  }

  // ---------- Toasts ----------
  function ensureToastContainer() {
    let c = document.querySelector('.toast-container');
    if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
    return c;
  }
  function toast({ title, sub, icon = 'fa-circle-check', type = 'purple', duration = 3200 }) {
    const c = ensureToastContainer();
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<div class="toast-icon ${type}"><i class="fa-solid ${icon}"></i></div>
      <div style="flex:1"><div class="toast-title">${title}</div>${sub ? `<div class="toast-sub">${sub}</div>` : ''}</div>`;
    c.appendChild(el);
    setTimeout(() => { el.classList.add('exit'); setTimeout(() => el.remove(), 300); }, duration);
  }
  let audioCtx;
  function ping() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.16, audioCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
      o.start(); o.stop(audioCtx.currentTime + 0.36);
    } catch (e) {}
  }

  // ---------- Navegación responsive (sidebar desktop + bottom-nav mobile) ----------
  const NAVS = {
    mecanico: {
      title: 'Mecánico', sub: 'Taller Patagonia',
      items: [
        { href: 'mecanico-dashboard.html', icon: 'fa-house', label: 'Inicio', key: 'inicio' },
        { href: 'mecanico-historial.html', icon: 'fa-clock-rotate-left', label: 'Pedidos', key: 'pedidos' },
        { href: 'mecanico-pedido.html', icon: 'fa-plus', label: 'Pedir', key: 'pedir', fab: true },
        { href: 'mecanico-seguimiento.html', icon: 'fa-truck-fast', label: 'Envíos', key: 'envios' },
        { href: 'mecanico-perfil.html', icon: 'fa-user', label: 'Perfil', key: 'perfil' }
      ]
    },
    comercio: {
      title: 'Comercio', sub: 'Repuestos Centro',
      items: [
        { href: 'comercio.html', icon: 'fa-bolt', label: 'Solicitudes', key: 'solicitudes' },
        { href: 'comercio.html#cotizadas', icon: 'fa-tags', label: 'Cotizadas', key: 'cotizadas' },
        { href: 'comercio.html#ventas', icon: 'fa-box', label: 'Ventas', key: 'ventas' },
        { href: 'comercio-perfil.html', icon: 'fa-store', label: 'Mi comercio', key: 'perfil' }
      ]
    },
    repartidor: {
      title: 'Repartidor', sub: 'Fletes del Sur',
      items: [
        { href: 'repartidor.html', icon: 'fa-truck-fast', label: 'Envíos', key: 'envios' },
        { href: 'repartidor.html#historial', icon: 'fa-clock-rotate-left', label: 'Historial', key: 'historial' }
      ]
    },
    admin: {
      title: 'Backoffice', sub: 'RepuestosAlToque',
      items: [
        { href: 'admin.html', icon: 'fa-chart-line', label: 'Resumen', key: 'resumen', group: 'Operación' },
        { href: 'admin-usuarios.html', icon: 'fa-users-gear', label: 'Usuarios', key: 'usuarios', group: 'Operación' },
        { href: 'admin-moderacion.html', icon: 'fa-star-half-stroke', label: 'Reputación', key: 'moderacion', group: 'Calidad' },
        { href: 'admin-fletes.html', icon: 'fa-truck', label: 'Fletes y tarifas', key: 'fletes', group: 'Logística' },
        { href: 'admin-auditoria.html', icon: 'fa-clipboard-list', label: 'Auditoría', key: 'auditoria', group: 'Calidad' }
      ]
    }
  };

  function mountNav(role, activeKey) {
    const cfg = NAVS[role];
    if (!cfg) return;
    // Sidebar (desktop)
    const groups = {};
    cfg.items.filter((i) => !i.fab).forEach((i) => { const g = i.group || ''; (groups[g] = groups[g] || []).push(i); });
    let navHtml = '';
    Object.keys(groups).forEach((g) => {
      if (g) navHtml += `<div class="nav-label">${g}</div>`;
      groups[g].forEach((i) => {
        navHtml += `<a href="${i.href}" class="${i.key === activeKey ? 'active' : ''}"><i class="fa-solid ${i.icon}"></i> ${i.label}</a>`;
      });
    });
    const side = document.createElement('aside');
    side.className = 'sidebar';
    side.innerHTML = `
      <a href="index.html" class="brand"><span class="logo-mark"><i class="fa-solid fa-gear"></i></span><span>${cfg.title}<small>${cfg.sub}</small></span></a>
      <nav class="side-nav">${navHtml}</nav>
      <div class="side-foot side-nav">
        <a href="terminos.html"><i class="fa-solid fa-file-lines"></i> Términos</a>
        <a href="login.html"><i class="fa-solid fa-right-from-bracket"></i> Salir</a>
      </div>`;

    // Bottom nav (mobile)
    const bottom = document.createElement('nav');
    bottom.className = 'bottom-nav';
    bottom.innerHTML = cfg.items.map((i) => {
      if (i.fab) return `<a href="${i.href}" class="fab"><i class="fa-solid ${i.icon}"></i></a>`;
      return `<a href="${i.href}" class="${i.key === activeKey ? 'active' : ''}"><i class="fa-solid ${i.icon}"></i>${i.label}</a>`;
    }).join('');

    const frame = document.querySelector('.app-frame');
    if (frame) { frame.insertBefore(side, frame.firstChild); frame.appendChild(bottom); }
    else { document.body.appendChild(side); document.body.appendChild(bottom); }
  }

  // ---------- expose ----------
  window.RAT = { data, money, fmtTime, tierFor, starsHtml, toast, ping, mountNav };
})();
