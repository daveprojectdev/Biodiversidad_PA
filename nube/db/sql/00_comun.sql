-- ============================================================
-- 00_comun.sql — lo que comparten todas las colecciones
-- (anfibios hoy, aves después). Se corre una sola vez por base.
--
-- En MySQL todo el texto usa utf8mb4_unicode_ci: no distingue
-- mayúsculas ni acentos ('colon' = 'Colón', LIKE '%panama%'
-- encuentra 'Panamá'). El equivalente en Postgres es una
-- colación ICU NO determinista de nivel 1 (solo letras base).
-- Desde Postgres 18, LIKE funciona con colaciones no
-- deterministas; ILIKE y las expresiones regulares (~) NO.
-- ============================================================

CREATE COLLATION IF NOT EXISTS public.es_ci_ai (
    provider = icu,
    locale = 'und-u-ks-level1',
    deterministic = false
);

-- Texto con esa colación. Lo usan los parámetros y los
-- resultados de las funciones: así fn_temporada(mes) = 'seca'
-- compara igual que en MySQL, y un parámetro no choca de
-- colación con la columna contra la que se compara.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE n.nspname = 'public' AND t.typname = 'texto_ci') THEN
        CREATE DOMAIN public.texto_ci AS text COLLATE public.es_ci_ai;
    END IF;
END $$;
