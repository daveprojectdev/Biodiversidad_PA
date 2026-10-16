-- ============================================================
-- fix_collation_funciones.sql
-- Mismo problema que nombre_comun, ahora en las funciones:
-- se crearon sin especificar collation explícito en RETURNS,
-- así que devuelven texto con un collation distinto al de las
-- columnas de las tablas. Hay que recrearlas con el collation
-- explícito.
--
-- Ejecutar como root en AMBAS bases.
-- ============================================================

-- ── Amphibia ──
USE biodiversidad_panama;

DELIMITER //

DROP FUNCTION IF EXISTS fn_temporada //
CREATE FUNCTION fn_temporada(p_mes TINYINT)
RETURNS VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
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
RETURNS VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
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


-- ── Aves ──
USE biodiversidad_aves;

DELIMITER //

DROP FUNCTION IF EXISTS fn_temporada //
CREATE FUNCTION fn_temporada(p_mes TINYINT)
RETURNS VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
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
RETURNS VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
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


-- ── Re-probar la consulta que falló ──
USE biodiversidad_panama;
SELECT COUNT(*) AS total
FROM avistamiento a JOIN especie e ON a.especie_id = e.especie_id
WHERE (e.nombre_comun LIKE '%venenosa%' OR e.nombre_cientifico LIKE '%pumilio%')
  AND a.media_type LIKE '%StillImage%'
  AND fn_temporada(a.mes) = 'Lluviosa';
