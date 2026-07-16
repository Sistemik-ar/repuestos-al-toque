/* Avisos WhatsApp — Comercio · lógica de estados */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const states = ['setup', 'verify', 'active', 'baja'];
  let phone = '294 415 2823';

  function show(state) {
    states.forEach((s) => $('#st-' + s).classList.toggle('on', s === state));
    $$('#demoSeg button').forEach((b) => b.classList.toggle('active', b.dataset.state === state));
    if (state === 'verify') {
      $('#sentToNum').textContent = '+54 9 ' + phone;
      clearCode();
      setTimeout(() => { const first = $('.code-box'); if (first) first.focus(); }, 120);
    }
    if (state === 'active') updateMasked();
  }

  $$('#demoSeg button').forEach((b) => b.addEventListener('click', () => show(b.dataset.state)));

  /* ---------- Estado 1: teléfono ---------- */
  const phoneInput = $('#phoneInput');
  const phoneWrap = $('#phoneWrap');
  const phoneHint = $('#phoneHint');
  const btnVerify = $('#btnVerify');

  function digits(v) { return v.replace(/\D/g, ''); }
  function fmtPhone(d) {
    // 294 412 3456 (10 dígitos: área 2-4 + resto)
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + ' ' + d.slice(3);
    return d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6, 10);
  }
  function validate() {
    const d = digits(phoneInput.value);
    const valid = d.length === 10 && !d.startsWith('0') && !d.startsWith('15');
    btnVerify.disabled = !valid;
    if (!phoneInput.value) {
      phoneWrap.classList.remove('invalid');
      phoneHint.className = 'field-hint';
      phoneHint.innerHTML = '<i class="fa-solid fa-circle-info"></i>Código de área sin 0 y número sin 15. Ej: 294 412 3456';
    } else if (valid) {
      phoneWrap.classList.remove('invalid');
      phoneHint.className = 'field-hint ok';
      phoneHint.innerHTML = '<i class="fa-solid fa-circle-check"></i>Formato correcto';
    } else if (d.startsWith('0') || d.startsWith('15')) {
      phoneWrap.classList.add('invalid');
      phoneHint.className = 'field-hint err';
      phoneHint.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>Sin el 0 del área ni el 15. Ej: 294 412 3456';
    } else if (d.length > 10) {
      phoneWrap.classList.add('invalid');
      phoneHint.className = 'field-hint err';
      phoneHint.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>Son 10 dígitos en total (área + número)';
    } else {
      phoneWrap.classList.remove('invalid');
      phoneHint.className = 'field-hint';
      phoneHint.innerHTML = '<i class="fa-solid fa-circle-info"></i>Te faltan ' + (10 - d.length) + ' dígitos';
    }
    return valid;
  }
  phoneInput.addEventListener('input', () => {
    const d = digits(phoneInput.value).slice(0, 11);
    phoneInput.value = fmtPhone(d);
    validate();
  });

  btnVerify.addEventListener('click', () => {
    if (btnVerify.disabled) return;
    phone = phoneInput.value.trim();
    window.RAT && RAT.toast({ title: 'Código enviado', sub: 'Mirá tu WhatsApp: +54 9 ' + phone, icon: 'fa-paper-plane', type: 'green' });
    show('verify');
  });

  /* ---------- Estado 2: código ---------- */
  const boxes = $$('.code-box');
  const codeErr = $('#codeErr');
  function clearCode() { boxes.forEach((b) => { b.value = ''; b.classList.remove('filled'); }); codeErr.style.display = 'none'; }

  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '').slice(0, 1);
      box.classList.toggle('filled', !!box.value);
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
      checkCode();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) boxes[i - 1].focus();
    });
    box.addEventListener('paste', (e) => {
      const txt = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      if (txt.length > 1) {
        e.preventDefault();
        txt.split('').forEach((c, j) => { if (boxes[j]) { boxes[j].value = c; boxes[j].classList.add('filled'); } });
        boxes[Math.min(txt.length, 5)].focus();
        checkCode();
      }
    });
  });

  function checkCode() {
    const code = boxes.map((b) => b.value).join('');
    if (code.length !== 6) return;
    // demo: cualquier código que no sea 000000 verifica
    if (code === '000000') {
      codeErr.style.display = 'flex';
      boxes.forEach((b) => { b.value = ''; b.classList.remove('filled'); });
      boxes[0].focus();
      return;
    }
    window.RAT && RAT.toast({ title: 'Número verificado', sub: 'Ya estás recibiendo avisos', icon: 'fa-circle-check', type: 'green' });
    show('active');
  }

  const btnResend = $('#btnResend');
  let resendT = null;
  btnResend.addEventListener('click', () => {
    if (btnResend.disabled) return;
    window.RAT && RAT.toast({ title: 'Código reenviado', sub: 'Puede tardar unos segundos', icon: 'fa-rotate-right', type: 'purple' });
    let left = 30;
    btnResend.disabled = true;
    const base = '<i class="fa-solid fa-rotate-right"></i> Reenviar código';
    btnResend.innerHTML = base + ' (' + left + 's)';
    clearInterval(resendT);
    resendT = setInterval(() => {
      left -= 1;
      if (left <= 0) { clearInterval(resendT); btnResend.disabled = false; btnResend.innerHTML = base; }
      else btnResend.innerHTML = base + ' (' + left + 's)';
    }, 1000);
  });

  $('#btnChangeNum').addEventListener('click', () => show('setup'));

  /* ---------- Estado 3: verificado ---------- */
  function updateMasked() {
    const d = digits(phone);
    if (d.length === 10) {
      $('#maskedNum').textContent = '+54 9 ' + d.slice(0, 3) + ' •••• ' + d.slice(7);
    }
  }
  const toggle = $('#notifToggle');
  toggle.addEventListener('change', () => {
    $('#pausedNote').style.display = toggle.checked ? 'none' : 'flex';
    $('#previewCard').style.opacity = toggle.checked ? '1' : '0.55';
    window.RAT && RAT.toast(toggle.checked
      ? { title: 'Avisos activados', icon: 'fa-bell', type: 'green' }
      : { title: 'Avisos pausados', sub: 'Los reactivás cuando quieras', icon: 'fa-bell-slash', type: 'yellow' });
  });

  $('#btnTest').addEventListener('click', () => {
    const btn = $('#btnTest');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Enviando…';
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviarme un aviso de prueba';
      window.RAT && RAT.toast({ title: 'Aviso de prueba enviado', sub: 'Revisá tu WhatsApp', icon: 'fa-brands fa-whatsapp', type: 'green' });
    }, 1400);
  });

  $('#btnChangeFromActive').addEventListener('click', () => {
    phoneInput.value = '';
    validate();
    show('setup');
    window.RAT && RAT.toast({ title: 'Ingresá el número nuevo', sub: 'Vas a tener que verificarlo de nuevo', icon: 'fa-pen', type: 'purple' });
  });

  /* ---------- Estado 4: dado de baja ---------- */
  $('#btnReactivar').addEventListener('click', () => {
    toggle.checked = true;
    $('#pausedNote').style.display = 'none';
    $('#previewCard').style.opacity = '1';
    show('active');
    window.RAT && RAT.toast({ title: 'Avisos reactivados', sub: 'Volvés a recibir avisos de tus rubros', icon: 'fa-bell', type: 'green' });
  });

  show('setup');
})();
