-- ============================================================
-- funciones_almacenadas.sql
-- 2 funciones con valor real para el dominio del proyecto:
--   fn_temporada: clasifica un mes en temporada seca/lluviosa
--                 de Panamá — habilita preguntas que hoy no se
--                 pueden responder con el esquema tal cual está.
--   fn_disponibilidad_multimedia: traduce el texto crudo de
--                 media_type a una etiqueta legible.
--
-- Ejecutar como root en AMBAS bases de datos.
-- ============================================================

-- Nota: si MySQL da el error "This function has none of
-- DETERMINISTIC... binary logging is enabled", correr primero:
--   SET GLOBAL log_bin_trust_function_creators = 1;

-- ############################################################
-- COLECCIÓN: AMPHIBIA (biodiversidad_panama)
-- ############################################################
USE biodiversidad_panama;

DELIMITER //

DROP FUNCTION IF EXISTS fn_temporada //
CREATE FUNCTION fn_temporada(p_mes TINYINT)
RETURNS VARCHAR(20)
DETERMINISTIC
BEGIN
    DECLARE resultado VARCHAR(20);
    IF p_mes IN (12, 1, 2, 3, 4) THEN
        SET resultado = 'Seca';
    ELSE
        SET resultado = 'Lluviosa';
    END IF;
    RETURN resultado;
END //

DROP FUNCTION IF EXISTS fn_disponibilidad_multimedia //
CREATE FUNCTION fn_disponibilidad_multimedia(p_media_type VARCHAR(20))
RETURNS VARCHAR(30)
DETERMINISTIC
BEGIN
    DECLARE resultado VARCHAR(30);
    IF p_media_type IS NULL THEN
        SET resultado = 'Sin multimedia';
    ELSEIF p_media_type LIKE '%StillImage%' AND p_media_type LIKE '%Sound%' THEN
        SET resultado = 'Foto y Audio';
    ELSEIF p_media_type LIKE '%StillImage%' THEN
        SET resultado = 'Solo Foto';
    ELSEIF p_media_type LIKE '%Sound%' THEN
        SET resultado = 'Solo Audio';
    ELSE
        SET resultado = 'Sin multimedia';
    END IF;
    RETURN resultado;
END //

DELIMITER ;

GRANT EXECUTE ON biodiversidad_panama.* TO 'biodiv_app'@'localhost';


-- ############################################################
-- COLECCIÓN: AVES (biodiversidad_aves)
-- ############################################################
USE biodiversidad_aves;

DELIMITER //

DROP FUNCTION IF EXISTS fn_temporada //
CREATE FUNCTION fn_temporada(p_mes TINYINT)
RETURNS VARCHAR(20)
DETERMINISTIC
BEGIN
    DECLARE resultado VARCHAR(20);
    IF p_mes IN (12, 1, 2, 3, 4) THEN
        SET resultado = 'Seca';
    ELSE
        SET resultado = 'Lluviosa';
    END IF;
    RETURN resultado;
END //

DROP FUNCTION IF EXISTS fn_disponibilidad_multimedia //
CREATE FUNCTION fn_disponibilidad_multimedia(p_media_type VARCHAR(20))
RETURNS VARCHAR(30)
DETERMINISTIC
BEGIN
    DECLARE resultado VARCHAR(30);
    IF p_media_type IS NULL THEN
        SET resultado = 'Sin multimedia';
    ELSEIF p_media_type LIKE '%StillImage%' AND p_media_type LIKE '%Sound%' THEN
        SET resultado = 'Foto y Audio';
    ELSEIF p_media_type LIKE '%StillImage%' THEN
        SET resultado = 'Solo Foto';
    ELSEIF p_media_type LIKE '%Sound%' THEN
        SET resultado = 'Solo Audio';
    ELSE
        SET resultado = 'Sin multimedia';
    END IF;
    RETURN resultado;
END //

DELIMITER ;

GRANT EXECUTE ON biodiversidad_aves.* TO 'biodiv_app'@'localhost';
FLUSH PRIVILEGES;


-- ============================================================
-- EJEMPLOS DE USO
-- ============================================================
-- USE biodiversidad_panama;
--
-- -- Temporada de cada avistamiento
-- SELECT nombre_cientifico, fecha, fn_temporada(mes) AS temporada
-- FROM vista_avistamiento_completo
-- LIMIT 10;
--
-- -- Pregunta que antes no se podía responder:
-- -- ¿en qué temporada se ven más anfibios?
-- SELECT fn_temporada(mes) AS temporada, COUNT(*) AS total
-- FROM avistamiento
-- GROUP BY fn_temporada(mes)
-- ORDER BY total DESC;
--
-- -- Multimedia legible
-- SELECT nombre_cientifico, fn_disponibilidad_multimedia(media_type) AS multimedia
-- FROM vista_avistamiento_completo
-- WHERE occurrence_url IS NOT NULL
-- LIMIT 10;
