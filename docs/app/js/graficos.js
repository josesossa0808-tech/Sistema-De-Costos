/* Gráficos SVG livianos y sin dependencias (el sistema funciona sin internet). */
const Graficos = (() => {
  const COLORES = { estandar: "#8fa7c4", real: "#1f3a5f", fav: "#1f7a4d", desf: "#b3372f" };
  const esc = (t) => UI.esc(t);
  const corto = (v) => {
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(1) + " MM";
    if (a >= 1e6) return (v / 1e6).toFixed(1) + " M";
    if (a >= 1e3) return (v / 1e3).toFixed(0) + " K";
    return Math.round(v).toString();
  };
  function escala(max) {
    if (max <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    const n = max / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }
  function leyenda(series) {
    return `<div class="leyenda">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.nombre)}</span>`).join("")}</div>`;
  }

  /* Barras verticales agrupadas: categorías x series. */
  function barras(cont, { categorias, series }) {
    const W = 560, H = 260, mI = 56, mD = 10, mS = 12, mB = 46;
    const max = escala(Math.max(1, ...series.flatMap((s) => s.valores)));
    const ancho = (W - mI - mD) / Math.max(1, categorias.length);
    const bw = Math.min(38, (ancho * 0.7) / series.length);
    const y = (v) => mS + (H - mS - mB) * (1 - v / max);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, yy = y(v);
      svg += `<line x1="${mI}" x2="${W - mD}" y1="${yy}" y2="${yy}" stroke="#e7e2d8"/><text x="${mI - 6}" y="${yy + 4}" font-size="10" text-anchor="end" fill="#5d6b7a">${corto(v)}</text>`;
    }
    categorias.forEach((c, i) => {
      const x0 = mI + ancho * i + (ancho - bw * series.length) / 2;
      series.forEach((s, j) => {
        const v = s.valores[i] || 0, yy = y(Math.max(0, v));
        svg += `<rect x="${x0 + j * bw}" y="${yy}" width="${bw - 3}" height="${Math.max(0, H - mB - yy)}" rx="2" fill="${s.color}"><title>${esc(s.nombre)} · ${esc(c)}: ${UI.fmt.moneda(v)}</title></rect>`;
      });
      const etiqueta = c.length > 16 ? c.slice(0, 15) + "…" : c;
      svg += `<text x="${mI + ancho * i + ancho / 2}" y="${H - mB + 16}" font-size="11" text-anchor="middle" fill="#1d2733">${esc(etiqueta)}</text>`;
    });
    cont.innerHTML = svg + "</svg>" + leyenda(series);
  }

  /* Barras horizontales con signo: verde favorable (negativo), rojo desfavorable (positivo). */
  function variaciones(cont, filas) {
    const W = 560, fila = 30, mI = 210, mD = 80, H = fila * filas.length + 20;
    const max = Math.max(1, ...filas.map((f) => Math.abs(f.valor)));
    const cx = mI + (W - mI - mD) / 2, mitad = (W - mI - mD) / 2;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img"><line x1="${cx}" x2="${cx}" y1="4" y2="${H - 10}" stroke="#c9c2b4"/>`;
    filas.forEach((f, i) => {
      const yy = 10 + i * fila, w = (Math.abs(f.valor) / max) * mitad;
      const col = f.valor > 0 ? COLORES.desf : COLORES.fav;
      const x = f.valor >= 0 ? cx : cx - w;
      svg += `<text x="${mI - 8}" y="${yy + 14}" font-size="11" text-anchor="end" fill="#1d2733">${esc(f.etiqueta)}</text>
        <rect x="${x}" y="${yy + 3}" width="${Math.max(1, w)}" height="16" rx="2" fill="${col}"><title>${esc(f.etiqueta)}: ${UI.fmt.moneda(f.valor)}</title></rect>
        <text x="${W - 4}" y="${yy + 15}" font-size="11" text-anchor="end" fill="${col}">${corto(f.valor)}</text>`;
    });
    cont.innerHTML = svg + "</svg>" + leyenda([{ nombre: "Favorable", color: COLORES.fav }, { nombre: "Desfavorable", color: COLORES.desf }]);
  }

  /* Líneas: evolución por periodo. */
  function lineas(cont, { categorias, series }) {
    const W = 560, H = 240, mI = 56, mD = 16, mS = 12, mB = 34;
    const max = escala(Math.max(1, ...series.flatMap((s) => s.valores)));
    const x = (i) => mI + (categorias.length > 1 ? ((W - mI - mD) * i) / (categorias.length - 1) : (W - mI - mD) / 2);
    const y = (v) => mS + (H - mS - mB) * (1 - v / max);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      svg += `<line x1="${mI}" x2="${W - mD}" y1="${y(v)}" y2="${y(v)}" stroke="#e7e2d8"/><text x="${mI - 6}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="#5d6b7a">${corto(v)}</text>`;
    }
    categorias.forEach((c, i) => { svg += `<text x="${x(i)}" y="${H - 12}" font-size="11" text-anchor="middle" fill="#1d2733">${esc(c)}</text>`; });
    series.forEach((s) => {
      svg += `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" points="${s.valores.map((v, i) => x(i) + "," + y(v)).join(" ")}"/>`;
      s.valores.forEach((v, i) => { svg += `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${s.color}"><title>${esc(s.nombre)} ${esc(categorias[i])}: ${UI.fmt.moneda(v)}</title></circle>`; });
    });
    cont.innerHTML = svg + "</svg>" + leyenda(series);
  }

  return { barras, variaciones, lineas, COLORES };
})();
