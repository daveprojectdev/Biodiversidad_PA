-- ============================================================
-- 30_funciones.sql — las 2 funciones y los 10 procedimientos.
-- Plantilla: {{esquema}}.
--
-- Fuente: funciones_almacenadas.sql (versión con colación de
-- fix_collation_funciones.sql) y procedimientos_almacenados.sql,
-- copiados en nube/db/inventario_mysql/rutinas_origen/.
--
-- Postgres no tiene procedimientos que devuelvan filas: cada
-- sp_* es una función que devuelve una tabla.
--   MySQL:    CALL sp_avistamientos_por_anio(2025);
--   Postgres: SELECT * FROM anfibios.sp_avistamientos_por_anio(2025);
--
-- Diferencias de tipos, a propósito:
--   * p_mes y p_anio son integer (en MySQL, tinyint y smallint):
--     en Postgres un literal como 2025 es integer y no entra solo
--     a un smallint, así que fn_temporada(1) fallaría.
--   * Los parámetros y resultados de texto son public.texto_ci,
--     que no distingue mayúsculas ni acentos, como en MySQL.
-- ============================================================

-- ── Funciones ──

CREATE FUNCTION {{esquema}}.fn_temporada(p_mes integer)
RETURNS public.texto_ci
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
    SELECT (CASE WHEN p_mes IN (12, 1, 2, 3, 4) THEN 'Seca' ELSE 'Lluviosa' END)::public.texto_ci
$$;

CREATE FUNCTION {{esquema}}.fn_disponibilidad_multimedia(p_media_type public.texto_ci)
RETURNS public.texto_ci
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
    SELECT (CASE
        WHEN p_media_type IS NULL THEN 'Sin multimedia'
        WHEN p_media_type LIKE '%StillImage%' AND p_media_type LIKE '%Sound%' THEN 'Foto y Audio'
        WHEN p_media_type LIKE '%StillImage%' THEN 'Solo Foto'
        WHEN p_media_type LIKE '%Sound%' THEN 'Solo Audio'
        ELSE 'Sin multimedia'
    END)::public.texto_ci
$$;

-- ── Procedimientos (los 10 de la rúbrica) ──

-- 1. SIMPLE — ¿Cuántas especies hay registradas?
CREATE FUNCTION {{esquema}}.sp_total_especies()
RETURNS TABLE (total_especies bigint)
LANGUAGE sql STABLE
AS $$
    SELECT COUNT(*) FROM {{esquema}}.especie
$$;

-- 2. SIMPLE — ¿Cuántos observadores hay?
CREATE FUNCTION {{esquema}}.sp_total_observadores()
RETURNS TABLE (total_observadores bigint)
LANGUAGE sql STABLE
AS $$
    SELECT COUNT(*) FROM {{esquema}}.observador
$$;

-- 3. FILTRO — ¿Qué especies se vieron en [provincia]?
CREATE FUNCTION {{esquema}}.sp_especies_por_provincia(p_provincia public.texto_ci)
RETURNS TABLE (nombre_cientifico public.texto_ci)
LANGUAGE sql STABLE
AS $$
    SELECT DISTINCT v.nombre_cientifico::public.texto_ci
    FROM {{esquema}}.vista_avistamiento_completo v
    WHERE v.provincia LIKE '%' || p_provincia || '%'
    ORDER BY 1
$$;

-- 4. FILTRO — ¿Cuántos avistamientos hubo en [año]?
CREATE FUNCTION {{esquema}}.sp_avistamientos_por_anio(p_anio integer)
RETURNS TABLE (total bigint)
LANGUAGE sql STABLE
AS $$
    SELECT COUNT(*) FROM {{esquema}}.avistamiento a WHERE a.anio = p_anio
$$;

-- 5. FILTRO — ¿Cuántos registros tienen foto disponible?
CREATE FUNCTION {{esquema}}.sp_registros_con_foto()
RETURNS TABLE (con_foto bigint)
LANGUAGE sql STABLE
AS $$
    SELECT COUNT(*) FROM {{esquema}}.avistamiento a WHERE a.media_type LIKE '%StillImage%'
$$;

-- 6. JOIN — ¿Cuál es la especie más avistada?
CREATE FUNCTION {{esquema}}.sp_especie_mas_avistada()
RETURNS TABLE (nombre_cientifico public.texto_ci, total bigint)
LANGUAGE sql STABLE
AS $$
    SELECT v.nombre_cientifico::public.texto_ci, COUNT(*) AS total
    FROM {{esquema}}.vista_avistamiento_completo v
    GROUP BY v.nombre_cientifico
    ORDER BY total DESC
    LIMIT 1
$$;

-- 7. JOIN — ¿Qué familia tiene más especies?
CREATE FUNCTION {{esquema}}.sp_familia_mas_especies()
RETURNS TABLE (nombre public.texto_ci, cantidad bigint)
LANGUAGE sql STABLE
AS $$
    SELECT f.nombre::public.texto_ci, COUNT(e.especie_id) AS cantidad
    FROM {{esquema}}.familia f
    JOIN {{esquema}}.especie e ON f.familia_id = e.familia_id
    GROUP BY f.nombre
    ORDER BY cantidad DESC
    LIMIT 1
$$;

-- 8. JOIN — ¿En qué provincias se ha visto [especie]?
CREATE FUNCTION {{esquema}}.sp_provincias_por_especie(p_especie public.texto_ci)
RETURNS TABLE (provincia public.texto_ci)
LANGUAGE sql STABLE
AS $$
    SELECT DISTINCT v.provincia::public.texto_ci
    FROM {{esquema}}.vista_avistamiento_completo v
    WHERE v.nombre_cientifico LIKE '%' || p_especie || '%'
    ORDER BY 1
$$;

-- 9. AGREGACIÓN — ¿Cuántos avistamientos hubo por año?
CREATE FUNCTION {{esquema}}.sp_avistamientos_agrupados_por_anio()
RETURNS TABLE (anio smallint, total bigint)
LANGUAGE sql STABLE
AS $$
    SELECT a.anio, COUNT(*) AS total
    FROM {{esquema}}.avistamiento a
    GROUP BY a.anio
    ORDER BY a.anio
$$;

-- 10. AGREGACIÓN — ¿Qué provincia tiene mayor diversidad de especies?
CREATE FUNCTION {{esquema}}.sp_provincia_mayor_diversidad()
RETURNS TABLE (provincia public.texto_ci, diversidad bigint)
LANGUAGE sql STABLE
AS $$
    SELECT v.provincia::public.texto_ci, COUNT(DISTINCT v.especie_id) AS diversidad
    FROM {{esquema}}.vista_avistamiento_completo v
    GROUP BY v.provincia
    ORDER BY diversidad DESC
    LIMIT 1
$$;
