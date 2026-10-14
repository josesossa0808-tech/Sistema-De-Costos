# Manual de usuario — Sistema de Costos

Este manual explica cómo usar el sistema paso a paso. Las mismas instrucciones están dentro del programa en **Ayuda › Instrucciones de uso**.

## 1. ¿Qué hace el sistema?

Calcula el **costo estándar** de cada producto (lo que *debería* costar), lo compara con el **costo real** de cada orden de producción y explica la diferencia mediante **variaciones**:

| Elemento | Variaciones |
|---|---|
| Materia prima directa | de precio y de cantidad |
| Mano de obra directa (MOD) | de tarifa y de eficiencia |
| Costos indirectos de fabricación (CIF) | de presupuesto y de volumen |

El sistema se entrega **vacío**: usted registra la información de su empresa.

## 2. Instalar y abrir el sistema

**Instalación (una sola vez):** en Windows, abra la carpeta `instalador`, dé doble clic en `INSTALAR_TODO.bat` y acepte el permiso de administrador; el instalador deja todo listo (Python, MySQL y el sistema) y crea el acceso directo. En Mac o Linux, ejecute `bash instalador/instalar.sh`.

1. Abra **Sistema de Costos** desde el escritorio o el menú Inicio. Se abre una ventana negra (el servidor; no la cierre) y el navegador en `http://127.0.0.1:5000`.
2. Si el navegador no se abre solo, escriba esa dirección.
3. Para salir: **Cerrar sesión** y luego cierre la ventana negra.

## 3. Crear cuenta e iniciar sesión

### Crear cuenta
1. En la pantalla de inicio (tarjeta «Sistema de Costos Estándar») haga clic en la pestaña **Crear cuenta**.
2. Escriba nombre completo, usuario (3 a 40 caracteres: letras, números, punto o guion), correo y contraseña (mínimo 8 caracteres con letras y números). Confírmela.
3. Clic en **Crear cuenta**. Verá el mensaje de confirmación y volverá a *Iniciar sesión*.

Las cuentas creadas así quedan con rol **Usuario**. El administrador puede cambiar los roles en *Usuarios*.

### Iniciar sesión
1. Escriba su usuario (también acepta el correo) y la contraseña. Clic en **Entrar**.
2. Si se equivoca varias veces seguidas, la cuenta se bloquea unos minutos.
3. Primer ingreso del administrador: usuario `admin`, contraseña `Admin123*`. **Cámbiela de inmediato** con el botón **Contraseña** (arriba a la derecha).

### Cerrar sesión
Botón **Cerrar sesión** (arriba a la derecha). La sesión también vence sola después del tiempo configurado.

## 4. La pantalla principal

- **Menú lateral**: módulos disponibles según su rol.
- **Empresa** y **Periodo** (barra superior): todo lo que vea y registre corresponde a la empresa y periodo seleccionados.
- En cada lista: **+ Nuevo** para crear, **Editar**, **Eliminar** (pide confirmación) y un **buscador**.
- Los campos con asterisco rojo (*) son obligatorios. Si algo está mal, el campo se marca en rojo con el motivo.

## 5. Configuración inicial (hágalo en este orden)

### Paso 1 · Empresa
*Datos generales › Empresas › + Nuevo*: NIT, dígito de verificación, razón social, nombre comercial, tipo de persona, régimen tributario, responsable de IVA, tarifa de IVA, actividad económica (CIIU), representante legal, dirección, ciudad, teléfono y correo. Luego selecciónela arriba en **Empresa**.

> Eliminar una empresa borra toda su información de costos. El sistema le pedirá confirmación.

### Paso 2 · Periodo contable
*Periodos contables › + Nuevo*: nombre (ej. `2026-10`), fecha inicial y final. Selecciónelo arriba en **Periodo**.

### Paso 3 · Catálogos
- **Unidades de medida**: KG, G, L, UND, etc.
- **Centros de costo**: por ejemplo Producción, Empaque.
- **Productos**: código, nombre, unidad, **precio de venta** (para el margen) y, si aplica, horas máquina estándar por unidad.

### Paso 4 · Materias primas directas
1. **Proveedores**: NIT y nombre.
2. **Materias primas**: código, descripción, unidad, **precio estándar**, proveedor y centro de costo.
3. **Estándar de materiales**: para cada producto, qué materias primas lleva y **cuánto por UNA unidad** de producto. El precio estándar se toma de la materia prima si lo deja vacío.

### Paso 5 · Mano de obra directa
1. **Cargos y tarifa estándar**: cargo y tarifa estándar por hora.
2. **Prestaciones y cargas**: cada concepto con su porcentaje sobre el salario y su tipo (*Prestación social*, *Seguridad social*, *Parafiscal*). Use los porcentajes que apliquen a su empresa. Las de tipo *Prestación social* se calculan sobre salario + auxilio de transporte.
3. **Trabajadores y salarios**: documento, nombre, cargo, salario mensual, auxilio de transporte y horas laborales al mes. La tabla muestra el factor prestacional, el costo mensual total y la **tarifa real por hora**.
4. **Estándar de mano de obra**: para cada producto, las **horas estándar por UNA unidad** por cargo.

