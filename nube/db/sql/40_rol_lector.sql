-- ============================================================
-- 40_rol_lector.sql — el rol con el que se conecta la app.
-- Plantilla: {{esquema}}. El rol biodiv_lector lo crea
-- migrar.py (con la contraseña de nube/.env) antes de este archivo.
--
-- Igual que biodiv_app en MySQL (GRANT SELECT, EXECUTE): puede
-- leer y llamar funciones, nada más. Se crea por SQL y no con
-- neonctl a propósito: los roles que crea neonctl o la consola de
-- Neon entran en neon_superuser y podrían escribir.
-- ============================================================

-- La base y el esquema public: solo conectarse y usar los tipos.
REVOKE ALL ON DATABASE biodiversidad FROM PUBLIC;
GRANT CONNECT ON DATABASE biodiversidad TO biodiv_lector;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- En Postgres cualquiera puede ejecutar una función nueva; aquí
-- solo el lector.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA {{esquema}} FROM PUBLIC;

GRANT USAGE ON SCHEMA {{esquema}} TO biodiv_lector;
GRANT SELECT ON ALL TABLES IN SCHEMA {{esquema}} TO biodiv_lector;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA {{esquema}} TO biodiv_lector;

-- Por si algo intentara escribir: toda transacción del lector es
-- de solo lectura, y ninguna consulta pasa de 10 s (lo mismo que
-- MAX_EXECUTION_TIME=10000 en app_flask.py).
ALTER ROLE biodiv_lector SET default_transaction_read_only = on;
ALTER ROLE biodiv_lector SET statement_timeout = '10s';
ALTER ROLE biodiv_lector SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE biodiv_lector SET search_path = {{esquema}}, public;
