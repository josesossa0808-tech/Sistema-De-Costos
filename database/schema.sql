-- Sistema de Costos Estándar - Base de datos MySQL
CREATE DATABASE IF NOT EXISTS sistema_costos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sistema_costos;

-- ===== 2. Usuarios y seguridad =====
CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS permisos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rol_id INT NOT NULL,
  modulo VARCHAR(50) NOT NULL,
  puede_ver TINYINT(1) DEFAULT 1,
  puede_editar TINYINT(1) DEFAULT 0,
  FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  rol_id INT NOT NULL,
  activo TINYINT(1) DEFAULT 1,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rol_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS bitacora (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT,
  accion VARCHAR(100) NOT NULL,
  detalle VARCHAR(500),
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

INSERT IGNORE INTO roles (id, nombre, descripcion) VALUES
 (1, 'Administrador', 'Acceso total al sistema'),
 (2, 'Usuario', 'Registra y consulta información'),
 (3, 'Estudiante', 'Solo consulta');

-- ===== 3. Datos generales =====
CREATE TABLE IF NOT EXISTS empresas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nit VARCHAR(20) NOT NULL UNIQUE,
  razon_social VARCHAR(150) NOT NULL,
  regimen_tributario VARCHAR(50),
  responsabilidad_iva TINYINT(1) DEFAULT 1,
  direccion VARCHAR(150),
  telefono VARCHAR(30),
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS periodos_contables (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  nombre VARCHAR(50) NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  cerrado TINYINT(1) DEFAULT 0,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS unidades_medida (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(10) NOT NULL UNIQUE,
  nombre VARCHAR(50) NOT NULL
);

INSERT IGNORE INTO unidades_medida (codigo, nombre) VALUES
 ('UND','Unidad'), ('KG','Kilogramo'), ('LT','Litro'), ('MT','Metro'), ('HR','Hora');

CREATE TABLE IF NOT EXISTS centros_costo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  codigo VARCHAR(20) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS productos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  codigo VARCHAR(20) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  unidad_id INT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (unidad_id) REFERENCES unidades_medida(id)
);

-- ===== 4. Materias primas directas =====
CREATE TABLE IF NOT EXISTS materias_primas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  codigo VARCHAR(20) NOT NULL,
  descripcion VARCHAR(150) NOT NULL,
  unidad_id INT,
  precio_estandar DECIMAL(14,2) DEFAULT 0,
  proveedor VARCHAR(100),
  centro_costo_id INT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (unidad_id) REFERENCES unidades_medida(id),
  FOREIGN KEY (centro_costo_id) REFERENCES centros_costo(id)
);

-- Cantidad estándar de cada material por unidad de producto
CREATE TABLE IF NOT EXISTS estandar_material (
  id INT AUTO_INCREMENT PRIMARY KEY,
  producto_id INT NOT NULL,
  materia_prima_id INT NOT NULL,
  cantidad_estandar DECIMAL(14,4) NOT NULL,
  FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
  FOREIGN KEY (materia_prima_id) REFERENCES materias_primas(id) ON DELETE CASCADE
);

-- ===== 5. Mano de obra directa =====
CREATE TABLE IF NOT EXISTS cargos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trabajadores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  documento VARCHAR(20) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  cargo_id INT,
  salario_mensual DECIMAL(14,2) NOT NULL,
  porcentaje_prestaciones DECIMAL(6,2) DEFAULT 52.18,
  horas_mes DECIMAL(8,2) DEFAULT 230,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (cargo_id) REFERENCES cargos(id)
);

-- Horas y tarifa estándar por unidad de producto
CREATE TABLE IF NOT EXISTS estandar_mod (
  id INT AUTO_INCREMENT PRIMARY KEY,
  producto_id INT NOT NULL,
  horas_estandar DECIMAL(10,4) NOT NULL,
  tarifa_estandar DECIMAL(14,2) NOT NULL,
  FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
);

-- ===== 6. Costos indirectos de fabricación =====
CREATE TABLE IF NOT EXISTS cif_presupuesto (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  periodo_id INT NOT NULL,
  cif_fijo DECIMAL(14,2) NOT NULL,
  cif_variable DECIMAL(14,2) NOT NULL,
  base_aplicacion ENUM('HORAS_MOD','HORAS_MAQUINA','UNIDADES') NOT NULL,
  capacidad_normal DECIMAL(14,2) NOT NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (periodo_id) REFERENCES periodos_contables(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cif_real (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  periodo_id INT NOT NULL,
  concepto VARCHAR(100) NOT NULL,
  tipo ENUM('FIJO','VARIABLE') NOT NULL,
  valor DECIMAL(14,2) NOT NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (periodo_id) REFERENCES periodos_contables(id) ON DELETE CASCADE
);

-- ===== 9. Producción =====
CREATE TABLE IF NOT EXISTS ordenes_produccion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  periodo_id INT,
  producto_id INT NOT NULL,
  cantidad DECIMAL(14,2) NOT NULL,
  fecha DATE NOT NULL,
  estado ENUM('EN_PROCESO','TERMINADA') DEFAULT 'EN_PROCESO',
  horas_reales DECIMAL(10,2) DEFAULT 0,
  tarifa_real DECIMAL(14,2) DEFAULT 0,
  base_cif_real DECIMAL(14,2) DEFAULT 0,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (periodo_id) REFERENCES periodos_contables(id),
  FOREIGN KEY (producto_id) REFERENCES productos(id)
);

CREATE TABLE IF NOT EXISTS consumo_material (
  id INT AUTO_INCREMENT PRIMARY KEY,
  orden_id INT NOT NULL,
  materia_prima_id INT NOT NULL,
  cantidad_real DECIMAL(14,4) NOT NULL,
  precio_real DECIMAL(14,2) NOT NULL,
  FOREIGN KEY (orden_id) REFERENCES ordenes_produccion(id) ON DELETE CASCADE,
  FOREIGN KEY (materia_prima_id) REFERENCES materias_primas(id)
);
