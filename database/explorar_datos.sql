-- ============================================================
-- explorar_datos.sql
-- Vista panorámica de qué hay en cada base — útil para generar
-- preguntas de demo con datos reales, no adivinar.
-- Corre bloque por bloque, cambia USE según la colección.
-- ============================================================

USE biodiversidad_panama;  -- cambiar a biodiversidad_aves para la otra colección

-- ── Conteos generales ──
SELECT 'orden' AS tabla, COUNT(*) AS registros FROM orden
UNION ALL SELECT 'familia', COUNT(*) FROM familia
UNION ALL SELECT 'especie', COUNT(*) FROM especie
UNION ALL SELECT 'provincia', COUNT(*) FROM provincia
UNION ALL SELECT 'observador', COUNT(*) FROM observador
UNION ALL SELECT 'fuente', COUNT(*) FROM fuente
UNION ALL SELECT 'avistamiento', COUNT(*) FROM avistamiento;

-- ── Órdenes disponibles ──
SELECT nombre FROM orden ORDER BY nombre;

-- ── Familias con más especies (candidatas para preguntas de JOIN) ──
SELECT f.nombre AS familia, COUNT(e.especie_id) AS especies
FROM familia f JOIN especie e ON f.familia_id = e.familia_id
GROUP BY f.nombre ORDER BY especies DESC;

-- ── Provincias disponibles ──
SELECT nombre FROM provincia ORDER BY nombre;

-- ── Rango de fechas cubierto ──
SELECT MIN(fecha) AS primera_fecha, MAX(fecha) AS ultima_fecha,
       MIN(anio) AS primer_anio, MAX(anio) AS ultimo_anio
FROM avistamiento;

-- ── 15 especies con más avistamientos (buenas candidatas para demo) ──
SELECT e.nombre_cientifico, COALESCE(e.nombre_comun, '(sin nombre común)') AS nombre_comun,
       COUNT(*) AS avistamientos
FROM avistamiento a JOIN especie e ON a.especie_id = e.especie_id
GROUP BY e.nombre_cientifico, e.nombre_comun
ORDER BY avistamientos DESC
LIMIT 15;

-- ── Especies con nombre_comun ya poblado (para preguntar por nombre común) ──
SELECT nombre_cientifico, nombre_comun FROM especie WHERE nombre_comun IS NOT NULL;

-- ── Tipos de multimedia disponibles y cuántos registros de cada uno ──
SELECT COALESCE(media_type, '(sin multimedia)') AS tipo, COUNT(*) AS total
FROM avistamiento
GROUP BY media_type
ORDER BY total DESC;

-- ── Observadores más activos (top 10) ──
SELECT o.nombre, COUNT(*) AS registros
FROM avistamiento a JOIN observador o ON a.observador_id = o.observador_id
GROUP BY o.nombre
ORDER BY registros DESC
LIMIT 10;