### Paso 6 · Costos indirectos de fabricación
1. **Base y tasa predeterminada**: por periodo, la base de aplicación (*horas de MOD*, *horas máquina* o *unidades producidas*) y el **nivel normal de actividad** (horas o unidades presupuestadas del periodo).
2. **Registro de CIF**: cada concepto (arriendo, energía, depreciación…) como **Fijo** o **Variable**, con su valor **presupuestado**. Cuando tenga el gasto real, complete el valor **real**.

La tasa predeterminada se calcula sola: CIF presupuestado ÷ nivel normal.

## 6. Registrar la producción

*Producción › Órdenes de producción › + Nueva orden*:

1. **Producto** y **fecha** (debe estar dentro del periodo). El número se asigna solo (OP-0001) si lo deja vacío.
2. **Cantidad terminada** y **cantidad en proceso**. Para las unidades en proceso indique el **% de avance** de materiales y de conversión (mano de obra y CIF).
3. **Materia prima utilizada (real)**: agregue cada material con la cantidad realmente consumida y su precio real. El botón **Cargar desde el estándar** propone las cantidades según las unidades.
4. **Horas de trabajo (reales)**: agregue cada trabajador con sus horas reales. Si deja la tarifa vacía se usa su tarifa real calculada.
5. **Guardar orden**. El CIF se aplica automáticamente.

*Terminada y en proceso* muestra las unidades y su valor a costo estándar por producto.

## 7. Consultar costos y variaciones

- **Hoja de costo estándar**: costo de UNA unidad de producto (materiales + MOD + CIF).
- **Hoja de costos por orden**: estándar unitario y total, real unitario y total, diferencia, y el detalle de cada variación. Se puede exportar a Excel/PDF o imprimir.
- **Análisis de variaciones**: todas las variaciones del periodo (filtrables por producto), el total favorable, el desfavorable y la variación neta, con gráfico y el análisis de CIF paso a paso.

**Cómo leerlas**: un valor **positivo (rojo) es desfavorable**, el costo real fue mayor; un valor **negativo (verde) es favorable**.

| Variación | Fórmula |
|---|---|
| Precio de materiales | (Precio real − Precio estándar) × Cantidad real |
| Cantidad de materiales | (Cantidad real − Cantidad estándar permitida) × Precio estándar |
| Tarifa de MOD | (Tarifa real − Tarifa estándar) × Horas reales |
| Eficiencia de MOD | (Horas reales − Horas estándar permitidas) × Tarifa estándar |
| Presupuesto de CIF | CIF real − Presupuesto flexible |
| Volumen de CIF | Presupuesto flexible − CIF aplicado |

## 8. Dashboard

Muestra para el periodo (y producto, si lo filtra): costo estándar y real unitario, diferencia porcentual, costo total de producción, margen, variaciones de materiales, MOD y CIF, variación total, unidades terminadas y en proceso, y gráficos de estándar vs. real, de variaciones y de evolución por periodo. Botón **Imprimir**.

## 9. Reportes

*Reportes*: elija el tipo, el producto (o la orden para la hoja de costos) y luego **Ver reporte**, **Exportar a Excel**, **Exportar a PDF** o **Imprimir**.

Disponibles: hoja de costos, reporte de materiales, de mano de obra, de CIF, de producción, de variaciones y estado de costos de producción. Una copia de cada archivo exportado queda en la carpeta `reportes_generados` de la instalación.

## 10. Usuarios y seguridad (administrador)

- **Usuarios**: crear, editar (nombre, correo, rol, nueva contraseña), activar/desactivar y eliminar. No puede eliminarse ni desactivarse a sí mismo.
- **Roles y permisos**: marque qué puede *ver, crear, editar o eliminar* cada rol en cada módulo y **Guardar permisos**.
- **Registro de actividades**: inicios y cierres de sesión, intentos fallidos, creación de cuentas, cambios, eliminaciones y exportaciones, con filtros por usuario, acción y fechas.
- **Copia de seguridad**: descarga un respaldo completo de la base de datos. Toda la información del sistema está en un solo archivo (`database/sistema_costos.db`); guarde las copias fuera del computador. En esa misma pantalla están los pasos para restaurar una copia.

Roles por defecto:

| Rol | Puede |
|---|---|
| Administrador | Todo |
| Usuario | Registrar, editar y eliminar en todos los módulos de costos; no administra usuarios |
| Estudiante | Consultar todo; registrar y editar estándares, mano de obra, CIF y producción; no elimina |

## 11. Cierre de periodo

Cuando termine un mes, edite el periodo y cambie su estado a **Cerrado**. Desde ese momento no se pueden modificar sus órdenes ni sus CIF. Si cambió estándares o CIF antes de cerrar, use **Recalcular** en *Órdenes de producción*.

## 12. Preguntas frecuentes

**Me aparece «Primero cree una empresa».** Registre una empresa en *Datos generales › Empresas*.

**«No se puede eliminar: el registro está siendo usado».** El registro está en estándares u órdenes. Elimine primero esos usos o déjelo.

**El CIF aplicado sale en cero.** Falta la *Base y tasa predeterminada* del periodo o los CIF presupuestados.

**No veo un módulo del menú.** Su rol no tiene permiso; consulte al administrador.

**«No hay conexión con el servidor».** La ventana negra del sistema se cerró. Vuelva a abrir *Sistema de Costos*.
