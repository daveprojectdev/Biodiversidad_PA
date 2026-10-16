-- ============================================================
-- vista_avistamiento_completo.sql
-- Vista desnormalizada que une las 7 tablas del modelo.
-- Reduce errores de JOIN del LLM en preguntas que combinan
-- especie + provincia + observador + fecha, etc.
--
-- Ejecutar como root (biodiv_app no tiene permiso CREATE VIEW).
-- Correr este bloque en AMBAS bases de datos.
-- ============================================================

-- ── biodiversidad_panama (Amphibia) ──
USE biodiversidad_panama;

CREATE OR REPLACE VIEW vista_avistamiento_completo AS
SELECT
    a.avistamiento_id,
    a.gbif_id,
    e.especie_id,
    e.nombre_cientifico,
    e.genero,
    f.familia_id,
    f.nombre        AS familia,
    o.orden_id,
    o.nombre         AS orden,
    p.provincia_id,
    p.nombre         AS provincia,
    ob.observador_id,
    ob.nombre        AS observador,
    fu.fuente_id,
    fu.nombre        AS fuente,
    a.latitud,
    a.longitud,
    a.fecha,
    a.mes,
    a.anio,
    a.licencia,
    a.occurrence_url,
    a.media_type
FROM avistamiento a
JOIN especie    e  ON a.especie_id    = e.especie_id
JOIN familia    f  ON e.familia_id    = f.familia_id
JOIN orden      o  ON f.orden_id      = o.orden_id
JOIN provincia  p  ON a.provincia_id  = p.provincia_id
JOIN observador ob ON a.observador_id = ob.observador_id
JOIN fuente     fu ON a.fuente_id     = fu.fuente_id;

-- Verificación rápida
SELECT COUNT(*) AS total_vista FROM vista_avistamiento_completo;
-- Debe dar 8,430

-- ── biodiversidad_aves ──
USE biodiversidad_aves;

CREATE OR REPLACE VIEW vista_avistamiento_completo AS
SELECT
    a.avistamiento_id,
    a.gbif_id,
    e.especie_id,
    e.nombre_cientifico,
    e.genero,
    f.familia_id,
    f.nombre        AS familia,
    o.orden_id,
    o.nombre         AS orden,
    p.provincia_id,
    p.nombre         AS provincia,
    ob.observador_id,
    ob.nombre        AS observador,
    fu.fuente_id,
    fu.nombre        AS fuente,
    a.latitud,
    a.longitud,
    a.fecha,
    a.mes,
    a.anio,
    a.licencia,
    a.occurrence_url,
    a.media_type
FROM avistamiento a
JOIN especie    e  ON a.especie_id    = e.especie_id
JOIN familia    f  ON e.familia_id    = f.familia_id
JOIN orden      o  ON f.orden_id      = o.orden_id
JOIN provincia  p  ON a.provincia_id  = p.provincia_id
JOIN observador ob ON a.observador_id = ob.observador_id
JOIN fuente     fu ON a.fuente_id     = fu.fuente_id;

-- Verificación rápida
SELECT COUNT(*) AS total_vista FROM vista_avistamiento_completo;
-- Debe dar 51,761
