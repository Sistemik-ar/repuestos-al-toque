import { useState, useEffect } from 'react';
import { toast } from '@/lib/ui';
import { setStoreCategories } from '@/app/actions/data';
import { pageButtons, Pager } from './table';

function StoreCategories({ stores, categories, onSaved }) {
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
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
        : <div className="rat-store-grid">{visible.map((st) => <StoreCatCard key={st.id} store={st} categories={categories} onSaved={onSaved} />)}</div>}
      <Pager pager={pager} />
    </div>
  );
}

function StoreCatCard({ store, categories, onSaved }) {
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
    </div>
  );
}

export default StoreCategories;
