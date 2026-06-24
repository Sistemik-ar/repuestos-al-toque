import { useState, useEffect } from 'react';
import { money, toast, fmtDateTime } from '@/lib/ui';
import Loading from '@/components/Loading';
import { setStoreCategories, getStoreQuotes } from '@/app/actions/data';

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

  // (re)sincronizar con los datos: al montar y tras guardar (onSaved recarga stores).
  useEffect(() => {
    setWork((stores || []).map((s) => ({ id: s.id, name: s.name, sel: [...(s.categoryIds || [])] })));
    setBaseline(new Map((stores || []).map((s) => [s.id, norm(s.categoryIds || [])])));
  }, [stores]);

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
                  <div className="corner-sub">tildá los rubros que vende →</div>
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
                        <div className="cm-meta">
                          <div className="nm">{c.name}</div>
                          <div className="ct">{c.sel.length === 0 ? <span className="badge-all">Recibe de todo</span> : `${c.sel.length} rubro${c.sel.length === 1 ? '' : 's'}`}</div>
                        </div>
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
                    {c.sel.length === 0 ? <span className="badge-all">Recibe de todo</span> : <>{c.sel.length} rubro{c.sel.length === 1 ? '' : 's'}</>}
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
                          <span className="chk"><i className={`fa-solid ${on ? 'fa-check' : catIcon(r)}`}></i></span>{r.name}
                        </button>
                      );
                    })}
                  </div>
                  <div className="acc-quick">
                    <button type="button" className="lnk" onClick={() => setRow(c.id, true)}>Marcar todos</button>
                    <span className="sep">·</span>
                    <button type="button" className="lnk" onClick={() => setRow(c.id, false)}>Limpiar</button>
                    <span className="spacer"></span>
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
          <div className="cv-sub">{thinAlert ? `${thin.map((r) => r.name).join(', ')} · 1 comercio o menos` : 'todos los rubros cubiertos'}</div>
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
    </>
  );
}

// Modal admin: lista las cotizaciones que hizo un comercio (pedido, precio, estado, si concretó).
function StoreQuotesModal({ store, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { getStoreQuotes(store.id).then((r) => setRows(r || [])).catch(() => setRows([])); }, [store.id]);
  const ST = { SENT: ['badge-purple', 'Enviada'], SELECTED: ['badge-green', 'Elegida'], REJECTED: ['badge-gray', 'No elegida'] };
  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-handle"></div>
        <div className="flex-between mb-4"><h2 className="h-md">Cotizaciones de {store.name}</h2><button className="icon-btn" type="button" onClick={onClose} title="Cerrar"><i className="fa-solid fa-xmark"></i></button></div>
        {rows === null ? <Loading label="Cargando cotizaciones…" />
          : rows.length === 0 ? <div className="empty-state" style={{ padding: 28 }}><div className="empty-icon"><i className="fa-solid fa-tags"></i></div>Este comercio todavía no cotizó nada.</div>
          : (<>
            <p className="text-sm muted mb-12">{rows.length} cotización{rows.length === 1 ? '' : 'es'} · {rows.filter((r) => r.sold).length} concretada(s)</p>
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {rows.map((r) => {
                const [cls, txt] = ST[r.status] || ['badge-gray', r.status];
                return (
                  <div key={r.id} className="card mb-8" style={{ background: 'var(--bg-1)' }}>
                    <div className="flex-between mb-4"><div className="text-sm" style={{ fontWeight: 700 }}>{r.label}</div><span className="price">{money(r.price)}</span></div>
                    <div className="text-xs muted">#{r.reqCode} · {r.vehicle || 'Vehículo'}{r.plate ? ` · ${r.plate}` : ''}{r.partBrand ? ` · ${r.partBrand}` : ''}</div>
                    <div className="flex-between mt-8" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <span className="flex-center gap-8"><span className={`badge ${cls}`}>{txt}</span>{r.sold && <span className="badge badge-green"><i className="fa-solid fa-circle-check"></i> Concretada</span>}</span>
                      <span className="text-xs muted rat-th-date">{fmtDateTime(r.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>)}
      </div>
    </div>
  );
}

export default StoreCategories;
