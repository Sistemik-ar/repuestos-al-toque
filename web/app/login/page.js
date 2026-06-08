'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ROLE_HOME, TEST_ACCOUNTS } from '@/lib/auth';
import { loginAction } from '@/app/actions/auth';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e?.preventDefault();
    setError('');
    setLoading(true);
    const res = await loginAction(email, pass);
    setLoading(false);
    if (res?.error) { setError(res.error); return; }
    router.push(ROLE_HOME[res.role] || '/');
  }

  return (
    <div className="app-shell">
      <div className="container" style={{ paddingTop: 36 }}>
        <Link href="/" className="flex-center mb-24" style={{ gap: 10 }}>
          <span className="logo-mark" style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(135deg,var(--purple),var(--purple-light))', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-glow)' }}>
            <i className="fa-solid fa-gear" style={{ color: 'white' }}></i>
          </span>
          <span style={{ fontWeight: 800, fontSize: 18 }}>RepuestosAlToque</span>
        </Link>

        <h1 className="h-lg mb-4">Ingresar</h1>
        <p className="text-sm muted mb-24">Entrás directo a tu panel según tu rol.</p>

        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" autoComplete="email" placeholder="tucuenta@email.com" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} />
          </div>
          <div className="field">
            <label>Contraseña</label>
            <input className="input" type="password" autoComplete="current-password" placeholder="••••••••" value={pass} onChange={(e) => setPass(e.target.value)} />
          </div>
          {error && <div className="text-sm text-red mb-12"><i className="fa-solid fa-circle-exclamation"></i> {error}</div>}
          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading}>
            {loading ? <span className="spinner"></span> : <><i className="fa-solid fa-right-to-bracket"></i> Ingresar</>}
          </button>
        </form>

        <div className="float-notif mt-24">
          <i className="fa-solid fa-flask text-purple"></i>
          <div className="text-sm subtle">
            <b>Cuentas de prueba</b> (contraseña: <code>repuestos123</code>):
            <div className="text-xs muted mt-8" style={{ lineHeight: 1.7 }}>
              {TEST_ACCOUNTS.map(([mail, label]) => (
                <div key={mail}>
                  <button type="button" className="text-purple" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700 }} onClick={() => { setEmail(mail); setPass('repuestos123'); }}>{mail}</button> · {label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-sm muted mt-24">
          ¿Solo querés ver el producto? <Link href="/demo/" className="text-purple" style={{ fontWeight: 700 }}>Recorré la demo →</Link>
        </p>
      </div>
    </div>
  );
}
