import { useState, useEffect } from 'react';
import { toast } from '@/lib/ui';
import { getTelegramSettings, saveTelegramSettings, sendTelegramTest, detectTelegramChat } from '@/app/actions/telegram';

// Avisos por Telegram: puente temporal hasta el bot de WhatsApp. Cuando un mecánico publica un
// trabajo, le llega el aviso a este chat con el texto listo para copiar y reenviar por WhatsApp.
function TelegramSection() {
  const [s, setS] = useState({ configured: true, chatId: '', enabled: false });
  const [ready, setReady] = useState(false); // no guardar antes de cargar (evita pisar el chat con vacío)
  const [busy, setBusy] = useState(null); // 'save' | 'test' | 'detect'
  const [chats, setChats] = useState(null); // candidatos devueltos por "Detectar"

  useEffect(() => { getTelegramSettings().then((v) => { if (v && !v.error) setS(v); setReady(true); }); }, []);
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy('save');
    const r = await saveTelegramSettings({ chatId: s.chatId, enabled: s.enabled });
    setBusy(null);
    if (r?.error) { toast({ title: r.error, type: 'yellow', icon: 'fa-triangle-exclamation' }); return; }
    toast({ title: 'Avisos por Telegram guardados', icon: 'fa-check', type: 'green' });
  }

  async function detect() {
    setBusy('detect');
    const r = await detectTelegramChat();
    setBusy(null);
    if (r?.error) { toast({ title: r.error, type: 'yellow', icon: 'fa-triangle-exclamation' }); return; }
    if (r.chats.length === 1) { set('chatId', r.chats[0].id); setChats(null); toast({ title: `Chat detectado: ${r.chats[0].name}`, icon: 'fa-check', type: 'green' }); return; }
    setChats(r.chats);
  }

  async function test() {
    setBusy('test');
    const r = await sendTelegramTest(s.chatId);
    setBusy(null);
    if (r?.error) { toast({ title: r.error, type: 'yellow', icon: 'fa-triangle-exclamation' }); return; }
    toast({ title: 'Mensaje de prueba enviado', sub: 'Revisá Telegram', icon: 'fa-paper-plane', type: 'green' });
  }

  return (
    <div className="card mb-16">
      <div className="section-title">
        <h2>Avisos por Telegram</h2>
        <span className="text-xs muted">solo admin</span>
      </div>
      <p className="text-sm muted mb-12">
        Cuando un mecánico publica un pedido, te llega un aviso a Telegram con la patente, el vehículo y el repuesto,
        listo para copiar y reenviar por WhatsApp a los comercios. <b>No le llega a nadie más.</b>
      </p>

      {!s.configured && (
        <div className="card mb-12" style={{ background: 'var(--bg-1)' }}>
          <div className="text-sm"><i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 8 }}></i>
            Falta <b>TELEGRAM_BOT_TOKEN</b> en el servidor. Creá el bot con <b>@BotFather</b> y cargá el token en las variables de entorno.
          </div>
        </div>
      )}

      <div className="field mb-12">
        <label>Chat de Telegram que recibe los avisos</label>
        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
          <input className="input" style={{ maxWidth: 220 }} inputMode="numeric" placeholder="123456789"
            value={s.chatId} onChange={(e) => set('chatId', e.target.value)} />
          <button className="btn btn-ghost btn-sm" disabled={!ready || busy === 'detect'} onClick={detect}>
            {busy === 'detect' ? <span className="spinner" style={{ width: 14, height: 14 }}></span> : <><i className="fa-solid fa-magnifying-glass"></i> Detectar</>}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!ready || !s.chatId || busy === 'test'} onClick={test}>
            {busy === 'test' ? <span className="spinner" style={{ width: 14, height: 14 }}></span> : <><i className="fa-solid fa-paper-plane"></i> Probar</>}
          </button>
        </div>
        <div className="text-xs muted mt-4">
          Abrí el bot en Telegram, mandale <b>/start</b> y tocá <b>Detectar</b>. Telegram identifica cuentas, no números de celular.
        </div>
      </div>

      {chats && (
        <div className="card mb-12" style={{ background: 'var(--bg-1)' }}>
          <div className="text-sm mb-8">Varios chats le escribieron al bot. Elegí cuál recibe los avisos:</div>
          <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
            {chats.map((c) => (
              <button key={c.id} className="btn btn-ghost btn-sm" onClick={() => { set('chatId', c.id); setChats(null); }}>
                <i className="fa-brands fa-telegram"></i> {c.name} <span className="muted">({c.id})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="flex-center gap-8 mb-12" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={s.enabled} onChange={(e) => set('enabled', e.target.checked)} />
        <span className="text-sm">Avisarme por Telegram cuando entra un pedido nuevo para cotizar</span>
      </label>

      <button className="btn btn-yellow btn-sm" disabled={!ready || busy === 'save'} onClick={save}>
        <i className="fa-solid fa-floppy-disk"></i> Guardar
      </button>
    </div>
  );
}

export default TelegramSection;
