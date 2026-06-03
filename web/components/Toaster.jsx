'use client';
import { useEffect, useState } from 'react';

export default function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    function onToast(e) {
      const id = Math.random().toString(36).slice(2);
      const t = { id, ...e.detail };
      setItems((x) => [...x, t]);
      const dur = t.duration || 3800;
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), dur);
    }
    window.addEventListener('rat-toast', onToast);
    return () => window.removeEventListener('rat-toast', onToast);
  }, []);

  return (
    <div className="toast-container">
      {items.map((t) => (
        <div className="toast" key={t.id}>
          <div className={`toast-icon ${t.type || 'purple'}`}>
            <i className={`fa-solid ${t.icon || 'fa-bell'}`}></i>
          </div>
          <div style={{ flex: 1 }}>
            <div className="toast-title">{t.title}</div>
            {t.sub && <div className="toast-sub">{t.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
