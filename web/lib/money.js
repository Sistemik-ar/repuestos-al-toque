// Parsing robusto de precios ingresados a mano (formato argentino y variantes).
// "45000" -> 45000 · "45.000" -> 45000 · "45.000,50" -> 45001 · "1500.50" -> 1501 · "$ 45.000" -> 45000
export function parsePrice(v) {
  let s = String(v ?? '').trim().replace(/[$\s]/g, '');
  if (!s) return 0;
  if (/,\d{1,2}$/.test(s)) {
    // coma decimal (formato AR): los puntos son miles
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/\.\d{1,2}$/.test(s) && !/\.\d{3}$/.test(s)) {
    // punto decimal (formato US): las comas son miles
    s = s.replace(/,/g, '');
  } else {
    // sin decimales: todo separador es de miles
    s = s.replace(/[.,]/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}
