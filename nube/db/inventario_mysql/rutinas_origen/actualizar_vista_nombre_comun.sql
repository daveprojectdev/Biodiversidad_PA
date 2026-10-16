-- ============================================================
-- actualizar_vista_nombre_comun.sql
-- La vista se creó antes de agregar nombre_comun a especie.
-- Las vistas no heredan columnas nuevas automáticamente — hay
-- que recrearla explícitamente incluyéndola.
--
-- Ejecutar como root en AMBAS bases.
-- ============================================================

-- ── Amphibia ──
USE biodiversidad_panama;

CREATE OR REPLACE VIEW vista_avistamiento_completo AS
SELECT
    a.avistamiento_id,
    a.gbif_id,
    e.especie_id,
    e.nombre_cientifico,
    e.nombre_comun,
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

-- ── Aves ──
USE biodiversidad_aves;

CREATE OR REPLACE VIEW vista_avistamiento_completo AS
SELECT
    a.avistamiento_id,
    a.gbif_id,
    e.especie_id,
    e.nombre_cientifico,
    e.nombre_comun,
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

-- ── Re-probar la consulta que falló ──
USE biodiversidad_panama;
SELECT COUNT(*) AS total FROM vista_avistamiento_completo
WHERE fn_temporada(mes) = 'Lluviosa' AND media_type LIKE '%StillImage%'
  AND (nombre_comun LIKE '%venenosa%' OR nombre_cientifico LIKE '%venenosa%');
