-- ============================================================
-- consultas_referencia.sql
-- SQL de referencia (escrito manualmente, no por el LLM) para
-- las 10 consultas de la rúbrica de Vejarano.
-- Úsalo para comparar contra lo que genera el sistema por texto/voz.
--
-- Cubre las 4 categorías exigidas: simples, con filtros, con JOINs
-- y con agregaciones.
-- ============================================================

-- ############################################################
-- COLECCIÓN: AMPHIBIA (biodiversidad_panama)
-- ############################################################
USE biodiversidad_panama;

-- 1. SIMPLE — ¿Cuántas especies hay registradas?
SELECT COUNT(*) AS total_especies FROM especie;
-- Esperado: 135

-- 2. SIMPLE — ¿Cuántos observadores hay?
SELECT COUNT(*) AS total_observadores FROM observador;
-- Esperado: 2,060

-- 3. FILTRO — ¿Qué especies se vieron en Bocas del Toro?
SELECT DISTINCT nombre_cientifico
FROM vista_avistamiento_completo
WHERE provincia LIKE '%Bocas%'
ORDER BY nombre_cientifico;

-- 4. FILTRO — ¿Cuántos avistamientos hubo en 2025?
SELECT COUNT(*) AS total FROM avistamiento WHERE anio = 2025;

-- 5. FILTRO — ¿Cuántos registros tienen foto disponible?
SELECT COUNT(*) AS con_foto FROM avistamiento WHERE media_type LIKE '%StillImage%';
-- Esperado: 7,776

-- 6. JOIN — ¿Cuál es la especie más avistada?
SELECT nombre_cientifico, COUNT(*) AS total
FROM vista_avistamiento_completo
GROUP BY nombre_cientifico
ORDER BY total DESC
LIMIT 1;
-- Esperado: Rhinella horribilis, 1,364

-- 7. JOIN — ¿Qué familia tiene más especies?
SELECT f.nombre, COUNT(e.especie_id) AS cantidad
FROM familia f
JOIN especie e ON f.familia_id = e.familia_id
GROUP BY f.nombre
ORDER BY cantidad DESC
LIMIT 1;
-- Esperado: Hylidae, 28 (validado en Workbench 11 jul 2026)

-- 8. JOIN — ¿En qué provincias se ha visto Oophaga pumilio?
SELECT DISTINCT provincia
FROM vista_avistamiento_completo
WHERE nombre_cientifico = 'Oophaga pumilio'
ORDER BY provincia;

-- 9. AGREGACIÓN — ¿Cuántos avistamientos hubo por año?
SELECT anio, COUNT(*) AS total
FROM avistamiento
GROUP BY anio
ORDER BY anio;

-- 10. AGREGACIÓN — ¿Qué provincia tiene mayor diversidad de especies?
SELECT provincia, COUNT(DISTINCT especie_id) AS diversidad
FROM vista_avistamiento_completo
GROUP BY provincia
ORDER BY diversidad DESC
LIMIT 1;


-- ############################################################
-- COLECCIÓN: AVES (biodiversidad_aves)
-- Mismas 10 preguntas, misma estructura — cambia solo la base.
-- La pregunta #8 usa una especie de ejemplo; reemplázala por una
-- especie real de tus resultados al validar (ej. después de correr
-- la #6, usa esa especie más avistada como ejemplo en la #8).
-- ############################################################
USE biodiversidad_aves;

-- 1. SIMPLE — ¿Cuántas especies hay registradas?
SELECT COUNT(*) AS total_especies FROM especie;
-- Esperado: 784

-- 2. SIMPLE — ¿Cuántos observadores hay?
SELECT COUNT(*) AS total_observadores FROM observador;
-- Esperado: 2,498

-- 3. FILTRO — ¿Qué especies se vieron en Bocas del Toro?
SELECT DISTINCT nombre_cientifico
FROM vista_avistamiento_completo
WHERE provincia LIKE '%Bocas%'
ORDER BY nombre_cientifico;

-- 4. FILTRO — ¿Cuántos avistamientos hubo en 2025?
SELECT COUNT(*) AS total FROM avistamiento WHERE anio = 2025;

-- 5. FILTRO — ¿Cuántos registros tienen foto disponible?
SELECT COUNT(*) AS con_foto FROM avistamiento WHERE media_type LIKE '%StillImage%';

-- 6. JOIN — ¿Cuál es la especie más avistada?
SELECT nombre_cientifico, COUNT(*) AS total
FROM vista_avistamiento_completo
GROUP BY nombre_cientifico
ORDER BY total DESC
LIMIT 1;

-- 7. JOIN — ¿Qué familia tiene más especies?
SELECT f.nombre, COUNT(e.especie_id) AS cantidad
FROM familia f
JOIN especie e ON f.familia_id = e.familia_id
GROUP BY f.nombre
ORDER BY cantidad DESC
LIMIT 1;
-- Esperado: Tyrannidae, 80 (ya confirmado en pruebas anteriores)

-- 8. JOIN — ¿En qué provincias se ha visto [ESPECIE_EJEMPLO]?
--    Reemplaza el nombre_cientifico por una especie real de tus datos.
SELECT DISTINCT provincia
FROM vista_avistamiento_completo
WHERE nombre_cientifico = 'REEMPLAZAR_CON_ESPECIE_REAL'
ORDER BY provincia;

-- 9. AGREGACIÓN — ¿Cuántos avistamientos hubo por año?
SELECT anio, COUNT(*) AS total
FROM avistamiento
GROUP BY anio
ORDER BY anio;

-- 10. AGREGACIÓN — ¿Qué provincia tiene mayor diversidad de especies?
SELECT provincia, COUNT(DISTINCT especie_id) AS diversidad
FROM vista_avistamiento_completo
GROUP BY provincia
ORDER BY diversidad DESC
LIMIT 1;
