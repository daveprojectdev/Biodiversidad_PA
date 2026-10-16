-- Inventario de biodiversidad_panama (MySQL 9.7.0), generado por inventario_mysql.py

-- orden: 3 filas
CREATE TABLE `orden` (
  `orden_id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`orden_id`),
  UNIQUE KEY `uq_orden_nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Ordenes taxonomicos de Amphibia presentes en Panama';

-- familia: 15 filas
CREATE TABLE `familia` (
  `familia_id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `orden_id` int NOT NULL,
  PRIMARY KEY (`familia_id`),
  UNIQUE KEY `uq_familia_nombre` (`nombre`),
  KEY `fk_familia_orden` (`orden_id`),
  CONSTRAINT `fk_familia_orden` FOREIGN KEY (`orden_id`) REFERENCES `orden` (`orden_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Familias taxonomicas de anfibios en Panama';

-- provincia: 15 filas
CREATE TABLE `provincia` (
  `provincia_id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`provincia_id`),
  UNIQUE KEY `uq_provincia_nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Provincias y comarcas de Panama con registros de anfibios';

-- fuente: 3 filas
CREATE TABLE `fuente` (
  `fuente_id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `licencia` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `descripcion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`fuente_id`),
  UNIQUE KEY `uq_fuente_nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Fuentes de datos: iNaturalist, GBIF, etc.';

-- observador: 2060 filas
CREATE TABLE `observador` (
  `observador_id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`observador_id`),
  KEY `idx_observador_nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=2061 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Observadores ciudadanos que registraron los avistamientos';

-- especie: 135 filas
CREATE TABLE `especie` (
  `especie_id` int NOT NULL AUTO_INCREMENT,
  `nombre_cientifico` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre_comun` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `genero` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `familia_id` int NOT NULL,
  PRIMARY KEY (`especie_id`),
  UNIQUE KEY `uq_especie_nombre_cientifico` (`nombre_cientifico`),
  KEY `fk_especie_familia` (`familia_id`),
  CONSTRAINT `fk_especie_familia` FOREIGN KEY (`familia_id`) REFERENCES `familia` (`familia_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=136 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Especies de anfibios registradas en Panama (GBIF)';

-- avistamiento: 8430 filas
CREATE TABLE `avistamiento` (
  `avistamiento_id` int NOT NULL AUTO_INCREMENT,
  `gbif_id` bigint NOT NULL,
  `especie_id` int NOT NULL,
  `provincia_id` int NOT NULL,
  `observador_id` int NOT NULL,
  `fuente_id` int NOT NULL,
  `latitud` decimal(9,6) NOT NULL,
  `longitud` decimal(9,6) NOT NULL,
  `fecha` date NOT NULL,
  `mes` tinyint NOT NULL,
  `anio` smallint NOT NULL,
  `licencia` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `occurrence_url` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `media_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`avistamiento_id`),
  UNIQUE KEY `uq_avistamiento_gbif_id` (`gbif_id`),
  KEY `fk_avist_observador` (`observador_id`),
  KEY `fk_avist_fuente` (`fuente_id`),
  KEY `idx_avist_especie` (`especie_id`),
  KEY `idx_avist_provincia` (`provincia_id`),
  KEY `idx_avist_anio_mes` (`anio`,`mes`),
  KEY `idx_avist_media` (`media_type`),
  CONSTRAINT `fk_avist_especie` FOREIGN KEY (`especie_id`) REFERENCES `especie` (`especie_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_avist_fuente` FOREIGN KEY (`fuente_id`) REFERENCES `fuente` (`fuente_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_avist_observador` FOREIGN KEY (`observador_id`) REFERENCES `observador` (`observador_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_avist_provincia` FOREIGN KEY (`provincia_id`) REFERENCES `provincia` (`provincia_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_anio` CHECK ((`anio` between 2000 and 2100)),
  CONSTRAINT `chk_latitud` CHECK ((`latitud` between -(90) and 90)),
  CONSTRAINT `chk_licencia` CHECK ((`licencia` in (_utf8mb4'CC_BY_NC_4_0',_utf8mb4'CC_BY_4_0',_utf8mb4'CC0_1_0'))),
  CONSTRAINT `chk_longitud` CHECK ((`longitud` between -(180) and 180)),
  CONSTRAINT `chk_media_type` CHECK (((`media_type` in (_utf8mb4'StillImage',_utf8mb4'Sound',_utf8mb4'StillImage;Sound')) or (`media_type` is null))),
  CONSTRAINT `chk_mes` CHECK ((`mes` between 1 and 12))
) ENGINE=InnoDB AUTO_INCREMENT=8431 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Registros reales de avistamientos de anfibios en Panama (GBIF 2020-2026)';

-- vista_avistamiento_completo: columnas (el cuerpo está en rutinas_origen/actualizar_vista_nombre_comun.sql)
--   avistamiento_id int
--   gbif_id bigint
--   especie_id int
--   nombre_cientifico varchar(150) utf8mb4_unicode_ci
--   nombre_comun varchar(100) utf8mb4_unicode_ci
--   genero varchar(50) utf8mb4_unicode_ci
--   familia_id int
--   familia varchar(50) utf8mb4_unicode_ci
--   orden_id int
--   orden varchar(50) utf8mb4_unicode_ci
--   provincia_id int
--   provincia varchar(50) utf8mb4_unicode_ci
--   observador_id int
--   observador varchar(100) utf8mb4_unicode_ci
--   fuente_id int
--   fuente varchar(100) utf8mb4_unicode_ci
--   latitud decimal(9,6)
--   longitud decimal(9,6)
--   fecha date
--   mes tinyint
--   anio smallint
--   licencia varchar(20) utf8mb4_unicode_ci
--   occurrence_url varchar(100) utf8mb4_unicode_ci
--   media_type varchar(20) utf8mb4_unicode_ci

-- Rutinas (12; cuerpos en rutinas_origen/)
--   FUNCTION fn_disponibilidad_multimedia(p_media_type varchar(20)) RETURNS varchar(30)
--   FUNCTION fn_temporada(p_mes tinyint) RETURNS varchar(20)
--   PROCEDURE sp_avistamientos_agrupados_por_anio()
--   PROCEDURE sp_avistamientos_por_anio(p_anio smallint)
--   PROCEDURE sp_especies_por_provincia(p_provincia varchar(50))
--   PROCEDURE sp_especie_mas_avistada()
--   PROCEDURE sp_familia_mas_especies()
--   PROCEDURE sp_provincias_por_especie(p_especie varchar(150))
--   PROCEDURE sp_provincia_mayor_diversidad()
--   PROCEDURE sp_registros_con_foto()
--   PROCEDURE sp_total_especies()
--   PROCEDURE sp_total_observadores()
