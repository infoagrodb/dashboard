/* Fórmulas de INFOAGRO para Recuentos de Arranque y Combina.
   Deducidas de los campos calculados de Odoo y verificadas contra registros reales
   (Division Agricola Comasa y Grupo ZP, ciclo Maní 2025).
   Odoo SIEMPRE recalcula al recibir los datos; esto es solo la vista previa en el teléfono. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RAC = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // Factor qq/mzn por cada unidad contada en 1 metro lineal (arranque): 0.7682 / 3
  const K_ARR = 0.7682 / 3;
  // Factor qq/mzn por cápsula sana por metro (combina)
  const K_COM = 0.2561;
  // Odoo calcula "Cap. vanas en 2 mtrs" = cápsulas SANAS × este factor (38.41 / 141).
  // OJO: no usa las vanas ni los metros. Se replica tal cual para que la app coincida con Odoo.
  const K_VANAS2M = 38.41 / 141;

  const n = (v) => { const x = parseFloat(v); return isFinite(x) ? x : 0; };

  function arranqueLinea(l) {
    const perdida = n(l.mohono) + n(l.germinadas) + n(l.podridas);
    return {
      plantas_con_moho: n(l.moho_m) * K_ARR,                 // x_studio_plantas_con_moho
      qq_sin_arrancar: perdida * K_ARR,                      // x_studio_qq_x_mzn_sin_arrancar
      qq_mzn: (n(l.dano_arrancador) + perdida) * K_ARR,      // x_studio_qqxmzn
    };
  }

  function combinaLinea(l) {
    const m = n(l.metros);
    const sanasXm = m > 0 ? n(l.sanas) / m : 0;              // x_studio_capsulas_sanas_x_metro
    return {
      sanas_x_metro: sanasXm,
      qq_mzn: sanasXm * K_COM,                               // x_studio_quintales_por_manzana (pérdida)
      vanas_2m: n(l.sanas) * K_VANAS2M,                      // x_studio_capsulas_vanas_en_dos_metros
    };
  }

  const prom = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  // Resumen del reporte: promedios generales y por lote
  function resumen(tipo, lines) {
    const calc = tipo === 'arranque' ? arranqueLinea : combinaLinea;
    const campos = tipo === 'arranque'
      ? ['plantas_m', 'moho_m', 'dano_arrancador', 'podridas', 'mohono', 'germinadas']
      : ['metros', 'sanas', 'vanas'];
    const filas = lines.map((l) => ({ l, c: calc(l) }));
    const agrupa = (items) => {
      const out = { muestras: items.length };
      campos.forEach((k) => { out[k] = prom(items.map((x) => n(x.l[k]))); });
      Object.keys(items.length ? items[0].c : calc({})).forEach((k) => { out[k] = prom(items.map((x) => x.c[k])); });
      return out;
    };
    const porLote = {};
    filas.forEach((f) => { (porLote[f.l.lote_nombre || f.l.lote || '—'] = porLote[f.l.lote_nombre || f.l.lote || '—'] || []).push(f); });
    return {
      general: agrupa(filas),
      lotes: Object.keys(porLote).map((k) => ({ lote: k, ...agrupa(porLote[k]) })),
    };
  }

  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  // Formato de fecha estándar de la empresa: 01-Ene-2026
  function fmtFecha(iso) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? `${m[3]}-${MESES[parseInt(m[2], 10) - 1]}-${m[1]}` : iso;
  }
  const fmt = (v, d = 2) => (isFinite(v) ? Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '0.00');

  return { K_ARR, K_COM, K_VANAS2M, arranqueLinea, combinaLinea, resumen, fmtFecha, fmt, n };
});
