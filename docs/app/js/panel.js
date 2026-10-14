let ROL = '';

(async function iniciar() {
  const s = await api('/api/sesion');
  ROL = s.rol;
  document.getElementById('usuario').textContent = `${s.nombre} (${s.rol})`;
  if (ROL !== 'Administrador') document.querySelectorAll('.solo-admin').forEach(e => e.remove());
  cargarEmpresas();
})();

// Navegación entre módulos
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.vista').forEach(v => v.classList.add('oculto'));
  document.getElementById(b.dataset.v).classList.remove('oculto');
  if (b.dataset.v === 'bitacora') cargarBitacora();
});

document.getElementById('salir').onclick = async () => {
  await api('/api/logout', 'POST');
  location.href = 'index.html';
};

// ----- Empresas -----
async function cargarEmpresas() {
  const lista = await api('/api/empresas');
  document.getElementById('tablaEmpresas').innerHTML = lista.map(e => `
    <tr><td>${e.nit}</td><td>${e.razon_social}</td><td>${e.regimen_tributario || ''}</td>
    <td><button class="sec" onclick='editarEmpresa(${JSON.stringify(e)})'>Editar</button>
    ${ROL === 'Administrador' ? `<button class="peligro" onclick="eliminarEmpresa(${e.id})">Eliminar</button>` : ''}</td></tr>`
  ).join('');
}

function editarEmpresa(e) {
  const f = document.getElementById('formEmpresa');
  for (const k of ['id', 'nit', 'razon_social', 'regimen_tributario', 'direccion', 'telefono'])
    f.elements[k].value = e[k] || '';
}

async function eliminarEmpresa(id) {
  if (!confirm('¿Eliminar esta empresa?')) return;
  await api(`/api/empresas/${id}`, 'DELETE');
  cargarEmpresas();
}

document.getElementById('formEmpresa').onsubmit = async (ev) => {
  ev.preventDefault();
  const d = Object.fromEntries(new FormData(ev.target));
  try {
    if (d.id) await api(`/api/empresas/${d.id}`, 'PUT', d);
    else await api('/api/empresas', 'POST', d);
    ev.target.reset();
    cargarEmpresas();
  } catch (e) { alert(e.message); }
};

// ----- Variaciones -----
document.getElementById('formVar').onsubmit = async (ev) => {
  ev.preventDefault();
  const r = await api('/api/variaciones/calcular', 'POST', Object.fromEntries(new FormData(ev.target)));
  const fila = v => `<tr class="${v.tipo === 'Favorable' ? 'fav' : v.tipo === 'Desfavorable' ? 'desf' : ''}">
    <td>${v.nombre}</td><td>${pesos(Math.abs(v.valor))}</td><td>${v.tipo}</td></tr>`;
  document.getElementById('resultadoVar').innerHTML = `
    <p>Tasa predeterminada de CIF: <b>${r.tasa_predeterminada}</b> · CIF aplicado: <b>${pesos(r.cif_aplicado)}</b></p>
    <table><thead><tr><th>Variación</th><th>Valor</th><th>Tipo</th></tr></thead><tbody>
    ${r.variaciones.map(fila).join('')}
    ${fila({ nombre: '<b>Variación total</b>', ...r.total })}
    </tbody></table>`;
};

// ----- Bitácora -----
async function cargarBitacora() {
  const l = await api('/api/bitacora');
  document.getElementById('tablaBitacora').innerHTML = l.map(b =>
    `<tr><td>${b.fecha}</td><td>${b.usuario || ''}</td><td>${b.accion}</td><td>${b.detalle || ''}</td></tr>`).join('');
}
