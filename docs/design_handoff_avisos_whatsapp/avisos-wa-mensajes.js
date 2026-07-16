/* Avisos WhatsApp — Admin · tab Mensajes: historial, respuestas, plantillas, kill switch */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------- Tabs principales ---------- */
  $$('#mainTabs button').forEach((b) =>
    b.addEventListener('click', () => {
      $$('#mainTabs button').forEach((x) => x.classList.toggle('active', x === b));
      $('#tab-guardia').classList.toggle('on', b.dataset.tab === 'guardia');
      $('#tab-mensajes').classList.toggle('on', b.dataset.tab === 'mensajes');
    })
  );

  /* ---------- Sub-vistas ---------- */
  $$('#subseg button').forEach((b) =>
    b.addEventListener('click', () => {
      $$('#subseg button').forEach((x) => x.classList.toggle('active', x === b));
      ['historial', 'respuestas', 'plantillas'].forEach((v) => {
        $('#view-' + v).style.display = b.dataset.view === v ? 'block' : 'none';
      });
    })
  );

  /* ---------- Kill switch ---------- */
  $('#btnKill').addEventListener('click', () => {
    if (!confirm('¿Pausar TODOS los avisos? Nadie va a recibir mensajes del bot hasta reanudarlos.')) return;
    $('#killBanner').style.display = 'flex';
    $('#btnKill').style.display = 'none';
    RAT.toast({ title: 'Avisos pausados globalmente', sub: 'Los eventos se siguen registrando', icon: 'fa-hand', type: 'red' });
  });
  $('#btnResume').addEventListener('click', () => {
    $('#killBanner').style.display = 'none';
    $('#btnKill').style.display = '';
    RAT.toast({ title: 'Avisos reanudados', sub: 'El bot vuelve a enviar mensajes', icon: 'fa-play', type: 'green' });
  });

  /* ---------- Demo: canal sin configurar ---------- */
  $('#setupDemoBack').addEventListener('click', () => {
    $('#setupChecklist').style.display = '';
    $('#channelReady').style.display = 'none';
  });
  $('#setupDemo').addEventListener('click', () => {
    $('#setupChecklist').style.display = 'none';
    $('#channelReady').style.display = '';
  });

  /* ---------- Datos mock: mensajes ---------- */
  const EV = {
    solicitud: { label: 'Nueva solicitud', icon: 'fa-wrench', cls: 'purple' },
    cotizacion: { label: 'Nueva cotización', icon: 'fa-file-invoice-dollar', cls: 'yellow' },
    pago: { label: 'Pago acreditado', icon: 'fa-circle-dollar-to-slot', cls: 'green' },
    mp: { label: 'Comercio vinculó MP', icon: 'fa-link', cls: 'blue' }
  };
  const FAIL_REASONS = { invalid: 'Número inválido', nowa: 'El número no tiene WhatsApp', blocked: 'El destinatario nos bloqueó' };

  const msgs = [
    { id: 1, time: 'Hoy 11:47', dest: 'Jorge', num: '294 415 2823', role: 'admin', ev: 'solicitud', ref: '#S-3391', txt: '🔧 <b>Nueva solicitud:</b> Amortiguadores · Ford Fiesta 2017 · Bariloche. Entrá a cotizar → rat.ar/c/8F2K', st: 'read', group: 'g1' },
    { id: 2, time: 'Hoy 11:47', dest: 'Patagonia Frenos', num: '294 452 9910', role: 'comercio', ev: 'solicitud', ref: '#S-3391', txt: '🔧 <b>Nueva solicitud:</b> Amortiguadores · Ford Fiesta 2017 · Bariloche. Entrá a cotizar → rat.ar/c/8F2K', st: 'delivered', group: 'g1' },
    { id: 3, time: 'Hoy 11:47', dest: 'Sur Repuestos', num: '294 461 8842', role: 'comercio', ev: 'solicitud', ref: '#S-3391', txt: '🔧 <b>Nueva solicitud:</b> Amortiguadores · Ford Fiesta 2017 · Bariloche. Entrá a cotizar → rat.ar/c/8F2K', st: 'fail', reason: 'blocked', group: 'g1' },
    { id: 4, time: 'Hoy 11:32', dest: 'Marcos Ruiz', num: '294 430 5567', role: 'mecanico', ev: 'cotizacion', ref: '#Q-2214', txt: '💬 <b>Nueva cotización:</b> Andina Parts cotizó $48.500 tu pedido de pastillas. Miralo → rat.ar/q/2214', st: 'read', group: 'g2' },
    { id: 5, time: 'Hoy 11:32', dest: 'Jorge', num: '294 415 2823', role: 'admin', ev: 'cotizacion', ref: '#Q-2214', txt: '💬 <b>Nueva cotización:</b> Andina Parts cotizó $48.500 · #Q-2214', st: 'delivered', group: 'g2' },
    { id: 6, time: 'Hoy 10:58', dest: 'Lubricentro Andino', num: '294 477 2301', role: 'comercio', ev: 'pago', ref: '#P-1187', txt: '💰 <b>Pago acreditado:</b> $39.900 · Pastillas Bosch · #P-1187. Coordiná la entrega → rat.ar/p/1187', st: 'read', group: 'g3' },
    { id: 7, time: 'Hoy 10:12', dest: 'Sur Repuestos', num: '294 461 8842', role: 'comercio', ev: 'solicitud', ref: '#S-3388', txt: '🔧 <b>Nueva solicitud:</b> Bomba de agua · VW Gol Trend 2014 · El Bolsón. Entrá a cotizar → rat.ar/c/7D1M', st: 'fail', reason: 'blocked', group: 'g4' },
    { id: 8, time: 'Hoy 10:12', dest: 'Repuestos Centro', num: '294 412 3456', role: 'comercio', ev: 'solicitud', ref: '#S-3388', txt: '🔧 <b>Nueva solicitud:</b> Bomba de agua · VW Gol Trend 2014 · El Bolsón. Entrá a cotizar → rat.ar/c/7D1M', st: 'delivered', group: 'g4' },
    { id: 9, time: 'Hoy 09:40', dest: 'Jorge', num: '294 415 2823', role: 'admin', ev: 'mp', ref: null, txt: '🔗 Lubricentro Andino vinculó Mercado Pago. Ya puede recibir pagos.', st: 'sent', group: 'g5' },
    { id: 10, time: 'Hoy 08:55', dest: 'Guardia finde', num: '294 461 0374', role: 'admin', ev: 'solicitud', ref: '#S-3384', txt: '🔧 <b>Nueva solicitud:</b> Kit de embrague · Renault Kangoo 2019 · Dina Huapi. Entrá a cotizar → rat.ar/c/5K8Q', st: 'fail', reason: 'nowa', group: 'g6' },
    { id: 11, time: 'Ayer 19:32', dest: 'Guardia finde', num: '294 461 0374', role: 'admin', ev: 'pago', ref: '#P-1181', txt: '💰 <b>Pago acreditado:</b> $112.000 · Tren delantero · #P-1181', st: 'delivered', group: 'g7' },
    { id: 12, time: 'Ayer 18:05', dest: 'Nico Herrera', num: '294 488 1290', role: 'mecanico', ev: 'cotizacion', ref: '#Q-2209', txt: '💬 <b>Nueva cotización:</b> Patagonia Frenos cotizó $91.200 tu pedido de discos. Miralo → rat.ar/q/2209', st: 'fail', reason: 'invalid', group: 'g8' }
  ];

  const resps = [
    { time: 'Hoy 11:50', from: 'Sur Repuestos · +54 9 294 461 8842', txt: 'BAJA', action: 'baja' },
    { time: 'Hoy 10:20', from: 'Marcos Ruiz · +54 9 294 430 5567', txt: 'gracias!', action: 'auto' },
    { time: 'Ayer 20:11', from: 'Lubricentro Andino · +54 9 294 477 2301', txt: 'a que hora pasan a buscar el repuesto?', action: 'auto' },
    { time: 'Ayer 16:42', from: 'Nico Herrera · +54 9 294 488 1290', txt: 'BAJA', action: 'baja' }
  ];

  const tpls = [
    { name: 'Nueva solicitud', ev: 'solicitud', status: 'approved', uses: 1240, txt: '🔧 <b>Nueva solicitud:</b> {{repuesto}} · {{vehiculo}} · {{zona}}.<br />Entrá a cotizar → <a href="#" onclick="return false;">{{link}}</a><br /><span style="color:#8696A0;">Respondé BAJA para dejar de recibir avisos.</span>' },
    { name: 'Nueva cotización', ev: 'cotizacion', status: 'approved', uses: 862, txt: '💬 <b>Nueva cotización:</b> {{comercio}} cotizó {{monto}} tu pedido de {{repuesto}}.<br />Miralo → <a href="#" onclick="return false;">{{link}}</a>' },
    { name: 'Pago acreditado', ev: 'pago', status: 'approved', uses: 415, txt: '💰 <b>Pago acreditado:</b> {{monto}} · {{repuesto}} · {{orden}}.<br />Coordiná la entrega → <a href="#" onclick="return false;">{{link}}</a>' },
    { name: 'Comercio vinculó MP', ev: 'mp', status: 'paused', uses: 37, txt: '🔗 {{comercio}} vinculó Mercado Pago. Ya puede recibir pagos.' },
    { name: 'Código de verificación', ev: null, status: 'approved', uses: 198, txt: 'Tu código de RepuestosAlToque es <b>{{codigo}}</b>. Vence en 10 minutos.' },
    { name: 'Aviso de prueba', ev: null, status: 'pending', uses: 0, txt: '✅ Esto es un aviso de prueba de RepuestosAlToque. Si lo recibiste, ¡quedó todo configurado!' }
  ];

  /* ---------- Alertas ---------- */
  function renderAlerts() {
    const blocked = [...new Set(msgs.filter((m) => m.st === 'fail' && m.reason === 'blocked').map((m) => m.dest))];
    const paused = tpls.filter((t) => t.status === 'paused');
    let html = '';
    if (paused.length)
      html += `<div class="alert warn"><div class="al-ic"><i class="fa-solid fa-file-circle-xmark"></i></div><div class="al-main"><div class="al-t">Meta pausó la plantilla “${paused[0].name}”</div><div class="al-s">Ese evento no se está notificando. Afecta la calidad del número — revisala en el Business Manager.</div></div><button class="btn btn-ghost btn-sm" onclick="document.querySelector('#subseg [data-view=plantillas]').click()">Ver plantilla</button></div>`;
    if (blocked.length)
      html += `<div class="alert danger"><div class="al-ic"><i class="fa-solid fa-user-slash"></i></div><div class="al-main"><div class="al-t">${blocked.join(' y ')} nos bloqueó en WhatsApp</div><div class="al-s">No va a recibir ningún aviso hasta que nos desbloquee. Conviene avisarle por otro canal.</div></div></div>`;
    $('#msgAlerts').innerHTML = html;
  }

  /* ---------- Historial ---------- */
  const roleChip = (r) => ({
    comercio: '<span class="role-chip role-comercio"><i class="fa-solid fa-store"></i> Comercio</span>',
    admin: '<span class="role-chip role-admin"><i class="fa-solid fa-user-shield"></i> Admin</span>',
    mecanico: '<span class="role-chip role-mecanico"><i class="fa-solid fa-wrench"></i> Mecánico</span>'
  }[r]);

  function timeline(m) {
    if (m.st === 'fail')
      return `<div class="tl-fail"><span class="badge badge-red"><i class="fa-solid fa-circle-xmark"></i> Fallido</span><span class="fail-reason">${FAIL_REASONS[m.reason]}</span><button class="btn-retry" data-retry="${m.id}"><i class="fa-solid fa-rotate-right"></i> Reintentar</button></div>`;
    const steps = [
      { k: 'sent', l: 'Enviado', i: 'fa-check' },
      { k: 'delivered', l: 'Entregado', i: 'fa-check-double' },
      { k: 'read', l: 'Leído', i: 'fa-check-double' }
    ];
    const order = { sent: 0, delivered: 1, read: 2 };
    const lvl = order[m.st];
    return `<div class="tl">${steps.map((s, i) => {
      const done = i <= lvl;
      const cls = s.k === 'read' && done ? 'read' : done ? 'done' : '';
      return (i ? `<span class="tl-bar ${i <= lvl ? 'done' : ''}"></span>` : '') + `<span class="tl-step ${cls}"><i class="fa-solid ${s.i}"></i>${s.l}</span>`;
    }).join('')}</div>`;
  }

  const F = { estado: '', dest: '', ev: '', fecha: '' };

  function renderMsgs() {
    let list = msgs.slice();
    if (F.estado === 'fail') list.sort((a, b) => (a.st === 'fail' ? -1 : 0) - (b.st === 'fail' ? -1 : 0));
    else if (F.estado) list = list.filter((m) => m.st === F.estado);
    if (F.dest) list = list.filter((m) => m.dest === F.dest);
    if (F.ev) list = list.filter((m) => m.ev === F.ev);
    if (F.fecha) list = list.filter((m) => m.time.startsWith(F.fecha));

    $('#msgEmpty').style.display = list.length ? 'none' : 'block';
    $('#fClear').style.display = F.estado || F.dest || F.ev || F.fecha ? '' : 'none';

    $('#msgBody').innerHTML = list.map((m) => {
      const e = EV[m.ev];
      const ref = m.ref ? ` <a class="link-ev" href="#" onclick="return false;">${m.ref}</a>` : '';
      const siblings = msgs.filter((x) => x.group === m.group && x.id !== m.id);
      const det = siblings.length
        ? `<tr class="m-detail" data-det="${m.id}" style="display:none;"><td colspan="5">
             <div class="det-label"><i class="fa-solid fa-share-nodes"></i> El mismo aviso también se envió a</div>
             <div class="det-grid">${siblings.map((s) => `<div class="det-row"><span class="role-chip role-${s.role}" style="flex-shrink:0;">${{ comercio: 'Comercio', admin: 'Admin', mecanico: 'Mecánico' }[s.role]}</span><span class="dr-name">${s.dest}</span><span class="dr-num">+54 9 ${s.num}</span>${s.st === 'fail' ? `<span class="badge badge-red">Fallido · ${FAIL_REASONS[s.reason]}</span>` : s.st === 'read' ? '<span class="badge badge-blue"><i class="fa-solid fa-check-double"></i> Leído</span>' : s.st === 'delivered' ? '<span class="badge badge-green"><i class="fa-solid fa-check-double"></i> Entregado</span>' : '<span class="badge badge-gray"><i class="fa-solid fa-check"></i> Enviado</span>'}</div>`).join('')}</div>
           </td></tr>`
        : `<tr class="m-detail" data-det="${m.id}" style="display:none;"><td colspan="5"><div class="det-label"><i class="fa-solid fa-share-nodes"></i> Este aviso se envió solo a ${m.dest}</div></td></tr>`;
      return `<tr class="m-row" data-row="${m.id}">
        <td class="m-when">${m.time}</td>
        <td class="m-dest"><div class="dn">${m.dest}</div><div class="dnum">+54 9 ${m.num}</div><div style="margin-top:4px;">${roleChip(m.role)}</div></td>
        <td><span class="ev-chip on" style="cursor:default;"><i class="fa-solid ${e.icon}"></i>${e.label}</span>${ref}</td>
        <td class="m-txt">${m.txt}</td>
        <td>${timeline(m)}</td>
      </tr>${det}`;
    }).join('');
  }

  $('#msgBody').addEventListener('click', (e) => {
    const r = e.target.closest('[data-retry]');
    if (r) {
      e.stopPropagation();
      const m = msgs.find((x) => x.id == r.dataset.retry);
      if (m.reason === 'blocked') { RAT.toast({ title: 'No se puede reintentar', sub: 'El destinatario nos tiene bloqueados', icon: 'fa-user-slash', type: 'red' }); return; }
      m.st = 'delivered'; delete m.reason;
      renderMsgs(); renderAlerts(); updateFailCnt();
      RAT.toast({ title: 'Aviso reenviado', sub: m.dest + ' · entregado', icon: 'fa-check-double', type: 'green' });
      return;
    }
    if (e.target.closest('a')) return;
    const row = e.target.closest('.m-row');
    if (!row) return;
    const det = $(`[data-det="${row.dataset.row}"]`);
    const open = det.style.display !== 'none';
    det.style.display = open ? 'none' : '';
    row.classList.toggle('expanded', !open);
  });

  /* filtros */
  function fillFilters() {
    const dests = [...new Set(msgs.map((m) => m.dest))].sort();
    $('#fDest').innerHTML = '<option value="">Destinatario: todos</option>' + dests.map((d) => `<option>${d}</option>`).join('');
    $('#fEvento').innerHTML = '<option value="">Evento: todos</option>' + Object.entries(EV).map(([k, e]) => `<option value="${k}">${e.label}</option>`).join('');
  }
  ['fEstado', 'fDest', 'fEvento', 'fFecha'].forEach((id, i) => {
    $('#' + id).addEventListener('change', (e) => {
      F[['estado', 'dest', 'ev', 'fecha'][i]] = e.target.value;
      renderMsgs();
    });
  });
  $('#fClear').addEventListener('click', () => {
    F.estado = F.dest = F.ev = F.fecha = '';
    ['fEstado', 'fDest', 'fEvento', 'fFecha'].forEach((id) => { $('#' + id).value = ''; });
    renderMsgs();
  });

  function updateFailCnt() {
    const n = msgs.filter((m) => m.st === 'fail').length;
    const el = $('#failCnt');
    el.textContent = n;
    el.style.display = n ? '' : 'none';
  }

  /* ---------- Respuestas ---------- */
  function renderResps() {
    $('#respBody').innerHTML = resps.map((r) => `<tr>
      <td class="m-when">${r.time}</td>
      <td class="m-dest"><div class="dn" style="font-size:12.5px;">${r.from.split(' · ')[0]}</div><div class="dnum">${r.from.split(' · ')[1]}</div></td>
      <td class="m-txt" style="color:var(--text-1);">“${r.txt}”</td>
      <td>${r.action === 'baja'
        ? '<span class="badge badge-yellow"><i class="fa-solid fa-bell-slash"></i> BAJA procesada — no recibe más avisos</span>'
        : '<span class="badge badge-gray"><i class="fa-solid fa-robot"></i> Auto-respuesta enviada</span>'}</td>
    </tr>`).join('');
  }

  /* ---------- Plantillas ---------- */
  function renderTpls() {
    $('#tplGrid').innerHTML = tpls.map((t) => {
      const st = t.status === 'approved'
        ? '<span class="badge badge-green"><i class="fa-solid fa-circle-check"></i> Aprobada</span>'
        : t.status === 'pending'
          ? '<span class="badge badge-yellow"><i class="fa-solid fa-hourglass-half"></i> Pendiente en Meta</span>'
          : '<span class="badge badge-red"><i class="fa-solid fa-pause"></i> Pausada por Meta</span>';
      return `<div class="tpl ${t.status === 'paused' ? 'paused' : ''}">
        <div class="tpl-h"><span class="tn">${t.name}</span>${st}</div>
        <div class="tpl-body">${t.txt}</div>
        <div class="tpl-foot"><span><i class="fa-solid fa-paper-plane"></i> ${t.uses.toLocaleString('es-AR')} envíos</span>${t.status === 'paused' ? '<a class="link-ev" href="#" onclick="return false;">Revisar en Business Manager →</a>' : ''}</div>
      </div>`;
    }).join('');
  }

  fillFilters();
  renderAlerts();
  renderMsgs();
  renderResps();
  renderTpls();
  updateFailCnt();
})();
