-- ============================================================
-- procedimientos_almacenados.sql
-- Los 10 procedimientos de la rúbrica, con parámetros donde
-- aplica (provincia, año, especie). Basados en el SQL de
-- referencia ya validado manualmente el 11 de julio de 2026.
--
-- Ejecutar como root. Independientes del sistema Flask en vivo
-- (el LLM sigue generando SQL dinámico normalmente) — esto es
-- documentación/demostración de dominio de SQL procedural.
-- ============================================================

-- ############################################################
-- COLECCIÓN: AMPHIBIA (biodiversidad_panama)
-- ############################################################
USE biodiversidad_panama;

DELIMITER //

DROP PROCEDURE IF EXISTS sp_total_especies //
CREATE PROCEDURE sp_total_especies()
BEGIN
    -- 1. SIMPLE — ¿Cuántas especies hay registradas?
    SELECT COUNT(*) AS total_especies FROM especie;
END //

DROP PROCEDURE IF EXISTS sp_total_observadores //
CREATE PROCEDURE sp_total_observadores()
BEGIN
    -- 2. SIMPLE — ¿Cuántos observadores hay?
    SELECT COUNT(*) AS total_observadores FROM observador;
END //

DROP PROCEDURE IF EXISTS sp_especies_por_provincia //
CREATE PROCEDURE sp_especies_por_provincia(IN p_provincia VARCHAR(50))
BEGIN
    -- 3. FILTRO — ¿Qué especies se vieron en [provincia]?
    SELECT DISTINCT nombre_cientifico
    FROM vista_avistamiento_completo
    WHERE provincia LIKE CONCAT('%', p_provincia, '%')
    ORDER BY nombre_cientifico;
END //

DROP PROCEDURE IF EXISTS sp_avistamientos_por_anio //
CREATE PROCEDURE sp_avistamientos_por_anio(IN p_anio SMALLINT)
BEGIN
    -- 4. FILTRO — ¿Cuántos avistamientos hubo en [año]?
    SELECT COUNT(*) AS total FROM avistamiento WHERE anio = p_anio;
END //

DROP PROCEDURE IF EXISTS sp_registros_con_foto //
CREATE PROCEDURE sp_registros_con_foto()
BEGIN
    -- 5. FILTRO — ¿Cuántos registros tienen foto disponible?
    SELECT COUNT(*) AS con_foto FROM avistamiento WHERE media_type LIKE '%StillImage%';
END //

DROP PROCEDURE IF EXISTS sp_especie_mas_avistada //
CREATE PROCEDURE sp_especie_mas_avistada()
BEGIN
    -- 6. JOIN — ¿Cuál es la especie más avistada?
    SELECT nombre_cientifico, COUNT(*) AS total
    FROM vista_avistamiento_completo
    GROUP BY nombre_cientifico
    ORDER BY total DESC
    LIMIT 1;
END //

DROP PROCEDURE IF EXISTS sp_familia_mas_especies //
CREATE PROCEDURE sp_familia_mas_especies()
BEGIN
    -- 7. JOIN — ¿Qué familia tiene más especies?
    SELECT f.nombre, COUNT(e.especie_id) AS cantidad
    FROM familia f
    JOIN especie e ON f.familia_id = e.familia_id
    GROUP BY f.nombre
    ORDER BY cantidad DESC
    LIMIT 1;
END //

DROP PROCEDURE IF EXISTS sp_provincias_por_especie //
CREATE PROCEDURE sp_provincias_por_especie(IN p_especie VARCHAR(150))
BEGIN
    -- 8. JOIN — ¿En qué provincias se ha visto [especie]?
    SELECT DISTINCT provincia
    FROM vista_avistamiento_completo
    WHERE nombre_cientifico LIKE CONCAT('%', p_especie, '%')
    ORDER BY provincia;
END //

DROP PROCEDURE IF EXISTS sp_avistamientos_agrupados_por_anio //
CREATE PROCEDURE sp_avistamientos_agrupados_por_anio()
BEGIN
    -- 9. AGREGACIÓN — ¿Cuántos avistamientos hubo por año?
    SELECT anio, COUNT(*) AS total
    FROM avistamiento
    GROUP BY anio
    ORDER BY anio;
END //

DROP PROCEDURE IF EXISTS sp_provincia_mayor_diversidad //
CREATE PROCEDURE sp_provincia_mayor_diversidad()
BEGIN
    -- 10. AGREGACIÓN — ¿Qué provincia tiene mayor diversidad de especies?
    SELECT provincia, COUNT(DISTINCT especie_id) AS diversidad
    FROM vista_avistamiento_completo
    GROUP BY provincia
    ORDER BY diversidad DESC
    LIMIT 1;
