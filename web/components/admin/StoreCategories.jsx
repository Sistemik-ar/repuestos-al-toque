import { useState, useEffect } from 'react';
import { money, toast, fmtDateTime } from '@/lib/ui';
import Loading from '@/components/Loading';
import { setStoreCategories, getStoreQuotes } from '@/app/actions/data';
import { pageButtons, Pager } from './table';

function StoreCategories({ stores, categories, onSaved }) {
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [quotesStore, setQuotesStore] = useState(null); // comercio cuyas cotizaciones se ven en el modal
  if (!stores || !categories || stores.length === 0) return null;

  const q = query.trim().toLowerCase();
  let list = stores;
  if (q) list = list.filter((s) => (s.name || '').toLowerCase().includes(q));
  if (catFilter) list = list.filter((s) => (s.categoryIds || []).includes(Number(catFilter)));
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const cur = Math.min(page, pages);
  const start = (cur - 1) * perPage;
  const visible = list.slice(start, start + perPage);
  const pager = {
    info: total === 0 ? '0 comercios' : `${start + 1}–${Math.min(start + perPage, total)} de ${total}`,
    page: cur, buttons: pageButtons(cur, pages), perPage, setPerPage: (n) => { setPerPage(n); setPage(1); },
    prev: () => setPage((p) => Math.max(1, p - 1)), next: () => setPage((p) => Math.min(pages, p + 1)), go: setPage,
    prevDisabled: cur <= 1, nextDisabled: cur >= pages,
  };

  return (
    <div className="card mb-16">
      <div className="section-title"><h2>Categorías por comercio</h2><span className="text-xs muted">qué rubros cotiza cada uno</span></div>
      <p className="text-sm muted mb-12">Tildá los rubros que vende cada comercio: solo le van a llegar pedidos de esas categorías. Si no tildás ninguno, recibe de todas.</p>
      <div className="flex gap-12 mb-16" style={{ flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200, maxWidth: 340 }}>
          <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)', fontSize: 13, pointerEvents: 'none' }}></i>
          <input className="input" style={{ paddingLeft: 38 }} placeholder="Buscar comercio…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          {query && <button type="button" onClick={() => { setQuery(''); setPage(1); }} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}><i className="fa-solid fa-xmark"></i></button>}
        </div>
        <select className="select" style={{ flex: '0 1 260px', minWidth: 200 }} value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setPage(1); }}>
          <option value="">Todos los rubros</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {total === 0
        ? <div className="empty-state" style={{ padding: '32px 20px' }}><div className="empty-icon"><i className="fa-solid fa-store-slash"></i></div>No hay comercios que coincidan con el filtro.</div>
        : <div className="rat-store-grid">{visible.map((st) => <StoreCatCard key={st.id} store={st} categories={categories} onSaved={onSaved} onQuotes={() => setQuotesStore(st)} />)}</div>}
      <Pager pager={pager} />
      {quotesStore && <StoreQuotesModal store={quotesStore} onClose={() => setQuotesStore(null)} />}
    </div>
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

function StoreCatCard({ store, categories, onSaved, onQuotes }) {
  const [sel, setSel] = useState(() => new Set(store.categoryIds || []));
  const [saving, setSaving] = useState(false);
  // si el comercio cambió por recarga, re-sincronizar la selección
  useEffect(() => { setSel(new Set(store.categoryIds || [])); }, [store.categoryIds]);
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const countLabel = sel.size === 0 ? 'Recibe de todos los rubros' : `${sel.size} rubro${sel.size === 1 ? '' : 's'}`;
  async function save() {
    setSaving(true);
    const r = await setStoreCategories(store.id, [...sel]);
    setSaving(false);
    if (r?.error) { toast({ title: r.error, type: 'yellow', icon: 'fa-triangle-exclamation' }); return; }
    toast({ title: 'Rubros guardados', sub: store.name, icon: 'fa-check', type: 'green' });
    onSaved?.();
  }
  return (
    <div className="rat-store-card">
      <div className="flex-between mb-12" style={{ gap: 12 }}>
        <div className="flex-center gap-12" style={{ minWidth: 0 }}>
          <div className="store-avatar"><i className="fa-solid fa-store"></i></div>
          <div style={{ minWidth: 0 }}>
            <div className="text-sm" style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{store.name}</div>
            <div className="text-xs muted" style={{ marginTop: 2 }}>{countLabel}</div>
          </div>
        </div>
        <button className="btn btn-yellow btn-sm" disabled={saving} onClick={save} style={{ flexShrink: 0 }}>{saving ? <span className="spinner" style={{ width: 14, height: 14 }}></span> : <><i className="fa-solid fa-floppy-disk"></i> Guardar</>}</button>
      </div>
      <div className="flex" style={{ flexWrap: 'wrap', gap: 8 }}>
        {categories.map((c) => {
          const on = sel.has(c.id);
          return (
            <button key={c.id} type="button" className="chip" onClick={() => toggle(c.id)} style={on ? { background: 'var(--purple)', color: '#fff', borderColor: 'var(--purple)' } : {}}>
              {on && <i className="fa-solid fa-check" style={{ fontSize: 10 }}></i>} {c.name}
            </button>
          );
        })}
      </div>
      <button className="btn btn-ghost btn-sm mt-12" type="button" onClick={() => onQuotes?.()}><i className="fa-solid fa-tags"></i> Ver cotizaciones</button>
    </div>
  );
}

export default StoreCategories;
