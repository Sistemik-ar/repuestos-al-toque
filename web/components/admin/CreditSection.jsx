import { fmtDateTime, toast } from '@/lib/ui';
import { adminActOnCredit, disableCreditAccount } from '@/app/actions/data';
import { useTable, Search, SortBar, Thead, Pager } from './table';

const CC_COLS = [
  { label: 'Mecánico', key: 'mechanicName', type: 'str' },
  { label: 'Comercio', key: 'storeName', type: 'str' },
  { label: 'Solicitada', key: 'createdAt', type: 'num', date: true },
  { label: 'Aprob. admin', key: 'adminStatus', type: 'str' },
  { label: 'Aprob. comercio', key: 'storeStatus', type: 'str' },
  { label: 'Estado', key: 'status', type: 'str' },
  { label: '', key: null },
];

const CC_SEARCH = ['mechanicName', 'storeName'];

const CC_BADGE = { PENDING: ['badge-yellow', 'Pendiente'], APPROVED: ['badge-green', 'Aprobado'], REJECTED: ['badge-red', 'Rechazado'] };

const CC_STATE = { PENDING: ['badge-yellow', 'Pendiente'], ACTIVE: ['badge-green', 'Activa'], REJECTED: ['badge-red', 'Rechazada'], DISABLED: ['badge-gray', 'Desactivada'] };

function CreditSection({ rows, onReload }) {
  const t = useTable(rows || [], CC_COLS, CC_SEARCH, { key: 'createdAt', dir: 'desc' });
  async function approve(r) { await adminActOnCredit(r.id, true, null); toast({ title: 'Vinculación validada', icon: 'fa-check', type: 'green' }); onReload?.(); }
  async function reject(r) { const note = window.prompt('Observación interna (opcional):') || null; await adminActOnCredit(r.id, false, note); toast({ title: 'Rechazada', icon: 'fa-ban', type: 'purple' }); onReload?.(); }
  async function disable(r) { await disableCreditAccount(r.id); toast({ title: 'Relación desactivada', icon: 'fa-ban', type: 'purple' }); onReload?.(); }

  return (
    <div className="card mb-16">
      <div className="section-title"><h2>Solicitudes de Cuenta Corriente</h2><span className="text-xs muted">{t.total}</span></div>
      <Search value={t.query} onChange={t.setQuery} placeholder="Buscar por mecánico o comercio…" />
      <SortBar sortUI={t.sortUI} />
      <div style={{ overflowX: 'auto' }}>
        <table className="table rat-table">
          <Thead headers={t.headers} />
          <tbody>
            {t.total === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 20 }}>Sin solicitudes</td></tr>}
            {t.visible.map((r) => {
              const st = CC_STATE[r.status] || ['badge-gray', r.status];
              const a = CC_BADGE[r.adminStatus] || ['badge-gray', r.adminStatus];
              const sc = CC_BADGE[r.storeStatus] || ['badge-gray', r.storeStatus];
              return (
                <tr key={r.id}>
                  <td data-label="Mecánico">{r.mechanicName}</td>
                  <td data-label="Comercio">{r.storeName}</td>
                  <td data-label="Solicitada" className="text-xs muted rat-th-date">{fmtDateTime(r.createdAt)}</td>
                  <td data-label="Aprob. admin"><span className={`badge ${a[0]}`}>{a[1]}</span></td>
                  <td data-label="Aprob. comercio"><span className={`badge ${sc[0]}`}>{sc[1]}</span></td>
                  <td data-label="Estado"><span className={`badge ${st[0]}`}>{st[1]}</span>{r.adminNote && <div className="text-xs muted mt-4" title={r.adminNote}><i className="fa-solid fa-note-sticky"></i> nota</div>}</td>
                  <td className="rat-actions">
                    <div className="flex gap-8">
                      {r.adminStatus === 'PENDING' && <><button className="btn btn-success btn-sm" onClick={() => approve(r)}>Validar</button><button className="btn btn-ghost btn-sm" onClick={() => reject(r)}>Rechazar</button></>}
                      {r.status === 'ACTIVE' && <button className="btn btn-danger btn-sm" onClick={() => disable(r)}>Desactivar</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager pager={t.pager} />
    </div>
  );
}

export default CreditSection;
