// Comunicación con el backend mediante API
async function api(url, metodo = 'GET', datos) {
  const r = await fetch(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: datos ? JSON.stringify(datos) : undefined,
    credentials: 'same-origin',
  });
  const json = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.includes('/login')) location.href = 'index.html';
  if (!r.ok) throw new Error(json.error || 'Error en el servidor');
  return json;
}

const pesos = (v) => Number(v).toLocaleString('es-CO', { style: 'currency', currency: 'COP' });
