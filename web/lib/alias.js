// Alias anónimo del vendedor: NO depende de la identidad del comercio (eso colisionaba y, al ser
// estable, dejaba que el mecánico aprendiera el mapeo). Se numera por orden de llegada DENTRO del
// trabajo: "Proveedor A/B/C". Único por pantalla de comparación, consistente dentro del trabajo y
// ROTATIVO entre trabajos (el mismo comercio no es siempre "A").
export function aliasLabel(i) {
  const letter = String.fromCharCode(65 + (i % 26));
  const n = Math.floor(i / 26);
  return 'Proveedor ' + letter + (n ? n : '');
}
