/* Instrucciones de uso dentro del sistema. */
App.pagina("ayuda", async (vista) => {
  const paso = (n, titulo, texto) => `<div class="paso"><b class="n">${n}</b><div><b>${titulo}</b><br>${texto}</div></div>`;
  vista.innerHTML = `<div class="ayuda-doc">
  <h1>Instrucciones de uso</h1>
  <p>El Sistema de Costos calcula el <b>costo estándar</b> de sus productos, lo compara con el <b>costo real</b> de cada orden de
  producción y analiza las <b>variaciones</b> de materiales, mano de obra directa (MOD) y costos indirectos de fabricación (CIF).
  El sistema inicia vacío: usted registra toda la información de su empresa siguiendo el orden de abajo.</p>

  <h2>1. Acceso al sistema</h2>
  ${paso(1, "Crear cuenta", "En la pantalla de inicio elija <b>Crear cuenta</b>, escriba nombre, usuario, correo y una contraseña de mínimo 8 caracteres con letras y números. Las cuentas nuevas quedan con rol <i>Usuario</i>; el administrador puede cambiar los roles.")}
  ${paso(2, "Iniciar sesión", "Ingrese con su usuario o correo y su contraseña. Tras varios intentos fallidos la cuenta se bloquea temporalmente.")}
  ${paso(3, "Cerrar sesión", "Use <b>Cerrar sesión</b> en la parte superior derecha. La sesión también se cierra sola tras el tiempo configurado. Con <b>Contraseña</b> puede cambiar su clave.")}

  <h2>2. Orden recomendado para configurar</h2>
  ${paso(1, "Empresa", "<a href='#/r/empresas'>Datos generales › Empresas</a>: NIT, razón social, régimen tributario, IVA, actividad económica. Luego selecciónela arriba en <b>Empresa</b>.")}
  ${paso(2, "Periodo contable", "<a href='#/r/periodos'>Periodos contables</a>: por ejemplo «2026-10» del 1 al 31 de octubre. Selecciónelo arriba en <b>Periodo</b>.")}
  ${paso(3, "Catálogos", "<a href='#/r/unidades_medida'>Unidades de medida</a>, <a href='#/r/centros_costo'>centros de costo</a>, <a href='#/r/productos'>productos</a> (con precio de venta) y <a href='#/r/proveedores'>proveedores</a>.")}
  ${paso(4, "Materias primas", "<a href='#/r/materias_primas'>Materias primas</a> con código, unidad y <b>precio estándar</b>. Después, en <a href='#/r/estandar_materiales'>Estándar de materiales</a>, indique cuánto de cada material lleva <b>una</b> unidad de producto.")}
  ${paso(5, "Mano de obra", "<a href='#/r/cargos'>Cargos</a> con su <b>tarifa estándar por hora</b>; <a href='#/r/prestaciones'>prestaciones y cargas</a> (cesantías, prima, vacaciones, salud, pensión, ARL, parafiscales… con el porcentaje que aplique a su empresa); <a href='#/r/trabajadores'>trabajadores</a> con salario y horas al mes. El sistema calcula la tarifa real por hora. Finalmente, en <a href='#/r/estandar_mano_obra'>Estándar de mano de obra</a>, las horas por unidad de producto.")}
  ${paso(6, "CIF", "En <a href='#/r/cif_parametros'>Base y tasa predeterminada</a> elija la base (horas MOD, horas máquina o unidades) y el nivel normal de actividad del periodo. En <a href='#/r/cif'>Registro de CIF</a> registre cada concepto como fijo o variable con su valor presupuestado; el valor real se completa al cierre.")}
  ${paso(7, "Producción", "En <a href='#/ordenes'>Órdenes de producción</a> registre producto, fecha, unidades terminadas y en proceso (con su % de avance), la materia prima realmente utilizada y las horas trabajadas. El botón <b>Cargar desde el estándar</b> sugiere las cantidades. El CIF se aplica automáticamente.")}
  ${paso(8, "Análisis", "Consulte la <a href='#/hoja-costos'>Hoja de costos</a> de cada orden, el <a href='#/variaciones'>Análisis de variaciones</a> del periodo, el <a href='#/dashboard'>Dashboard</a> y los <a href='#/reportes'>Reportes</a> (Excel, PDF o impresión).")}

  <h2>3. Cómo interpreta el sistema las variaciones</h2>
  <p>Un valor <b class="val-desf">positivo es desfavorable</b> (se gastó más de lo previsto) y un valor <b class="val-fav">negativo es favorable</b>.</p>
  <div class="formula">Precio de materiales = (Precio real − Precio estándar) × Cantidad real</div>
  <div class="formula">Cantidad de materiales = (Cantidad real − Cantidad estándar permitida) × Precio estándar</div>
  <div class="formula">Tarifa de MOD = (Tarifa real − Tarifa estándar) × Horas reales</div>
  <div class="formula">Eficiencia de MOD = (Horas reales − Horas estándar permitidas) × Tarifa estándar</div>
  <div class="formula">Tasa predeterminada = CIF presupuestado ÷ Nivel normal · CIF aplicado = Tasa × Base estándar permitida</div>
  <div class="formula">Presupuesto de CIF = CIF real − (CIF fijo presupuestado + Tasa variable × Base estándar permitida)</div>
  <div class="formula">Volumen de CIF = Presupuesto flexible − CIF aplicado</div>
  <p>Las cantidades y horas «estándar permitidas» se calculan sobre <b>unidades equivalentes</b>: terminadas + en proceso × % de avance
  (materiales con su propio % y mano de obra/CIF con el % de conversión).</p>

  <h2>4. Roles</h2>
  <ul><li><b>Administrador:</b> todo, incluidos usuarios, permisos y registro de actividades.</li>
  <li><b>Usuario:</b> registra, edita y elimina en todos los módulos de costos; no administra usuarios.</li>
  <li><b>Estudiante:</b> consulta todo y registra estándares, CIF y producción; no elimina ni cambia datos generales.</li></ul>
  <p>El administrador puede ajustar estos permisos en <a href="#/permisos">Roles y permisos</a>.</p>

  <h2>5. Buenas prácticas</h2>
  <ul><li>Cierre el periodo (estado <i>Cerrado</i>) cuando termine de registrar: así nadie podrá modificar su producción ni sus CIF.</li>
  <li>Si cambia estándares o CIF después de registrar órdenes, use <b>Recalcular</b> en Órdenes de producción.</li>
  <li>Los reportes exportados también se guardan en la carpeta <code>reportes_generados</code> de la instalación.</li>
  <li>Descargue periódicamente una <a href='#/respaldo'>copia de seguridad</a> (administrador). Toda la información está en el archivo <code>database/sistema_costos.db</code>.</li></ul>
  </div>`;
});
