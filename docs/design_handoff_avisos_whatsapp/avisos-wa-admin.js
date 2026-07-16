/* Avisos WhatsApp — Admin · números de guardia, KPIs y log */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);

  /* ---------- Datos mock ---------- */
  const EVENTS = [
    { id: 'solicitud', label: 'Nueva solicitud', icon: 'fa-wrench' },
    { id: 'cotizacion', label: 'Nueva cotización', icon: 'fa-file-invoice-dollar' },
    { id: 'pago', label: 'Pago acreditado', icon: 'fa-circle-dollar-to-slot' },
    { id: 'mp', label: 'Comercio vinculó MP', icon: 'fa-link' }
  ];

  let guards = [
    { id: 1, name: 'Jorge', num: '294 415 2823', status: 'verified', active: true, events: ['solicitud', 'cotizacion', 'pago', 'mp'], last: 'Hace 4 min', lastEv: 'Nueva solicitud' },
    { id: 2, name: 'Guardia finde', num: '294 461 0374', status: 'verified', active: true, events: ['solicitud', 'pago'], last: 'Ayer 19:32', lastEv: 'Pago acreditado' },
    { id: 3, name: 'Marto (soporte)', num: '294 452 7716', status: 'pending', active: false, events: ['solicitud'], last: null, lastEv: null }
  ];

  const log = [
    { time: 'Hoy 11:47', ev: 'solicitud', to: 'Jorge · guardia', what: 'Amortiguadores · Ford Fiesta 2017 · Bariloche', status: 'ok' },
    { time: 'Hoy 11:47', ev: 'solicitud', to: 'Patagonia Frenos', what: 'Amortiguadores · Ford Fiesta 2017 · Bariloche', status: 'ok' },
    { time: 'Hoy 11:32', ev: 'cotizacion', to: 'Jorge · guardia', what: 'Andina Parts cotizó $48.500 · #Q-2214', status: 'ok' },
    { time: 'Hoy 10:58', ev: 'pago', to: 'Jorge · guardia', what: '$39.900 acreditado · Pastillas Bosch · #P-1187', status: 'ok' },
    { time: 'Hoy 10:12', ev: 'solicitud', to: 'Sur Repuestos', what: 'Bomba de agua · VW Gol Trend 2014 · El Bolsón', status: 'fail' },
    { time: 'Hoy 09:40', ev: 'mp', to: 'Jorge · guardia', what: 'Lubricentro Andino vinculó Mercado Pago', status: 'ok' },
    { time: 'Hoy 08:55', ev: 'solicitud', to: 'Repuestos Centro', what: 'Kit de embrague · Renault Kangoo 2019 · Dina Huapi', status: 'ok' },
    { time: 'Ayer 19:32', ev: 'pago', to: 'Guardia finde', what: '$112.000 acreditado · Tren delantero · #P-1181', status: 'ok' }
  ];

  const evIcCls = { solicitud: 'purple', cotizacion: 'yellow', pago: 'green', mp: 'blue' };

  /* ---------- KPIs ---------- */
  function renderKpis() {
    $('#kpis').innerHTML = `
      <div class="kpi channel ok">
        <div class="kl">Canal WhatsApp <i class="fa-brands fa-whatsapp" style="color:#25D366;"></i></div>
        <div class="kv"><span class="live-dot"></span> API conectada</div>
        <div class="ks">Meta Cloud API · último ping hace 40 s</div>
      </div>
      <div class="kpi">
        <div class="kl">Avisos enviados hoy <i class="fa-solid fa-paper-plane"></i></div>
        <div class="kv">142</div>
        <div class="ks">96% entregados en &lt; 10 s</div>
      </div>
      <div class="kpi red">
        <div class="kl">Fallidos hoy <i class="fa-solid fa-triangle-exclamation"></i></div>
        <div class="kv">3</div>
        <div class="ks">2 reintentados con éxito</div>
      </div>
      <div class="kpi">
        <div class="kl">Comercios con WhatsApp <i class="fa-solid fa-store"></i></div>
        <div class="kv split-kv"><span class="text-green">31</span><span class="sep">/</span><span class="b">47</span></div>
        <div class="ks">16 sin configurar — <a href="#" onclick="return false;">recordarles</a></div>
      </div>`;
  }

  /* ---------- Números de guardia ---------- */
  function guardRow(g) {
    const statusChip = g.status === 'verified'
      ? '<span class="badge badge-green"><i class="fa-solid fa-circle-check"></i> Verificado</span>'
      : '<span class="badge badge-yellow"><i class="fa-solid fa-hourglass-half"></i> Pendiente</span>';
    const last = g.last
      ? `<div class="gd-last">Último aviso<b>${g.last} · ${g.lastEv}</b></div>`
      : '<div class="gd-last">Sin avisos<b>todavía</b></div>';
    const chips = EVENTS.map((e) =>
      `<span class="ev-chip ${g.events.includes(e.id) ? 'on' : ''}" data-gid="${g.id}" data-ev="${e.id}"><i class="fa-solid ${e.icon}"></i>${e.label}</span>`
    ).join('');
    const verify = g.status === 'pending'
      ? `<div class="gd-verify">
           <span class="vt"><i class="fa-solid fa-key"></i> Código enviado a +54 9 ${g.num}</span>
           <input type="tel" inputmode="numeric" maxlength="6" placeholder="••••••" data-vgid="${g.id}" />
           <button class="link-btn" data-resend="${g.id}"><i class="fa-solid fa-rotate-right"></i> Reenviar</button>
         </div>`
      : '';
    return `<div class="gd-row ${g.active ? '' : 'off'}" data-row="${g.id}">
      <div class="gd-top">
        <div class="gd-av"><i class="fa-solid fa-user-shield"></i></div>
        <div class="gd-main">
          <div class="gd-name">${g.name} ${statusChip}</div>
          <div class="gd-num">+54 9 ${g.num}</div>
        </div>
        ${last}
        <div class="gd-actions">
          <label class="switch" title="${g.active ? 'Activo' : 'Inactivo'}"><input type="checkbox" data-toggle="${g.id}" ${g.active ? 'checked' : ''} ${g.status === 'pending' ? 'disabled' : ''} /><span class="track"></span><span class="thumb"></span></label>
          <button class="icon-mini" title="Editar" data-edit="${g.id}"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-mini danger" title="Eliminar" data-del="${g.id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <div class="gd-events">${chips}</div>
      ${verify}
    </div>`;
  }

  function renderGuards() {
    $('#gdCount').textContent = guards.length;
    const list = $('#gdList');
    if (!guards.length) {
      list.innerHTML = `<div class="empty-state">
        <div class="empty-icon"><i class="fa-brands fa-whatsapp"></i></div>
        <div style="font-weight:800;font-size:15px;color:var(--text-1);">Sin números de guardia</div>
        <p class="text-sm" style="margin:8px auto 18px;max-width:300px;line-height:1.5;">Agregá al menos un número para que alguien del equipo reciba todos los avisos de la plataforma.</p>
        <button class="btn btn-primary" id="btnAddEmpty"><i class="fa-solid fa-plus"></i> Agregar número</button>
      </div>`;
      const b = $('#btnAddEmpty');
      if (b) b.addEventListener('click', () => openModal());
      return;
    }
    list.innerHTML = guards.map(guardRow).join('');
  }

  $('#gdList').addEventListener('click', (e) => {
    const chip = e.target.closest('.ev-chip');
    if (chip) {
      const g = guards.find((x) => x.id == chip.dataset.gid);
      const ev = chip.dataset.ev;
      if (g.events.includes(ev)) {
        if (g.events.length === 1) { RAT.toast({ title: 'Tiene que recibir al menos un evento', icon: 'fa-circle-info', type: 'yellow' }); return; }
        g.events = g.events.filter((x) => x !== ev);
      } else g.events.push(ev);
      renderGuards();
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const g = guards.find((x) => x.id == del.dataset.del);
      if (confirm('¿Eliminar el número de ' + g.name + '? Deja de recibir todos los avisos.')) {
        guards = guards.filter((x) => x.id !== g.id);
        renderGuards();
        RAT.toast({ title: 'Número eliminado', sub: g.name + ' · +54 9 ' + g.num, icon: 'fa-trash', type: 'red' });
      }
      return;
    }
    const edit = e.target.closest('[data-edit]');
    if (edit) { openModal(guards.find((x) => x.id == edit.dataset.edit)); return; }
    const resend = e.target.closest('[data-resend]');
    if (resend) {
      const g = guards.find((x) => x.id == resend.dataset.resend);
      RAT.toast({ title: 'Código reenviado', sub: '+54 9 ' + g.num, icon: 'fa-rotate-right', type: 'purple' });
    }
  });

  $('#gdList').addEventListener('change', (e) => {
    const t = e.target.closest('[data-toggle]');
    if (!t) return;
    const g = guards.find((x) => x.id == t.dataset.toggle);
    g.active = t.checked;
    renderGuards();
    RAT.toast(g.active
      ? { title: g.name + ' activado', sub: 'Vuelve a recibir avisos', icon: 'fa-bell', type: 'green' }
      : { title: g.name + ' desactivado', sub: 'No recibe avisos hasta reactivarlo', icon: 'fa-bell-slash', type: 'yellow' });
  });

  $('#gdList').addEventListener('input', (e) => {
    const inp = e.target.closest('[data-vgid]');
    if (!inp) return;
    inp.value = inp.value.replace(/\D/g, '').slice(0, 6);
    if (inp.value.length === 6) {
      const g = guards.find((x) => x.id == inp.dataset.vgid);
      g.status = 'verified'; g.active = true;
      renderGuards();
      RAT.toast({ title: 'Número verificado', sub: g.name + ' ya recibe avisos', icon: 'fa-circle-check', type: 'green' });
    }
  });

  /* ---------- Modal agregar / editar ---------- */
  const modal = $('#numModal');
  function openModal(g) {
    const isEdit = !!g;
    const evs = g ? g.events : ['solicitud'];
    $('#numModalBody').innerHTML = `
      <h3>${isEdit ? 'Editar número' : 'Agregar número de guardia'}</h3>
      <p class="m-sub">${isEdit ? 'Si cambiás el número, hay que verificarlo de nuevo.' : 'Le mandamos un código de 6 dígitos por WhatsApp para verificarlo.'}</p>
      <div class="field">
        <label>Etiqueta / nombre</label>
        <input class="input" id="mName" placeholder='Ej: "Jorge", "Guardia finde"' value="${g ? g.name : ''}" />
      </div>
      <div class="field">
        <label>Número de WhatsApp</label>
        <div class="phone-wrap">
          <span class="phone-prefix">🇦🇷 +54 9</span>
          <input id="mNum" type="tel" inputmode="numeric" placeholder="294 412 3456" value="${g ? g.num : ''}" />
        </div>
      </div>
      <div class="field">
        <label>Eventos que recibe</label>
        <div class="ev-picker" id="mEvents">
          ${EVENTS.map((e) => `<span class="ev-chip ${evs.includes(e.id) ? 'on' : ''}" data-ev="${e.id}"><i class="fa-solid ${e.icon}"></i>${e.label}</span>`).join('')}
        </div>
      </div>
      <div class="m-actions">
        <button class="btn btn-ghost" id="mCancel">Cancelar</button>
        <button class="btn btn-primary" id="mSave">${isEdit ? 'Guardar cambios' : 'Enviar código y agregar'}</button>
      </div>`;
    modal.classList.add('open');

    $('#mEvents').addEventListener('click', (e) => {
      const c = e.target.closest('.ev-chip');
      if (c) c.classList.toggle('on');
    });
    $('#mNum').addEventListener('input', () => {
      const d = $('#mNum').value.replace(/\D/g, '').slice(0, 10);
      $('#mNum').value = d.length > 6 ? d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6) : d.length > 3 ? d.slice(0, 3) + ' ' + d.slice(3) : d;
    });
    $('#mCancel').addEventListener('click', close);
    $('#mSave').addEventListener('click', () => {
      const name = $('#mName').value.trim();
      const num = $('#mNum').value.trim();
      const evsSel = Array.from(document.querySelectorAll('#mEvents .ev-chip.on')).map((c) => c.dataset.ev);
      if (!name || num.replace(/\D/g, '').length !== 10) { RAT.toast({ title: 'Revisá los datos', sub: 'Nombre y número de 10 dígitos', icon: 'fa-circle-xmark', type: 'red' }); return; }
      if (!evsSel.length) { RAT.toast({ title: 'Elegí al menos un evento', icon: 'fa-circle-info', type: 'yellow' }); return; }
      if (isEdit) {
        const numChanged = num !== g.num;
        Object.assign(g, { name, num, events: evsSel });
        if (numChanged) { g.status = 'pending'; g.active = false; RAT.toast({ title: 'Código enviado', sub: 'Verificá el número nuevo: +54 9 ' + num, icon: 'fa-paper-plane', type: 'yellow' }); }
        else RAT.toast({ title: 'Cambios guardados', icon: 'fa-circle-check', type: 'green' });
      } else {
        guards.push({ id: Date.now(), name, num, status: 'pending', active: false, events: evsSel, last: null, lastEv: null });
        RAT.toast({ title: 'Código enviado por WhatsApp', sub: '+54 9 ' + num + ' · ingresá el código para activarlo', icon: 'fa-paper-plane', type: 'green' });
      }
      renderGuards();
      close();
    });
  }
  function close() { modal.classList.remove('open'); }
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  $('#btnAdd').addEventListener('click', () => openModal());

  /* ---------- Log ---------- */
  function renderLog() {
    const today = log.filter((l) => l.time.startsWith('Hoy')).length;
    $('#logToday').textContent = today + ' hoy';
    $('#logList').innerHTML = log.map((l, i) => {
      const ev = EVENTS.find((e) => e.id === l.ev);
      const right = l.status === 'ok'
        ? `<span class="badge badge-green"><i class="fa-solid fa-check-double"></i> Entregado</span>`
        : `<button class="btn-retry" data-retry="${i}"><i class="fa-solid fa-rotate-right"></i> Reintentar</button>`;
      return `<div class="log-row">
        <div class="log-ic ${evIcCls[l.ev]}"><i class="fa-solid ${ev.icon}"></i></div>
        <div class="log-main">
          <div class="log-t">${ev.label} → ${l.to}</div>
          <div class="log-s">${l.what}</div>
        </div>
        <div class="log-right">
          <span class="log-time">${l.time}</span>
          ${right}
        </div>
      </div>`;
    }).join('');
  }
  $('#logList').addEventListener('click', (e) => {
    const r = e.target.closest('[data-retry]');
    if (!r) return;
    const l = log[r.dataset.retry];
    l.status = 'ok';
    renderLog();
    RAT.toast({ title: 'Aviso reenviado', sub: l.to + ' · entregado', icon: 'fa-check-double', type: 'green' });
  });

  $('#refresh').addEventListener('click', () => RAT.toast({ title: 'Actualizado', icon: 'fa-rotate', type: 'purple' }));

  renderKpis();
  renderGuards();
  renderLog();
})();