END //

DELIMITER ;

-- Permite que biodiv_app también pueda ejecutarlos (opcional,
-- no lo usa el sistema Flask en vivo, pero es cómodo para pruebas)
GRANT EXECUTE ON biodiversidad_panama.* TO 'biodiv_app'@'localhost';


-- ############################################################
-- COLECCIÓN: AVES (biodiversidad_aves)
-- Mismos 10 procedimientos, misma lógica.
-- ############################################################
USE biodiversidad_aves;

DELIMITER //

DROP PROCEDURE IF EXISTS sp_total_especies //
CREATE PROCEDURE sp_total_especies()
BEGIN
    SELECT COUNT(*) AS total_especies FROM especie;
END //

DROP PROCEDURE IF EXISTS sp_total_observadores //
CREATE PROCEDURE sp_total_observadores()
BEGIN
    SELECT COUNT(*) AS total_observadores FROM observador;
END //

DROP PROCEDURE IF EXISTS sp_especies_por_provincia //
CREATE PROCEDURE sp_especies_por_provincia(IN p_provincia VARCHAR(50))
BEGIN
    SELECT DISTINCT nombre_cientifico
    FROM vista_avistamiento_completo
    WHERE provincia LIKE CONCAT('%', p_provincia, '%')
    ORDER BY nombre_cientifico;
END //

DROP PROCEDURE IF EXISTS sp_avistamientos_por_anio //
CREATE PROCEDURE sp_avistamientos_por_anio(IN p_anio SMALLINT)
BEGIN
    SELECT COUNT(*) AS total FROM avistamiento WHERE anio = p_anio;
END //

DROP PROCEDURE IF EXISTS sp_registros_con_foto //
CREATE PROCEDURE sp_registros_con_foto()
BEGIN
    SELECT COUNT(*) AS con_foto FROM avistamiento WHERE media_type LIKE '%StillImage%';
END //

DROP PROCEDURE IF EXISTS sp_especie_mas_avistada //
CREATE PROCEDURE sp_especie_mas_avistada()
BEGIN
    SELECT nombre_cientifico, COUNT(*) AS total
    FROM vista_avistamiento_completo
    GROUP BY nombre_cientifico
    ORDER BY total DESC
    LIMIT 1;
END //

DROP PROCEDURE IF EXISTS sp_familia_mas_especies //
CREATE PROCEDURE sp_familia_mas_especies()
BEGIN
    SELECT f.nombre, COUNT(e.especie_id) AS cantidad
    FROM familia f
    JOIN especie e ON f.familia_id = e.familia_id
    GROUP BY f.nombre
    ORDER BY cantidad DESC
    LIMIT 1;
END //

DROP PROCEDURE IF EXISTS sp_provincias_por_especie //
CREATE PROCEDURE sp_provincias_por_especie(IN p_especie VARCHAR(150))
BEGIN
    SELECT DISTINCT provincia
    FROM vista_avistamiento_completo
    WHERE nombre_cientifico LIKE CONCAT('%', p_especie, '%')
    ORDER BY provincia;
END //

DROP PROCEDURE IF EXISTS sp_avistamientos_agrupados_por_anio //
CREATE PROCEDURE sp_avistamientos_agrupados_por_anio()
BEGIN
    SELECT anio, COUNT(*) AS total
    FROM avistamiento
    GROUP BY anio
    ORDER BY anio;
END //

DROP PROCEDURE IF EXISTS sp_provincia_mayor_diversidad //
CREATE PROCEDURE sp_provincia_mayor_diversidad()
BEGIN
    SELECT provincia, COUNT(DISTINCT especie_id) AS diversidad
    FROM vista_avistamiento_completo
    GROUP BY provincia
    ORDER BY diversidad DESC
    LIMIT 1;
END //

DELIMITER ;

GRANT EXECUTE ON biodiversidad_aves.* TO 'biodiv_app'@'localhost';
FLUSH PRIVILEGES;


-- ============================================================
-- EJEMPLOS DE USO (correr manualmente para probar)
-- ============================================================
-- USE biodiversidad_panama;
-- CALL sp_total_especies();
-- CALL sp_especies_por_provincia('Bocas');
-- CALL sp_avistamientos_por_anio(2025);
-- CALL sp_provincias_por_especie('Oophaga pumilio');
--
-- USE biodiversidad_aves;
-- CALL sp_total_especies();
-- CALL sp_avistamientos_por_anio(2025);
-- CALL sp_provincia_mayor_diversidad();
