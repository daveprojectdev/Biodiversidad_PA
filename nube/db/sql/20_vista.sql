-- ============================================================
-- 20_vista.sql — vista_avistamiento_completo, la que une las
-- 7 tablas. Plantilla: {{esquema}}.
--
-- Es la versión que corre hoy en MySQL: la de
-- actualizar_vista_nombre_comun.sql (con nombre_comun), no la de
-- database/vista_avistamiento_completo.sql, que es anterior.
-- Las 24 columnas coinciden en nombre y orden con
-- information_schema.columns de MySQL.
-- ============================================================

CREATE VIEW {{esquema}}.vista_avistamiento_completo AS
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
    o.nombre        AS orden,
    p.provincia_id,
    p.nombre        AS provincia,
    ob.observador_id,
    ob.nombre       AS observador,
    fu.fuente_id,
    fu.nombre       AS fuente,
    a.latitud,
    a.longitud,
    a.fecha,
    a.mes,
    a.anio,
    a.licencia,
    a.occurrence_url,
    a.media_type
FROM {{esquema}}.avistamiento a
JOIN {{esquema}}.especie    e  ON a.especie_id    = e.especie_id
JOIN {{esquema}}.familia    f  ON e.familia_id    = f.familia_id
JOIN {{esquema}}.orden      o  ON f.orden_id      = o.orden_id
JOIN {{esquema}}.provincia  p  ON a.provincia_id  = p.provincia_id
JOIN {{esquema}}.observador ob ON a.observador_id = ob.observador_id
JOIN {{esquema}}.fuente     fu ON a.fuente_id     = fu.fuente_id;
