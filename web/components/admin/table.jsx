'use client';
// Toolkit de tablas del admin (headless): un hook useTable que maneja búsqueda + orden +
// paginación client-side, y subcomponentes presentacionales (Search, SortBar, Thead, Pager).
// Lo comparten todas las tablas del backoffice (Usuarios, Pedidos, Cuenta corriente, Estadísticas).
import { useState, useMemo } from 'react';

function applySort(arr, sort, typeByKey) {
  if (!sort || !sort.key) return arr;
  const t = typeByKey[sort.key] || 'str';
  const dir = sort.dir === 'desc' ? -1 : 1;
  return [...arr].sort((a, b) => {
    let x = a[sort.key], y = b[sort.key];
    if (t === 'num') { const an = x == null, bn = y == null; if (an && bn) return 0; if (an) return 1; if (bn) return -1; return (x - y) * dir; }
    x = String(x == null ? '' : x).toLowerCase(); y = String(y == null ? '' : y).toLowerCase();
    return x < y ? -dir : x > y ? dir : 0;
  });
}

// modelo de botones de paginado: 1 … (p-1) p (p+1) … N
export function pageButtons(page, pages) {
  const out = [];
  if (pages <= 7) { for (let i = 1; i <= pages; i++) out.push({ n: i }); return out; }
  out.push({ n: 1 });
  const lo = Math.max(2, page - 1), hi = Math.min(pages - 1, page + 1);
  if (lo > 2) out.push({ ell: true });
  for (let i = lo; i <= hi; i++) out.push({ n: i });
  if (hi < pages - 1) out.push({ ell: true });
  out.push({ n: pages });
  return out;
}

export function useTable(rows, cols, searchKeys, initialSort) {
  const [query, setQ] = useState('');
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(1);
  const [perPage, setPP] = useState(10);
  const typeByKey = useMemo(() => { const m = {}; cols.forEach((c) => { if (c.key) m[c.key] = c.type || 'str'; }); return m; }, [cols]);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => (!q ? rows : rows.filter((r) => searchKeys.some((k) => String(r[k] == null ? '' : r[k]).toLowerCase().includes(q)))), [rows, q, searchKeys]);
  const sorted = useMemo(() => applySort(filtered, sort, typeByKey), [filtered, sort, typeByKey]);
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const cur = Math.min(page, pages);
  const start = (cur - 1) * perPage;
  const visible = sorted.slice(start, start + perPage);

  const setSortKey = (key) => { setPage(1); setSort((s) => { const t = typeByKey[key]; const dir = s.key === key ? (s.dir === 'asc' ? 'desc' : 'asc') : (t === 'num' ? 'desc' : 'asc'); return { key, dir }; }); };
  const headers = cols.map((c) => {
    const sortable = !!c.key, active = sortable && sort.key === c.key;
    const ind = !sortable ? '' : active ? (sort.dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort';
    return { label: c.label, sortable, ind, thClass: (c.date ? 'rat-th-date ' : '') + (sortable ? 'rat-th-sort' : '') + (active ? ' rat-th-active' : ''), onSort: sortable ? () => setSortKey(c.key) : undefined };
  });
  const sortUI = {
    key: sort.key, options: cols.filter((c) => c.key).map((c) => ({ value: c.key, label: c.label })),
    dirIcon: sort.dir === 'asc' ? 'fa-arrow-up-wide-short' : 'fa-arrow-down-wide-short',
    setKey: (e) => { const key = e.target.value; setPage(1); setSort({ key, dir: typeByKey[key] === 'num' ? 'desc' : 'asc' }); },
    toggleDir: () => { setPage(1); setSort((s) => ({ key: s.key, dir: s.dir === 'asc' ? 'desc' : 'asc' })); },
  };
  const pager = {
    info: total === 0 ? '0 resultados' : `${start + 1}–${Math.min(start + perPage, total)} de ${total}`,
    page: cur, buttons: pageButtons(cur, pages), perPage, setPerPage: (n) => { setPP(n); setPage(1); },
    prev: () => setPage((p) => Math.max(1, p - 1)), next: () => setPage((p) => Math.min(pages, p + 1)), go: setPage,
    prevDisabled: cur <= 1, nextDisabled: cur >= pages,
  };
  return { query, setQuery: (v) => { setQ(v); setPage(1); }, visible, headers, sortUI, pager, total };
}

export function Search({ value, onChange, placeholder }) {
  return (
    <div style={{ position: 'relative', maxWidth: 360, marginBottom: 12 }}>
      <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)', fontSize: 13, pointerEvents: 'none' }}></i>
      <input className="input" style={{ paddingLeft: 38 }} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {value && <button type="button" onClick={() => onChange('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}><i className="fa-solid fa-xmark"></i></button>}
    </div>
  );
}

export function SortBar({ sortUI }) {
  return (
    <div className="rat-sortbar">
      <span className="text-xs muted" style={{ textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, flexShrink: 0 }}>Ordenar</span>
      <select className="select" style={{ flex: 1, padding: '9px 30px 9px 12px', fontSize: 13 }} value={sortUI.key} onChange={sortUI.setKey}>
        {sortUI.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button className="btn btn-ghost btn-sm rat-pgbtn" type="button" onClick={sortUI.toggleDir} title="Invertir orden"><i className={`fa-solid ${sortUI.dirIcon}`}></i></button>
    </div>
  );
}

export function Thead({ headers }) {
  return <thead><tr>{headers.map((h, i) => (
    <th key={i} className={h.thClass} onClick={h.onSort}>{h.label}{h.sortable && <i className={`fa-solid ${h.ind}`} style={{ marginLeft: 6, fontSize: 10, opacity: 0.6 }}></i>}</th>
  ))}</tr></thead>;
}

export function Pager({ pager }) {
  return (
    <div className="flex-between" style={{ marginTop: 14, flexWrap: 'wrap', gap: 12 }}>
      <div className="flex gap-8" style={{ alignItems: 'center' }}>
        <span className="text-xs muted">{pager.info}</span>
        <select className="select" style={{ padding: '6px 24px 6px 9px', fontSize: 12, width: 'auto' }} value={pager.perPage} onChange={(e) => pager.setPerPage(Number(e.target.value))} title="Filas por página">
          <option value={5}>5</option><option value={10}>10</option><option value={25}>25</option>
        </select>
      </div>
      <div className="flex gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm rat-pgbtn" type="button" onClick={pager.prev} disabled={pager.prevDisabled}><i className="fa-solid fa-chevron-left"></i></button>
        {pager.buttons.map((p, i) => p.ell
          ? <span key={i} className="muted" style={{ padding: '0 4px' }}>…</span>
          : <button key={i} type="button" className={`btn btn-sm rat-pgbtn ${p.n === pager.page ? 'btn-primary' : 'btn-ghost'}`} onClick={() => pager.go(p.n)}>{p.n}</button>)}
        <button className="btn btn-ghost btn-sm rat-pgbtn" type="button" onClick={pager.next} disabled={pager.nextDisabled}><i className="fa-solid fa-chevron-right"></i></button>
      </div>
    </div>
  );
}
