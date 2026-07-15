import { useState, useEffect } from 'react';
import { money, toast, fmtDateTime } from '@/lib/ui';
import Loading from '@/components/Loading';
import { setStoreCategories, getStoreQuotes, getRecentQuotes, getStoreDetail } from '@/app/actions/data';

// "selección normalizada" de un comercio → string estable para comparar contra el baseline (dirty).
const norm = (sel) => [...sel].sort((a, b) => a - b).join(',');
// el seed guarda iconos como "fa-toolbox"; los normalizamos por si vinieran con prefijo "fa-solid ".
const catIcon = (c) => (c.icon || 'fa-layer-group').replace(/^fa-solid\s+/, '');

// Matriz comercio × rubro: tildá qué categorías cotiza cada comercio. Edición en lote (un solo
// "Guardar todo" para todos los cambios) con vista matriz (desktop) o lista/acordeón (mobile).
function StoreCategories({ stores, categories, onSaved }) {
  const rubros = categories || [];
  const [work, setWork] = useState([]);          // copia editable: [{ id, name, sel:[catId] }]
  const [baseline, setBaseline] = useState(() => new Map()); // id -> norm(sel) original, para detectar cambios
  const [view, setView] = useState('matrix');     // 'matrix' | 'list'
  const [narrow, setNarrow] = useState(false);     // < 760px: siempre lista
  const [query, setQuery] = useState('');
  const [rubroSel, setRubroSel] = useState('');    // filtro/resaltado de columna (string del id)
  const [openAcc, setOpenAcc] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [quotesStore, setQuotesStore] = useState(null); // comercio cuyas cotizaciones se ven en el modal
  const [allQuotes, setAllQuotes] = useState(false); // modal "Todas las cotizaciones" (todos los comercios)
  const [drawerStore, setDrawerStore] = useState(null); // comercio cuya ficha consolidada se ve en el drawer

  // (re)sincronizar con los datos: al montar, tras guardar y en cada refresh en vivo del admin.
  // Las filas con cambios sin guardar (dirty) conservan su selección editada: el auto-refresh
  // de fondo no pisa la edición en curso.
  useEffect(() => {
    setWork((prev) => (stores || []).map((s) => {
      const old = prev.find((c) => c.id === s.id);
      const keepEdit = old && baseline.get(old.id) !== norm(old.sel);
      return { id: s.id, name: s.name, sel: keepEdit ? old.sel : [...(s.categoryIds || [])] };
    }));
    setBaseline(new Map((stores || []).map((s) => [s.id, norm(s.categoryIds || [])])));
  }, [stores]); // eslint-disable-line react-hooks/exhaustive-deps

  // vista por defecto según ancho + preferencia guardada.
  useEffect(() => {
    const apply = () => setNarrow(window.innerWidth < 760);
    apply();
    window.addEventListener('resize', apply);
    try { const v = localStorage.getItem('cm.view'); if (v === 'matrix' || v === 'list') setView(v); } catch {}
    return () => window.removeEventListener('resize', apply);
  }, []);

  if (!stores || !categories || stores.length === 0) return null;

  const useMatrix = view === 'matrix' && !narrow;
  const has = (c, rid) => c.sel.includes(rid);
  const isDirty = (c) => baseline.get(c.id) !== norm(c.sel);
  const coverageExplicit = (rid) => work.filter((c) => has(c, rid)).length; // cuántos lo tildaron explícitamente
  const dirty = work.filter(isDirty);

  const toggle = (cId, rid) => setWork((w) => w.map((c) => c.id !== cId ? c
    : { ...c, sel: has(c, rid) ? c.sel.filter((r) => r !== rid) : [...c.sel, rid] }));
  const setRow = (cId, all) => setWork((w) => w.map((c) => c.id !== cId ? c
    : { ...c, sel: all ? rubros.map((r) => r.id) : [] }));
  const setVw = (v) => { setView(v); try { localStorage.setItem('cm.view', v); } catch {} };
  const toggleAcc = (id) => setOpenAcc((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pickColumn = (rid) => setRubroSel((cur) => cur === String(rid) ? '' : String(rid));

  async function saveAll() {
    setSaving(true);
    for (const c of dirty) {
      const r = await setStoreCategories(c.id, c.sel);
      if (r?.error) { toast({ title: r.error, type: 'yellow', icon: 'fa-triangle-exclamation' }); setSaving(false); return; }
    }
    setBaseline(new Map(work.map((c) => [c.id, norm(c.sel)])));
    setSaving(false);
    toast({ title: 'Cambios guardados', sub: 'Los comercios ya reciben pedidos de sus nuevos rubros', icon: 'fa-floppy-disk', type: 'green' });
    onSaved?.();
  }
  function discard() {
    setWork((w) => w.map((c) => {
      const b = baseline.get(c.id);
      return { ...c, sel: b ? b.split(',').filter(Boolean).map(Number) : [] };
    }));
    toast({ title: 'Cambios descartados', icon: 'fa-rotate-left', type: 'purple' });
  }

  const q = query.trim().toLowerCase();
  const matchRow = (c) => !q || c.name.toLowerCase().includes(q);

  // KPIs de cobertura
  const thin = rubros.filter((r) => coverageExplicit(r.id) <= 1);
  const allReceivers = work.filter((c) => c.sel.length === 0).length;
  const thinAlert = thin.length > 0;

  const Avatar = () => <div className="cm-av"><i className="fa-solid fa-store"></i></div>;

  function renderMatrix() {
    const rows = work.filter(matchRow);
    return (
      <div className="matrix-card">
        <div className="matrix-scroll">
          <table className="matrix">
            <thead>
              <tr>
                <th className="corner">
                  <div className="corner-title">Comercio</div>
                  <div className="corner-sub">{rows.length} de {work.length} · tocá un rubro para resaltar la columna</div>
                </th>
                {rubros.map((r) => {
                  const cov = coverageExplicit(r.id);
                  const cls = cov === 0 ? 'empty' : cov <= 1 ? 'thin' : '';
                  const hl = rubroSel === String(r.id) ? 'col-hl' : '';
                  return (
                    <th key={r.id}>
                      <div className={`rubro-h ${cls} ${hl}`} onClick={() => pickColumn(r.id)} title={r.name}>
                        <span className="rh-ic"><i className={`fa-solid ${catIcon(r)}`}></i></span>
                        <span className="rh-name">{r.name}</span>
                        <span className="rh-count">{cov}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0
                ? <tr><td className="cm-name" colSpan={rubros.length + 1}><div className="empty-list">No hay comercios que coincidan.</div></td></tr>
                : rows.map((c) => (
                  <tr key={c.id} className={`cm-row ${isDirty(c) ? 'dirty' : ''}`}>
                    <td className="cm-name">
                      <div className="cm-name-inner">
                        <Avatar />
                        <div className="cm-meta" onClick={() => setDrawerStore(c)} style={{ cursor: 'pointer' }} title={`Ver ficha de ${c.name}`}>
                          <div className="nm">{c.name}</div>
                          <div className="ct">{c.sel.length === 0 ? <span className="badge-all">Recibe de todos</span> : `${c.sel.length} de ${rubros.length} rubros`}</div>
                        </div>
                        <button type="button" className="cm-cot" title={`Ver cotizaciones de ${c.name}`} onClick={() => setQuotesStore(c)}><i className="fa-solid fa-tags"></i></button>
                      </div>
                    </td>
                    {rubros.map((r) => {
                      const on = has(c, r.id);
                      const hl = rubroSel === String(r.id) ? 'col-hl' : '';
                      return (
                        <td key={r.id} className={`cell ${hl}`}>
                          <button type="button" className={`cell-btn ${on ? 'on' : ''}`} onClick={() => toggle(c.id, r.id)} aria-label={`${c.name} · ${r.name}`} aria-pressed={on}>
                            <span className="cell-box"><i className="fa-solid fa-check"></i></span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderList() {
    const rows = work.filter(matchRow).filter((c) => !rubroSel || has(c, Number(rubroSel)));
    if (rows.length === 0) return <div className="empty-list">No hay comercios que coincidan.</div>;
    return (
      <div className="list-view">
        {rows.map((c) => {
          const open = openAcc.has(c.id);
          return (
            <div key={c.id} className={`cm-acc ${open ? 'open' : ''} ${isDirty(c) ? 'dirty' : ''}`}>
              <div className="cm-acc-head" onClick={() => toggleAcc(c.id)}>
                <Avatar />
                <div className="acc-meta">
                  <div className="nm">{c.name}</div>
                  <div className="ct">
                    {c.sel.length === 0 ? <span className="badge-all">Recibe de todos los rubros</span> : <>{c.sel.length} de {rubros.length} rubros</>}
                    <span className="cov-dots">{rubros.map((r) => <i key={r.id} className={has(c, r.id) ? 'on' : ''}></i>)}</span>
                    {isDirty(c) && <span className="badge badge-yellow"><i className="fa-solid fa-circle-dot"></i> Sin guardar</span>}
                  </div>
                </div>
                <i className="fa-solid fa-chevron-down acc-caret"></i>
              </div>
              {open && (
                <div className="cm-acc-body">
                  <div className="rubro-pills">
                    {rubros.map((r) => {
                      const on = has(c, r.id);
                      return (
                        <button key={r.id} type="button" className={`rpill ${on ? 'on' : ''}`} onClick={() => toggle(c.id, r.id)} aria-pressed={on}>
                          <span className="chk">{on ? <i className="fa-solid fa-check"></i> : <i className="fa-solid fa-plus" style={{ opacity: 0.5 }}></i>}</span>{r.name}
                        </button>
                      );
                    })}
                  </div>
                  <div className="acc-quick">
                    <button type="button" className="lnk" onClick={() => setRow(c.id, true)}>Marcar todos</button>
                    <span className="sep">·</span>
                    <button type="button" className="lnk" onClick={() => setRow(c.id, false)}>Limpiar</button>
                    <span className="spacer"></span>
                    <button type="button" className="lnk" onClick={() => setDrawerStore(c)}><i className="fa-solid fa-id-card"></i> Ver ficha</button>
                    <span className="sep">·</span>
                    <button type="button" className="lnk" onClick={() => setQuotesStore(c)}><i className="fa-solid fa-tags"></i> Ver cotizaciones</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <div className="cov-strip">
        <div className="cov-card">
          <div className="cv-label"><i className="fa-solid fa-store"></i> Comercios</div>
          <div className="cv-value">{work.length}</div>
          <div className="cv-sub">en Bariloche</div>
        </div>
        <div className="cov-card">
          <div className="cv-label"><i className="fa-solid fa-layer-group"></i> Rubros activos</div>
          <div className="cv-value">{rubros.length}</div>
          <div className="cv-sub">categorías del catálogo</div>
        </div>
        <div className={`cov-card ${thinAlert ? 'alert' : 'ok'}`}
          onClick={thinAlert ? () => { setRubroSel(String(thin[0].id)); toast({ title: 'Filtrado por ' + thin[0].name, sub: `Solo ${coverageExplicit(thin[0].id)} comercio${coverageExplicit(thin[0].id) === 1 ? '' : 's'} lo cubre${coverageExplicit(thin[0].id) === 1 ? '' : 'n'}`, icon: 'fa-triangle-exclamation', type: 'yellow' }); } : undefined}>
          <div className="cv-label"><i className={`fa-solid ${thinAlert ? 'fa-triangle-exclamation' : 'fa-circle-check'}`}></i> Poca cobertura</div>
          <div className="cv-value">{thin.length}</div>
          <div className="cv-sub">{thinAlert ? `${thin.slice(0, 3).map((r) => r.name).join(', ')}${thin.length > 3 ? ` y ${thin.length - 3} más` : ''} · 1 comercio o menos` : 'todos los rubros cubiertos'}</div>
        </div>
        <div className="cov-card">
          <div className="cv-label"><i className="fa-solid fa-globe"></i> Reciben de todo</div>
          <div className="cv-value">{allReceivers}</div>
          <div className="cv-sub">sin rubros tildados</div>
        </div>
      </div>

      <div className="cm-toolbar">
        <div className="cm-search">
          <i className="fa-solid fa-magnifying-glass"></i>
          <input placeholder="Buscar comercio…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="select" style={{ maxWidth: 240 }} value={rubroSel} onChange={(e) => setRubroSel(e.target.value)}>
          <option value="">Todos los rubros</option>
          {rubros.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <div style={{ flex: 1 }}></div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => setAllQuotes(true)}><i className="fa-solid fa-tags"></i> Todas las cotizaciones</button>
        {!narrow && (
          <div className="view-toggle">
            <button type="button" className={view === 'matrix' ? 'active' : ''} onClick={() => setVw('matrix')}><i className="fa-solid fa-table-cells"></i> Matriz</button>
            <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setVw('list')}><i className="fa-solid fa-list"></i> Lista</button>
          </div>
        )}
      </div>
      <p className="cm-intro">Tildá los rubros que vende cada comercio: solo le van a llegar pedidos de esas categorías. Si no tildás ninguno, recibe de todas.</p>

      {useMatrix ? renderMatrix() : renderList()}

      <div className={`savebar ${dirty.length ? 'show' : ''}`}>
        <div className="sb-txt">
          <i className="fa-solid fa-circle-dot"></i>
          <span>{dirty.length === 1 ? '1 comercio con cambios' : `${dirty.length} comercios con cambios`}</span>
          <small>— se aplican al guardar</small>
        </div>
        <button className="btn btn-ghost btn-sm" type="button" onClick={discard} disabled={saving}>Descartar</button>
        <button className="btn btn-yellow btn-sm" type="button" onClick={saveAll} disabled={saving || dirty.length === 0}>
          {saving ? <span className="spinner" style={{ width: 14, height: 14 }}></span> : <><i className="fa-solid fa-floppy-disk"></i> Guardar todo</>}
        </button>
      </div>

      {quotesStore && <StoreQuotesModal store={quotesStore} onClose={() => setQuotesStore(null)} />}
      {allQuotes && <AllQuotesModal onClose={() => setAllQuotes(false)} />}
      {drawerStore && <StoreDrawer store={drawerStore} onClose={() => setDrawerStore(null)} />}
    </>
  );
}

const QUOTE_ST = { SENT: ['badge-purple', 'Enviada'], SELECTED: ['badge-green', 'Elegida'], REJECTED: ['badge-gray', 'No elegida'] };

// Una fila de cotización (compartida entre el modal por-comercio y el de "Todas las cotizaciones").
function QuoteRow({ q, showStore }) {
  const [cls, txt] = QUOTE_ST[q.status] || ['badge-gray', q.status];
  return (
    <div className="card mb-8" style={{ background: 'var(--bg-1)' }}>
      <div className="flex-between mb-4"><div className="text-sm" style={{ fontWeight: 700 }}>{q.label}</div><span className="price">{money(q.price)}</span></div>
      <div className="text-xs muted">{showStore && q.storeName ? <><i className="fa-solid fa-store"></i> {q.storeName} · </> : ''}#{q.reqCode} · {q.vehicle || 'Vehículo'}{q.plate ? ` · ${q.plate}` : ''}{q.partBrand ? ` · ${q.partBrand}` : ''}</div>
      <div className="flex-between mt-8" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="flex-center gap-8"><span className={`badge ${cls}`}>{txt}</span>{q.sold && <span className="badge badge-green"><i className="fa-solid fa-circle-check"></i> Concretada</span>}</span>
        <span className="text-xs muted rat-th-date">{fmtDateTime(q.createdAt)}</span>
      </div>
    </div>
  );
}

// Cáscara de modal con la lista de cotizaciones (carga async + estados vacío/cargando).
function QuotesModal({ title, load, deps, empty, showStore, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { load().then((r) => setRows(r || [])).catch(() => setRows([])); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-handle"></div>
        <div className="flex-between mb-4"><h2 className="h-md">{title}</h2><button className="icon-btn" type="button" onClick={onClose} title="Cerrar"><i className="fa-solid fa-xmark"></i></button></div>
        {rows === null ? <Loading label="Cargando cotizaciones…" />
          : rows.length === 0 ? <div className="empty-state" style={{ padding: 28 }}><div className="empty-icon"><i className="fa-solid fa-tags"></i></div>{empty}</div>
          : (<>
            <p className="text-sm muted mb-12">{rows.length} cotización{rows.length === 1 ? '' : 'es'} · {rows.filter((r) => r.sold).length} concretada(s)</p>
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {rows.map((q) => <QuoteRow key={q.id} q={q} showStore={showStore} />)}
            </div>
          </>)}
      </div>
    </div>
  );
}

// Cotizaciones de UN comercio.
function StoreQuotesModal({ store, onClose }) {
  return <QuotesModal title={`Cotizaciones de ${store.name}`} load={() => getStoreQuotes(store.id)} deps={[store.id]} empty="Este comercio todavía no cotizó nada." onClose={onClose} />;
}

// Cotizaciones de TODOS los comercios.
function AllQuotesModal({ onClose }) {
  return <QuotesModal title="Todas las cotizaciones" load={getRecentQuotes} deps={[]} empty="Todavía no hay cotizaciones." showStore onClose={onClose} />;
}

const IVA_LABEL = { RESPONSABLE_INSCRIPTO: 'Responsable Inscripto', MONOTRIBUTO: 'Monotributo', EXENTO: 'Exento', CONSUMIDOR_FINAL: 'Consumidor Final' };
const STATUS_LABEL = { ACTIVE: 'Activo', PENDING: 'Pendiente de alta', SUSPENDED: 'Suspendido' };

// Ficha consolidada de un comercio (drawer lateral): datos, rubros, cotizaciones, métricas y CC.
function StoreDrawer({ store, onClose }) {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('datos');
  const [quotes, setQuotes] = useState(null);
  useEffect(() => { getStoreDetail(store.id).then((r) => setD(r)).catch(() => setD(null)); }, [store.id]);
  useEffect(() => { if (tab === 'cotizaciones' && quotes === null) getStoreQuotes(store.id).then((r) => setQuotes(r || [])).catch(() => setQuotes([])); }, [tab, store.id, quotes]);
  const TABS = [['datos', 'Datos'], ['rubros', 'Rubros'], ['cotizaciones', 'Cotizaciones'], ['metricas', 'Métricas'], ['cc', 'Cta corriente']];
  const Row = ({ k, v }) => <div className="d-row"><span className="dk">{k}</span><span className="dv">{v}</span></div>;
  return (
    <>
      <div className="drawer-back" onClick={onClose}></div>
      <aside className="drawer">
        <div className="dr-head">
          <div className="dr-top">
            <div className="dr-av"><i className="fa-solid fa-store"></i></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="dr-name">{store.name}</div>
              <div className="dr-meta">{[d?.owner, d?.barrio].filter(Boolean).join(' · ') || 'Comercio'}</div>
            </div>
            <button className="dr-close" type="button" onClick={onClose} title="Cerrar"><i className="fa-solid fa-xmark"></i></button>
          </div>
          <div className="dr-tabs">{TABS.map(([k, l]) => <button key={k} type="button" className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        </div>
        <div className="dr-body">
          {!d ? <Loading label="Cargando ficha…" /> : (<>
            {tab === 'datos' && (<>
              <Row k="Titular" v={d.owner || '—'} />
              <Row k="Email" v={d.email || '—'} />
              <Row k="Dirección" v={d.address ? `${d.address}${d.barrio ? ' · ' + d.barrio : ''}` : '—'} />
              <Row k="CUIT" v={d.cuit || '—'} />
              <Row k="Condición IVA" v={IVA_LABEL[d.iva] || d.iva || '—'} />
              <Row k="Estado" v={STATUS_LABEL[d.status] || d.status || '—'} />
              <Row k="Mercado Pago" v={d.mpLinked ? 'Conectado' : 'Sin conectar'} />
              <Row k="Reputación" v={d.rating != null ? `★ ${d.rating} (${d.ratingsCount}) · ${d.points} pts` : `Sin reseñas · ${d.points} pts`} />
              <Row k="Alta" v={d.createdAt ? fmtDateTime(d.createdAt) : '—'} />
              <Row k="Último ingreso" v={d.lastLoginAt ? fmtDateTime(d.lastLoginAt) : 'Nunca'} />
            </>)}
            {tab === 'rubros' && (d.rubros.length === 0
              ? <div className="empty-mini">Recibe pedidos de <b>todos los rubros</b>.</div>
              : <div className="flex" style={{ flexWrap: 'wrap', gap: 8 }}>{d.rubros.map((r, i) => <span key={i} className="chip">{r}</span>)}</div>)}
            {tab === 'metricas' && (<>
              <div className="mini-kpi-row">
                <div className="mini-kpi"><div className="v">{d.metrics.cotizo}</div><div className="l">Cotizó</div></div>
                <div className="mini-kpi"><div className="v text-green">{d.metrics.concreto}</div><div className="l">Concretó</div></div>
                <div className="mini-kpi"><div className="v">{Math.round(d.metrics.conv * 100)}%</div><div className="l">Conversión</div></div>
              </div>
              <Row k="Vendido (total)" v={<span className="text-green">{money(d.metrics.vendido)}</span>} />
              <Row k="Comisión generada" v={<span className="text-yellow">{money(d.metrics.comision)}</span>} />
              <Row k="Descartó (sin stock)" v={d.metrics.descarto} />
            </>)}
            {tab === 'cc' && (d.cc.length === 0
              ? <div className="empty-mini">Sin relaciones de cuenta corriente.</div>
              : d.cc.map((c, i) => <Row key={i} k={c.mechanic} v={c.active ? <span className="badge badge-green">Activa</span> : <span className="badge badge-gray">{c.adminStatus === 'PENDING' ? 'Pendiente' : 'Inactiva'}</span>} />))}
            {tab === 'cotizaciones' && (quotes === null ? <Loading label="Cargando cotizaciones…" />
              : quotes.length === 0 ? <div className="empty-mini">Todavía no cotizó nada.</div>
              : (<><p className="text-sm muted mb-12">{quotes.length} cotización{quotes.length === 1 ? '' : 'es'} · {quotes.filter((q) => q.sold).length} concretada(s)</p>{quotes.map((q) => <QuoteRow key={q.id} q={q} />)}</>))}
          </>)}
        </div>
      </aside>
    </>
  );
}

export default StoreCategories;
