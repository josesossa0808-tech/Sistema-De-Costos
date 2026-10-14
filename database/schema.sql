-- =====================================================================
--  SISTEMA DE COSTOS - Esquema de base de datos (MySQL 8.x)
--  Costeo estándar: materiales, mano de obra directa, CIF y variaciones
-- =====================================================================
--  Ejecución manual:  mysql -u root -p < database/schema.sql
--  (El sistema también lo ejecuta automáticamente al iniciar por
--   primera vez si [base_datos] crear_automaticamente = si)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. USUARIOS Y SEGURIDAD
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(40) NOT NULL UNIQUE,
    descripcion VARCHAR(200)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rol_permisos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rol_id INT NOT NULL,
    modulo VARCHAR(40) NOT NULL,
    puede_ver TINYINT NOT NULL DEFAULT 0,
    puede_crear TINYINT NOT NULL DEFAULT 0,
    puede_editar TINYINT NOT NULL DEFAULT 0,
    puede_eliminar TINYINT NOT NULL DEFAULT 0,
    UNIQUE (rol_id, modulo),
    FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    usuario VARCHAR(40) NOT NULL UNIQUE,
    correo VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    rol_id INT NOT NULL,
    activo TINYINT NOT NULL DEFAULT 1,
    intentos_fallidos INT NOT NULL DEFAULT 0,
    bloqueado_hasta DATETIME NULL,
    ultimo_acceso DATETIME NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rol_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sesiones (
    token VARCHAR(80) PRIMARY KEY,
    usuario_id INT NOT NULL,
    creado_en DATETIME NOT NULL,
    expira_en DATETIME NOT NULL,
    activa TINYINT NOT NULL DEFAULT 1,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bitacora (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NULL,
    usuario VARCHAR(40),
    accion VARCHAR(40) NOT NULL,
    modulo VARCHAR(40),
    detalle VARCHAR(500),
    ip VARCHAR(45),
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 2. DATOS GENERALES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nit VARCHAR(20) NOT NULL UNIQUE,
    digito_verificacion VARCHAR(2),
    razon_social VARCHAR(150) NOT NULL,
    nombre_comercial VARCHAR(150),
    tipo_persona VARCHAR(20) DEFAULT 'Jurídica',
    regimen_tributario VARCHAR(60),
    responsable_iva VARCHAR(5) DEFAULT 'Si',
    tarifa_iva DECIMAL(6,2) DEFAULT 19,
    actividad_economica VARCHAR(20),
    representante_legal VARCHAR(120),
    direccion VARCHAR(150),
    ciudad VARCHAR(80),
    telefono VARCHAR(30),
    correo VARCHAR(120),
    moneda VARCHAR(5) DEFAULT 'COP',
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS periodos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    nombre VARCHAR(40) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    estado VARCHAR(10) NOT NULL DEFAULT 'Abierto',
    UNIQUE (empresa_id, nombre),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS unidades_medida (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(10) NOT NULL UNIQUE,
    nombre VARCHAR(40) NOT NULL,
    tipo VARCHAR(20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS centros_costo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    codigo VARCHAR(20) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    tipo VARCHAR(20) DEFAULT 'Producción',
    UNIQUE (empresa_id, codigo),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS proveedores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    nit VARCHAR(20) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    telefono VARCHAR(30),
    correo VARCHAR(120),
    UNIQUE (empresa_id, nit),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    codigo VARCHAR(20) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    unidad_id INT NOT NULL,
    precio_venta DECIMAL(16,2) NOT NULL DEFAULT 0,
    horas_maquina_estandar DECIMAL(12,4) NOT NULL DEFAULT 0,
    descripcion VARCHAR(300),
    UNIQUE (empresa_id, codigo),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    FOREIGN KEY (unidad_id) REFERENCES unidades_medida(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 3. MATERIAS PRIMAS DIRECTAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS materias_primas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    codigo VARCHAR(20) NOT NULL,
    descripcion VARCHAR(150) NOT NULL,
    unidad_id INT NOT NULL,
    precio_estandar DECIMAL(16,4) NOT NULL DEFAULT 0,
    proveedor_id INT NULL,
    centro_costo_id INT NULL,
    UNIQUE (empresa_id, codigo),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    FOREIGN KEY (unidad_id) REFERENCES unidades_medida(id),
    FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
    FOREIGN KEY (centro_costo_id) REFERENCES centros_costo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Estándar de materiales por unidad de producto (receta / lista de materiales)
CREATE TABLE IF NOT EXISTS estandar_materiales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    producto_id INT NOT NULL,
    materia_prima_id INT NOT NULL,
    cantidad_estandar DECIMAL(16,6) NOT NULL,
    precio_estandar DECIMAL(16,4) NOT NULL,
    UNIQUE (producto_id, materia_prima_id),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
    FOREIGN KEY (materia_prima_id) REFERENCES materias_primas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 4. MANO DE OBRA DIRECTA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cargos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    nombre VARCHAR(80) NOT NULL,
    tarifa_estandar_hora DECIMAL(16,4) NOT NULL DEFAULT 0,
    descripcion VARCHAR(200),
    UNIQUE (empresa_id, nombre),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Prestaciones sociales y cargas laborales (porcentaje sobre salario)
CREATE TABLE IF NOT EXISTS prestaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    concepto VARCHAR(80) NOT NULL,
    tipo VARCHAR(20) DEFAULT 'Prestación',
    porcentaje DECIMAL(8,4) NOT NULL,
    UNIQUE (empresa_id, concepto),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trabajadores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    documento VARCHAR(20) NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    cargo_id INT NOT NULL,
    centro_costo_id INT NULL,
    salario_mensual DECIMAL(16,2) NOT NULL,
    auxilio_transporte DECIMAL(16,2) NOT NULL DEFAULT 0,
    horas_mes DECIMAL(8,2) NOT NULL,
    activo TINYINT NOT NULL DEFAULT 1,
    UNIQUE (empresa_id, documento),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    FOREIGN KEY (cargo_id) REFERENCES cargos(id),
    FOREIGN KEY (centro_costo_id) REFERENCES centros_costo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Estándar de mano de obra por unidad de producto
CREATE TABLE IF NOT EXISTS estandar_mano_obra (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    producto_id INT NOT NULL,
    cargo_id INT NOT NULL,
    horas_estandar DECIMAL(12,6) NOT NULL,
    tarifa_estandar DECIMAL(16,4) NOT NULL,
    UNIQUE (producto_id, cargo_id),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
    FOREIGN KEY (cargo_id) REFERENCES cargos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 5. COSTOS INDIRECTOS DE FABRICACIÓN
-- ---------------------------------------------------------------------
-- Parámetros de aplicación por periodo
CREATE TABLE IF NOT EXISTS cif_parametros (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    periodo_id INT NOT NULL,
    base_aplicacion VARCHAR(20) NOT NULL DEFAULT 'horas_mod',
    nivel_normal DECIMAL(16,4) NOT NULL,
    UNIQUE (periodo_id),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Conceptos de CIF presupuestados y reales por periodo
CREATE TABLE IF NOT EXISTS cif (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    periodo_id INT NOT NULL,
    codigo VARCHAR(20) NOT NULL,
    concepto VARCHAR(120) NOT NULL,
    comportamiento VARCHAR(10) NOT NULL,
    centro_costo_id INT NULL,
    valor_presupuestado DECIMAL(16,2) NOT NULL DEFAULT 0,
    valor_real DECIMAL(16,2) NOT NULL DEFAULT 0,
    UNIQUE (periodo_id, codigo),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE CASCADE,
    FOREIGN KEY (centro_costo_id) REFERENCES centros_costo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 6. PRODUCCIÓN
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ordenes_produccion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    periodo_id INT NOT NULL,
    numero VARCHAR(20) NOT NULL,
    producto_id INT NOT NULL,
    centro_costo_id INT NULL,
    fecha DATE NOT NULL,
    cantidad_terminada DECIMAL(16,4) NOT NULL DEFAULT 0,
    cantidad_en_proceso DECIMAL(16,4) NOT NULL DEFAULT 0,
    avance_materiales DECIMAL(6,2) NOT NULL DEFAULT 100,
    avance_conversion DECIMAL(6,2) NOT NULL DEFAULT 50,
    horas_maquina_reales DECIMAL(12,4) NOT NULL DEFAULT 0,
    estado VARCHAR(15) NOT NULL DEFAULT 'En proceso',
    observaciones VARCHAR(300),
    UNIQUE (empresa_id, numero),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    FOREIGN KEY (periodo_id) REFERENCES periodos(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    FOREIGN KEY (centro_costo_id) REFERENCES centros_costo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Materia prima realmente utilizada en la orden
CREATE TABLE IF NOT EXISTS orden_materiales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    orden_id INT NOT NULL,
    materia_prima_id INT NOT NULL,
    cantidad_real DECIMAL(16,6) NOT NULL,
    precio_real DECIMAL(16,4) NOT NULL,
    FOREIGN KEY (orden_id) REFERENCES ordenes_produccion(id) ON DELETE CASCADE,
    FOREIGN KEY (materia_prima_id) REFERENCES materias_primas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Horas reales trabajadas en la orden
CREATE TABLE IF NOT EXISTS orden_mano_obra (
    id INT AUTO_INCREMENT PRIMARY KEY,
    orden_id INT NOT NULL,
    trabajador_id INT NOT NULL,
    horas_reales DECIMAL(12,4) NOT NULL,
    tarifa_real DECIMAL(16,4) NOT NULL,
    FOREIGN KEY (orden_id) REFERENCES ordenes_produccion(id) ON DELETE CASCADE,
    FOREIGN KEY (trabajador_id) REFERENCES trabajadores(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 7. RESULTADOS: COSTOS ESTÁNDAR, REALES Y VARIACIONES (calculados)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS costos_estandar (
    id INT AUTO_INCREMENT PRIMARY KEY,
    orden_id INT NOT NULL UNIQUE,
    unidades_equiv_mp DECIMAL(16,4) NOT NULL,
    unidades_equiv_conv DECIMAL(16,4) NOT NULL,
    mp_unitario DECIMAL(16,4) NOT NULL,
    mod_unitario DECIMAL(16,4) NOT NULL,
    cif_unitario DECIMAL(16,4) NOT NULL,
    total_unitario DECIMAL(16,4) NOT NULL,
    mp_total DECIMAL(18,2) NOT NULL,
    mod_total DECIMAL(18,2) NOT NULL,
    cif_aplicado DECIMAL(18,2) NOT NULL,
    total DECIMAL(18,2) NOT NULL,
    calculado_en DATETIME NOT NULL,
    FOREIGN KEY (orden_id) REFERENCES ordenes_produccion(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS costos_reales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    orden_id INT NOT NULL UNIQUE,
    mp_total DECIMAL(18,2) NOT NULL,
    mod_total DECIMAL(18,2) NOT NULL,
    cif_total DECIMAL(18,2) NOT NULL,
    total DECIMAL(18,2) NOT NULL,
    total_unitario DECIMAL(16,4) NOT NULL,
    calculado_en DATETIME NOT NULL,
    FOREIGN KEY (orden_id) REFERENCES ordenes_produccion(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS variaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    periodo_id INT NOT NULL,
    orden_id INT NULL,
    elemento VARCHAR(10) NOT NULL,
    tipo VARCHAR(30) NOT NULL,
    referencia VARCHAR(150),
    valor DECIMAL(18,2) NOT NULL,
    naturaleza VARCHAR(15) NOT NULL,
    calculado_en DATETIME NOT NULL,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE CASCADE,
    FOREIGN KEY (orden_id) REFERENCES ordenes_produccion(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
